import {useCallback, useEffect, useRef, useState} from "react";
import {api, API, getStoredToken} from "../lib/api";
import {toast} from "sonner";
import {Lightbulb, PaperPlaneRight, Question, Robot, Warning} from "@phosphor-icons/react";
import {Popover, PopoverContent, PopoverTrigger} from "./ui/popover";

function ConfidenceBar({value}) {
    const pct = Math.round((value || 0) * 100);
    const color = pct >= 70 ? "bg-[var(--success)]" : pct >= 40 ? "bg-[var(--warning)]" : "bg-[var(--error)]";
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                <div className={`h-full ${color} transition-all`} style={{width: `${pct}%`}}/>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">{pct}%</span>
        </div>
    );
}

function CitationChip({id}) {
    const [doc, setDoc] = useState(null);
    const load = () => {
        if (!doc) api.get(`/kb/${id}`).then(r => setDoc(r.data)).catch(() => {
        });
    };
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button onClick={load} className="citation-chip">{id}</button>
            </PopoverTrigger>
            <PopoverContent className="w-96 bg-background border-border text-foreground">
                {doc ? (
                    <div>
                        <div className="soc-label mb-1">{doc.source}</div>
                        <div className="font-semibold text-sm mb-2">{doc.title}</div>
                        <div className="text-[12px] text-muted-foreground leading-relaxed">{doc.text}</div>
                    </div>
                ) : <div className="text-xs text-muted-foreground">Loading…</div>}
            </PopoverContent>
        </Popover>
    );
}

/** Parse SSE body chunks into event objects { event, data } */
function parseSseChunk(buffer) {
    const events = [];
    const parts = buffer.split("\n\n");
    const rest = parts.pop() ?? "";
    for (const block of parts) {
        if (!block.trim()) continue;
        let event = "message";
        const dataLines = [];
        for (const line of block.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
        }
        if (!dataLines.length) continue;
        try {
            events.push({event, data: JSON.parse(dataLines.join("\n"))});
        } catch {
            events.push({event, data: {type: "raw", text: dataLines.join("\n")}});
        }
    }
    return {events, rest};
}

async function streamInvestigate(incidentId, question, onEvent) {
    // A-F1 cookie-only: credentials:include sends httpOnly session cookie.
    // Optional Bearer only if REACT_APP_ALLOW_BEARER_STORAGE is enabled (legacy).
    const headers = {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
    };
    try {
        const token = getStoredToken();
        if (token) headers.Authorization = `Bearer ${token}`;
    } catch { /* private mode / SSR */
    }

    const res = await fetch(`${API}/incidents/${incidentId}/investigate/stream`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({question}),
    });
    if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
            const j = await res.json();
            detail = j.detail || detail;
        } catch { /* ignore */
        }
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    if (!res.body) throw new Error("No response body for SSE stream");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        buf += decoder.decode(value, {stream: true});
        const {events, rest} = parseSseChunk(buf);
        buf = rest;
        for (const ev of events) onEvent(ev);
    }
    if (buf.trim()) {
        const {events} = parseSseChunk(buf + "\n\n");
        for (const ev of events) onEvent(ev);
    }
}

function AnswerBody({answer, incidentId}) {
    if (!answer) return null;
    const isFallback =
        answer.fallback === true ||
        answer.provider === "fallback" ||
        (answer.model === "template" && answer.provider === "fallback");
    return (
        <div className="ml-5 pl-3 border-l-2 border-primary/40 space-y-2.5">
            {isFallback && (
                <div
                    className="rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-100/90 leading-relaxed"
                    data-testid="invest-fallback-banner"
                >
                    <span className="font-medium text-amber-200">Limited analysis</span>
                    {" — "}
                    {answer.fallback_reason ||
                        "Full LLM analysis was not available. Check Settings for a valid API key on the active provider, then ask again."}
                </div>
            )}
            <div className="text-[13px] text-foreground leading-relaxed">
                {answer.answer}
            </div>

            <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                    <div className="soc-label mb-1">Confidence</div>
                    <ConfidenceBar value={answer.confidence}/>
                </div>
                <div>
                    <div className="soc-label mb-1">Provider</div>
                    <div className={`soc-mono ${isFallback ? "text-warning" : "text-muted-foreground"}`}>
                        {answer.provider}/{answer.model}
                    </div>
                </div>
            </div>

            {answer.evidence?.length > 0 && (
                <div>
                    <div className="soc-label mb-1 flex items-center gap-1"><Lightbulb size={10}/> Evidence</div>
                    <ul className="space-y-0.5">
                        {answer.evidence.map((e, ei) => (
                            <li key={ei} className="text-[11px] text-muted-foreground leading-tight">• {e}</li>
                        ))}
                    </ul>
                </div>
            )}

            {answer.reasoning && (
                <div>
                    <div className="soc-label mb-1">Reasoning</div>
                    <div className="text-[11px] text-muted-foreground leading-relaxed">{answer.reasoning}</div>
                </div>
            )}

            {(answer.mitre_refs?.length > 0 || answer.kb_refs?.length > 0) && (
                <div className="flex flex-wrap gap-1">
                    {answer.mitre_refs?.map((m) => (
                        <span key={m} className="citation-chip">{m}</span>
                    ))}
                    {answer.kb_refs?.map((k) => (
                        <CitationChip key={k} id={k}/>
                    ))}
                </div>
            )}

            {answer.alternative_hypotheses?.length > 0 && (
                <div>
                    <div className="soc-label mb-1 text-warning">Alternative hypotheses</div>
                    <ul className="space-y-0.5">
                        {answer.alternative_hypotheses.map((a, ai) => (
                            <li key={ai} className="text-[11px] text-amber-200 leading-tight">◦ {a}</li>
                        ))}
                    </ul>
                </div>
            )}

            {answer.unknowns?.length > 0 && (
                <div>
                    <div className="soc-label mb-1 text-error flex items-center gap-1"><Warning size={10}/> Unknowns
                    </div>
                    <ul className="space-y-0.5">
                        {answer.unknowns.map((u, ui) => (
                            <li key={ui} className="text-[11px] text-error leading-tight">? {u}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default function AIInvestigator({incidentId, severity}) {
    const [history, setHistory] = useState([]);
    const [starters, setStarters] = useState([]);
    const [question, setQuestion] = useState("");
    const [busy, setBusy] = useState(false);
    const [expanded, setExpanded] = useState(true);
    const [live, setLive] = useState(null); // { question, tokens, status, meta, answer }
    const bottomRef = useRef(null);

    const refresh = useCallback(async () => {
        const r = await api.get(`/incidents/${incidentId}/investigations`);
        setHistory(r.data.reverse());
    }, [incidentId]);

    useEffect(() => {
        refresh();
        api.get("/investigate/starter-questions").then((r) => {
            setStarters(r.data.map((q) => q.replace("{severity}", severity || "high")));
        });
    }, [incidentId, refresh, severity]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({behavior: "smooth", block: "nearest"});
    }, [history, live?.tokens, live?.answer]);

    const ask = useCallback(async (q) => {
        if (!q.trim() || busy) return;
        setBusy(true);
        setQuestion("");
        setLive({
            question: q,
            tokens: "",
            status: "Starting…",
            meta: null,
            answer: null,
        });
        try {
            await streamInvestigate(incidentId, q, ({event, data}) => {
                const type = data?.type || event;
                if (type === "token") {
                    setLive((prev) => prev && ({
                        ...prev,
                        tokens: (prev.tokens || "") + (data.text || ""),
                        status: "Streaming…",
                    }));
                } else if (type === "meta") {
                    setLive((prev) => prev && ({
                        ...prev,
                        meta: {provider: data.provider, model: data.model},
                        status: `${data.provider}/${data.model}`,
                    }));
                } else if (type === "status") {
                    setLive((prev) => prev && ({
                        ...prev,
                        status: data.message || data.phase || "Working…",
                    }));
                } else if (type === "done") {
                    setLive((prev) => prev && ({
                        ...prev,
                        answer: data.answer,
                        status: "Done",
                        tokens: "",
                    }));
                } else if (type === "error") {
                    toast.error(data.message || "Investigation stream error");
                    setLive((prev) => prev && ({
                        ...prev,
                        status: data.message || "Error",
                    }));
                }
            });
            await refresh();
            // clear provisional bubble after history has the turn
            setLive(null);
        } catch (e) {
            // Fallback: non-streaming POST
            try {
                toast.message("Stream unavailable — using standard request");
                await api.post(`/incidents/${incidentId}/investigate`, {question: q});
                await refresh();
                setLive(null);
            } catch (e2) {
                toast.error(e2?.response?.data?.detail || e.message || "Investigation failed");
                setLive(null);
            }
        } finally {
            setBusy(false);
        }
    }, [incidentId, busy, refresh]);

    return (
        <div data-testid="ai-investigator" className="soc-card p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Robot size={16} weight="regular" className="text-primary" aria-hidden/>
                    <div className="soc-label">Analyst assist</div>
                    <span
                        className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted border border-border">
            recommendation
          </span>
                    <span
                        className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground px-1.5 py-0.5 rounded-md bg-muted border border-border"
                        title="Token streaming via Server-Sent Events"
                    >
            live
          </span>
                </div>
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                >
                    {expanded ? "collapse" : "expand"}
                </button>
            </div>

            {expanded && (
                <div className="p-4 space-y-4">
                    <div className="space-y-4 max-h-[500px] overflow-y-auto">
                        {history.length === 0 && !live && (
                            <div className="text-center py-6 text-xs text-muted-foreground">
                                <Lightbulb size={24} className="mx-auto mb-2 text-muted-foreground opacity-70"
                                           aria-hidden/>
                                Ask a structured question to investigate this incident.
                            </div>
                        )}
                        {history.map((h, i) => (
                            <div key={h.id || i} className="space-y-2" data-testid={`invest-turn-${i}`}>
                                <div className="flex items-start gap-2">
                                    <Question size={13} className="text-primary mt-0.5 shrink-0"/>
                                    <div className="text-[12px] text-foreground font-medium">{h.question}</div>
                                </div>
                                <AnswerBody answer={h.answer} incidentId={incidentId}/>
                            </div>
                        ))}

                        {/* Live streaming turn */}
                        {live && (
                            <div className="space-y-2" data-testid="invest-live">
                                <div className="flex items-start gap-2">
                                    <Question size={13} className="text-primary mt-0.5 shrink-0"/>
                                    <div className="text-[12px] text-foreground font-medium">{live.question}</div>
                                </div>
                                {live.answer ? (
                                    <AnswerBody answer={live.answer} incidentId={incidentId}/>
                                ) : (
                                    <div className="ml-5 pl-3 border-l-2 border-primary/40 space-y-2">
                                        <div
                                            className="text-[10px] uppercase tracking-wide text-primary/90 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-primary "/>
                                            {live.status}
                                            {live.meta && (
                                                <span
                                                    className="font-mono text-muted-foreground normal-case tracking-normal">
                          {live.meta.provider}/{live.meta.model}
                        </span>
                                            )}
                                        </div>
                                        <pre
                                            className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                      {live.tokens || "…"}
                                            <span
                                                className="inline-block w-1.5 h-3 ml-0.5 bg-primary/80 align-middle animate-pulse"/>
                    </pre>
                                    </div>
                                )}
                            </div>
                        )}
                        <div ref={bottomRef}/>
                    </div>

                    {history.length === 0 && !live && starters.length > 0 && (
                        <div>
                            <div className="soc-label mb-2">Suggested questions</div>
                            <div className="flex flex-wrap gap-1.5">
                                {starters.map((q, i) => (
                                    <button
                                        key={i}
                                        data-testid={`starter-${i}`}
                                        onClick={() => ask(q)}
                                        disabled={busy}
                                        className="text-[11px] px-2.5 py-1 rounded-md bg-muted border border-border text-foreground hover:border-primary/40 hover:text-primary transition-colors disabled:opacity-50"
                                    >
                                        {q}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex gap-2 pt-2 border-t border-border">
                        <input
                            data-testid="invest-input"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !busy && ask(question)}
                            disabled={busy}
                            placeholder={busy ? "Streaming investigation…" : "Ask about this incident…"}
                            className="soc-input flex-1 disabled:opacity-50"
                        />
                        <button
                            data-testid="invest-submit"
                            onClick={() => ask(question)}
                            disabled={busy || !question.trim()}
                            className="soc-btn-primary px-3 py-2 disabled:opacity-50"
                            aria-label="Submit question"
                        >
                            <PaperPlaneRight size={16} weight="fill"/>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
