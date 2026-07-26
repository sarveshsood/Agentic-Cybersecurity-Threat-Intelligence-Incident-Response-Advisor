/**
 * ACTIRA Enterprise Design System — JS tokens
 * Use for charts, canvas, and any non-CSS context.
 * Keep in sync with index.css CSS variables.
 */

export const colors = {
    // Brand
    primary: "#2563EB",
    primaryHover: "#1D4ED8",
    primaryMuted: "#3B82F6",

    // Neutrals
    navy: "#0F172A",
    slate: "#334155",
    background: "#F8FAFC",
    surface: "#FFFFFF",
    border: "#E2E8F0",
    textPrimary: "#0F172A",
    textSecondary: "#64748B",
    muted: "#94A3B8",

    // Semantic
    success: "#16A34A",
    warning: "#D97706",
    error: "#DC2626",
    critical: "#991B1B",
    info: "#2563EB",

    // Severity (consistent across tables, badges, charts)
    severity: {
        critical: "#991B1B",
        high: "#EA580C",
        medium: "#D97706",
        low: "#2563EB",
        informational: "#64748B",
    },

    // Status lifecycle
    status: {
        new: "#64748B",
        in_progress: "#2563EB",
        pending_review: "#D97706",
        approved: "#16A34A",
        rejected: "#DC2626",
        closed: "#475569",
        running: "#2563EB",
        failed: "#DC2626",
        queued: "#64748B",
        success: "#16A34A",
        offline: "#94A3B8",
        healthy: "#16A34A",
    },

    // Charts — professional, limited palette (no rainbow)
    chart: {
        blue: "#2563EB",
        green: "#16A34A",
        amber: "#D97706",
        red: "#DC2626",
        gray: "#64748B",
        slate: "#475569",
    },
};

/** Dark-theme hex overrides for Recharts / canvas */
export const colorsDark = {
    ...colors,
    background: "#0F172A",
    surface: "#1E293B",
    border: "#334155",
    textPrimary: "#F8FAFC",
    textSecondary: "#94A3B8",
    muted: "#64748B",
    primary: "#3B82F6",
    primaryHover: "#2563EB",
    severity: {
        critical: "#F87171",
        high: "#FB923C",
        medium: "#FBBF24",
        low: "#60A5FA",
        informational: "#94A3B8",
    },
    status: {
        new: "#94A3B8",
        in_progress: "#60A5FA",
        pending_review: "#FBBF24",
        approved: "#4ADE80",
        rejected: "#F87171",
        closed: "#64748B",
        running: "#60A5FA",
        failed: "#F87171",
        queued: "#94A3B8",
        success: "#4ADE80",
        offline: "#64748B",
        healthy: "#4ADE80",
    },
    chart: {
        blue: "#3B82F6",
        green: "#22C55E",
        amber: "#F59E0B",
        red: "#EF4444",
        gray: "#94A3B8",
        slate: "#64748B",
    },
};

export const spacing = {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 24,
    6: 32,
    7: 40,
    8: 48,
    9: 64,
};

export const radius = {
    sm: 6,
    md: 8,
    lg: 12,
    xl: 12,
    full: 9999,
};

export const typography = {
    fontFamily: {
        sans: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        mono: "'IBM Plex Mono', 'Cascadia Code', ui-monospace, monospace",
    },
    size: {
        display: 36,
        heading: 30,
        h1: 24,
        h2: 20,
        h3: 18,
        body: 16,
        small: 14,
        caption: 12,
    },
    weight: {
        medium: 500,
        semibold: 600,
        bold: 700,
    },
};

export const elevation = {
    none: "none",
    sm: "0 1px 2px 0 rgb(15 23 42 / 0.05)",
    md: "0 1px 3px 0 rgb(15 23 42 / 0.08), 0 1px 2px -1px rgb(15 23 42 / 0.06)",
    lg: "0 4px 6px -1px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)",
};

export const iconSize = {
    sm: 16,
    md: 20,
    lg: 24,
};

/** Severity → chart/badge hex (light) */
export const SEVERITY_HEX = colors.severity;

/** Status → chart hex (light) */
export const STATUS_HEX = colors.status;

export default {
    colors,
    colorsDark,
    spacing,
    radius,
    typography,
    elevation,
    iconSize,
    SEVERITY_HEX,
    STATUS_HEX,
};
