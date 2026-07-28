import {useEffect, useState} from "react";
import {NavLink, useLocation, useNavigate} from "react-router-dom";
import {useAuth} from "../lib/auth";
import {useTheme} from "../lib/theme";
import {api} from "../lib/api";
import {loadFeatures} from "../lib/features";
import {
    CaretLeft,
    CaretRight,
    Circle,
    Cpu,
    Desktop,
    Moon,
    SidebarSimple,
    SignOut,
    Sun,
    X,
} from "@phosphor-icons/react";
import {BRAND} from "../constants/branding";
import {groupNav, navForRole} from "../constants/nav";
import {countLiveIntel, liveIntelLabels, TI_HAS_FLAGS, TI_PROVIDERS,} from "../constants/threatIntel";
import {Tip} from "./HelpTip";
import CommandPalette from "./CommandPalette";
import {formatDateTime, loadUiPrefs, saveRoutePrefs} from "../lib/uiPrefs";
import {cn} from "../lib/utils";

const PROVIDER_KEY_FLAG = {
    anthropic: "has_anthropic",
    openai: "has_openai",
    gemini: "has_gemini",
    groq: "has_groq",
};

/** Compact model label for top-bar chip (handles provider/ prefixes like openai/gpt-oss-120b). */
function shortModel(model) {
    if (!model) return "—";
    let m = String(model).trim();
    // Strip org/provider path prefix (Groq free-tier ids often look like openai/gpt-oss-120b)
    if (m.includes("/")) m = m.split("/").pop() || m;
    m = m
        .replace(/^claude-/, "")
        .replace(/^gemini-/, "gem-")
        .replace(/^llama-/, "llama-")
        .replace(/^gpt-oss-/, "oss-");
    // Cap length so the status strip never wraps into a second "user" column
    if (m.length > 22) m = `${m.slice(0, 20)}…`;
    return m;
}

function formatRole(role) {
    if (!role) return "—";
    const map = {
        analyst: "Analyst",
        senior_reviewer: "Senior reviewer",
        admin: "Admin",
    };
    return map[role] || String(role).replace(/_/g, " ");
}

/** Status chip — fixed height, never wraps the top-bar into a messy stack. */
function StatusChip({
    testid,
    title,
    tip,
    children,
    tone = "default",
    className = "",
    onClick,
    as: As = "span",
}) {
    const toneCls =
        tone === "ok"
            ? "text-success border-[var(--success-border,var(--border))]"
            : tone === "warn"
              ? "text-warning border-[var(--warning-border,var(--border))]"
              : tone === "error"
                ? "text-error border-[var(--error-border,var(--border))]"
                : tone === "primary"
                  ? "text-primary border-primary/30"
                  : "text-muted-foreground theme-border";
    const el = (
        <As
            type={As === "button" ? "button" : undefined}
            data-testid={testid}
            title={title}
            onClick={onClick}
            className={cn(
                "inline-flex items-center gap-1.5 h-8 max-w-[min(100%,18rem)] shrink-0 px-2.5 rounded-md border theme-chip",
                "text-[11px] font-medium whitespace-nowrap overflow-hidden",
                As === "button" && "hover:border-primary/40 hover:text-primary transition-colors cursor-pointer",
                toneCls,
                className,
            )}
        >
            {children}
        </As>
    );
    if (tip) return <Tip content={tip}>{el}</Tip>;
    return el;
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
    /** API reachability from GET /health (not /settings — settings 403 for non-admin is fine). */
    const [apiOk, setApiOk] = useState(null);
    const [llm, setLlm] = useState({
        provider: null,
        model: null,
        keyReady: false,
        effective: null,
        hasGroq: false,
        fallbackEnabled: true,
        fallbackProvider: null,
    });
    const [now, setNow] = useState(() => new Date());
    const isMac =
        typeof navigator !== "undefined" &&
        /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    // H-07 PR-1: product feature flags (default all off). Load once for shell + later collab gates.
    useEffect(() => {
        loadFeatures().catch(() => {
            /* defaults stay off */
        });
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

    // Health + settings status strip (floor 30s when auto-refresh enabled)
    useEffect(() => {
        let cancelled = false;

        const loadHealth = async () => {
            try {
                await api.get("/health");
                if (!cancelled) setApiOk(true);
            } catch {
                if (!cancelled) setApiOk(false);
            }
        };

        const loadSettings = async () => {
            try {
                const r = await api.get("/settings");
                if (cancelled) return;
                const data = r.data || {};
                setTiLive(countLiveIntel(data));
                setTiNames(liveIntelLabels(data));
                const provider = data.llm_provider || "anthropic";
                const model = data.llm_model || "claude-sonnet-4-6";
                const flag = PROVIDER_KEY_FLAG[provider];
                const effectiveProvider = data.llm_effective_provider || null;
                const effectiveModel = data.llm_effective_model || null;
                setLlm({
                    provider,
                    model,
                    keyReady: flag ? Boolean(data[flag]) : false,
                    hasGroq: Boolean(data.has_groq),
                    fallbackEnabled: data.llm_fallback_enabled !== false,
                    fallbackProvider: data.llm_fallback_provider || null,
                    effective:
                        effectiveProvider && effectiveProvider !== provider
                            ? {provider: effectiveProvider, model: effectiveModel}
                            : null,
                });
            } catch {
                // Non-admin may not read full settings — keep last known TI/LLM; do not mark API down here
            }
        };

        const loadAll = () => {
            loadHealth();
            loadSettings();
        };
        loadAll();

        const refreshMs = Number(loadUiPrefs().status_refresh_ms);
        let id = null;
        if (refreshMs > 0) {
            id = setInterval(loadAll, Math.max(30_000, refreshMs));
        }
        return () => {
            cancelled = true;
            if (id) clearInterval(id);
        };
    }, []);

    const items = navForRole(user?.role);
    const groups = groupNav(items);
    const intelLive = tiLive > 0;
    const intelLabel = intelLive ? `INTEL ${tiLive}/${tiTotal}` : "MOCK INTEL";
    const configuredSet = new Set(tiNames);
    const notConfigured = TI_PROVIDERS.map(([label]) => label).filter((l) => !configuredSet.has(l));
    const intelTip = intelLive
        ? `${tiLive} of ${tiTotal} TI keys configured (Settings → Threat intel). Live: ${tiNames.join(", ") || "—"}${notConfigured.length ? `. Missing: ${notConfigured.join(", ")}` : ""}.`
        : "No threat-intel API keys — enrichment uses mock scores (lab/demo).";

    const displayProvider = llm.effective?.provider || llm.provider;
    const displayModel = llm.effective?.model || llm.model;
    const llmLabel = displayProvider
        ? `${String(displayProvider).toUpperCase()} · ${shortModel(displayModel)}`
        : "LLM …";
    const llmTip = llm.provider
        ? [
              llm.effective
                  ? `Configured ${llm.provider}/${llm.model}. Effective after fallback: ${llm.effective.provider}/${llm.effective.model || "—"}.`
                  : `Active LLM: ${llm.provider} / ${llm.model}${llm.keyReady ? " (key ready)" : " (key missing — playbooks may use template fallback)"}.`,
              llm.hasGroq
                  ? "Groq backup key is stored (last in auto fallback chain · default model openai/gpt-oss-120b)."
                  : "Groq backup: no key (optional low-latency fallback · openai/gpt-oss-120b).",
              llm.fallbackEnabled
                  ? `Cross-provider fallback: on${llm.fallbackProvider ? ` · preferred ${llm.fallbackProvider}` : ""}.`
                  : "Cross-provider fallback: off.",
          ].join(" ")
        : "Loading LLM settings…";

    const apiLabel =
        apiOk === null ? "API …" : apiOk ? "API ONLINE" : "API DOWN";
    const apiTip =
        apiOk === null
            ? "Checking API health…"
            : apiOk
              ? "GET /api/health succeeded — backend reachable (Mongo status may still be degraded; see Ops Health)."
              : "GET /api/health failed — backend unreachable. Start API or check REACT_APP_BACKEND_URL.";

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
    const roleLabel = formatRole(user?.role);

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
                {/* Top status strip — three zones: session | ops chips | user chrome */}
                <header
                    className="border-b theme-border px-3 sm:px-5 lg:px-6 py-2 flex items-center gap-2 sm:gap-3 backdrop-blur-md theme-topbar sticky top-0 z-30 h-14 min-h-14"
                    data-testid="app-topbar"
                    role="banner"
                >
                    {/* Zone 1 — mobile nav + session clock */}
                    <div className="flex items-center gap-2 shrink-0 min-w-0 max-w-[40%] sm:max-w-none">
                        <button
                            type="button"
                            className="md:hidden p-1.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary transition-colors flex items-center justify-center shrink-0"
                            onClick={() => setMobileNavOpen((v) => !v)}
                            aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"}
                            aria-expanded={mobileNavOpen}
                            data-testid="sidebar-toggle-mobile"
                        >
                            <SidebarSimple size={18} weight="bold"/>
                        </button>
                        <div
                            className="soc-label truncate text-[11px] sm:text-[12px] hidden sm:block"
                            title="Local session clock (UI prefs timezone)"
                            data-testid="session-clock"
                        >
                            <span className="hidden lg:inline">Session · </span>
                            {formatDateTime(now, {withSeconds: false})}
                        </div>
                    </div>

                    {/* Zone 2 — ops status chips (scroll horizontally if needed; never wrap under user block) */}
                    <div
                        className="flex-1 min-w-0 flex items-center gap-1.5 sm:gap-2 overflow-x-auto overflow-y-hidden py-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                        data-testid="topbar-status-chips"
                        aria-label="Platform status"
                    >
                        <CommandPalette shortcutLabel={isMac ? "⌘K" : "Ctrl+K"}/>

                        <StatusChip
                            testid="llm-active-badge"
                            tip={llmTip}
                            title={llmTip}
                            tone={llm.keyReady || llm.effective ? "primary" : llm.provider ? "warn" : "default"}
                        >
                            <Cpu size={13} weight="bold" className="shrink-0" aria-hidden/>
                            <span className="font-mono truncate max-w-[11rem] sm:max-w-[14rem]">{llmLabel}</span>
                            {llm.effective && (
                                <span
                                    className="text-[9px] uppercase tracking-wide font-bold text-primary shrink-0"
                                    data-testid="llm-effective-badge"
                                >
                                    fb
                                </span>
                            )}
                            {!llm.keyReady && llm.provider && !llm.effective && (
                                <span className="text-[9px] uppercase tracking-wide font-bold text-warning shrink-0">
                                    no key
                                </span>
                            )}
                        </StatusChip>

                        {llm.hasGroq && String(displayProvider || "").toLowerCase() !== "groq" && (
                            <StatusChip
                                testid="llm-groq-backup-chip"
                                tip={`Groq backup ready (last in auto fallback chain). Default free-tier model: openai/gpt-oss-120b. Preferred fallback: ${llm.fallbackProvider || "auto"}. See Settings → LLM → Active stack.`}
                                title="Groq backup · openai/gpt-oss-120b"
                                tone="ok"
                                className="hidden md:inline-flex"
                            >
                                <span className="font-mono text-[10px] truncate max-w-[11rem]">
                                    GROQ · {shortModel("openai/gpt-oss-120b")}
                                </span>
                            </StatusChip>
                        )}

                        <StatusChip
                            testid="api-health-badge"
                            tip={apiTip}
                            title={apiTip}
                            tone={apiOk === true ? "ok" : apiOk === false ? "error" : "default"}
                        >
                            <span
                                className={cn(
                                    "status-dot shrink-0",
                                    apiOk === true && "bg-[var(--success)] status-dot-live",
                                    apiOk === false && "bg-[var(--error)]",
                                    apiOk === null && "bg-muted-foreground",
                                )}
                                aria-hidden
                            />
                            <span className="hidden sm:inline">{apiLabel}</span>
                        </StatusChip>

                        <StatusChip
                            testid="rag-mode-badge"
                            tip="Hybrid RAG: BM25 + local LanceDB vectors (MITRE / NIST / CISA KEV / custom). Not a cloud SIEM lake."
                            title="Local knowledge base"
                            tone="primary"
                            className="hidden lg:inline-flex"
                        >
                            <span className="status-dot bg-primary shrink-0" aria-hidden/>
                            RAG · LOCAL
                        </StatusChip>

                        <StatusChip
                            testid="intel-mode-badge"
                            tip={intelTip}
                            title={intelTip}
                            tone={intelLive ? "ok" : "warn"}
                        >
                            <span
                                className={cn(
                                    "status-dot shrink-0",
                                    intelLive ? "bg-[var(--success)]" : "bg-[var(--warning)]",
                                )}
                                aria-hidden
                            />
                            <span className="hidden sm:inline">{intelLabel}</span>
                        </StatusChip>
                    </div>

                    {/* Zone 3 — theme + identity + sign out (always visible, never wraps into chips) */}
                    <div
                        className="flex items-center gap-1.5 sm:gap-2 shrink-0 pl-1 sm:pl-2 border-l theme-border"
                        data-testid="topbar-user-chrome"
                    >
                        <Tip content={themeMeta.title}>
                            <button
                                type="button"
                                data-testid="theme-toggle"
                                onClick={() => toggleTheme()}
                                title={themeMeta.title}
                                className="inline-flex items-center justify-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors font-medium"
                                aria-label={`Theme ${themeMeta.label}. Switch to ${themeMeta.next}`}
                            >
                                <ThemeIcon size={15} weight="bold"/>
                                <span className="uppercase tracking-[0.1em] text-[10px] hidden md:inline font-semibold">
                                    {themeMeta.label}
                                </span>
                            </button>
                        </Tip>

                        <div
                            className="hidden sm:flex flex-col items-end justify-center leading-tight min-w-0 max-w-[9rem]"
                            title={user?.email || user?.name || ""}
                            data-testid="topbar-user-identity"
                        >
                            <div className="text-[12px] font-semibold text-[var(--shell-text)] truncate max-w-full">
                                {user?.name || user?.email || "User"}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-medium truncate max-w-full">
                                {roleLabel}
                            </div>
                        </div>

                        <Tip content="Sign out of ACTIRA">
                            <button
                                type="button"
                                data-testid="logout-btn"
                                onClick={() => {
                                    logout();
                                    nav("/login");
                                }}
                                className="inline-flex items-center justify-center gap-1.5 h-8 px-2 sm:px-2.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-error hover:border-error/40 transition-colors"
                                aria-label="Sign out"
                            >
                                <SignOut size={15} weight="bold"/>
                                <span className="text-[10px] uppercase tracking-[0.08em] hidden lg:inline font-semibold">
                                    Sign out
                                </span>
                            </button>
                        </Tip>
                    </div>
                </header>
                <div className="p-4 sm:p-6 lg:p-8">{children}</div>
            </main>
        </div>
    );
}