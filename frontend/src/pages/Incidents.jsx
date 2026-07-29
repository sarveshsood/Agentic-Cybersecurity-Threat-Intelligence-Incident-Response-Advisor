import {useCallback, useEffect, useMemo, useState} from "react";
import {Link, useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {SeverityBadge, StatusPill} from "../components/SeverityBadge";
import {ListState} from "../components/ListState";
import {HelpTip, PaneLabel, Tip} from "../components/HelpTip";
import {SortableTh} from "../components/SortableTh";
import {IncidentPreview} from "../components/IncidentPreview";
import {PaginationBar} from "../components/PaginationBar";
import {useSortableData} from "../hooks/useSortableData";
import {formatDateTime, loadUiPrefs, parseSortSpec} from "../lib/uiPrefs";
import {downloadCsv} from "../lib/exportCsv";
import {DataTable, PageHeader} from "../design-system";
import {HoverCard, HoverCardContent, HoverCardTrigger} from "../components/ui/hover-card";
import {
    ArrowsClockwise,
    Crosshair,
    DownloadSimple,
    MagnifyingGlass,
    ShieldCheck,
    ShieldWarning,
    UploadSimple,
    Warning,
} from "@phosphor-icons/react";
import {toast} from "sonner";
import {isFeatureEnabled} from "../lib/features";
import SavedFiltersBar from "../components/collab/SavedFiltersBar";
import PinButton from "../components/collab/PinButton";

const ACCESSORS = {
    title: (r) => r.title || "",
    severity: (r) => {
        const map = {critical: 4, high: 3, medium: 2, low: 1};
        return map[(r.severity || "").toLowerCase()] || 0;
    },
    status: (r) => r.status || "",
    threat_score: (r) => Number(r.threat_score || 0),
    grounding: (r) => Number(r.playbook?.grounding_score) || -1,
    techniques: (r) => (Array.isArray(r.techniques) ? r.techniques.length : 0),
    iocs: (r) => (Array.isArray(r.iocs) ? r.iocs.length : 0),
    created_at: (r) => new Date(r.created_at || 0).getTime(),
};

const STATUS_OPTIONS = [
    {value: "", label: "All statuses"},
    {value: "new", label: "New"},
    {value: "in_progress", label: "In progress"},
    {value: "pending_review", label: "Pending review"},
    {value: "approved", label: "Approved"},
    {value: "rejected", label: "Rejected"},
    {value: "closed", label: "Closed"},
];

const SEVERITY_OPTIONS = [
    {value: "", label: "All severities"},
    {value: "critical", label: "Critical"},
    {value: "high", label: "High"},
    {value: "medium", label: "Medium"},
    {value: "low", label: "Low"},
];

const THREAT_PRESETS = [
    {value: "", label: "Any threat"},
    {value: "40", label: "Threat ≥ 40"},
    {value: "70", label: "Threat ≥ 70"},
    {value: "85", label: "Threat ≥ 85"},
];

function techCount(inc) {
    return Array.isArray(inc.techniques) ? inc.techniques.length : 0;
}

function iocCount(inc) {
    return Array.isArray(inc.iocs) ? inc.iocs.length : 0;
}

function techListTip(inc) {
    const ids = (inc.techniques || [])
        .map((t) => (typeof t === "string" ? t : t?.technique_id || t?.id || ""))
        .filter(Boolean)
        .slice(0, 8);
    return ids.length ? ids.join(", ") : "No ATT&CK techniques mapped";
}

function ageLabel(iso) {
    if (!iso) return null;
    const ms = Date.now() - new Date(iso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 48) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success("Incident ID copied");
    } catch {
        toast.error("Could not copy ID");
    }
}

export default function Incidents() {
    const prefs = loadUiPrefs();
    const [searchParams, setSearchParams] = useSearchParams();
    const highThreatDefault = Number(prefs.high_threat_score_threshold) || 70;
    const groundingThreshold = Number(prefs.grounding_threshold) || 0.7;
    const showPreviews = prefs.show_incident_previews !== false;

    const [incidents, setIncidents] = useState([]);
    const [serverTotal, setServerTotal] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const [q, setQ] = useState(searchParams.get("q") || "");
    const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
    const [severityFilter, setSeverityFilter] = useState(searchParams.get("severity") || "");
    const [techniqueFilter, setTechniqueFilter] = useState(searchParams.get("technique") || "");
    const [minThreat, setMinThreat] = useState(searchParams.get("min_threat") || "");
    const [hitlOnly, setHitlOnly] = useState(searchParams.get("hitl") === "1");
    const [assigneeFilter, setAssigneeFilter] = useState(searchParams.get("assignee") || "");
    const [unassignedOnly, setUnassignedOnly] = useState(searchParams.get("unassigned") === "1");
    const [page, setPage] = useState(1);

    const pageSize = 25;
    const compact = prefs.compact_tables;
    // Server-side page when no free-text search and no client-only filters
    const clientOnlyFilters = Boolean(q.trim() || minThreat || hitlOnly);
    const serverPaged = !clientOnlyFilters;

    const initialSort = parseSortSpec(prefs.incidents_default_sort) || {key: "created_at", dir: "desc"};
    const {sorted, sort, toggleSort} = useSortableData(incidents, initialSort, ACCESSORS);

    const loadList = useCallback(() => {
        setLoading(true);
        const params = {
            include_meta: true,
            limit: serverPaged ? pageSize : 200,
            skip: serverPaged ? (page - 1) * pageSize : 0,
        };
        if (statusFilter) params.status = statusFilter;
        if (severityFilter) params.severity = severityFilter;
        if (techniqueFilter.trim()) params.technique = techniqueFilter.trim();
        if (assigneeFilter) params.assignee = assigneeFilter;
        if (unassignedOnly) params.unassigned = true;
        api
            .get("/incidents", {params})
            .then((r) => {
                const list = Array.isArray(r.data) ? r.data : r.data?.items || [];
                setIncidents(list);
                setServerTotal(typeof r.data?.total === "number" ? r.data.total : null);
                setLoadError(null);
            })
            .catch((e) => {
                setIncidents([]);
                setServerTotal(null);
                setLoadError(e?.userMessage || e?.response?.data?.detail || "Could not load incidents list.");
            })
            .finally(() => setLoading(false));
    }, [statusFilter, severityFilter, techniqueFilter, assigneeFilter, unassignedOnly, page, serverPaged]);

    useEffect(() => {
        loadList();
    }, [loadList, refreshKey]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setPage(1);
    }, [statusFilter, severityFilter, techniqueFilter, assigneeFilter, unassignedOnly, q, minThreat, hitlOnly]);

    // Keep filters in the URL so dashboard/heatmap deep links work
    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        const sync = (key, val) => {
            if (val && String(val).trim()) next.set(key, String(val).trim());
            else next.delete(key);
        };
        sync("q", q);
        sync("status", statusFilter);
        sync("severity", severityFilter);
        sync("technique", techniqueFilter);
        sync("assignee", assigneeFilter);
        if (unassignedOnly) next.set("unassigned", "1");
        else next.delete("unassigned");
        sync("min_threat", minThreat);
        if (hitlOnly) next.set("hitl", "1");
        else next.delete("hitl");
        setSearchParams(next, {replace: true});
        // eslint-disable-next-line react-hooks/exhaustive-deps -- only push when filter values change
    }, [q, statusFilter, severityFilter, techniqueFilter, assigneeFilter, unassignedOnly, minThreat, hitlOnly]);

    const filtered = useMemo(() => {
        let list = [...sorted];
        if (!serverPaged) {
            if (statusFilter) {
                list = list.filter((i) => (i.status || "").toLowerCase() === statusFilter.toLowerCase());
            }
            if (severityFilter) {
                list = list.filter((i) => (i.severity || "").toLowerCase() === severityFilter.toLowerCase());
            }
            const techNeedle = techniqueFilter.trim().toUpperCase();
            if (techNeedle) {
                list = list.filter((i) => {
                    const techs = i.techniques || [];
                    return techs.some((t) => {
                        const id = typeof t === "string" ? t : t?.technique_id || t?.id || "";
                        return String(id).toUpperCase().includes(techNeedle);
                    });
                });
            }
        }
        const needle = q.trim().toLowerCase();
        if (needle) {
            list = list.filter((i) => {
                const techIds = (i.techniques || [])
                    .map((t) => (typeof t === "string" ? t : t?.technique_id || t?.id || ""))
                    .join(" ");
                const hay = [i.id, i.title, i.summary, i.severity, i.status, techIds].join(" ").toLowerCase();
                return hay.includes(needle);
            });
        }
        const minT = Number(minThreat);
        if (!Number.isNaN(minT) && minThreat !== "") {
            list = list.filter((i) => Number(i.threat_score || 0) >= minT);
        }
        if (hitlOnly) {
            list = list.filter(
                (i) =>
                    i.hitl_required ||
                    (i.status || "").toLowerCase() === "pending_review",
            );
        }
        return list;
    }, [sorted, statusFilter, severityFilter, techniqueFilter, q, serverPaged, minThreat, hitlOnly]);

    const totalCount =
        serverPaged && serverTotal != null && !minThreat && !hitlOnly
            ? serverTotal
            : filtered.length;

    const pageRows = useMemo(() => {
        if (serverPaged && !minThreat && !hitlOnly) {
            return filtered;
        }
        const start = (page - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, page, pageSize, serverPaged, minThreat, hitlOnly]);

    /** Snapshot of current page (or filtered set) for triage chips — not a full-tenant cert. */
    const triage = useMemo(() => {
        const base = filtered;
        const crit = base.filter((i) => (i.severity || "").toLowerCase() === "critical").length;
        const high = base.filter((i) => (i.severity || "").toLowerCase() === "high").length;
        const pending = base.filter((i) => (i.status || "").toLowerCase() === "pending_review").length;
        const hot = base.filter((i) => Number(i.threat_score || 0) >= highThreatDefault).length;
        const lowG = base.filter((i) => {
            const g = Number(i.playbook?.grounding_score);
            return Number.isFinite(g) && g < groundingThreshold;
        }).length;
        return {crit, high, pending, hot, lowG, n: base.length};
    }, [filtered, highThreatDefault, groundingThreshold]);

    const clearFilters = () => {
        setQ("");
        setStatusFilter("");
        setSeverityFilter("");
        setTechniqueFilter("");
        setMinThreat("");
        setHitlOnly(false);
    };

    const hasFilters = Boolean(
        statusFilter || severityFilter || techniqueFilter || q || minThreat || hitlOnly,
    );

    const exportIncidentsCsv = () => {
        const headers = [
            "ID",
            "Title",
            "Severity",
            "Status",
            "Threat Score",
            "Grounding",
            "Techniques",
            "IoCs",
            "HiTL",
            "Created At",
        ];
        const rows = filtered.map((i) => [
            i.id,
            `"${(i.title || "").replace(/"/g, '""')}"`,
            i.severity || "—",
            i.status || "—",
            i.threat_score ?? "—",
            i.playbook?.grounding_score ?? "—",
            techCount(i),
            iocCount(i),
            i.hitl_required || (i.status || "").toLowerCase() === "pending_review" ? "yes" : "no",
            formatDateTime(i.created_at),
        ]);
        downloadCsv(`actira-incidents-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
        toast.success(`Exported ${rows.length} incident record(s).`);
    };

    return (
        <div data-testid="incidents-page" className="w-full flex flex-col min-h-full space-y-4">
            <PageHeader
                testid="incidents-header"
                title="Incident Cases"
                icon={ShieldWarning}
                tip={
                    <HelpTip
                        title="Incident Response Queue"
                        body="Browse, triage, and investigate cases from the ingest pipeline. Open a row for the investigation workspace (timeline, TI, ATT&CK, playbook, HiTL). Hover a title for a quick preview."
                        how="GET /incidents?include_meta=true · server filters for status/severity/technique · search / min-threat / HiTL are client-side on the loaded page window."
                        testid="tip-incidents-page"
                    />
                }
                subtitle={
                    <>
                        Showing {pageRows.length} of {totalCount} case{totalCount === 1 ? "" : "s"}
                        {serverPaged && !minThreat && !hitlOnly
                            ? " · server page"
                            : " · filtered view"}
                        .
                    </>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <Tip content="Reload the incident list from the server">
                            <button
                                type="button"
                                data-testid="incidents-refresh-btn"
                                onClick={() => setRefreshKey((k) => k + 1)}
                                disabled={loading}
                                className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8 disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""}/>
                                Refresh
                            </button>
                        </Tip>
                        <Tip content="Upload logs or multi-file packages to create new incidents">
                            <Link
                                to="/upload"
                                className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8 inline-flex items-center gap-1.5"
                                data-testid="incidents-ingest-cta"
                            >
                                <UploadSimple size={14}/>
                                Ingest
                            </Link>
                        </Tip>
                        <Tip content="Download the current filtered set as CSV (ID, scores, technique/IoC counts)">
                            <button
                                type="button"
                                data-testid="incidents-export-btn"
                                onClick={exportIncidentsCsv}
                                disabled={!filtered.length || loading}
                                className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8 disabled:opacity-50 inline-flex items-center gap-1.5"
                            >
                                <DownloadSimple size={14}/>
                                Export CSV
                            </button>
                        </Tip>
                    </div>
                }
            />

            {/* Triage strip — quick severity/HiTL jumps */}
            {!loading && !loadError && filtered.length > 0 && (
                <div
                    className="flex flex-wrap items-center gap-1.5 text-[11px]"
                    data-testid="incidents-triage-strip"
                >
                    <span className="text-muted-foreground font-semibold uppercase tracking-[0.08em] text-[10px] mr-1 inline-flex items-center gap-1">
                        In view
                        <HelpTip
                            title="Triage strip"
                            body="Counts for the current filtered set only (not a full-tenant KPI). Click a chip to apply that filter."
                            testid="tip-incidents-triage"
                        />
                    </span>
                    <Tip content="Critical severity in the current filtered set — click to filter">
                        <button
                            type="button"
                            data-testid="triage-critical"
                            onClick={() => setSeverityFilter("critical")}
                            className={`px-2 py-1 rounded-md border font-mono leading-none transition-colors ${
                                severityFilter === "critical"
                                    ? "border-error/50 bg-error-soft"
                                    : "border-border bg-card hover:border-error/40"
                            }`}
                        >
                            <span className="text-error font-bold">{triage.crit}</span> critical
                        </button>
                    </Tip>
                    <Tip content="High severity in the current filtered set — click to filter">
                        <button
                            type="button"
                            data-testid="triage-high"
                            onClick={() => setSeverityFilter("high")}
                            className={`px-2 py-1 rounded-md border font-mono leading-none transition-colors ${
                                severityFilter === "high"
                                    ? "border-warning/50 bg-warning-soft"
                                    : "border-border bg-card hover:border-warning/40"
                            }`}
                        >
                            <span className="text-warning font-bold">{triage.high}</span> high
                        </button>
                    </Tip>
                    <Tip content="Cases awaiting senior review (pending_review) — click to filter">
                        <button
                            type="button"
                            data-testid="triage-pending"
                            onClick={() => {
                                setStatusFilter("pending_review");
                                setHitlOnly(false);
                            }}
                            className={`px-2 py-1 rounded-md border font-mono leading-none transition-colors ${
                                statusFilter === "pending_review"
                                    ? "border-primary/50 bg-primary/10"
                                    : "border-border bg-card hover:border-primary/40"
                            }`}
                        >
                            <span className="text-primary font-bold">{triage.pending}</span> HiTL queue
                        </button>
                    </Tip>
                    <Tip content={`Threat score ≥ ${highThreatDefault} (Settings UI threshold) — click to filter`}>
                        <button
                            type="button"
                            data-testid="triage-hot"
                            onClick={() => setMinThreat(String(highThreatDefault))}
                            className={`px-2 py-1 rounded-md border font-mono leading-none transition-colors ${
                                minThreat === String(highThreatDefault)
                                    ? "border-error/50 bg-error-soft"
                                    : "border-border bg-card hover:border-error/40"
                            }`}
                        >
                            <span className="text-error font-bold">{triage.hot}</span> score ≥ {highThreatDefault}
                        </button>
                    </Tip>
                    {triage.lowG > 0 && (
                        <Tip content={`Playbook grounding below ${groundingThreshold} — often forces HiTL`}>
                            <span
                                className="px-2 py-1 rounded-md border border-[var(--warning-border)] bg-warning-soft font-mono text-warning leading-none"
                                data-testid="triage-low-grounding"
                            >
                                <span className="font-bold">{triage.lowG}</span> low grounding
                            </span>
                        </Tip>
                    )}
                    <Tip content="Natural-language hunt over recent incidents (not this list filter)">
                        <Link
                            to="/hunt"
                            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline font-medium text-[11px]"
                            data-testid="incidents-hunt-link"
                        >
                            <Crosshair size={12}/> Hunt instead
                        </Link>
                    </Tip>
                </div>
            )}

            {/* Filter and Search Bar */}
            <div
                className="flex flex-wrap items-center gap-2 text-xs bg-card p-2.5 rounded-lg border border-border shadow-sm sticky top-14 z-10"
                data-testid="incidents-filter-bar"
            >
                <PaneLabel
                    className="text-muted-foreground shrink-0 pl-0.5 !normal-case tracking-[0.08em]"
                    title="List filters"
                    body="Status, severity, and ATT&CK technique use the server when not free-text searching. Search, min threat, and HiTL-only apply on the loaded window (up to 200 rows)."
                    testid="tip-incidents-filters"
                >
                    Filters
                </PaneLabel>
                <Tip content="Search ID, title, summary, and technique ids (client-side on the loaded window)">
                    <div className="relative min-w-[12rem] flex-1 sm:flex-none sm:w-64">
                        <MagnifyingGlass
                            size={13}
                            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                        />
                        <input
                            data-testid="incidents-search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search ID, title, summary, technique…"
                            className="bg-background border border-border pl-8 pr-3 h-8 rounded-md w-full text-[12px] leading-none focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>
                </Tip>

                {isFeatureEnabled("saved_filters") && (
                    <SavedFiltersBar
                        page="incidents"
                        currentFilter={{
                            status: statusFilter || undefined,
                            severity: severityFilter || undefined,
                            technique: techniqueFilter || undefined,
                            assignee: assigneeFilter || undefined,
                            unassigned: unassignedOnly || undefined,
                            client_only: {
                                ...(q.trim() ? {q: q.trim()} : {}),
                                ...(minThreat ? {min_threat: minThreat} : {}),
                                ...(hitlOnly ? {hitl: true} : {}),
                            },
                        }}
                        onApply={(f) => {
                            setStatusFilter(f.status || "");
                            setSeverityFilter(f.severity || "");
                            setTechniqueFilter(f.technique || "");
                            setAssigneeFilter(f.assignee || "");
                            setUnassignedOnly(Boolean(f.unassigned));
                            const co = f.client_only || {};
                            if (co.q != null) setQ(String(co.q));
                            if (co.min_threat != null) setMinThreat(String(co.min_threat));
                            if (co.hitl != null) setHitlOnly(Boolean(co.hitl));
                        }}
                    />
                )}

                <Tip content="Filter by IR lifecycle status (server-side when not free-text searching)">
                    <select
                        data-testid="incidents-filter-status"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className={`bg-background border px-2.5 h-8 rounded-md text-[12px] leading-none ${
                            statusFilter ? "border-primary/50 text-foreground" : "border-border text-foreground"
                        }`}
                    >
                        {STATUS_OPTIONS.map((o) => (
                            <option key={o.value || "all-status"} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </Tip>

                {isFeatureEnabled("collab_assign") && (
                    <>
                        <Tip content="My queue = primary or secondary assignee is you">
                            <select
                                data-testid="incidents-filter-assignee"
                                value={assigneeFilter}
                                onChange={(e) => {
                                    setAssigneeFilter(e.target.value);
                                    if (e.target.value) setUnassignedOnly(false);
                                }}
                                className={`bg-background border px-2.5 h-8 rounded-md text-[12px] leading-none ${
                                    assigneeFilter ? "border-primary/50 text-foreground" : "border-border text-foreground"
                                }`}
                            >
                                <option value="">All assignees</option>
                                <option value="me">Assigned to me</option>
                            </select>
                        </Tip>
                        <Tip content="Both primary and secondary empty">
                            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                <input
                                    type="checkbox"
                                    data-testid="incidents-filter-unassigned"
                                    checked={unassignedOnly}
                                    onChange={(e) => {
                                        setUnassignedOnly(e.target.checked);
                                        if (e.target.checked) setAssigneeFilter("");
                                    }}
                                />
                                Unassigned
                            </label>
                        </Tip>
                    </>
                )}

                <Tip content="Filter by pipeline severity (server-side when not free-text searching)">
                    <select
                        data-testid="incidents-filter-severity"
                        value={severityFilter}
                        onChange={(e) => setSeverityFilter(e.target.value)}
                        className={`bg-background border px-2.5 h-8 rounded-md text-[12px] leading-none ${
                            severityFilter ? "border-primary/50 text-foreground" : "border-border text-foreground"
                        }`}
                    >
                        {SEVERITY_OPTIONS.map((o) => (
                            <option key={o.value || "all-sev"} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </Tip>
                {/* Alias for older e2e selectors */}
                <select
                    data-testid="filter-severity"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                >
                    {SEVERITY_OPTIONS.map((o) => (
                        <option key={`alias-${o.value || "all"}`} value={o.value}>{o.label}</option>
                    ))}
                </select>

                <Tip content="ATT&CK technique id filter (e.g. T1110) — works with dashboard/heatmap deep links">
                    <input
                        data-testid="incidents-filter-technique"
                        value={techniqueFilter}
                        onChange={(e) => setTechniqueFilter(e.target.value)}
                        placeholder="Technique e.g. T1110"
                        className={`bg-background border px-2.5 h-8 rounded-md text-[12px] font-mono w-[9.5rem] leading-none outline-none focus:ring-1 focus:ring-primary ${
                            techniqueFilter.trim() ? "border-primary/50" : "border-border"
                        }`}
                    />
                </Tip>

                <Tip content="Minimum threat score — client filter on the loaded row window">
                    <select
                        data-testid="incidents-filter-threat"
                        value={minThreat}
                        onChange={(e) => setMinThreat(e.target.value)}
                        className={`bg-background border px-2.5 h-8 rounded-md text-[12px] leading-none ${
                            minThreat ? "border-primary/50 text-foreground" : "border-border text-foreground"
                        }`}
                    >
                        {THREAT_PRESETS.map((o) => (
                            <option key={o.value || "any-threat"} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                </Tip>

                <Tip content="Show only HiTL-gated or pending_review cases">
                    <label
                        className={`inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border cursor-pointer select-none transition-colors ${
                            hitlOnly
                                ? "border-warning/50 bg-warning-soft text-warning"
                                : "border-border bg-background text-foreground hover:bg-muted/40"
                        }`}
                    >
                        <input
                            type="checkbox"
                            data-testid="incidents-filter-hitl"
                            checked={hitlOnly}
                            onChange={(e) => setHitlOnly(e.target.checked)}
                            className="rounded border-border"
                        />
                        <span className="text-[11px] font-medium leading-none">HiTL only</span>
                    </label>
                </Tip>

                {hasFilters && (
                    <Tip content="Clear all list filters">
                        <button
                            type="button"
                            data-testid="incidents-clear-filters"
                            onClick={clearFilters}
                            className="px-2.5 h-8 rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/40 text-[12px] font-medium leading-none transition-colors"
                        >
                            Clear
                        </button>
                    </Tip>
                )}
            </div>

            {loadError && (
                <ListState variant="error" testid="incidents-load-error" message={loadError}/>
            )}
            {loading && (
                <ListState variant="loading" testid="incidents-loading" message="Loading incident cases…"/>
            )}
            {!loading && !loadError && filtered.length === 0 && (
                <>
                    <ListState
                        variant="empty"
                        testid="incidents-empty"
                        message={
                            incidents.length || hasFilters
                                ? "No incidents match your filter criteria."
                                : "No incidents ingested yet. Upload log packages to begin."
                        }
                        action={
                            !(incidents.length || hasFilters)
                                ? {to: "/upload", label: "Go to Ingest Logs →"}
                                : null
                        }
                    />
                    {(incidents.length || hasFilters) && (
                        <div className="text-center -mt-2">
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="text-xs text-primary hover:underline"
                                data-testid="incidents-empty-clear"
                            >
                                Clear filters
                            </button>
                        </div>
                    )}
                </>
            )}

            {/* Incidents Table */}
            {!loading && !loadError && filtered.length > 0 && (
                <div
                    className="soc-card overflow-hidden p-0 w-full flex-1 flex flex-col border border-border rounded-lg shadow-sm bg-card"
                >
                    <DataTable
                        className={`w-full flex-1 ${compact ? "text-[12px]" : ""}`}
                        aria-label="Incidents List"
                        testid="incidents-table"
                    >
                        <thead>
                        <tr className="bg-muted/50 border-b border-border">
                            <SortableTh
                                label="Severity"
                                sortKey="severity"
                                sort={sort}
                                onSort={toggleSort}
                                help={{title: "Severity", body: "Pipeline severity: low → critical. Hover the badge for guidance."}}
                            />
                            <SortableTh
                                label="Incident Title & ID"
                                sortKey="title"
                                sort={sort}
                                onSort={toggleSort}
                                className="w-[32%]"
                                help={{
                                    title: "Title & ID",
                                    body: "Human-readable title and stable incident UUID. Hover title for preview; click ID to copy.",
                                }}
                            />
                            <SortableTh
                                label="Status"
                                sortKey="status"
                                sort={sort}
                                onSort={toggleSort}
                                help={{
                                    title: "Status",
                                    body: "IR lifecycle: new, in_progress, pending_review, approved, rejected, closed.",
                                }}
                            />
                            {isFeatureEnabled("collab_assign") && (
                                <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">
                                    Owner
                                </th>
                            )}
                            <SortableTh
                                label="Threat"
                                sortKey="threat_score"
                                sort={sort}
                                onSort={toggleSort}
                                help={{
                                    title: "Threat score",
                                    body: "Composite risk score (0–100) from severity, IoCs, and techniques.",
                                }}
                            />
                            <SortableTh
                                label="Ground"
                                sortKey="grounding"
                                sort={sort}
                                onSort={toggleSort}
                                help={{
                                    title: "Grounding",
                                    body: "Playbook citation quality (0–1). Low scores force HiTL review.",
                                    how: "valid citations / total playbook steps",
                                }}
                            />
                            <SortableTh
                                label="Tech"
                                sortKey="techniques"
                                sort={sort}
                                onSort={toggleSort}
                                help={{
                                    title: "ATT&CK techniques",
                                    body: "Count of mapped MITRE techniques on this case. Hover for technique ids.",
                                }}
                            />
                            <SortableTh
                                label="IoCs"
                                sortKey="iocs"
                                sort={sort}
                                onSort={toggleSort}
                                help={{
                                    title: "Indicators",
                                    body: "Count of extracted IoCs (IPs, domains, hashes, etc.).",
                                }}
                            />
                            <SortableTh
                                label="Created"
                                sortKey="created_at"
                                sort={sort}
                                onSort={toggleSort}
                                help={{
                                    title: "Created",
                                    body: "When the pipeline first persisted this incident (UTC stored; display TZ from UI prefs).",
                                }}
                            />
                            <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs">
                                <span className="inline-flex items-center justify-end gap-1 w-full">
                                    Actions
                                    <HelpTip
                                        title="Row actions"
                                        body="Audit opens the compliance trail filtered to this case. Investigate opens the full workspace."
                                        side="left"
                                        testid="tip-incidents-actions"
                                    />
                                </span>
                            </th>
                        </tr>
                        </thead>
                        <tbody>
                        {pageRows.map((inc) => {
                            const techs = techCount(inc);
                            const iocs = iocCount(inc);
                            const score = Number(inc.threat_score || 0);
                            const grounding = Number(inc.playbook?.grounding_score);
                            const hasGrounding = Number.isFinite(grounding);
                            const lowGrounding = hasGrounding && grounding < groundingThreshold;
                            const age = ageLabel(inc.created_at);
                            const isHitl =
                                inc.hitl_required ||
                                (inc.status || "").toLowerCase() === "pending_review";

                            const titleLink = (
                                <div className="flex items-start gap-1">
                                    {isFeatureEnabled("pins") && (
                                        <PinButton
                                            targetType="incident"
                                            targetId={inc.id}
                                            label={inc.title}
                                            className="mt-0.5"
                                        />
                                    )}
                                    <Link
                                        to={`/incidents/${inc.id}`}
                                        className="font-semibold text-foreground hover:text-primary transition-colors block text-sm leading-snug min-w-0"
                                        data-testid={`incident-link-${inc.id}`}
                                    >
                                        {inc.title || inc.id}
                                    </Link>
                                </div>
                            );

                            const sev = (inc.severity || "").toLowerCase();
                            const rowTint =
                                sev === "critical"
                                    ? "bg-[var(--sev-critical-bg)]/40 hover:bg-[var(--sev-critical-bg)]/70"
                                    : sev === "high"
                                        ? "bg-[var(--sev-high-bg)]/30 hover:bg-[var(--sev-high-bg)]/55"
                                        : "hover:bg-muted/30";

                            return (
                                <tr
                                    key={inc.id}
                                    className={`border-t border-border/60 transition-colors ${rowTint}`}
                                    data-testid={`incident-row-${inc.id}`}
                                >
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                                        <SeverityBadge severity={inc.severity}/>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} min-w-0`}>
                                        {showPreviews ? (
                                            <HoverCard openDelay={180}>
                                                <HoverCardTrigger asChild>{titleLink}</HoverCardTrigger>
                                                <HoverCardContent
                                                    side="right"
                                                    collisionPadding={16}
                                                    className="w-80 max-w-[min(20rem,calc(100vw-1.5rem))] soc-popover p-4 z-[200]"
                                                >
                                                    <IncidentPreview inc={inc}/>
                                                </HoverCardContent>
                                            </HoverCard>
                                        ) : (
                                            titleLink
                                        )}
                                        {inc.summary && !compact && (
                                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1 max-w-md">
                                                {inc.summary}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <Tip content="Click to copy full incident ID">
                                                <button
                                                    type="button"
                                                    className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors"
                                                    onClick={() => copyText(inc.id)}
                                                    data-testid={`copy-id-${inc.id}`}
                                                >
                                                    {inc.id}
                                                </button>
                                            </Tip>
                                            {isHitl && (
                                                <Tip content="Human-in-the-Loop required — senior review or low grounding / high severity gate">
                                                    <span
                                                        className="inline-flex items-center gap-1 text-[9px] text-warning bg-warning-soft px-1.5 py-0.2 rounded border border-[var(--warning-border)] font-semibold uppercase"
                                                    >
                                                        <Warning size={10} weight="fill"/> HiTL
                                                    </span>
                                                </Tip>
                                            )}
                                        </div>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                                        <StatusPill status={inc.status}/>
                                    </td>
                                    {isFeatureEnabled("collab_assign") && (
                                        <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-[11px] font-mono text-muted-foreground`}>
                                            {inc.assignee_email || inc.assignee_id || "—"}
                                        </td>
                                    )}
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                                        <Tip content={`Composite threat score 0–100${score >= highThreatDefault ? ` · high (≥${highThreatDefault})` : ""}`}>
                                            <span
                                                className={`font-mono text-xs font-semibold ${
                                                    score >= 70
                                                        ? "text-error"
                                                        : score >= 40
                                                            ? "text-warning"
                                                            : "text-success"
                                                }`}
                                            >
                                                {inc.threat_score ?? "—"}
                                            </span>
                                        </Tip>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-center`}>
                                        <Tip
                                            content={
                                                hasGrounding
                                                    ? `Playbook grounding ${grounding}${lowGrounding ? ` · below threshold ${groundingThreshold}` : " · healthy"}`
                                                    : "No playbook grounding score yet"
                                            }
                                        >
                                            <span
                                                className={`font-mono text-xs font-semibold ${
                                                    !hasGrounding
                                                        ? "text-muted-foreground"
                                                        : lowGrounding
                                                            ? "text-warning"
                                                            : "text-success"
                                                }`}
                                            >
                                                {hasGrounding ? grounding : "—"}
                                            </span>
                                        </Tip>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-center`}>
                                        <Tip content={techListTip(inc)}>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {techs || "—"}
                                            </span>
                                        </Tip>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-center`}>
                                        <Tip content={`${iocs} extracted indicator(s) of compromise`}>
                                            <span className="font-mono text-xs text-muted-foreground">
                                                {iocs || "—"}
                                            </span>
                                        </Tip>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} whitespace-nowrap`}>
                                        <Tip content={formatDateTime(inc.created_at) || "Unknown created time"}>
                                            <span className="soc-mono text-[11px] text-muted-foreground">
                                                {age || formatDateTime(inc.created_at)}
                                            </span>
                                        </Tip>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-right whitespace-nowrap`}>
                                        <div className="inline-flex items-center gap-1.5">
                                            <Tip content="View compliance audit trail for this incident">
                                                <Link
                                                    to={`/audit?q=${encodeURIComponent(inc.id)}`}
                                                    className="p-1.5 rounded border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors inline-flex items-center"
                                                    data-testid={`audit-link-${inc.id}`}
                                                >
                                                    <ShieldCheck size={14}/>
                                                </Link>
                                            </Tip>
                                            <Tip content="Open investigation workspace (timeline, TI, ATT&CK, playbook)">
                                                <Link
                                                    to={`/incidents/${inc.id}`}
                                                    className="px-2.5 py-1 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                                                    data-testid={`investigate-${inc.id}`}
                                                >
                                                    Investigate
                                                </Link>
                                            </Tip>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </DataTable>
                    <div className="p-3 border-t border-border bg-muted/20">
                        <PaginationBar
                            page={page}
                            pageSize={pageSize}
                            total={totalCount}
                            onPageChange={setPage}
                            testid="incidents-pagination"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
