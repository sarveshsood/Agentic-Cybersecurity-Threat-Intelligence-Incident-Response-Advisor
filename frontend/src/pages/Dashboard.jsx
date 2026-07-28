import {useCallback, useEffect, useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {api} from "../lib/api";
import {SeverityBadge, StatusPill} from "../components/SeverityBadge";
import {AttackHeatmap} from "../components/AttackHeatmap";
import {ListState} from "../components/ListState";
import {HelpTip, Tip} from "../components/HelpTip";
import {SortableTh} from "../components/SortableTh";
import {IncidentPreview} from "../components/IncidentPreview";
import {useSortableData} from "../hooks/useSortableData";
import {formatDateTime, loadUiPrefs} from "../lib/uiPrefs";
import {HoverCard, HoverCardContent, HoverCardTrigger,} from "../components/ui/hover-card";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip as ReTooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    ArrowsClockwise,
    Database,
    Fingerprint,
    FolderSimpleLock,
    Globe,
    HandTap,
    Info,
    MagnifyingGlass,
    ShieldCheck,
    ShieldWarning,
    Target,
    TrendUp,
    UploadSimple,
    Users,
} from "@phosphor-icons/react";
import {DataTable, formatMetricValue, KpiCard, PageHeader, Panel, useChartTheme} from "../design-system";
import AgentRoster from "../components/AgentRoster";
import ExecutiveStrip from "../components/ExecutiveStrip";

/**
 * Demo KPI/incident fallbacks are OFF by default (enterprise trust).
 * Enable only for empty-DB marketing demos:
 *   REACT_APP_DASHBOARD_DEMO_FALLBACK=true
 */
const DEMO_FALLBACK_ENABLED = ["1", "true", "yes", "on"].includes(
    String(process.env.REACT_APP_DASHBOARD_DEMO_FALLBACK || "").toLowerCase(),
);

/** Zeroed KPI shape when the API returns nothing (real empty tenant). */
const EMPTY_KPIS = {
    total_incidents: 0,
    critical_incidents: 0,
    high_incidents: 0,
    medium_incidents: 0,
    low_incidents: 0,
    pending_review: 0,
    events_processed: 0,
    unique_src_ips: 0,
    unique_iocs: 0,
    high_threat_iocs: 0,
    multi_file_incidents: 0,
    mean_grounding_score: 0,
    acceptance_rate: 0,
    mean_mttr_hours: null,
    mttr_sample_size: 0,
    approved: 0,
    rejected: 0,
    severity_distribution: [],
    status_distribution: [],
    top_ioc_types: [],
    top_techniques: [],
};

/** Optional showcase data — never used unless REACT_APP_DASHBOARD_DEMO_FALLBACK=true. */
const DEMO_FALLBACK_KPIS = {
    total_incidents: 65,
    critical_incidents: 23,
    high_incidents: 30,
    medium_incidents: 12,
    low_incidents: 0,
    pending_review: 60,
    events_processed: 11152,
    unique_src_ips: 1654,
    unique_iocs: 1106,
    high_threat_iocs: 274,
    multi_file_incidents: 36,
    mean_grounding_score: 1,
    acceptance_rate: 0.80,
    mean_mttr_hours: 10.86,
    mttr_sample_size: 5,
    approved: 4,
    rejected: 1,
    severity_distribution: [
        {severity: "critical", count: 23},
        {severity: "high", count: 30},
        {severity: "medium", count: 12}
    ],
    status_distribution: [
        {status: "new", count: 2},
        {status: "in_progress", count: 3},
        {status: "pending_review", count: 60}
    ],
    top_ioc_types: [
        {type: "domain", count: 612},
        {type: "ip", count: 324},
        {type: "url", count: 89},
        {type: "cve", count: 34},
        {type: "email", count: 28},
        {type: "hash_md5", count: 12}
    ],
    top_techniques: [
        {id: "T1110", count: 58},
        {id: "T1190", count: 42},
        {id: "T1105", count: 16},
        {id: "T1059.001", count: 12},
        {id: "T1046", count: 8},
        {id: "T1071", count: 4}
    ]
};

const MITRE_LABELS = {
    "T1110": "Brute Force",
    "T1190": "Exploit Public-Facing App",
    "T1105": "Ingress Tool Transfer",
    "T1059.001": "PowerShell",
    "T1046": "Network Service Discovery",
    "T1071": "Application Layer Protocol"
};

const DEMO_INCIDENTS = [
    {
        id: "INC-982143",
        title: "Suspicious PowerShell execution bypassing AMSI",
        severity: "critical",
        status: "pending_review",
        techniques: [{}, {}, {}],
        iocs: [{}, {}, {}, {}, {}],
        threat_score: 92,
        playbook: {grounding_score: 0.98},
        created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString()
    },
    {
        id: "INC-982011",
        title: "Multiple failed logins followed by successful MFA from new IP",
        severity: "high",
        status: "in_progress",
        techniques: [{}, {}],
        iocs: [{}, {}],
        threat_score: 76,
        playbook: {grounding_score: 0.85},
        created_at: new Date(Date.now() - 1000 * 60 * 125).toISOString()
    },
    {
        id: "INC-981988",
        title: "Unusual volume of file deletions in SharePoint",
        severity: "high",
        status: "new",
        techniques: [{}],
        iocs: [{}, {}, {}],
        threat_score: 71,
        playbook: {grounding_score: 0.91},
        created_at: new Date(Date.now() - 1000 * 60 * 340).toISOString()
    },
    {
        id: "INC-981832",
        title: "Impossible travel alert: US to Nigeria in 45 minutes",
        severity: "medium",
        status: "pending_review",
        techniques: [{}, {}],
        iocs: [{}],
        threat_score: 55,
        playbook: {grounding_score: 0.77},
        created_at: new Date(Date.now() - 1000 * 60 * 1400).toISOString()
    },
    {
        id: "INC-981701",
        title: "Executable dropped in AppData/Roaming",
        severity: "critical",
        status: "approved",
        techniques: [{}, {}, {}, {}],
        iocs: [{}, {}, {}, {}, {}, {}],
        threat_score: 88,
        playbook: {grounding_score: 0.95},
        created_at: new Date(Date.now() - 1000 * 60 * 2800).toISOString()
    },
];

const DASH_TIPS = {
    page: {
        title: "Threat Operations dashboard",
        body: "Live snapshot of SOC workload: incident volume, critical severity, HiTL queue, playbook quality, MTTR, recent cases, and ATT&CK coverage.",
    },
    total: {title: "Incidents", body: "Total incident records (all statuses, all-time) from Mongo.", how: "COUNT of incidents collection."},
    critical: {title: "Critical severity", body: "Incidents scored as critical by the pipeline.", how: "COUNT where severity=critical."},
    high: {title: "High severity", body: "Incidents scored as high by the pipeline.", how: "COUNT where severity=high."},
    medium: {title: "Medium severity", body: "Incidents scored as medium by the pipeline.", how: "COUNT where severity=medium."},
    low: {title: "Low severity", body: "Incidents scored as low by the pipeline.", how: "COUNT where severity=low."},
    pending: {title: "HiTL pending", body: "Cases waiting for senior reviewer approval.", how: "COUNT where status=pending_review."},
    grounding: {title: "Average grounding", body: "Mean citation quality of generated playbooks (0–1).", how: "AVG(playbook.grounding_score) over incidents with a score."},
    acceptance: {title: "Acceptance rate", body: "Share of HiTL decisions that were approved vs rejected.", how: "approved / (approved + rejected). 0 if none reviewed."},
    mttr: {title: "Mean time to review", body: "Average hours from incident creation to first review decision.", how: "AVG(reviewed_at − created_at) in hours for reviewed cases."},
    events: {title: "Events Processed", body: "Sum of raw log events across incidents (from correlation stats).", how: "SUM(correlation.stats.total_events)."},
    ips: {title: "Unique SRC IPs", body: "Sum of distinct source IPs reported per incident correlation stats.", how: "SUM(correlation.stats.unique_source_ips)."},
    iocs: {title: "Unique IOCs", body: "Total IoC objects extracted across all incidents.", how: "COUNT of IoC array elements (unwound)."},
    high_threat: {title: "High Threat IOCs", body: "IoCs with enrichment threat_score ≥ 70.", how: "COUNT IoCs where threat_score ≥ 70."},
    multi: {title: "Multi-file Incidents", body: "Incidents that include more than one source log file.", how: "COUNT where files_meta has 2+ files."},
    recent: {title: "Recent incidents", body: "Newest incidents for quick triage. Click headers to sort."},
    heatmap: {title: "MITRE ATT&CK coverage", body: "Technique frequency across incidents."},
    sev_mix: {title: "Severity distribution", body: "All-time severity mix from KPI aggregates."},
    ioc_mix: {title: "Top IoC types", body: "IoC type counts from KPI aggregates."},
    trend: {title: "Incident creation trend", body: "Daily volume from the recent incident sample on this page (not all-time)."},
    status_mix: {title: "Lifecycle status mix", body: "Where cases sit in the IR lifecycle."},
    top_tech: {title: "Top ATT&CK techniques", body: "Most frequent MITRE technique IDs mapped by the pipeline. Click a row to filter incidents."},
};

function kpiTip(tip) {
    if (!tip || typeof tip !== "object") return null;
    return <HelpTip title={tip.title} body={tip.body} how={tip.how}/>;
}

const ACCESSORS = {
    title: (r) => r.title || "",
    severity: (r) => ({low: 1, medium: 2, high: 3, critical: 4}[r.severity] || 0),
    status: (r) => r.status || "",
    techniques: (r) => r.techniques?.length ?? 0,
    iocs: (r) => r.iocs?.length ?? 0,
    threat_score: (r) => Number(r.threat_score) || 0,
    grounding: (r) => Number(r.playbook?.grounding_score) || -1,
    created_at: (r) => new Date(r.created_at || 0).getTime(),
};

export default function Dashboard() {
    const prefs = loadUiPrefs();
    const chart = useChartTheme();

    const SEV_COLOR = chart.severity || {critical: '#ef4444', high: '#f97316', medium: '#eab308', low: '#3b82f6'};

    const limit = Math.max(5, Math.min(50, Number(prefs.dashboard_recent_limit) || 8));
    const showExtra = prefs.dashboard_extra_widgets !== false;
    const showPreviews = prefs.show_incident_previews !== false;
    const highThreat = Number(prefs.high_threat_score_threshold) || 70;

    const [rawKpis, setRawKpis] = useState(null);
    const [incidents, setIncidents] = useState([]);
    const [ready, setReady] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [showTechLabels, setShowTechLabels] = useState(false);

    const hasApiKpis = ready && rawKpis != null;
    const hasApiIncidents = ready && incidents.length > 0;
    // Showcase demo only when explicitly enabled and we have no real payload
    const useDemoKpis = DEMO_FALLBACK_ENABLED && ready && !hasApiKpis;
    const useDemoIncidents = DEMO_FALLBACK_ENABLED && ready && incidents.length === 0;

    const normalizeKpis = useCallback((payload) => {
        if (!payload || typeof payload !== "object") return {...EMPTY_KPIS};
        const merged = {...EMPTY_KPIS, ...payload};
        if (!merged.unique_src_ips && merged.unique_source_ips) {
            merged.unique_src_ips = merged.unique_source_ips;
        }
        if ((!merged.top_techniques || !merged.top_techniques.length) && merged.attack_heatmap) {
            const hm = merged.attack_heatmap;
            if (hm && typeof hm === "object" && !Array.isArray(hm)) {
                merged.top_techniques = Object.entries(hm)
                    .map(([id, count]) => ({id, count: Number(count) || 0}))
                    .filter((t) => t.id)
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 12);
            }
        }
        if (Array.isArray(merged.severity_distribution)) {
            for (const row of merged.severity_distribution) {
                const s = (row.severity || "").toLowerCase();
                const c = Number(row.count) || 0;
                if (s === "high" && payload.high_incidents == null) merged.high_incidents = c;
                if (s === "medium" && payload.medium_incidents == null) merged.medium_incidents = c;
                if (s === "low" && payload.low_incidents == null) merged.low_incidents = c;
                if (s === "critical" && payload.critical_incidents == null) merged.critical_incidents = c;
            }
        }
        // Coerce numeric KPI fields so charts/cards stay consistent
        for (const k of Object.keys(EMPTY_KPIS)) {
            if (typeof EMPTY_KPIS[k] === "number" && merged[k] != null && merged[k] !== "") {
                const n = Number(merged[k]);
                if (!Number.isNaN(n)) merged[k] = n;
            }
        }
        return merged;
    }, []);

    const kpis = useMemo(() => {
        if (hasApiKpis) return normalizeKpis(rawKpis);
        if (useDemoKpis) return DEMO_FALLBACK_KPIS;
        return EMPTY_KPIS;
    }, [hasApiKpis, rawKpis, useDemoKpis, normalizeKpis]);

    const activeIncidents = useMemo(() => {
        if (hasApiIncidents) return incidents;
        if (useDemoIncidents) return DEMO_INCIDENTS;
        return [];
    }, [hasApiIncidents, incidents, useDemoIncidents]);

    const showingDemoData = useDemoKpis || useDemoIncidents;
    const loading = !ready;
    const kpiLoading = loading || refreshing;

    const {sorted, sort, toggleSort} = useSortableData(
        activeIncidents,
        {key: "created_at", dir: "desc"},
        ACCESSORS,
    );

    const load = useCallback(async (opts = {}) => {
        const silent = Boolean(opts.silent);
        // Interactive Refresh / first paint: bypass analytics cache so the queue chart is never stuck.
        // Silent auto-poll uses cache (TTL ~30s) unless forceRefresh is explicitly true.
        const forceRefresh = opts.forceRefresh === true || (!silent && opts.forceRefresh !== false);
        if (silent) setRefreshing(true);
        else setLoadError(null);

        try {
            // Atomic dual fetch — avoid staggered KPI vs table paints
            const [kpiRes, incRes] = await Promise.all([
                api.get("/kpis", {
                    params: {
                        _t: Date.now(),
                        ...(forceRefresh ? {force_refresh: true} : {}),
                    },
                }).catch((e) => ({__err: e, data: null})),
                api.get("/incidents", {params: {limit, skip: 0, _t: Date.now()}}).catch((e) => ({__err: e, data: null})),
            ]);

            const errs = [];
            if (kpiRes?.__err) {
                errs.push(kpiRes.__err?.userMessage || kpiRes.__err?.message || "KPIs unavailable");
                if (!silent) setRawKpis(null);
            } else {
                setRawKpis(kpiRes?.data && typeof kpiRes.data === "object" ? kpiRes.data : {});
            }

            if (incRes?.__err) {
                errs.push(incRes.__err?.userMessage || incRes.__err?.message || "Incidents unavailable");
                if (!silent) setIncidents([]);
            } else {
                const raw = incRes?.data;
                const all = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
                // API already sorts created_at desc; keep defensive client sort for consistency
                const recent = [...all]
                    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                    .slice(0, limit);
                setIncidents(recent);
            }

            setLoadError(errs.length ? errs.join(" · ") : null);
            setReady(true);
        } finally {
            setRefreshing(false);
        }
    }, [limit]);

    useEffect(() => {
        load({silent: false});
        // Cap auto-refresh so “recommended” 60s does not thrash under load
        const rawMs = Number(prefs.dashboard_refresh_ms) || 0;
        const ms = rawMs > 0 ? Math.max(30_000, rawMs) : 0;
        if (ms <= 0) return undefined;
        const id = setInterval(() => load({silent: true}), ms);
        return () => clearInterval(id);
    }, [load, prefs.dashboard_refresh_ms]);

    const severityPie = useMemo(() => {
        if (kpis?.severity_distribution?.length) {
            return kpis.severity_distribution
                .filter((e) => Number(e.count) > 0)
                .map((e) => ({
                    severity: e.severity,
                    count: Number(e.count) || 0,
                }));
        }
        return [];
    }, [kpis]);

    const iocTypeBars = useMemo(() => {
        if (kpis?.top_ioc_types?.length) {
            return kpis.top_ioc_types.slice(0, 8);
        }
        return [];
    }, [kpis]);

    const trendSeries = useMemo(() => {
        if (!activeIncidents.length) return [];

        const byDay = {};
        for (const inc of activeIncidents) {
            if (!inc.created_at) continue;
            const d = new Date(inc.created_at);
            if (Number.isNaN(d.getTime())) continue;
            const key = d.toISOString().slice(0, 10);
            if (!byDay[key]) byDay[key] = {date: key, total: 0, critical: 0, high: 0};
            byDay[key].total += 1;
            if (inc.severity === "critical") byDay[key].critical += 1;
            if (inc.severity === "high") byDay[key].high += 1;
        }
        return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date));
    }, [activeIncidents]);

    /** Full IR lifecycle from live KPIs — never hardcode demo series into this chart. */
    const WORKLOAD_STATUS_ORDER = useMemo(() => ([
        {rawKey: "new", label: "New"},
        {rawKey: "in_progress", label: "In Progress"},
        {rawKey: "pending_review", label: "Pending Review"},
        {rawKey: "approved", label: "Approved"},
        {rawKey: "rejected", label: "Rejected"},
        {rawKey: "closed", label: "Closed"},
    ]), []);

    const workloadBars = useMemo(() => {
        const rawDist = kpis?.status_distribution;
        const map = {};
        if (Array.isArray(rawDist)) {
            for (const item of rawDist) {
                const key = String(item?.status || "").toLowerCase().replace(/\s+/g, "_");
                if (!key) continue;
                map[key] = Number(item.count) || 0;
            }
        }
        // Top-level KPI counters (same Mongo facet) — take max so partial/stale rows cannot zero a bar
        const counters = {
            new: Number(kpis?.new) || 0,
            in_progress: Number(kpis?.in_progress) || 0,
            pending_review: Number(kpis?.pending_review) || 0,
            approved: Number(kpis?.approved) || 0,
            rejected: Number(kpis?.rejected) || 0,
            closed: Number(kpis?.closed) || 0,
        };
        return WORKLOAD_STATUS_ORDER.map(({rawKey, label}) => {
            const fromDist = map[rawKey];
            const fromCounter = counters[rawKey];
            const count = Math.max(
                fromDist != null && !Number.isNaN(fromDist) ? fromDist : 0,
                fromCounter || 0,
            );
            return {
                status: label,
                count,
                rawKey,
                fill: (chart.status && chart.status[rawKey]) || chart.chart?.gray || "#64748B",
            };
        });
    }, [kpis, chart, WORKLOAD_STATUS_ORDER]);

    const workloadHasData = useMemo(
        () => workloadBars.some((b) => Number(b.count) > 0),
        [workloadBars],
    );
    const workloadTotal = useMemo(
        () => workloadBars.reduce((s, b) => s + (Number(b.count) || 0), 0),
        [workloadBars],
    );

    const topTechMini = useMemo(() => {
        if (kpis?.top_techniques?.length) {
            return kpis.top_techniques.slice(0, 6).map((t) => ({
                id: t.id || t.technique_id,
                name: t.name || MITRE_LABELS[t.id || t.technique_id] || "Unknown Technique",
                count: t.count,
            }));
        }
        return [];
    }, [kpis]);

    const pendingCount = kpis?.pending_review ?? 0;

    /** Stable chart shell — avoids Recharts layout thrash on empty data */
    const ChartEmpty = ({label = "No data yet"}) => (
        <div className="h-[160px] flex items-center justify-center text-xs text-muted-foreground px-3 text-center">
            {label}
        </div>
    );

    return (
        <div data-testid="dashboard-page" className="pb-12">
            <PageHeader
                testid="dashboard-header"
                title="Threat Operations"
                tip={<HelpTip title={DASH_TIPS.page.title} body={DASH_TIPS.page.body} testid="dash-tip-page"/>}
                subtitle={
                    <>
                        Executive risk at a glance, then ops volume, then charts and recent cases.
                        Hover <Info size={11} className="inline text-primary/80"/> for metric help.
                    </>
                }
                actions={
                    <div className="flex items-center gap-2 shrink-0">
                        <Tip content="Reload KPIs and recent incidents (bypasses analytics cache)">
                            <button
                                type="button"
                                data-testid="dash-refresh"
                                disabled={loading || refreshing}
                                onClick={() => load({silent: true, forceRefresh: true})}
                                className="text-xs font-semibold text-muted-foreground hover:text-primary theme-chip border theme-border px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                                <ArrowsClockwise size={14} weight="bold" className={refreshing ? "animate-spin" : ""}/>
                                {refreshing ? "Refreshing…" : "Refresh"}
                            </button>
                        </Tip>
                        <Tip content="Upload logs to create new incidents">
                            <Link
                                to="/upload"
                                data-testid="dash-ingest-cta"
                                className="text-xs font-semibold text-primary hover:text-primary bg-primary/10 hover:bg-primary/15 border border-primary/30 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors"
                            >
                                <UploadSimple size={14} weight="bold"/> Ingest new log
                            </Link>
                        </Tip>
                    </div>
                }
            />

            {showingDemoData && (
                <div
                    className="mb-4 rounded-lg border border-[var(--warning-border)] bg-warning-soft px-3 py-2 text-xs text-warning flex flex-wrap items-center gap-2"
                    data-testid="dashboard-demo-banner"
                    role="status"
                >
                    <strong className="font-semibold">DEMO DATA</strong>
                    <span>
                        Showcase fallback is enabled (`REACT_APP_DASHBOARD_DEMO_FALLBACK`).
                        Metrics below are not from your Mongo incidents — ingest logs for real data, or unset the flag.
                    </span>
                    <Link to="/upload" className="font-semibold underline underline-offset-2">
                        Go to Ingest
                    </Link>
                </div>
            )}

            {loadError && (
                <ListState
                    variant="error"
                    testid="dashboard-load-error"
                    message={`${loadError} — is the backend running on the configured API URL?`}
                />
            )}

            {loading && (
                <ListState
                    variant="loading"
                    testid="dashboard-loading"
                    message="Loading live KPIs and recent incidents…"
                />
            )}
            {refreshing && !loading && (
                <div className="mb-3 text-[11px] text-muted-foreground font-mono" data-testid="dashboard-refreshing">
                    Refreshing metrics…
                </div>
            )}

            {/* Layer 1 — leadership / risk narrative (criticals, HiTL, MTTR, AI quality) */}
            <ExecutiveStrip
                kpis={kpis}
                loading={kpiLoading}
                loadError={loadError}
                showingDemoData={showingDemoData}
            />

            <div
                className="flex flex-wrap items-center gap-2.5 mb-6"
                data-testid="dashboard-quick-actions"
            >
                <Link
                    to="/incidents"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border theme-border theme-chip text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors shadow-sm"
                    data-testid="quick-action-incidents"
                >
                    <ShieldWarning size={14} weight="bold"/> Browse incidents
                </Link>
                {pendingCount > 0 && (
                    <Link
                        to="/review"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-xs font-bold text-amber-700 hover:bg-amber-100 transition-colors shadow-sm"
                        data-testid="quick-action-review"
                    >
                        <HandTap size={14} weight="bold"/> Review queue
                        <span className="opacity-80 font-mono">({pendingCount})</span>
                    </Link>
                )}
                <Link
                    to="/knowledge"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border theme-border theme-chip text-xs font-semibold text-foreground hover:border-primary/40 hover:text-primary transition-colors shadow-sm"
                    data-testid="quick-action-kb"
                >
                    <MagnifyingGlass size={14} weight="bold"/> Search knowledge
                </Link>
            </div>

            {/* Layer 2 — ops volume only (no overlap with executive strip) */}
            <div className="mb-2 flex items-center gap-1.5">
                <span className="soc-label">Ops volume</span>
                <HelpTip
                    title="Ops volume"
                    body="Ingest and enrichment volume. Risk/review/AI quality live in the executive strip above; severity breakdown is in the charts below."
                    testid="tip-ops-volume"
                />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3 mb-6" data-testid="dashboard-ops-kpis">
                <KpiCard loading={kpiLoading} testid="kpi-total" tip={kpiTip(DASH_TIPS.total)} label="Incidents" value={kpis.total_incidents}
                         sub="all-time" icon={ShieldCheck} tone="primary" to="/incidents"/>
                <KpiCard loading={kpiLoading} testid="kpi-high" tip={kpiTip(DASH_TIPS.high)}
                         label="High severity" value={kpis.high_incidents} sub="severity=high" icon={TrendUp}
                         tone="warning" to="/incidents?severity=high"/>
                <KpiCard loading={kpiLoading} testid="kpi-events" tip={kpiTip(DASH_TIPS.events)} label="Events Processed"
                         value={kpis.events_processed} sub="ingested logs" icon={Database} tone="primary"/>
                <KpiCard loading={kpiLoading} testid="kpi-ips" tip={kpiTip(DASH_TIPS.ips)} label="Unique SRC IPs" value={kpis.unique_src_ips}
                         sub="source addresses" icon={Globe} tone="primary"/>
                <KpiCard loading={kpiLoading} testid="kpi-iocs" tip={kpiTip(DASH_TIPS.iocs)} label="Unique IOCs" value={kpis.unique_iocs}
                         sub="extracted indicators" icon={Target} tone="primary"/>
                <KpiCard loading={kpiLoading} testid="kpi-high-threat" tip={kpiTip(DASH_TIPS.high_threat)} label="High Threat IOCs"
                         value={kpis.high_threat_iocs} sub={`score ≥ ${highThreat}`} icon={ShieldWarning} tone="critical"/>
                <KpiCard loading={kpiLoading} testid="kpi-multi" tip={kpiTip(DASH_TIPS.multi)} label="Multi-File"
                         value={kpis.multi_file_incidents} sub="complex packages" icon={FolderSimpleLock}
                         tone="default"/>
            </div>

            {showExtra && !loading && (
                <>
                    {/* Layer 3 — distributions (severity + IoC only; lifecycle lives in workload) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 items-stretch">
                        <div
                            className="soc-card p-5 flex flex-col justify-between min-h-[240px]"
                            data-testid="dash-sev-mix">
                            <div>
                                <div className="flex items-center gap-1.5 mb-3">
                                    <div
                                        className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <TrendUp size={14} className="text-primary"/> Severity mix
                                    </div>
                                    <HelpTip title={DASH_TIPS.sev_mix.title} body={DASH_TIPS.sev_mix.body}/>
                                </div>
                            </div>
                            <div className="flex-1 flex items-center justify-center min-h-[160px]">
                                {severityPie.length === 0 ? (
                                    <ChartEmpty label="No severity data yet"/>
                                ) : (
                                <ResponsiveContainer width="100%" height={160} debounce={50}>
                                    <PieChart>
                                        <Pie data={severityPie} dataKey="count" nameKey="severity" cx="50%" cy="50%"
                                             innerRadius={40} outerRadius={65}
                                             stroke={chart.pieStroke || chart.colors?.surface || "#ffffff"}
                                             strokeWidth={2}
                                             isAnimationActive={false}>
                                            {severityPie.map((e) => (
                                                <Cell key={e.severity} fill={SEV_COLOR[e.severity] || chart.series?.[3] || '#94a3b8'}/>
                                            ))}
                                        </Pie>
                                        <ReTooltip contentStyle={chart.contentStyle || {
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                        }}/>
                                        <Legend wrapperStyle={{fontSize: 11, fontWeight: 500, color: chart.axis || '#64748b'}}
                                                iconType="circle"/>
                                    </PieChart>
                                </ResponsiveContainer>
                                )}
                            </div>
                        </div>

                        <div
                            className="soc-card p-5 flex flex-col justify-between min-h-[240px]"
                            data-testid="dash-ioc-types">
                            <div>
                                <div className="flex items-center gap-1.5 mb-3">
                                    <div
                                        className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Fingerprint size={14} className="text-primary"/> Top IoC types
                                    </div>
                                    <HelpTip title={DASH_TIPS.ioc_mix.title} body={DASH_TIPS.ioc_mix.body}/>
                                </div>
                            </div>
                            <div className="flex-1 flex items-center justify-center min-h-[160px]">
                                {iocTypeBars.length === 0 ? (
                                    <ChartEmpty label="No IoC type data yet"/>
                                ) : (
                                <ResponsiveContainer width="100%" height={160} debounce={50}>
                                    <BarChart data={iocTypeBars} margin={{left: -25, right: 0, top: 0, bottom: 0}}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid || "#f1f5f9"}/>
                                        <XAxis dataKey="type" tick={{fill: chart.tick?.fill || '#64748b', fontSize: 10}} axisLine={false}
                                               tickLine={false}/>
                                        <YAxis tick={{fill: chart.tick?.fill || '#94a3b8', fontSize: 10}} axisLine={false} tickLine={false}
                                               allowDecimals={false}/>
                                        <ReTooltip cursor={{fill: chart.cursorFill || '#f8fafc'}}
                                                   contentStyle={chart.contentStyle || {borderRadius: '8px', border: '1px solid #e2e8f0'}}/>
                                        <Bar dataKey="count" fill={chart.series?.[2] || "#64748b"} radius={[4, 4, 0, 0]} maxBarSize={35} isAnimationActive={false}/>
                                    </BarChart>
                                </ResponsiveContainer>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Layer 3b — queue lifecycle + ATT&CK (single status chart) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 items-stretch">
                        {/* Analyst Workload — sole lifecycle status view (live KPIs; theme tokens) */}
                        <div
                            className="soc-card p-5 h-[380px] flex flex-col overflow-hidden"
                            data-testid="dash-workload"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <Users size={16} className="text-primary"/>
                                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Analyst queue (by status)
                                </div>
                                <HelpTip
                                    title="Analyst queue"
                                    body="Live IR lifecycle counts from Mongo KPIs (new → closed). Not demo static data unless REACT_APP_DASHBOARD_DEMO_FALLBACK is enabled on an empty tenant."
                                    how="GET /kpis?force_refresh=true → status_distribution + top-level counters. Colors = design-system status tokens. Refresh bypasses analytics cache."
                                    testid="tip-dash-workload"
                                />
                                {workloadHasData && (
                                    <span
                                        className="ml-auto text-[10px] font-mono text-muted-foreground"
                                        data-testid="dash-workload-total"
                                        title="Sum of lifecycle bars"
                                    >
                                        n={workloadTotal}
                                        {kpis?.cache ? ` · cache=${kpis.cache}` : ""}
                                    </span>
                                )}
                            </div>

                            <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed" data-testid="dash-workload-hint">
                                Pipeline usually lands cases in <span className="font-mono">pending_review</span> or{" "}
                                <span className="font-mono">approved</span>. <span className="font-mono">new</span> stays
                                empty for HiTL-gated demos; opening a <span className="font-mono">new</span> case moves it
                                to <span className="font-mono">in_progress</span>. Click a bar to filter Incidents.
                            </p>
                            <div className="flex flex-wrap gap-1.5 mb-2" data-testid="dash-workload-status-links">
                                {workloadBars.map((b) => (
                                    <Link
                                        key={b.rawKey}
                                        to={`/incidents?status=${encodeURIComponent(b.rawKey)}`}
                                        className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border theme-border theme-chip hover:border-primary/40 hover:text-primary transition-colors"
                                        title={`Open incidents with status=${b.rawKey}`}
                                    >
                                        <span
                                            className="w-1.5 h-1.5 rounded-full shrink-0"
                                            style={{background: b.fill}}
                                            aria-hidden
                                        />
                                        {b.status}
                                        <span className="opacity-70">{b.count}</span>
                                    </Link>
                                ))}
                            </div>
                            <div className="flex-1 w-full overflow-hidden min-h-[260px]" data-testid="dash-workload-chart">
                                {!workloadHasData ? (
                                    <ChartEmpty label="No incidents in the lifecycle yet — ingest logs or open cases to populate."/>
                                ) : (
                                <ResponsiveContainer width="100%" height={280} debounce={50}>
                                    <BarChart
                                        data={workloadBars}
                                        margin={{
                                            top: 10,
                                            right: 15,
                                            left: -15,
                                            bottom: 40,
                                        }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            vertical={false}
                                            stroke={chart.grid || "#f1f5f9"}
                                        />
                                        <XAxis
                                            dataKey="status"
                                            tick={{fill: chart.tick?.fill || "#64748b", fontSize: 10}}
                                            axisLine={false}
                                            tickLine={false}
                                            interval={0}
                                            angle={-25}
                                            textAnchor="end"
                                            height={50}
                                        />
                                        <YAxis
                                            tick={{fill: chart.tick?.fill || "#94a3b8", fontSize: 11}}
                                            axisLine={false}
                                            tickLine={false}
                                            allowDecimals={false}
                                        />
                                        <ReTooltip
                                            cursor={{fill: chart.cursorFill || "#f8fafc"}}
                                            contentStyle={chart.contentStyle || {
                                                borderRadius: 8,
                                                border: "1px solid #e2e8f0",
                                            }}
                                        />
                                        <Bar
                                            dataKey="count"
                                            radius={[6, 6, 0, 0]}
                                            maxBarSize={40}
                                            isAnimationActive={false}
                                        >
                                            {workloadBars.map((entry) => (
                                                <Cell
                                                    key={entry.rawKey}
                                                    fill={entry.fill}
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                                )}
                            </div>
                        </div>

                        {/* Top ATT&CK Techniques */}
                        <div
                            className="soc-card p-5 h-[380px] flex flex-col overflow-hidden"
                            data-testid="dash-top-tech"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div
                                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    <ShieldWarning size={16} className="text-primary"/>
                                    Top ATT&CK Techniques
                                    <HelpTip
                                        title={DASH_TIPS.top_tech.title}
                                        body={DASH_TIPS.top_tech.body}
                                        testid="tip-dash-top-tech"
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowTechLabels((prev) => !prev)}
                                    className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground hover:text-primary theme-chip border theme-border hover:border-primary/40 px-2.5 py-1 rounded transition-colors"
                                >
                                    {showTechLabels ? "Hide Labels" : "Show Labels"}
                                </button>
                            </div>

                            <div className="flex-1 flex flex-col justify-evenly overflow-hidden">
                                {!topTechMini.length && (
                                    <p className="text-xs text-muted-foreground px-2 py-4 text-center">
                                        No ATT&CK techniques mapped yet. Ingest logs with detections to populate this list.
                                    </p>
                                )}
                                {topTechMini.map((t) => (
                                    <Link
                                        key={t.id}
                                        to={`/incidents?technique=${encodeURIComponent(t.id)}`}
                                        className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-[var(--shell-chip)] transition-all border border-transparent hover:border-[var(--shell-border)]"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-primary">
                          {t.id}
                        </span>
                                                {showTechLabels && (
                                                    <span
                                                        className="text-[10px] uppercase tracking-wide truncate text-muted-foreground">
                            {t.name}
                          </span>
                                                )}
                                            </div>
                                            <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-primary"
                                                    style={{
                                                        width: `${Math.min(
                                                            (t.count / Math.max(topTechMini[0]?.count || 1, 1)) * 100,
                                                            100,
                                                        )}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <span className="w-8 text-right font-mono text-xs font-semibold text-muted-foreground">
                      {t.count}
                    </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="soc-card p-5 mb-6 min-h-[280px]"
                         data-testid="dash-trend">
                        <div className="flex items-center gap-1.5 mb-4">
                            <div
                                className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <TrendUp size={14} className="text-primary"/> Incident Timeline
                            </div>
                            <HelpTip title={DASH_TIPS.trend.title} body={DASH_TIPS.trend.body}/>
                        </div>
                        {trendSeries.length === 0 ? (
                            <ChartEmpty label="No recent incidents to plot. Ingest logs to build a timeline."/>
                        ) : (
                        <ResponsiveContainer width="100%" height={220} debounce={50}>
                            <AreaChart data={trendSeries} margin={{left: -20, right: 10, top: 10, bottom: 0}}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chart.grid || "#f1f5f9"}/>
                                <XAxis dataKey="date" tick={{fill: chart.tick?.fill || '#64748b', fontSize: 10}} axisLine={false}
                                       tickLine={false}/>
                                <YAxis tick={{fill: chart.tick?.fill || '#94a3b8', fontSize: 10}} axisLine={false} tickLine={false}
                                       allowDecimals={false}/>
                                <ReTooltip contentStyle={chart.contentStyle || {borderRadius: '8px', border: '1px solid #e2e8f0'}}/>
                                <Area type="monotone" dataKey="total"
                                      stroke={chart.primary || chart.series?.[0] || "#3b82f6"}
                                      fill={chart.isDark ? "rgba(56, 189, 248, 0.12)" : "rgba(59, 130, 246, 0.1)"}
                                      strokeWidth={3} name="Total Volume" isAnimationActive={false}/>
                                <Area type="monotone" dataKey="critical"
                                      stroke={chart.areaCritical || "#ef4444"} fill="transparent"
                                      strokeWidth={2} name="Critical" isAnimationActive={false}/>
                            </AreaChart>
                        </ResponsiveContainer>
                        )}
                    </div>
                </>
            )}

            <Panel
                className="mb-6"
                noPadding
                title="Recent Incidents"
                testid="dash-recent-panel"
                tip={
                    <HelpTip
                        title="Recent incidents"
                        body="Latest cases from the pipeline. Open a row for the investigation workspace. Severity and status badges match the Incidents list."
                        testid="tip-dash-recent"
                    />
                }
                actions={
                    <div className="flex items-center gap-3">
                        <span
                            className="text-[10px] text-muted-foreground font-mono theme-chip px-2 py-0.5 rounded border theme-border">
                            Limit: {limit}
                        </span>
                        <Tip content="Browse all incidents with filters and full-column sort">
                            <Link to="/incidents"
                                  className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors">
                                View all →
                            </Link>
                        </Tip>
                    </div>
                }
            >
                <DataTable aria-label="Recent incidents" testid="dash-recent-table">
                    <thead className="bg-muted/40">
                    <tr>
                        <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort}/>
                        <SortableTh label="Severity" sortKey="severity" sort={sort} onSort={toggleSort}/>
                        <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort}/>
                        <SortableTh label="Tech" sortKey="techniques" sort={sort} onSort={toggleSort}
                                    align="right"/>
                        <SortableTh label="IoCs" sortKey="iocs" sort={sort} onSort={toggleSort} align="right"/>
                        <SortableTh label="Score" sortKey="threat_score" sort={sort} onSort={toggleSort}
                                    align="right"/>
                        <SortableTh label="Grounding" sortKey="grounding" sort={sort} onSort={toggleSort}
                                    align="right"/>
                        <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={toggleSort}
                                    align="right"/>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                    {sorted.length === 0 && !loading && (
                        <tr>
                            <td colSpan={8} className="text-center text-muted-foreground text-sm py-12" data-testid="dash-recent-empty">
                                No incidents yet.{" "}
                                <Link to="/upload" className="text-primary font-semibold underline-offset-2 hover:underline">
                                    Ingest sample or production logs
                                </Link>
                                {" "}to populate live KPIs and this table.
                            </td>
                        </tr>
                    )}
                    {sorted.map((inc) => {
                        const titleLink = (
                            <Link
                                to={`/incidents/${inc.id}`}
                                data-testid={`incident-link-${inc.id}`}
                                className="text-[13px] font-semibold text-foreground hover:text-primary transition-colors"
                                title={inc.summary || inc.title}
                            >
                                {inc.title}
                            </Link>
                        );
                        return (
                            <tr key={inc.id} className="hover:bg-muted/40 transition-colors">
                                <td className="px-4 py-3">
                                    {showPreviews ? (
                                        <HoverCard openDelay={180}>
                                            <HoverCardTrigger asChild>{titleLink}</HoverCardTrigger>
                                            <HoverCardContent
                                                side="right"
                                                collisionPadding={16}
                                                className="w-80 max-w-[min(20rem,calc(100vw-1.5rem))] bg-popover border theme-border text-popover-foreground shadow-xl p-4 z-[200] rounded-xl"
                                            >
                                                <IncidentPreview inc={inc}/>
                                            </HoverCardContent>
                                        </HoverCard>
                                    ) : (
                                        titleLink
                                    )}
                                    <div className="font-mono text-[10px] text-muted-foreground mt-1 uppercase"
                                         title={inc.id}>{inc.id?.slice(0, 8)}</div>
                                </td>
                                <td className="px-4 py-3"><SeverityBadge severity={inc.severity}/></td>
                                <td className="px-4 py-3"><StatusPill status={inc.status}/></td>
                                <td className="px-4 py-3 text-right font-mono text-[12px] font-semibold text-primary">{inc.techniques?.length ?? 0}</td>
                                <td className="px-4 py-3 text-right font-mono text-[12px] font-medium text-muted-foreground">{inc.iocs?.length ?? 0}</td>
                                <td className={`px-4 py-3 text-right font-mono text-[12px] font-bold ${Number(inc.threat_score) >= highThreat ? "text-destructive" : "text-primary"}`}>
                                    {inc.threat_score}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-[12px] font-bold text-emerald-600 dark:text-emerald-400">{inc.playbook?.grounding_score ?? "—"}</td>
                                <td className="px-4 py-3 text-right text-[11px] text-muted-foreground font-mono">
                                    {formatDateTime(inc.created_at, {showStandard: false})}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </DataTable>
            </Panel>

            {/* Full-width ATT&CK panel so coverage matrix has room to fit */}
            <Panel
                className="mb-6"
                title="MITRE ATT&CK Coverage"
                subtitle="Technique frequency by tactic — use Coverage matrix for the full catalog grid"
                testid="dash-heatmap-panel"
                tip={
                    <HelpTip
                        title="ATT&CK coverage heatmap"
                        body="How often each technique appears across incidents in the selected window. Density is frequency, not true enterprise coverage of the full ATT&CK catalog."
                        testid="tip-dash-heatmap"
                    />
                }
                bodyClassName="p-4 overflow-x-auto"
                actions={
                    <HelpTip title={DASH_TIPS.heatmap.title} body={DASH_TIPS.heatmap.body} align="end"/>
                }
            >
                <AttackHeatmap counts={kpis.attack_heatmap || {}}/>
            </Panel>

            {/* Layer 4 — product narrative (collapsed by default; not ops metrics) */}
            <details className="soc-card mb-2 group" data-testid="agent-roster-details">
                <summary
                    className="cursor-pointer list-none px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-foreground hover:bg-[var(--shell-chip)]/50 rounded-xl"
                >
                    <span className="inline-flex items-center gap-2">
                        How ACTIRA investigates
                        <span className="text-[10px] font-normal uppercase tracking-wider text-muted-foreground">
                            agent roster · pipeline stages
                        </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground font-medium group-open:hidden">Show</span>
                    <span className="text-[11px] text-muted-foreground font-medium hidden group-open:inline">Hide</span>
                </summary>
                <div className="px-2 pb-3">
                    <AgentRoster compact className="!border-0 !shadow-none !bg-transparent"/>
                </div>
            </details>
        </div>
    );
}