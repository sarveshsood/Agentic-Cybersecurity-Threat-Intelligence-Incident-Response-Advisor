/**
 * Severity + status badges — enterprise design tokens only.
 * Tooltips use Radix Tip (instant, theme-aware) rather than native title.
 */
import {Tip} from "./HelpTip";

export const SEVERITY_STYLE = {
    critical: "sev-critical",
    high: "sev-high",
    medium: "sev-medium",
    low: "sev-low",
};

const SEVERITY_TIP = {
    critical: "Critical — active exploitation, ransomware, or high-impact compromise. Prioritize immediately.",
    high: "High — strong IoCs or successful attack stages; prompt analyst attention.",
    medium: "Medium — suspicious activity needing triage; may be probing or partial compromise.",
    low: "Low — informational or low-confidence detection; useful for baselining noise.",
};

const STATUS_TIP = {
    new: "New — created by the pipeline; not yet claimed for review/response.",
    in_progress: "In progress — analyst is actively working the case.",
    pending_review: "Pending review — Human-in-the-Loop queue (severity gate or low grounding).",
    approved: "Approved — playbook accepted by a senior reviewer.",
    rejected: "Rejected — playbook declined; may need rework or false positive.",
    closed: "Closed — case completed and archived from active response.",
    running: "Running — job or pipeline step in progress.",
    failed: "Failed — job or action failed.",
    queued: "Queued — waiting to run.",
    success: "Success — completed successfully.",
};

const STATUS_CLASS = {
    new: "status-new",
    in_progress: "status-in_progress",
    pending_review: "status-pending_review",
    approved: "status-approved",
    rejected: "status-rejected",
    closed: "status-closed",
    running: "status-running",
    failed: "status-failed",
    queued: "status-queued",
    success: "status-success",
    pending: "status-pending",
    healthy: "status-healthy",
    offline: "status-new",
    error: "status-error",
};

export function SeverityBadge({severity, className = ""}) {
    const s = (severity || "low").toLowerCase();
    const style = SEVERITY_STYLE[s] || SEVERITY_STYLE.low;
    return (
        <Tip content={SEVERITY_TIP[s] || `Severity: ${s}`}>
            <span
                data-testid={`severity-${s}`}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-[0.08em] font-semibold ${style} ${className}`}
            >
                <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden/>
                {s}
            </span>
        </Tip>
    );
}

export function StatusPill({status, className = ""}) {
    const key = (status || "new").toLowerCase();
    const cls = STATUS_CLASS[key] || STATUS_CLASS.new;
    const label = (status || "new").replace(/_/g, " ");
    return (
        <Tip content={STATUS_TIP[key] || `Status: ${label}`}>
            <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-[0.08em] font-semibold ${cls} ${className}`}
                data-testid={`status-${key}`}
            >
                {label}
            </span>
        </Tip>
    );
}

/** Generic status chip for jobs / health */
export function StatusChip({status, children, className = ""}) {
    return <StatusPill status={status} className={className}>{children}</StatusPill>;
}

export default SeverityBadge;
