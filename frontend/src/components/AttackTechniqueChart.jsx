import {useEffect, useMemo, useState} from "react";
import {Link} from "react-router-dom";
import {api} from "../lib/api";
import {Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,} from "recharts";
import {CaretLeft, ChartBar} from "@phosphor-icons/react";
import {HelpTip} from "./HelpTip";
import {useChartTheme} from "../design-system";

// Official MITRE ATT&CK Tactic name to ID mapping
const TACTIC_CODES = {
    "Initial Access": "TA0001",
    "Execution": "TA0002",
    "Persistence": "TA0003",
    "Privilege Escalation": "TA0004",
    "Defense Evasion": "TA0005",
    "Credential Access": "TA0006",
    "Discovery": "TA0007",
    "Lateral Movement": "TA0008",
    "Collection": "TA0009",
    "Command and Control": "TA0011",
    "Exfiltration": "TA0010",
    "Impact": "TA0040",
};

/**
 * Top ATT&CK techniques with multi-level drill-down and persistent ID/Name toggle.
 */
export function AttackTechniqueChart({topTechniques = [], help}) {
    const chart = useChartTheme();
    const [catalog, setCatalog] = useState([]);
    const [level, setLevel] = useState("tactic");
    const [activeTactic, setActiveTactic] = useState(null);
    const [activeTechnique, setActiveTechnique] = useState(null);
    const [showId, setShowId] = useState(false);

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
            .map(([tactic, count]) => ({
                tactic,
                count,
                id: tactic,
                name: tactic,
                code: TACTIC_CODES[tactic] || "TA9999",
            }))
            .sort((a, b) => b.count - a.count);
    }, [techniqueRows]);

    const subRows = useMemo(() => {
        if (!activeTechnique) return [];
        const parent = activeTechnique.toUpperCase();
        const rows = rawRows
            .filter((r) => r.is_sub && (r.parent_id || "").toUpperCase() === parent)
            .sort((a, b) => b.count - a.count);
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
            return tacticRows.slice(0, 8).map((r) => ({
                label: showId ? r.code : r.tactic,
                count: r.count,
                id: r.code,
                name: r.tactic,
            }));
        }
        if (level === "technique") {
            return techniqueRows
                .filter((r) => !activeTactic || r.tactic === activeTactic)
                .slice(0, 10)
                .map((r) => ({
                    label: showId ? r.id : (r.name || r.id),
                    count: r.count,
                    id: r.id,
                    name: r.name,
                    tactic: r.tactic,
                }));
        }
        return subRows.slice(0, 10).map((r) => ({
            label: showId ? r.id : (r.name || r.id),
            count: r.count,
            id: r.id,
            name: r.name,
            tactic: r.tactic,
        }));
    }, [level, tacticRows, techniqueRows, activeTactic, subRows, showId]);

    const hasSubsFor = (techId) =>
        rawRows.some((r) => r.is_sub && (r.parent_id || "").toUpperCase() === (techId || "").toUpperCase());

    const onBarClick = (entry) => {
        if (!entry) return;
        if (level === "tactic") {
            setActiveTactic(entry.name || entry.id);
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

    const barColor =
        level === "tactic"
            ? chart.chart.blue
            : level === "technique"
                ? chart.primary
                : chart.chart.gray;

    const currentLeftMargin = level === "tactic" ? (showId ? 70 : 130) : (showId ? 70 : 190);
    const currentAxisWidth = level === "tactic" ? (showId ? 60 : 120) : (showId ? 60 : 180);

    return (
        <div data-testid="chart-techniques" className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="soc-label flex items-center gap-1.5">
                    <ChartBar size={11}/> Top ATT&CK Techniques
                    {help && (
                        <HelpTip title={help.title} testid="tip-chart-techniques">
                            <p>{help.body}</p>
                            <p className="text-muted-foreground">
                                Drill-down: Tactic → Technique → Sub-technique. Click bars to drill down.
                            </p>
                        </HelpTip>
                    )}
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                    {level !== "tactic" && (
                        <button
                            type="button"
                            onClick={level === "subtechnique" ? backToTechniques : backToTactics}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                        >
                            <CaretLeft size={12}/> {level === "subtechnique" ? "Techniques" : "All tactics"}
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={() => setShowId((prev) => !prev)}
                        className="uppercase font-bold tracking-wider text-muted-foreground hover:text-primary bg-background border border-border px-2.5 py-1 rounded transition-colors shadow-sm cursor-pointer"
                        title="Toggle between full names and official IDs"
                    >
                        {showId ? "Show Name" : "Show ID"}
                    </button>

                    <span className="text-muted-foreground/80 font-mono">
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
                <div className="flex-1 w-full min-h-[280px]">
                    <ResponsiveContainer width="100%" height={290}>
                        <BarChart data={chartData} layout="vertical"
                                  margin={{left: currentLeftMargin, right: 15, top: 10, bottom: 10}}>
                            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} horizontal={false}/>
                            <XAxis type="number" tick={chart.tick}/>
                            <YAxis
                                dataKey="label"
                                type="category"
                                tick={{...chart.tick, fontFamily: "IBM Plex Mono", fontSize: 10}}
                                width={currentAxisWidth}
                                interval={0}
                            />
                            <Tooltip
                                contentStyle={chart.contentStyle}
                                formatter={(v, _n, p) => {
                                    const name = p?.payload?.name;
                                    return [v, name ? `${p.payload.id} · ${name}` : "count"];
                                }}
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
                </div>
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
        </div>
    );
}