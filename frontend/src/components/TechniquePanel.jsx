import {useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {api} from "../lib/api";
import {ArrowSquareOut, Crosshair, Database, LinkSimple, ShieldCheck, TreeStructure, X,} from "@phosphor-icons/react";
import {HelpTip} from "./HelpTip";

/**
 * Drill-down drawer for a single ATT&CK technique / sub-technique.
 * Props:
 *  - technique: object from incident.techniques
 *  - open, onClose
 */
export default function TechniquePanel({technique, open, onClose}) {
    const [catalog, setCatalog] = useState(null);
    const [loading, setLoading] = useState(false);

    const tid = technique?.technique_id;

    useEffect(() => {
        if (!open || !tid) return;
        setLoading(true);
        setCatalog(null);
        api
            .get(`/attack/catalog/${encodeURIComponent(tid)}`)
            .then((r) => setCatalog(r.data))
            .catch(() => setCatalog(null))
            .finally(() => setLoading(false));
    }, [open, tid]);

    if (!open || !technique) return null;

    const conf = Math.round((Number(technique.confidence) || 0) * 100);
    const evidence = technique.evidence || [];
    const mitigations = technique.mitigations?.length
        ? technique.mitigations
        : catalog?.mitigations || [];
    const platforms = technique.platforms?.length
        ? technique.platforms
        : catalog?.platforms || [];
    const dataSources = technique.data_sources?.length
        ? technique.data_sources
        : catalog?.data_sources || [];
    const description = technique.description || catalog?.description || "";
    const url = technique.url || catalog?.url;
    const parentId = technique.parent_id || catalog?.parent_id;
    const subtechniques = catalog?.subtechniques || [];
    const siblings = (catalog?.siblings || []).filter((s) => s?.technique_id !== tid);

    return (
        <div
            className="fixed inset-0 z-50 flex justify-end"
            data-testid="technique-panel"
            role="dialog"
            aria-modal="true"
        >
            <button
                type="button"
                className="absolute inset-0 bg-black/50 border-0 cursor-default"
                aria-label="Close technique panel"
                onClick={onClose}
            />
            <div
                className="relative w-full max-w-md h-full bg-background border-l border-border shadow-2xl overflow-y-auto">
                <div
                    className="sticky top-0 z-10 flex items-start justify-between gap-3 px-4 py-3 border-b border-border bg-card/95 backdrop-blur">
                    <div className="min-w-0">
                        <div className="soc-label mb-0.5 inline-flex items-center gap-1.5">
                            MITRE ATT&CK
                            <HelpTip
                                title="Technique detail"
                                body="Pipeline-mapped ATT&CK technique for this incident: confidence, evidence keywords, and catalog metadata when available."
                                testid="tip-technique-panel"
                            />
                        </div>
                        <div className="font-mono text-primary text-sm">{technique.technique_id}</div>
                        <div className="font-semibold text-foreground text-lg leading-tight truncate">
                            {technique.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{technique.tactic}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                        data-testid="technique-panel-close"
                    >
                        <X size={16}/>
                    </button>
                </div>

                <div className="p-4 space-y-5 text-[12px]">
                    {/* Confidence */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <span className="soc-label">Confidence</span>
                            <span className="font-mono text-primary">{conf}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                                className="h-full rounded-full bg-primary/80"
                                style={{width: `${Math.min(100, conf)}%`}}
                            />
                        </div>
                        {technique.source && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                                Source: <span className="text-muted-foreground">{technique.source}</span>
                                {parentId && (
                                    <>
                                        {" · "}Parent:{" "}
                                        <Link
                                            to={`/incidents?technique=${encodeURIComponent(parentId)}`}
                                            className="font-mono text-primary hover:text-primary"
                                        >
                                            {parentId}
                                        </Link>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {description && (
                        <div>
                            <div className="soc-label mb-1.5">Description</div>
                            <p className="text-muted-foreground leading-relaxed">{description}</p>
                        </div>
                    )}

                    {/* Why */}
                    <div>
                        <div className="soc-label mb-1.5 flex items-center gap-1">
                            <Crosshair size={12} className="text-primary"/> Why detected
                        </div>
                        {(technique.matched_rules?.length > 0 || technique.matched_keywords?.length > 0) ? (
                            <div className="space-y-1.5">
                                {technique.matched_rules?.map((r) => (
                                    <div key={r}
                                         className="px-2 py-1 rounded bg-card border border-border font-mono text-[10px] text-warning">
                                        {r}
                                    </div>
                                ))}
                                {technique.matched_keywords?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {technique.matched_keywords.map((k) => (
                                            <span key={k}
                                                  className="px-1.5 py-0.5 rounded bg-muted text-foreground/90 text-[10px]">
                        {k}
                      </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-muted-foreground">No rule metadata stored for this hit.</div>
                        )}
                    </div>

                    {/* Evidence */}
                    <div>
                        <div className="soc-label mb-1.5">Evidence</div>
                        {evidence.length === 0 ? (
                            <div className="text-muted-foreground">No evidence snippets attached.</div>
                        ) : (
                            <div className="space-y-2">
                                {evidence.map((e, i) => (
                                    <div
                                        key={i}
                                        className="px-2.5 py-2 rounded border border-border bg-muted/40"
                                        data-testid={`technique-evidence-${i}`}
                                    >
                                        {e.rule && (
                                            <div
                                                className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">{e.rule}</div>
                                        )}
                                        <div
                                            className="font-mono text-[11px] text-foreground/90 leading-snug whitespace-pre-wrap break-all">
                                            {e.snippet || e.rationale || "—"}
                                        </div>
                                        <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] text-muted-foreground">
                                            {e.source_file && <span>file: {e.source_file}</span>}
                                            {e.username && <span>user: {e.username}</span>}
                                            {e.source_ip && <span>ip: {e.source_ip}</span>}
                                            {e.process && <span>proc: {e.process}</span>}
                                        </div>
                                        {e.stats && (
                                            <div className="mt-1 text-[10px] text-muted-foreground font-mono">
                                                {Object.entries(e.stats).map(([k, v]) => `${k}=${v}`).join(" · ")}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Related IoCs */}
                    {technique.related_iocs?.length > 0 && (
                        <div>
                            <div className="soc-label mb-1.5 flex items-center gap-1">
                                <LinkSimple size={12}/> Related IoCs
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {technique.related_iocs.map((x) => (
                                    <span key={x}
                                          className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-muted text-primary/80">
                    {x}
                  </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Mitigations */}
                    <div>
                        <div className="soc-label mb-1.5 flex items-center gap-1">
                            <ShieldCheck size={12} className="text-success"/> Mitigations
                        </div>
                        {mitigations.length === 0 ? (
                            <div className="text-muted-foreground">{loading ? "Loading…" : "None in catalog."}</div>
                        ) : (
                            <ul className="space-y-1">
                                {mitigations.map((m) => (
                                    <li key={m.id || m.name} className="flex gap-2 text-foreground/90">
                                        <span className="font-mono text-success shrink-0">{m.id}</span>
                                        <span>{m.name}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Platforms / data sources */}
                    <div className="grid grid-cols-1 gap-3">
                        {platforms.length > 0 && (
                            <div>
                                <div className="soc-label mb-1">Platforms</div>
                                <div className="flex flex-wrap gap-1">
                                    {platforms.map((p) => (
                                        <span key={p}
                                              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                        {dataSources.length > 0 && (
                            <div>
                                <div className="soc-label mb-1 flex items-center gap-1">
                                    <Database size={11}/> Data sources
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {dataSources.map((p) => (
                                        <span key={p}
                                              className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground">{p}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Sub-technique tree */}
                    {(subtechniques.length > 0 || siblings.length > 0) && (
                        <div>
                            <div className="soc-label mb-1.5 flex items-center gap-1">
                                <TreeStructure size={12}/> Related techniques
                            </div>
                            <div className="space-y-1">
                                {subtechniques.map((sid) => (
                                    <div key={sid}
                                         className="font-mono text-[11px] text-muted-foreground px-2 py-1 rounded bg-card">
                                        {sid}
                                    </div>
                                ))}
                                {siblings.map((s) => (
                                    <div key={s.technique_id}
                                         className="text-[11px] px-2 py-1 rounded bg-card flex justify-between gap-2">
                                        <span className="font-mono text-primary/90">{s.technique_id}</span>
                                        <span className="text-muted-foreground truncate">{s.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col gap-2 pt-2 border-t border-border">
                        {url && (
                            <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center justify-center gap-1.5 text-[12px] px-3 py-2 rounded border border-primary/40 text-primary hover:bg-primary/10"
                                data-testid="technique-mitre-link"
                            >
                                Open on attack.mitre.org <ArrowSquareOut size={14}/>
                            </a>
                        )}
                        <Link
                            to={`/incidents?technique=${encodeURIComponent(technique.technique_id)}`}
                            className="inline-flex items-center justify-center gap-1.5 text-[12px] px-3 py-2 rounded border border-border text-foreground/90 hover:border-primary/40"
                            data-testid="technique-filter-incidents"
                            onClick={onClose}
                        >
                            View incidents with {technique.technique_id}
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
