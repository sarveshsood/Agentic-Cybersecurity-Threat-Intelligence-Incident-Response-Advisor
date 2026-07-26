import {useEffect, useMemo, useState} from "react";
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
    ArrowUpRight,
    ChartLineUp,
    Clock,
    Fingerprint,
    HandTap,
    Info,
    Pulse,
    Queue,
    ShieldWarning,
    Timer,
    TrendUp,
    UploadSimple,
    Users,
} from "@phosphor-icons/react";
import {DataTable, KpiCard, PageHeader, Panel, useChartTheme} from "../design-system";

const DASH_TIPS = {
    page: {
        title: "Threat Operations dashboard",
        body: "Live snapshot of SOC workload: incident volume, critical severity, HiTL queue, playbook quality, MTTR, recent cases, and ATT&CK coverage.",
    },
    total: {
        title: "Incidents",
        body: "Total incident records (all statuses, all-time).",
        how: "COUNT of all incidents in Mongo.",
    },
    critical: {
        title: "Critical severity",
        body: "Incidents scored as critical by the pipeline.",
        how: "COUNT where severity = critical.",
    },
    pending: {
        title: "HiTL pending",
        body: "Cases waiting for senior reviewer approval.",
        how: "COUNT where status = pending_review.",
    },
    grounding: {
        title: "Average grounding",
        body: "Mean citation quality of generated playbooks (0–1).",
        how: "Average playbook.grounding_score over incidents with playbooks.",
    },
    acceptance: {
        title: "Acceptance rate",
        body: "Share of HiTL decisions that were approved vs rejected.",
        how: "approved / (approved + rejected).",
    },
    mttr: {
        title: "Mean time to review (MTTR proxy)",
        body: "Average hours from incident creation to first review decision (approved/rejected).",
        how: "Mean(reviewed_at − created_at) over reviewed incidents in the sample.",
    },
    recent: {
        title: "Recent incidents",
        body: "Newest incidents for quick triage. Click headers to sort (asc → desc → clear); hover titles for preview; open a title for the full case.",
    },
    heatmap: {
        title: "MITRE ATT&CK coverage",
        body: "Technique frequency across incidents. Click a cell to filter the Incidents list.",
    },
    sev_mix: {
        title: "Severity distribution",
        body: "All-time severity mix from KPI aggregates (falls back to recent sample).",
    },
    ioc_mix: {
        title: "Top IoC types",
        body: "IoC type counts from KPI aggregates or the recent incident sample.",
    },
    trend: {
        title: "Incident creation trend",
        body: "Daily volume from the recent incident sample — useful for spotting exercise spikes.",
    },
    status_mix: {
        title: "Lifecycle status mix",
        body: "Where cases sit in the IR lifecycle (new → review → approved/closed).",
    },
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
    const SEV_COLOR = chart.severity;
    const STATUS_COLOR = chart.status;
    const limit = Math.max(5, Math.min(50, Number(prefs.dashboard_recent_limit) || 8));
    const showExtra = prefs.dashboard_extra_widgets !== false;
    const showPreviews = prefs.show_incident_previews !== false;
    const highThreat = Number(prefs.high_threat_score_threshold) || 70;

    const [kpis, setKpis] = useState(null);
    const [incidents, setIncidents] = useState([]);
    const [loadError, setLoadError] = useState(null);

    const {sorted, sort, toggleSort} = useSortableData(
        incidents,
        {key: "created_at", dir: "desc"},
        ACCESSORS,
    );

    const load = () => {
        api.get("/kpis").then((r) => setKpis(r.data)).catch((e) => {
            setKpis(null);
            setLoadError(e?.userMessage || "KPIs unavailable");
        });
        api.get("/incidents").then((r) => {
            const all = Array.isArray(r.data) ? r.data : [];
            const recent = [...all]
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                .slice(0, limit);
            setIncidents(recent);
        }).catch(() => setIncidents([]));
    };

    useEffect(() => {
        load();
        const ms = Number(prefs.dashboard_refresh_ms) || 0;
        if (ms <= 0) return undefined;
        const id = setInterval(load, ms);
        return () => clearInterval(id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [limit, prefs.dashboard_refresh_ms]);

    const severityPie = useMemo(() => {
        if (kpis?.severity_distribution?.length) {
            return kpis.severity_distribution.map((e) => ({
                severity: e.severity,
                count: e.count,
            }));
        }
        const counts = {critical: 0, high: 0, medium: 0, low: 0};
        for (const inc of incidents) {
            const s = (inc.severity || "low").toLowerCase();
            if (counts[s] != null) counts[s] += 1;
        }
        return Object.entries(counts)
            .filter(([, c]) => c > 0)
            .map(([severity, count]) => ({severity, count}));
    }, [incidents, kpis]);

    const statusPie = useMemo(() => {
        if (kpis?.status_distribution?.length) {
            return kpis.status_distribution.filter((e) => e.count > 0);
        }
        const counts = {};
        for (const inc of incidents) {
            const s = inc.status || "new";
            counts[s] = (counts[s] || 0) + 1;
        }
        return Object.entries(counts).map(([status, count]) => ({status, count}));
    }, [kpis, incidents]);

    const iocTypeBars = useMemo(() => {
        if (kpis?.top_ioc_types?.length) {
            return kpis.top_ioc_types.slice(0, 8);
        }
        const counts = {};
        for (const inc of incidents) {
            for (const ioc of inc.iocs || []) {
                const t = (ioc.type || "other").toLowerCase();
                counts[t] = (counts[t] || 0) + 1;
            }
        }
        return Object.entries(counts)
            .map(([type, count]) => ({type, count}))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8);
    }, [incidents, kpis]);

    const trendSeries = useMemo(() => {
        const byDay = {};
        for (const inc of incidents) {
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
    }, [incidents]);

    const pendingLoad = useMemo(
        () => incidents.filter((i) => i.status === "pending_review").length,
        [incidents],
    );

    const highThreatCount = useMemo(
        () => incidents.filter((i) => Number(i.threat_score) >= highThreat).length,
        [incidents, highThreat],
    );

    /** Analyst workload proxy: pending_review + in_progress from KPIs/sample */
    const workloadBars = useMemo(() => {
        if (kpis?.status_distribution?.length) {
            return kpis.status_distribution
                .filter((e) => ["pending_review", "in_progress", "new"].includes(e.status))
                .map((e) => ({status: e.status.replace(/_/g, " "), count: e.count}));
        }
        const counts = {new: 0, in_progress: 0, pending_review: 0};
        for (const inc of incidents) {
            if (counts[inc.status] != null) counts[inc.status] += 1;
        }
        return Object.entries(counts)
            .filter(([, c]) => c > 0)
            .map(([status, count]) => ({status: status.replace(/_/g, " "), count}));
    }, [kpis, incidents]);

    const topTechMini = useMemo(() => {
        if (kpis?.top_techniques?.length) {
            return kpis.top_techniques.slice(0, 6).map((t) => ({
                id: t.id || t.technique_id,
                count: t.count,
            }));
        }
        const counts = {};
        for (const inc of incidents) {
            for (const t of inc.techniques || []) {
                const id = t.technique_id;
                if (!id) continue;
                counts[id] = (counts[id] || 0) + 1;
            }
        }
        return Object.entries(counts)
            .map(([id, count]) => ({id, count}))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);
    }, [kpis, incidents]);

    const mttrLabel =
        kpis?.mean_mttr_hours != null
            ? `${kpis.mean_mttr_hours}h`
            : "—";

    return (
        <div data-testid="dashboard-page">
            <PageHeader
                testid="dashboard-header"
                title="Threat Operations"
                tip={<HelpTip title={DASH_TIPS.page.title} body={DASH_TIPS.page.body} testid="dash-tip-page"/>}
                subtitle={
                    <>
                        Realtime view of ingestion, correlation, and reviewer workload. Hover{" "}
                        <Info size={11} className="inline text-primary/80"/> for metric help.
                    </>
                }
                actions={
                    <Tip content="Upload logs to create new incidents">
                        <Link
                            to="/upload"
                            data-testid="dash-ingest-cta"
                            className="text-xs font-medium text-primary hover:text-primary flex items-center gap-1 transition-colors shrink-0"
                        >
                            Ingest new log <ArrowUpRight size={14}/>
                        </Link>
                    </Tip>
                }
            />

            {loadError && (
                <ListState
                    variant="error"
                    testid="dashboard-load-error"
                    message={`${loadError} — is the backend running on the configured API URL?`}
                />
            )}
            {!loadError && kpis && kpis.total_incidents === 0 && (
                <ListState
                    variant="empty"
                    testid="dashboard-empty"
                    message="No incidents yet. Ingest a log package to populate the dashboard."
                    action={{to: "/upload", label: "Go to Upload"}}
                />
            )}

            {/* Quick actions — reduce clicks to primary analyst workflows */}
            <div
                className="flex flex-wrap items-center gap-2 mb-5"
                data-testid="dashboard-quick-actions"
            >
                <Link
                    to="/upload"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border theme-border text-xs font-semibold hover:border-primary/40 hover:text-primary transition-colors"
                    data-testid="quick-action-ingest"
                >
                    <UploadSimple size={14} weight="bold"/> Ingest logs
                </Link>
                <Link
                    to="/incidents"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border theme-border text-xs font-semibold hover:border-primary/40 hover:text-primary transition-colors"
                    data-testid="quick-action-incidents"
                >
                    <ShieldWarning size={14} weight="bold"/> Browse incidents
                </Link>
                {(kpis?.pending_review > 0 || pendingLoad > 0) && (
                    <Link
                        to="/review"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-warning/40 text-xs font-semibold text-warning hover:bg-warning/10 transition-colors"
                        data-testid="quick-action-review"
                    >
                        <HandTap size={14} weight="bold"/> Review queue
                        <span className="opacity-80">({kpis?.pending_review ?? pendingLoad})</span>
                    </Link>
                )}
                <Link
                    to="/knowledge"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border theme-border text-xs font-semibold hover:border-primary/40 hover:text-primary transition-colors"
                    data-testid="quick-action-kb"
                >
                    Search knowledge
                </Link>
                <span className="text-[10px] text-muted-foreground ml-auto hidden sm:inline">
          Tip: press <kbd className="px-1 rounded border theme-border font-mono">Ctrl+K</kbd> for command palette
        </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-4 mb-6">
                <KpiCard testid="kpi-total" tip={kpiTip(DASH_TIPS.total)} label="Incidents"
                         value={kpis?.total_incidents ?? "—"} sub="all-time" icon={ShieldWarning} tone="default"
                         to="/incidents"/>
                <KpiCard testid="kpi-critical" tip={kpiTip(DASH_TIPS.critical)} label="Critical"
                         value={kpis?.critical_incidents ?? "—"} sub="severity=critical" icon={Pulse} tone="critical"
                         to="/incidents?severity=critical"/>
                <KpiCard testid="kpi-pending" tip={kpiTip(DASH_TIPS.pending)} label="HiTL Pending"
                         value={kpis?.pending_review ?? "—"}
                         sub={pendingLoad ? `${pendingLoad} in recent sample` : "awaiting reviewer"} icon={HandTap}
                         tone="warning" to="/review"/>
                <KpiCard testid="kpi-grounding" tip={kpiTip(DASH_TIPS.grounding)} label="Avg Grounding"
                         value={kpis?.mean_grounding_score ?? "—"} sub="cited / total steps" icon={ChartLineUp}
                         tone="success"/>
                <KpiCard
                    testid="kpi-acceptance"
                    tip={kpiTip(DASH_TIPS.acceptance)}
                    label="Acceptance"
                    value={kpis?.acceptance_rate != null ? `${Math.round(Number(kpis.acceptance_rate) * 100)}%` : "—"}
                    sub={`${kpis?.approved ?? 0} approved · ${kpis?.rejected ?? 0} rejected`}
                    icon={Users}
                    tone="default"
                />
                <KpiCard
                    testid="kpi-mttr"
                    tip={kpiTip(DASH_TIPS.mttr)}
                    label="Mean MTTR"
                    value={mttrLabel}
                    sub={
                        kpis?.mttr_sample_size
                            ? `median ${kpis.median_mttr_hours ?? "—"}h · n=${kpis.mttr_sample_size}`
                            : "no reviewed sample yet"
                    }
                    icon={Timer}
                    tone="default"
                />
            </div>

            {showExtra && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
                        <div className="soc-card p-4" data-testid="dash-sev-mix">
                            <div className="flex items-center gap-1.5 mb-2">
                                <div className="soc-label flex items-center gap-1.5">
                                    <TrendUp size={11}/> Severity mix
                                </div>
                                <HelpTip title={DASH_TIPS.sev_mix.title} body={DASH_TIPS.sev_mix.body}/>
                            </div>
                            {severityPie.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-8 text-center">No data</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={160}>
                                    <PieChart>
                                        <Pie data={severityPie} dataKey="count" nameKey="severity" cx="50%" cy="50%"
                                             innerRadius={40} outerRadius={65} stroke={chart.pieStroke}>
                                            {severityPie.map((e) => (
                                                <Cell key={e.severity}
                                                      fill={SEV_COLOR[e.severity] || chart.chart.gray}/>
                                            ))}
                                        </Pie>
                                        <ReTooltip contentStyle={chart.contentStyle}/>
                                        <Legend wrapperStyle={{fontSize: 10}}/>
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="soc-card p-4" data-testid="dash-status-mix">
                            <div className="flex items-center gap-1.5 mb-2">
                                <div className="soc-label flex items-center gap-1.5">
                                    <Queue size={11}/> Status mix
                                </div>
                                <HelpTip title={DASH_TIPS.status_mix.title} body={DASH_TIPS.status_mix.body}/>
                            </div>
                            {statusPie.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-8 text-center">No data</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={statusPie} margin={{left: 0, right: 4, top: 4, bottom: 0}}>
                                        <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                        <XAxis dataKey="status" tick={{...chart.tick, fontSize: 8}} interval={0}
                                               angle={-20} textAnchor="end" height={48}/>
                                        <YAxis tick={{...chart.tick, fontSize: 9}} width={28}/>
                                        <ReTooltip contentStyle={chart.contentStyle}/>
                                        <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                                            {statusPie.map((e) => (
                                                <Cell key={e.status} fill={STATUS_COLOR[e.status] || chart.chart.gray}/>
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="soc-card p-4" data-testid="dash-ioc-types">
                            <div className="flex items-center gap-1.5 mb-2">
                                <div className="soc-label flex items-center gap-1.5">
                                    <Fingerprint size={11}/> Top IoC types
                                </div>
                                <HelpTip title={DASH_TIPS.ioc_mix.title} body={DASH_TIPS.ioc_mix.body}/>
                            </div>
                            {iocTypeBars.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-8 text-center">No IoCs</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={iocTypeBars} margin={{left: 0, right: 4, top: 4, bottom: 0}}>
                                        <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                        <XAxis dataKey="type" tick={{...chart.tick, fontSize: 9}}/>
                                        <YAxis tick={{...chart.tick, fontSize: 9}} width={28}/>
                                        <ReTooltip contentStyle={chart.contentStyle}/>
                                        <Bar dataKey="count" fill={chart.chart.gray} radius={[3, 3, 0, 0]}/>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>

                        <div className="soc-card p-4" data-testid="dash-soc-health">
                            <div className="soc-label flex items-center gap-1.5 mb-3">
                                <Clock size={11}/> SOC health
                                <HelpTip title="SOC health"
                                         body="Operational signals from KPI totals and recent sample. High-threat uses Settings UI threshold."/>
                            </div>
                            <div className="space-y-2.5 text-[12px]">
                                <div className="flex justify-between gap-2">
                                    <span className="text-muted-foreground"
                                          title="Pending HiTL / total">Queue pressure</span>
                                    <span className="font-mono text-warning">
                    {kpis?.pending_review ?? 0}
                                        <span
                                            className="text-muted-foreground/80"> / {kpis?.total_incidents ?? 0}</span>
                  </span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-muted-foreground">Critical share</span>
                                    <span className="font-mono text-error">
                    {kpis?.total_incidents
                        ? `${Math.round((100 * (kpis.critical_incidents || 0)) / kpis.total_incidents)}%`
                        : "—"}
                  </span>
                                </div>
                                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground" title={`Threat score ≥ ${highThreat} in recent sample`}>
                    High-threat (sample)
                  </span>
                                    <span className="font-mono text-primary">{highThreatCount}</span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-muted-foreground">HiTL acceptance</span>
                                    <span className="font-mono text-success">
                    {kpis?.acceptance_rate != null
                        ? `${Math.round(Number(kpis.acceptance_rate) * 100)}%`
                        : "—"}
                  </span>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <span className="text-muted-foreground">Mean MTTR</span>
                                    <span className="font-mono text-primary">{mttrLabel}</span>
                                </div>
                                <Link to="/review"
                                      className="inline-block text-[11px] text-primary hover:text-primary mt-1"
                                      title="Open review queue">
                                    Open review queue →
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div className="soc-card p-4" data-testid="dash-workload">
                            <div className="flex items-center gap-1.5 mb-2">
                                <div className="soc-label flex items-center gap-1.5">
                                    <Users size={11}/> Analyst workload
                                </div>
                                <HelpTip
                                    title="Analyst workload"
                                    body="Open queue by lifecycle stage (new / in progress / pending review). Proxy for analyst backlog when cases are not assigned."
                                />
                            </div>
                            {workloadBars.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-8 text-center">No open-queue data</div>
                            ) : (
                                <ResponsiveContainer width="100%" height={150}>
                                    <BarChart data={workloadBars} margin={{left: 0, right: 4, top: 4, bottom: 0}}>
                                        <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                        <XAxis dataKey="status" tick={{...chart.tick, fontSize: 9}}/>
                                        <YAxis tick={{...chart.tick, fontSize: 9}} width={28} allowDecimals={false}/>
                                        <ReTooltip contentStyle={chart.contentStyle}/>
                                        <Bar dataKey="count" fill={chart.chart.amber} radius={[3, 3, 0, 0]}/>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                        <div className="soc-card p-4" data-testid="dash-top-tech">
                            <div className="flex items-center gap-1.5 mb-2">
                                <div className="soc-label flex items-center gap-1.5">
                                    <ShieldWarning size={11}/> Top ATT&CK techniques
                                </div>
                                <HelpTip
                                    title="Top techniques"
                                    body="Most frequent MITRE techniques in KPIs or the recent sample. Click an ID to filter Incidents."
                                />
                            </div>
                            {topTechMini.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-8 text-center">No technique data
                                    yet</div>
                            ) : (
                                <div className="space-y-1.5">
                                    {topTechMini.map((t) => (
                                        <Link
                                            key={t.id}
                                            to={`/incidents?technique=${encodeURIComponent(t.id)}`}
                                            className="flex items-center justify-between gap-2 text-[11px] hover:bg-muted/50 rounded px-1 py-0.5 transition-colors"
                                            title={`Filter incidents with ${t.id}`}
                                        >
                                            <span className="font-mono text-primary">{t.id}</span>
                                            <span className="font-mono text-muted-foreground">{t.count}</span>
                                        </Link>
                                    ))}
                                    <Link to="/analytics"
                                          className="inline-block text-[11px] text-primary hover:text-primary mt-1"
                                          title="Open Analytics for full drill-down">
                                        Full ATT&CK analytics →
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>

                    {trendSeries.length > 1 && (
                        <div className="soc-card p-4 mb-6" data-testid="dash-trend">
                            <div className="flex items-center gap-1.5 mb-2">
                                <div className="soc-label flex items-center gap-1.5">
                                    <TrendUp size={11}/> Incident trend (recent sample)
                                </div>
                                <HelpTip title={DASH_TIPS.trend.title} body={DASH_TIPS.trend.body}/>
                            </div>
                            <ResponsiveContainer width="100%" height={160}>
                                <AreaChart data={trendSeries}>
                                    <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                    <XAxis dataKey="date" tick={{...chart.tick, fontSize: 9}}/>
                                    <YAxis tick={{...chart.tick, fontSize: 9}} width={28}/>
                                    <ReTooltip contentStyle={chart.contentStyle}/>
                                    <Area type="monotone" dataKey="total" stroke={chart.chart.blue}
                                          fill={`${chart.chart.blue}33`} strokeWidth={2} name="Total"/>
                                    <Area type="monotone" dataKey="critical" stroke={SEV_COLOR.critical}
                                          fill="transparent" strokeWidth={1.5} name="Critical"/>
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                <Panel
                    className="xl:col-span-8"
                    noPadding
                    title="Recent Incidents"
                    testid="dash-recent-panel"
                    actions={
                        <div className="flex items-center gap-2">
                            <HelpTip title={DASH_TIPS.recent.title} body={DASH_TIPS.recent.body}/>
                            <span className="text-[10px] text-muted-foreground/80 font-mono"
                                  title="Rows from Settings → UI prefs">
                n={limit}
              </span>
                            <Tip content="Browse all incidents with filters and full-column sort">
                                <Link to="/incidents" className="text-xs text-primary hover:text-primary">
                                    View all →
                                </Link>
                            </Tip>
                        </div>
                    }
                >
                    <DataTable aria-label="Recent incidents" maxHeight="28rem" testid="dash-recent-table">
                        <thead>
                        <tr>
                            <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort} help={{
                                title: "Title",
                                body: "Case narrative. Hover for preview; click to open."
                            }}/>
                            <SortableTh label="Severity" sortKey="severity" sort={sort} onSort={toggleSort}
                                        help={{title: "Severity", body: "Pipeline severity low → critical."}}/>
                            <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort}
                                        help={{title: "Status", body: "Lifecycle including pending_review for HiTL."}}/>
                            <SortableTh label="Tech" sortKey="techniques" sort={sort} onSort={toggleSort} align="right"
                                        help={{title: "Techniques", body: "Mapped MITRE ATT&CK technique count."}}/>
                            <SortableTh label="IoCs" sortKey="iocs" sort={sort} onSort={toggleSort} align="right"
                                        help={{title: "IoCs", body: "Extracted indicator count."}}/>
                            <SortableTh label="Score" sortKey="threat_score" sort={sort} onSort={toggleSort}
                                        align="right"
                                        help={{title: "Threat score", body: "0–100 enrichment composite."}}/>
                            <SortableTh label="Grounding" sortKey="grounding" sort={sort} onSort={toggleSort}
                                        align="right" help={{title: "Grounding", body: "Playbook citation rate."}}/>
                            <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={toggleSort}
                                        align="right" help={{title: "Created", body: "Pipeline completion time."}}/>
                        </tr>
                        </thead>
                        <tbody>
                        {sorted.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center text-muted-foreground text-xs py-8">
                                    No incidents yet — ingest a log to begin.
                                </td>
                            </tr>
                        )}
                        {sorted.map((inc) => {
                            const titleLink = (
                                <Link
                                    to={`/incidents/${inc.id}`}
                                    data-testid={`incident-link-${inc.id}`}
                                    className="text-[13px] text-foreground hover:text-primary transition-colors"
                                    title={inc.summary || inc.title}
                                >
                                    {inc.title}
                                </Link>
                            );
                            return (
                                <tr key={inc.id} className="border-t border-border hover:bg-muted/50 transition-colors">
                                    <td className="px-3 py-2.5">
                                        {showPreviews ? (
                                            <HoverCard openDelay={180}>
                                                <HoverCardTrigger asChild>{titleLink}</HoverCardTrigger>
                                                <HoverCardContent
                                                    side="right"
                                                    collisionPadding={16}
                                                    className="w-80 max-w-[min(20rem,calc(100vw-1.5rem))] bg-card border border-primary/25 p-3 z-[200]"
                                                >
                                                    <IncidentPreview inc={inc}/>
                                                </HoverCardContent>
                                            </HoverCard>
                                        ) : (
                                            titleLink
                                        )}
                                        <div className="soc-mono text-[10px] text-muted-foreground mt-0.5"
                                             title={inc.id}>{inc.id?.slice(0, 8)}</div>
                                    </td>
                                    <td className="px-3 py-2.5"><SeverityBadge severity={inc.severity}/></td>
                                    <td className="px-3 py-2.5"><StatusPill status={inc.status}/></td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[12px] text-primary"
                                        title="ATT&CK techniques">{inc.techniques?.length ?? 0}</td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[12px] text-foreground/90"
                                        title="IoC count">{inc.iocs?.length ?? 0}</td>
                                    <td className={`px-3 py-2.5 text-right font-mono text-[12px] ${Number(inc.threat_score) >= highThreat ? "text-error" : "text-primary"}`}
                                        title={`Threat score (high ≥ ${highThreat})`}>
                                        {inc.threat_score}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-mono text-[12px] text-success"
                                        title="Playbook grounding">{inc.playbook?.grounding_score ?? "—"}</td>
                                    <td className="px-3 py-2.5 text-right text-[11px] text-muted-foreground soc-mono"
                                        title={formatDateTime(inc.created_at)}>
                                        {formatDateTime(inc.created_at, {showStandard: false})}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </DataTable>
                </Panel>

                <Panel
                    className="xl:col-span-4"
                    title="MITRE ATT&CK Coverage"
                    subtitle="by tactic (aggregated techniques)"
                    testid="dash-heatmap-panel"
                    actions={
                        <HelpTip title={DASH_TIPS.heatmap.title} body={DASH_TIPS.heatmap.body} align="end"/>
                    }
                >
                    <AttackHeatmap counts={kpis?.attack_heatmap || {}}/>
                </Panel>
            </div>
        </div>
    );
}
