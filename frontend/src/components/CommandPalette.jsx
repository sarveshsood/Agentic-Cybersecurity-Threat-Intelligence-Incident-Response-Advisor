/**
 * Global command palette (⌘K / Ctrl+K) — navigate + open recent incidents.
 * Enterprise UX: fewer clicks, keyboard-first discovery. Non-breaking.
 */
import {useCallback, useEffect, useMemo, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAuth} from "../lib/auth";
import {getRecentIncidents} from "../lib/recentActivity";
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "./ui/command";
import {
    BookBookmark,
    ChartBar,
    ClockCounterClockwise,
    Crosshair,
    FileText,
    Flask,
    Gauge,
    GearSix,
    Heartbeat,
    ListChecks,
    MapTrifold,
    ShieldCheck,
    ShieldWarning,
    UploadSimple,
} from "@phosphor-icons/react";

/** Same order as Layout left rail (operate → analyze → govern → admin). */
const NAV_COMMANDS = [
    {to: "/", label: "Dashboard", icon: Gauge, roles: ["analyst", "senior_reviewer", "admin"], keywords: "home kpi"},
    {
        to: "/upload",
        label: "Ingest Logs",
        icon: UploadSimple,
        roles: ["analyst", "senior_reviewer", "admin"],
        keywords: "upload pipeline",
    },
    {
        to: "/incidents",
        label: "Incidents",
        icon: ShieldWarning,
        roles: ["analyst", "senior_reviewer", "admin"],
        keywords: "cases list",
    },
    {
        to: "/review",
        label: "Review Queue",
        icon: ListChecks,
        roles: ["senior_reviewer", "admin"],
        keywords: "hitl approve",
    },
    {
        to: "/hunt",
        label: "Threat Hunt",
        icon: Crosshair,
        roles: ["analyst", "senior_reviewer", "admin"],
        keywords: "hunt threat powershell lateral ransomware dns",
    },
    {
        to: "/analytics",
        label: "Analytics",
        icon: ChartBar,
        roles: ["analyst", "senior_reviewer", "admin"],
        keywords: "charts eda",
    },
    {
        to: "/knowledge",
        label: "Knowledge Base",
        icon: BookBookmark,
        roles: ["analyst", "senior_reviewer", "admin"],
        keywords: "kb search mitre",
    },
    {
        to: "/audit",
        label: "Audit Trail",
        icon: FileText,
        roles: ["senior_reviewer", "admin"],
        keywords: "audit log compliance hash integrity",
    },
    {
        to: "/compliance",
        label: "Compliance",
        icon: ShieldCheck,
        roles: ["senior_reviewer", "admin"],
        keywords: "iso soc2 nist gaps evidence governance",
    },
    {
        to: "/roadmap",
        label: "Roadmap",
        icon: MapTrifold,
        roles: ["analyst", "senior_reviewer", "admin"],
        keywords: "product",
    },
    {to: "/benchmark", label: "Golden Eval", icon: Flask, roles: ["admin"], keywords: "benchmark quality"},
    {
        to: "/ops",
        label: "Ops & Health",
        icon: Heartbeat,
        roles: ["admin"],
        keywords: "ops health ha multi-replica queue timings",
    },
    {to: "/settings", label: "Settings", icon: GearSix, roles: ["admin"], keywords: "llm keys config"},
];

export default function CommandPalette() {
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

    const navItems = useMemo(() => {
        const role = user?.role || "analyst";
        return NAV_COMMANDS.filter(
            (c) => c.roles.includes(role) || role === "admin",
        );
    }, [user?.role]);

    const go = (to) => {
        setOpen(false);
        nav(to);
    };

    return (
        <>
            <button
                type="button"
                data-testid="command-palette-trigger"
                onClick={() => setOpen(true)}
                className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary hover:border-primary/40 transition-all text-[11px] font-medium"
                title="Command palette (Ctrl+K)"
                aria-label="Open command palette"
            >
                <span className="uppercase tracking-[0.1em] font-semibold">Search</span>
                <kbd
                    className="pointer-events-none hidden md:inline-flex h-5 select-none items-center gap-0.5 rounded border theme-border bg-muted/40 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                    ⌘K
                </kbd>
            </button>

            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput
                    placeholder="Jump to page or recent incident…"
                    data-testid="command-palette-input"
                />
                <CommandList data-testid="command-palette-list">
                    <CommandEmpty>No matches.</CommandEmpty>
                    <CommandGroup heading="Navigate">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            return (
                                <CommandItem
                                    key={item.to}
                                    value={`${item.label} ${item.keywords || ""}`}
                                    onSelect={() => go(item.to)}
                                    data-testid={`cmd-nav-${item.to.replace(/\//g, "") || "home"}`}
                                >
                                    <Icon size={16} className="mr-2 shrink-0 opacity-70"/>
                                    {item.label}
                                </CommandItem>
                            );
                        })}
                    </CommandGroup>
                    {recents.length > 0 && (
                        <>
                            <CommandSeparator/>
                            <CommandGroup heading="Recent incidents">
                                {recents.map((r) => (
                                    <CommandItem
                                        key={r.id}
                                        value={`incident ${r.title} ${r.id} ${r.severity}`}
                                        onSelect={() => go(`/incidents/${r.id}`)}
                                        data-testid={`cmd-recent-${r.id}`}
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
                        </>
                    )}
                </CommandList>
            </CommandDialog>
        </>
    );
}
