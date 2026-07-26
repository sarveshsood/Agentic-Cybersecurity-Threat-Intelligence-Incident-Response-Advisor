import {useCallback, useEffect, useState} from "react";
import {Link, useNavigate, useParams, useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {SeverityBadge, StatusPill} from "../components/SeverityBadge";
import {ListState} from "../components/ListState";
import {toast} from "sonner";
import {useAuth} from "../lib/auth";
import {Popover, PopoverContent, PopoverTrigger} from "../components/ui/popover";
import {CheckCircle, Clock, ShieldCheck, Stack, Warning, X, XCircle} from "@phosphor-icons/react";
import CorrelationPanel from "../components/CorrelationPanel";
import AIInvestigator from "../components/AIInvestigator";
import TechniquePanel from "../components/TechniquePanel";
import WorkspaceTabs, {WORKSPACE_TAB_IDS} from "../components/workspace/WorkspaceTabs";
import InvestigationTimeline from "../components/workspace/InvestigationTimeline";
import EntityGraph, {EntityTypeTable} from "../components/workspace/EntityGraph";
import NotesNotebook, {RecommendationsPanel} from "../components/workspace/NotesNotebook";
import {PageHeader} from "../design-system";
import {pushRecentIncident} from "../lib/recentActivity";
import {formatDateTime} from "../lib/uiPrefs";

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
                <button data-testid={`cite-${id}`} onClick={load} className="citation-chip">{id}</button>
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

function PlaceholderTab({title, body}) {
    return (
        <div className="soc-card p-6 text-sm text-muted-foreground" data-testid="workspace-tab-placeholder">
            <div className="soc-label text-foreground mb-2">{title}</div>
            <p className="leading-relaxed">{body}</p>
        </div>
    );
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

    const load = useCallback(
        () =>
            api.get(`/incidents/${id}`).then((r) => {
                setInc(r.data);
                pushRecentIncident({
                    id: r.data?.id || id,
                    title: r.data?.title,
                    severity: r.data?.severity,
                });
            }),
        [id],
    );
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

    if (!inc) {
        return (
            <div data-testid="incident-detail">
                <ListState variant="loading" message="Loading incident…" testid="incident-loading"/>
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

            <PageHeader
                testid="incident-detail-header"
                title={inc.title}
                breadcrumb={
                    <>
                        <Link to="/incidents" className="hover:text-primary">Incidents</Link>
                        <span aria-hidden>/</span>
                        <span className="font-mono text-foreground/80">{inc.id?.slice(0, 8)}</span>
                    </>
                }
                subtitle={
                    <span className="flex flex-wrap items-center gap-2 mt-1">
            <SeverityBadge severity={inc.severity}/>
            <StatusPill status={inc.status}/>
                        {inc.hitl_required && (
                            <span
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-[var(--warning-border)] text-warning bg-warning-soft text-[10px] uppercase tracking-[0.08em] font-semibold">
                <Warning size={11} weight="fill"/> HiTL Gate
              </span>
                        )}
                        <span className="soc-mono text-[11px] text-muted-foreground" title={inc.id}>{inc.id}</span>
          </span>
                }
                actions={
                    <div className="flex items-center gap-3">
                        {/* Audit Trail Shortcut */}
                        <Link
                            to={`/audit?q=${inc.id}`}
                            className="soc-btn-secondary !text-xs !px-3 !py-2 inline-flex items-center gap-1.5 h-auto"
                            title="View immutable compliance audit history for this case"
                            data-testid="view-audit-trail-btn"
                        >
                            <ShieldCheck size={15} className="text-primary"/>
                            Audit Trail
                        </Link>

                        <div className="grid grid-cols-2 gap-2 text-right shrink-0">
                            <div className="soc-card px-3 py-2">
                                <div className="soc-label">Threat</div>
                                <div className="font-mono text-primary text-xl"
                                     aria-label={`Threat score ${inc.threat_score}`}>{inc.threat_score}</div>
                            </div>
                            <div className="soc-card px-3 py-2">
                                <div className="soc-label">Grounding</div>
                                <div className="font-mono text-success text-xl"
                                     aria-label={`Grounding ${pb?.grounding_score ?? "none"}`}>{pb?.grounding_score ?? "—"}</div>
                            </div>
                        </div>
                    </div>
                }
            >
                {inc.summary &&
                    <p className="text-sm text-muted-foreground mt-3 leading-relaxed max-w-4xl">{inc.summary}</p>}
                <button
                    type="button"
                    onClick={() => nav(-1)}
                    className="text-xs text-muted-foreground hover:text-primary transition-colors mt-2"
                >
                    ← Back
                </button>
            </PageHeader>

            <WorkspaceTabs active={activeTab} onChange={setActiveTab}/>

            <div className="pt-4 space-y-6" data-testid={`workspace-panel-${activeTab}`}>
                {/* HiTL always available on Case / Playbooks when pending */}
                {canReview && (activeTab === "case" || activeTab === "playbooks") && (
                    <div className="soc-card p-4 border border-[var(--warning-border)]" data-testid="hitl-panel">
                        <div className="flex items-center gap-2 mb-3">
                            <Warning size={16} className="text-warning"/>
                            <div className="soc-label text-warning">Human-in-the-Loop Review Required</div>
                        </div>
                        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
                            Review this playbook and authorize its remediation steps or reject it. Clicking either
                            action will open the compliance justification modal.
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                data-testid="approve-btn"
                                onClick={() => openReviewModal("approve")}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--success)] text-white text-xs font-semibold rounded-lg transition-colors hover:brightness-95"
                            >
                                <CheckCircle size={14} weight="fill"/> Approve Playbook
                            </button>
                            <button
                                type="button"
                                data-testid="reject-btn"
                                onClick={() => openReviewModal("reject")}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--error)] text-white text-xs font-semibold rounded-lg transition-colors hover:brightness-95"
                            >
                                <XCircle size={14} weight="fill"/> Reject Playbook
                            </button>
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
                                        <div className="soc-label">Root cause analysis</div>
                                        <div className="text-[11px] text-muted-foreground mt-0.5">
                                            Grounded to attack chain, IoCs, and ATT&CK (pipeline fields only)
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        data-testid="rca-generate-btn"
                                        disabled={rcaBusy}
                                        onClick={generateRca}
                                        className="soc-btn-primary !text-xs !py-1.5 disabled:opacity-50"
                                    >
                                        {rcaBusy ? "Generating…" : rca ? "Regenerate RCA" : "Generate RCA"}
                                    </button>
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
                                <div className="soc-label mb-1 flex items-center gap-1.5">
                                    <Stack size={12} className="text-primary"/> Similar cases
                                </div>
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
                            <div className="soc-label mb-3">Source files</div>
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
                            <div className="soc-label mb-3">Pipeline timeline</div>
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
                                <div className="soc-label">Response Playbook</div>
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
                        <div className="soc-label mb-1">MITRE ATT&CK ({inc.techniques?.length || 0})</div>
                        <p className="text-[10px] text-muted-foreground mb-3">Click a technique for drill-down.</p>
                        <div className="flex flex-wrap gap-1.5">
                            {inc.techniques?.map((t) => (
                                <button
                                    type="button"
                                    key={t.technique_id}
                                    onClick={() => setSelectedTech(t)}
                                    className="px-2 py-1 rounded bg-primary/10 border border-primary/30 text-primary text-[11px] text-left"
                                    data-testid={`tech-${t.technique_id}`}
                                >
                                    <span className="font-mono">{t.technique_id}</span>
                                    <span className="mx-1 opacity-40">·</span>
                                    <span>{t.name}</span>
                                </button>
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
                        <div className="px-4 py-3 border-b border-border">
                            <div className="soc-label">Indicators of Compromise ({inc.iocs?.length || 0})</div>
                        </div>
                        <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
                            {inc.iocs?.map((i) => (
                                <div key={i.id} className="p-3" data-testid={`ioc-${i.id}`}>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{i.type}</span>
                                        <span className={`font-mono text-[11px] ${i.threat_score >= 70 ? "text-error" : i.threat_score >= 40 ? "text-warning" : "text-success"}`}>
                                            {i.threat_score}
                                        </span>
                                    </div>
                                    <div className="ioc-chip mt-1.5 max-w-full truncate block">{i.value}</div>
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
                        {selectedEntity && (
                            <div className="flex items-center gap-2 text-xs">
                                <span className="text-muted-foreground">Filtering timeline by entity:</span>
                                <span className="font-mono text-primary">{selectedEntity}</span>
                                <button
                                    type="button"
                                    className="text-muted-foreground hover:text-foreground underline"
                                    onClick={() => setSelectedEntity(null)}
                                    data-testid="timeline-clear-entity-filter"
                                >
                                    Clear
                                </button>
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
                        <EntityTypeTable incidentId={inc.id} type="host" title="Hosts"/>
                        <EntityTypeTable incidentId={inc.id} type="ip" title="IP addresses"/>
                        <EntityTypeTable incidentId={inc.id} type="domain" title="Domains"/>
                    </div>
                )}
                {activeTab === "users" && (
                    <EntityTypeTable incidentId={inc.id} type="user" title="Users"/>
                )}
                {activeTab === "notes" && <NotesNotebook incidentId={inc.id}/>}
                {activeTab === "recommendations" && (
                    <RecommendationsPanel incidentId={inc.id} playbook={pb}/>
                )}
            </div>
        </div>
    );
}