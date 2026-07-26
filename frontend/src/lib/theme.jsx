import {createContext, useContext, useEffect, useMemo, useState} from "react";

const ThemeContext = createContext({
    theme: "dark",
    resolvedTheme: "dark",
    toggle: () => {
    },
    setTheme: () => {
    },
});

const STORAGE_KEY = "soc_theme";
const THEMES = ["dark", "light", "system"];

function getSystemTheme() {
    if (typeof window === "undefined" || !window.matchMedia) return "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference) {
    return preference === "system" ? getSystemTheme() : preference;
}

function readStoredTheme() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (THEMES.includes(stored)) return stored;
    } catch {
        /* ignore */
    }
    return "dark";
}

function applyDomTheme(resolved) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.setAttribute("data-theme", resolved);
    root.classList.toggle("dark", resolved === "dark");
    root.classList.toggle("light", resolved === "light");
    root.style.colorScheme = resolved;
}

// Apply before first React paint so capture scripts / hard reloads do not flash
// the CSS light defaults when the stored preference is dark.
if (typeof window !== "undefined") {
    try {
        applyDomTheme(resolveTheme(readStoredTheme()));
    } catch {
        /* ignore */
    }
}

export function ThemeProvider({children}) {
    const [theme, setThemeState] = useState(readStoredTheme);
    const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(readStoredTheme()));

    useEffect(() => {
        const apply = (preference) => {
            const resolved = resolveTheme(preference);
            applyDomTheme(resolved);
            setResolvedTheme(resolved);
        };

        apply(theme);

        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch {
            /* ignore */
        }

        if (theme !== "system") return undefined;

        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => apply("system");

        if (mq.addEventListener) {
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        }
        // Safari < 14
        mq.addListener(onChange);
        return () => mq.removeListener(onChange);
    }, [theme]);

    const value = useMemo(
        () => ({
            /** User preference: "light" | "dark" | "system" */
            theme,
            /** Effective palette applied to the DOM: "light" | "dark" */
            resolvedTheme,
            setTheme: setThemeState,
            /** Cycle dark → light → system → dark */
            toggle: () =>
                setThemeState((t) => {
                    const i = THEMES.indexOf(t);
                    return THEMES[(i + 1) % THEMES.length];
                }),
        }),
        [theme, resolvedTheme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    return useContext(ThemeContext);
}
