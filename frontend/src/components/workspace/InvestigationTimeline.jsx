import {useEffect, useMemo, useState} from "react";
import {api} from "../../lib/api";
import {formatDateTime} from "../../lib/uiPrefs";
import {Clock} from "@phosphor-icons/react";

const SEV_CLASS = {
    critical: "border-error/50 bg-error-soft text-error",
    high: "border-[var(--warning-border)] bg-warning-soft text-warning",
    medium: "border-primary/40 bg-primary/10 text-primary",
    low: "border-border bg-muted text-muted-foreground",
    info: "border-border bg-muted text-muted-foreground",
};

/**
 * Visual investigation timeline from GET /incidents/{id}/workspace/timeline
 */
export default function InvestigationTimeline({
    incidentId,
    filterEntity = null,
    onSelectEvent = null,
}) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [kind, setKind] = useState("");
    const [sourceFile, setSourceFile] = useState("");

    useEffect(() => {
        if (!incidentId) return;
        setErr(null);
        const q = new URLSearchParams({limit: "150"});
        if (kind) q.set("kind", kind);
        if (sourceFile) q.set("source_file", sourceFile);
        api
            .get(`/incidents/${incidentId}/workspace/timeline?${q}`)
            .then((r) => setData(r.data))
            .catch((e) => setErr(e?.response?.data?.detail || "Failed to load timeline"));
    }, [incidentId, kind, sourceFile]);

    const events = useMemo(() => {
        let list = data?.events || [];
        if (filterEntity) {
            const needle = String(filterEntity).toLowerCase();
            list = list.filter((e) => {
                const hay = [
                    e.actor,
                    e.target,
                    ...(e.entities || []),
                    e.detail,
                    e.label,
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();
                return hay.includes(needle) || (e.id && e.id.includes(needle));
            });
        }
        return list;
    }, [data, filterEntity]);

    const files = useMemo(() => {
        const s = new Set();
        (data?.events || []).forEach((e) => {
            if (e.source_file) s.add(e.source_file);
        });
        return [...s].sort();
    }, [data]);

    if (err) {
        return (
            <div className="soc-card p-4 text-sm text-error" data-testid="investigation-timeline-error">
                {err}
            </div>
        );
    }
    if (!data) {
        return (
            <div className="soc-card p-4 text-xs text-muted-foreground" data-testid="investigation-timeline-loading">
                Loading investigation timeline…
            </div>
        );
    }

    return (
        <div className="soc-card p-4 space-y-4" data-testid="investigation-timeline">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <div className="soc-label">Investigation timeline</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                        Source: {data.source} · {data.stats?.returned ?? events.length} events
                        {filterEntity ? ` · filter: ${filterEntity}` : ""}
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <select
                        className="text-xs border border-border rounded px-2 py-1 bg-background"
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                        data-testid="timeline-filter-kind"
                    >
                        <option value="">All kinds</option>
                        <option value="attack_chain">Attack chain</option>
                        <option value="ces">CES</option>
                        <option value="pipeline">Pipeline</option>
                    </select>
                    <select
                        className="text-xs border border-border rounded px-2 py-1 bg-background max-w-[160px]"
                        value={sourceFile}
                        onChange={(e) => setSourceFile(e.target.value)}
                        data-testid="timeline-filter-file"
                    >
                        <option value="">All files</option>
                        {files.map((f) => (
                            <option key={f} value={f}>{f}</option>
                        ))}
                    </select>
                </div>
            </div>

            {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events match filters.</p>
            ) : (
                <ol className="relative border-l border-border ml-2 space-y-0">
                    {events.map((ev, i) => {
                        const sev = String(ev.severity || "info").toLowerCase();
                        const chip = SEV_CLASS[sev] || SEV_CLASS.info;
                        return (
                            <li
                                key={ev.id || i}
                                className="ml-4 pb-4 last:pb-0"
                                data-testid={`timeline-event-${ev.id || i}`}
                            >
                                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-primary bg-card"/>
                                <button
                                    type="button"
                                    className={`w-full text-left rounded-lg border px-3 py-2 transition-colors hover:border-primary/40 ${chip}`}
                                    onClick={() => onSelectEvent?.(ev)}
                                >
                                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wide font-semibold opacity-90">
                                        <span className="font-mono normal-case">{ev.kind}</span>
                                        {ev.label && <span>· {ev.label}</span>}
                                        {ev.severity && <span>· {ev.severity}</span>}
                                    </div>
                                    <div className="text-sm text-foreground mt-1 flex items-start gap-1.5">
                                        <Clock size={12} className="mt-0.5 shrink-0 opacity-70"/>
                                        <span>
                                            {ev.ts ? formatDateTime(ev.ts) : "No timestamp"}
                                            {ev.source_file ? (
                                                <span className="text-muted-foreground font-mono text-[10px] ml-2">
                                                    {ev.source_file}
                                                </span>
                                            ) : null}
                                        </span>
                                    </div>
                                    {(ev.actor || ev.target) && (
                                        <div className="text-[11px] mt-1 font-mono text-foreground/90">
                                            {ev.actor || "—"} → {ev.target || "—"}
                                        </div>
                                    )}
                                    {ev.detail && (
                                        <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                                            {ev.detail}
                                        </div>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
