import {createContext, useContext, useEffect, useMemo, useState} from "react";

const ThemeContext = createContext({
    theme: "light",
    resolvedTheme: "light",
    toggle: () => {
    },
    setTheme: () => {
    },
});

const STORAGE_KEY = "soc_theme";
// Light-first enterprise default (matches index.css / capstone submission pack).
const THEMES = ["light", "dark", "system"];

function getSystemTheme() {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
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
    return "light";
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

    // Capstone capture/record scripts can force light without fighting React state.
    // Playwright injects localStorage + CSS; without this hook ThemeProvider re-applies dark.
    useEffect(() => {
        const setFromCapture = (preference) => {
            if (THEMES.includes(preference)) {
                setThemeState(preference);
            }
        };
        const onForce = (event) => {
            const next = event?.detail?.theme || "light";
            setFromCapture(next);
        };
        window.addEventListener("actira-force-theme", onForce);
        window.__ACTIRA_SET_THEME__ = setFromCapture;
        return () => {
            window.removeEventListener("actira-force-theme", onForce);
            try {
                delete window.__ACTIRA_SET_THEME__;
            } catch {
                /* ignore */
            }
        };
    }, []);

    const value = useMemo(
        () => ({
            /** User preference: "light" | "dark" | "system" */
            theme,
            /** Effective palette applied to the DOM: "light" | "dark" */
            resolvedTheme,
            setTheme: setThemeState,
            /** Cycle light → dark → system → light */
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
