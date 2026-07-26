import {useEffect, useMemo, useState} from "react";
import {Link, useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {SeverityBadge, StatusPill} from "../components/SeverityBadge";
import {ListState} from "../components/ListState";
import {HelpTip, Tip} from "../components/HelpTip";
import {SortableTh} from "../components/SortableTh";
import {IncidentPreview} from "../components/IncidentPreview";
import {PaginationBar} from "../components/PaginationBar";
import {useSortableData} from "../hooks/useSortableData";
import {formatDateTime, loadUiPrefs, parseSortSpec} from "../lib/uiPrefs";
import {downloadCsv, incidentsToCsvRows} from "../lib/exportCsv";
import {DataTable, PageHeader} from "../design-system";
import {HoverCard, HoverCardContent, HoverCardTrigger,} from "../components/ui/hover-card";
import {DownloadSimple, FunnelSimple, MagnifyingGlass, ShieldWarning, X} from "@phosphor-icons/react";
import {toast} from "sonner";

const COL_HELP = {
    id: {
        title: "ID",
        body: "Stable incident identifier (UUID). Useful when correlating jobs, audit logs, and external tickets."
    },
    title: {
        title: "Title",
        body: "Narrative summary from correlation / top ATT&CK technique. Hover for preview; click to open the full IR case."
    },
    severity: {
        title: "Severity",
        body: "Pipeline severity: low → critical from threat scores, technique count, and critical events."
    },
    status: {title: "Status", body: "Lifecycle: new, pending_review (HiTL), approved, rejected, closed."},
    techniques: {title: "Techniques", body: "Count of MITRE ATT&CK techniques mapped to this incident."},
    iocs: {title: "IoCs", body: "Count of extracted indicators after private-IP filtering and dedup."},
    threat_score: {title: "Threat score", body: "0–100 composite from threat-intel enrichment (live or mock)."},
    grounding: {
        title: "Grounding",
        body: "Playbook citation rate (cited steps / total steps). Low values force HiTL review."
    },
    created_at: {title: "Created", body: "When the pipeline finished and wrote the incident."},
};

const ACCESSORS = {
    id: (r) => r.id || "",
    title: (r) => r.title || "",
    severity: (r) => ({low: 1, medium: 2, high: 3, critical: 4}[r.severity] || 0),
    status: (r) => r.status || "",
    techniques: (r) => r.techniques?.length ?? 0,
    iocs: (r) => r.iocs?.length ?? 0,
    threat_score: (r) => Number(r.threat_score) || 0,
    grounding: (r) => Number(r.playbook?.grounding_score) || -1,
    created_at: (r) => new Date(r.created_at || 0).getTime(),
};

export default function Incidents() {
    const [searchParams, setSearchParams] = useSearchParams();
    const prefs = loadUiPrefs();
    const [items, setItems] = useState([]);
    const [severity, setSeverity] = useState(
        searchParams.get("severity") || prefs.incidents_default_severity || "",
    );
    const [status, setStatus] = useState(prefs.incidents_default_status || "");
    const [minThreat, setMinThreat] = useState(Number(prefs.incidents_min_threat) || 0);
    const [q, setQ] = useState("");
    const [loadError, setLoadError] = useState(null);
    const [page, setPage] = useState(1);
    const technique = (searchParams.get("technique") || "").trim().toUpperCase();
    const showPreviews = prefs.show_incident_previews !== false;
    const highThreat = Number(prefs.high_threat_score_threshold) || 70;
    const pageSize = Math.max(10, Math.min(100, Number(prefs.incidents_page_size) || 25));

    const initialSort = parseSortSpec(prefs.incidents_default_sort) || {key: "created_at", dir: "desc"};
    const {sorted, sort, toggleSort} = useSortableData(items, initialSort, ACCESSORS);

    useEffect(() => {
        const params = new URLSearchParams();
        if (severity) params.set("severity", severity);
        if (status) params.set("status", status);
        if (technique) params.set("technique", technique);
        api
            .get(`/incidents?${params}`)
            .then((r) => {
                setItems(Array.isArray(r.data) ? r.data : []);
                setLoadError(null);
            })
            .catch((e) => {
                setItems([]);
                setLoadError(e?.userMessage || "Could not load incidents");
            });
    }, [severity, status, technique]);

    // Sync severity from URL when deep-linked from dashboard KPI
    useEffect(() => {
        const s = searchParams.get("severity");
        if (s && s !== severity) setSeverity(s);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const filtered = useMemo(() => {
        let list = sorted;
        if (minThreat > 0) {
            list = list.filter((inc) => Number(inc.threat_score) >= minThreat);
        }
        const needle = q.trim().toLowerCase();
        if (needle) {
            list = list.filter((inc) => {
                const hay = [
                    inc.title,
                    inc.id,
                    inc.summary,
                    inc.severity,
                    inc.status,
                    ...(inc.techniques || []).map((t) => `${t.technique_id} ${t.name || ""}`),
                    ...(inc.iocs || []).map((i) => `${i.type || ""} ${i.value || ""}`),
                ]
                    .join(" ")
                    .toLowerCase();
                return hay.includes(needle);
            });
        }
        return list;
    }, [sorted, q, minThreat]);

    // Reset page when filters/sort change
    useEffect(() => {
        setPage(1);
    }, [severity, status, technique, minThreat, q, sort?.key, sort?.dir]);

    const totalFiltered = filtered.length;
    const pageRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, page, pageSize]);

    const clearTechnique = () => {
        const next = new URLSearchParams(searchParams);
        next.delete("technique");
        setSearchParams(next);
    };

    const clearFilters = () => {
        setSeverity("");
        setStatus("");
        setMinThreat(0);
        setQ("");
        clearTechnique();
    };

    const exportRows = () => {
        const {headers, rows} = incidentsToCsvRows(filtered);
        downloadCsv(`actira-incidents-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
        toast.success(`Exported ${rows.length} incident${rows.length === 1 ? "" : "s"}`);
    };

    const compact = prefs.compact_tables;
    const hasFilters = severity || status || minThreat > 0 || q || technique;

    return (
        <div data-testid="incidents-page">
            <PageHeader
                testid="incidents-header"
                title="Incidents"
                icon={ShieldWarning}
                tip={
                    <HelpTip
                        title="Incidents"
                        body="All correlated, scored, and playbook-drafted IR cases. Click column headers to sort (asc → desc → clear); use filters and search to narrow the list."
                        testid="tip-incidents-page"
                    />
                }
                subtitle={
                    <>
                        {totalFiltered} match{items.length !== totalFiltered ? ` of ${items.length}` : ""}.
                        {sort?.key ? ` Sorted by ${sort.key} (${sort.dir}).` : " Click headers to sort."}
                    </>
                }
                actions={
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                        <button
                            type="button"
                            data-testid="incidents-export"
                            onClick={exportRows}
                            disabled={!totalFiltered}
                            className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8"
                            title="Export filtered rows as CSV"
                        >
                            <DownloadSimple size={14}/>
                            Export CSV
                        </button>
                    </div>
                }
            />

            <div className="flex items-center gap-2 text-xs flex-wrap mb-4">
                <div className="relative">
                    <MagnifyingGlass size={12}
                                     className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                    <input
                        data-testid="incidents-search"
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="Search title, id, IoC, technique…"
                        title="Free-text search across title, id, summary, techniques, and IoCs"
                        className="bg-background border border-border pl-7 pr-2 py-1.5 rounded w-52 min-w-[10rem]"
                    />
                </div>
                {technique && (
                    <button
                        type="button"
                        onClick={clearTechnique}
                        data-testid="filter-technique-clear"
                        className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded border border-primary/40 bg-primary/10 text-primary"
                        title="Clear ATT&CK technique filter"
                    >
                        Technique <span className="font-mono">{technique}</span>
                        <X size={12}/>
                    </button>
                )}
                <select
                    data-testid="filter-severity"
                    value={severity}
                    onChange={(e) => {
                        setSeverity(e.target.value);
                        const next = new URLSearchParams(searchParams);
                        if (e.target.value) next.set("severity", e.target.value);
                        else next.delete("severity");
                        setSearchParams(next);
                    }}
                    title="Filter by severity"
                    className="bg-background border border-border px-2 py-1.5 rounded"
                >
                    <option value="">All severity</option>
                    {["low", "medium", "high", "critical"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
                <select
                    data-testid="filter-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    title="Filter by lifecycle status"
                    className="bg-background border border-border px-2 py-1.5 rounded"
                >
                    <option value="">All status</option>
                    {["new", "in_progress", "pending_review", "approved", "rejected", "closed"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
                <label className="inline-flex items-center gap-1.5 text-muted-foreground"
                       title="Hide rows below this threat score">
                    <FunnelSimple size={12}/>
                    <span className="sr-only">Min threat</span>
                    <input
                        data-testid="filter-min-threat"
                        type="number"
                        min={0}
                        max={100}
                        value={minThreat || ""}
                        onChange={(e) => setMinThreat(Math.max(0, parseInt(e.target.value, 10) || 0))}
                        placeholder="Min threat"
                        className="bg-background border border-border px-2 py-1.5 rounded w-20 font-mono"
                    />
                </label>
                {hasFilters && (
                    <Tip content="Clear all filters and search">
                        <button
                            type="button"
                            data-testid="incidents-clear-filters"
                            onClick={clearFilters}
                            className="px-2 py-1.5 rounded border border-border text-muted-foreground hover:text-primary"
                        >
                            Clear
                        </button>
                    </Tip>
                )}
            </div>

            {loadError && (
                <ListState variant="error" testid="incidents-load-error" message={loadError}/>
            )}
            {!loadError && totalFiltered === 0 && (
                <ListState
                    variant="empty"
                    testid="incidents-empty"
                    message="No incidents match your filters."
                    action={{to: "/upload", label: "Ingest logs"}}
                />
            )}

            <div className="soc-card overflow-hidden p-0">
                <DataTable
                    className={compact ? "text-[12px]" : ""}
                    aria-label="Incidents"
                    testid="incidents-table"
                >
                    <thead>
                    <tr>
                        <SortableTh label="ID" sortKey="id" sort={sort} onSort={toggleSort} help={COL_HELP.id}
                                    className="w-[5.5rem]"/>
                        <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort}
                                    help={COL_HELP.title}/>
                        <SortableTh label="Severity" sortKey="severity" sort={sort} onSort={toggleSort}
                                    help={COL_HELP.severity}/>
                        <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort}
                                    help={COL_HELP.status}/>
                        <SortableTh label="Techniques" sortKey="techniques" sort={sort} onSort={toggleSort}
                                    align="right" help={COL_HELP.techniques}/>
                        <SortableTh label="IoCs" sortKey="iocs" sort={sort} onSort={toggleSort} align="right"
                                    help={COL_HELP.iocs}/>
                        <SortableTh label="Threat" sortKey="threat_score" sort={sort} onSort={toggleSort} align="right"
                                    help={COL_HELP.threat_score}/>
                        <SortableTh label="Grounding" sortKey="grounding" sort={sort} onSort={toggleSort} align="right"
                                    help={COL_HELP.grounding}/>
                        <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={toggleSort} align="right"
                                    help={COL_HELP.created_at}/>
                    </tr>
                    </thead>
                    <tbody>
                    {pageRows.map((inc) => {
                        const titleLink = (
                            <Link
                                to={`/incidents/${inc.id}`}
                                data-testid={`incident-row-${inc.id}`}
                                className="text-[13px] hover:text-primary transition-colors"
                                title={inc.summary || inc.title}
                            >
                                {inc.title}
                            </Link>
                        );
                        return (
                            <tr key={inc.id} className="border-t border-border hover:bg-muted/40 transition-colors">
                                <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}>
                                    <Tip content={inc.id || "Incident id"}>
                      <span className="soc-mono text-[10px] text-muted-foreground" title={inc.id}>
                        {inc.id?.slice(0, 8)}
                      </span>
                                    </Tip>
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}>
                                    {showPreviews ? (
                                        <HoverCard openDelay={160}>
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
                                    {inc.techniques?.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {inc.techniques.slice(0, 4).map((t) => (
                                                <Link
                                                    key={t.technique_id}
                                                    to={`/incidents?technique=${encodeURIComponent(t.technique_id)}`}
                                                    className="font-mono text-[9px] text-primary/80 hover:text-primary"
                                                    title={`${t.technique_id} ${t.name || ""} — filter by technique`}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    {t.technique_id}
                                                </Link>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}>
                                    <SeverityBadge severity={inc.severity}/>
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}>
                                    <StatusPill status={inc.status}/>
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] text-primary`}
                                    title={`${inc.techniques?.length ?? 0} techniques`}>
                                    {inc.techniques?.length ?? 0}
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px]`}
                                    title={`${inc.iocs?.length ?? 0} IoCs`}>
                                    {inc.iocs?.length ?? 0}
                                </td>
                                <td
                                    className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] ${Number(inc.threat_score) >= highThreat ? "text-error" : "text-warning"}`}
                                    title={`Threat score 0–100 (high ≥ ${highThreat})`}
                                >
                                    {inc.threat_score}
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] text-success`}
                                    title="Playbook grounding score">
                                    {inc.playbook?.grounding_score ?? "—"}
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right text-[11px] text-muted-foreground soc-mono`}
                                    title={formatDateTime(inc.created_at)}>
                                    {formatDateTime(inc.created_at, {showStandard: false})}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </DataTable>
                <div className="px-3">
                    <PaginationBar
                        page={page}
                        pageSize={pageSize}
                        total={totalFiltered}
                        onPageChange={setPage}
                        testid="incidents-pagination"
                    />
                </div>
            </div>
        </div>
    );
}
