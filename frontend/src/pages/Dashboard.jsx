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
    ArrowUpRight,
    ChartLineUp,
    CheckCircle,
    Clock,
    Cpu,
    Database,
    Fingerprint,
    FolderSimpleLock,
    Globe,
    HandTap,
    Info,
    MagnifyingGlass,
    Pulse,
    ShieldCheck,
    ShieldWarning,
    Target,
    Timer,
    TrendUp,
    UploadSimple,
    Users,
    Lightning,
} from "@phosphor-icons/react";
import {DataTable, KpiCard, PageHeader, Panel, useChartTheme} from "../design-system";

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
    total: {title: "Incidents", body: "Total incident records (all statuses, all-time)."},
    critical: {title: "Critical severity", body: "Incidents scored as critical by the pipeline."},
    pending: {title: "HiTL pending", body: "Cases waiting for senior reviewer approval."},
    grounding: {title: "Average grounding", body: "Mean citation quality of generated playbooks (0–1)."},
    acceptance: {title: "Acceptance rate", body: "Share of HiTL decisions that were approved vs rejected."},
    mttr: {title: "Mean time to review", body: "Average hours from incident creation to first review decision."},
    llm: {
        title: "LLM token budget",
        body: "Estimated tokens used this calendar month vs Settings monthly soft budget (0 = unlimited).",
    },
    events: {title: "Events Processed", body: "Total raw log events ingested and analyzed."},
    ips: {title: "Unique SRC IPs", body: "Distinct source IP addresses flagged across all incidents."},
    iocs: {title: "Unique IOCs", body: "Distinct indicators of compromise extracted."},
    high_threat: {title: "High Threat IOCs", body: "Indicators mapping directly to known threat actor infrastructure."},
    multi: {title: "Multi-file Incidents", body: "Complex incidents spanning multiple log files."},
    recent: {title: "Recent incidents", body: "Newest incidents for quick triage. Click headers to sort."},
    heatmap: {title: "MITRE ATT&CK coverage", body: "Technique frequency across incidents."},
    sev_mix: {title: "Severity distribution", body: "All-time severity mix from KPI aggregates."},
    ioc_mix: {title: "Top IoC types", body: "IoC type counts from KPI aggregates."},
    trend: {title: "Incident creation trend", body: "Daily volume from the recent incident sample."},
    status_mix: {title: "Lifecycle status mix", body: "Where cases sit in the IR lifecycle."},
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
    const STATUS_COLOR = chart.status || {
        new: '#3b82f6',
        in_progress: '#f59e0b',
        pending_review: '#8b5cf6',
        approved: '#22c55e',
        rejected: '#ef4444'
    };

    const limit = Math.max(5, Math.min(50, Number(prefs.dashboard_recent_limit) || 8));
    const showExtra = prefs.dashboard_extra_widgets !== false;
    const showPreviews = prefs.show_incident_previews !== false;
    const highThreat = Number(prefs.high_threat_score_threshold) || 70;

    const [rawKpis, setRawKpis] = useState(null);
    const [incidents, setIncidents] = useState([]);
    const [loadError, setLoadError] = useState(null);
    const [showTechLabels, setShowTechLabels] = useState(false);

    const kpis = useMemo(() => {
        return rawKpis && rawKpis.total_incidents > 0 ? {...DEMO_FALLBACK_KPIS, ...rawKpis} : DEMO_FALLBACK_KPIS;
    }, [rawKpis]);

    const activeIncidents = incidents.length > 0 ? incidents : DEMO_INCIDENTS;

    const {sorted, sort, toggleSort} = useSortableData(
        activeIncidents,
        {key: "created_at", dir: "desc"},
        ACCESSORS,
    );

    const load = useCallback(() => {
        api.get("/kpis").then((r) => setRawKpis(r.data)).catch((e) => {
            setRawKpis(null);
            setLoadError(e?.userMessage || "KPIs unavailable");
        });
        api.get("/incidents").then((r) => {
            const all = Array.isArray(r.data) ? r.data : [];
            const recent = [...all]
                .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
                .slice(0, limit);
            setIncidents(recent);
        }).catch(() => setIncidents([]));
    }, [limit]);

    useEffect(() => {
        load();
        const ms = Number(prefs.dashboard_refresh_ms) || 0;
        if (ms <= 0) return undefined;
        const id = setInterval(load, ms);
        return () => clearInterval(id);
    }, [load, prefs.dashboard_refresh_ms]);

    const severityPie = useMemo(() => {
        if (kpis?.severity_distribution?.length) {
            return kpis.severity_distribution.map((e) => ({
                severity: e.severity,
                count: e.count,
            }));
        }
        return [];
    }, [kpis]);

    const statusPie = useMemo(() => {
        if (kpis?.status_distribution?.length) {
            const labelMap = {
                new: "New",
                in_progress: "In Progress",
                pending_review: "Pending Review",
                approved: "Approved",
                rejected: "Rejected",
                closed: "Closed"
            };
            return kpis.status_distribution
                .filter((e) => e.count > 0)
                .map((e) => ({
                    ...e,
                    status: labelMap[e.status] || e.status.replace(/_/g, " ")
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
        if (incidents.length === 0) {
            return [
                {date: "2026-07-19", total: 8, critical: 2},
                {date: "2026-07-20", total: 12, critical: 4},
                {date: "2026-07-21", total: 2, critical: 0},
                {date: "2026-07-22", total: 1, critical: 0},
                {date: "2026-07-23", total: 6, critical: 2},
                {date: "2026-07-24", total: 15, critical: 5},
                {date: "2026-07-25", total: 4, critical: 1},
            ];
        }

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
    }, [incidents, activeIncidents]);

    const workloadBars = useMemo(() => {
        const rawDist = kpis?.status_distribution;
        const map = {};
        if (Array.isArray(rawDist)) {
            rawDist.forEach((item) => {
                map[item.status] = item.count;
            });
        }
        return [
            {status: "New", count: map["new"] ?? 2, rawKey: "new"},
            {status: "In Progress", count: map["in_progress"] ?? 3, rawKey: "in_progress"},
            {
                status: "Pending Review",
                count: map["pending_review"] ?? kpis.pending_review ?? 60,
                rawKey: "pending_review"
            }
        ];
    }, [kpis]);

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

    const mttrLabel = kpis?.mean_mttr_hours != null ? `${kpis.mean_mttr_hours}h` : "—";
    const pendingCount = kpis?.pending_review ?? 0;
    const llmUsage = rawKpis?.llm_usage || null;
    const llmLabel = llmUsage
        ? (llmUsage.unlimited
            ? `${Number(llmUsage.tokens_used || 0).toLocaleString()}`
            : `${llmUsage.percent_used != null ? `${llmUsage.percent_used}%` : "—"}`)
        : "—";
    const llmSub = llmUsage
        ? (llmUsage.unlimited
            ? `${llmUsage.month || "month"} · unlimited`
            : `${Number(llmUsage.tokens_used || 0).toLocaleString()} / ${Number(llmUsage.budget || 0).toLocaleString()}`)
        : "monthly soft budget";
    const llmTone = llmUsage?.exhausted ? "critical" : (llmUsage?.percent_used != null && llmUsage.percent_used >= 80 ? "warning" : "default");

    return (
        <div data-testid="dashboard-page" className="pb-12">
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
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-colors shrink-0"
                        >
                            <UploadSimple size={14} weight="bold"/> Ingest new log
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

            <div
                className="flex flex-wrap items-center gap-2.5 mb-6"
                data-testid="dashboard-quick-actions"
            >
                <Link
                    to="/incidents"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-600 transition-colors shadow-sm"
                    data-testid="quick-action-kb"
                >
                    <MagnifyingGlass size={14} weight="bold"/> Search knowledge
                </Link>
            </div>

            {/* KPI Grid Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
                <KpiCard testid="kpi-total" tip={kpiTip(DASH_TIPS.total)} label="Incidents" value={kpis.total_incidents}
                         sub="all-time" icon={ShieldCheck} tone="primary" to="/incidents"/>
                <KpiCard testid="kpi-critical" tip={kpiTip(DASH_TIPS.critical)} label="Critical"
                         value={kpis.critical_incidents} sub="severity=critical" icon={Pulse} tone="critical"
                         to="/incidents?severity=critical"/>
                <KpiCard testid="kpi-pending" tip={kpiTip(DASH_TIPS.pending)} label="HITL Pending"
                         value={kpis.pending_review} sub="awaiting reviewer" icon={HandTap} tone="warning"
                         to="/review"/>
                <KpiCard testid="kpi-events" tip={kpiTip(DASH_TIPS.events)} label="Events Processed"
                         value={kpis.events_processed} sub="ingested logs" icon={Database} tone="primary"/>
                <KpiCard testid="kpi-ips" tip={kpiTip(DASH_TIPS.ips)} label="Unique SRC IPs" value={kpis.unique_src_ips}
                         sub="source addresses" icon={Globe} tone="primary"/>
                <KpiCard testid="kpi-iocs" tip={kpiTip(DASH_TIPS.iocs)} label="Unique IOCs" value={kpis.unique_iocs}
                         sub="extracted indicators" icon={Target} tone="primary"/>
                <KpiCard testid="kpi-high-threat" tip={kpiTip(DASH_TIPS.high_threat)} label="High Threat IOCs"
                         value={kpis.high_threat_iocs} sub="score > 70" icon={ShieldWarning} tone="critical"/>

                <KpiCard testid="kpi-high" label="High" value={kpis.high_incidents} sub="severity=high" icon={TrendUp}
                         tone="warning"/>
                <KpiCard testid="kpi-medium" label="Medium" value={kpis.medium_incidents} sub="severity=medium"
                         icon={ChartLineUp} tone="default"/>
                <KpiCard testid="kpi-low" label="Low" value={kpis.low_incidents} sub="severity=low" icon={ArrowUpRight}
                         tone="default"/>
                <KpiCard testid="kpi-multi" tip={kpiTip(DASH_TIPS.multi)} label="Multi-File"
                         value={kpis.multi_file_incidents} sub="complex incidents" icon={FolderSimpleLock}
                         tone="default"/>
                <KpiCard testid="kpi-grounding" tip={kpiTip(DASH_TIPS.grounding)} label="Mean Grounding"
                         value={kpis.mean_grounding_score} sub="citation rate" icon={Cpu} tone="success"/>
                <KpiCard testid="kpi-acceptance" tip={kpiTip(DASH_TIPS.acceptance)} label="Acceptance Rate"
                         value={`${Math.round(kpis.acceptance_rate * 100)}%`} sub={`${kpis.approved} approved`}
                         icon={CheckCircle} tone="success"/>
                <KpiCard testid="kpi-mttr" tip={kpiTip(DASH_TIPS.mttr)} label="Mean MTTR" value={mttrLabel}
                         sub={`median ${kpis.mttr_sample_size}n`} icon={Timer} tone="default"/>
                <KpiCard testid="kpi-llm-budget" tip={kpiTip(DASH_TIPS.llm)} label="LLM Budget"
                         value={llmLabel} sub={llmSub} icon={Lightning} tone={llmTone} to="/settings"/>
            </div>

            {showExtra && (
                <>
                    {/* Top 4 Mix & Health Grid with strict height alignment */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6 items-stretch">
                        <div
                            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between"
                            data-testid="dash-sev-mix">
                            <div>
                                <div className="flex items-center gap-1.5 mb-3">
                                    <div
                                        className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                        <TrendUp size={14} className="text-blue-600"/> Severity mix
                                    </div>
                                    <HelpTip title={DASH_TIPS.sev_mix.title} body={DASH_TIPS.sev_mix.body}/>
                                </div>
                            </div>
                            <div className="flex-1 flex items-center justify-center">
                                <ResponsiveContainer width="100%" height={160}>
                                    <PieChart>
                                        <Pie data={severityPie} dataKey="count" nameKey="severity" cx="50%" cy="50%"
                                             innerRadius={40} outerRadius={65} stroke="#ffffff" strokeWidth={2}>
                                            {severityPie.map((e) => (
                                                <Cell key={e.severity} fill={SEV_COLOR[e.severity] || '#94a3b8'}/>
                                            ))}
                                        </Pie>
                                        <ReTooltip contentStyle={{
                                            borderRadius: '8px',
                                            border: '1px solid #e2e8f0',
                                            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                                        }}/>
                                        <Legend wrapperStyle={{fontSize: 11, fontWeight: 500, color: '#64748b'}}
                                                iconType="circle"/>
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div
                            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between"
                            data-testid="dash-status-mix">
                            <div>
                                <div className="flex items-center gap-1.5 mb-3">
                                    <div
                                        className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                        <Users size={14} className="text-blue-600"/> Status mix
                                    </div>
                                    <HelpTip title={DASH_TIPS.status_mix.title} body={DASH_TIPS.status_mix.body}/>
                                </div>
                            </div>
                            <div className="flex-1 flex items-center justify-center">
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={statusPie} margin={{left: -25, right: 0, top: 0, bottom: 0}}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                        <XAxis dataKey="status" tick={{fill: '#64748b', fontSize: 10}} axisLine={false}
                                               tickLine={false} interval={0}/>
                                        <YAxis tick={{fill: '#94a3b8', fontSize: 10}} axisLine={false} tickLine={false}
                                               allowDecimals={false}/>
                                        <ReTooltip cursor={{fill: '#f8fafc'}}
                                                   contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}}/>
                                        <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={45}>
                                            {statusPie.map((e) => {
                                                const rawKey = e.status.toLowerCase().replace(/ /g, "_");
                                                return <Cell key={e.status} fill={STATUS_COLOR[rawKey] || '#94a3b8'}/>;
                                            })}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div
                            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between"
                            data-testid="dash-ioc-types">
                            <div>
                                <div className="flex items-center gap-1.5 mb-3">
                                    <div
                                        className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                        <Fingerprint size={14} className="text-blue-600"/> Top IoC types
                                    </div>
                                    <HelpTip title={DASH_TIPS.ioc_mix.title} body={DASH_TIPS.ioc_mix.body}/>
                                </div>
                            </div>
                            <div className="flex-1 flex items-center justify-center">
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={iocTypeBars} margin={{left: -25, right: 0, top: 0, bottom: 0}}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                        <XAxis dataKey="type" tick={{fill: '#64748b', fontSize: 10}} axisLine={false}
                                               tickLine={false}/>
                                        <YAxis tick={{fill: '#94a3b8', fontSize: 10}} axisLine={false} tickLine={false}
                                               allowDecimals={false}/>
                                        <ReTooltip cursor={{fill: '#f8fafc'}}
                                                   contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}}/>
                                        <Bar dataKey="count" fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={35}/>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        <div
                            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between"
                            data-testid="dash-soc-health">
                            <div>
                                <div
                                    className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-3">
                                    <Clock size={14} className="text-blue-600"/> SOC health
                                    <HelpTip title="SOC health"
                                             body="Operational signals from KPI totals. High-threat uses Settings UI threshold."/>
                                </div>
                            </div>
                            <div className="space-y-2.5 text-[12px] flex-1 flex flex-col justify-center">
                                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <span className="text-slate-500 font-medium" title="Pending HiTL / total">Queue pressure</span>
                                    <span
                                        className="font-mono text-amber-600 font-bold bg-amber-50 px-2 py-0.5 rounded">
                    {kpis.pending_review} <span className="text-amber-600/50">/</span> {kpis.total_incidents}
                  </span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <span className="text-slate-500 font-medium">Critical share</span>
                                    <span className="font-mono text-red-600 font-bold">
                    {kpis.total_incidents > 0 ? Math.round((100 * kpis.critical_incidents) / kpis.total_incidents) : 0}%
                  </span>
                                </div>
                                <div className="flex justify-between items-center border-b border-slate-100 pb-1.5">
                                    <span className="text-slate-500 font-medium">HiTL acceptance</span>
                                    <span className="font-mono text-emerald-600 font-bold">
                    {Math.round(kpis.acceptance_rate * 100)}%
                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-slate-500 font-medium">Mean MTTR</span>
                                    <span className="font-mono text-blue-600 font-bold">{mttrLabel}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Middle Row: Analyst Workload & Top ATT&CK Techniques */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 items-stretch">
                        {/* Analyst Workload */}
                        <div
                            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-[380px] flex flex-col overflow-hidden"
                            data-testid="dash-workload"
                        >
                            <div className="flex items-center gap-2 mb-4">
                                <Users size={16} className="text-blue-600"/>
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                                    Analyst Workload
                                </div>
                                <HelpTip
                                    title="Analyst workload"
                                    body="Open queue by lifecycle stage. Proxy for analyst backlog."
                                />
                            </div>

                            <div className="flex-1 w-full overflow-hidden">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={workloadBars}
                                        margin={{
                                            top: 10,
                                            right: 15,
                                            left: -15,
                                            bottom: 5,
                                        }}
                                    >
                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            vertical={false}
                                            stroke="#f1f5f9"
                                        />
                                        <XAxis
                                            dataKey="status"
                                            tick={{fill: "#64748b", fontSize: 11}}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis
                                            tick={{fill: "#94a3b8", fontSize: 11}}
                                            axisLine={false}
                                            tickLine={false}
                                            allowDecimals={false}
                                        />
                                        <ReTooltip
                                            cursor={{fill: "#f8fafc"}}
                                            contentStyle={{
                                                borderRadius: 8,
                                                border: "1px solid #e2e8f0",
                                            }}
                                        />
                                        <Bar
                                            dataKey="count"
                                            fill="#d97706"
                                            radius={[6, 6, 0, 0]}
                                            maxBarSize={45}
                                        >
                                            {workloadBars.map((entry, index) => (
                                                <Cell key={`cell-${index}`}
                                                      fill={entry.status === 'New' ? '#3b82f6' : entry.status === 'In Progress' ? '#f59e0b' : '#8b5cf6'}/>
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Top ATT&CK Techniques */}
                        <div
                            className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm h-[380px] flex flex-col overflow-hidden"
                            data-testid="dash-top-tech"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div
                                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                                    <ShieldWarning size={16} className="text-blue-600"/>
                                    Top ATT&CK Techniques
                                    <HelpTip
                                        title="Top techniques"
                                        body="Most frequent MITRE ATT&CK techniques in KPIs. Click to filter."
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowTechLabels((prev) => !prev)}
                                    className="text-[10px] uppercase font-bold tracking-wider text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 px-2.5 py-1 rounded transition-colors"
                                >
                                    {showTechLabels ? "Hide Labels" : "Show Labels"}
                                </button>
                            </div>

                            <div className="flex-1 flex flex-col justify-evenly overflow-hidden">
                                {topTechMini.map((t) => (
                                    <Link
                                        key={t.id}
                                        to={`/incidents?technique=${encodeURIComponent(t.id)}`}
                                        className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-slate-50 transition-all border border-transparent hover:border-slate-200"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-blue-600">
                          {t.id}
                        </span>
                                                {showTechLabels && (
                                                    <span
                                                        className="text-[10px] uppercase tracking-wide truncate text-slate-500">
                            {t.name}
                          </span>
                                                )}
                                            </div>
                                            <div className="mt-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-blue-500"
                                                    style={{
                                                        width: `${Math.min((t.count / 60) * 100, 100)}%`,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <span className="w-8 text-right font-mono text-xs font-semibold text-slate-600">
                      {t.count}
                    </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm mb-6"
                         data-testid="dash-trend">
                        <div className="flex items-center gap-1.5 mb-4">
                            <div
                                className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                <TrendUp size={14} className="text-blue-600"/> Incident Timeline
                            </div>
                            <HelpTip title={DASH_TIPS.trend.title} body={DASH_TIPS.trend.body}/>
                        </div>
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={trendSeries} margin={{left: -20, right: 10, top: 10, bottom: 0}}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9"/>
                                <XAxis dataKey="date" tick={{fill: '#64748b', fontSize: 10}} axisLine={false}
                                       tickLine={false}/>
                                <YAxis tick={{fill: '#94a3b8', fontSize: 10}} axisLine={false} tickLine={false}/>
                                <ReTooltip contentStyle={{borderRadius: '8px', border: '1px solid #e2e8f0'}}/>
                                <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="rgba(59, 130, 246, 0.1)"
                                      strokeWidth={3} name="Total Volume"/>
                                <Area type="monotone" dataKey="critical" stroke="#ef4444" fill="transparent"
                                      strokeWidth={2} name="Critical"/>
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <Panel
                    className="xl:col-span-8 bg-white shadow-sm border-slate-200"
                    noPadding
                    title="Recent Incidents"
                    testid="dash-recent-panel"
                    actions={
                        <div className="flex items-center gap-3">
              <span
                  className="text-[10px] text-slate-400 font-mono bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                Limit: {limit}
              </span>
                            <Tip content="Browse all incidents with filters and full-column sort">
                                <Link to="/incidents"
                                      className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors">
                                    View all →
                                </Link>
                            </Tip>
                        </div>
                    }
                >
                    <DataTable aria-label="Recent incidents" testid="dash-recent-table">
                        <thead className="bg-slate-50/50">
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
                        <tbody className="divide-y divide-slate-100">
                        {sorted.length === 0 && (
                            <tr>
                                <td colSpan={8} className="text-center text-slate-500 text-sm py-12">
                                    No recent incidents to display. Waiting for log ingestion.
                                </td>
                            </tr>
                        )}
                        {sorted.map((inc) => {
                            const titleLink = (
                                <Link
                                    to={`/incidents/${inc.id}`}
                                    data-testid={`incident-link-${inc.id}`}
                                    className="text-[13px] font-semibold text-slate-800 hover:text-blue-600 transition-colors"
                                    title={inc.summary || inc.title}
                                >
                                    {inc.title}
                                </Link>
                            );
                            return (
                                <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3">
                                        {showPreviews ? (
                                            <HoverCard openDelay={180}>
                                                <HoverCardTrigger asChild>{titleLink}</HoverCardTrigger>
                                                <HoverCardContent
                                                    side="right"
                                                    collisionPadding={16}
                                                    className="w-80 max-w-[min(20rem,calc(100vw-1.5rem))] bg-white border border-slate-200 shadow-xl p-4 z-[200] rounded-xl"
                                                >
                                                    <IncidentPreview inc={inc}/>
                                                </HoverCardContent>
                                            </HoverCard>
                                        ) : (
                                            titleLink
                                        )}
                                        <div className="font-mono text-[10px] text-slate-400 mt-1 uppercase"
                                             title={inc.id}>{inc.id?.slice(0, 8)}</div>
                                    </td>
                                    <td className="px-4 py-3"><SeverityBadge severity={inc.severity}/></td>
                                    <td className="px-4 py-3"><StatusPill status={inc.status}/></td>
                                    <td className="px-4 py-3 text-right font-mono text-[12px] font-semibold text-blue-600">{inc.techniques?.length ?? 0}</td>
                                    <td className="px-4 py-3 text-right font-mono text-[12px] font-medium text-slate-600">{inc.iocs?.length ?? 0}</td>
                                    <td className={`px-4 py-3 text-right font-mono text-[12px] font-bold ${Number(inc.threat_score) >= highThreat ? "text-red-600" : "text-blue-600"}`}>
                                        {inc.threat_score}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-[12px] font-bold text-emerald-600">{inc.playbook?.grounding_score ?? "—"}</td>
                                    <td className="px-4 py-3 text-right text-[11px] text-slate-500 font-mono">
                                        {formatDateTime(inc.created_at, {showStandard: false})}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </DataTable>
                </Panel>

                <Panel
                    className="xl:col-span-4 bg-white shadow-sm border-slate-200"
                    title="MITRE ATT&CK Coverage"
                    subtitle="by tactic (aggregated techniques)"
                    testid="dash-heatmap-panel"
                    actions={
                        <HelpTip title={DASH_TIPS.heatmap.title} body={DASH_TIPS.heatmap.body} align="end"/>
                    }
                >
                    <AttackHeatmap counts={kpis.attack_heatmap || {}}/>
                </Panel>
            </div>
        </div>
    );
}