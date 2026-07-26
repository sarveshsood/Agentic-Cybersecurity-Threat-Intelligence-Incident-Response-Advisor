/**
 * Theme-aware chart colors for Recharts (hex required by canvas/SVG libs).
 */
import {useMemo} from "react";
import {useTheme} from "../lib/theme";
import {colors, colorsDark, SEVERITY_HEX, STATUS_HEX} from "./tokens";

export function getChartPalette(resolvedTheme = "dark") {
    const isDark = resolvedTheme !== "light";
    const c = isDark ? colorsDark : colors;
    const sev = isDark ? colorsDark.severity : SEVERITY_HEX;
    const status = isDark ? colorsDark.status : STATUS_HEX;
    return {
        colors: c,
        severity: sev,
        status,
        chart: c.chart,
        series: [
            c.chart.blue,
            c.chart.amber,
            c.chart.gray,
            c.chart.slate,
            c.chart.green,
            c.chart.red,
            c.primaryMuted || c.primary,
        ],
        tooltip: {
            background: c.surface,
            border: `1px solid ${c.border}`,
            fontSize: 11,
            borderRadius: 8,
            color: c.textPrimary,
        },
        contentStyle: {
            background: c.surface,
            border: `1px solid ${c.border}`,
            fontSize: 11,
            borderRadius: 8,
            color: c.textPrimary,
        },
        grid: c.border,
        axis: c.muted,
        tick: {fill: c.muted, fontSize: 11},
        pieStroke: c.surface,
        areaCritical: sev.critical,
        areaHigh: sev.high,
        primary: c.primary,
        isDark,
    };
}

/** React hook — re-renders charts when theme preference resolves. */
export function useChartTheme() {
    const {resolvedTheme} = useTheme();
    return useMemo(() => getChartPalette(resolvedTheme), [resolvedTheme]);
}

export default getChartPalette;
