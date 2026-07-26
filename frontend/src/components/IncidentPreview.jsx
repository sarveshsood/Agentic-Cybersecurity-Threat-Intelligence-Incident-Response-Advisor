import {Link} from "react-router-dom";
import {SeverityBadge, StatusPill} from "./SeverityBadge";
import {formatDateTime} from "../lib/uiPrefs";

/**
 * Compact incident summary for hover cards / quick previews.
 */
export function IncidentPreview({inc, showLink = false}) {
    if (!inc) return null;
    return (
        <div className="space-y-2 text-left" data-testid="incident-preview">
            <div className="flex items-center gap-2 flex-wrap">
                <SeverityBadge severity={inc.severity}/>
                {inc.status && <StatusPill status={inc.status}/>}
                <span className="font-mono text-[10px] text-muted-foreground" title={inc.id}>
          {inc.id?.slice(0, 12)}
        </span>
            </div>
            <div className="text-[12px] font-semibold text-foreground leading-snug">{inc.title}</div>
            {inc.summary && (
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">{inc.summary}</p>
            )}
            <div className="grid grid-cols-3 gap-2 text-[10px] pt-1 border-t border-border">
                <div title="Composite threat score 0–100">
                    <div className="text-muted-foreground">Threat</div>
                    <div className="font-mono text-warning">{inc.threat_score ?? "—"}</div>
                </div>
                <div title="Playbook citation quality">
                    <div className="text-muted-foreground">Grounding</div>
                    <div className="font-mono text-success">{inc.playbook?.grounding_score ?? "—"}</div>
                </div>
                <div title="Extracted indicators">
                    <div className="text-muted-foreground">IoCs</div>
                    <div className="font-mono text-primary">{inc.iocs?.length ?? 0}</div>
                </div>
            </div>
            {inc.techniques?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {inc.techniques.slice(0, 6).map((t) => (
                        <span
                            key={t.technique_id}
                            className="font-mono text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary/90"
                            title={`${t.technique_id} ${t.name || ""}`}
                        >
              {t.technique_id}
            </span>
                    ))}
                </div>
            )}
            <div className="text-[10px] text-muted-foreground/80 flex justify-between gap-2">
        <span title={inc.created_at ? formatDateTime(inc.created_at) : "Pipeline completion time"}>
          Created {inc.created_at ? formatDateTime(inc.created_at) : "—"}
        </span>
                {showLink && inc.id && (
                    <Link to={`/incidents/${inc.id}`} className="text-primary hover:text-primary">
                        Open →
                    </Link>
                )}
            </div>
        </div>
    );
}
