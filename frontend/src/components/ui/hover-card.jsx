import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import {cn} from "@/lib/utils"

const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardContent = React.forwardRef(
    (
        {
            className,
            align = "center",
            side = "bottom",
            sideOffset = 6,
            avoidCollisions = true,
            collisionPadding = 12,
            ...props
        },
        ref,
    ) => (
        <HoverCardPrimitive.Portal>
            <HoverCardPrimitive.Content
                ref={ref}
                align={align}
                side={side}
                sideOffset={sideOffset}
                avoidCollisions={avoidCollisions}
                collisionPadding={collisionPadding}
                className={cn(
                    "z-[200] w-64 max-w-[min(20rem,calc(100vw-1.5rem))] rounded-md border bg-popover p-4",
                    "text-popover-foreground shadow-md outline-none",
                    "break-words whitespace-normal",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out",
                    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
                    "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                    "origin-[--radix-hover-card-content-transform-origin]",
                    className,
                )}
                {...props}
            />
        </HoverCardPrimitive.Portal>
    ),
)
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

export {HoverCard, HoverCardTrigger, HoverCardContent}
