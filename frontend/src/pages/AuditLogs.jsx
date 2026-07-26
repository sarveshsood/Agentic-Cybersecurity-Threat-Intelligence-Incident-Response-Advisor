import {useCallback, useEffect, useMemo, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {ListState} from "../components/ListState";
import {HelpTip} from "../components/HelpTip";
import {SortableTh} from "../components/SortableTh";
import {PaginationBar} from "../components/PaginationBar";
import {useSortableData} from "../hooks/useSortableData";
import {formatDateTime, loadUiPrefs, parseSortSpec} from "../lib/uiPrefs";
import {downloadCsv} from "../lib/exportCsv";
import {DataTable, PageHeader} from "../design-system";
import {CheckCircle, DownloadSimple, MagnifyingGlass, ShieldCheck, User, X, XCircle,} from "@phosphor-icons/react";
import {toast} from "sonner";

const ACCESSORS = {
    timestamp: (r) => new Date(r.timestamp || r.created_at || 0).getTime(),
    incident_id: (r) => r.incident_id || r.id || "",
    action: (r) => r.action || "",
    analyst: (r) => r.analyst || r.user_id || "System Analyst",
    comment: (r) => r.comment || "",
};

const COL_HELP = {
    timestamp: {
        title: "Timestamp",
        body: "Exact UTC time when the review decision and compliance record were finalized."
    },
    incident_id: {title: "Incident ID", body: "Stable UUID referencing the target security case."},
    action: {title: "Decision", body: "Final enterprise disposition: Approved or Rejected."},
    analyst: {title: "Analyst", body: "Authenticated user ID responsible for the triage decision."},
    comment: {title: "Justification Comment", body: "Mandatory compliance note providing context for the audit trail."},
};

export default function AuditLogs() {
    const prefs = loadUiPrefs();
    const [searchParams, setSearchParams] = useSearchParams();

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    // Initialize search query from URL ?q= if present
    const [q, setQ] = useState(searchParams.get("q") || "");
    const [actionFilter, setActionFilter] = useState("");
    const [page, setPage] = useState(1);

    const pageSize = 25;
    const compact = prefs.compact_tables;

    const initialSort = parseSortSpec(prefs.audit_default_sort) || {key: "timestamp", dir: "desc"};
    const {sorted, sort, toggleSort} = useSortableData(logs, initialSort, ACCESSORS);

    const fetchAuditLogs = useCallback(() => {
        setLoading(true);
        api
            .get("/audit/logs", {
                params: {
                    q: q.trim() || undefined,
                    action: actionFilter || undefined,
                },
            })
            .then((r) => {
                const dataList = Array.isArray(r.data) ? r.data : r.data?.items || [];
                setLogs(dataList);
                setLoadError(null);
            })
            .catch((e) => {
                setLogs([]);
                setLoadError(e?.userMessage || e?.response?.data?.detail || "Could not load compliance audit logs stream.");
            })
            .finally(() => setLoading(false));
    }, [q, actionFilter]);

    useEffect(() => {
        fetchAuditLogs();
    }, [fetchAuditLogs]);

    // Keep URL search params in sync when user types in search box
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
        if (actionFilter) {
            list = list.filter((item) => (item.action || "").toLowerCase() === actionFilter.toLowerCase());
        }
        const needle = q.trim().toLowerCase();
        if (needle) {
            list = list.filter((item) => {
                const hay = [
                    item.incident_id,
                    item.id,
                    item.action,
                    item.analyst,
                    item.user_id,
                    item.comment,
                ]
                    .join(" ")
                    .toLowerCase();
                return hay.includes(needle);
            });
        }

        list.sort((a, b) => {
            if (!sort?.key) return 0;
            const valA = ACCESSORS[sort.key] ? ACCESSORS[sort.key](a) : 0;
            const valB = ACCESSORS[sort.key] ? ACCESSORS[sort.key](b) : 0;
            if (valA !== valB) {
                return sort.dir === "asc" ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
            }
            return (a.incident_id || "").localeCompare(b.incident_id || "");
        });

        return list;
    }, [sorted, actionFilter, q, sort]);

    useEffect(() => {
        setPage(1);
    }, [q, actionFilter, sort?.key, sort?.dir]);

    const pageRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, page, pageSize]);

    const exportAuditCsv = () => {
        const headers = ["Timestamp", "Incident ID", "Action", "Analyst", "Justification Comment"];
        const rows = filtered.map((item) => [
            formatDateTime(item.timestamp || item.created_at),
            item.incident_id || item.id || "—",
            item.action || "—",
            item.analyst || item.user_id || "System",
            `"${(item.comment || "").replace(/"/g, '""')}"`,
        ]);
        downloadCsv(`actira-compliance-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
        toast.success(`Exported ${rows.length} compliance audit record(s).`);
    };

    const clearFilters = () => {
        setQ("");
        setActionFilter("");
        setSearchParams({}, {replace: true});
    };

    return (
        <div data-testid="audit-logs-page" className="w-full flex flex-col min-h-full space-y-4">
            <PageHeader
                testid="audit-header"
                title="Compliance Audit Trail"
                icon={ShieldCheck}
                tip={
                    <HelpTip
                        title="Immutable Audit Log"
                        body="Centralized historical record of all analyst review actions, approvals, rejections, and mandatory justification comments."
                        testid="tip-audit-page"
                    />
                }
                subtitle={
                    <>
                        Showing {filtered.length} compliance record{filtered.length === 1 ? "" : "s"}
                        {logs.length !== filtered.length ? ` (filtered from ${logs.length} total)` : ""}.
                    </>
                }
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            data-testid="audit-export-btn"
                            onClick={exportAuditCsv}
                            disabled={!filtered.length || loading}
                            className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8 disabled:opacity-50"
                        >
                            <DownloadSimple size={14}/>
                            Export Audit CSV
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
                        data-testid="audit-search"
                        value={q}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search incident ID, comment, analyst…"
                        className="bg-background border border-border pl-7 pr-3 py-1.5 rounded w-full text-xs focus:ring-1 focus:ring-primary outline-none"
                    />
                </div>

                <select
                    data-testid="audit-filter-action"
                    value={actionFilter}
                    onChange={(e) => setActionFilter(e.target.value)}
                    className="bg-background border border-border px-2.5 py-1.5 rounded text-xs"
                >
                    <option value="">All actions</option>
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                </select>

                {(q || actionFilter) && (
                    <button
                        type="button"
                        data-testid="audit-clear-filters"
                        onClick={clearFilters}
                        className="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-primary transition-colors font-medium flex items-center gap-1"
                    >
                        <X size={12}/> Clear
                    </button>
                )}
            </div>

            {loadError && (
                <ListState variant="error" testid="audit-load-error" message={loadError}/>
            )}
            {loading && (
                <ListState variant="loading" testid="audit-loading" message="Loading immutable audit records…"/>
            )}
            {!loading && !loadError && filtered.length === 0 && (
                <ListState
                    variant="empty"
                    testid="audit-empty"
                    message={logs.length ? "No audit records match your filters." : "No review actions recorded in the audit trail yet."}
                />
            )}

            {/* Audit Data Table */}
            {!loading && !loadError && filtered.length > 0 && (
                <div
                    className="soc-card overflow-hidden p-0 w-full flex-1 flex flex-col border border-border rounded-lg shadow-sm bg-card">
                    <DataTable
                        className={`w-full flex-1 ${compact ? "text-[12px]" : ""}`}
                        aria-label="Compliance Audit Logs"
                        testid="audit-table"
                    >
                        <thead>
                        <tr className="bg-muted/50 border-b border-border">
                            <SortableTh label="Timestamp" sortKey="timestamp" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.timestamp}/>
                            <SortableTh label="Incident ID" sortKey="incident_id" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.incident_id}/>
                            <SortableTh label="Decision" sortKey="action" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.action}/>
                            <SortableTh label="Analyst" sortKey="analyst" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.analyst}/>
                            <SortableTh label="Justification Comment" sortKey="comment" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.comment} className="w-[45%]"/>
                        </tr>
                        </thead>
                        <tbody>
                        {pageRows.map((item, idx) => {
                            const isApproved = (item.action || "").toLowerCase() === "approve";
                            return (
                                <tr key={item.id || idx}
                                    className="border-t border-border/60 hover:bg-muted/30 transition-colors">
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} soc-mono text-[11px] text-muted-foreground whitespace-nowrap`}>
                                        {formatDateTime(item.timestamp || item.created_at)}
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} soc-mono text-[11px]`}>
                                        <span
                                            className="select-all font-semibold text-primary">{item.incident_id || item.id}</span>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                      <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                              isApproved
                                  ? "border-success/40 bg-success/15 text-success"
                                  : "border-error/40 bg-error/15 text-error"
                          }`}
                      >
                        {isApproved ? <CheckCircle size={12} weight="fill"/> : <XCircle size={12} weight="fill"/>}
                          {item.action || "Reviewed"}
                      </span>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-[12px] font-medium text-foreground whitespace-nowrap`}>
                                        <div className="flex items-center gap-1.5">
                                            <User size={13} className="text-muted-foreground"/>
                                            {item.analyst || item.user_id || "SOC Analyst"}
                                        </div>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-[12px] text-foreground/90 italic`}>
                                        &ldquo;{item.comment || "No justification provided."}&rdquo;
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
                            total={filtered.length}
                            onPageChange={setPage}
                            testid="audit-pagination"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}