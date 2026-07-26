/**
 * v1.7 Wave D — executive risk / maturity / cost snapshot.
 * Never masks empty or failed API as healthy demo data.
 */
import {Link} from "react-router-dom";
import {formatMetricValue} from "../design-system";
import {ChartLineUp, CurrencyDollar, ShieldWarning, Timer} from "@phosphor-icons/react";
import {HelpTip, Tip} from "./HelpTip";

export default function ExecutiveStrip({
    kpis = {},
    loading = false,
    loadError = null,
    showingDemoData = false,
}) {
    const critical = Number(kpis.critical_incidents) || 0;
    const pending = Number(kpis.pending_review) || 0;
    const total = Number(kpis.total_incidents) || 0;
    const mttr = kpis.mean_mttr_hours;
    const grounding = kpis.mean_grounding_score;
    const acceptance = kpis.acceptance_rate;

    const cells = [
        {
            id: "open-criticals",
            label: "Open criticals",
            value: critical,
            sub: "severity = critical",
            icon: ShieldWarning,
            to: "/incidents?severity=critical",
            tone: critical > 0 ? "text-error" : "text-success",
            tip: {
                title: "Open criticals",
                body: "Count of incidents with severity critical. Prioritize for investigation and HiTL review.",
                how: "From GET /kpis · critical_incidents (Mongo severity field).",
            },
        },
        {
            id: "hitl-backlog",
            label: "HiTL backlog",
            value: pending,
            sub: "awaiting review",
            icon: Timer,
            to: "/review",
            tone: pending > 10 ? "text-warning" : "text-foreground",
            tip: {
                title: "HiTL backlog",
                body: "Cases waiting in the human-in-the-loop review queue (status pending_review).",
                how: "From GET /kpis · pending_review.",
            },
        },
        {
            id: "mttr",
            label: "MTTR (proxy)",
            value: mttr != null && mttr !== "" ? `${Number(mttr).toFixed(1)}h` : "—",
            sub: kpis.mttr_sample_size ? `n=${kpis.mttr_sample_size}` : "need approved cases",
            icon: ChartLineUp,
            to: "/analytics",
            tone: "text-foreground",
            tip: {
                title: "MTTR (proxy)",
                body: "Mean time from incident creation to approve/reject when sample data exists. A proxy, not a certified SOC SLI.",
                how: "From GET /kpis · mean_mttr_hours over reviewed cases (mttr_sample_size).",
            },
        },
        {
            id: "ai-quality",
            label: "AI quality",
            value:
                grounding != null
                    ? `${Math.round(Number(grounding) * 100)}%`
                    : "—",
            sub:
                acceptance != null
                    ? `accept ${(Number(acceptance) * 100).toFixed(0)}% · ${total} cases`
                    : "grounding mean",
            icon: CurrencyDollar,
            to: "/benchmark",
            tone: "text-primary",
            tip: {
                title: "AI quality",
                body: "Mean playbook grounding (cited steps / total). Subline shows review acceptance rate when available.",
                how: "From GET /kpis · mean_grounding_score and acceptance_rate. Golden Eval is the offline quality gate.",
            },
        },
    ];

    return (
        <div
            className="soc-card p-4 mb-6"
            data-testid="executive-strip"
            role="region"
            aria-label="Executive risk snapshot"
        >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                    <div className="soc-label inline-flex items-center gap-1.5">
                        Executive snapshot
                        <HelpTip
                            title="Executive snapshot"
                            body="Leadership view of risk, review pressure, response-time proxy, and AI citation quality. Never fills empty tenants with demo numbers unless DEMO fallback is explicitly enabled."
                            how="KPIs from GET /kpis. Demo banner only when REACT_APP_DASHBOARD_DEMO_FALLBACK=true."
                            testid="tip-executive-strip"
                        />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mt-0.5">
                        Risk · review · MTTR · AI quality
                    </h3>
                </div>
                {showingDemoData && (
                    <Tip content="Showcase DEMO KPIs are enabled — not live Mongo data. Unset REACT_APP_DASHBOARD_DEMO_FALLBACK for production honesty.">
                        <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-[var(--warning-border)] bg-warning-soft text-warning cursor-help"
                            data-testid="exec-demo-flag"
                        >
                            Demo KPIs — not production
                        </span>
                    </Tip>
                )}
                {loadError && (
                    <Tip content={String(loadError)}>
                        <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-[var(--error-border)] text-error cursor-help"
                            data-testid="exec-error-flag"
                        >
                            Live metrics unavailable
                        </span>
                    </Tip>
                )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {cells.map((c) => {
                    const Icon = c.icon;
                    const inner = (
                        <>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold inline-flex items-center gap-1">
                                    {c.label}
                                    <span
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                        onKeyDown={(e) => e.stopPropagation()}
                                        role="presentation"
                                    >
                                        <HelpTip
                                            title={c.tip.title}
                                            body={c.tip.body}
                                            how={c.tip.how}
                                            testid={`tip-exec-${c.id}`}
                                        />
                                    </span>
                                </span>
                                <Icon size={14} className="text-muted-foreground shrink-0" aria-hidden/>
                            </div>
                            <div className={`text-xl font-bold font-mono tabular-nums ${c.tone}`}>
                                {loading ? "…" : typeof c.value === "number" ? formatMetricValue(c.value) : c.value}
                            </div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{c.sub}</div>
                        </>
                    );
                    return c.to ? (
                        <Link
                            key={c.id}
                            to={c.to}
                            className="rounded-lg border theme-border p-3 hover:border-primary/40 transition-colors block"
                            data-testid={`exec-kpi-${c.id}`}
                        >
                            {inner}
                        </Link>
                    ) : (
                        <div
                            key={c.id}
                            className="rounded-lg border theme-border p-3"
                            data-testid={`exec-kpi-${c.id}`}
                        >
                            {inner}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
