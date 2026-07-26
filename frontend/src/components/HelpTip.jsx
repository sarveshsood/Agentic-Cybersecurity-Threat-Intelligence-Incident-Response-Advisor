import {Info} from "@phosphor-icons/react";
import {HoverCard, HoverCardContent, HoverCardTrigger,} from "./ui/hover-card";
import {Tooltip, TooltipContent, TooltipTrigger,} from "./ui/tooltip";
import {loadUiPrefs} from "../lib/uiPrefs";
import {cn} from "../lib/utils";
import {
    hasTipContent,
    helpTipPropsFrom,
    warnMissingTooltip,
} from "../lib/tooltipPrerequisite";

// Re-export policy helpers so pages can import tips from one module.
export {
    hasTipContent,
    helpTipPropsFrom,
    warnMissingTooltip,
    defaultTipCopy,
    isTooltipDevMode,
} from "../lib/tooltipPrerequisite";

function helpTipsEnabled() {
    try {
        return loadUiPrefs().show_help_tips !== false;
    } catch {
        return true;
    }
}

/** Shared class for popover surfaces that must stay inside the viewport */
const FLOATING_SURFACE =
    "max-w-[min(18rem,calc(100vw-1.5rem))] break-words whitespace-normal";

const ICON_BTN =
    "inline-flex items-center justify-center rounded-full w-[16px] h-[16px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/50";

/**
 * Rich hover help (title + body + optional "how calculated").
 * Use for metrics, column headers, and panel titles.
 * Honors Settings → UI prefs → show_help_tips for the rich HoverCard.
 * When help tips are off, still shows a lightweight Tip so panes are not silent.
 */
export function HelpTip({
                            title,
                            body,
                            how,
                            children,
                            side = "top",
                            align = "center",
                            testid,
                            className = "",
                            iconSize = 12,
                        }) {
    const rich = helpTipsEnabled();
    const short = [title, body].filter(Boolean).join(" — ");

    // When rich help is disabled, keep a one-line tip so icons never "go missing".
    if (!rich) {
        if (!short && !children) return null;
        return (
            <Tip content={short || title || "Help"} side={side} align={align} testid={testid}>
                <button
                    type="button"
                    className={cn(ICON_BTN, className)}
                    aria-label={title ? `Help: ${title}` : "Help"}
                    data-testid={testid}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <Info size={iconSize} weight="bold"/>
                </button>
            </Tip>
        );
    }

    const content = children || (
        <>
            {body && (
                <p className="text-[11px] leading-relaxed text-foreground/90 break-words">
                    {body}
                </p>
            )}
            {how && (
                <div className="rounded bg-background/80 px-2 py-1.5 border border-border mt-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
                        How calculated
                    </div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground break-words">
                        {how}
                    </p>
                </div>
            )}
        </>
    );

    return (
        <HoverCard openDelay={100} closeDelay={80}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    className={cn(ICON_BTN, className)}
                    aria-label={title ? `Help: ${title}` : "Help"}
                    data-testid={testid}
                    // Native title as progressive enhancement if portal hover fails
                    title={short || title || undefined}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <Info size={iconSize} weight="bold"/>
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                side={side}
                align={align}
                sideOffset={8}
                collisionPadding={16}
                className={cn(
                    "w-[18rem]",
                    FLOATING_SURFACE,
                    "soc-popover px-3 py-2.5 z-[300]",
                )}
            >
                <div className="space-y-1.5 text-left min-w-0 max-w-full">
                    {title && (
                        <div className="text-[12px] font-semibold text-primary tracking-wide leading-snug break-words">
                            {title}
                        </div>
                    )}
                    <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5 min-w-0 break-words">
                        {content}
                    </div>
                </div>
            </HoverCardContent>
        </HoverCard>
    );
}

/**
 * Lightweight tooltip for icons/buttons (single short string).
 * Always available for accessibility (controls/actions); not gated by show_help_tips.
 *
 * IMPORTANT: Uses the root <TooltipProvider> from App.js — do not nest providers
 * (nested providers were a common cause of "missing" tooltips on dense pages).
 */
export function Tip({
                        content,
                        children,
                        side = "top",
                        align = "center",
                        testid,
                        asChild = true,
                        className,
                    }) {
    if (!content) return children;

    // Disabled controls do not receive pointer events — wrap so the tip still opens.
    const isDisabled =
        children?.props &&
        (children.props.disabled === true || children.props["aria-disabled"] === true);
    const wrap = !asChild || isDisabled;
    const nativeTitle = typeof content === "string" ? content : undefined;

    const trigger = wrap ? (
        <span
            className={cn("inline-flex min-w-0 max-w-full", className)}
            data-testid={testid}
            title={nativeTitle}
        >
            {children}
        </span>
    ) : (
        children
    );

    return (
        <Tooltip>
            <TooltipTrigger asChild>{trigger}</TooltipTrigger>
            <TooltipContent
                side={side}
                align={align}
                sideOffset={8}
                collisionPadding={16}
                className={cn(
                    "max-w-[min(20rem,calc(100vw-1.5rem))] bg-card border border-border text-foreground",
                    "text-[11px] px-2.5 py-1.5 z-[300] shadow-md break-words whitespace-normal leading-snug",
                )}
                data-testid={testid}
            >
                {content}
            </TooltipContent>
        </Tooltip>
    );
}

/**
 * Consistent panel / section title with HelpTip (**required by default**).
 * Use on Incidents filters, workspace panes, and card headers.
 *
 * Prefer:
 *   <PaneLabel title="Threat score" body="…" how="…">Threat</PaneLabel>
 *
 * `requireTip` (default true) logs a dev warning when title/body are empty —
 * set requireTip={false} only for purely decorative labels.
 */
export function PaneLabel({
                              children,
                              title,
                              body,
                              how,
                              testid,
                              className,
                              side = "top",
                              requireTip = true,
                          }) {
    const has = Boolean(title || body);
    if (requireTip && !has) {
        const label =
            typeof children === "string" || typeof children === "number"
                ? String(children)
                : title || "section";
        warnMissingTooltip(
            "PaneLabel",
            label,
            "Pass title + body (and optional how) so HelpTip renders by default.",
        );
    }
    return (
        <div className={cn("soc-label inline-flex items-center gap-1.5", className)}>
            <span className="leading-none">{children}</span>
            {has ? (
                <HelpTip
                    title={title}
                    body={body}
                    how={how}
                    testid={testid}
                    side={side}
                />
            ) : null}
        </div>
    );
}

/**
 * Resolve a tip node for design-system surfaces.
 * Precedence: explicit `tip` element → auto HelpTip from tipTitle/tipBody → null.
 *
 * @param {object} opts
 * @param {import("react").ReactNode} [opts.tip] — pre-built HelpTip / Tip node
 * @param {string} [opts.tipTitle]
 * @param {string} [opts.tipBody]
 * @param {string} [opts.how]
 * @param {string} [opts.tipTestId]
 * @param {string} [opts.surface] — for dev warnings
 * @param {string} [opts.label]
 * @param {boolean} [opts.requireTip=true]
 * @returns {import("react").ReactNode}
 */
export function resolveHelpTipNode({
    tip,
    tipTitle,
    tipBody,
    how,
    tipTestId,
    surface = "surface",
    label = "",
    requireTip = true,
} = {}) {
    if (tip != null && tip !== false) return tip;
    const props = helpTipPropsFrom({tipTitle, tipBody, how, tipTestId});
    if (props) {
        return (
            <HelpTip
                title={props.title}
                body={props.body}
                how={props.how}
                testid={props.testid}
            />
        );
    }
    if (requireTip) {
        warnMissingTooltip(surface, label);
    }
    return null;
}

/**
 * Action / control wrapper — use instead of bare <button> when you need a tip.
 * Tooltips are a prerequisite for interactive controls (icons, compact actions).
 *
 *   <ActionTip content="Refresh list"><button>…</button></ActionTip>
 */
export function ActionTip({content, children, side = "top", testid, requireTip = true, label}) {
    if (!content || !String(content).trim()) {
        if (requireTip) {
            warnMissingTooltip(
                "ActionTip",
                label || "control",
                'Pass content="…" (short verb phrase) so Tip wraps the control.',
            );
        }
        return children;
    }
    return (
        <Tip content={content} side={side} testid={testid}>
            {children}
        </Tip>
    );
}
