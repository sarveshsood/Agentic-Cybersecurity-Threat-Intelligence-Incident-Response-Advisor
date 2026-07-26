import {useEffect, useMemo, useState} from "react";
import {api} from "../../lib/api";

const TYPE_COLOR = {
    ip: "bg-sky-500/20 border-sky-500/40 text-sky-700 dark:text-sky-300",
    user: "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300",
    host: "bg-emerald-500/20 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
    domain: "bg-amber-500/20 border-amber-500/40 text-amber-800 dark:text-amber-300",
    hash: "bg-rose-500/20 border-rose-500/40 text-rose-700 dark:text-rose-300",
    process: "bg-slate-500/20 border-slate-500/40 text-slate-700 dark:text-slate-300",
};

/**
 * Simple SVG force-free layout for entity graph (MVP — no extra deps).
 */
export default function EntityGraph({incidentId, selectedId = null, onSelectNode = null}) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        if (!incidentId) return;
        setErr(null);
        api
            .get(`/incidents/${incidentId}/workspace/entity-graph?max_nodes=40&max_edges=80`)
            .then((r) => setData(r.data))
            .catch((e) => setErr(e?.response?.data?.detail || "Failed to load graph"));
    }, [incidentId]);

    const layout = useMemo(() => {
        const nodes = data?.nodes || [];
        const edges = data?.edges || [];
        if (!nodes.length) return {nodes: [], edges: [], w: 640, h: 360};

        const w = 640;
        const h = Math.max(320, 48 + nodes.length * 14);
        const cx = w / 2;
        const cy = h / 2;
        const r = Math.min(w, h) * 0.36;
        const pos = {};
        nodes.forEach((n, i) => {
            const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
            pos[n.id] = {
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle),
            };
        });
        return {nodes, edges, pos, w, h};
    }, [data]);

    if (err) {
        return (
            <div className="soc-card p-4 text-sm text-error" data-testid="entity-graph-error">{err}</div>
        );
    }
    if (!data) {
        return (
            <div className="soc-card p-4 text-xs text-muted-foreground" data-testid="entity-graph-loading">
                Loading entity graph…
            </div>
        );
    }

    const {nodes, edges, pos, w, h} = layout;

    return (
        <div className="space-y-4" data-testid="entity-graph">
            <div className="soc-card p-4 overflow-x-auto">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <div className="soc-label">Entity graph</div>
                        <div className="text-[11px] text-muted-foreground">
                            {data.stats?.node_count ?? 0} nodes · {data.stats?.edge_count ?? 0} edges
                            {data.stats?.truncated ? " · truncated" : ""}
                        </div>
                    </div>
                </div>
                {nodes.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No correlated entities.</p>
                ) : (
                    <svg
                        viewBox={`0 0 ${w} ${h}`}
                        className="w-full max-w-3xl h-auto border border-border rounded-lg bg-background/50"
                        data-testid="entity-graph-svg"
                    >
                        {edges.map((e) => {
                            const a = pos[e.source];
                            const b = pos[e.target];
                            if (!a || !b) return null;
                            return (
                                <line
                                    key={e.id}
                                    x1={a.x}
                                    y1={a.y}
                                    x2={b.x}
                                    y2={b.y}
                                    stroke="currentColor"
                                    className="text-border"
                                    strokeWidth={Math.min(3, 0.5 + (e.weight || 1) * 0.15)}
                                    opacity={0.7}
                                />
                            );
                        })}
                        {nodes.map((n) => {
                            const p = pos[n.id];
                            if (!p) return null;
                            const active = selectedId === n.id || selectedId === n.label;
                            const r = 10 + Math.min(10, Math.log2((n.weight || 1) + 1) * 3);
                            return (
                                <g
                                    key={n.id}
                                    transform={`translate(${p.x},${p.y})`}
                                    className="cursor-pointer"
                                    onClick={() => onSelectNode?.(n)}
                                    data-testid={`graph-node-${n.id}`}
                                >
                                    <circle
                                        r={r}
                                        className={active ? "fill-primary stroke-primary" : "fill-card stroke-primary/50"}
                                        strokeWidth={active ? 2.5 : 1.5}
                                    />
                                    <title>{`${n.type}: ${n.label} (w=${n.weight})`}</title>
                                </g>
                            );
                        })}
                    </svg>
                )}
            </div>

            <div className="soc-card p-4">
                <div className="soc-label mb-2">Entities</div>
                <div className="flex flex-wrap gap-1.5">
                    {nodes.map((n) => (
                        <button
                            key={n.id}
                            type="button"
                            onClick={() => onSelectNode?.(n)}
                            data-testid={`entity-chip-${n.id}`}
                            className={`text-[11px] font-mono px-2 py-1 rounded border ${
                                TYPE_COLOR[n.type] || TYPE_COLOR.process
                            } ${selectedId === n.id || selectedId === n.label ? "ring-2 ring-primary" : ""}`}
                        >
                            <span className="opacity-70">{n.type}:</span> {n.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

/** Table of nodes filtered by type for Assets / Users tabs */
export function EntityTypeTable({incidentId, type, title}) {
    const [nodes, setNodes] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        if (!incidentId) return;
        api
            .get(`/incidents/${incidentId}/workspace/entity-graph?max_nodes=100&max_edges=1`)
            .then((r) => {
                const list = (r.data?.nodes || []).filter((n) => n.type === type);
                setNodes(list);
            })
            .catch((e) => setErr(e?.response?.data?.detail || "Failed to load"));
    }, [incidentId, type]);

    if (err) return <div className="soc-card p-4 text-sm text-error">{err}</div>;
    if (!nodes) return <div className="soc-card p-4 text-xs text-muted-foreground">Loading…</div>;

    return (
        <div className="soc-card p-4" data-testid={`entity-table-${type}`}>
            <div className="soc-label mb-3">{title} ({nodes.length})</div>
            {nodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">None in correlation graph.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                            <th className="py-1.5 font-medium">Value</th>
                            <th className="py-1.5 font-medium">Weight</th>
                            <th className="py-1.5 font-medium">Threat</th>
                        </tr>
                    </thead>
                    <tbody>
                        {nodes.map((n) => (
                            <tr key={n.id} className="border-b border-border/60 font-mono">
                                <td className="py-1.5 text-foreground">{n.label}</td>
                                <td className="py-1.5">{n.weight}</td>
                                <td className="py-1.5">{n.threat_score ?? "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
