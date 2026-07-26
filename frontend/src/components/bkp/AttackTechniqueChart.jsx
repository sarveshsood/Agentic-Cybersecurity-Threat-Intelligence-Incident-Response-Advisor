import {useEffect, useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {api} from "../../lib/api";
import {Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,} from "recharts";
import {CaretLeft, ChartBar} from "@phosphor-icons/react";
import {HelpTip} from "../HelpTip";
import {useChartTheme} from "../../design-system";

/**
 * Top ATT&CK techniques with multi-level drill-down:
 *   Category (tactic) → Technique (parent) → Sub-technique (when present)
 * Data: analytics top_techniques [{id, count, name?}] + /attack/catalog.
 */
export function AttackTechniqueChart({topTechniques = [], help}) {
    const chart = useChartTheme();
    const [catalog, setCatalog] = useState([]);
    // tactic | technique | subtechnique
    const [level, setLevel] = useState("tactic");
    const [activeTactic, setActiveTactic] = useState(null);
    const [activeTechnique, setActiveTechnique] = useState(null);

    useEffect(() => {
        api
            .get("/attack/catalog")
            .then((r) => setCatalog(Array.isArray(r.data?.techniques) ? r.data.techniques : []))
            .catch(() => setCatalog([]));
    }, []);

    const byId = useMemo(() => {
        const m = {};
        for (const t of catalog) {
            if (t.technique_id) m[t.technique_id] = t;
        }
        return m;
    }, [catalog]);

    /** Flat raw rows with parent/tactic resolved */
    const rawRows = useMemo(() => {
        return (topTechniques || [])
            .map((row) => {
                const tid = (row.id || row.technique_id || "").toUpperCase();
                if (!tid) return null;
                const meta = byId[tid] || {};
                const parent = meta.parent_id || (tid.includes(".") ? tid.split(".")[0] : null);
                const isSub = Boolean(parent) || tid.includes(".");
                const parentId = parent || tid;
                return {
                    id: tid,
                    count: Number(row.count) || 0,
                    name: meta.name || row.name || tid,
                    tactic: meta.tactic || "Unmapped",
                    parent_id: parentId,
                    is_sub: isSub && parentId !== tid,
                };
            })
            .filter(Boolean);
    }, [topTechniques, byId]);

    /** Parent technique aggregates (sub-techniques rolled up) */
    const techniqueRows = useMemo(() => {
        const counts = {};
        const meta = {};
        for (const row of rawRows) {
            const key = row.parent_id || row.id;
            counts[key] = (counts[key] || 0) + row.count;
            if (!meta[key]) {
                const m = byId[key] || {};
                meta[key] = {
                    name: m.name || key,
                    tactic: m.tactic || row.tactic || "Unmapped",
                };
            }
        }
        return Object.entries(counts)
            .map(([id, count]) => ({
                id,
                count,
                name: meta[id]?.name || id,
                tactic: meta[id]?.tactic || "Unmapped",
            }))
            .sort((a, b) => b.count - a.count);
    }, [rawRows, byId]);

    const tacticRows = useMemo(() => {
        const counts = {};
        for (const row of techniqueRows) {
            const t = row.tactic || "Unmapped";
            counts[t] = (counts[t] || 0) + row.count;
        }
        return Object.entries(counts)
            .map(([tactic, count]) => ({tactic, count, id: tactic}))
            .sort((a, b) => b.count - a.count);
    }, [techniqueRows]);

    /** Sub-techniques under active parent technique */
    const subRows = useMemo(() => {
        if (!activeTechnique) return [];
        const parent = activeTechnique.toUpperCase();
        const rows = rawRows
            .filter((r) => r.is_sub && (r.parent_id || "").toUpperCase() === parent)
            .sort((a, b) => b.count - a.count);
        // If no explicit subs in data, fall back to the parent alone
        if (rows.length === 0) {
            const parentRow = rawRows.find((r) => r.id === parent) || techniqueRows.find((r) => r.id === parent);
            if (parentRow) {
                return [{id: parent, count: parentRow.count, name: parentRow.name, tactic: parentRow.tactic}];
            }
        }
        return rows;
    }, [rawRows, activeTechnique, techniqueRows]);

    const chartData = useMemo(() => {
        if (level === "tactic") {
            return tacticRows.slice(0, 10).map((r) => ({
                label: r.tactic,
                count: r.count,
                id: r.tactic,
            }));
        }
        if (level === "technique") {
            return techniqueRows
                .filter((r) => !activeTactic || r.tactic === activeTactic)
                .slice(0, 12)
                .map((r) => ({
                    label: r.id,
                    count: r.count,
                    id: r.id,
                    name: r.name,
                    tactic: r.tactic,
                }));
        }
        // subtechnique
        return subRows.slice(0, 12).map((r) => ({
            label: r.id,
            count: r.count,
            id: r.id,
            name: r.name,
            tactic: r.tactic,
        }));
    }, [level, tacticRows, techniqueRows, activeTactic, subRows]);

    const hasSubsFor = (techId) =>
        rawRows.some((r) => r.is_sub && (r.parent_id || "").toUpperCase() === (techId || "").toUpperCase());

    const onBarClick = (entry) => {
        if (!entry) return;
        if (level === "tactic") {
            setActiveTactic(entry.id || entry.label);
            setActiveTechnique(null);
            setLevel("technique");
            return;
        }
        if (level === "technique") {
            const tid = entry.id || entry.label;
            if (hasSubsFor(tid)) {
                setActiveTechnique(tid);
                setLevel("subtechnique");
            }
            // else: leaf technique — links below open incidents
        }
    };

    const backToTactics = () => {
        setLevel("tactic");
        setActiveTactic(null);
        setActiveTechnique(null);
    };

    const backToTechniques = () => {
        setLevel("technique");
        setActiveTechnique(null);
    };

    const levelLabel =
        level === "tactic"
            ? "Category (tactic)"
            : level === "technique"
                ? `Techniques · ${activeTactic || "all"}`
                : `Sub-techniques · ${activeTechnique || ""}`;

    // Enterprise drill-down: primary → muted primary → gray (no cyan/neon)
    const barColor =
        level === "tactic"
            ? chart.chart.blue
            : level === "technique"
                ? chart.primary
                : chart.chart.gray;

    return (
        <div data-testid="chart-techniques">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="soc-label flex items-center gap-1.5">
                    <ChartBar size={11}/> Top ATT&CK Techniques
                    {help && (
                        <HelpTip title={help.title} testid="tip-chart-techniques">
                            <p>{help.body}</p>
                            <p className="text-muted-foreground">
                                Drill-down: Tactic → Technique → Sub-technique (when catalog has children). Click
                                technique IDs to filter Incidents.
                            </p>
                        </HelpTip>
                    )}
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                    {level === "subtechnique" && (
                        <button
                            type="button"
                            data-testid="attack-drill-back-tech"
                            onClick={backToTechniques}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                            title="Back to techniques in this tactic"
                        >
                            <CaretLeft size={12}/> Techniques
                        </button>
                    )}
                    {level !== "tactic" && (
                        <button
                            type="button"
                            data-testid="attack-drill-back"
                            onClick={backToTactics}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                            title="Back to all tactics"
                        >
                            <CaretLeft size={12}/> All tactics
                        </button>
                    )}
                    <span className="text-muted-foreground/80 font-mono" title="Current drill-down level">
            {levelLabel}
          </span>
                </div>
            </div>

            {/* Breadcrumb */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-2 flex-wrap"
                 data-testid="attack-drill-breadcrumb">
                <button
                    type="button"
                    className={level === "tactic" ? "text-primary" : "hover:text-primary"}
                    onClick={backToTactics}
                    title="Show tactic categories"
                >
                    Tactics
                </button>
                {level !== "tactic" && activeTactic && (
                    <>
                        <span>/</span>
                        <button
                            type="button"
                            className={level === "technique" ? "text-primary" : "hover:text-primary"}
                            onClick={backToTechniques}
                            title="Show techniques in this tactic"
                        >
                            {activeTactic}
                        </button>
                    </>
                )}
                {level === "subtechnique" && activeTechnique && (
                    <>
                        <span>/</span>
                        <span className="text-primary font-mono">{activeTechnique}</span>
                    </>
                )}
            </div>

            {chartData.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-12">No technique data in this window</div>
            ) : (
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} layout="vertical" margin={{left: 8, right: 12}}>
                        <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} horizontal={false}/>
                        <XAxis type="number" tick={chart.tick}/>
                        <YAxis
                            dataKey="label"
                            type="category"
                            tick={{...chart.tick, fontFamily: "IBM Plex Mono"}}
                            width={level === "tactic" ? 100 : 80}
                        />
                        <Tooltip
                            contentStyle={chart.contentStyle}
                            formatter={(v, _n, p) => {
                                const name = p?.payload?.name;
                                return [v, name ? `${p.payload.id} · ${name}` : "count"];
                            }}
                            labelFormatter={(l) =>
                                level === "tactic"
                                    ? `Tactic: ${l}`
                                    : level === "technique"
                                        ? `Technique: ${l}`
                                        : `Sub-technique: ${l}`
                            }
                        />
                        <Bar
                            dataKey="count"
                            fill={barColor}
                            radius={[0, 3, 3, 0]}
                            cursor="pointer"
                            onClick={(data) => onBarClick(data?.payload || data)}
                        >
                            {chartData.map((entry) => (
                                <Cell key={entry.id} fill={barColor}/>
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            )}

            {(level === "technique" || level === "subtechnique") && (
                <div className="mt-2 flex flex-wrap gap-1.5" data-testid="attack-tech-links">
                    {chartData.slice(0, 10).map((row) => (
                        <Link
                            key={row.id}
                            to={`/incidents?technique=${encodeURIComponent(row.id)}`}
                            className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-primary/30 text-primary hover:bg-primary/10"
                            title={`Filter incidents with ${row.id} ${row.name || ""}`}
                        >
                            {row.id} · {row.count}
                        </Link>
                    ))}
                </div>
            )}
            {level === "tactic" && (
                <p className="text-[10px] text-muted-foreground/80 mt-2">
                    Click a tactic bar to drill into techniques. Techniques with sub-techniques drill further.
                </p>
            )}
            {level === "technique" && (
                <p className="text-[10px] text-muted-foreground/80 mt-2">
                    Click a technique with children to open sub-techniques, or use the ID chips to filter Incidents.
                </p>
            )}
        </div>
    );
}
