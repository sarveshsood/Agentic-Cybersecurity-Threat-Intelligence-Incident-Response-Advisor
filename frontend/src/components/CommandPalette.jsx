/**
 * Global command palette (⌘K / Ctrl+K) — navigate + open recent incidents.
 * Nav items and sections come from constants/nav.js (same source as left rail).
 */
import {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAuth} from "../lib/auth";
import {getRecentIncidents} from "../lib/recentActivity";
import {groupNav, navForRole} from "../constants/nav";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "./ui/command";
import {ClockCounterClockwise} from "@phosphor-icons/react";

/** @param {{ shortcutLabel?: string }} props */
export default function CommandPalette({shortcutLabel} = {}) {
    const [open, setOpen] = useState(false);
    const [recents, setRecents] = useState([]);
    const nav = useNavigate();
    const {user} = useAuth();

    const refreshRecents = useCallback(() => {
        setRecents(getRecentIncidents());
    }, []);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                setOpen((v) => !v);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    useEffect(() => {
        if (open) refreshRecents();
    }, [open, refreshRecents]);

    // Same RBAC filter + section groups as the left rail
    const sectionGroups = useMemo(() => {
        return groupNav(navForRole(user?.role));
    }, [user?.role]);

    const go = (to) => {
        setOpen(false);
        nav(to);
    };

    const kbd =
        shortcutLabel ||
        (typeof navigator !== "undefined" &&
        /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "")
            ? "⌘K"
            : "Ctrl+K");

    return (
        <>
            <button
                type="button"
                data-testid="command-palette-trigger"
                onClick={() => setOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 h-8 shrink-0 px-2.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors text-[11px] font-medium"
                title={`Jump to any left-rail page (${kbd})`}
                aria-label={`Open command palette (${kbd})`}
            >
                <span className="uppercase tracking-[0.1em] font-semibold">Jump</span>
                <kbd
                    className="pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-0.5 rounded border theme-border bg-muted/40 px-1.5 font-mono text-[10px] font-medium text-muted-foreground"
                >
                    {kbd}
                </kbd>
            </button>

            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput
                    placeholder="Jump to Operate · Analyze · Govern · Admin…"
                    data-testid="command-palette-input"
                />
                <CommandList
                    data-testid="command-palette-list"
                    className="max-h-[min(75vh,36rem)]"
                >
                    <CommandEmpty>No matches.</CommandEmpty>

                    {/* Direct cmdk children only — wrapper divs hide/clip later groups */}
                    {sectionGroups.map((group, gi) => (
                        <CommandGroup
                            key={group.label}
                            heading={group.label}
                            data-testid={`cmd-section-${group.label.toLowerCase()}`}
                            className={gi > 0 ? "border-t border-border/60 mt-1 pt-1" : undefined}
                        >
                            {group.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <CommandItem
                                        key={item.to}
                                        value={`${group.label} ${item.label} ${item.keywords || ""} ${item.tip || ""}`}
                                        onSelect={() => go(item.to)}
                                        data-testid={`cmd-nav-${item.to.replace(/\//g, "") || "home"}`}
                                        title={item.tip}
                                        className="py-2"
                                    >
                                        <Icon size={16} className="mr-2 shrink-0 opacity-70" weight="duotone"/>
                                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                        <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground opacity-70 hidden sm:inline">
                                            {group.label}
                                        </span>
                                    </CommandItem>
                                );
                            })}
                        </CommandGroup>
                    ))}

                    {recents.length > 0 && (
                        <CommandGroup
                            heading="Recent incidents"
                            data-testid="cmd-section-recent"
                            className="border-t border-border/60 mt-1 pt-1"
                        >
                            {recents.map((r) => (
                                <CommandItem
                                    key={r.id}
                                    value={`incident ${r.title} ${r.id} ${r.severity}`}
                                    onSelect={() => go(`/incidents/${r.id}`)}
                                    data-testid={`cmd-recent-${r.id}`}
                                    className="py-2"
                                >
                                    <ClockCounterClockwise size={16} className="mr-2 shrink-0 opacity-70"/>
                                    <span className="truncate">{r.title || r.id}</span>
                                    {r.severity && (
                                        <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                                            {r.severity}
                                        </span>
                                    )}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                </CommandList>
            </CommandDialog>
        </>
    );
}
