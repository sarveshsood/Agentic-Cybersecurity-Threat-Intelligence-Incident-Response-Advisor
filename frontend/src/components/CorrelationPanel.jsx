import {Desktop, Fingerprint, GitFork, Globe, Users} from "@phosphor-icons/react";
import {formatDateTime} from "../lib/uiPrefs";
import {HelpTip, PaneLabel, Tip} from "./HelpTip";

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
                        <HelpTip
                            title="Cross-log correlation"
                            body="Links entities (IP, user, host, domain, hash) that appear across multiple files in the same package. Builds the attack-chain timeline from the anchor entity."
                            how="Pipeline correlation stage over CES-normalized events."
                            testid="tip-correlation-panel"
                        />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        {stats.total_events || 0} events · {filesCount} source file{filesCount !== 1 ? "s" : ""}
                    </div>
                </div>
            </div>

            {/* Cross-file link chips */}
            {correlations.length > 0 ? (
                <div>
                    <div className="soc-label mb-2 inline-flex items-center gap-1.5">
                        Cross-file links ({correlations.length})
                        <HelpTip
                            title="Cross-file links"
                            body="Shared entity values spanning ≥2 source files. f = file count · e = event count."
                            testid="tip-correlation-links"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                        {correlations.slice(0, 10).map((c, i) => {
                            const Icon = KIND_ICON[c.kind] || Globe;
                            const files = (c.files || []).join(" · ") || "no file list";
                            const tip = `${c.kind || "entity"}: ${c.value} · ${c.file_count ?? "?"} files · ${c.event_count ?? "?"} events · ${files}`;
                            return (
                                <Tip key={`${c.kind}-${c.value}-${i}`} content={tip}>
                                    <div
                                        data-testid={`corr-${c.kind}-${i}`}
                                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${KIND_COLOR[c.kind] || KIND_COLOR.ip} text-[11px] cursor-help`}
                                        title={tip}
                                    >
                                        <Icon size={11}/>
                                        <span className="soc-mono">{c.value}</span>
                                        <span className="text-[9px] opacity-70">
                                            {c.file_count}f · {c.event_count}e
                                        </span>
                                    </div>
                                </Tip>
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
                    <PaneLabel
                        className="mb-2"
                        title="Per-file events"
                        body="Event counts contributed by each source file in this package."
                        testid="tip-correlation-files"
                    >
                        Per-file events
                    </PaneLabel>
                    <div className="grid grid-cols-2 gap-1.5">
                        {Object.entries(stats.files).map(([f, c]) => (
                            <Tip key={f} content={`${f}: ${c} events`}>
                                <div
                                    className="text-[11px] flex items-center justify-between px-2 py-1 rounded bg-background border border-border cursor-help"
                                    title={`${f}: ${c} events`}
                                >
                                    <span className="soc-mono truncate">{f.split("/").pop()}</span>
                                    <span className="text-primary font-mono">{c}</span>
                                </div>
                            </Tip>
                        ))}
                    </div>
                </div>
            )}

            {/* Attack chain */}
            {attack_chain.length > 0 && (
                <div>
                    <div className="soc-label mb-2 inline-flex items-center gap-1.5">
                        Attack chain (anchor entity)
                        <HelpTip
                            title="Attack chain"
                            body="Ordered events around the primary correlated entity — approximate kill-chain narrative from logs, not full EDR process trees."
                            testid="tip-correlation-chain"
                        />
                    </div>
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
                                <PaneLabel
                                    className="mb-1.5"
                                    title={`Top ${k}`}
                                    body={`Highest-frequency ${k} from correlation over this package’s events.`}
                                    testid={`tip-correlation-top-${k}`}
                                >
                                    Top {k}
                                </PaneLabel>
                                <div className="space-y-0.5">
                                    {entities[k].slice(0, 4).map((e) => {
                                        const tip = `${k.slice(0, -1) || k}: ${e.value} · seen in ${e.count ?? "?"} events`;
                                        return (
                                            <Tip key={e.value} content={tip}>
                                                <div
                                                    className="text-[11px] flex items-center justify-between cursor-help"
                                                    title={tip}
                                                    data-testid={`corr-entity-${k}-${e.value}`}
                                                >
                                                    <span className="soc-mono truncate text-foreground/90">{e.value}</span>
                                                    <span className="text-primary font-mono">{e.count}</span>
                                                </div>
                                            </Tip>
                                        );
                                    })}
                                </div>
                            </div>
                        )
                    ))}
                </div>
            )}
        </div>
    );
}
