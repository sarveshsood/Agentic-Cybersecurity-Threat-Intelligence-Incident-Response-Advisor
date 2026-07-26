import {useEffect, useMemo, useState} from "react";
import {Link, useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {SeverityBadge, StatusPill} from "../components/SeverityBadge";
import {ListState} from "../components/ListState";
import {HelpTip} from "../components/HelpTip";
import {SortableTh} from "../components/SortableTh";
import {PaginationBar} from "../components/PaginationBar";
import {useSortableData} from "../hooks/useSortableData";
import {formatDateTime, loadUiPrefs, parseSortSpec} from "../lib/uiPrefs";
import {downloadCsv} from "../lib/exportCsv";
import {DataTable, PageHeader} from "../design-system";
import {DownloadSimple, MagnifyingGlass, ShieldCheck, ShieldWarning, Warning,} from "@phosphor-icons/react";
import {toast} from "sonner";

const ACCESSORS = {
    title: (r) => r.title || "",
    severity: (r) => {
        const map = {critical: 4, high: 3, medium: 2, low: 1};
        return map[(r.severity || "").toLowerCase()] || 0;
    },
    status: (r) => r.status || "",
    threat_score: (r) => Number(r.threat_score || 0),
    created_at: (r) => new Date(r.created_at || 0).getTime(),
};

export default function Incidents() {
    const prefs = loadUiPrefs();
    const [searchParams, setSearchParams] = useSearchParams();

    const [incidents, setIncidents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    const [q, setQ] = useState(searchParams.get("q") || "");
    const [statusFilter, setStatusFilter] = useState("");
    const [severityFilter, setSeverityFilter] = useState("");
    const [page, setPage] = useState(1);

    const pageSize = 25;
    const compact = prefs.compact_tables;

    const initialSort = parseSortSpec(prefs.incidents_default_sort) || {key: "created_at", dir: "desc"};
    const {sorted, sort, toggleSort} = useSortableData(incidents, initialSort, ACCESSORS);

    useEffect(() => {
        setLoading(true);
        api
            .get("/incidents")
            .then((r) => {
                const list = Array.isArray(r.data) ? r.data : r.data?.items || [];
                setIncidents(list);
                setLoadError(null);
            })
            .catch((e) => {
                setIncidents([]);
                setLoadError(e?.userMessage || e?.response?.data?.detail || "Could not load incidents list.");
            })
            .finally(() => setLoading(false));
    }, []);

    const handleSearchChange = (val) => {
        setQ(val);
        const nextParams = new URLSearchParams(searchParams);
        if (val.trim()) {
            nextParams.set("q", val.trim());
        } else {
            nextParams.delete("q");
        }
        setSearchParams(nextParams, {replace: true});
    };

    const filtered = useMemo(() => {
        let list = [...sorted];
        if (statusFilter) {
            list = list.filter((i) => (i.status || "").toLowerCase() === statusFilter.toLowerCase());
        }
        if (severityFilter) {
            list = list.filter((i) => (i.severity || "").toLowerCase() === severityFilter.toLowerCase());
        }
        const needle = q.trim().toLowerCase();
        if (needle) {
            list = list.filter((i) => {
                const hay = [i.id, i.title, i.summary, i.severity, i.status].join(" ").toLowerCase();
                return hay.includes(needle);
            });
        }
        return list;
    }, [sorted, statusFilter, severityFilter, q]);

    useEffect(() => {
        setPage(1);
    }, [q, statusFilter, severityFilter, sort?.key, sort?.dir]);

    const pageRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, page, pageSize]);

    const exportIncidentsCsv = () => {
        const headers = ["ID", "Title", "Severity", "Status", "Threat Score", "Created At"];
        const rows = filtered.map((i) => [
            i.id,
            `"${(i.title || "").replace(/"/g, '""')}"`,
            i.severity || "—",
            i.status || "—",
            i.threat_score ?? "—",
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
                        body="Browse, triage, and investigate active cybersecurity incidents and automated AI playbooks."
                        testid="tip-incidents-page"
                    />
                }
                subtitle={
                    <>
                        Showing {filtered.length} case{filtered.length === 1 ? "" : "s"}
                        {incidents.length !== filtered.length ? ` (filtered from ${incidents.length} total)` : ""}.
                    </>
                }
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            data-testid="incidents-export-btn"
                            onClick={exportIncidentsCsv}
                            disabled={!filtered.length || loading}
                            className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8 disabled:opacity-50"
                        >
                            <DownloadSimple size={14}/>
                            Export CSV
                        </button>
                    </div>
                }
            />

            {/* Filter and Search Bar */}
            <div
                className="flex flex-wrap items-center gap-2 text-xs bg-card p-3 rounded-lg border border-border shadow-sm">
                <div className="relative min-w-[12rem] flex-1 sm:flex-none sm:w-64">
                    <MagnifyingGlass size={12}
                                     className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                    <input
                        data-testid="incidents-search"
                        value={q}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search incident ID, title, summary…"
                        className="bg-background border border-border pl-7 pr-3 py-1.5 rounded w-full text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>

                <select
                    data-testid="incidents-filter-status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="bg-background border border-border px-2.5 py-1.5 rounded text-xs"
                >
                    <option value="">All statuses</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="approved">Approved</option>
                    <option value="rejected">Rejected</option>
                    <option value="closed">Closed</option>
                </select>

                <select
                    data-testid="incidents-filter-severity"
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="bg-background border border-border px-2.5 py-1.5 rounded text-xs"
                >
                    <option value="">All severities</option>
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                </select>
            </div>

            {loadError && <ListState variant="error" testid="incidents-load-error" message={loadError}/>}
            {loading && <ListState variant="loading" testid="incidents-loading" message="Loading incident cases…"/>}
            {!loading && !loadError && filtered.length === 0 && (
                <ListState
                    variant="empty"
                    testid="incidents-empty"
                    message={incidents.length ? "No incidents match your filter criteria." : "No incidents ingested yet. Upload log packages to begin."}
                />
            )}

            {/* Incidents Table */}
            {!loading && !loadError && filtered.length > 0 && (
                <div
                    className="soc-card overflow-hidden p-0 w-full flex-1 flex flex-col border border-border rounded-lg shadow-sm bg-card">
                    <DataTable
                        className={`w-full flex-1 ${compact ? "text-[12px]" : ""}`}
                        aria-label="Incidents List"
                        testid="incidents-table"
                    >
                        <thead>
                        <tr className="bg-muted/50 border-b border-border">
                            <SortableTh label="Severity" sortKey="severity" sort={sort} onSort={toggleSort}
                                        help={{title: "Severity", body: "Pipeline severity: low → critical."}}/>
                            <SortableTh label="Incident Title & ID" sortKey="title" sort={sort} onSort={toggleSort}
                                        className="w-[45%]"
                                        help={{title: "Title & ID", body: "Human-readable title and stable incident UUID."}}/>
                            <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort}
                                        help={{title: "Status", body: "IR lifecycle: new, in_progress, pending_review, approved, rejected, closed."}}/>
                            <SortableTh label="Threat Score" sortKey="threat_score" sort={sort} onSort={toggleSort}
                                        help={{title: "Threat score", body: "Composite risk score (0–100) from severity, IoCs, and techniques."}}/>
                            <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={toggleSort}
                                        help={{title: "Created", body: "When the pipeline first persisted this incident (UTC stored; display TZ from UI prefs)."}}/>
                            <th className="px-3 py-2.5 text-right font-semibold text-muted-foreground text-xs">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {pageRows.map((inc) => (
                            <tr key={inc.id} className="border-t border-border/60 hover:bg-muted/30 transition-colors"
                                data-testid={`incident-row-${inc.id}`}>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                                    <SeverityBadge severity={inc.severity}/>
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                                    <Link
                                        to={`/incidents/${inc.id}`}
                                        className="font-semibold text-foreground hover:text-primary transition-colors block text-sm leading-snug"
                                        data-testid={`incident-link-${inc.id}`}
                                    >
                                        {inc.title || inc.id}
                                    </Link>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="font-mono text-[10px] text-muted-foreground">{inc.id}</span>
                                        {inc.hitl_required && (
                                            <span
                                                className="inline-flex items-center gap-1 text-[9px] text-warning bg-warning-soft px-1.5 py-0.2 rounded border border-[var(--warning-border)] font-semibold uppercase">
                          <Warning size={10} weight="fill"/> HiTL
                        </span>
                                        )}
                                    </div>
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                                    <StatusPill status={inc.status}/>
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-3"} font-mono text-xs font-semibold ${
                                    inc.threat_score >= 70 ? "text-error" : inc.threat_score >= 40 ? "text-warning" : "text-success"
                                }`}>
                                    {inc.threat_score ?? "—"}
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-3"} soc-mono text-[11px] text-muted-foreground whitespace-nowrap`}>
                                    {formatDateTime(inc.created_at)}
                                </td>
                                <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-right whitespace-nowrap`}>
                                    <div className="inline-flex items-center gap-1.5">
                                        {/* Direct shortcut to Compliance Audit Trail filtered for this incident */}
                                        <Link
                                            to={`/audit?q=${inc.id}`}
                                            className="p-1.5 rounded border border-border hover:border-primary hover:text-primary text-muted-foreground transition-colors inline-flex items-center"
                                            title="View compliance audit trail for this incident"
                                            data-testid={`audit-link-${inc.id}`}
                                        >
                                            <ShieldCheck size={14}/>
                                        </Link>
                                        <Link
                                            to={`/incidents/${inc.id}`}
                                            className="px-2.5 py-1 rounded bg-primary/10 border border-primary/30 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                                        >
                                            Investigate
                                        </Link>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </DataTable>
                    <div className="p-3 border-t border-border bg-muted/20">
                        <PaginationBar
                            page={page}
                            pageSize={pageSize}
                            total={filtered.length}
                            onPageChange={setPage}
                            testid="incidents-pagination"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}