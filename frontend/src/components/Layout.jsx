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
} from "@phosphor-icons/react";
import {BRAND} from "../constants/branding";
import {countLiveIntel, liveIntelLabels, TI_HAS_FLAGS, TI_PROVIDERS,} from "../constants/threatIntel";
import {Tip} from "./HelpTip";
import CommandPalette from "./CommandPalette";
import {formatDateTime, loadUiPrefs, saveRoutePrefs} from "../lib/uiPrefs";
import {cn} from "../lib/utils";

const NAV = [
    {
        to: "/",
        label: "Dashboard",
        icon: Gauge,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "SOC KPIs, recent activity, ATT&CK heatmap",
        colorClass: "text-blue-600 bg-blue-50 dark:bg-blue-950/30"
    },
    {
        to: "/upload",
        label: "Ingest Logs",
        icon: UploadSimple,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Upload logs or multi-file incident packages",
        colorClass: "text-primary bg-primary/10"
    },
    {
        to: "/incidents",
        label: "Incidents",
        icon: ShieldWarning,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Browse and open IR cases",
        colorClass: "text-rose-600 bg-rose-50 dark:bg-rose-950/30"
    },
    {
        to: "/hunt",
        label: "Threat Hunt",
        icon: Crosshair,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Natural-language hunt across recent incidents",
        colorClass: "text-primary bg-primary/10"
    },
    {
        to: "/analytics",
        label: "Analytics",
        icon: ChartBar,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "EDA charts, IoC trends, BM25 vs LanceDB retrieval comparison",
        colorClass: "text-blue-500 bg-blue-50 dark:bg-blue-950/30"
    },
    {
        to: "/review",
        label: "Review Queue",
        icon: ListChecks,
        roles: ["senior_reviewer", "admin"],
        tip: "Human-in-the-loop playbook approval queue",
        colorClass: "text-amber-600 bg-amber-50 dark:bg-amber-950/30"
    },
    {
        to: "/audit",
        label: "Audit Trail",
        icon: FileText,
        roles: ["senior_reviewer", "admin"],
        tip: "Immutable compliance log of review decisions and justifications",
        colorClass: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30"
    },
    {
        to: "/compliance",
        label: "Compliance",
        icon: ShieldCheck,
        roles: ["senior_reviewer", "admin"],
        tip: "Automated framework mapping, control validation, and audit trail generation",
        colorClass: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30"
    },
    {
        to: "/knowledge",
        label: "Knowledge Base",
        icon: BookBookmark,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Search MITRE/NIST/CISA KB (BM25, dense, hybrid)",
        colorClass: "text-teal-600 bg-teal-50 dark:bg-teal-950/30"
    },
    {
        to: "/benchmark",
        label: "Golden Eval",
        icon: Flask,
        roles: ["admin"],
        tip: "Offline golden IR quality gates (admin)",
        colorClass: "text-slate-600 bg-slate-100 dark:bg-slate-800"
    },
    {
        to: "/ops",
        label: "Ops & Health",
        icon: Heartbeat,
        roles: ["admin"],
        tip: "Multi-replica flags, queue, pipeline timings, LLM budget",
        colorClass: "text-rose-600 bg-rose-50 dark:bg-rose-950/30"
    },
    {
        to: "/roadmap",
        label: "Roadmap",
        icon: MapTrifold,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Product roadmap and progress",
        colorClass: "text-sky-600 bg-sky-50 dark:bg-sky-950/30"
    },
    {
        to: "/settings",
        label: "Settings",
        icon: GearSix,
        roles: ["admin"],
        tip: "LLM, TI keys, pipeline, and retention",
        colorClass: "text-slate-500 bg-slate-100 dark:bg-slate-800"
    },
];

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

function readCollapsed(pathname) {
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
    const {theme, resolvedTheme, setTheme} = useTheme();
    const nav = useNavigate();
    const location = useLocation();
    const pathname = location.pathname || "/";
    const [collapsed, setCollapsed] = useState(() => readCollapsed(pathname));
    const [tiLive, setTiLive] = useState(0);
    const [tiNames, setTiNames] = useState([]);
    const tiTotal = TI_HAS_FLAGS.length;
    const [pipelineOk, setPipelineOk] = useState(true);
    const [llm, setLlm] = useState({provider: null, model: null, keyReady: false});
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    const setCollapsedPersist = (next) => {
        setCollapsed(next);
        try {
            saveRoutePrefs(pathname, {sidebar_collapsed: next});
        } catch {
            /* ignore */
        }
    };

    useEffect(() => {
        try {
            const prefs = loadUiPrefs();
            if (prefs.sidebar_collapsed != null) setCollapsed(Boolean(prefs.sidebar_collapsed));
            const routePrefs = (function () {
                try {
                    const raw = localStorage.getItem('actira_ui_prefs_v1');
                    if (!raw) return {};
                    const parsed = JSON.parse(raw);
                    return (parsed.route_prefs && parsed.route_prefs[pathname]) || {};
                } catch {
                    return {};
                }
            })();
            if (routePrefs && routePrefs.theme) {
                setTheme(routePrefs.theme);
            }
        } catch (e) {
            /* ignore */
        }
    }, [pathname, setTheme]);

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
                setLlm({
                    provider,
                    model,
                    keyReady: flag ? Boolean(data[flag]) : false,
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
    const intelLive = tiLive > 0;
    const intelLabel = intelLive
        ? `LIVE INTEL · ${tiLive}/${tiTotal}`
        : "MOCK INTEL";
    const configuredSet = new Set(tiNames);
    const notConfigured = TI_PROVIDERS.map(([label]) => label).filter((l) => !configuredSet.has(l));
    const intelTitle = intelLive
        ? `${tiLive} of ${tiTotal} keys configured (matches Settings → Threat intel). Live: ${tiNames.join(", ") || "—"}${notConfigured.length ? `. Missing: ${notConfigured.join(", ")}` : ""}.`
        : "No threat-intel API keys configured — enrichment uses mock scores";

    const llmLabel = llm.provider
        ? `${llm.provider.toUpperCase()} · ${shortModel(llm.model)}`
        : "LLM …";
    const llmTitle = llm.provider
        ? `Active LLM: ${llm.provider} / ${llm.model}${llm.keyReady ? " (API key configured)" : " (key missing — playbook may use template fallback)"}`
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
        <div className="min-h-screen flex theme-shell" data-sidebar={collapsed ? "collapsed" : "expanded"}>
            <a
                href="#main-content"
                className="absolute left-[-10000px] top-auto z-[100] focus:left-3 focus:top-3 focus:px-3 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
                data-testid="skip-to-main"
            >
                Skip to main content
            </a>
            <aside
                className={cn(
                    "shrink-0 border-r theme-border theme-sidebar flex flex-col transition-[width] duration-200 ease-out",
                    collapsed ? "w-[4.25rem]" : "w-60",
                )}
                data-testid="app-sidebar"
                aria-label="Application sidebar"
            >
                <div className={cn(
                    "border-b theme-border flex items-center gap-2.5",
                    collapsed ? "px-2 py-4 flex-col" : "px-4 py-5",
                )}>
                    <div
                        className="w-8 h-8 rounded-md bg-primary/15 border border-primary/40 grid place-items-center shrink-0">
                        <Circle weight="fill" size={12} className="text-primary" aria-hidden/>
                    </div>
                    {!collapsed && (
                        <div className="min-w-0 flex-1">
                            <div
                                className="font-bold tracking-tight text-[16px] text-[var(--shell-sidebar-text)] truncate"
                                title={BRAND.fullName}>
                                {BRAND.shortName}
                            </div>
                            <div
                                className="text-[10px] uppercase tracking-[0.14em] text-[var(--shell-sidebar-muted)] font-semibold">{BRAND.tagline}</div>
                        </div>
                    )}
                    <Tip content={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
                        <button
                            type="button"
                            data-testid="sidebar-toggle"
                            onClick={() => setCollapsedPersist(!collapsed)}
                            className="p-1.5 rounded-md text-[var(--shell-sidebar-muted)] hover:text-[var(--shell-sidebar-text)] hover:bg-[var(--shell-sidebar-hover)] transition-colors shrink-0"
                            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                            aria-expanded={!collapsed}
                        >
                            {collapsed ? <CaretRight size={14} weight="bold"/> : <CaretLeft size={14} weight="bold"/>}
                        </button>
                    </Tip>
                </div>

                <nav
                    className="flex-1 min-h-0 overflow-y-auto py-3 px-2 flex flex-col gap-1.5"
                    aria-label="Main"
                >
                    {items.map((n) => {
                        const Icon = n.icon;
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
                                        collapsed
                                            ? "justify-center px-2.5 py-2.5 gap-0"
                                            : "justify-start px-3 py-2.5 gap-3",
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
                                <div className={cn(
                                    "p-1.5 rounded-md transition-transform group-hover:scale-105 shrink-0 flex items-center justify-center",
                                    n.colorClass || "text-slate-500 bg-slate-100"
                                )}>
                                    <Icon
                                        size={16}
                                        weight="duotone"
                                        className="text-current"
                                        aria-hidden
                                    />
                                </div>
                                {!collapsed ? (
                                    <span className="min-w-0 flex-1 truncate text-left leading-none">
                    {n.label}
                  </span>
                                ) : (
                                    <span className="sr-only">{n.label}</span>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>
            </aside>

            <main id="main-content" className="flex-1 min-w-0 overflow-y-auto" tabIndex={-1}>
                <div
                    className="border-b theme-border px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-between backdrop-blur-md theme-topbar sticky top-0 z-30 min-h-[48px] gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            type="button"
                            className="md:hidden p-1.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
                            onClick={() => setCollapsedPersist(!collapsed)}
                            aria-label="Toggle sidebar"
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
              <Cpu size={14} weight="bold" className={llm.keyReady ? "text-primary" : "text-warning"}/>
              <span className={llm.keyReady ? "text-primary" : "text-warning"}>
                {llmLabel}
              </span>
                            {!llm.keyReady && llm.provider && (
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
                                onClick={() => {
                                    const THEMES = ["dark", "light", "system"];
                                    const i = THEMES.indexOf(theme);
                                    const next = THEMES[(i + 1) % THEMES.length];
                                    setTheme(next);
                                    try {
                                        saveRoutePrefs(pathname, {theme: next});
                                    } catch {
                                    }
                                    ;
                                }}
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