import {useCallback, useEffect, useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {api, apiErrorMessage} from "../lib/api";
import {
    ArrowClockwise,
    CheckCircle,
    Copy,
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
import {toast} from "sonner";

const QUEUE_ORDER = ["queued", "running", "done", "failed"];
const QUEUE_TONE = {
    queued: "var(--warning)",
    running: "var(--primary)",
    done: "var(--success)",
    failed: "var(--error)",
};

function Badge({ok, children}) {
    return (
        <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${
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

function formatMs(ms) {
    if (ms == null || !Number.isFinite(Number(ms))) return "—";
    const n = Number(ms);
    if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
    return `${Math.round(n)}ms`;
}

function StageBars({byStage, totalMs}) {
    const entries = Object.entries(byStage || {}).filter(([, v]) => Number(v) > 0);
    if (!entries.length) {
        return <span className="text-muted-foreground">—</span>;
    }
    const sum = entries.reduce((a, [, v]) => a + Number(v), 0) || 1;
    const denom = totalMs && Number(totalMs) > 0 ? Number(totalMs) : sum;
    return (
        <div className="space-y-1 min-w-[12rem]">
            <div
                className="flex h-2 w-full rounded overflow-hidden border border-border"
                style={{background: "var(--muted)", direction: "ltr"}}
                title={entries.map(([k, v]) => `${k}: ${Math.round(Number(v))}ms`).join(" · ")}
            >
                {entries.map(([k, v]) => (
                    <div
                        key={k}
                        style={{
                            width: `${Math.max(2, (Number(v) / denom) * 100)}%`,
                            backgroundColor:
                                k.includes("playbook") || k.includes("enrich")
                                    ? "var(--primary)"
                                    : k.includes("parse")
                                        ? "var(--success)"
                                        : "var(--warning)",
                            flexShrink: 0,
                        }}
                    />
                ))}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground truncate">
                {entries
                    .sort((a, b) => Number(b[1]) - Number(a[1]))
                    .slice(0, 4)
                    .map(([k, v]) => `${k}:${Math.round(Number(v))}`)
                    .join(" · ")}
            </div>
        </div>
    );
}

export default function OpsHealth() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [lastLoadedAt, setLastLoadedAt] = useState(null);

    const load = useCallback((opts = {}) => {
        const silent = Boolean(opts.silent);
        if (silent) setRefreshing(true);
        else {
            setLoading(true);
            setError(null);
        }
        api
            .get("/ops/status", {params: {_t: Date.now()}})
            .then((r) => {
                setData(r.data);
                setError(null);
                setLastLoadedAt(new Date());
            })
            .catch((e) => {
                if (!silent) setData(null);
                setError(apiErrorMessage(e) || "Failed to load ops status");
            })
            .finally(() => {
                setLoading(false);
                setRefreshing(false);
            });
    }, []);

    useEffect(() => {
        load({silent: false});
    }, [load]);

    useEffect(() => {
        if (!autoRefresh) return undefined;
        const t = setInterval(() => load({silent: true}), 15000);
        return () => clearInterval(t);
    }, [autoRefresh, load]);

    const ready = Boolean(data?.ready);
    const workerOn = Boolean(data?.job_worker_enabled);
    const llm = data?.llm_usage;
    const queue = data?.queue || {};
    const timings = data?.recent_job_timings || [];
    const hints = data?.ha_hints || [];
    const docs = data?.docs || {};

    const queueTotal = useMemo(
        () => QUEUE_ORDER.reduce((a, k) => a + (Number(queue[k]) || 0), 0),
        [queue],
    );
    const queueBacklog = (Number(queue.queued) || 0) + (Number(queue.running) || 0);
    const maxTiming = useMemo(
        () => Math.max(1, ...timings.map((t) => Number(t.pipeline_total_ms) || 0)),
        [timings],
    );

    const llmPct = llm && !llm.unlimited ? Number(llm.percent_used) || 0 : null;
    const llmTone =
        llm?.exhausted ? "critical" : llmPct != null && llmPct >= 80 ? "warning" : "default";

    const copyCli = () => {
        const text = data?.load_test_cli || "";
        if (!text) {
            toast.error("No CLI snippet available");
            return;
        }
        navigator.clipboard?.writeText(text).then(
            () => toast.success("Load-test command copied"),
            () => toast.error("Clipboard unavailable"),
        );
    };

    return (
        <div data-testid="ops-health-page" className="space-y-6 pb-8">
            <PageHeader
                testid="ops-health-header"
                title="Ops & Health"
                icon={Heartbeat}
                subtitle="Multi-replica flags, job queue, pipeline timings, and LLM budget (admin)"
                tip={
                    <HelpTip
                        title="Ops & Health"
                        body="Admin view of platform readiness: Mongo connectivity, job queue depth, pipeline timings, and LLM monthly budget usage."
                        how="GET /ops/status (admin). Auto-refresh every 15s when enabled."
                        testid="tip-ops-page"
                    />
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <label
                            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer px-2 py-1.5 rounded border border-border"
                            title="Poll /ops/status every 15 seconds"
                        >
                            <input
                                type="checkbox"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="rounded border-border"
                                data-testid="ops-auto-refresh"
                            />
                            Auto 15s
                        </label>
                        {lastLoadedAt && (
                            <span className="text-[10px] font-mono text-muted-foreground hidden sm:inline">
                                updated {lastLoadedAt.toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => load({silent: Boolean(data)})}
                            disabled={loading || refreshing}
                            className="soc-btn-secondary !text-xs !h-9 inline-flex items-center gap-1.5 disabled:opacity-50"
                            data-testid="ops-refresh"
                        >
                            <ArrowClockwise size={14} className={refreshing ? "animate-spin" : ""} weight="bold"/>
                            Refresh
                        </button>
                    </div>
                }
            />

            {loading && !data && (
                <ListState variant="loading" testid="ops-loading" message="Loading ops status…"/>
            )}
            {error && !data && (
                <ListState variant="error" testid="ops-error" message={error}/>
            )}
            {error && data && (
                <div
                    className="rounded-lg border border-[var(--warning-border)] bg-warning-soft text-warning text-xs px-3 py-2"
                    data-testid="ops-stale-error"
                >
                    Live refresh failed — showing last snapshot. {error}
                </div>
            )}

            {data && (
                <>
                    {/* Overall health strip */}
                    <div
                        className={`rounded-xl border px-4 py-3 flex flex-wrap items-center gap-3 ${
                            ready
                                ? "border-[var(--success-border)] bg-success-soft/40"
                                : "border-[var(--warning-border)] bg-warning-soft"
                        }`}
                        data-testid="ops-health-strip"
                    >
                        {ready ? (
                            <CheckCircle size={22} className="text-success" weight="fill"/>
                        ) : (
                            <Warning size={22} className="text-warning" weight="fill"/>
                        )}
                        <div className="flex-1 min-w-0">
                            <div className={`text-sm font-semibold ${ready ? "text-success" : "text-warning"}`}>
                                {ready ? "Platform ready" : "Degraded — check Mongo / workers"}
                            </div>
                            <p className="text-[11px] text-muted-foreground m-0 font-mono">
                                ENV={data.env || "?"} · mongo={data.mongo || "?"} · worker=
                                {workerOn ? "on" : "off"} · payload={data.job_payload_backend || "?"}
                                {queueBacklog > 0 ? ` · backlog=${queueBacklog}` : ""}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link to="/upload" className="soc-btn-ghost !text-xs !h-8">
                                Ingest
                            </Link>
                            <Link to="/settings" className="soc-btn-ghost !text-xs !h-8">
                                Settings
                            </Link>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KpiCard
                            testid="ops-ready"
                            label="Readiness"
                            value={ready ? "Ready" : "Degraded"}
                            sub={`mongo=${data.mongo || "?"} · ENV=${data.env || "?"}`}
                            icon={Heartbeat}
                            tone={ready ? "success" : "warning"}
                            tip={
                                <HelpTip
                                    title="Readiness"
                                    body="Aggregate green/amber signal: Mongo reachable and this process considers itself ready for traffic."
                                    how="GET /ops/status · ready flag from health probe path."
                                    testid="tip-ops-ready"
                                />
                            }
                        />
                        <KpiCard
                            testid="ops-worker"
                            label="Job worker"
                            value={workerOn ? "On" : "Off"}
                            sub={workerOn ? "Claims queue on this pod" : "API-only mode"}
                            icon={Cpu}
                            tone={workerOn ? "primary" : "default"}
                            tip={
                                <HelpTip
                                    title="Job worker"
                                    body="Whether this API process claims background pipeline jobs. Multi-replica HA often runs API-only pods plus dedicated workers."
                                    how="JOB_WORKER_ENABLED (or replica layout flags) on this process."
                                    testid="tip-ops-worker"
                                />
                            }
                        />
                        <KpiCard
                            testid="ops-payload"
                            label="Payload backend"
                            value={data.job_payload_backend || "—"}
                            sub="Prefer mongo for multi-node"
                            icon={Database}
                            tone={data.job_payload_backend === "mongo" ? "success" : "warning"}
                            tip={
                                <HelpTip
                                    title="Payload backend"
                                    body="Where upload job payloads are stored until workers claim them. Mongo is preferred for multi-node so any worker can process jobs."
                                    testid="tip-ops-payload"
                                />
                            }
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
                            tone={llmTone}
                            to="/settings"
                            tip={
                                <HelpTip
                                    title="LLM monthly budget"
                                    body="Token usage vs Settings budget for the current calendar month. Exhausted budgets force template playbooks."
                                    how="Sum of metered completion tokens ÷ llm_token_budget_monthly."
                                    testid="tip-ops-llm"
                                />
                            }
                        />
                    </div>

                    {/* LLM budget progress (when capped) */}
                    {llm && !llm.unlimited && (
                        <div
                            className="rounded-xl border border-border bg-card px-4 py-3"
                            data-testid="ops-llm-progress"
                        >
                            <div className="flex items-center justify-between gap-2 mb-2 text-xs">
                                <span className="font-semibold text-muted-foreground uppercase tracking-wide">
                                    LLM monthly usage
                                </span>
                                <span className="font-mono">
                                    {Number(llm.tokens_used || 0).toLocaleString()} /{" "}
                                    {Number(llm.budget || 0).toLocaleString()} tokens
                                    {llm.exhausted ? " · EXHAUSTED" : ""}
                                </span>
                            </div>
                            <div
                                className="h-2.5 w-full rounded-full overflow-hidden"
                                style={{background: "var(--muted)", direction: "ltr"}}
                            >
                                <div
                                    style={{
                                        width: `${Math.min(100, Math.max(0, llmPct ?? 0))}%`,
                                        height: "100%",
                                        backgroundColor: llm.exhausted
                                            ? "var(--error)"
                                            : (llmPct ?? 0) >= 80
                                                ? "var(--warning)"
                                                : "var(--primary)",
                                    }}
                                />
                            </div>
                        </div>
                    )}

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

                    {/* Queue visual + process / cache */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                        <Panel
                            title="Job queue"
                            testid="ops-queue-panel"
                            tip={
                                <HelpTip
                                    title="Job queue"
                                    body="Counts of log_jobs by status. Backlog = queued + running. Deep queues mean workers are behind or disabled."
                                    testid="tip-ops-queue"
                                />
                            }
                            actions={
                                <Link to="/upload" className="text-[11px] font-semibold text-primary hover:underline">
                                    Ingest →
                                </Link>
                            }
                        >
                            {Object.keys(queue).length === 0 ? (
                                <p className="text-xs text-muted-foreground py-2 m-0">
                                    No queue stats (Mongo down or empty).
                                </p>
                            ) : (
                                <div className="space-y-3" data-testid="ops-queue-bars">
                                    <div className="text-[11px] font-mono text-muted-foreground">
                                        total {queueTotal}
                                        {queueBacklog > 0 ? ` · active backlog ${queueBacklog}` : " · idle"}
                                    </div>
                                    {QUEUE_ORDER.map((k) => {
                                        const v = Number(queue[k]) || 0;
                                        const maxQ = Math.max(1, ...QUEUE_ORDER.map((x) => Number(queue[x]) || 0));
                                        const pct = Math.min(100, (v / maxQ) * 100);
                                        return (
                                            <div key={k} className="space-y-1">
                                                <div className="flex justify-between text-[11px]">
                                                    <span className="font-medium capitalize text-foreground">{k}</span>
                                                    <span className="font-mono tabular-nums">{v}</span>
                                                </div>
                                                <div
                                                    className="h-2 rounded-full overflow-hidden"
                                                    style={{background: "var(--muted)", direction: "ltr"}}
                                                >
                                                    <div
                                                        style={{
                                                            width: `${v ? Math.max(3, pct) : 0}%`,
                                                            height: "100%",
                                                            backgroundColor: QUEUE_TONE[k] || "var(--primary)",
                                                            borderRadius: 999,
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {/* Other status keys if present */}
                                    {Object.keys(queue)
                                        .filter((k) => !QUEUE_ORDER.includes(k))
                                        .map((k) => (
                                            <Row key={k} label={k}>
                                                <span className="font-mono">{queue[k]}</span>
                                            </Row>
                                        ))}
                                </div>
                            )}
                        </Panel>

                        <Panel
                            title="This process"
                            testid="ops-process-panel"
                            tip={
                                <HelpTip
                                    title="This process"
                                    body="Identity and connectivity of the API pod you are talking to right now (service name, ENV, Mongo, worker role)."
                                    testid="tip-ops-process"
                                />
                            }
                        >
                            <Row label="Service">{data.service}</Row>
                            <Row label="ENV">
                                <Badge ok={data.env === "production"}>{data.env}</Badge>
                            </Row>
                            <Row label="Mongo">
                                <Badge ok={data.mongo === "up"}>
                                    {data.mongo === "up" ? (
                                        <>
                                            <CheckCircle size={12}/> up
                                        </>
                                    ) : (
                                        <>{data.mongo || "unknown"}</>
                                    )}
                                </Badge>
                            </Row>
                            <Row label="Job worker">{workerOn ? "enabled" : "disabled"}</Row>
                            <Row label="Recommended API flag">
                                <code className="text-[10px]">
                                    ACTIRA_JOB_WORKER={data.replica_layout?.recommended_api_worker_flag ?? "0"}
                                </code>
                            </Row>
                            <Row label="Recommended worker flag">
                                <code className="text-[10px]">
                                    ACTIRA_JOB_WORKER={data.replica_layout?.recommended_worker_flag ?? "1"}
                                </code>
                            </Row>
                            {data.otel && (
                                <Row label="OpenTelemetry">
                                    {data.otel.configured ? (
                                        <Badge ok>configured</Badge>
                                    ) : (
                                        <span className="text-muted-foreground">off / not configured</span>
                                    )}
                                </Row>
                            )}
                            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed m-0">
                                {data.replica_layout?.note}
                            </p>
                        </Panel>

                        <Panel
                            title="Analytics cache"
                            testid="ops-cache-panel"
                            tip={
                                <HelpTip
                                    title="Analytics cache"
                                    body="In-process TTL cache for dashboard/KPI endpoints. Not shared across replicas — force-refresh query bypasses it."
                                    testid="tip-ops-cache"
                                />
                            }
                        >
                            <Row label="Scope">{data.analytics_cache?.scope || "process-local"}</Row>
                            <Row label="KPI TTL">{data.analytics_cache?.kpi_ttl_seconds ?? "—"}s</Row>
                            <Row label="Dashboard TTL">
                                {data.analytics_cache?.dashboard_ttl_seconds ?? "—"}s
                            </Row>
                            <Row label="Bypass">
                                <code className="text-[10px]">?{data.analytics_cache?.force_refresh_query}</code>
                            </Row>
                            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed m-0">
                                Cache is per process — multi-replica pods do not share KPI cache.
                            </p>
                        </Panel>

                        <Panel
                            title="Pipeline stages"
                            testid="ops-trace-panel"
                            tip={
                                <HelpTip
                                    title="Pipeline stages"
                                    body="Named stages instrumented by the ingest pipeline. Timings land on log_jobs."
                                    testid="tip-ops-trace"
                                />
                            }
                        >
                            <div className="flex flex-wrap gap-1.5 mb-3">
                                {(data.pipeline_trace?.stages || []).map((s, i) => (
                                    <span key={s} className="inline-flex items-center gap-1">
                                        {i > 0 && (
                                            <span className="text-muted-foreground text-[10px]" aria-hidden>
                                                →
                                            </span>
                                        )}
                                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-muted border border-border">
                                            {s}
                                        </span>
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
                        tip={
                            <HelpTip
                                title="Recent job timings"
                                body="Slowest recent pipeline runs with total_ms and per-stage breakdown. Use stacked bars to spot enrich/LLM bottlenecks."
                                testid="tip-ops-timings"
                            />
                        }
                        actions={
                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                <Timer size={12}/> slowest first · max {formatMs(maxTiming)}
                            </span>
                        }
                    >
                        {timings.length === 0 ? (
                            <div className="text-center py-6 space-y-2">
                                <p className="text-sm text-muted-foreground m-0">
                                    No jobs with <code className="text-xs">pipeline_total_ms</code> yet.
                                </p>
                                <Link to="/upload" className="text-xs font-semibold text-primary hover:underline">
                                    Run an upload to populate timings →
                                </Link>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs" data-testid="ops-timings-table">
                                    <thead>
                                    <tr className="text-left text-muted-foreground border-b border-border">
                                        <th className="py-2 pr-3 font-semibold">Job</th>
                                        <th className="py-2 pr-3 font-semibold">Status</th>
                                        <th className="py-2 pr-3 font-semibold w-28">Total</th>
                                        <th className="py-2 font-semibold min-w-[14rem]">Stages</th>
                                    </tr>
                                    </thead>
                                    <tbody>
                                    {timings.map((t) => {
                                        const total = Number(t.pipeline_total_ms) || 0;
                                        const barPct = Math.min(100, (total / maxTiming) * 100);
                                        return (
                                            <tr key={t.id} className="border-b border-border/60 last:border-0 align-top">
                                                <td className="py-2.5 pr-3 font-mono text-[11px]">{t.id}</td>
                                                <td className="py-2.5 pr-3 capitalize">{t.status || "—"}</td>
                                                <td className="py-2.5 pr-3">
                                                    <div className="font-mono font-semibold tabular-nums">
                                                        {formatMs(total || null)}
                                                    </div>
                                                    <div
                                                        className="mt-1 h-1.5 rounded-full overflow-hidden"
                                                        style={{background: "var(--muted)", direction: "ltr", width: "100%"}}
                                                    >
                                                        <div
                                                            style={{
                                                                width: `${barPct}%`,
                                                                height: "100%",
                                                                backgroundColor: "var(--primary)",
                                                            }}
                                                        />
                                                    </div>
                                                </td>
                                                <td className="py-2.5">
                                                    <StageBars byStage={t.by_stage_ms} totalMs={total}/>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </Panel>

                    <Panel
                        title="Docs & load test"
                        testid="ops-docs-panel"
                        tip={
                            <HelpTip
                                title="Docs & load test"
                                body="Pointers to HA checklists and the CLI load-test command. These are not executed in-browser."
                                testid="tip-ops-docs"
                            />
                        }
                        actions={
                            data.load_test_cli ? (
                                <button
                                    type="button"
                                    onClick={copyCli}
                                    className="soc-btn-ghost !text-xs !h-8 inline-flex items-center gap-1"
                                    data-testid="ops-copy-cli"
                                >
                                    <Copy size={12}/> Copy CLI
                                </button>
                            ) : null
                        }
                    >
                        <div className="space-y-3 text-sm">
                            <div className="flex items-start gap-2 text-muted-foreground">
                                <Info size={14} className="mt-0.5 shrink-0"/>
                                <p className="m-0 text-xs leading-relaxed">
                                    Multi-replica checklist and Helm layout live in the repo (not executed from the
                                    browser). Load tests run via CLI against a live API.
                                </p>
                            </div>
                            <ul className="text-xs font-mono space-y-1.5 m-0 pl-0 list-none">
                                {Object.entries(docs).map(([k, v]) => (
                                    <li
                                        key={k}
                                        className="flex flex-wrap gap-x-2 gap-y-0.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5"
                                    >
                                        <span className="text-muted-foreground shrink-0">{k}</span>
                                        <span className="text-foreground break-all">{v}</span>
                                    </li>
                                ))}
                            </ul>
                            {data.load_test_cli && (
                                <pre
                                    className="mt-1 text-[11px] bg-muted border border-border rounded-lg p-3 overflow-x-auto m-0"
                                    data-testid="ops-load-cli"
                                >
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
