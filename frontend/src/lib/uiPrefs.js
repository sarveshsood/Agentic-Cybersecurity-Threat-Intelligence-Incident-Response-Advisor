/**
 * Client-side UI preferences (dashboard defaults, refresh intervals, table prefs).
 * Survives reloads without requiring backend Settings for presentation knobs.
 * Admin Settings page can edit and persist these; non-admins still get local defaults.
 */

const KEY = "actira_ui_prefs_v1";

export const TIMEZONE_OPTIONS = [
    {value: "UTC", label: "UTC"},
    {value: "local", label: "Browser local time"},
    {value: "America/New_York", label: "America/New_York"},
    {value: "America/Los_Angeles", label: "America/Los_Angeles"},
    {value: "Europe/London", label: "Europe/London"},
    {value: "Europe/Berlin", label: "Europe/Berlin"},
    {value: "Asia/Kolkata", label: "Asia/Kolkata"},
    {value: "Asia/Singapore", label: "Asia/Singapore"},
    {value: "Asia/Tokyo", label: "Asia/Tokyo"},
    {value: "Australia/Sydney", label: "Australia/Sydney"},
];

export const UI_PREF_DEFAULTS = {
    /** Auto-refresh interval for dashboard/layout status chips (ms). 0 = off */
    status_refresh_ms: 60_000,
    /** Standard timezone used for all visible timestamps. Backend timestamps remain UTC. */
    time_display_timezone: "UTC",
    /** Default analytics window in days */
    analytics_default_days: 30,
    /** Recent incidents shown on dashboard */
    dashboard_recent_limit: 8,
    /** Default incident list sort: "created_at:desc" */
    incidents_default_sort: "created_at:desc",
    /** Review queue default sort */
    review_default_sort: "threat_score:desc",
    /** Show KPI help icons */
    show_help_tips: true,
    /** Compact table density */
    compact_tables: false,
    /** Sidebar collapsed (per-route overrides supported) */
    sidebar_collapsed: false,
    /** Dashboard: show extra widgets (trends, severity mix) */
    dashboard_extra_widgets: true,
    /** Knowledge default search mode */
    kb_default_mode: "hybrid",
    /** Review queue default view: cards | table */
    review_default_view: "cards",
    /** Default severity filter for incidents ("" = all) */
    incidents_default_severity: "",
    /** Default status filter for incidents */
    incidents_default_status: "",
    /** Min threat score filter default (0 = off) */
    incidents_min_threat: 0,
    /** Review min threat score default */
    review_min_threat: 0,
    /** Review max grounding filter (1 = off / show all; e.g. 0.7 shows only low-grounding) */
    review_max_grounding: 1,
    /** Show hover previews on incident links */
    show_incident_previews: true,
    /** Dashboard auto-refresh incidents (ms). 0 = off */
    dashboard_refresh_ms: 0,
    /** High threat IoC highlight threshold (display) */
    high_threat_score_threshold: 70,
    /** Analytics: show retrieval comparison panel by default */
    analytics_show_retrieval: true,
    /** Default incidents page page-size hint (client truncate) */
    incidents_page_size: 200,
};

/**
 * ACTIRA-recommended UI prefs (production-leaning presentation).
 * Slightly denser dashboard sample, mild auto-refresh, table review queue.
 * Used for “rec” badges + Apply recommended UI on Settings → UI prefs.
 */
export const UI_PREF_RECOMMENDED = {
    ...UI_PREF_DEFAULTS,
    time_display_timezone: "UTC",
    dashboard_recent_limit: 12,
    analytics_default_days: 30,
    // Layout chip poll — keep moderate; avoid sub-30s thrash
    status_refresh_ms: 90_000,
    // Dashboard auto-refresh off by default for consistency; enable explicitly if needed
    dashboard_refresh_ms: 0,
    review_default_view: "table",
    high_threat_score_threshold: 70,
    incidents_page_size: 200,
    show_help_tips: true,
    show_incident_previews: true,
    dashboard_extra_widgets: true,
    compact_tables: false,
    kb_default_mode: "hybrid",
    analytics_show_retrieval: true,
    incidents_default_sort: "created_at:desc",
    review_default_sort: "threat_score:desc",
    incidents_default_severity: "",
    incidents_default_status: "",
    incidents_min_threat: 0,
    review_min_threat: 0,
    review_max_grounding: 1,
};

function resolveTimeZone(timeZone) {
    const tz = timeZone || loadUiPrefs().time_display_timezone || "UTC";
    return tz === "local" ? undefined : tz;
}

function timeZoneSuffix(timeZone) {
    const tz = timeZone || loadUiPrefs().time_display_timezone || "UTC";
    return tz === "local" ? "Local" : tz;
}

export function formatDateTime(value, options = {}) {
    if (!value) return "—";

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";

    const prefs = loadUiPrefs();
    const configuredTimeZone = options.timeZone || prefs.time_display_timezone || "UTC";
    const resolvedTimeZone = resolveTimeZone(configuredTimeZone);

    try {
        const formatted = new Intl.DateTimeFormat(undefined, {
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: options.withSeconds === false ? undefined : "2-digit",
            hour12: false,
            timeZone: resolvedTimeZone,
            timeZoneName: options.timeZoneName === false ? undefined : "short",
        }).format(d);

        return options.showStandard === false
            ? formatted
            : `${formatted} · ${timeZoneSuffix(configuredTimeZone)}`;
    } catch {
        return d.toISOString();
    }
}

export function formatDateShort(value, options = {}) {
    if (!value) return "—";

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";

    const prefs = loadUiPrefs();
    const configuredTimeZone = options.timeZone || prefs.time_display_timezone || "UTC";
    const resolvedTimeZone = resolveTimeZone(configuredTimeZone);

    try {
        return new Intl.DateTimeFormat(undefined, {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: resolvedTimeZone,
            timeZoneName: "short",
        }).format(d);
    } catch {
        return d.toISOString();
    }
}

export function getTimeDisplayLabel() {
    const prefs = loadUiPrefs();
    const tz = prefs.time_display_timezone || "UTC";
    return tz === "local" ? "Browser local time" : tz;
}

/** Compare a uiPrefs value to recommended (type-aware). */
export function uiPrefMatchesRecommended(prefs, key) {
    if (!prefs || key == null) return false;
    const exp = UI_PREF_RECOMMENDED[key];
    if (exp === undefined) return false;
    const cur = prefs[key];
    if (typeof exp === "boolean") return Boolean(cur) === Boolean(exp);
    if (typeof exp === "number") return Number(cur) === Number(exp);
    return String(cur ?? "") === String(exp ?? "");
}

export function loadUiPrefs() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return {...UI_PREF_DEFAULTS};
        const parsed = JSON.parse(raw);
        // If there are per-route overrides, merge the current pathname prefs on top
        let routeOverrides = {};
        try {
            const path = typeof window !== 'undefined' && window.location ? window.location.pathname : null;
            if (path && parsed.route_prefs && parsed.route_prefs[path]) {
                routeOverrides = parsed.route_prefs[path];
            }
        } catch {
            routeOverrides = {};
        }
        return {...UI_PREF_DEFAULTS, ...parsed, ...routeOverrides};
    } catch {
        return {...UI_PREF_DEFAULTS};
    }
}

export function saveUiPrefs(partial) {
    const next = {...loadUiPrefs(), ...partial};
    try {
        // Preserve any route_prefs bucket when writing global prefs
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const merged = {...parsed, ...next};
        // Avoid embedding route_prefs twice
        if (parsed.route_prefs) merged.route_prefs = parsed.route_prefs;
        localStorage.setItem(KEY, JSON.stringify(merged));
    } catch {
        /* private mode */
    }
    // Notify same-tab listeners
    try {
        window.dispatchEvent(new CustomEvent("actira-ui-prefs", {detail: next}));
    } catch {
        /* ignore */
    }
    return next;
}

/** Save per-route preferences. Route should be a pathname like '/roadmap'. */
export function saveRoutePrefs(route, partial) {
    if (!route) return null;
    try {
        const raw = localStorage.getItem(KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const rp = parsed.route_prefs || {};
        rp[route] = {...(rp[route] || {}), ...partial};
        parsed.route_prefs = rp;
        // Keep top-level defaults separate — do not merge route_prefs into root
        localStorage.setItem(KEY, JSON.stringify(parsed));
        const next = {...UI_PREF_DEFAULTS, ...parsed, ...(parsed.route_prefs[route] || {})};
        try {
            window.dispatchEvent(new CustomEvent('actira-ui-prefs', {detail: next}));
        } catch {
        }
        ;
        return rp[route];
    } catch {
        return null;
    }
}

/** Load per-route prefs for a given pathname. */
export function loadRoutePrefs(route) {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return (parsed.route_prefs && parsed.route_prefs[route]) || {};
    } catch {
        return {};
    }
}

export function parseSortSpec(spec) {
    if (!spec || typeof spec !== "string") return null;
    const [key, dir] = spec.split(":");
    if (!key) return null;
    return {key, dir: dir === "asc" ? "asc" : "desc"};
}

/** Subscribe to UI pref changes (same tab + other tabs). */
export function subscribeUiPrefs(cb) {
    const onStorage = (e) => {
        if (e.key === KEY) cb(loadUiPrefs());
    };
    const onCustom = (e) => cb(e.detail || loadUiPrefs());
    window.addEventListener("storage", onStorage);
    window.addEventListener("actira-ui-prefs", onCustom);
    return () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("actira-ui-prefs", onCustom);
    };
}
