import {useCallback, useEffect, useState} from "react";
import {Link, useNavigate, useParams, useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {SeverityBadge, StatusPill} from "../components/SeverityBadge";
import {ListState} from "../components/ListState";
import {toast} from "sonner";
import {useAuth} from "../lib/auth";
import {Popover, PopoverContent, PopoverTrigger} from "../components/ui/popover";
import {
    ArrowsClockwise,
    CheckCircle,
    Clock,
    Copy,
    ShieldCheck,
    Stack,
    Warning,
    X,
    XCircle,
} from "@phosphor-icons/react";
import CorrelationPanel from "../components/CorrelationPanel";
import AIInvestigator from "../components/AIInvestigator";
import TechniquePanel from "../components/TechniquePanel";
import WorkspaceTabs, {WORKSPACE_TAB_IDS} from "../components/workspace/WorkspaceTabs";
import InvestigationTimeline from "../components/workspace/InvestigationTimeline";
import EntityGraph, {EntityTypeTable} from "../components/workspace/EntityGraph";
import NotesNotebook, {RecommendationsPanel} from "../components/workspace/NotesNotebook";
import BehaviorPanel from "../components/workspace/BehaviorPanel";
import {PageHeader} from "../design-system";
import {HelpTip, PaneLabel, Tip} from "../components/HelpTip";
import {pushRecentIncident} from "../lib/recentActivity";
import {formatDateTime} from "../lib/uiPrefs";
import {isFeatureEnabled} from "../lib/features";
import AssignPanel from "../components/collab/AssignPanel";
import CommentsPanel from "../components/collab/CommentsPanel";
import PinButton from "../components/collab/PinButton";

const PHASE_META = {
    containment: {color: "text-warning border-[var(--warning-border)] bg-warning-soft", label: "Containment"},
    eradication: {color: "text-error border-[var(--error-border)] bg-error-soft", label: "Eradication"},
    recovery: {color: "text-success border-[var(--success-border)] bg-success-soft", label: "Recovery"},
    lessons_learned: {color: "text-primary border-primary/40 bg-primary/10", label: "Lessons Learned"},
};

function CitationChip({id}) {
    const [doc, setDoc] = useState(null);
    const load = () => {
        if (!doc) api.get(`/kb/${id}`).then(r => setDoc(r.data));
    };
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    data-testid={`cite-${id}`}
                    onClick={load}
                    className="citation-chip"
                    title={`Open knowledge-base citation ${id}`}
                >
                    {id}
                </button>
            </PopoverTrigger>
            <PopoverContent className="w-96 bg-background border-border text-foreground">
                {doc ? (
                    <div>
                        <div className="soc-label mb-1">{doc.source}</div>
                        <div className="font-semibold text-sm mb-2">{doc.title}</div>
                        <div className="text-[12px] text-muted-foreground leading-relaxed">{doc.text}</div>
                    </div>
                ) : <div className="text-xs text-muted-foreground">Loading…</div>}
            </PopoverContent>
        </Popover>
    );
}

async function copyIncidentId(id) {
    try {
        await navigator.clipboard.writeText(id);
        toast.success("Incident ID copied");
    } catch {
        toast.error("Could not copy ID");
    }
}

export default function IncidentDetail() {
    const {id} = useParams();
    const nav = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const {user} = useAuth();
    const [inc, setInc] = useState(null);
    const [similar, setSimilar] = useState(null);
    const [similarErr, setSimilarErr] = useState(null);
    const [selectedTech, setSelectedTech] = useState(null);
    const [rca, setRca] = useState(null);
    const [rcaBusy, setRcaBusy] = useState(false);
    const [selectedEntity, setSelectedEntity] = useState(null);

    // Compliance Triage Audit Modal State
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewActionType, setReviewActionType] = useState("approve");
    const [reviewComment, setReviewComment] = useState("");
    const [reviewBusy, setReviewBusy] = useState(false);

    const rawTab = searchParams.get("tab") || "case";
    const activeTab = WORKSPACE_TAB_IDS.includes(rawTab) ? rawTab : "case";
    const setActiveTab = (tabId) => {
        const next = new URLSearchParams(searchParams);
        next.set("tab", tabId);
        setSearchParams(next, {replace: true});
    };

    const [loadError, setLoadError] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        setLoadError(null);
        return api
            .get(`/incidents/${id}`)
            .then((r) => {
                setInc(r.data);
                pushRecentIncident({
                    id: r.data?.id || id,
                    title: r.data?.title,
                    severity: r.data?.severity,
                });
            })
            .catch((e) => {
                setInc(null);
                const status = e?.response?.status;
                const detail = e?.response?.data?.detail || e?.userMessage || e?.message;
                if (status === 404) {
                    setLoadError("Incident not found (404). It may have been deleted or the ID is invalid.");
                } else {
                    setLoadError(detail || "Could not load incident.");
                }
            })
            .finally(() => setLoading(false));
    }, [id]);
    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!id) return;
        api
            .get(`/incidents/${id}/workspace/rca`)
            .then((r) => setRca(r.data?.rca ?? null))
            .catch(() => setRca(null));
    }, [id]);

    const generateRca = async () => {
        if (rca && !window.confirm("Regenerate and replace existing RCA?")) return;
        setRcaBusy(true);
        try {
            const r = await api.post(`/incidents/${id}/workspace/rca`);
            setRca(r.data?.rca ?? null);
            toast.success(r.data?.rca?.fallback ? "RCA saved (fallback template)" : "RCA generated");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "RCA generation failed");
        } finally {
            setRcaBusy(false);
        }
    };

    useEffect(() => {
        if (!id) return;
        setSimilar(null);
        setSimilarErr(null);
        api
            .get(`/incidents/${id}/similar?top_k=5`)
            .then((r) => setSimilar(r.data))
            .catch((e) => setSimilarErr(e?.response?.data?.detail || "Could not load similar cases"));
    }, [id]);

    const openReviewModal = (action) => {
        setReviewActionType(action);
        setReviewComment("");
        setShowReviewModal(true);
    };

    const handleExecuteReview = async () => {
        const comment = reviewComment.trim();
        if (!comment) {
            toast.error("Compliance policy requires a justification comment for review actions.");
            return;
        }

        setReviewBusy(true);
        try {
            await api.post(`/incidents/${id}/review`, {
                action: reviewActionType,
                comment: comment,
            });
            toast.success(`Successfully ${reviewActionType === "approve" ? "approved" : "rejected"} incident. Audit record created.`);
            setShowReviewModal(false);
            setReviewComment("");
            load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Review execution failed");
        } finally {
            setReviewBusy(false);
        }
    };

    if (loading && !inc) {
        return (
            <div data-testid="incident-detail">
                <ListState variant="loading" message="Loading incident…" testid="incident-loading"/>
            </div>
        );
    }

    if (loadError || !inc) {
        return (
            <div data-testid="incident-detail" className="space-y-4">
                <ListState
                    variant="error"
                    message={loadError || "Incident unavailable"}
                    testid="incident-load-error"
                />
                <Link to="/incidents" className="soc-btn-secondary !text-xs inline-flex">
                    ← Back to incidents
                </Link>
            </div>
        );
    }

    const canReview = ["senior_reviewer", "admin"].includes(user?.role) && inc.status === "pending_review";
    const pb = inc.playbook;
    const phases = ["containment", "eradication", "recovery", "lessons_learned"];

    return (
        <div data-testid="incident-detail" className="space-y-6">
            {/* Unified Triage Audit Justification Modal */}
            {showReviewModal && (
                <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-sm grid place-items-center p-4">
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
                            className="font-semibold text-foreground">{reviewActionType}</span> of incident <span
                            className="font-mono">{inc.id?.slice(0, 8)}</span>. This is permanently logged for audit
                            trails.
                        </p>

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
                            <Tip content="Close without recording a review decision">
                                <button
                                    type="button"
                                    onClick={() => setShowReviewModal(false)}
                                    className="soc-btn-secondary !text-xs !py-1.5"
                                >
                                    Cancel
                                </button>
                            </Tip>
                            <Tip content="Submit decision with justification — permanently logged to the audit trail">
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
                            </Tip>
                        </div>
                    </div>
                </div>
            )}

            <PageHeader
                testid="incident-detail-header"
                title={inc.title}
                tip={
                    <HelpTip
                        title="Investigation Workspace"
                        body="Case hub for one incident: evidence, timeline, entities, TI, ATT&CK, notes, RCA, and playbooks. Use tabs below to switch views (hover each tab for a short description). HiTL approve/reject appears when review is required."
                        how="Tabs sync to ?tab= in the URL so deep links and browser back work."
                        testid="tip-workspace-page"
                    />
                }
                breadcrumb={
                    <>
                        <Tip content="Back to incident cases list">
                            <Link to="/incidents" className="hover:text-primary">Incidents</Link>
                        </Tip>
                        <span aria-hidden>/</span>
                        <Tip content={inc.id}>
                            <span className="font-mono text-foreground/80">{inc.id?.slice(0, 8)}</span>
                        </Tip>
                    </>
                }
                subtitle={
                    <span className="flex flex-wrap items-center gap-2 mt-1">
                        <SeverityBadge severity={inc.severity}/>
                        <StatusPill status={inc.status}/>
                        {inc.hitl_required && (
                            <Tip content="Human-in-the-Loop gate: senior review required before playbook use (severity and/or low grounding).">
                                <span
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--warning-border)] text-warning bg-warning-soft text-[10px] uppercase tracking-[0.08em] font-semibold">
                                    <Warning size={11} weight="fill"/> HiTL Gate
                                </span>
                            </Tip>
                        )}
                        <Tip content="Click to copy full incident ID">
                            <button
                                type="button"
                                className="soc-mono text-[11px] text-muted-foreground hover:text-primary inline-flex items-center gap-1"
                                onClick={() => copyIncidentId(inc.id)}
                                data-testid="copy-incident-id"
                            >
                                {inc.id}
                                <Copy size={11}/>
                            </button>
                        </Tip>
                    </span>
                }
                actions={
                    <div className="flex items-center gap-3">
                        {isFeatureEnabled("pins") && (
                            <PinButton targetType="incident" targetId={inc.id} label={inc.title}/>
                        )}
                        <Tip content="Reload this incident from the server">
                            <button
                                type="button"
                                onClick={() => load()}
                                disabled={loading}
                                className="soc-btn-secondary !text-xs !px-3 !py-2 inline-flex items-center gap-1.5 h-auto disabled:opacity-50"
                                data-testid="incident-refresh-btn"
                            >
                                <ArrowsClockwise size={14} className={loading ? "animate-spin" : ""}/>
                                Refresh
                            </button>
                        </Tip>
                        <Tip content="View immutable compliance audit history for this case">
                            <Link
                                to={`/audit?q=${inc.id}`}
                                className="soc-btn-secondary !text-xs !px-3 !py-2 inline-flex items-center gap-1.5 h-auto"
                                data-testid="view-audit-trail-btn"
                            >
                                <ShieldCheck size={15} className="text-primary"/>
                                Audit Trail
                            </Link>
                        </Tip>

                        <div className="grid grid-cols-2 gap-2 text-right shrink-0">
                            {/* Do not wrap cards in Tip — conflicts with HelpTip HoverCard */}
                            <div className="soc-card px-3 py-2" title="Composite threat score 0–100">
                                <PaneLabel
                                    title="Threat score"
                                    body="Composite risk score for this incident from severity, IoC enrichment, and techniques."
                                    how="Pipeline threat_score field · higher = more urgent triage."
                                    testid="tip-case-threat"
                                    className="justify-end"
                                >
                                    Threat
                                </PaneLabel>
                                <div
                                    className="font-mono text-primary text-xl"
                                    aria-label={`Threat score ${inc.threat_score}`}
                                >
                                    {inc.threat_score}
                                </div>
                            </div>
                            <div
                                className="soc-card px-3 py-2"
                                title="Playbook grounding 0–1 · low scores force HiTL"
                            >
                                <PaneLabel
                                    title="Grounding score"
                                    body="Share of playbook steps with valid knowledge-base citations (0–1). Low scores force HiTL review."
                                    how="valid citations / total steps on the generated playbook."
                                    testid="tip-case-grounding"
                                    className="justify-end"
                                >
                                    Grounding
                                </PaneLabel>
                                <div
                                    className="font-mono text-success text-xl"
                                    aria-label={`Grounding ${pb?.grounding_score ?? "none"}`}
                                >
                                    {pb?.grounding_score ?? "—"}
                                </div>
                            </div>
                        </div>
                    </div>
                }
            >
                {inc.summary &&
                    <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-4xl">{inc.summary}</p>}
                <Tip content="Return to the previous page in browser history">
                    <button
                        type="button"
                        onClick={() => nav(-1)}
                        className="text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
                        data-testid="incident-back-btn"
                    >
                        ← Back
                    </button>
                </Tip>
            </PageHeader>

            <WorkspaceTabs active={activeTab} onChange={setActiveTab}/>

            <div className="pt-4 space-y-6" data-testid={`workspace-panel-${activeTab}`}>
                {activeTab === "case" && (isFeatureEnabled("collab_assign") || isFeatureEnabled("collab_comments")) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="collab-case-row">
                        {isFeatureEnabled("collab_assign") && (
                            <AssignPanel incident={inc} onUpdated={(d) => setInc((prev) => ({...prev, ...d}))}/>
                        )}
                        {isFeatureEnabled("collab_comments") && (
                            <CommentsPanel incidentId={inc.id}/>
                        )}
                    </div>
                )}
                {/* HiTL always available on Case / Playbooks when pending */}
                {canReview && (activeTab === "case" || activeTab === "playbooks") && (
                    <div className="soc-card p-4 border border-[var(--warning-border)]" data-testid="hitl-panel">
                        <div className="flex items-center gap-2 mb-3">
                            <Warning size={16} className="text-warning"/>
                            <PaneLabel
                                className="text-warning"
                                title="HiTL review"
                                body="This case needs a senior reviewer: severity ≥ hitl_severity_min and/or playbook grounding below threshold. Approve or reject with a mandatory justification (audit trail)."
                                how="Settings → Detection thresholds control who lands in pending_review."
                                testid="tip-workspace-hitl"
                            >
                                Human-in-the-Loop Review Required
                            </PaneLabel>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                            Review this playbook and authorize its remediation steps or reject it. Clicking either
                            action will open the compliance justification modal.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <Tip content="Approve playbook for use — requires a written justification for the audit trail">
                                <button
                                    type="button"
                                    data-testid="approve-btn"
                                    onClick={() => openReviewModal("approve")}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--success)] text-white text-xs font-semibold rounded-lg transition-colors hover:brightness-95"
                                >
                                    <CheckCircle size={14} weight="fill"/> Approve Playbook
                                </button>
                            </Tip>
                            <Tip content="Reject playbook — requires a written justification for the audit trail">
                                <button
                                    type="button"
                                    data-testid="reject-btn"
                                    onClick={() => openReviewModal("reject")}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--error)] text-white text-xs font-semibold rounded-lg transition-colors hover:brightness-95"
                                >
                                    <XCircle size={14} weight="fill"/> Reject Playbook
                                </button>
                            </Tip>
                        </div>
                    </div>
                )}

                {activeTab === "case" && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                        <div className="xl:col-span-8 space-y-6">
                            {inc.correlation && <CorrelationPanel correlation={inc.correlation}/>}
                            <div className="soc-card p-4" data-testid="workspace-rca-card">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                        <PaneLabel
                                            title="Root cause analysis"
                                            body="LLM narrative grounded only to this incident’s attack chain, IoCs, and ATT&CK techniques — not free-form hallucination of external intel."
                                            how="POST /incidents/{id}/workspace/rca · pipeline fields only."
                                            testid="tip-workspace-rca"
                                        >
                                            Root cause analysis
                                        </PaneLabel>
                                        <div className="text-[11px] text-muted-foreground mt-0.5">
                                            Grounded to attack chain, IoCs, and ATT&CK (pipeline fields only)
                                        </div>
                                    </div>
                                    <Tip content={rca ? "Regenerate RCA narrative (replaces existing)" : "Generate grounded root-cause narrative via LLM"}>
                                        <button
                                            type="button"
                                            data-testid="rca-generate-btn"
                                            disabled={rcaBusy}
                                            onClick={generateRca}
                                            className="soc-btn-primary !text-xs !py-1.5 disabled:opacity-50"
                                        >
                                            {rcaBusy ? "Generating…" : rca ? "Regenerate RCA" : "Generate RCA"}
                                        </button>
                                    </Tip>
                                </div>
                                {!rca && (
                                    <p className="text-xs text-muted-foreground">No RCA yet — generate to produce a narrative.</p>
                                )}
                                {rca && (
                                    <div className="space-y-2 text-sm">
                                        {rca.fallback && (
                                            <div className="text-[11px] text-warning border border-[var(--warning-border)] rounded px-2 py-1 bg-warning-soft">
                                                Fallback RCA: {rca.fallback_reason || "LLM unavailable"}
                                            </div>
                                        )}
                                        {rca.hypothesis && (
                                            <div className="text-xs">
                                                <span className="soc-label">Hypothesis</span>
                                                <p className="mt-0.5 text-foreground">{rca.hypothesis}</p>
                                            </div>
                                        )}
                                        <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{rca.narrative}</p>
                                        {rca.mitre_refs?.length > 0 && (
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {rca.mitre_refs.map((t) => (
                                                    <span key={t} className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-primary/30 text-primary">{t}</span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <BehaviorPanel incidentId={inc.id}/>
                            <EntityGraph
                                incidentId={inc.id}
                                selectedId={selectedEntity}
                                onSelectNode={(n) => {
                                    setSelectedEntity(n.label || n.id);
                                    setActiveTab("timeline");
                                }}
                            />
                            <AIInvestigator incidentId={inc.id} severity={inc.severity}/>
                        </div>
                        <div className="xl:col-span-4 space-y-6">
                            <div className="soc-card p-4" data-testid="similar-incidents">
                                <PaneLabel
                                    className="mb-1"
                                    title="Similar cases"
                                    body="Nearest-neighbor search over incident embeddings to surface past cases with related attack patterns."
                                    how="GET /incidents/{id}/similar · LanceDB ANN over embeddings (excludes self)."
                                    testid="tip-similar-cases"
                                >
                                    <span className="inline-flex items-center gap-1">
                                        <Stack size={12} className="text-primary"/> Similar cases
                                    </span>
                                </PaneLabel>
                                <p className="text-[10px] text-muted-foreground mb-3">
                                    LanceDB ANN over incident embeddings
                                </p>
                                {similarErr && <div className="text-[11px] text-error">{similarErr}</div>}
                                {!similarErr && !similar && (
                                    <div className="text-[11px] text-muted-foreground">Loading similar…</div>
                                )}
                                {similar && (
                                    (similar.items || []).length === 0 ? (
                                        <div className="text-[11px] text-muted-foreground">
                                            {similar.reason || "No similar cases found."}
                                        </div>
                                    ) : (
                                        <ul className="space-y-2">
                                            {similar.items.map((s) => (
                                                <li key={s.id} className="border border-border rounded p-2">
                                                    <Link to={`/incidents/${s.id}`} className="text-[12px] text-primary hover:underline font-medium" data-testid={`similar-${s.id}`}>
                                                        {s.title || s.id}
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    )
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "evidence" && (
                    <div className="space-y-4">
                        <div className="soc-card p-4">
                            <PaneLabel
                                className="mb-3"
                                title="Source files"
                                body="Files and packages that were ingested for this incident job (filenames / meta from upload)."
                                testid="tip-evidence-files"
                            >
                                Source files
                            </PaneLabel>
                            {(inc.files_meta || []).length === 0 ? (
                                <p className="text-xs text-muted-foreground">No files_meta on this incident.</p>
                            ) : (
                                <ul className="space-y-2 text-xs font-mono">
                                    {inc.files_meta.map((f, i) => (
                                        <li key={i} className="border border-border rounded px-2 py-1.5">
                                            {typeof f === "string" ? f : (f.name || f.filename || JSON.stringify(f))}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="soc-card p-4">
                            <PaneLabel
                                className="mb-3"
                                title="Pipeline timeline"
                                body="Stage timestamps from the IR pipeline run that created this case (ingest → normalize → enrich → playbook)."
                                testid="tip-evidence-pipeline"
                            >
                                Pipeline timeline
                            </PaneLabel>
                            <ol className="space-y-2">
                                {inc.timeline?.map((t, i) => (
                                    <li key={i} className="flex gap-3 text-xs" data-testid={`tl-${i}`}>
                                        <Clock size={12} className="text-primary mt-0.5"/>
                                        <div>
                                            <div className="text-foreground">{t.label}</div>
                                            <div className="text-muted-foreground soc-mono text-[10px]">
                                                {formatDateTime(t.ts || inc.created_at)} — {t.detail}
                                            </div>
                                        </div>
                                    </li>
                                ))}
                                {(!inc.timeline || inc.timeline.length === 0) && (
                                    <li className="text-xs text-muted-foreground">No pipeline events</li>
                                )}
                            </ol>
                        </div>
                    </div>
                )}

                {activeTab === "playbooks" && (
                    <div className="soc-card p-4">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <PaneLabel
                                    title="Response playbook"
                                    body="Citation-grounded IR steps by phase (containment → eradication → recovery → lessons). Click citation chips to open KB excerpts."
                                    how={`Generated by ${pb?.llm_provider || "—"}/${pb?.llm_model || "—"} · grounding ${pb?.grounding_score ?? "—"}`}
                                    testid="tip-playbook"
                                >
                                    Response Playbook
                                </PaneLabel>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                    Generated by {pb?.llm_provider}/{pb?.llm_model} · grounding {pb?.grounding_score}
                                </div>
                            </div>
                        </div>
                        <div className="space-y-6">
                            {phases.map((ph) => {
                                const steps = (pb?.steps || []).filter((s) => s.phase === ph);
                                if (!steps.length) return null;
                                const meta = PHASE_META[ph];
                                return (
                                    <div key={ph}>
                                        <div className={`inline-flex px-2 py-0.5 rounded border text-[10px] uppercase tracking-[0.14em] font-semibold mb-2 ${meta.color}`}>
                                            {meta.label}
                                        </div>
                                        <ol className="space-y-2.5">
                                            {steps.map((s) => (
                                                <li key={s.order} className="flex gap-3 group" data-testid={`step-${s.order}`}>
                                                    <div className="soc-mono text-muted-foreground text-xs w-6 shrink-0 pt-0.5">{String(s.order).padStart(2, "0")}</div>
                                                    <div className="flex-1">
                                                        <div className="text-sm text-foreground leading-relaxed">{s.action}</div>
                                                        {s.citation_ids?.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {s.citation_ids.map((cid) => <CitationChip key={cid} id={cid}/>)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                );
                            })}
                            {!(pb?.steps || []).length && (
                                <p className="text-xs text-muted-foreground">No playbook steps on this incident.</p>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "mitre" && (
                    <div className="soc-card p-4">
                        <PaneLabel
                            className="mb-1"
                            title="MITRE ATT&CK"
                            body="Techniques mapped by the pipeline for this incident. Click a chip for catalog drill-down (tactics, detection notes)."
                            testid="tip-mitre-panel"
                        >
                            MITRE ATT&CK ({inc.techniques?.length || 0})
                        </PaneLabel>
                        <p className="text-[10px] text-muted-foreground mb-3">Click a technique for drill-down.</p>
                        <div className="flex flex-wrap gap-1.5">
                            {inc.techniques?.map((t) => (
                                <Tip
                                    key={t.technique_id}
                                    content={`${t.technique_id}${t.name ? ` — ${t.name}` : ""}${t.tactic ? ` · ${t.tactic}` : ""}`}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setSelectedTech(t)}
                                        className="px-2 py-1 rounded bg-primary/10 border border-primary/30 text-primary text-[11px] text-left"
                                        data-testid={`tech-${t.technique_id}`}
                                    >
                                        <span className="font-mono">{t.technique_id}</span>
                                        <span className="mx-1 opacity-40">·</span>
                                        <span>{t.name}</span>
                                    </button>
                                </Tip>
                            ))}
                            {(!inc.techniques || inc.techniques.length === 0) && (
                                <div className="text-xs text-muted-foreground">None detected</div>
                            )}
                        </div>
                        <TechniquePanel technique={selectedTech} open={!!selectedTech} onClose={() => setSelectedTech(null)}/>
                    </div>
                )}

                {activeTab === "ti" && (
                    <div className="soc-card p-0 overflow-hidden">
                        <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
                            <PaneLabel
                                title="Threat intelligence"
                                body="Extracted IoCs with enrichment scores. Live TI APIs apply when keys are configured in Settings; otherwise mock/heuristic scores."
                                testid="tip-ti-panel"
                            >
                                Indicators of Compromise ({inc.iocs?.length || 0})
                            </PaneLabel>
                            {(inc.iocs?.length || 0) > 0 && (
                                <Tip content="Re-run threat-intel enrichment on stored IoCs (partial pipeline replay)">
                                    <button
                                        type="button"
                                        data-testid="replay-enrich-btn"
                                        className="text-[11px] px-2.5 py-1 rounded border border-primary/30 bg-primary/10 text-primary font-medium hover:bg-primary/20"
                                        onClick={async () => {
                                            try {
                                                const r = await api.post(
                                                    `/incidents/${inc.id}/replay-enrich`,
                                                );
                                                toast.success(
                                                    `Re-enriched ${r.data?.ioc_count ?? "?"} IoCs · score ${r.data?.threat_score ?? "—"}`,
                                                );
                                                // reload incident
                                                const again = await api.get(`/incidents/${inc.id}`);
                                                setInc(again.data);
                                            } catch (e) {
                                                toast.error(
                                                    e?.userMessage ||
                                                        e?.response?.data?.detail ||
                                                        "Replay enrich failed",
                                                );
                                            }
                                        }}
                                    >
                                        Replay enrich
                                    </button>
                                </Tip>
                            )}
                        </div>
                        <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
                            {inc.iocs?.map((i) => (
                                <div key={i.id} className="p-3" data-testid={`ioc-${i.id}`}>
                                    <div className="flex items-center justify-between">
                                        <Tip content={`Indicator type: ${i.type || "unknown"}`}>
                                            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{i.type}</span>
                                        </Tip>
                                        <Tip content={`IoC threat score 0–100${i.threat_score >= 70 ? " · high" : i.threat_score >= 40 ? " · elevated" : ""}`}>
                                            <span className={`font-mono text-[11px] ${i.threat_score >= 70 ? "text-error" : i.threat_score >= 40 ? "text-warning" : "text-success"}`}>
                                                {i.threat_score}
                                            </span>
                                        </Tip>
                                    </div>
                                    <Tip content={i.value}>
                                        <div className="ioc-chip mt-1.5 max-w-full truncate block">{i.value}</div>
                                    </Tip>
                                </div>
                            ))}
                            {(!inc.iocs || inc.iocs.length === 0) && (
                                <div className="p-4 text-xs text-muted-foreground">No IoCs extracted</div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === "timeline" && (
                    <div className="space-y-3">
                        <PaneLabel
                            title="Investigation timeline"
                            body="Chronological reconstruction of events across ingested logs. Select a node on the entity graph (Case tab) to filter by entity."
                            testid="tip-timeline-panel"
                        >
                            Investigation timeline
                        </PaneLabel>
                        {selectedEntity && (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Filtering timeline by entity:</span>
                                <span className="font-mono text-primary">{selectedEntity}</span>
                                <Tip content="Clear entity filter and show full timeline">
                                    <button
                                        type="button"
                                        className="text-muted-foreground hover:text-foreground underline"
                                        onClick={() => setSelectedEntity(null)}
                                        data-testid="timeline-clear-entity-filter"
                                    >
                                        Clear
                                    </button>
                                </Tip>
                            </div>
                        )}
                        <InvestigationTimeline
                            incidentId={inc.id}
                            filterEntity={selectedEntity}
                        />
                    </div>
                )}
                {activeTab === "assets" && (
                    <div className="space-y-4">
                        <PaneLabel
                            title="Assets"
                            body="Hosts, IPs, and domains observed in this case’s entity graph / log correlation."
                            testid="tip-assets-panel"
                        >
                            Assets
                        </PaneLabel>
                        <EntityTypeTable incidentId={inc.id} type="host" title="Hosts"/>
                        <EntityTypeTable incidentId={inc.id} type="ip" title="IP addresses"/>
                        <EntityTypeTable incidentId={inc.id} type="domain" title="Domains"/>
                    </div>
                )}
                {activeTab === "users" && (
                    <div className="space-y-3">
                        <PaneLabel
                            title="Users"
                            body="User accounts observed in the attack path or authentication events for this incident."
                            testid="tip-users-panel"
                        >
                            Users
                        </PaneLabel>
                        <EntityTypeTable incidentId={inc.id} type="user" title="Users"/>
                    </div>
                )}
                {activeTab === "notes" && <NotesNotebook incidentId={inc.id}/>}
                {activeTab === "recommendations" && (
                    <RecommendationsPanel incidentId={inc.id} playbook={pb}/>
                )}
            </div>
        </div>
    );
}