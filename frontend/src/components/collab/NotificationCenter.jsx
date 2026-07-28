/**
 * H-07 in-app notification inbox drawer.
 */
import {useCallback, useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {api} from "../../lib/api";
import {Bell, X} from "@phosphor-icons/react";
import {HelpTip, Tip} from "../HelpTip";
import {formatDateTime} from "../../lib/uiPrefs";
import {cn} from "@/lib/utils";

export function NotificationBell({className}) {
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);

    const refreshCount = useCallback(async () => {
        try {
            const r = await api.get("/notifications/unread-count");
            setUnread(Number(r.data?.unread) || 0);
        } catch {
            setUnread(0);
        }
    }, []);

    useEffect(() => {
        refreshCount();
        const id = setInterval(refreshCount, 45_000);
        return () => clearInterval(id);
    }, [refreshCount]);

    return (
        <>
            <Tip content="In-app notification inbox (assignments, mentions, jobs)">
                <button
                    type="button"
                    data-testid="notif-bell"
                    className={cn(
                        "relative inline-flex items-center justify-center h-8 w-8 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary",
                        className,
                    )}
                    onClick={() => setOpen(true)}
                    aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
                >
                    <Bell size={16} weight="duotone"/>
                    {unread > 0 && (
                        <span
                            className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-0.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground grid place-items-center"
                            data-testid="notif-unread-badge"
                        >
                            {unread > 99 ? "99+" : unread}
                        </span>
                    )}
                </button>
            </Tip>
            {open && (
                <NotificationDrawer
                    onClose={() => {
                        setOpen(false);
                        refreshCount();
                    }}
                />
            )}
        </>
    );
}

function NotificationDrawer({onClose}) {
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(true);

    const load = useCallback(async () => {
        setBusy(true);
        try {
            const r = await api.get("/notifications", {params: {limit: 40}});
            setItems(Array.isArray(r.data?.items) ? r.data.items : []);
        } catch {
            setItems([]);
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const markAll = async () => {
        await api.post("/notifications/read-all");
        await load();
    };

    const markOne = async (id) => {
        await api.post(`/notifications/${id}/read`);
        await load();
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="notif-drawer">
            <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={onClose}/>
            <div className="relative w-full max-w-md h-full bg-background border-l theme-border shadow-xl flex flex-col">
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b theme-border">
                    <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-sm">Inbox</span>
                        <HelpTip
                            title="In-app notifications"
                            body="Assignments, @mentions, comment replies, and pipeline job completion for you. Separate from Slack/email outbound alerts."
                            testid="tip-notif-drawer"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" className="text-[11px] text-primary" onClick={markAll} data-testid="notif-read-all">
                            Mark all read
                        </button>
                        <button type="button" onClick={onClose} aria-label="Close drawer">
                            <X size={16}/>
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {busy && <div className="text-xs text-muted-foreground">Loading…</div>}
                    {!busy && items.length === 0 && (
                        <div className="text-xs text-muted-foreground py-8 text-center">No notifications</div>
                    )}
                    {items.map((n) => (
                        <div
                            key={n.id}
                            className={cn(
                                "rounded-lg border theme-border p-3 text-sm",
                                !n.read_at && "bg-primary/5 border-primary/30",
                            )}
                            data-testid={`notif-item-${n.id}`}
                        >
                            <div className="font-semibold text-[13px]">{n.title}</div>
                            {n.body && <p className="text-[12px] text-muted-foreground m-0 mt-0.5">{n.body}</p>}
                            <div className="flex items-center justify-between gap-2 mt-2">
                                <span className="text-[10px] font-mono text-muted-foreground">
                                    {formatDateTime(n.created_at, {showStandard: false})}
                                </span>
                                <div className="flex gap-2">
                                    {n.incident_id && (
                                        <Link
                                            to={`/incidents/${n.incident_id}`}
                                            className="text-[10px] text-primary font-semibold"
                                            onClick={onClose}
                                        >
                                            Open case
                                        </Link>
                                    )}
                                    {!n.read_at && (
                                        <button
                                            type="button"
                                            className="text-[10px] text-muted-foreground"
                                            onClick={() => markOne(n.id)}
                                        >
                                            Mark read
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
