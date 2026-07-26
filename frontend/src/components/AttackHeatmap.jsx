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

    return (
        <div data-testid="attack-heatmap" className="grid gap-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[10px] text-muted-foreground m-0">
                    Click a technique to filter incidents.
                    {mode === "matrix" && matrix?.note ? ` ${matrix.note}` : ""}
                </p>
                <div className="inline-flex rounded-md border border-border overflow-hidden text-[11px] font-semibold">
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
                                            className={`px-2 py-1.5 rounded-md border min-w-[100px] text-left ${intensity(c, max)} transition-colors hover:ring-1 hover:ring-primary/30 cursor-pointer`}
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
                <div className="overflow-x-auto border border-border rounded-lg" data-testid="attack-matrix-grid">
                    {!matrix?.columns?.length ? (
                        <div className="p-4 text-xs text-muted-foreground">
                            Loading catalog matrix… (or API unavailable — try Chips view)
                        </div>
                    ) : (
                        <div className="flex min-w-max">
                            {matrix.columns.map((col) => (
                                <div
                                    key={col.tactic}
                                    className="w-[120px] shrink-0 border-r border-border last:border-r-0"
                                >
                                    <div className="sticky top-0 z-[1] bg-muted/80 backdrop-blur px-1.5 py-2 text-[10px] font-bold uppercase tracking-wide text-center border-b border-border min-h-[44px] flex items-center justify-center">
                                        {col.tactic}
                                    </div>
                                    <div className="p-1 space-y-1 max-h-[320px] overflow-y-auto">
                                        {(col.techniques || []).map((tech) => {
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
                                                    className={`w-full text-left px-1 py-1 rounded border text-[10px] ${intensity(c, max)} hover:ring-1 hover:ring-primary/30`}
                                                    data-testid={`matrix-cell-${tid}`}
                                                >
                                                    <div className="font-mono opacity-80">{tid}</div>
                                                    <div className="truncate font-medium">{tech.name}</div>
                                                    <div className="opacity-80">{c}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
