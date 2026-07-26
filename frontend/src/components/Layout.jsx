import {useEffect, useState} from "react";
import {NavLink, useLocation, useNavigate} from "react-router-dom";
import {useAuth} from "../lib/auth";
import {useTheme} from "../lib/theme";
import {api} from "../lib/api";
import {
    BookBookmark,
    CaretLeft,
    CaretRight,
    ChartBar,
    Circle,
    Crosshair,
    Cpu,
    Desktop,
    FileText,
    Flask,
    Gauge,
    GearSix,
    Heartbeat,
    ListChecks,
    MapTrifold,
    Moon,
    ShieldCheck,
    ShieldWarning,
    SidebarSimple,
    SignOut,
    Sun,
    UploadSimple,
    X,
} from "@phosphor-icons/react";
import {BRAND} from "../constants/branding";
import {countLiveIntel, liveIntelLabels, TI_HAS_FLAGS, TI_PROVIDERS,} from "../constants/threatIntel";
import {Tip} from "./HelpTip";
import CommandPalette from "./CommandPalette";
import {formatDateTime, loadUiPrefs, saveRoutePrefs} from "../lib/uiPrefs";
import {cn} from "../lib/utils";

/**
 * Left-rail order = IR workflow, then intel, then governance, then admin.
 * Keep CommandPalette NAV_COMMANDS in the same order.
 */
const NAV = [
    // —— Operate ——
    {
        to: "/",
        label: "Dashboard",
        icon: Gauge,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "SOC KPIs, recent activity, ATT&CK heatmap",
        section: "Operate",
        colorClass: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    },
    {
        to: "/upload",
        label: "Ingest Logs",
        icon: UploadSimple,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Upload logs or multi-file incident packages",
        section: "Operate",
        colorClass: "text-primary bg-primary/10",
    },
    {
        to: "/incidents",
        label: "Incidents",
        icon: ShieldWarning,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Browse and open IR cases",
        section: "Operate",
        colorClass: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
    },
    {
        to: "/review",
        label: "Review Queue",
        icon: ListChecks,
        roles: ["senior_reviewer", "admin"],
        tip: "Human-in-the-loop playbook approval queue",
        section: "Operate",
        colorClass: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    },
    {
        to: "/hunt",
        label: "Threat Hunt",
        icon: Crosshair,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Natural-language hunt across recent incidents",
        section: "Operate",
        colorClass: "text-primary bg-primary/10",
    },
    // —— Analyze ——
    {
        to: "/analytics",
        label: "Analytics",
        icon: ChartBar,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "EDA charts, IoC trends, BM25 vs LanceDB retrieval comparison",
        section: "Analyze",
        colorClass: "text-blue-500 bg-blue-50 dark:bg-blue-950/30",
    },
    {
        to: "/knowledge",
        label: "Knowledge Base",
        icon: BookBookmark,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Search MITRE/NIST/CISA KB (BM25, dense, hybrid)",
        section: "Analyze",
        colorClass: "text-teal-600 bg-teal-50 dark:bg-teal-950/30",
    },
    // —— Govern ——
    {
        to: "/audit",
        label: "Audit Trail",
        icon: FileText,
        roles: ["senior_reviewer", "admin"],
        tip: "Immutable compliance log of review decisions and justifications",
        section: "Govern",
        colorClass: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
    },
    {
        to: "/compliance",
        label: "Compliance",
        icon: ShieldCheck,
        roles: ["senior_reviewer", "admin"],
        tip: "Automated framework mapping, control validation, and evidence packs",
        section: "Govern",
        colorClass: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    },
    {
        to: "/roadmap",
        label: "Roadmap",
        icon: MapTrifold,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Product roadmap and progress",
        section: "Govern",
        colorClass: "text-sky-600 bg-sky-50 dark:bg-sky-950/30",
    },
    // —— Admin ——
    {
        to: "/benchmark",
        label: "Golden Eval",
        icon: Flask,
        roles: ["admin"],
        tip: "Offline golden IR quality gates (admin)",
        section: "Admin",
        colorClass: "text-slate-600 bg-slate-100 dark:bg-slate-800",
    },
    {
        to: "/ops",
        label: "Ops & Health",
        icon: Heartbeat,
        roles: ["admin"],
        tip: "Multi-replica flags, queue, pipeline timings, LLM budget",
        section: "Admin",
        colorClass: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
    },
    {
        to: "/settings",
        label: "Settings",
        icon: GearSix,
        roles: ["admin"],
        tip: "LLM, TI keys, pipeline, and retention",
        section: "Admin",
        colorClass: "text-slate-500 bg-slate-100 dark:bg-slate-800",
    },
];

/** Group visible nav items by section for left-rail labels. */
function groupNav(items) {
    const groups = [];
    let current = null;
    for (const item of items) {
        const sec = item.section || "App";
        if (!current || current.label !== sec) {
            current = {label: sec, items: []};
            groups.push(current);
        }
        current.items.push(item);
    }
    return groups;
}

const PROVIDER_KEY_FLAG = {
    anthropic: "has_anthropic",
    openai: "has_openai",
    gemini: "has_gemini",
    groq: "has_groq",
};

function shortModel(model) {
    if (!model) return "—";
    return model
        .replace(/^claude-/, "")
        .replace(/^gemini-/, "gem-")
        .replace(/^llama-/, "llama-");
}

function readCollapsed() {
    try {
        const prefs = loadUiPrefs();
        if (prefs.sidebar_collapsed != null) return Boolean(prefs.sidebar_collapsed);
        return false;
    } catch {
        return false;
    }
}

export default function Layout({children}) {
    const {user, logout} = useAuth();
    // Theme is global (soc_theme) — never scope it to route prefs; that made the
    // toggle appear broken when navigating between pages with different saved values.
    const {theme, resolvedTheme, toggle: toggleTheme} = useTheme();
    const nav = useNavigate();
    const location = useLocation();
    const pathname = location.pathname || "/";
    const [collapsed, setCollapsed] = useState(() => readCollapsed());
    /** Mobile off-canvas drawer (independent of desktop collapse). */
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [tiLive, setTiLive] = useState(0);
    const [tiNames, setTiNames] = useState([]);
    const tiTotal = TI_HAS_FLAGS.length;
    const [pipelineOk, setPipelineOk] = useState(true);
    const [llm, setLlm] = useState({provider: null, model: null, keyReady: false, effective: null});
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Close mobile drawer on route change
    useEffect(() => {
        setMobileNavOpen(false);
    }, [pathname]);

    // Escape closes mobile drawer
    useEffect(() => {
        if (!mobileNavOpen) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") setMobileNavOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [mobileNavOpen]);

    // Lock body scroll while mobile drawer is open
    useEffect(() => {
        if (!mobileNavOpen) return undefined;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [mobileNavOpen]);

    const setCollapsedPersist = (next) => {
        setCollapsed(next);
        try {
            saveRoutePrefs(pathname, {sidebar_collapsed: next});
        } catch {
            /* ignore */
        }
    };

    // Restore per-route layout prefs only (sidebar). Theme is intentionally global.
    useEffect(() => {
        try {
            const prefs = loadUiPrefs();
            if (prefs.sidebar_collapsed != null) setCollapsed(Boolean(prefs.sidebar_collapsed));
        } catch {
            /* ignore */
        }
    }, [pathname]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const r = await api.get("/settings");
                if (cancelled) return;
                const data = r.data || {};
                setTiLive(countLiveIntel(data));
                setTiNames(liveIntelLabels(data));
                setPipelineOk(true);
                const provider = data.llm_provider || "anthropic";
                const model = data.llm_model || "claude-sonnet-4-6";
                const flag = PROVIDER_KEY_FLAG[provider];
                const effectiveProvider = data.llm_effective_provider || null;
                const effectiveModel = data.llm_effective_model || null;
                setLlm({
                    provider,
                    model,
                    keyReady: flag ? Boolean(data[flag]) : false,
                    effective:
                        effectiveProvider && effectiveProvider !== provider
                            ? {provider: effectiveProvider, model: effectiveModel}
                            : null,
                });
            } catch {
                if (!cancelled) setPipelineOk(false);
            }
        };
        load();
        // Floor at 30s so ad-hoc prefs cannot hammer /settings
        const refreshMs = Number(loadUiPrefs().status_refresh_ms);
        let id = null;
        if (refreshMs > 0) {
            id = setInterval(load, Math.max(30_000, refreshMs));
        }
        return () => {
            cancelled = true;
            if (id) clearInterval(id);
        };
    }, []);

    const items = NAV.filter((n) => n.roles.includes(user?.role));
    const groups = groupNav(items);
    const intelLive = tiLive > 0;
    const intelLabel = intelLive
        ? `LIVE INTEL · ${tiLive}/${tiTotal}`
        : "MOCK INTEL";
    const configuredSet = new Set(tiNames);
    const notConfigured = TI_PROVIDERS.map(([label]) => label).filter((l) => !configuredSet.has(l));
    const intelTitle = intelLive
        ? `${tiLive} of ${tiTotal} keys configured (matches Settings → Threat intel). Live: ${tiNames.join(", ") || "—"}${notConfigured.length ? `. Missing: ${notConfigured.join(", ")}` : ""}.`
        : "No threat-intel API keys configured — enrichment uses mock scores";

    const displayProvider = llm.effective?.provider || llm.provider;
    const displayModel = llm.effective?.model || llm.model;
    const llmLabel = displayProvider
        ? `${displayProvider.toUpperCase()} · ${shortModel(displayModel)}`
        : "LLM …";
    const llmTitle = llm.provider
        ? llm.effective
            ? `Configured: ${llm.provider}/${llm.model} · Effective after fallback: ${llm.effective.provider}/${llm.effective.model || "—"}`
            : `Active LLM: ${llm.provider} / ${llm.model}${llm.keyReady ? " (API key configured)" : " (key missing — playbook may use template fallback)"}`
        : "Loading LLM settings…";

    const themeMeta = {
        dark: {
            Icon: Moon,
            label: "Dark",
            title: "Theme: Dark — click for Light",
            next: "light",
        },
        light: {
            Icon: Sun,
            label: "Light",
            title: "Theme: Light — click for System",
            next: "system",
        },
        system: {
            Icon: Desktop,
            label: "System",
            title: `Theme: System (${resolvedTheme}) — click for Dark`,
            next: "dark",
        },
    }[theme] || {
        Icon: Moon,
        label: "Dark",
        title: "Theme: Dark — click for Light",
        next: "light",
    };
    const ThemeIcon = themeMeta.Icon;

    return (
        <div
            className="min-h-screen flex theme-shell"
            data-sidebar={collapsed ? "collapsed" : "expanded"}
            data-mobile-nav={mobileNavOpen ? "open" : "closed"}
        >
            <a
                href="#main-content"
                className="absolute left-[-10000px] top-auto z-[100] focus:left-3 focus:top-3 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="skip-to-main"
            >
                Skip to main content
            </a>

            {/* Mobile off-canvas scrim */}
            {mobileNavOpen && (
                <button
                    type="button"
                    className="fixed inset-0 z-40 bg-black/50 md:hidden"
                    aria-label="Close navigation"
                    data-testid="mobile-nav-scrim"
                    onClick={() => setMobileNavOpen(false)}
                />
            )}

            <aside
                className={cn(
                    // Desktop: original in-flow rail (width transition, shrink-0)
                    "shrink-0 border-r theme-border theme-sidebar flex flex-col transition-[width] duration-200 ease-out",
                    collapsed ? "md:w-[4.25rem]" : "md:w-60",
                    // Mobile: fixed off-canvas drawer (full labels always)
                    "fixed inset-y-0 left-0 z-50 w-60 md:static md:z-auto",
                    "max-md:transition-transform max-md:duration-200 max-md:ease-out",
                    mobileNavOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
                )}
                data-testid="app-sidebar"
                aria-label="Application sidebar"
            >
                <div
                    className={cn(
                        "border-b theme-border flex items-center gap-2.5",
                        // Desktop collapse chrome; mobile drawer always expanded
                        collapsed ? "md:px-2 md:py-4 md:flex-col px-4 py-5" : "px-4 py-5",
                    )}
                >
                    <div
                        className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 grid place-items-center shrink-0"
                    >
                        <Circle weight="fill" size={12} className="text-primary" aria-hidden/>
                    </div>
                    {/* Labels always on mobile drawer; hide when desktop-collapsed */}
                    <div className={cn("min-w-0 flex-1", collapsed && "md:hidden")}>
                        <div
                            className="font-bold tracking-tight text-[16px] text-[var(--shell-sidebar-text)] truncate"
                            title={BRAND.fullName}
                        >
                            {BRAND.shortName}
                        </div>
                        <div
                            className="text-[10px] uppercase tracking-[0.14em] text-[var(--shell-sidebar-muted)] font-semibold"
                        >
                            {BRAND.tagline}
                        </div>
                    </div>
                    <Tip content={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
                        <button
                            type="button"
                            data-testid="sidebar-toggle"
                            onClick={() => setCollapsedPersist(!collapsed)}
                            className="hidden md:inline-flex p-1.5 rounded-md text-[var(--shell-sidebar-muted)] hover:text-[var(--shell-sidebar-text)] hover:bg-[var(--shell-sidebar-hover)] transition-colors shrink-0"
                            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                            aria-expanded={!collapsed}
                        >
                            {collapsed ? <CaretRight size={14} weight="bold"/> : <CaretLeft size={14} weight="bold"/>}
                        </button>
                    </Tip>
                    <button
                        type="button"
                        className="md:hidden p-1.5 rounded-md text-[var(--shell-sidebar-muted)] hover:text-[var(--shell-sidebar-text)] hover:bg-[var(--shell-sidebar-hover)] transition-colors shrink-0"
                        aria-label="Close navigation"
                        data-testid="mobile-nav-close"
                        onClick={() => setMobileNavOpen(false)}
                    >
                        <X size={16} weight="bold"/>
                    </button>
                </div>

                <nav
                    className="flex-1 min-h-0 overflow-y-auto py-3 px-2 flex flex-col gap-1.5"
                    aria-label="Main"
                >
                    {groups.map((group) => (
                        <div key={group.label} className="flex flex-col gap-1.5">
                            <div
                                className={cn(
                                    "px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--shell-sidebar-muted)] select-none",
                                    collapsed && "md:hidden",
                                )}
                            >
                                {group.label}
                            </div>
                            {group.items.map((n) => {
                                const Icon = n.icon;
                                // On desktop collapsed, use icon-only row; mobile drawer always expanded.
                                const iconOnly = collapsed;
                                return (
                                    <NavLink
                                        key={n.to}
                                        to={n.to}
                                        end={n.to === "/"}
                                        title={n.tip || n.label}
                                        data-testid={`nav-${n.label.toLowerCase().replace(/\s/g, "-")}`}
                                        className={({isActive}) =>
                                            cn(
                                                "group flex flex-row flex-nowrap items-center",
                                                // Mobile: always expanded row
                                                "justify-start px-3 py-2.5 gap-3",
                                                // Desktop collapsed: icon-only
                                                iconOnly && "md:justify-center md:px-2.5 md:py-2.5 md:gap-0",
                                                "w-full rounded-lg border-l-2 border-transparent",
                                                "text-[13.5px] font-semibold leading-none no-underline",
                                                "text-[var(--shell-sidebar-muted)]",
                                                "hover:bg-[var(--shell-sidebar-hover)] hover:text-[var(--shell-sidebar-text)]",
                                                "transition-colors",
                                                isActive &&
                                                "border-l-[var(--shell-sidebar-active)] bg-[color-mix(in_srgb,var(--shell-sidebar-active)_18%,transparent)] text-[var(--shell-sidebar-text)] font-bold",
                                            )
                                        }
                                    >
                                        <div
                                            className={cn(
                                                "p-1.5 rounded-md transition-transform group-hover:scale-105 shrink-0 flex items-center justify-center",
                                                n.colorClass || "text-slate-500 bg-slate-100",
                                            )}
                                        >
                                            <Icon
                                                size={16}
                                                weight="duotone"
                                                className="text-current"
                                                aria-hidden
                                            />
                                        </div>
                                        <span
                                            className={cn(
                                                "min-w-0 flex-1 truncate text-left leading-none",
                                                iconOnly && "md:hidden",
                                            )}
                                        >
                                            {n.label}
                                        </span>
                                        {/* Accessible name when desktop rail is icon-only */}
                                        {iconOnly ? <span className="hidden md:sr-only">{n.label}</span> : null}
                                    </NavLink>
                                );
                            })}
                        </div>
                    ))}
                </nav>
            </aside>

            <main id="main-content" className="flex-1 min-w-0 overflow-y-auto" tabIndex={-1}>
                <div
                    className="border-b theme-border px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between backdrop-blur-md theme-topbar sticky top-0 z-30 min-h-[48px] gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            type="button"
                            className="md:hidden p-1.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
                            onClick={() => setMobileNavOpen((v) => !v)}
                            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                            aria-expanded={mobileNavOpen}
                            data-testid="sidebar-toggle-mobile"
                        >
                            <SidebarSimple size={18} weight="bold"/>
                        </button>
                        <div className="soc-label truncate text-[12px]">Live Session
                            · {formatDateTime(now, {withSeconds: false})}</div>
                    </div>
                    <div
                        className="flex items-center justify-center gap-2 sm:gap-3 text-[12px] text-muted-foreground flex-wrap font-medium">
                        <CommandPalette/>
                        <span
                            className="hidden sm:flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border theme-border theme-chip font-mono text-[12px] font-medium"
                            data-testid="llm-active-badge"
                            title={llmTitle}
                        >
              <Cpu size={14} weight="bold" className={llm.keyReady || llm.effective ? "text-primary" : "text-warning"}/>
              <span className={llm.keyReady || llm.effective ? "text-primary" : "text-warning"}>
                {llmLabel}
              </span>
                            {llm.effective && (
                                <span
                                    className="text-[10px] uppercase tracking-wider text-primary font-semibold"
                                    data-testid="llm-effective-badge"
                                >
                                    via fallback
                                </span>
                            )}
                            {!llm.keyReady && llm.provider && !llm.effective && (
                                <span
                                    className="text-[10px] uppercase tracking-wider text-warning font-semibold">no key</span>
                            )}
            </span>

                        <span className="flex items-center gap-1.5"
                              title={pipelineOk ? "API reachable" : "API unreachable"}>
              <span className={`status-dot ${pipelineOk ? "bg-[var(--success)] status-dot-live" : "bg-[var(--error)]"}`}
                    aria-hidden/>
              <span className="hidden md:inline">{pipelineOk ? "PIPELINE ONLINE" : "PIPELINE DOWN"}</span>
            </span>
                        <span className="hidden lg:flex items-center gap-1.5"
                              title="In-memory BM25 local knowledge base (MITRE / NIST / CISA KEV / playbooks)">
              <span className="status-dot bg-primary" aria-hidden/>
              RAG · LOCAL KB
            </span>
                        <span
                            className="flex items-center gap-1.5"
                            data-testid="intel-mode-badge"
                            title={intelTitle}
                        >
              <span className={`status-dot ${intelLive ? "bg-[var(--success)]" : "bg-[var(--warning)]"}`} aria-hidden/>
              <span className="hidden sm:inline">{intelLabel}</span>
            </span>

                        <Tip content={themeMeta.title}>
                            <button
                                type="button"
                                data-testid="theme-toggle"
                                onClick={() => toggleTheme()}
                                title={themeMeta.title}
                                className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary hover:border-primary/40 transition-all font-medium"
                                aria-label={`Theme ${themeMeta.label}. Switch to ${themeMeta.next}`}
                            >
                                <ThemeIcon size={16} weight="bold"/>
                                <span
                                    className="uppercase tracking-[0.12em] text-[11px] hidden sm:inline font-semibold">
                  {themeMeta.label}
                </span>
                            </button>
                        </Tip>

                        <div className="border-l theme-border pl-2 ml-1 flex items-center justify-center gap-2">
                            <div className="hidden sm:flex flex-col items-center gap-0.5">
                                <div className="text-[12px] font-semibold text-[var(--shell-text)]">{user?.name}</div>
                                <div
                                    className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-medium">{user?.role}</div>
                            </div>
                            <Tip content="Sign out">
                                <button
                                    type="button"
                                    data-testid="logout-btn"
                                    onClick={() => {
                                        logout();
                                        nav("/login");
                                    }}
                                    className="flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-error hover:border-error/40 transition-all"
                                    aria-label="Sign out"
                                >
                                    <SignOut size={16} weight="bold"/>
                                    <span
                                        className="text-[11px] uppercase tracking-[0.1em] hidden md:inline font-semibold">Sign out</span>
                                </button>
                            </Tip>
                        </div>
                    </div>
                </div>
                <div className="p-4 sm:p-6 lg:p-8">{children}</div>
            </main>
        </div>
    );
}