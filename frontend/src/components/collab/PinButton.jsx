/**
 * H-08 favorite / pin toggle for incidents.
 */
import {useCallback, useEffect, useState} from "react";
import {api} from "../../lib/api";
import {Star} from "@phosphor-icons/react";
import {Tip} from "../HelpTip";
import {cn} from "@/lib/utils";

export default function PinButton({
    targetType = "incident",
    targetId,
    label,
    className,
}) {
    const [pinned, setPinned] = useState(false);
    const [pinId, setPinId] = useState(null);

    const refresh = useCallback(async () => {
        try {
            const r = await api.get("/pins", {params: {target_type: targetType}});
            const items = Array.isArray(r.data?.items) ? r.data.items : [];
            const hit = items.find((p) => p.target_id === targetId);
            setPinned(Boolean(hit));
            setPinId(hit?.id || null);
        } catch {
            setPinned(false);
            setPinId(null);
        }
    }, [targetType, targetId]);

    useEffect(() => {
        if (targetId) refresh();
    }, [targetId, refresh]);

    const toggle = async () => {
        try {
            if (pinned && pinId) {
                await api.delete(`/pins/${pinId}`);
                setPinned(false);
                setPinId(null);
            } else {
                const r = await api.post("/pins", {
                    target_type: targetType,
                    target_id: targetId,
                    label: label || undefined,
                });
                setPinned(true);
                setPinId(r.data?.id || null);
            }
        } catch {
            /* ignore */
        }
    };

    return (
        <Tip content={pinned ? "Remove favorite" : "Favorite / pin to dashboard"}>
            <button
                type="button"
                data-testid={`pin-${targetType}-${targetId}`}
                className={cn(
                    "p-1 rounded text-muted-foreground hover:text-amber-500 transition-colors",
                    pinned && "text-amber-500",
                    className,
                )}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle();
                }}
                aria-pressed={pinned}
                aria-label={pinned ? "Unfavorite" : "Favorite"}
            >
                <Star size={16} weight={pinned ? "fill" : "regular"}/>
            </button>
        </Tip>
    );
}
