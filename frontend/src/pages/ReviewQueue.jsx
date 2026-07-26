import {useCallback, useEffect, useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {api} from "../lib/api";
import {SeverityBadge} from "../components/SeverityBadge";
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
import {
    CheckSquare,
    Clock,
    DownloadSimple,
    FunnelSimple,
    ListBullets,
    ListChecks,
    MagnifyingGlass,
    ShieldCheck,
    Square,
    SquaresFour,
    Warning,
    X,
} from "@phosphor-icons/react";
import {toast} from "sonner";

const ACCESSORS = {
    title: (r) => r.title || "",
    severity: (r) => ({low: 1, medium: 2, high: 3, critical: 4}[r.severity] || 0),
    threat_score: (r) => Number(r.threat_score) || 0,
    grounding: (r) => Number(r.playbook?.grounding_score) || -1,
    iocs: (r) => r.iocs?.length ?? 0,
    techniques: (r) => r.techniques?.length ?? 0,
    created_at: (r) => new Date(r.created_at || 0).getTime(),
};

const COL_HELP = {
    title: {title: "Title", body: "Incident narrative. Hover for preview; click to open for approve / edit / reject."},
    severity: {title: "Severity", body: "Pipeline severity. HiTL is always required at/above hitl_severity_min."},
    threat_score: {title: "Threat", body: "0–100 enrichment composite score."},
    grounding: {title: "Grounding", body: "Playbook citation quality. Below threshold forces this queue item."},
    iocs: {title: "IoCs", body: "Extracted indicator count."},
    techniques: {title: "Techniques", body: "Mapped ATT&CK technique count."},
    created_at: {title: "Created", body: "When the case entered the system."},
};

function SlaBadge({createdAt}) {
    if (!createdAt) return null;
    const ageMinutes = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    const isBreached = ageMinutes > 60;
    const isWarn = ageMinutes > 30 && !isBreached;

    return (
        <span
            className={`inline-flex items-center gap-1 font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                isBreached
                    ? "border-[var(--error-border)] bg-error-soft text-error"
                    : isWarn
                        ? "border-[var(--warning-border)] bg-warning-soft text-warning"
                        : "border-border text-muted-foreground"
            }`}
            title={`Queue age: ${ageMinutes} minute(s)`}
        >
      <Clock size={10}/>
            {ageMinutes}m
    </span>
    );
}

export default function ReviewQueue() {
    const prefs = loadUiPrefs();
    const [items, setItems] = useState([]);
    const [loadError, setLoadError] = useState(null);
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [severity, setSeverity] = useState("");
    const [minThreat, setMinThreat] = useState(Number(prefs.review_min_threat) || 0);
    const [maxGrounding, setMaxGrounding] = useState(
        prefs.review_max_grounding != null ? Number(prefs.review_max_grounding) : 1,
    );
    const [technique, setTechnique] = useState("");
    const [minTechniques, setMinTechniques] = useState(0);
    const [minIocs, setMinIocs] = useState(0);
    const [view, setView] = useState(prefs.review_default_view === "table" ? "table" : "cards");
    const [page, setPage] = useState(1);
    const [selectedIds, setSelectedIds] = useState(new Set());

    // Unified Triage Modal State with Compliance & Webhook Summary Metadata
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [targetIncidentIds, setTargetIncidentIds] = useState([]);
    const [reviewActionType, setReviewActionType] = useState("approve");
    const [reviewComment, setReviewComment] = useState("");
    const [reviewBusy, setReviewBusy] = useState(false);

    const showPreviews = prefs.show_incident_previews !== false;
    const highThreat = Number(prefs.high_threat_score_threshold) || 70;
    const compact = prefs.compact_tables;
    const pageSize = 25;
    const groundingThreshold = Number(prefs.grounding_threshold) || 0.7;

    const initialSort = parseSortSpec(prefs.review_default_sort) || {key: "threat_score", dir: "desc"};
    const {sorted, sort, toggleSort} = useSortableData(items, initialSort, ACCESSORS);

    // Backend accepts skip/limit only; filters + pagination are client-side.
    // Load a wide window once so triage filters see the full pending set (cap 200).
    const loadQueue = useCallback(() => {
        setLoading(true);
        api
            .get("/review/queue", {
                params: {
                    skip: 0,
                    limit: 200,
                },
            })
            .then((r) => {
                const dataList = Array.isArray(r.data) ? r.data : r.data?.items || [];
                setItems(dataList);
                setLoadError(null);
            })
            .catch((e) => {
                setItems([]);
                setLoadError(e?.userMessage || e?.response?.data?.detail || "Could not load review queue");
            })
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        loadQueue();
    }, [loadQueue]);

    const techniqueOptions = useMemo(() => {
        const set = new Set();
        for (const inc of items) {
            for (const t of inc.techniques || []) {
                if (t.technique_id) set.add(t.technique_id);
            }
        }
        return [...set].sort();
    }, [items]);

    const filtered = useMemo(() => {
        let list = sorted;
        if (severity) list = list.filter((i) => i.severity === severity);
        if (minThreat > 0) list = list.filter((i) => Number(i.threat_score) >= minThreat);
        if (maxGrounding < 1) {
            list = list.filter((i) => {
                const g = Number(i.playbook?.grounding_score);
                return Number.isFinite(g) ? g <= maxGrounding : true;
            });
        }
        if (technique) {
            list = list.filter((inc) =>
                (inc.techniques || []).some((t) => t.technique_id === technique),
            );
        }
        if (minTechniques > 0) {
            list = list.filter((inc) => (inc.techniques?.length || 0) >= minTechniques);
        }
        if (minIocs > 0) {
            list = list.filter((inc) => (inc.iocs?.length || 0) >= minIocs);
        }
        const needle = q.trim().toLowerCase();
        if (needle) {
            list = list.filter((inc) => {
                const hay = [
                    inc.title,
                    inc.id,
                    inc.summary,
                    inc.severity,
                    ...(inc.techniques || []).map((t) => `${t.technique_id} ${t.name || ""}`),
                    ...(inc.iocs || []).map((i) => `${i.type || ""} ${i.value || ""}`),
                ]
                    .join(" ")
                    .toLowerCase();
                return hay.includes(needle);
            });
        }
        return list;
    }, [sorted, severity, q, minThreat, maxGrounding, technique, minTechniques, minIocs]);

    const clearFilters = () => {
        setQ("");
        setSeverity("");
        setMinThreat(0);
        setMaxGrounding(1);
        setTechnique("");
        setMinTechniques(0);
        setMinIocs(0);
    };

    useEffect(() => {
        setPage(1);
    }, [severity, q, minThreat, maxGrounding, technique, minTechniques, minIocs, sort?.key, sort?.dir, view]);

    const pageRows = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [filtered, page, pageSize]);

    const toggleSelectAll = () => {
        if (selectedIds.size === pageRows.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(pageRows.map((i) => i.id)));
        }
    };

    const toggleSelectItem = (id) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const openReviewModal = (ids, action) => {
        setTargetIncidentIds(ids);
        setReviewActionType(action);
        setReviewComment("");
        setShowReviewModal(true);
    };

    // Enforced Audit Policy + Batched Webhook Summary Dispatch
    const handleExecuteReview = async () => {
        if (targetIncidentIds.length === 0) return;
        const comment = reviewComment.trim();
        if (!comment) {
            toast.error("Compliance policy requires a justification comment for review actions.");
            return;
        }

        setReviewBusy(true);
        try {
            const results = await Promise.allSettled(
                targetIncidentIds.map(async (id) => {
                    try {
                        await api.post(`/incidents/${id}/review`, {
                            action: reviewActionType,
                            comment: comment,
                        });
                        return {id, success: true};
                    } catch (err) {
                        if (err?.response?.status === 409) {
                            return {id, success: false, reason: "Conflict: Already reviewed"};
                        }
                        throw err;
                    }
                })
            );

            let successCount = 0;
            let conflictCount = 0;

            for (const res of results) {
                if (res.status === "fulfilled") {
                    if (res.value.success) successCount++;
                    else conflictCount++;
                }
            }

            if (successCount > 0) {
                toast.success(`Successfully ${reviewActionType === "approve" ? "approved" : "rejected"} ${successCount} incident(s). Audit record created.`);

                if (successCount > 1) {
                    api.post("/settings/test-slack", {
                        message: `[SOC Audit Compliance] Batch ${reviewActionType} executed on ${successCount} incidents. Justification: "${comment}"`
                    }).catch(() => {
                    });
                }
            }
            if (conflictCount > 0) {
                toast.warning(`${conflictCount} incident(s) were already reviewed by another analyst (Conflict 409). Refreshing queue.`);
            }

            setSelectedIds(new Set());
            setShowReviewModal(false);
            setReviewComment("");
            loadQueue();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Review execution failed");
        } finally {
            setReviewBusy(false);
        }
    };

    const exportRows = () => {
        const {headers, rows} = incidentsToCsvRows(filtered);
        downloadCsv(`actira-review-queue-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
        toast.success(`Exported ${rows.length} case${rows.length === 1 ? "" : "s"}`);
    };

    const hasFilters =
        q || severity || minThreat > 0 || maxGrounding < 1 || technique || minTechniques > 0 || minIocs > 0;

    const hasLowGroundingSelected = useMemo(() => {
        return items
            .filter((i) => targetIncidentIds.includes(i.id))
            .some((i) => {
                const g = Number(i.playbook?.grounding_score);
                return Number.isFinite(g) && g < groundingThreshold;
            });
    }, [items, targetIncidentIds, groundingThreshold]);

    return (
        <div data-testid="review-queue-page">
            <PageHeader
                testid="review-header"
                title="Reviewer Queue"
                icon={ListChecks}
                tip={
                    <HelpTip
                        title="HiTL review queue"
                        body="Incidents flagged as critical (or severity ≥ hitl_severity_min) or with playbook grounding below the threshold. Approve, edit, or reject playbooks."
                        how="Status = pending_review. Controlled by Settings → HiTL severity min + grounding threshold."
                        testid="tip-review-page"
                    />
                }
                subtitle={
                    <>
                        {filtered.length} case{filtered.length === 1 ? "" : "s"} need review
                        {items.length !== filtered.length ? ` (${items.length} total in queue)` : ""}.
                        {sort?.key ? ` Sorted by ${sort.key} (${sort.dir}).` : ""}
                    </>
                }
                actions={
                    <div className="flex items-center gap-2">
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-1.5" data-testid="bulk-action-bar">
                                <button
                                    type="button"
                                    data-testid="bulk-approve-btn"
                                    onClick={() => openReviewModal([...selectedIds], "approve")}
                                    className="soc-btn-primary !text-xs !px-3 !py-1.5 !h-8"
                                >
                                    Approve ({selectedIds.size})
                                </button>
                                <button
                                    type="button"
                                    data-testid="bulk-reject-btn"
                                    onClick={() => openReviewModal([...selectedIds], "reject")}
                                    className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8 border-[var(--error-border)] text-error hover:bg-error-soft"
                                >
                                    Reject ({selectedIds.size})
                                </button>
                            </div>
                        )}
                        <button
                            type="button"
                            data-testid="review-export"
                            onClick={exportRows}
                            disabled={!filtered.length}
                            className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8"
                        >
                            <DownloadSimple size={14}/>
                            Export CSV
                        </button>
                    </div>
                }
            />

            {/* Unified Triage Audit Justification Modal */}
            {showReviewModal && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm grid place-items-center p-4">
                    <div className="soc-card w-full max-w-md p-5 space-y-4 border border-primary/30 shadow-xl bg-card">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                                <ShieldCheck size={16} className="text-primary"/>
                                Mandatory Triage Audit Justification
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowReviewModal(false)}
                                className="text-muted-foreground hover:text-foreground"
                                aria-label="Close modal"
                            >
                                <X size={16}/>
                            </button>
                        </div>
                        <p className="text-[12px] text-muted-foreground leading-relaxed">
                            Enterprise compliance policy requires a justification comment for <span
                            className="font-semibold text-foreground">{reviewActionType}</span> of {targetIncidentIds.length} incident(s).
                            This is permanently logged for audit trails.
                        </p>

                        {hasLowGroundingSelected && reviewActionType === "approve" && (
                            <div
                                className="rounded-md border border-[var(--warning-border)] bg-warning-soft p-3 flex items-start gap-2 text-[11px] text-warning">
                                <Warning size={16} className="shrink-0 mt-0.5" weight="fill"/>
                                <div>
                                    <span className="font-semibold">Low Grounding Warning:</span> One or more selected
                                    incidents have playbook grounding scores below your configured threshold
                                    ({groundingThreshold}). Please verify citations before approval.
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="soc-label mb-1 block" htmlFor="review-comment-input">
                                Justification Comment <span className="text-error">*</span>
                            </label>
                            <textarea
                                id="review-comment-input"
                                className="w-full bg-background border border-border rounded p-2.5 text-xs text-foreground min-h-[90px]"
                                placeholder="e.g. Verified via internal log correlation & threat intelligence..."
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                autoFocus
                                data-testid="review-comment-textarea"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setShowReviewModal(false)}
                                className="soc-btn-secondary !text-xs !py-1.5"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={reviewBusy || !reviewComment.trim()}
                                onClick={handleExecuteReview}
                                className={`soc-btn-primary !text-xs !py-1.5 disabled:opacity-50 ${
                                    reviewActionType === "reject" ? "!bg-error hover:!bg-error/90 !text-error-foreground" : ""
                                }`}
                                data-testid="review-confirm-btn"
                            >
                                {reviewBusy ? "Processing..." : `Confirm ${reviewActionType === "approve" ? "Approval" : "Rejection"}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div className="flex flex-wrap items-center gap-2 text-xs max-w-full" data-testid="review-filter-bar">
                    <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
                        <span className="text-[11px] font-semibold uppercase tracking-wide">Triage filters</span>
                        <HelpTip
                            title="Review filters"
                            body="Narrow pending_review cases by severity, technique, threat score, grounding ceiling, and IoC/technique counts. Bulk approve/reject still requires a justification."
                            testid="tip-review-filters"
                        />
                    </div>
                    <div className="relative min-w-[10rem] flex-1 sm:flex-none sm:w-52">
                        <MagnifyingGlass size={12}
                                         className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"/>
                        <input
                            data-testid="review-search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="Search title, id, IoC, technique…"
                            title="Search the review queue"
                            className="bg-background border border-border pl-7 pr-2 py-1.5 rounded w-full"
                        />
                    </div>
                    <select
                        data-testid="review-filter-severity"
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value)}
                        title="Filter by severity"
                        className="bg-background border border-border px-2 py-1.5 rounded"
                    >
                        <option value="">All severity</option>
                        {["critical", "high", "medium", "low"].map((s) => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                    <select
                        data-testid="review-filter-technique"
                        value={technique}
                        onChange={(e) => setTechnique(e.target.value)}
                        title="Filter by ATT&CK technique"
                        className="bg-background border border-border px-2 py-1.5 rounded max-w-[9rem]"
                    >
                        <option value="">All techniques</option>
                        {techniqueOptions.map((t) => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                    <label className="inline-flex items-center gap-1 text-muted-foreground"
                           title="Minimum threat score">
                        <FunnelSimple size={12}/>
                        <input
                            data-testid="review-min-threat"
                            type="number"
                            min={0}
                            max={100}
                            value={minThreat || ""}
                            onChange={(e) => setMinThreat(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            placeholder="Min threat"
                            className="bg-background border border-border px-2 py-1.5 rounded w-[4.5rem] font-mono"
                        />
                    </label>
                    <label className="inline-flex items-center gap-1 text-muted-foreground"
                           title="Only show grounding at or below this value (1 = show all)">
                        <span className="text-[10px]">G≤</span>
                        <input
                            data-testid="review-max-grounding"
                            type="number"
                            min={0}
                            max={1}
                            step={0.05}
                            value={maxGrounding}
                            onChange={(e) => setMaxGrounding(Math.min(1, Math.max(0, parseFloat(e.target.value) || 1)))}
                            className="bg-background border border-border px-2 py-1.5 rounded w-16 font-mono"
                        />
                    </label>
                    <label className="inline-flex items-center gap-1 text-muted-foreground"
                           title="Minimum ATT&CK technique count">
                        <span className="text-[10px]">Tech≥</span>
                        <input
                            data-testid="review-min-techniques"
                            type="number"
                            min={0}
                            max={50}
                            value={minTechniques || ""}
                            onChange={(e) => setMinTechniques(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="bg-background border border-border px-2 py-1.5 rounded w-12 font-mono"
                        />
                    </label>
                    <label className="inline-flex items-center gap-1 text-muted-foreground" title="Minimum IoC count">
                        <span className="text-[10px]">IoC≥</span>
                        <input
                            data-testid="review-min-iocs"
                            type="number"
                            min={0}
                            max={500}
                            value={minIocs || ""}
                            onChange={(e) => setMinIocs(Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="bg-background border border-border px-2 py-1.5 rounded w-12 font-mono"
                        />
                    </label>
                    {hasFilters && (
                        <Tip content="Clear all filters">
                            <button
                                type="button"
                                data-testid="review-clear-filters"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1 px-2 py-1.5 rounded border border-border text-muted-foreground hover:text-primary"
                            >
                                <X size={12}/> Clear
                            </button>
                        </Tip>
                    )}
                    <div className="inline-flex rounded border border-border overflow-hidden" role="group"
                         aria-label="View mode">
                        <Tip content="Card view with hover previews">
                            <button
                                type="button"
                                data-testid="review-view-cards"
                                onClick={() => setView("cards")}
                                className={`px-2 py-1.5 ${view === "cards" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                                aria-pressed={view === "cards"}
                            >
                                <SquaresFour size={14}/>
                            </button>
                        </Tip>
                        <Tip content="Table view with sortable columns">
                            <button
                                type="button"
                                data-testid="review-view-table"
                                onClick={() => setView("table")}
                                className={`px-2 py-1.5 border-l border-border ${view === "table" ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
                                aria-pressed={view === "table"}
                            >
                                <ListBullets size={14}/>
                            </button>
                        </Tip>
                    </div>
                </div>
            </div>

            {/* Sort bar for card view */}
            {view === "cards" && filtered.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] text-muted-foreground"
                     data-testid="review-card-sort">
                    <span className="soc-label">Sort</span>
                    {[
                        {key: "threat_score", label: "Threat"},
                        {key: "severity", label: "Severity"},
                        {key: "grounding", label: "Grounding"},
                        {key: "created_at", label: "Created"},
                        {key: "title", label: "Title"},
                    ].map((opt) => (
                        <button
                            key={opt.key}
                            type="button"
                            title={`Sort by ${opt.label}`}
                            onClick={() => toggleSort(opt.key)}
                            className={`px-2 py-1 rounded border ${
                                sort?.key === opt.key
                                    ? "border-primary/40 text-primary"
                                    : "border-border text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {opt.label}
                            {sort?.key === opt.key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                    ))}
                </div>
            )}

            {loadError && (
                <ListState variant="error" testid="review-load-error" message={loadError}/>
            )}
            {loading && (
                <ListState variant="loading" testid="review-loading" message="Loading queue…"/>
            )}
            {!loading && !loadError && filtered.length === 0 && (
                <ListState
                    variant="empty"
                    testid="review-empty"
                    message={items.length ? "No queue items match your filters." : "No incidents currently require review."}
                />
            )}

            {view === "cards" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {pageRows.map((inc) => {
                        const isSelected = selectedIds.has(inc.id);
                        const groundingScore = Number(inc.playbook?.grounding_score);
                        const isLowGrounding = Number.isFinite(groundingScore) && groundingScore < groundingThreshold;

                        const card = (
                            <div
                                key={inc.id}
                                className={`soc-card p-4 border transition-colors relative block h-full ${
                                    isSelected ? "border-primary bg-primary/5" : "border-[var(--warning-border)] hover:border-[var(--warning)]"
                                }`}
                            >
                                <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
                                    <SlaBadge createdAt={inc.created_at}/>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            toggleSelectItem(inc.id);
                                        }}
                                        className="text-muted-foreground hover:text-primary"
                                        aria-label="Select card"
                                    >
                                        {isSelected ? <CheckSquare size={18} weight="fill" className="text-primary"/> :
                                            <Square size={18}/>}
                                    </button>
                                </div>
                                <div className="pr-16">
                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                        <SeverityBadge severity={inc.severity}/>
                                        {isLowGrounding && (
                                            <span
                                                className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-warning-soft text-warning border border-[var(--warning-border)]">
                        Low Grounding ({groundingScore})
                      </span>
                                        )}
                                    </div>
                                    <Link
                                        to={`/incidents/${inc.id}`}
                                        data-testid={`queue-${inc.id}`}
                                        className="block"
                                        title="Open incident for review"
                                    >
                                        <div className="text-lg font-semibold mt-2 truncate">{inc.title}</div>
                                        <div className="soc-mono text-[10px] text-muted-foreground mt-1"
                                             title={inc.id}>{inc.id}</div>
                                    </Link>
                                </div>

                                <div
                                    className="mt-4 pt-3 border-t border-border grid grid-cols-4 gap-2 text-[11px] items-center">
                                    <div title="Playbook Citation Grounding Score">
                                        <div className="soc-label">Grounding</div>
                                        <div
                                            className={`font-mono text-lg font-bold ${isLowGrounding ? "text-warning" : "text-success"}`}>
                                            {Number.isFinite(groundingScore) ? groundingScore : "—"}
                                        </div>
                                    </div>
                                    <div title="Extracted indicators">
                                        <div className="soc-label">IoCs</div>
                                        <div
                                            className="font-mono text-primary font-semibold text-base">{inc.iocs?.length || 0}</div>
                                    </div>
                                    <div title="Mapped ATT&CK techniques">
                                        <div className="soc-label">Techs</div>
                                        <div
                                            className="font-mono text-primary font-semibold text-base">{inc.techniques?.length || 0}</div>
                                    </div>
                                    <div title="Composite threat score 0–100">
                                        <div className="soc-label">Threat</div>
                                        <div
                                            className={`font-mono font-semibold text-base ${Number(inc.threat_score) >= highThreat ? "text-error" : "text-warning"}`}>
                                            {inc.threat_score}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center justify-between pt-2">
                                    {inc.techniques?.length > 0 ? (
                                        <div className="flex flex-wrap gap-1 max-w-[65%]">
                                            {inc.techniques.slice(0, 4).map((t) => (
                                                <span key={t.technique_id}
                                                      className="font-mono text-[9px] text-primary/80 bg-primary/10 px-1 py-0.5 rounded"
                                                      title={t.name}>
                          {t.technique_id}
                        </span>
                                            ))}
                                        </div>
                                    ) : <div/>}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Link
                                            to={`/audit?q=${inc.id}`}
                                            className="p-1.5 rounded border border-border hover:border-primary hover:text-primary text-muted-foreground inline-flex items-center"
                                            title="View compliance audit trail for this case"
                                        >
                                            <ShieldCheck size={15}/>
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => openReviewModal([inc.id], "approve")}
                                            className="text-[11px] px-2.5 py-1 rounded border border-success/40 text-success hover:bg-success-soft font-medium"
                                            title="Quick approve with audit comment"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openReviewModal([inc.id], "reject")}
                                            className="text-[11px] px-2.5 py-1 rounded border border-[var(--error-border)] text-error hover:bg-error-soft font-medium"
                                            title="Quick reject with audit comment"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                        if (!showPreviews) return <div key={inc.id}>{card}</div>;
                        return (
                            <HoverCard key={inc.id} openDelay={200} closeDelay={80}>
                                <HoverCardTrigger asChild>{card}</HoverCardTrigger>
                                <HoverCardContent
                                    side="right"
                                    collisionPadding={16}
                                    className="w-80 max-w-[min(20rem,calc(100vw-1.5rem))] bg-card border border-amber-500/30 text-foreground p-3 shadow-xl z-[200]"
                                >
                                    <div className="text-[10px] uppercase tracking-wide text-warning/90 mb-2">Quick
                                        preview
                                    </div>
                                    <IncidentPreview inc={inc}/>
                                </HoverCardContent>
                            </HoverCard>
                        );
                    })}
                </div>
            )}

            {view === "table" && filtered.length > 0 && (
                <div className="soc-card overflow-hidden p-0">
                    <DataTable
                        className={compact ? "text-[12px]" : ""}
                        aria-label="Review queue"
                        testid="review-table"
                    >
                        <thead>
                        <tr>
                            <th className="w-10 px-3 py-2.5">
                                <button
                                    type="button"
                                    onClick={toggleSelectAll}
                                    aria-label="Select all rows on page"
                                    className="text-muted-foreground hover:text-primary"
                                >
                                    {selectedIds.size === pageRows.length && pageRows.length > 0 ? (
                                        <CheckSquare size={16} weight="fill" className="text-primary"/>
                                    ) : (
                                        <Square size={16}/>
                                    )}
                                </button>
                            </th>
                            <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.title}/>
                            <SortableTh label="Severity" sortKey="severity" sort={sort} onSort={toggleSort}
                                        help={COL_HELP.severity}/>
                            <SortableTh label="Threat" sortKey="threat_score" sort={sort} onSort={toggleSort}
                                        align="right" help={COL_HELP.threat_score}/>
                            <SortableTh label="Grounding" sortKey="grounding" sort={sort} onSort={toggleSort}
                                        align="right" help={COL_HELP.grounding}/>
                            <SortableTh label="IoCs" sortKey="iocs" sort={sort} onSort={toggleSort} align="right"
                                        help={COL_HELP.iocs}/>
                            <SortableTh label="Techniques" sortKey="techniques" sort={sort} onSort={toggleSort}
                                        align="right" help={COL_HELP.techniques}/>
                            <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={toggleSort}
                                        align="right" help={COL_HELP.created_at}/>
                            <th className="px-3 py-2.5 text-right">Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {pageRows.map((inc) => {
                            const isSelected = selectedIds.has(inc.id);
                            const groundingScore = Number(inc.playbook?.grounding_score);
                            const isLowGrounding = Number.isFinite(groundingScore) && groundingScore < groundingThreshold;

                            const titleLink = (
                                <Link
                                    to={`/incidents/${inc.id}`}
                                    data-testid={`queue-${inc.id}`}
                                    className="text-[13px] hover:text-primary font-medium"
                                    title={inc.summary || inc.title}
                                >
                                    {inc.title}
                                </Link>
                            );
                            return (
                                <tr key={inc.id} className={isSelected ? "bg-primary/5" : ""}>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}>
                                        <button
                                            type="button"
                                            onClick={() => toggleSelectItem(inc.id)}
                                            aria-label={`Select row ${inc.title}`}
                                            className="text-muted-foreground hover:text-primary"
                                        >
                                            {isSelected ?
                                                <CheckSquare size={16} weight="fill" className="text-primary"/> :
                                                <Square size={16}/>}
                                        </button>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {showPreviews ? (
                                                <HoverCard openDelay={150}>
                                                    <HoverCardTrigger asChild>{titleLink}</HoverCardTrigger>
                                                    <HoverCardContent
                                                        collisionPadding={16}
                                                        className="w-80 max-w-[min(20rem,calc(100vw-1.5rem))] bg-card border border-[var(--warning-border)] p-3 z-[200]"
                                                    >
                                                        <IncidentPreview inc={inc}/>
                                                    </HoverCardContent>
                                                </HoverCard>
                                            ) : (
                                                titleLink
                                            )}
                                            <SlaBadge createdAt={inc.created_at}/>
                                            {isLowGrounding && (
                                                <span
                                                    className="text-[9px] uppercase px-1 rounded bg-warning-soft text-warning border border-[var(--warning-border)]">
                            Low G ({groundingScore})
                          </span>
                                            )}
                                        </div>
                                        <div className="soc-mono text-[10px] text-muted-foreground/80"
                                             title={inc.id}>{inc.id?.slice(0, 8)}</div>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}><SeverityBadge
                                        severity={inc.severity}/></td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] ${Number(inc.threat_score) >= highThreat ? "text-error" : "text-warning"}`}>
                                        {inc.threat_score}
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] ${isLowGrounding ? "text-warning font-bold" : "text-success"}`}>
                                        {Number.isFinite(groundingScore) ? groundingScore : "—"}
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px]`}>{inc.iocs?.length ?? 0}</td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] text-primary`}>{inc.techniques?.length ?? 0}</td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right text-[11px] text-muted-foreground soc-mono`}
                                        title={formatDateTime(inc.created_at)}>
                                        {inc.created_at ? formatDateTime(inc.created_at, {showStandard: false}) : "—"}
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right space-x-1.5 whitespace-nowrap`}>
                                        <Link
                                            to={`/audit?q=${inc.id}`}
                                            className="p-1 rounded border border-border hover:border-primary hover:text-primary text-muted-foreground inline-flex items-center align-middle"
                                            title="View compliance audit trail for this case"
                                        >
                                            <ShieldCheck size={14}/>
                                        </Link>
                                        <button
                                            type="button"
                                            onClick={() => openReviewModal([inc.id], "approve")}
                                            className="text-[11px] px-2 py-0.5 rounded border border-success/40 text-success hover:bg-success-soft font-medium"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openReviewModal([inc.id], "reject")}
                                            className="text-[11px] px-2 py-0.5 rounded border border-[var(--error-border)] text-error hover:bg-error-soft font-medium"
                                        >
                                            Reject
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </DataTable>
                </div>
            )}

            {filtered.length > 0 && (
                <PaginationBar
                    page={page}
                    pageSize={pageSize}
                    total={filtered.length}
                    onPageChange={setPage}
                    testid="review-pagination"
                    className="mt-3"
                />
            )}
        </div>
    );
}