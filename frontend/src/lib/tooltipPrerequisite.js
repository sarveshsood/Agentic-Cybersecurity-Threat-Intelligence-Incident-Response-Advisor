/**
 * ACTIRA tooltip prerequisite policy.
 *
 * Tooltips / HelpTips are a **product prerequisite**, not an optional polish pass.
 * Design-system surfaces (PageHeader, Panel, KpiCard, PaneLabel, DsButton, …)
 * auto-wire tips when you pass structured props so new UI ships with help by default.
 *
 * Levels
 * -------
 * - **HelpTip / PaneLabel** — pane titles, KPIs, metrics (title + body + optional how)
 * - **Tip** — actions, chips, icon buttons, interactive controls (one short string)
 * - **Native title** — SVG nodes only (portals cannot wrap <g>); still required
 *
 * Settings → UI prefs → show_help_tips gates rich HoverCards only; Tip always works.
 *
 * @module tooltipPrerequisite
 */

/** @type {Set<string>} */
const _warned = new Set();

/**
 * True in Vite/React dev (and Node tests that set NODE_ENV=development).
 * Warnings never fire in production builds.
 */
export function isTooltipDevMode() {
    try {
        // Vite
        if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV) {
            return true;
        }
    } catch {
        /* ignore */
    }
    return typeof process !== "undefined" && process.env && process.env.NODE_ENV === "development";
}

/**
 * Dev-only once-per-key warning when a surface ships without tip content.
 * @param {string} surface — component name (e.g. "PageHeader")
 * @param {string} [label] — human label (page title, button text)
 * @param {string} [hint] — how to fix
 */
export function warnMissingTooltip(surface, label = "", hint = "") {
    if (!isTooltipDevMode()) return;
    const key = `${surface}::${label || "?"}`;
    if (_warned.has(key)) return;
    _warned.add(key);
    const where = label ? ` "${String(label).slice(0, 80)}"` : "";
    const fix =
        hint ||
        "Pass tip={<HelpTip …/>} or tipTitle + tipBody (HelpTip auto-built). " +
            "Actions/chips: wrap with <Tip content=\"…\">. See docs/dx/TOOLTIP_PREREQUISITE.md";
    // eslint-disable-next-line no-console
    console.warn(`[ACTIRA tooltip prerequisite] ${surface}${where} is missing help. ${fix}`);
}

/** Reset warning cache (unit tests). */
export function _resetTooltipWarnings() {
    _warned.clear();
}

/**
 * Whether tip props already provide something renderable.
 * @param {{ tip?: unknown, tipTitle?: string, tipBody?: string, tooltip?: string }} props
 */
export function hasTipContent({tip, tipTitle, tipBody, tooltip} = {}) {
    if (tip != null && tip !== false) return true;
    if (tooltip && String(tooltip).trim()) return true;
    if (tipTitle && String(tipTitle).trim()) return true;
    if (tipBody && String(tipBody).trim()) return true;
    return false;
}

/**
 * Build HelpTip props from structured fields (or return null).
 * Prefer this over hand-rolling HelpTip on every call site.
 *
 * @param {{ tipTitle?: string, tipBody?: string, how?: string, tipTestId?: string, title?: string, body?: string, testid?: string }} opts
 * @returns {{ title: string, body?: string, how?: string, testid?: string } | null}
 */
export function helpTipPropsFrom(opts = {}) {
    const title = (opts.tipTitle || opts.title || "").trim();
    const body = (opts.tipBody || opts.body || "").trim();
    const how = (opts.how || "").trim() || undefined;
    const testid = opts.tipTestId || opts.testid || undefined;
    if (!title && !body) return null;
    return {
        title: title || body.slice(0, 48),
        body: body || undefined,
        how,
        testid,
    };
}

/**
 * Default copy when only a short label is known (better than silence).
 * Callers should still pass real tipTitle/tipBody for product quality.
 */
export function defaultTipCopy(label, kind = "panel") {
    const name = (label && String(label).trim()) || "This control";
    if (kind === "page") {
        return {
            tipTitle: name,
            tipBody: `${name} page — hover the info icon for context. Add tipTitle/tipBody for a precise description.`,
        };
    }
    if (kind === "kpi") {
        return {
            tipTitle: name,
            tipBody: `${name} metric from live API or pipeline fields. Add tipBody/how for exact calculation.`,
        };
    }
    if (kind === "action") {
        return {tooltip: name};
    }
    return {
        tipTitle: name,
        tipBody: `${name} — describe purpose, data source, and what the analyst should do next.`,
    };
}
