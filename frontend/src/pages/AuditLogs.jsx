import {useCallback, useEffect, useMemo, useState} from "react";
import {Link, useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {ListState} from "../components/ListState";
import {HelpTip} from "../components/HelpTip";
import {SortableTh} from "../components/SortableTh";
import {PaginationBar} from "../components/PaginationBar";
import {useSortableData} from "../hooks/useSortableData";
import {formatDateTime, loadUiPrefs, parseSortSpec} from "../lib/uiPrefs";
import {downloadCsv} from "../lib/exportCsv";
import {DataTable, PageHeader} from "../design-system";
import {
    CheckCircle,
    Copy,
    DownloadSimple,
    Eye,
    Hash,
    MagnifyingGlass,
    ShieldCheck,
    User,
    X,
    XCircle,
} from "@phosphor-icons/react";
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
        body: "Exact UTC time when the review decision and compliance record were finalized.",
    },
    incident_id: {title: "Incident ID", body: "Stable UUID referencing the target security case."},
    action: {title: "Action", body: "Audit action (review.approve / reject, incident.created, settings, etc.)."},
    analyst: {title: "Actor", body: "Authenticated user ID or system actor responsible for the event."},
    comment: {title: "Summary", body: "Human-readable note derived from detail (justification, reason, compact fields)."},
};

/** Classify action for badge styling (approve / reject / neutral). */
function actionTone(action) {
    const a = (action || "").toLowerCase();
    if (a === "approve" || a.endsWith(".approve") || a.includes("approve")) return "approve";
    if (a === "reject" || a.endsWith(".reject") || a.includes("reject")) return "reject";
    return "neutral";
}

function ActionBadge({action}) {
    const tone = actionTone(action);
    const cls =
        tone === "approve"
            ? "border-success/40 bg-success/15 text-success"
            : tone === "reject"
                ? "border-error/40 bg-error/15 text-error"
                : "border-border bg-muted/40 text-foreground";
    const Icon = tone === "approve" ? CheckCircle : tone === "reject" ? XCircle : Hash;
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${cls}`}
        >
            <Icon size={12} weight={tone === "neutral" ? "regular" : "fill"}/>
            {action || "event"}
        </span>
    );
}

function InspectDrawer({item, onClose}) {
    if (!item) return null;

    const detail = item.detail && typeof item.detail === "object" ? item.detail : {};
    const detailJson = JSON.stringify(detail, null, 2);
    const hashOk = item.hash_ok;
    const incidentId = item.incident_id || (item.target_type === "incident" ? item.target_id : "");

    const copyAll = () => {
        const payload = {
            id: item.id,
            ts: item.timestamp || item.ts,
            action: item.action,
            actor: item.analyst || item.actor_email || item.actor_id,
            target_type: item.target_type,
            target_id: item.target_id,
            incident_id: incidentId,
            comment: item.comment,
            entry_hash: item.entry_hash,
            prev_hash: item.prev_hash,
            hash_ok: item.hash_ok,
            detail,
        };
        navigator.clipboard?.writeText(JSON.stringify(payload, null, 2)).then(
            () => toast.success("Audit record copied"),
            () => toast.error("Clipboard unavailable"),
        );
    };

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end"
            data-testid="audit-inspect-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Audit record inspector"
        >
            <button
                type="button"
                className="absolute inset-0 bg-black/40 border-0 cursor-default"
                aria-label="Close inspector"
                onClick={onClose}
            />
            <aside className="relative w-full max-w-lg h-full bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right">
                <div className="flex items-start justify-between gap-3 p-4 border-b border-border">
                    <div className="min-w-0">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                            Event inspector
                        </div>
                        <div className="mt-1 font-mono text-xs text-muted-foreground truncate" title={item.id}>
                            {item.id || "—"}
                        </div>
                        <div className="mt-2">
                            <ActionBadge action={item.action}/>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        <button
                            type="button"
                            className="soc-btn-ghost !text-xs !h-8 inline-flex items-center gap-1"
                            onClick={copyAll}
                            data-testid="audit-inspect-copy"
                        >
                            <Copy size={14}/>
                            Copy
                        </button>
                        <button
                            type="button"
                            className="soc-btn-ghost !h-8 !w-8 !p-0 inline-flex items-center justify-center"
                            onClick={onClose}
                            data-testid="audit-inspect-close"
                            aria-label="Close"
                        >
                            <X size={16}/>
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
                    <section className="space-y-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Who / what / when
                        </h3>
                        <dl className="grid grid-cols-[7rem_1fr] gap-y-2 gap-x-2 text-xs">
                            <dt className="text-muted-foreground">Timestamp</dt>
                            <dd className="font-mono">{formatDateTime(item.timestamp || item.ts || item.created_at)}</dd>
                            <dt className="text-muted-foreground">Actor</dt>
                            <dd className="font-medium break-all">
                                {item.analyst || item.actor_email || item.actor_id || "system"}
                            </dd>
                            <dt className="text-muted-foreground">Target</dt>
                            <dd className="font-mono break-all">
                                {item.target_type || "—"}
                                {item.target_id ? ` · ${item.target_id}` : ""}
                            </dd>
                            <dt className="text-muted-foreground">Incident</dt>
                            <dd className="font-mono break-all">
                                {incidentId ? (
                                    <Link
                                        to={`/incidents/${incidentId}`}
                                        className="text-primary hover:underline"
                                        data-testid="audit-inspect-incident-link"
                                    >
                                        {incidentId}
                                    </Link>
                                ) : (
                                    "—"
                                )}
                            </dd>
                            <dt className="text-muted-foreground">Summary</dt>
                            <dd className="italic text-foreground/90">
                                {item.comment || "No justification / comment fields."}
                            </dd>
                        </dl>
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            <Hash size={12}/>
                            Integrity chain
                        </h3>
                        <div
                            className={`rounded-lg border px-3 py-2 text-xs flex items-center gap-2 ${
                                hashOk
                                    ? "border-success/40 bg-success/10 text-success"
                                    : item.entry_hash
                                        ? "border-error/40 bg-error/10 text-error"
                                        : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200"
                            }`}
                            data-testid="audit-inspect-hash-status"
                        >
                            {hashOk ? (
                                <CheckCircle size={14} weight="fill"/>
                            ) : item.entry_hash ? (
                                <XCircle size={14} weight="fill"/>
                            ) : (
                                <Hash size={14}/>
                            )}
                            <span className="font-semibold">
                                {hashOk ? "hash_ok" : item.entry_hash ? "hash mismatch" : "legacy / unhashed"}
                            </span>
                        </div>
                        <dl className="space-y-2 text-[11px]">
                            <div>
                                <dt className="text-muted-foreground mb-0.5">entry_hash</dt>
                                <dd className="font-mono break-all bg-muted/40 border border-border rounded px-2 py-1.5">
                                    {item.entry_hash || "—"}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-muted-foreground mb-0.5">prev_hash</dt>
                                <dd className="font-mono break-all bg-muted/40 border border-border rounded px-2 py-1.5">
                                    {item.prev_hash || "(genesis / empty)"}
                                </dd>
                            </div>
                        </dl>
                        <p className="text-[11px] text-muted-foreground m-0 leading-relaxed">
                            Best-effort SHA-256 chain over Mongo audit_log — not WORM storage. Use integrity
                            summary for sample-wide verification.
                        </p>
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Detail payload (JSON)
                        </h3>
                        <pre
                            className="text-[11px] font-mono bg-muted/30 border border-border rounded-lg p-3 overflow-x-auto max-h-72 whitespace-pre-wrap break-words"
                            data-testid="audit-inspect-detail-json"
                        >
{detailJson === "{}" ? "{\n  /* empty detail */\n}" : detailJson}
                        </pre>
                    </section>
                </div>
            </aside>
        </div>
    );
}

export default function AuditLogs() {
    const prefs = loadUiPrefs();
    const [searchParams, setSearchParams] = useSearchParams();

    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [summary, setSummary] = useState(null);
    const [integrity, setIntegrity] = useState(null);
    const [selected, setSelected] = useState(null);

    const [q, setQ] = useState(searchParams.get("q") || "");
    const [actionFilter, setActionFilter] = useState(searchParams.get("action") || "");
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

    const fetchIntelligence = useCallback(() => {
        Promise.all([
            api.get("/audit/summary", {params: {days: 7}}).catch(() => null),
            api.get("/audit/integrity", {params: {sample: 100}}).catch(() => null),
        ]).then(([sumRes, intRes]) => {
            setSummary(sumRes?.data || null);
            setIntegrity(intRes?.data || null);
        });
    }, []);

    useEffect(() => {
        fetchAuditLogs();
    }, [fetchAuditLogs]);

    useEffect(() => {
        fetchIntelligence();
    }, [fetchIntelligence]);

    // Deep-link: open inspect when ?id= matches a loaded row
    useEffect(() => {
        const want = searchParams.get("id");
        if (!want || !logs.length) return;
        const hit = logs.find((r) => r.id === want);
        if (hit) setSelected(hit);
    }, [logs, searchParams]);

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
                    item.entry_hash,
                    item.target_id,
                    item.target_type,
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
        const headers = [
            "Timestamp",
            "Incident ID",
            "Action",
            "Analyst",
            "Justification Comment",
            "entry_hash",
            "hash_ok",
            "target_type",
            "target_id",
        ];
        const rows = filtered.map((item) => [
            formatDateTime(item.timestamp || item.created_at),
            item.incident_id || item.id || "—",
            item.action || "—",
            item.analyst || item.user_id || "System",
            `"${(item.comment || "").replace(/"/g, '""')}"`,
            item.entry_hash || "",
            item.hash_ok ? "true" : "false",
            item.target_type || "",
            item.target_id || "",
        ]);
        downloadCsv(`actira-compliance-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
        toast.success(`Exported ${rows.length} compliance audit record(s).`);
    };

    const clearFilters = () => {
        setQ("");
        setActionFilter("");
        setSearchParams({}, {replace: true});
    };

    const openInspect = (item) => {
        setSelected(item);
        const next = new URLSearchParams(searchParams);
        if (item?.id) next.set("id", item.id);
        setSearchParams(next, {replace: true});
    };

    const closeInspect = () => {
        setSelected(null);
        const next = new URLSearchParams(searchParams);
        next.delete("id");
        setSearchParams(next, {replace: true});
    };

    const integrityOk =
        integrity?.status === "ok" ||
        integrity?.status === "partial" ||
        integrity?.status === "legacy_unhashed";

    return (
        <div data-testid="audit-logs-page" className="w-full flex flex-col min-h-full space-y-4">
            <PageHeader
                testid="audit-header"
                title="Compliance Audit Trail"
                icon={ShieldCheck}
                tip={
                    <HelpTip
                        title="Audit Trail"
                        body="Platform audit events: reviews, settings, ingest, and workspace mutations. Click a row to inspect the full detail payload and SHA-256 chain fields. Integrity is best-effort — not WORM storage."
                        testid="tip-audit-page"
                    />
                }
                subtitle={
                    <>
                        Showing {filtered.length} record{filtered.length === 1 ? "" : "s"}
                        {logs.length !== filtered.length ? ` (filtered from ${logs.length} total)` : ""}.
                        {" "}Click a row to inspect hashes and detail JSON.
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

            {(summary || integrity) && (
                <div
                    className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs"
                    data-testid="audit-intelligence-strip"
                >
                    <div className="soc-card p-3 border border-border rounded-lg bg-card space-y-1.5 lg:col-span-2">
                        <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            Audit intelligence (7d)
                            <HelpTip
                                title="Audit intelligence"
                                body="Rule-based narrative over recent audit volume: top actions, actors, and review patterns. Not an LLM summary."
                                how="GET /audit/summary?days=7 aggregates Mongo audit_log counts."
                                testid="tip-audit-intelligence"
                            />
                        </div>
                        <ul className="m-0 pl-4 space-y-1 text-muted-foreground">
                            {(summary?.narrative || ["Loading summary…"]).map((line, i) => (
                                <li key={i}>{line}</li>
                            ))}
                        </ul>
                    </div>
                    <div className="soc-card p-3 border border-border rounded-lg bg-card space-y-2">
                        <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            Integrity
                            <HelpTip
                                title="Hash integrity sample"
                                body="Best-effort SHA-256 chain check over a recent sample of audit rows. Mismatch / broken_chain fail Compliance LOG-02."
                                how="GET /audit/integrity recomputes entry_hash from canonical fields + prev_hash."
                                testid="tip-audit-integrity"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            {integrityOk ? (
                                <CheckCircle size={16} className="text-success"/>
                            ) : (
                                <XCircle size={16} className="text-error"/>
                            )}
                            <span className="font-mono font-semibold" data-testid="audit-integrity-status">
                                {integrity?.status || "—"}
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground m-0">
                            ok {integrity?.ok ?? "—"} · mismatch {integrity?.mismatch ?? "—"} · missing hash{" "}
                            {integrity?.missing_hash ?? "—"}
                        </p>
                    </div>
                </div>
            )}

            <div
                className="flex flex-wrap items-center gap-2 text-xs bg-card p-3 rounded-lg border border-border shadow-sm">
                <div className="relative min-w-[12rem] flex-1 sm:flex-none sm:w-64">
                    <MagnifyingGlass size={12}
                                     className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                    <input
                        data-testid="audit-search"
                        value={q}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Search ID, comment, analyst, hash…"
                        className="bg-background border border-border pl-7 pr-3 py-1.5 rounded w-full text-xs focus:ring-1 focus:ring-primary outline-none"
                        title="Client-side filter over loaded rows (ID, action, actor, comment, hash)"
                    />
                </div>

                <select
                    data-testid="audit-filter-action"
                    value={actionFilter}
                    onChange={(e) => {
                        setActionFilter(e.target.value);
                        const next = new URLSearchParams(searchParams);
                        if (e.target.value) next.set("action", e.target.value);
                        else next.delete("action");
                        setSearchParams(next, {replace: true});
                    }}
                    className="bg-background border border-border px-2.5 py-1.5 rounded text-xs"
                    title="Filter by audit action (review.approve, incident.created, …)"
                >
                    <option value="">All actions</option>
                    <option value="review.approve">review.approve</option>
                    <option value="review.reject">review.reject</option>
                    <option value="incident.created">incident.created</option>
                    <option value="settings.update">settings.update</option>
                    <option value="approve">approve (legacy)</option>
                    <option value="reject">reject (legacy)</option>
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
                            <SortableTh label="Action" sortKey="action" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.action}/>
                            <SortableTh label="Actor" sortKey="analyst" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.analyst}/>
                            <SortableTh label="Summary" sortKey="comment" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.comment} className="w-[40%]"/>
                            <th className="px-3 py-2 text-[11px] font-semibold text-muted-foreground w-16">Inspect</th>
                        </tr>
                        </thead>
                        <tbody>
                        {pageRows.map((item, idx) => {
                            const selectedRow = selected?.id && selected.id === item.id;
                            return (
                                <tr
                                    key={item.id || idx}
                                    className={`border-t border-border/60 hover:bg-muted/30 transition-colors cursor-pointer ${
                                        selectedRow ? "bg-primary/5" : ""
                                    }`}
                                    onClick={() => openInspect(item)}
                                    data-testid={`audit-row-${item.id || idx}`}
                                >
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} soc-mono text-[11px] text-muted-foreground whitespace-nowrap`}>
                                        {formatDateTime(item.timestamp || item.created_at)}
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} soc-mono text-[11px]`}>
                                        <span className="select-all font-semibold text-primary">
                                            {item.incident_id || item.target_id || item.id}
                                        </span>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                                        <ActionBadge action={item.action}/>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-[12px] font-medium text-foreground whitespace-nowrap`}>
                                        <div className="flex items-center gap-1.5">
                                            <User size={13} className="text-muted-foreground"/>
                                            {item.analyst || item.user_id || "SOC Analyst"}
                                        </div>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"} text-[12px] text-foreground/90 italic`}>
                                        &ldquo;{item.comment || "No justification provided."}&rdquo;
                                        {item.hash_ok === false && item.entry_hash ? (
                                            <span className="ml-2 not-italic text-[10px] text-error font-semibold">
                                                hash!
                                            </span>
                                        ) : null}
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-3"}`}>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-1 text-primary text-[11px] font-medium hover:underline"
                                            data-testid={`audit-inspect-btn-${item.id || idx}`}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openInspect(item);
                                            }}
                                        >
                                            <Eye size={14}/>
                                            View
                                        </button>
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

            <InspectDrawer item={selected} onClose={closeInspect}/>
        </div>
    );
}
