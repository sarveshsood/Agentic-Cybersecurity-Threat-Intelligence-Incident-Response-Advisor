/**
 * Investigation Workspace tab strip (v1.4 PR-5a).
 * Controlled via parent tab id + onChange; parent owns ?tab= URL state.
 * Each tab has a Tip — critical for discoverability of workspace panes.
 */
import {Tip} from "../HelpTip";
import {cn} from "../../lib/utils";

const TABS = [
    {
        id: "case",
        label: "Case",
        tip: "Case overview — summary, correlation, RCA, behavior signals, entity graph, and AI investigator.",
    },
    {
        id: "evidence",
        label: "Evidence",
        tip: "Source files and pipeline stage timeline for the ingest that created this case.",
    },
    {
        id: "timeline",
        label: "Timeline",
        tip: "Chronological reconstruction of events. Filter by selecting a node on the Case entity graph.",
    },
    {
        id: "assets",
        label: "Assets",
        tip: "Hosts, IPs, and domains linked to this case from correlation / entity graph.",
    },
    {
        id: "users",
        label: "Users",
        tip: "User accounts seen in authentication or attack-path events for this incident.",
    },
    {
        id: "ti",
        label: "Threat Intel",
        tip: "Extracted IoCs with enrichment scores (live TI APIs when keys set; otherwise mock).",
    },
    {
        id: "mitre",
        label: "MITRE",
        tip: "ATT&CK techniques mapped by the pipeline. Click a chip for catalog drill-down.",
    },
    {
        id: "notes",
        label: "Notes",
        tip: "Analyst notebook — notes, findings, and recommendations stored on this case.",
    },
    {
        id: "recommendations",
        label: "Recommendations",
        tip: "AI/RCA next steps and recommendation-kind notebook entries for response planning.",
    },
    {
        id: "playbooks",
        label: "Playbooks",
        tip: "Citation-grounded IR playbook steps by phase. Click citation chips for KB excerpts.",
    },
];

export const WORKSPACE_TAB_IDS = TABS.map((t) => t.id);

export default function WorkspaceTabs({active, onChange}) {
    return (
        <div
            className="flex flex-wrap items-end gap-0.5 border-b border-border bg-card/40 px-1 pt-1 rounded-t-lg"
            data-testid="workspace-tabs"
            role="tablist"
            aria-label="Investigation workspace"
        >
            {TABS.map((t) => {
                const selected = active === t.id;
                return (
                    <Tip key={t.id} content={t.tip || t.label} side="bottom">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            title={t.tip || t.label}
                            data-testid={`workspace-tab-${t.id}`}
                            onClick={() => onChange(t.id)}
                            className={cn(
                                "px-3 py-2 text-[12px] font-medium leading-none tracking-tight",
                                "rounded-t-md border border-b-0 transition-colors whitespace-nowrap",
                                selected
                                    ? "bg-card text-primary border-border border-b-card -mb-px shadow-[0_-1px_0_0_hsl(var(--card))] font-semibold"
                                    : "bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/50",
                            )}
                        >
                            {t.label}
                        </button>
                    </Tip>
                );
            })}
        </div>
    );
}
