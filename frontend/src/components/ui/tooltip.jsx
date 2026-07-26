import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

import {cn} from "@/lib/utils"

const TooltipProvider = TooltipPrimitive.Provider

const Tooltip = TooltipPrimitive.Root

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef(
    (
        {
            className,
            sideOffset = 6,
            side = "top",
            align = "center",
            avoidCollisions = true,
            collisionPadding = 12,
            ...props
        },
        ref,
    ) => (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                ref={ref}
                side={side}
                align={align}
                sideOffset={sideOffset}
                avoidCollisions={avoidCollisions}
                collisionPadding={collisionPadding}
                className={cn(
                    "z-[200] max-w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-md",
                    "bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md",
                    "break-words whitespace-normal leading-snug",
                    "animate-in fade-in-0 zoom-in-95",
                    "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
                    "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                    "origin-[--radix-tooltip-content-transform-origin]",
                    className,
                )}
                {...props}
            />
        </TooltipPrimitive.Portal>
    ),
)
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export {Tooltip, TooltipTrigger, TooltipContent, TooltipProvider}
