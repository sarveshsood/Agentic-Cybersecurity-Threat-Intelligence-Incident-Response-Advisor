import {useEffect, useState} from "react";
import {api} from "../../lib/api";
import {PaneLabel, Tip} from "../HelpTip";

const SEV = {
    critical: "text-error border-[var(--error-border)] bg-error-soft",
    high: "text-warning border-[var(--warning-border)] bg-warning-soft",
    medium: "text-primary border-primary/30 bg-primary/10",
    low: "text-muted-foreground border-border bg-muted",
};

/**
 * Behavioral signals for one incident (Wave B).
 */
export default function BehaviorPanel({incidentId}) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        if (!incidentId) return;
        setErr(null);
        api
            .get(`/incidents/${incidentId}/behavior`)
            .then((r) => setData(r.data))
            .catch((e) => setErr(e?.response?.data?.detail || "Failed to load behavior"));
    }, [incidentId]);

    if (err) {
        return (
            <div className="soc-card p-4 text-sm text-error" data-testid="behavior-panel-error">
                {err}
            </div>
        );
    }
    if (!data) {
        return (
            <div className="soc-card p-4 text-xs text-muted-foreground" data-testid="behavior-panel-loading">
                Analyzing behavior…
            </div>
        );
    }

    return (
        <div className="soc-card p-4 space-y-3" data-testid="behavior-panel">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <PaneLabel
                        title="Behavioral analytics"
                        body="Deterministic MVP signals from this case’s events (e.g. bursty auth, lateral movement heuristics). Not a full UEBA product — useful triage hints only."
                        how="GET /incidents/{id}/behavior · rule/heuristic scores over CES events."
                        testid="tip-behavior-panel"
                    >
                        Behavioral analytics
                    </PaneLabel>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{data.summary}</p>
                </div>
                <Tip content={`Behavior risk: ${data.risk || "unknown"} · score ${data.risk_score ?? "—"}`}>
                    <span
                        className={`text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded border ${
                            SEV[data.risk] || SEV.low
                        }`}
                        data-testid="behavior-risk"
                    >
                        {data.risk} · {data.risk_score}
                    </span>
                </Tip>
            </div>
            {(!data.signals || data.signals.length === 0) ? (
                <p className="text-xs text-muted-foreground">No anomaly signals from correlated timeline.</p>
            ) : (
                <ul className="space-y-2">
                    {data.signals.map((s) => (
                        <li
                            key={s.id}
                            className={`rounded-lg border px-3 py-2 ${SEV[s.severity] || SEV.low}`}
                            data-testid={`behavior-signal-${s.id}`}
                            title={`${s.severity || "info"} · ${s.title || s.id}`}
                        >
                            <div className="text-xs font-semibold text-foreground">
                                <Tip content={`${s.severity || "info"} severity · signal ${s.id || s.title}`}>
                                    <span className="cursor-help">{s.title}</span>
                                </Tip>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{s.detail}</div>
                            {s.evidence?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {s.evidence.slice(0, 6).map((e) => (
                                        <span
                                            key={e}
                                            className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-border/80 bg-background/50"
                                        >
                                            {e}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
