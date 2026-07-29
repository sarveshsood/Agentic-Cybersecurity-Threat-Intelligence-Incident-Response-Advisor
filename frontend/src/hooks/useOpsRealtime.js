/**
 * Ops realtime: WebSocket primary → SSE fallback → HTTP poll.
 *
 * Listens for kpi.queue_snapshot events so Dashboard queue KPIs update without refresh.
 * Flag: FEATURE_REALTIME_OPS on backend (default on). Client can force-off via
 * REACT_APP_REALTIME_OPS=0.
 */
import {useCallback, useEffect, useRef, useState} from "react";
import {API, getStoredToken} from "../lib/api";

const DISABLED = ["0", "false", "no", "off"].includes(
    String(process.env.REACT_APP_REALTIME_OPS || "1").toLowerCase(),
);

/** @typedef {"connecting"|"ws"|"sse"|"poll"|"off"|"error"} RealtimeChannel */

function apiOrigin() {
    // API is like http://host:8001/api — strip trailing /api for WS/SSE base
    const base = (API || "/api").replace(/\/$/, "");
    if (base.endsWith("/api")) return base.slice(0, -4) || window.location.origin;
    try {
        const u = new URL(base, window.location.origin);
        return u.origin;
    } catch {
        return window.location.origin;
    }
}

function wsUrl(intervalSec) {
    const origin = apiOrigin();
    const wsOrigin = origin.replace(/^http/, "ws");
    const token = getStoredToken();
    const q = new URLSearchParams();
    if (token) q.set("token", token);
    q.set("interval_sec", String(intervalSec));
    const qs = q.toString();
    return `${wsOrigin}/api/ws/ops${qs ? `?${qs}` : ""}`;
}

function sseUrl(intervalSec) {
    const origin = apiOrigin();
    return `${origin}/api/sse/ops?interval_sec=${encodeURIComponent(String(intervalSec))}`;
}

function extractQueuePayload(msg) {
    if (!msg || typeof msg !== "object") return null;
    // Envelope: { type, payload } or raw queue snapshot
    if (msg.type === "kpi.queue_snapshot" && msg.payload && typeof msg.payload === "object") {
        return msg.payload;
    }
    if (msg.payload && typeof msg.payload === "object" && ("assigned" in msg.payload || "waiting_review" in msg.payload)) {
        return msg.payload;
    }
    if ("assigned" in msg || "waiting_review" in msg || "sla_risk" in msg) {
        return msg;
    }
    return null;
}

/**
 * @param {object} opts
 * @param {(queue: object) => void} [opts.onQueue]
 * @param {number} [opts.intervalSec=10]
 * @param {boolean} [opts.enabled=true]
 */
export function useOpsRealtime({onQueue, intervalSec = 10, enabled = true} = {}) {
    const [channel, setChannel] = useState(/** @type {RealtimeChannel} */ (
        DISABLED || !enabled ? "off" : "connecting"
    ));
    const [lastTs, setLastTs] = useState(null);
    const [error, setError] = useState(null);
    const onQueueRef = useRef(onQueue);
    onQueueRef.current = onQueue;
    const interval = Math.max(3, Math.min(60, Number(intervalSec) || 10));
    const wsFailRef = useRef(0);

    const deliver = useCallback((raw) => {
        const q = extractQueuePayload(raw);
        if (q) {
            onQueueRef.current?.(q);
            setLastTs(new Date().toISOString());
            setError(null);
        }
    }, []);

    useEffect(() => {
        if (DISABLED || !enabled) {
            setChannel("off");
            return undefined;
        }

        let cancelled = false;
        /** @type {WebSocket|null} */
        let ws = null;
        /** @type {EventSource|null} */
        let es = null;
        /** @type {ReturnType<typeof setInterval>|null} */
        let pollId = null;
        let reconnectTimer = null;

        const cleanupWs = () => {
            if (ws) {
                try {
                    ws.onopen = null;
                    ws.onmessage = null;
                    ws.onerror = null;
                    ws.onclose = null;
                    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                        ws.close();
                    }
                } catch { /* ignore */ }
                ws = null;
            }
        };
        const cleanupEs = () => {
            if (es) {
                try {
                    es.close();
                } catch { /* ignore */ }
                es = null;
            }
        };
        const cleanupPoll = () => {
            if (pollId) {
                clearInterval(pollId);
                pollId = null;
            }
        };

        const startPoll = () => {
            if (cancelled) return;
            cleanupWs();
            cleanupEs();
            setChannel("poll");
            // Poll path is handled by Dashboard's existing load(); we only mark channel.
            // Optional light poll of queue only:
            const tick = async () => {
                if (cancelled) return;
                try {
                    const {api} = await import("../lib/api");
                    const r = await api.get("/kpis/queue", {params: {_t: Date.now()}});
                    if (!cancelled && r?.data) deliver(r.data);
                } catch (e) {
                    if (!cancelled) setError(e?.message || "poll failed");
                }
            };
            tick();
            pollId = setInterval(tick, Math.max(15_000, interval * 1000));
        };

        const startSse = () => {
            if (cancelled) return;
            cleanupWs();
            cleanupPoll();
            setChannel("connecting");
            try {
                es = new EventSource(sseUrl(interval), {withCredentials: true});
            } catch (e) {
                setError(String(e?.message || e));
                startPoll();
                return;
            }
            let opened = false;
            es.addEventListener("kpi.queue_snapshot", (ev) => {
                try {
                    deliver(JSON.parse(ev.data));
                    opened = true;
                    setChannel("sse");
                } catch { /* ignore parse */ }
            });
            es.addEventListener("heartbeat", () => {
                if (opened) setChannel("sse");
            });
            es.onopen = () => {
                opened = true;
                setChannel("sse");
                setError(null);
            };
            es.onerror = () => {
                // EventSource auto-reconnects; after sustained failure fall to poll
                if (cancelled) return;
                if (es && es.readyState === EventSource.CLOSED) {
                    cleanupEs();
                    startPoll();
                } else {
                    setError("SSE reconnecting…");
                }
            };
            // If no open within 8s, fall back to poll
            reconnectTimer = setTimeout(() => {
                if (cancelled || opened) return;
                cleanupEs();
                startPoll();
            }, 8000);
        };

        const startWs = () => {
            if (cancelled) return;
            cleanupEs();
            cleanupPoll();
            setChannel("connecting");
            try {
                ws = new WebSocket(wsUrl(interval));
            } catch (e) {
                wsFailRef.current += 1;
                startSse();
                return;
            }
            let opened = false;
            ws.onopen = () => {
                opened = true;
                wsFailRef.current = 0;
                setChannel("ws");
                setError(null);
                try {
                    ws.send(JSON.stringify({op: "subscribe", interval_sec: interval}));
                    ws.send(JSON.stringify({op: "ping"}));
                } catch { /* ignore */ }
            };
            ws.onmessage = (ev) => {
                try {
                    const data = JSON.parse(ev.data);
                    if (data?.type === "pong") return;
                    deliver(data);
                    setChannel("ws");
                } catch { /* ignore */ }
            };
            ws.onerror = () => {
                setError("WebSocket error");
            };
            ws.onclose = () => {
                if (cancelled) return;
                wsFailRef.current += 1;
                // One retry then SSE
                if (wsFailRef.current < 2 && !opened) {
                    reconnectTimer = setTimeout(() => {
                        if (!cancelled) startWs();
                    }, 1200);
                } else {
                    startSse();
                }
            };
        };

        startWs();

        return () => {
            cancelled = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            cleanupWs();
            cleanupEs();
            cleanupPoll();
        };
    }, [enabled, interval, deliver]);

    return {channel, lastTs, error, disabled: DISABLED || !enabled};
}

export default useOpsRealtime;
