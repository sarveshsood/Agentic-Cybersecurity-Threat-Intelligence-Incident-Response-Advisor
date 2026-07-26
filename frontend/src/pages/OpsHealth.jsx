import {useCallback, useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {api, apiErrorMessage} from "../lib/api";
import {
    ArrowClockwise,
    CheckCircle,
    Cpu,
    Database,
    Heartbeat,
    Info,
    Lightning,
    Timer,
    Warning,
} from "@phosphor-icons/react";
import {KpiCard, PageHeader, Panel} from "../design-system";
import {HelpTip} from "../components/HelpTip";
import {ListState} from "../components/ListState";

function Badge({ok, children}) {
    return (
        <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded border ${
                ok
                    ? "bg-success-soft text-success border-[var(--success-border)]"
                    : "bg-warning-soft text-warning border-[var(--warning-border)]"
            }`}
        >
            {children}
        </span>
    );
}

function Row({label, children}) {
    return (
        <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
            <span className="text-xs text-muted-foreground shrink-0">{label}</span>
            <span className="text-xs font-medium text-right break-all">{children}</span>
        </div>
    );
}

export default function OpsHealth() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        setError(null);
        api
            .get("/ops/status")
            .then((r) => setData(r.data))
            .catch((e) => {
                setData(null);
                setError(apiErrorMessage(e) || "Failed to load ops status");
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const ready = Boolean(data?.ready);
    const workerOn = Boolean(data?.job_worker_enabled);
    const llm = data?.llm_usage;
    const queue = data?.queue || {};
    const timings = data?.recent_job_timings || [];
    const hints = data?.ha_hints || [];
    const docs = data?.docs || {};

    return (
        <div data-testid="ops-health-page" className="space-y-6">
            <PageHeader
                testid="ops-health-header"
                title="Ops & Health"
                subtitle="Multi-replica flags, job queue, pipeline timings, and LLM budget (admin)"
                tip={
                    <HelpTip
                        title="Ops & Health"
                        body="Admin view of platform readiness: Mongo connectivity, job queue depth, pipeline timings, and LLM monthly budget usage."
                        how="GET /ops/status (admin). Refresh to re-poll live counters."
                        testid="tip-ops-page"
                    />
                }
                actions={
                    <button
                        type="button"
                        onClick={load}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-card text-xs font-semibold hover:border-primary/40"
                        data-testid="ops-refresh"
                    >
                        <ArrowClockwise size={14} weight="bold"/> Refresh
                    </button>
                }
            />

            {loading && !data && (
                <ListState variant="loading" message="Loading ops status…"/>
            )}
            {error && (
                <div
                    className="rounded-lg border border-[var(--error-border)] bg-error-soft text-error text-sm px-4 py-3"
                    data-testid="ops-error"
                    role="alert"
                >
                    {error}
                </div>
            )}

            {data && (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KpiCard
                            testid="ops-ready"
                            label="Readiness"
                            value={ready ? "Ready" : "Degraded"}
                            sub={`mongo=${data.mongo || "?"} · ENV=${data.env || "?"}`}
                            icon={Heartbeat}
                            tone={ready ? "success" : "warning"}
                        />
                        <KpiCard
                            testid="ops-worker"
                            label="Job worker (this process)"
                            value={workerOn ? "On" : "Off"}
                            sub={workerOn ? "Claims queue on this pod" : "API-only mode"}
                            icon={Cpu}
                            tone={workerOn ? "primary" : "default"}
                        />
                        <KpiCard
                            testid="ops-payload"
                            label="Payload backend"
                            value={data.job_payload_backend || "—"}
                            sub="Prefer mongo for multi-node"
                            icon={Database}
                            tone={data.job_payload_backend === "mongo" ? "success" : "warning"}
                        />
                        <KpiCard
                            testid="ops-llm"
                            label="LLM budget"
                            value={
                                llm
                                    ? llm.unlimited
                                        ? Number(llm.tokens_used || 0).toLocaleString()
                                        : `${llm.percent_used ?? 0}%`
                                    : "—"
                            }
                            sub={
                                llm
                                    ? llm.unlimited
                                        ? `${llm.month} · unlimited`
                                        : `${Number(llm.tokens_used || 0).toLocaleString()} / ${Number(llm.budget || 0).toLocaleString()}`
                                    : "from /settings meter"
                            }
                            icon={Lightning}
                            tone={llm?.exhausted ? "critical" : "default"}
                            to="/settings"
                        />
                    </div>

                    {hints.length > 0 && (
                        <div
                            className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 space-y-2"
                            data-testid="ops-ha-hints"
                        >
                            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                <Warning size={14} weight="bold"/> HA hints
                            </div>
                            <ul className="list-disc pl-5 text-sm text-amber-900 dark:text-amber-100 space-y-1">
                                {hints.map((h) => (
                                    <li key={h}>{h}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Panel title="This process" testid="ops-process-panel">
                            <Row label="Service">{data.service}</Row>
                            <Row label="ENV">
                                <Badge ok={data.env === "production"}>{data.env}</Badge>
                            </Row>
                            <Row label="Mongo">
                                <Badge ok={data.mongo === "up"}>
                                    {data.mongo === "up" ? (
                                        <><CheckCircle size={12}/> up</>
                                    ) : (
                                        <>{data.mongo || "unknown"}</>
                                    )}
                                </Badge>
                            </Row>
                            <Row label="Job worker">{workerOn ? "enabled" : "disabled"}</Row>
                            <Row label="Recommended API flag">
                                {data.replica_layout?.recommended_api_worker_flag ?? "0"}
                            </Row>
                            <Row label="Recommended worker flag">
                                {data.replica_layout?.recommended_worker_flag ?? "1"}
                            </Row>
                            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                                {data.replica_layout?.note}
                            </p>
                        </Panel>

                        <Panel title="Analytics cache" testid="ops-cache-panel">
                            <Row label="Scope">{data.analytics_cache?.scope || "process-local"}</Row>
                            <Row label="KPI TTL">{data.analytics_cache?.kpi_ttl_seconds ?? "—"}s</Row>
                            <Row label="Dashboard TTL">
                                {data.analytics_cache?.dashboard_ttl_seconds ?? "—"}s
                            </Row>
                            <Row label="Bypass">
                                <code className="text-[10px]">?{data.analytics_cache?.force_refresh_query}</code>
                            </Row>
                            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                                Cache is per process — multi-replica pods do not share KPI cache.
                            </p>
                        </Panel>

                        <Panel title="Job queue (Mongo)" testid="ops-queue-panel">
                            {Object.keys(queue).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2">No queue stats (Mongo down or empty).</p>
                            ) : (
                                Object.entries(queue).map(([k, v]) => (
                                    <Row key={k} label={k}>
                                        <span className="font-mono">{v}</span>
                                    </Row>
                                ))
                            )}
                            <div className="mt-3">
                                <Link
                                    to="/upload"
                                    className="text-xs font-semibold text-primary hover:underline"
                                >
                                    Open Ingest Logs →
                                </Link>
                            </div>
                        </Panel>

                        <Panel title="Pipeline stages" testid="ops-trace-panel">
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {(data.pipeline_trace?.stages || []).map((s) => (
                                    <span
                                        key={s}
                                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted border border-border"
                                    >
                                        {s}
                                    </span>
                                ))}
                            </div>
                            <Row label="Persisted on">
                                <span className="font-mono text-[10px]">
                                    {data.pipeline_trace?.persisted_on || "log_jobs"}
                                </span>
                            </Row>
                        </Panel>
                    </div>

                    <Panel
                        title="Recent job timings"
                        testid="ops-timings-panel"
                        actions={
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Timer size={12}/> slowest first
                            </span>
                        }
                    >
                        {timings.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4 text-center">
                                No jobs with <code className="text-xs">pipeline_total_ms</code> yet.
                                Run an upload to populate timings.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                    <tr className="text-left text-muted-foreground border-b border-border">
                                        <th className="py-2 pr-3 font-semibold">Job</th>
                                        <th className="py-2 pr-3 font-semibold">Status</th>
                                        <th className="py-2 pr-3 font-semibold">Total</th>
                                        <th className="py-2 font-semibold">Stages (ms)</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {timings.map((t) => (
                                        <tr key={t.id} className="border-b border-border/60 last:border-0">
                                            <td className="py-2 pr-3 font-mono">{t.id}</td>
                                            <td className="py-2 pr-3">{t.status}</td>
                                            <td className="py-2 pr-3 font-mono font-semibold">
                                                {t.pipeline_total_ms != null
                                                    ? `${Number(t.pipeline_total_ms).toFixed(0)}ms`
                                                    : "—"}
                                            </td>
                                            <td className="py-2 text-muted-foreground font-mono text-[10px]">
                                                {t.by_stage_ms && Object.keys(t.by_stage_ms).length
                                                    ? Object.entries(t.by_stage_ms)
                                                        .map(([k, v]) => `${k}:${Number(v).toFixed(0)}`)
                                                        .join(" · ")
                                                    : "—"}
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>

                    <Panel title="Docs & load test" testid="ops-docs-panel">
                        <div className="space-y-2 text-sm">
                            <div className="flex items-start gap-2 text-muted-foreground">
                                <Info size={14} className="mt-0.5 shrink-0"/>
                                <p>
                                    Full multi-replica checklist and Helm layout live in the repo (not executed from the browser).
                                    Load tests run via CLI against a live API.
                                </p>
                            </div>
                            <ul className="text-xs font-mono space-y-1 pl-1">
                                {Object.entries(docs).map(([k, v]) => (
                                    <li key={k}>
                                        <span className="text-muted-foreground">{k}:</span> {v}
                                    </li>
                                ))}
                            </ul>
                            {data.load_test_cli && (
                                <pre className="mt-3 text-[11px] bg-muted border border-border rounded-lg p-3 overflow-x-auto">
                                    {data.load_test_cli}
                                </pre>
                            )}
                        </div>
                    </Panel>
                </>
            )}
        </div>
    );
}
