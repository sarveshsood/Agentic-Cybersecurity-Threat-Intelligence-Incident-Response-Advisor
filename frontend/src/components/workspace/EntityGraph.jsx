import {useEffect, useMemo, useState} from "react";
import {api} from "../../lib/api";
import {PaneLabel, Tip} from "../HelpTip";

// Design-system tokens only (no cyan/violet/fuchsia/pink brand colors)
const TYPE_COLOR = {
    ip: "bg-primary/10 border-primary/30 text-primary",
    user: "bg-muted border-border text-foreground",
    host: "bg-success-soft border-[var(--success-border)] text-success",
    domain: "bg-warning-soft border-[var(--warning-border)] text-warning",
    hash: "bg-error-soft border-[var(--error-border)] text-error",
    process: "bg-muted border-border text-muted-foreground",
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
                        <PaneLabel
                            title="Entity graph"
                            body="Hosts, users, IPs, domains, and hashes linked by co-occurrence in this case. Click a node to filter the Investigation timeline."
                            how="GET /incidents/{id}/workspace/entity-graph · built from correlation entities/edges."
                            testid="tip-entity-graph"
                        >
                            Entity graph
                        </PaneLabel>
                        <div className="text-[11px] text-muted-foreground">
                            {data.stats?.node_count ?? 0} nodes · {data.stats?.edge_count ?? 0} edges
                            {data.stats?.truncated ? " · truncated" : ""}
                            {" · "}
                            <Tip content="Click a node to jump to Timeline filtered by that entity">
                                <span className="underline decoration-dotted cursor-help">click node → timeline</span>
                            </Tip>
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
                            const tip = entityTooltip(n);
                            return (
                                <g
                                    key={n.id}
                                    transform={`translate(${p.x},${p.y})`}
                                    className="cursor-pointer"
                                    onClick={() => onSelectNode?.(n)}
                                    data-testid={`graph-node-${n.id}`}
                                >
                                    {/* Larger invisible hit target + native SVG title (portals cannot wrap <g>) */}
                                    <circle r={Math.max(r + 6, 16)} className="fill-transparent" />
                                    <circle
                                        r={r}
                                        className={active ? "fill-primary stroke-primary" : "fill-card stroke-primary/50"}
                                        strokeWidth={active ? 2.5 : 1.5}
                                    />
                                    <title>{tip}</title>
                                </g>
                            );
                        })}
                    </svg>
                )}
            </div>

            <div className="soc-card p-4">
                <PaneLabel
                    className="mb-2"
                    title="Entities"
                    body="All correlated entities from this case. Hover a chip for type, weight, and threat; click to open the Timeline filtered to that entity."
                    how="Same nodes as the entity graph · ordered by co-occurrence weight."
                    testid="tip-entity-chips"
                >
                    Entities
                </PaneLabel>
                <div className="flex flex-wrap gap-1.5">
                    {nodes.map((n) => (
                        <Tip key={n.id} content={entityTooltip(n)} side="top">
                            <button
                                type="button"
                                onClick={() => onSelectNode?.(n)}
                                data-testid={`entity-chip-${n.id}`}
                                title={entityTooltip(n)}
                                className={`text-[11px] font-mono px-2 py-1 rounded border ${
                                    TYPE_COLOR[n.type] || TYPE_COLOR.process
                                } ${selectedId === n.id || selectedId === n.label ? "ring-2 ring-primary" : ""}`}
                            >
                                <span className="opacity-70">{n.type}:</span> {n.label}
                            </button>
                        </Tip>
                    ))}
                </div>
            </div>
        </div>
    );
}

function entityTooltip(n) {
    const type = n?.type || "entity";
    const label = n?.label || n?.id || "—";
    const w = n?.weight != null ? `weight ${n.weight}` : null;
    const threat = n?.threat_score != null && n.threat_score !== "" ? `threat ${n.threat_score}` : null;
    const meta = [w, threat].filter(Boolean).join(" · ");
    return meta
        ? `${type}: ${label} (${meta}) — click to filter timeline`
        : `${type}: ${label} — click to filter timeline`;
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

    const typeBody = {
        host: "Hostnames / endpoints seen in this case’s correlation graph.",
        ip: "IP addresses linked by co-occurrence across events and files.",
        domain: "Domains / FQDNs extracted from traffic or logs for this case.",
        user: "User accounts observed in authentication or attack-path events.",
    };

    return (
        <div className="soc-card p-4" data-testid={`entity-table-${type}`}>
            <PaneLabel
                className="mb-3"
                title={title}
                body={typeBody[type] || `Entities of type “${type}” from the case entity graph.`}
                how="GET /incidents/{id}/workspace/entity-graph · filtered client-side by type."
                testid={`tip-entity-table-${type}`}
            >
                {title} ({nodes.length})
            </PaneLabel>
            {nodes.length === 0 ? (
                <p className="text-xs text-muted-foreground">None in correlation graph.</p>
            ) : (
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-left text-muted-foreground border-b border-border">
                            <th className="py-1.5 font-medium">
                                <Tip content="Entity value as seen in logs / correlation">
                                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Value</span>
                                </Tip>
                            </th>
                            <th className="py-1.5 font-medium">
                                <Tip content="Co-occurrence weight — higher means more shared edges with other entities">
                                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Weight</span>
                                </Tip>
                            </th>
                            <th className="py-1.5 font-medium">
                                <Tip content="Per-entity threat score when enrichment produced one (else —)">
                                    <span className="cursor-help border-b border-dotted border-muted-foreground/50">Threat</span>
                                </Tip>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {nodes.map((n) => (
                            <tr
                                key={n.id}
                                className="border-b border-border/60 font-mono"
                                title={entityTooltip(n)}
                            >
                                <td className="py-1.5 text-foreground">
                                    <Tip content={entityTooltip(n)}>
                                        <span className="cursor-help truncate max-w-[min(24rem,50vw)] inline-block align-bottom">
                                            {n.label}
                                        </span>
                                    </Tip>
                                </td>
                                <td className="py-1.5">
                                    <Tip content={`Co-occurrence weight: ${n.weight ?? "—"}`}>
                                        <span className="cursor-help">{n.weight}</span>
                                    </Tip>
                                </td>
                                <td className="py-1.5">
                                    <Tip content={
                                        n.threat_score != null && n.threat_score !== ""
                                            ? `Entity threat score: ${n.threat_score}`
                                            : "No per-entity threat score"
                                    }>
                                        <span className="cursor-help">{n.threat_score ?? "—"}</span>
                                    </Tip>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
