/**
 * Investigation Workspace tab strip (v1.4 PR-5a).
 * Controlled via parent tab id + onChange; parent owns ?tab= URL state.
 */
const TABS = [
    {id: "case", label: "Case"},
    {id: "evidence", label: "Evidence"},
    {id: "timeline", label: "Timeline"},
    {id: "assets", label: "Assets"},
    {id: "users", label: "Users"},
    {id: "ti", label: "Threat Intel"},
    {id: "mitre", label: "MITRE"},
    {id: "notes", label: "Notes"},
    {id: "recommendations", label: "Recommendations"},
    {id: "playbooks", label: "Playbooks"},
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
