/**
 * Ops realtime: WebSocket primary → SSE fallback → HTTP poll.
 *
 * Opens browser WebSocket / EventSource so Dashboard KPIs + queue charts move
 * without waiting for the slow setInterval HTTP poll.
 *
 * Events:
 *   kpi.ops_snapshot  — { queue, kpis, pull_mode, cache_bypassed }  (preferred)
 *   kpi.queue_snapshot — queue dict only (legacy)
 *
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

/**
 * Normalize WS/SSE message into { queue, kpis }.
 * @returns {{queue: object|null, kpis: object|null}|null}
 */
export function extractOpsPayload(msg) {
    if (!msg || typeof msg !== "object") return null;

    // Preferred envelope
    if (msg.type === "kpi.ops_snapshot" && msg.payload && typeof msg.payload === "object") {
        const p = msg.payload;
        return {
            queue: p.queue && typeof p.queue === "object" ? p.queue : null,
            kpis: p.kpis && typeof p.kpis === "object" ? p.kpis : null,
        };
    }

    // Nested payload without type (SSE data is full envelope)
    if (msg.payload && typeof msg.payload === "object") {
        const p = msg.payload;
        if (p.queue || p.kpis) {
            return {
                queue: p.queue && typeof p.queue === "object" ? p.queue : null,
                kpis: p.kpis && typeof p.kpis === "object" ? p.kpis : null,
            };
        }
        if ("assigned" in p || "waiting_review" in p || "sla_risk" in p) {
            return {queue: p, kpis: null};
        }
    }

    // Legacy queue snapshot type or raw queue object
    if (msg.type === "kpi.queue_snapshot" && msg.payload && typeof msg.payload === "object") {
        return {queue: msg.payload, kpis: null};
    }
    if ("assigned" in msg || "waiting_review" in msg || "sla_risk" in msg) {
        return {queue: msg, kpis: null};
    }
    // Full KPI facet shape (poll of /kpis)
    if ("total_incidents" in msg || "severity_distribution" in msg) {
        return {queue: null, kpis: msg};
    }
    return null;
}

/**
 * @param {object} opts
 * @param {(queue: object) => void} [opts.onQueue]
 * @param {(kpis: object) => void} [opts.onKpis]
 * @param {(snap: {queue: object|null, kpis: object|null}) => void} [opts.onOps]
 * @param {number} [opts.intervalSec=10]
 * @param {boolean} [opts.enabled=true]
 */
export function useOpsRealtime({
    onQueue,
    onKpis,
    onOps,
    intervalSec = 10,
    enabled = true,
} = {}) {
    const [channel, setChannel] = useState(/** @type {RealtimeChannel} */ (
        DISABLED || !enabled ? "off" : "connecting"
    ));
    const [lastTs, setLastTs] = useState(null);
    /** Monotonic counter — Dashboard charts can key off this to re-render live series. */
    const [updateSeq, setUpdateSeq] = useState(0);
    const [error, setError] = useState(null);
    const onQueueRef = useRef(onQueue);
    const onKpisRef = useRef(onKpis);
    const onOpsRef = useRef(onOps);
    onQueueRef.current = onQueue;
    onKpisRef.current = onKpis;
    onOpsRef.current = onOps;
    const interval = Math.max(3, Math.min(60, Number(intervalSec) || 10));
    const wsFailRef = useRef(0);

    const deliver = useCallback((raw) => {
        const snap = extractOpsPayload(raw);
        if (!snap) return;
        if (snap.queue) onQueueRef.current?.(snap.queue);
        if (snap.kpis) onKpisRef.current?.(snap.kpis);
        onOpsRef.current?.(snap);
        if (snap.queue || snap.kpis) {
            setLastTs(new Date().toISOString());
            setUpdateSeq((n) => n + 1);
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
            // Force-refresh so wallboards are not stuck on 30s analytics cache
            const tick = async () => {
                if (cancelled) return;
                try {
                    const {api} = await import("../lib/api");
                    const [qRes, kRes] = await Promise.all([
                        api.get("/kpis/queue", {
                            params: {_t: Date.now(), force_refresh: true},
                        }),
                        api.get("/kpis", {
                            params: {_t: Date.now(), force_refresh: true},
                        }),
                    ]);
                    if (cancelled) return;
                    if (qRes?.data) deliver({type: "kpi.queue_snapshot", payload: qRes.data});
                    if (kRes?.data) deliver(kRes.data);
                } catch (e) {
                    if (!cancelled) setError(e?.message || "poll failed");
                }
            };
            tick();
            pollId = setInterval(tick, Math.max(10_000, interval * 1000));
        };

        const startSse = () => {
            if (cancelled) return;
            cleanupWs();
            cleanupPoll();
            setChannel("connecting");
            try {
                // Cookie session (A-F1): withCredentials sends actira_access_token
                es = new EventSource(sseUrl(interval), {withCredentials: true});
            } catch (e) {
                setError(String(e?.message || e));
                startPoll();
                return;
            }
            let opened = false;
            const onStreamEvent = (ev) => {
                try {
                    deliver(JSON.parse(ev.data));
                    opened = true;
                    setChannel("sse");
                } catch { /* ignore parse */ }
            };
            es.addEventListener("kpi.ops_snapshot", onStreamEvent);
            es.addEventListener("kpi.queue_snapshot", onStreamEvent);
            es.addEventListener("heartbeat", () => {
                if (opened) setChannel("sse");
            });
            es.onopen = () => {
                opened = true;
                setChannel("sse");
                setError(null);
            };
            es.onerror = () => {
                if (cancelled) return;
                if (es && es.readyState === EventSource.CLOSED) {
                    cleanupEs();
                    startPoll();
                } else {
                    setError("SSE reconnecting…");
                }
            };
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
                // Cookie auth is browser-native on the handshake; optional ?token= for lab/Bearer
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

    return {
        channel,
        lastTs,
        /** Increments on each successful ops payload — use as React chart key when live. */
        updateSeq,
        error,
        disabled: DISABLED || !enabled,
        /** True when browser opened a push channel (not HTTP poll). */
        isPush: channel === "ws" || channel === "sse",
    };
}

export default useOpsRealtime;
