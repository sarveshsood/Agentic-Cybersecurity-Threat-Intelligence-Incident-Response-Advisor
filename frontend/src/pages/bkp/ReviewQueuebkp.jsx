import {useEffect, useMemo, useState} from "react";
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
    DownloadSimple,
    FunnelSimple,
    ListBullets,
    ListChecks,
    MagnifyingGlass,
    SquaresFour,
    X
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
    const showPreviews = prefs.show_incident_previews !== false;
    const highThreat = Number(prefs.high_threat_score_threshold) || 70;
    const compact = prefs.compact_tables;
    const pageSize = 25;

    const initialSort = parseSortSpec(prefs.review_default_sort) || {key: "threat_score", dir: "desc"};
    const {sorted, sort, toggleSort} = useSortableData(items, initialSort, ACCESSORS);

    useEffect(() => {
        setLoading(true);
        api
            .get("/review/queue")
            .then((r) => {
                setItems(Array.isArray(r.data) ? r.data : []);
                setLoadError(null);
            })
            .catch((e) => {
                setItems([]);
                setLoadError(e?.userMessage || e?.response?.data?.detail || "Could not load review queue");
            })
            .finally(() => setLoading(false));
    }, []);

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

    const exportRows = () => {
        const {headers, rows} = incidentsToCsvRows(filtered);
        downloadCsv(`actira-review-queue-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
        toast.success(`Exported ${rows.length} case${rows.length === 1 ? "" : "s"}`);
    };

    const hasFilters =
        q || severity || minThreat > 0 || maxGrounding < 1 || technique || minTechniques > 0 || minIocs > 0;

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
                }
            />

            <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <div className="flex flex-wrap items-center gap-2 text-xs max-w-full" data-testid="review-filter-bar">
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
                        const card = (
                            <Link
                                to={`/incidents/${inc.id}`}
                                data-testid={`queue-${inc.id}`}
                                className="soc-card p-4 border border-[var(--warning-border)] hover:border-[var(--warning)] transition-colors relative block h-full"
                                title="Open incident for review"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <SeverityBadge severity={inc.severity}/>
                                        <div className="text-lg font-semibold mt-2 truncate">{inc.title}</div>
                                        <div className="soc-mono text-[10px] text-muted-foreground mt-1"
                                             title={inc.id}>{inc.id}</div>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className="soc-label flex items-center justify-end gap-1">
                                            Grounding
                                            <HelpTip
                                                title="Grounding"
                                                body="Citation quality of the draft playbook. Below threshold forces this HiTL item."
                                                className="!w-3.5 !h-3.5"
                                                iconSize={10}
                                            />
                                        </div>
                                        <div className="font-mono text-2xl text-success">
                                            {inc.playbook?.grounding_score ?? "—"}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                                    <div title="Extracted indicators">
                                        <div className="soc-label">IoCs</div>
                                        <div className="font-mono text-primary">{inc.iocs?.length || 0}</div>
                                    </div>
                                    <div title="Mapped ATT&CK techniques">
                                        <div className="soc-label">Techniques</div>
                                        <div className="font-mono text-primary">{inc.techniques?.length || 0}</div>
                                    </div>
                                    <div title="Composite threat score 0–100">
                                        <div className="soc-label">Threat</div>
                                        <div
                                            className={`font-mono ${Number(inc.threat_score) >= highThreat ? "text-error" : "text-warning"}`}>
                                            {inc.threat_score}
                                        </div>
                                    </div>
                                </div>
                                {inc.techniques?.length > 0 && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                        {inc.techniques.slice(0, 5).map((t) => (
                                            <span key={t.technique_id} className="font-mono text-[9px] text-primary/80"
                                                  title={t.name}>
                        {t.technique_id}
                      </span>
                                        ))}
                                    </div>
                                )}
                            </Link>
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
                        </tr>
                        </thead>
                        <tbody>
                        {pageRows.map((inc) => {
                            const titleLink = (
                                <Link
                                    to={`/incidents/${inc.id}`}
                                    data-testid={`queue-${inc.id}`}
                                    className="text-[13px] hover:text-primary"
                                    title={inc.summary || inc.title}
                                >
                                    {inc.title}
                                </Link>
                            );
                            return (
                                <tr key={inc.id}>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}>
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
                                        <div className="soc-mono text-[10px] text-muted-foreground/80"
                                             title={inc.id}>{inc.id?.slice(0, 8)}</div>
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"}`}><SeverityBadge
                                        severity={inc.severity}/></td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] ${Number(inc.threat_score) >= highThreat ? "text-error" : "text-warning"}`}>
                                        {inc.threat_score}
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] text-success`}>
                                        {inc.playbook?.grounding_score ?? "—"}
                                    </td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px]`}>{inc.iocs?.length ?? 0}</td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono text-[11px] text-primary`}>{inc.techniques?.length ?? 0}</td>
                                    <td className={`px-3 ${compact ? "py-1.5" : "py-2.5"} text-right text-[11px] text-muted-foreground soc-mono`}
                                        title={formatDateTime(inc.created_at)}>
                                        {inc.created_at ? formatDateTime(inc.created_at, {showStandard: false}) : "—"}
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
