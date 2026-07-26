import {Desktop, Fingerprint, GitFork, Globe, Users} from "@phosphor-icons/react";
import {formatDateTime} from "../lib/uiPrefs";

const KIND_ICON = {
    ip: Globe,
    user: Users,
    host: Desktop,
    domain: Globe,
    hash: Fingerprint,
};

const KIND_COLOR = {
    ip: "text-primary border-primary/40 bg-primary/10",
    user: "text-warning border-amber-500/40 bg-amber-950/30",
    host: "text-success border-[var(--success-border)] bg-success-soft",
    domain: "text-[var(--info)] border-[var(--info-border)] bg-[var(--info-bg)]",
    hash: "text-error border-[var(--error-border)] bg-error-soft",
};

export default function CorrelationPanel({correlation}) {
    if (!correlation) return null;
    const {correlations = [], attack_chain = [], stats = {}, entities = {}} = correlation;

    const filesCount = Object.keys(stats.files || {}).length;

    return (
        <div data-testid="correlation-panel" className="soc-card p-4 space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <div className="soc-label flex items-center gap-1.5">
                        <GitFork size={12}/> Cross-Log Correlation
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        {stats.total_events || 0} events · {filesCount} source file{filesCount !== 1 ? "s" : ""}
                    </div>
                </div>
            </div>

            {/* Cross-file link chips */}
            {correlations.length > 0 ? (
                <div>
                    <div className="soc-label mb-2">Cross-file links ({correlations.length})</div>
                    <div className="flex flex-wrap gap-1.5">
                        {correlations.slice(0, 10).map((c, i) => {
                            const Icon = KIND_ICON[c.kind] || Globe;
                            return (
                                <div
                                    key={`${c.kind}-${c.value}-${i}`}
                                    data-testid={`corr-${c.kind}-${i}`}
                                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${KIND_COLOR[c.kind] || KIND_COLOR.ip} text-[11px]`}
                                    title={c.files.join(" · ")}
                                >
                                    <Icon size={11}/>
                                    <span className="soc-mono">{c.value}</span>
                                    <span className="text-[9px] opacity-70">
                    {c.file_count}f · {c.event_count}e
                  </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="text-xs text-muted-foreground">No cross-file correlations found.</div>
            )}

            {/* Per-file breakdown */}
            {stats.files && (
                <div>
                    <div className="soc-label mb-2">Per-file events</div>
                    <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(stats.files).map(([f, c]) => (
                            <div key={f}
                                 className="text-[11px] flex items-center justify-between px-2 py-1 rounded bg-background border border-border">
                                <span className="soc-mono truncate">{f.split("/").pop()}</span>
                                <span className="text-primary font-mono">{c}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Attack chain */}
            {attack_chain.length > 0 && (
                <div>
                    <div className="soc-label mb-2">Attack chain (anchor entity)</div>
                    <ol className="space-y-1.5 border-l border-primary/30 pl-3">
                        {attack_chain.slice(0, 8).map((step, i) => (
                            <li key={i} className="text-[11px]" data-testid={`chain-step-${i}`}>
                                <div className="flex items-center gap-2 flex-wrap">
                    <span className="soc-mono text-muted-foreground" title={formatDateTime(step.timestamp)}>
                      {step.timestamp ? formatDateTime(step.timestamp, {showStandard: false}) : "—"}
                    </span>
                                    <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground">
                    {step.source_file?.split("/").pop()}
                  </span>
                                    {step.severity && step.severity !== "info" && (
                                        <span className={`text-[9px] uppercase tracking-[0.14em] px-1 rounded ${
                                            step.severity === "critical" ? "bg-error-soft text-error" :
                                                step.severity === "high" ? "bg-amber-500/20 text-warning" :
                                                    "bg-muted text-muted-foreground"
                                        }`}>
                      {step.severity}
                    </span>
                                    )}
                                </div>
                                <div className="text-foreground/90 mt-0.5 leading-tight">
                                    <span className="text-primary font-mono">{step.event_type || "event"}</span>
                                    {step.actor && <> · actor <span
                                        className="text-warning font-mono">{step.actor}</span></>}
                                    {step.target && <> → <span
                                        className="text-success font-mono">{step.target}</span></>}
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            )}

            {/* Top entities */}
            {entities && (
                <div className="grid grid-cols-2 gap-3">
                    {["ips", "users", "hosts"].map((k) => (
                        entities[k]?.length > 0 && (
                            <div key={k}>
                                <div className="soc-label mb-1.5">Top {k}</div>
                                <div className="space-y-0.5">
                                    {entities[k].slice(0, 4).map((e) => (
                                        <div key={e.value} className="text-[11px] flex items-center justify-between">
                                            <span className="soc-mono truncate text-foreground/90">{e.value}</span>
                                            <span className="text-primary font-mono">{e.count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            )}
        </div>
    );
}
