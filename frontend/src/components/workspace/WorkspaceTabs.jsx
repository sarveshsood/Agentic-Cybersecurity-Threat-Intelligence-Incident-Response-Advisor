/**
 * Investigation Workspace tab strip (v1.4 PR-5a).
 * Controlled via parent tab id + onChange; parent owns ?tab= URL state.
 */
const TABS = [
    {id: "case", label: "Case", tip: "Case overview: summary, severity, status, HiTL, and key scores."},
    {id: "evidence", label: "Evidence", tip: "Source files and correlated log evidence for this incident."},
    {id: "timeline", label: "Timeline", tip: "Chronological reconstruction of events across ingested logs."},
    {id: "assets", label: "Assets", tip: "Hosts, IPs, and other entities linked to this case."},
    {id: "users", label: "Users", tip: "User accounts observed in the attack path or authentication events."},
    {id: "ti", label: "Threat Intel", tip: "IoC enrichment scores (live APIs when keys are set; otherwise mock)."},
    {id: "mitre", label: "MITRE", tip: "ATT&CK techniques mapped by pipeline heuristics for this incident."},
    {id: "notes", label: "Notes", tip: "Analyst notebook entries and investigation notes for this case."},
    {id: "recommendations", label: "Recommendations", tip: "AI/RCA next steps and investigation recommendations."},
    {id: "playbooks", label: "Playbooks", tip: "Citation-grounded IR playbook steps for response."},
];

export const WORKSPACE_TAB_IDS = TABS.map((t) => t.id);

export default function WorkspaceTabs({active, onChange}) {
    return (
        <div
            className="flex flex-wrap gap-1 border-b border-border pb-0"
            data-testid="workspace-tabs"
            role="tablist"
            aria-label="Investigation workspace"
        >
            {TABS.map((t) => {
                const selected = active === t.id;
                return (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        title={t.tip || t.label}
                        data-testid={`workspace-tab-${t.id}`}
                        onClick={() => onChange(t.id)}
                        className={`px-3 py-2 text-xs font-semibold rounded-t-md border border-b-0 transition-colors ${
                            selected
                                ? "bg-card text-primary border-border border-b-card -mb-px"
                                : "bg-transparent text-muted-foreground border-transparent hover:text-foreground"
                        }`}
                    >
                        {t.label}
                    </button>
                );
            })}
        </div>
    );
}
