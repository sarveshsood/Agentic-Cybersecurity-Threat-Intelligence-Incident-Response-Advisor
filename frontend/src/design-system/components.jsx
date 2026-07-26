/**
 * ACTIRA design-system primitives.
 * Prefer these over ad-hoc card/badge markup for new UI.
 * Tokens live in tokens.js + index.css CSS variables.
 */
import {cn} from "../lib/utils";
import {Link} from "react-router-dom";
import {iconSize} from "./tokens";

/** Enterprise button — maps to soc-btn-* utility classes */
export function DsButton({
                             variant = "primary",
                             size = "md",
                             className,
                             loading = false,
                             disabled,
                             type = "button",
                             children,
                             ...props
                         }) {
    const variants = {
        primary: "soc-btn-primary",
        secondary: "soc-btn-secondary",
        outline: "soc-btn-secondary",
        ghost: "soc-btn-ghost",
        danger: "soc-btn-danger",
    };
    const sizes = {
        sm: "text-xs px-3 py-1.5 h-8",
        md: "",
        lg: "text-sm px-5 py-2.5 h-11",
    };
    return (
        <button
            type={type}
            disabled={disabled || loading}
            className={cn(variants[variant] || variants.primary, sizes[size], className)}
            aria-busy={loading || undefined}
            {...props}
        >
            {loading ? "Working…" : children}
        </button>
    );
}

/** Form field wrapper with label + hint + error */
export function FormField({
                              label,
                              htmlFor,
                              hint,
                              error,
                              required,
                              children,
                              className,
                          }) {
    return (
        <div className={cn("space-y-1.5", className)}>
            {label ? (
                <label htmlFor={htmlFor} className="soc-label block">
                    {label}
                    {required ? <span className="text-error ml-0.5" aria-hidden>*</span> : null}
                </label>
            ) : null}
            {children}
            {error ? (
                <p className="text-xs text-error" role="alert">{error}</p>
            ) : hint ? (
                <p className="text-[11px] text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}

/** Status dot — healthy / running / offline / error */
export function StatusDot({status = "healthy", className, title, pulse = false}) {
    const color = {
        healthy: "bg-[var(--success)]",
        success: "bg-[var(--success)]",
        running: "bg-[var(--info)]",
        pending: "bg-[var(--warning)]",
        offline: "bg-[var(--muted-foreground)]",
        error: "bg-[var(--error)]",
        failed: "bg-[var(--error)]",
        queued: "bg-[hsl(var(--muted-foreground))]",
    }[status] || "bg-[var(--info)]";
    return (
        <span
            className={cn("status-dot", color, pulse && "status-dot-live", className)}
            title={title || status}
            aria-hidden
        />
    );
}

/** Skeleton loading block */
export function SkeletonBlock({className, lines = 1}) {
    return (
        <div className={cn("space-y-2 animate-pulse", className)} role="status" aria-label="Loading">
            {Array.from({length: lines}).map((_, i) => (
                <div key={i} className="h-3 rounded-md bg-muted" style={{width: `${88 - i * 12}%`}}/>
            ))}
        </div>
    );
}

/** Section micro-label */
export function SectionLabel({children, className, icon: Icon}) {
    return (
        <div className={cn("soc-label flex items-center gap-1.5", className)}>
            {Icon ? <Icon size={iconSize.sm} aria-hidden/> : null}
            {children}
        </div>
    );
}

/**
 * Data table shell — sticky header, optional zebra, scroll container.
 * Prefer over raw <table className="w-full"> for enterprise list views.
 */
export function DataTable({
                              children,
                              className,
                              zebra = true,
                              sticky = true,
                              maxHeight,
                              testid,
                              "aria-label": ariaLabel,
                          }) {
    return (
        <div
            className={cn("overflow-auto", sticky && "soc-table-scroll")}
            style={maxHeight ? {maxHeight} : undefined}
            data-testid={testid}
        >
            <table
                className={cn(
                    "soc-table",
                    zebra && "soc-table-zebra",
                    sticky && "soc-table-sticky",
                    className,
                )}
                aria-label={ariaLabel}
            >
                {children}
            </table>
        </div>
    );
}

/** Page title block — use on every authenticated page */
export function PageHeader({
                               title,
                               subtitle,
                               actions,
                               icon: Icon,
                               tip,
                               breadcrumb,
                               className,
                               testid,
                               children,
                           }) {
    return (
        <header
            className={cn("page-header flex flex-wrap items-start justify-between gap-4", className)}
            data-testid={testid}
        >
            <div className="min-w-0">
                {breadcrumb ? (
                    <div className="text-[11px] text-muted-foreground mb-1.5 flex flex-wrap items-center gap-1.5">
                        {breadcrumb}
                    </div>
                ) : null}
                <div className="flex items-center gap-2 min-w-0">
                    {Icon ? <Icon size={22} className="text-primary shrink-0" aria-hidden/> : null}
                    <h1 className="page-title truncate">{title}</h1>
                    {tip}
                </div>
                {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
                {children}
            </div>
            {actions ? (
                <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
            ) : null}
        </header>
    );
}

/** Surface panel / card */
export function Panel({
                          title,
                          subtitle,
                          icon: Icon,
                          actions,
                          children,
                          className,
                          bodyClassName,
                          sectionKey,
                          testid,
                          noPadding,
                      }) {
    return (
        <section
            className={cn("soc-panel overflow-hidden", className)}
            data-section={sectionKey}
            data-testid={testid}
        >
            {(title || actions) && (
                <div className="flex items-start justify-between gap-3 px-4 py-3 border-b theme-border">
                    <div className="min-w-0 flex items-start gap-2">
                        {Icon ? <Icon size={18} className="text-primary mt-0.5 shrink-0" aria-hidden/> : null}
                        <div className="min-w-0">
                            {title ? <h2 className="text-sm font-semibold tracking-tight truncate">{title}</h2> : null}
                            {subtitle ? <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p> : null}
                        </div>
                    </div>
                    {actions ? <div className="flex items-center gap-2 shrink-0">{actions}</div> : null}
                </div>
            )}
            <div className={cn(noPadding ? "" : "p-4", bodyClassName)}>{children}</div>
        </section>
    );
}

/** Format KPI values consistently (integers grouped; rates with fixed decimals). */
export function formatMetricValue(value, {decimals} = {}) {
    if (value == null || value === "") return "—";
    if (typeof value === "string") return value;
    if (typeof value !== "number" || Number.isNaN(value)) return String(value);
    if (decimals != null) {
        return value.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    }
    if (Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9) {
        return Math.round(value).toLocaleString();
    }
    // Ratios like grounding 0–1
    if (value >= 0 && value <= 1) {
        return value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});
    }
    return value.toLocaleString(undefined, {maximumFractionDigits: 2});
}

/** KPI / metric card — compact enterprise summary */
export function KpiCard({
                            label,
                            value,
                            sub,
                            icon: Icon,
                            tone = "default",
                            to,
                            tip,
                            testid,
                            className,
                            trend,
                            decimals,
                            loading = false,
                        }) {
    const toneClass = {
        default: "text-primary",
        primary: "text-primary",
        info: "text-primary",
        critical: "text-[var(--sev-critical)]",
        high: "text-[var(--sev-high)]",
        warning: "text-[var(--warning)]",
        success: "text-[var(--success)]",
        error: "text-[var(--error)]",
        muted: "text-muted-foreground",
        // legacy aliases → enterprise tokens
        cyan: "text-primary",
        red: "text-[var(--sev-critical)]",
        amber: "text-[var(--warning)]",
        emerald: "text-[var(--success)]",
        violet: "text-primary",
    }[tone] || "text-primary";

    const display = loading ? "…" : formatMetricValue(value, {decimals});

    const body = (
        <div
            data-testid={testid}
            className={cn(
                "soc-card p-4 h-full transition-colors hover:border-primary/30 group",
                to && "cursor-pointer",
                loading && "opacity-70",
                className,
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="soc-label truncate flex items-center gap-1.5 min-w-0">
                    {Icon ? (
                        <Icon
                            size={iconSize.sm}
                            weight="duotone"
                            className={cn("shrink-0 opacity-90", toneClass)}
                            aria-hidden
                        />
                    ) : null}
                    <span className="truncate">{label}</span>
                    {tip}
                </div>
            </div>
            <div
                className={cn("mt-2 font-mono text-3xl font-semibold tabular-nums tracking-tight min-h-[2.25rem]", toneClass)}
            >
                {display}
            </div>
            <div className="flex items-center justify-between gap-2 mt-1 min-h-[1rem]">
                {sub ? <div className="text-[11px] text-muted-foreground truncate">{sub}</div> : <span/>}
                {trend != null ? (
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{trend}</span>
                ) : null}
            </div>
        </div>
    );

    if (to) {
        return (
            <Link
                to={to}
                title={`Open ${label}`}
                className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-card"
            >
                {body}
            </Link>
        );
    }
    return body;
}

/** Alias — metric card */
export const MetricCard = KpiCard;

/** Semantic alert banner */
export function AlertBanner({
                                variant = "info",
                                title,
                                description,
                                icon: Icon,
                                onDismiss,
                                className,
                                testid,
                                children,
                            }) {
    const v = ["info", "success", "warning", "error"].includes(variant) ? variant : "info";
    return (
        <div
            role={v === "error" || v === "warning" ? "alert" : "status"}
            data-testid={testid}
            className={cn(
                "rounded-lg px-4 py-3 text-sm flex items-start gap-3",
                `alert-${v}`,
                className,
            )}
        >
            {Icon ? <Icon size={18} className="shrink-0 mt-0.5" aria-hidden/> : null}
            <div className="min-w-0 flex-1">
                {title ? <div className="font-semibold">{title}</div> : null}
                {description ? <p className="text-xs mt-0.5 opacity-90">{description}</p> : null}
                {children}
            </div>
            {onDismiss ? (
                <button
                    type="button"
                    onClick={onDismiss}
                    className="text-xs opacity-70 hover:opacity-100 shrink-0"
                    aria-label="Dismiss"
                >
                    ✕
                </button>
            ) : null}
        </div>
    );
}

/** Empty / loading / error list states */
export function EmptyState({
                               icon: Icon,
                               title = "Nothing here yet",
                               description,
                               action,
                               className,
                               testid = "empty-state",
                           }) {
    return (
        <div className={cn("soc-card p-8 text-center", className)} data-testid={testid}>
            {Icon ? <Icon size={28} className="text-muted-foreground mx-auto mb-2" aria-hidden/> : null}
            <div className="text-sm font-medium">{title}</div>
            {description ? <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">{description}</p> : null}
            {action?.to && action?.label ? (
                <Link
                    to={action.to}
                    className="inline-block mt-3 text-xs text-primary font-semibold hover:underline"
                    data-testid={`${testid}-action`}
                >
                    {action.label}
                </Link>
            ) : null}
            {action?.onClick && action?.label ? (
                <button
                    type="button"
                    onClick={action.onClick}
                    className="inline-block mt-3 text-xs text-primary font-semibold hover:underline"
                >
                    {action.label}
                </button>
            ) : null}
        </div>
    );
}

export function LoadingState({message = "Loading…", className, testid = "loading-state"}) {
    return (
        <div
            className={cn("soc-card p-4 text-sm text-muted-foreground animate-pulse", className)}
            data-testid={testid}
            role="status"
            aria-live="polite"
        >
            {message}
        </div>
    );
}

export function ErrorState({
                               title = "Could not load data",
                               message,
                               className,
                               testid = "error-state",
                           }) {
    return (
        <div
            className={cn("soc-card p-4 text-sm alert-error flex items-start gap-2", className)}
            data-testid={testid}
            role="alert"
        >
            <div>
                <div className="font-semibold">{title}</div>
                {message ? <p className="text-xs mt-0.5 opacity-90">{message}</p> : null}
            </div>
        </div>
    );
}

/** Professional recommendation / AI panel — not chat-like */
export function RecommendationPanel({
                                        title = "Analyst recommendation",
                                        confidence,
                                        riskScore,
                                        reasoning,
                                        evidence,
                                        mitre,
                                        actions,
                                        children,
                                        className,
                                        testid,
                                    }) {
    return (
        <section className={cn("soc-panel", className)} data-testid={testid}>
            <div className="px-4 py-3 border-b theme-border flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{title}</h3>
                <div className="flex items-center gap-2 text-[11px]">
                    {confidence != null && (
                        <span
                            className="px-2 py-0.5 rounded-md border theme-border bg-muted text-muted-foreground font-mono">
              Confidence {typeof confidence === "number" ? confidence.toFixed(2) : confidence}
            </span>
                    )}
                    {riskScore != null && (
                        <span
                            className="px-2 py-0.5 rounded-md border border-[var(--sev-high-border)] bg-[var(--sev-high-bg)] text-[var(--sev-high)] font-mono">
              Risk {riskScore}
            </span>
                    )}
                </div>
            </div>
            <div className="p-4 space-y-3 text-sm">
                {reasoning ? (
                    <div>
                        <div className="soc-label mb-1">Reasoning</div>
                        <p className="text-muted-foreground leading-relaxed">{reasoning}</p>
                    </div>
                ) : null}
                {evidence?.length ? (
                    <div>
                        <div className="soc-label mb-1">Evidence</div>
                        <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                            {evidence.map((e, i) => (
                                <li key={i}>{e}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
                {mitre?.length ? (
                    <div>
                        <div className="soc-label mb-1">MITRE ATT&CK</div>
                        <div className="flex flex-wrap gap-1.5">
                            {mitre.map((t) => (
                                <span key={t} className="ioc-chip">{t}</span>
                            ))}
                        </div>
                    </div>
                ) : null}
                {actions?.length ? (
                    <div>
                        <div className="soc-label mb-1">SOC actions</div>
                        <ol className="list-decimal pl-4 space-y-1 text-muted-foreground">
                            {actions.map((a, i) => (
                                <li key={i}>{a}</li>
                            ))}
                        </ol>
                    </div>
                ) : null}
                {children}
            </div>
        </section>
    );
}
