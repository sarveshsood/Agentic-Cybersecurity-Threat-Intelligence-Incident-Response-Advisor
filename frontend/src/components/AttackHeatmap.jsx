import {useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api} from "../lib/api";

const FALLBACK_TACTICS = [
    {id: "Initial Access", techniques: ["T1078", "T1078.004", "T1190", "T1566", "T1566.001", "T1566.002"]},
    {id: "Execution", techniques: ["T1059", "T1059.001", "T1059.003", "T1059.004", "T1053", "T1053.003", "T1053.005"]},
    {id: "Persistence", techniques: ["T1078", "T1053", "T1053.005"]},
    {id: "Credential Access", techniques: ["T1110", "T1110.001", "T1110.003", "T1110.004"]},
    {id: "Discovery", techniques: ["T1046"]},
    {id: "Command & Control", techniques: ["T1071", "T1071.001", "T1071.004", "T1105"]},
    {id: "Impact", techniques: ["T1486"]},
];

const TECH_NAMES = {
    T1078: "Valid Accounts",
    "T1078.004": "Cloud Accounts",
    T1110: "Brute Force",
    "T1110.001": "Password Guessing",
    "T1110.003": "Password Spraying",
    "T1110.004": "Credential Stuffing",
    T1566: "Phishing",
    "T1566.001": "Phish Attachment",
    "T1566.002": "Phish Link",
    T1059: "Cmd/Scripting",
    "T1059.001": "PowerShell",
    "T1059.003": "Cmd Shell",
    "T1059.004": "Unix Shell",
    T1071: "App Layer Protocol",
    "T1071.001": "Web Protocols",
    "T1071.004": "DNS",
    T1486: "Data Encrypted",
    T1046: "Net Service Scan",
    T1190: "Exploit Public App",
    T1053: "Scheduled Task/Job",
    "T1053.003": "Cron",
    "T1053.005": "Scheduled Task",
    T1105: "Ingress Tool",
};

function intensity(count, max) {
    if (!count || max === 0) return "bg-muted text-muted-foreground border-border";
    const r = count / max;
    if (r > 0.66) return "bg-[var(--sev-critical-bg)] text-[var(--sev-critical)] border-[var(--sev-critical-border)]";
    if (r > 0.33) return "bg-[var(--sev-high-bg)] text-[var(--sev-high)] border-[var(--sev-high-border)]";
    return "bg-primary/10 text-primary border-primary/30";
}

/**
 * counts: { T1110: n, ... } from KPIs.
 * variant: "chips" (default) | "matrix" full catalog coverage grid
 */
export function AttackHeatmap({counts = {}, variant = "chips"}) {
    const nav = useNavigate();
    const [mode, setMode] = useState(variant === "matrix" ? "matrix" : "chips");
    const [matrix, setMatrix] = useState(null);

    useEffect(() => {
        if (mode !== "matrix") return undefined;
        let cancelled = false;
        api
            .get("/attack/matrix")
            .then((r) => {
                if (!cancelled) setMatrix(r.data);
            })
            .catch(() => {
                if (!cancelled) setMatrix(null);
            });
        return () => {
            cancelled = true;
        };
    }, [mode]);

    const expanded = useMemo(() => {
        const e = {...counts};
        Object.entries(counts).forEach(([tid, n]) => {
            if (tid.includes(".")) {
                const parent = tid.split(".")[0];
                e[parent] = (e[parent] || 0) + (n || 0);
            }
        });
        return e;
    }, [counts]);
    const max = Math.max(1, ...Object.values(expanded), 0);

    const chipLayout = FALLBACK_TACTICS;

    const colCount = matrix?.columns?.length || 0;
    const maxTechRows = useMemo(() => {
        if (!matrix?.columns?.length) return 0;
        return Math.max(...matrix.columns.map((c) => (c.techniques || []).length), 0);
    }, [matrix]);

    return (
        <div data-testid="attack-heatmap" className="grid gap-3 w-full min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] text-muted-foreground m-0 min-w-0">
                    Click a technique to filter incidents.
                    {mode === "matrix" && matrix?.note ? ` ${matrix.note}` : ""}
                </p>
                <div className="inline-flex rounded-md border border-border overflow-hidden text-[11px] font-semibold shrink-0">
                    <button
                        type="button"
                        className={`px-2.5 py-1 ${mode === "chips" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                        onClick={() => setMode("chips")}
                        data-testid="heatmap-mode-chips"
                    >
                        Chips
                    </button>
                    <button
                        type="button"
                        className={`px-2.5 py-1 border-l border-border ${mode === "matrix" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                        onClick={() => setMode("matrix")}
                        data-testid="heatmap-mode-matrix"
                    >
                        Coverage matrix
                    </button>
                </div>
            </div>

            {mode === "chips" && (
                <div className="grid gap-4">
                    {chipLayout.map((t) => (
                        <div key={t.id}>
                            <div className="soc-label mb-1.5">{t.id}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {t.techniques.map((tid) => {
                                    const c = expanded[tid] || counts[tid] || 0;
                                    const name = TECH_NAMES[tid] || tid;
                                    return (
                                        <button
                                            type="button"
                                            key={tid + t.id}
                                            title={`${tid} — ${name} — ${c} incidents`}
                                            onClick={() => nav(`/incidents?technique=${encodeURIComponent(tid)}`)}
                                            className={`px-2 py-1.5 rounded-md border min-w-[100px] max-w-[160px] text-left ${intensity(c, max)} transition-colors hover:ring-1 hover:ring-primary/30 cursor-pointer`}
                                            data-testid={`heatmap-${tid}`}
                                        >
                                            <div className="font-mono text-[10px] opacity-80">{tid}</div>
                                            <div className="text-[11px] font-medium leading-tight truncate">{name}</div>
                                            <div className="text-[10px] mt-0.5 opacity-90">{c} events</div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {mode === "matrix" && (
                <div
                    className="w-full min-w-0 border border-border rounded-lg overflow-hidden"
                    data-testid="attack-matrix-grid"
                >
                    {!matrix?.columns?.length ? (
                        <div className="p-4 text-xs text-muted-foreground">
                            Loading catalog matrix… (or API unavailable — try Chips view)
                        </div>
                    ) : (
                        <div className="w-full min-w-0 overflow-x-auto overscroll-x-contain">
                            {/*
                              Equal-width tactic columns that fill available space when wide,
                              and scroll horizontally only when the viewport is too narrow.
                              One shared vertical scroll (not per-column) for a stable matrix.
                            */}
                            <div
                                className="grid gap-px bg-border"
                                style={{
                                    gridTemplateColumns: `repeat(${colCount}, minmax(5.5rem, 1fr))`,
                                    minWidth: `min(100%, ${colCount * 5.5}rem)`,
                                    width: "100%",
                                }}
                            >
                                {matrix.columns.map((col) => (
                                    <div
                                        key={`h-${col.tactic}`}
                                        className="sticky top-0 z-[1] bg-muted px-1 py-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-wide text-center leading-tight min-h-[2.75rem] flex items-center justify-center border-b border-border"
                                        title={col.tactic}
                                    >
                                        <span className="line-clamp-2 px-0.5">{col.tactic}</span>
                                    </div>
                                ))}
                                {Array.from({length: maxTechRows}).map((_, rowIdx) =>
                                    matrix.columns.map((col) => {
                                        const tech = (col.techniques || [])[rowIdx];
                                        if (!tech) {
                                            return (
                                                <div
                                                    key={`${col.tactic}-empty-${rowIdx}`}
                                                    className="bg-card min-h-[2.75rem]"
                                                />
                                            );
                                        }
                                        const tid = tech.id;
                                        const c = expanded[tid] || counts[tid] || 0;
                                        return (
                                            <button
                                                type="button"
                                                key={tid}
                                                title={`${tid} — ${tech.name} — ${c}`}
                                                onClick={() =>
                                                    nav(`/incidents?technique=${encodeURIComponent(tid)}`)
                                                }
                                                className={`w-full min-w-0 text-left px-1 py-1 border-0 bg-card hover:ring-1 hover:ring-inset hover:ring-primary/40 ${intensity(c, max)} text-[10px]`}
                                                data-testid={`matrix-cell-${tid}`}
                                            >
                                                <div className="font-mono opacity-80 truncate">{tid}</div>
                                                <div className="truncate font-medium leading-tight">{tech.name}</div>
                                                <div className="opacity-80 tabular-nums">{c}</div>
                                            </button>
                                        );
                                    }),
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
