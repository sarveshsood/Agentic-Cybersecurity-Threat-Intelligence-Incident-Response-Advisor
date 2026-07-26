/**
 * v1.7 Wave D — named agent roster over pipeline stages.
 * Honest framing: these wrap existing pipeline stages, not unconstrained multi-agent swarms.
 */
import {Robot, MagnifyingGlass, Globe, ShieldCheck, FileText, UserCheck} from "@phosphor-icons/react";
import {HelpTip, Tip} from "./HelpTip";

export const PIPELINE_AGENTS = [
    {
        id: "triage",
        name: "Triage",
        stage: "parse → correlate",
        desc: "Normalizes logs, expands packages, correlates multi-file CES events.",
        how: "Pipeline stages expand ZIP packages, detect_and_parse each file, then correlate CES events into one incident.",
        icon: MagnifyingGlass,
        tone: "text-blue-600 bg-blue-50 dark:bg-blue-950/40",
    },
    {
        id: "investigation",
        name: "Investigation",
        stage: "ioc_extract → attack_map",
        desc: "Extracts IoCs and maps heuristic ATT&CK techniques from events.",
        how: "Regex/heuristic IoC extraction plus keyword/rule ATT&CK mapping — not a full detection engine.",
        icon: Robot,
        tone: "text-primary bg-primary/10",
    },
    {
        id: "ti",
        name: "Threat Intel",
        stage: "enrich",
        desc: "Enriches indicators (live APIs when keyed; mock otherwise).",
        how: "Calls configured TI providers when keys exist; otherwise mock scores so demos still render.",
        icon: Globe,
        tone: "text-sky-600 bg-sky-50 dark:bg-sky-950/40",
    },
    {
        id: "playbook",
        name: "Playbook",
        stage: "playbook",
        desc: "Citation-grounded IR playbook via configured LLM + RAG.",
        how: "Hybrid BM25 + vector retrieval cites KB docs; LLM generates steps with grounding score.",
        icon: FileText,
        tone: "text-amber-600 bg-amber-50 dark:bg-amber-950/40",
    },
    {
        id: "compliance",
        name: "Compliance",
        stage: "audit / score",
        desc: "Evidence signals and framework alignment scoring (self-scored).",
        how: "Control catalog maps product signals to ISO/NIST-style controls — alignment score, not a certification.",
        icon: ShieldCheck,
        tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40",
    },
    {
        id: "reviewer",
        name: "Reviewer",
        stage: "hitl_gate",
        desc: "Human-in-the-loop gate for severity / grounding thresholds.",
        how: "hitl_gate routes high-severity or low-grounding cases to pending_review for senior approval.",
        icon: UserCheck,
        tone: "text-rose-600 bg-rose-50 dark:bg-rose-950/40",
    },
];

export default function AgentRoster({compact = false, className = ""}) {
    return (
        <div
            className={`soc-card p-4 ${className}`}
            data-testid="agent-roster"
            role="region"
            aria-label="Pipeline agent roster"
        >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-start gap-1.5 min-w-0">
                    <div>
                        <div className="soc-label inline-flex items-center gap-1.5">
                            Agent roster
                            <HelpTip
                                title="Agent roster"
                                body="Named roles over existing pipeline stages so analysts can reason about who does what. This is a pipeline copilot framing — not unconstrained multi-agent orchestration."
                                how="Each card maps to real stages in backend/pipeline.py (expand → parse → correlate → IoC → enrich → ATT&CK → playbook → HiTL)."
                                testid="tip-agent-roster"
                            />
                        </div>
                        <h3 className="text-sm font-semibold text-foreground mt-0.5">
                            Named collaborators over pipeline stages
                        </h3>
                    </div>
                </div>
                <Tip content="Honest product claim: stages are sequential pipeline steps, not autonomous agent swarms.">
                    <span
                        className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border theme-border text-muted-foreground cursor-help"
                        data-testid="agent-roster-honesty"
                    >
                        Pipeline copilot — not multi-agent swarm
                    </span>
                </Tip>
            </div>
            <div className={`grid gap-2 ${compact ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
                {PIPELINE_AGENTS.map((a) => {
                    const Icon = a.icon;
                    return (
                        <div
                            key={a.id}
                            className="rounded-lg border theme-border p-3 flex gap-2.5 items-start bg-[var(--shell-chip)]/40"
                            data-testid={`agent-card-${a.id}`}
                            title={compact ? a.desc : undefined}
                        >
                            <div className={`p-1.5 rounded-md shrink-0 ${a.tone}`}>
                                <Icon size={16} weight="duotone" aria-hidden/>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1 min-w-0">
                                    <div className="text-xs font-bold text-foreground truncate">{a.name}</div>
                                    <HelpTip
                                        title={a.name}
                                        body={a.desc}
                                        how={a.how}
                                        testid={`tip-agent-${a.id}`}
                                    />
                                </div>
                                <div className="text-[10px] font-mono text-muted-foreground mb-0.5">{a.stage}</div>
                                {!compact && (
                                    <p className="text-[11px] text-muted-foreground leading-snug">{a.desc}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
