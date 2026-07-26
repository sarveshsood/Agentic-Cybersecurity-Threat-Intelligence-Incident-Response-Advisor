import {Info} from "@phosphor-icons/react";
import {HoverCard, HoverCardContent, HoverCardTrigger,} from "./ui/hover-card";
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,} from "./ui/tooltip";
import {loadUiPrefs} from "../lib/uiPrefs";

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

/**
 * Rich hover help (title + body + optional "how calculated").
 * Use for metrics, column headers, and complex controls.
 * Honors Settings → UI prefs → show_help_tips.
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
    if (!helpTipsEnabled()) return null;

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
        <HoverCard openDelay={120} closeDelay={60}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    className={`inline-flex items-center justify-center rounded-full w-[16px] h-[16px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 ${className}`}
                    aria-label={title ? `Help: ${title}` : "Help"}
                    data-testid={testid}
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
                className={`w-[18rem] ${FLOATING_SURFACE} soc-popover px-3 py-2.5 z-[200]`}
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
 */
export function Tip({
                        content,
                        children,
                        side = "top",
                        align = "center",
                        delay = 200,
                        testid,
                        asChild = true,
                    }) {
    if (!content) return children;
    return (
        <TooltipProvider delayDuration={delay} skipDelayDuration={100}>
            <Tooltip>
                <TooltipTrigger asChild={asChild}>
                    {asChild ? (
                        children
                    ) : (
                        <span data-testid={testid} className="inline-flex min-w-0">
              {children}
            </span>
                    )}
                </TooltipTrigger>
                <TooltipContent
                    side={side}
                    align={align}
                    sideOffset={8}
                    collisionPadding={16}
                    className={`max-w-[min(20rem,calc(100vw-1.5rem))] bg-card border border-border text-foreground text-[11px] px-2.5 py-1.5 z-[200] shadow-md break-words whitespace-normal leading-snug`}
                    data-testid={testid}
                >
                    {content}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}
