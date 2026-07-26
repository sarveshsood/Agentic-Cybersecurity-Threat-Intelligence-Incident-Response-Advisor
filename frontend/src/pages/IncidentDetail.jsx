import {useCallback, useEffect, useState} from "react";
import {Link, useNavigate, useParams} from "react-router-dom";
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

export default function IncidentDetail() {
    const {id} = useParams();
    const nav = useNavigate();
    const {user} = useAuth();
    const [inc, setInc] = useState(null);
    const [similar, setSimilar] = useState(null);
    const [similarErr, setSimilarErr] = useState(null);
    const [selectedTech, setSelectedTech] = useState(null);

    // Compliance Triage Audit Modal State
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [reviewActionType, setReviewActionType] = useState("approve");
    const [reviewComment, setReviewComment] = useState("");
    const [reviewBusy, setReviewBusy] = useState(false);

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

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Left: Playbook + Timeline */}
                <div className="xl:col-span-8 space-y-6">
                    {/* HiTL panel */}
                    {canReview && (
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

                    {/* Correlation (multi-file) */}
                    {inc.correlation && <CorrelationPanel correlation={inc.correlation}/>}

                    {/* AI Investigator */}
                    <AIInvestigator incidentId={inc.id} severity={inc.severity}/>

                    {/* Playbook */}
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
                                        <div
                                            className={`inline-flex px-2 py-0.5 rounded border text-[10px] uppercase tracking-[0.14em] font-semibold mb-2 ${meta.color}`}>
                                            {meta.label}
                                        </div>
                                        <ol className="space-y-2.5">
                                            {steps.map((s) => (
                                                <li key={s.order} className="flex gap-3 group"
                                                    data-testid={`step-${s.order}`}>
                                                    <div
                                                        className="soc-mono text-muted-foreground text-xs w-6 shrink-0 pt-0.5">{String(s.order).padStart(2, "0")}</div>
                                                    <div className="flex-1">
                                                        <div
                                                            className="text-sm text-foreground leading-relaxed">{s.action}</div>
                                                        {s.citation_ids?.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {s.citation_ids.map(cid => <CitationChip key={cid}
                                                                                                         id={cid}/>)}
                                                            </div>
                                                        )}
                                                    </div>
                                                </li>
                                            ))}
                                        </ol>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Timeline */}
                    <div className="soc-card p-4">
                        <div className="soc-label mb-3">Timeline</div>
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
                        </ol>
                    </div>
                </div>

                {/* Right: IoCs + Techniques + Similar cases */}
                <div className="xl:col-span-4 space-y-6">
                    {/* Similar incidents (LanceDB embeddings) */}
                    <div className="soc-card p-4" data-testid="similar-incidents">
                        <div className="soc-label mb-1 flex items-center gap-1.5">
                            <Stack size={12} className="text-primary"/> Similar cases
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-3">
                            LanceDB ANN over incident embeddings (title + summary + techniques)
                        </p>
                        {similarErr && <div className="text-[11px] text-error">{similarErr}</div>}
                        {!similarErr && !similar && (
                            <div className="text-[11px] text-muted-foreground">Loading similar…</div>
                        )}
                        {similar && (
                            <>
                                {similar.vector_store && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                    <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      incidents={similar.vector_store.incident_rows ?? "—"}
                    </span>
                                        <span
                                            className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      {similar.query_embedder || similar.vector_store.embedder || "embedder"}
                    </span>
                                    </div>
                                )}
                                {(similar.items || []).length === 0 ? (
                                    <div className="text-[11px] text-muted-foreground">
                                        {similar.reason === "no_neighbors"
                                            ? "No other indexed incidents yet — run more uploads to build neighbors."
                                            : similar.reason || "No similar cases found."}
                                    </div>
                                ) : (
                                    <ul className="space-y-2">
                                        {similar.items.map((s) => (
                                            <li key={s.id}
                                                className="border border-border rounded p-2 hover:border-primary/40 transition-colors">
                                                <Link
                                                    to={`/incidents/${s.id}`}
                                                    className="text-[12px] text-primary hover:underline font-medium leading-snug block"
                                                    data-testid={`similar-${s.id}`}
                                                >
                                                    {s.title || s.id}
                                                </Link>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span
                                                        className="font-mono text-[9px] text-muted-foreground/80 truncate">{s.id}</span>
                                                    {s.score != null && (
                                                        <span className="font-mono text-[9px] text-primary ml-auto">
                              sim {s.score}
                            </span>
                                                    )}
                                                </div>
                                                {s.text_preview && (
                                                    <div
                                                        className="text-[10px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                                        {s.text_preview}
                                                    </div>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}
                    </div>

                    <div className="soc-card p-4">
                        <div className="soc-label mb-1">MITRE ATT&CK ({inc.techniques?.length || 0})</div>
                        <p className="text-[10px] text-muted-foreground mb-3">Click a technique to drill into evidence,
                            mitigations, and sub-techniques.</p>
                        <div className="flex flex-wrap gap-1.5">
                            {inc.techniques?.map((t) => (
                                <button
                                    type="button"
                                    key={t.technique_id}
                                    onClick={() => setSelectedTech(t)}
                                    className="px-2 py-1 rounded bg-primary/10 border border-primary/30 text-primary text-[11px] text-left hover:border-primary/50 hover:bg-primary/10 transition-colors"
                                    data-testid={`tech-${t.technique_id}`}
                                    title={`${t.technique_id} — conf ${Math.round((t.confidence || 0) * 100)}%`}
                                >
                                    <span className="font-mono">{t.technique_id}</span>
                                    <span className="mx-1 opacity-40">·</span>
                                    <span>{t.name}</span>
                                    {typeof t.confidence === "number" && (
                                        <span className="ml-1.5 font-mono text-[9px] text-primary/80">
                      {Math.round(t.confidence * 100)}%
                    </span>
                                    )}
                                </button>
                            ))}
                            {(!inc.techniques || inc.techniques.length === 0) &&
                                <div className="text-xs text-muted-foreground">None detected</div>}
                        </div>
                    </div>

                    <TechniquePanel
                        technique={selectedTech}
                        open={!!selectedTech}
                        onClose={() => setSelectedTech(null)}
                    />

                    <div className="soc-card p-0 overflow-hidden">
                        <div className="px-4 py-3 border-b border-border">
                            <div className="soc-label">Indicators of Compromise ({inc.iocs?.length || 0})</div>
                        </div>
                        <div className="max-h-[520px] overflow-y-auto divide-y divide-border">
                            {inc.iocs?.map((i) => (
                                <div key={i.id} className="p-3" data-testid={`ioc-${i.id}`}>
                                    <div className="flex items-center justify-between">
                                        <span
                                            className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{i.type}</span>
                                        <span
                                            className={`font-mono text-[11px] ${i.threat_score >= 70 ? "text-error" : i.threat_score >= 40 ? "text-warning" : "text-success"}`}>
                      {i.threat_score}
                    </span>
                                    </div>
                                    <div className="ioc-chip mt-1.5 max-w-full truncate block">{i.value}</div>
                                    {i.enrichment?.abuseipdb && (
                                        <div className="mt-2 space-y-1">
                                            <div className="grid grid-cols-4 gap-1 text-[10px]">
                                                {[
                                                    ["AB", i.enrichment.abuseipdb, i.enrichment.abuseipdb?.score],
                                                    ["VT", i.enrichment.virustotal, i.enrichment.virustotal?.score],
                                                    ["GN", i.enrichment.greynoise, i.enrichment.greynoise?.classification?.slice(0, 3)],
                                                    ["TF", i.enrichment.threatfox, i.enrichment.threatfox?.score],
                                                ].map(([k, src, v]) => {
                                                    const isMock = src?.mock !== false;
                                                    const failed = !!src?.fallback_mock;
                                                    return (
                                                        <div key={k} className="text-center py-0.5 bg-muted rounded"
                                                             title={failed ? "Live call failed → mock" : isMock ? "Mock (no key)" : "Live API"}>
                                                            <div
                                                                className="text-muted-foreground flex items-center justify-center gap-0.5">
                                                                {k}
                                                                <span
                                                                    className={isMock ? "text-white0/90" : "text-success"}>
                                  {failed ? "⚠" : isMock ? "m" : "●"}
                                </span>
                                                            </div>
                                                            <div className="text-primary font-mono">{v ?? "—"}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {i.enrichment?.mode && (
                                                <div className="text-[9px] text-muted-foreground/80 font-mono truncate">
                                                    {Object.entries(i.enrichment.mode)
                                                        .filter(([, m]) => m === "live")
                                                        .map(([s]) => s)
                                                        .join(", ") || "all mock"}{" "}
                                                    live
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {(!inc.iocs || inc.iocs.length === 0) &&
                                <div className="p-4 text-xs text-muted-foreground">No IoCs extracted</div>}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}