import {useNavigate} from "react-router-dom";

const TACTICS = [
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
 * counts: { T1110: n, "T1110.001": n, ... } from KPIs.
 * Clicking a cell navigates to /incidents?technique=ID
 */
export function AttackHeatmap({counts = {}}) {
    const nav = useNavigate();
    // Also roll sub-technique counts into parent for cells that only show parent
    const expanded = {...counts};
    Object.entries(counts).forEach(([tid, n]) => {
        if (tid.includes(".")) {
            const parent = tid.split(".")[0];
            expanded[parent] = (expanded[parent] || 0) + (n || 0);
        }
    });
    const max = Math.max(1, ...Object.values(expanded));

    return (
        <div data-testid="attack-heatmap" className="grid gap-4">
            {TACTICS.map((t) => (
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
                                    title={`${tid} — ${name} — ${c} incidents (click to filter)`}
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
            <p className="text-[10px] text-muted-foreground">Click a technique to open matching incidents.</p>
        </div>
    );
}
