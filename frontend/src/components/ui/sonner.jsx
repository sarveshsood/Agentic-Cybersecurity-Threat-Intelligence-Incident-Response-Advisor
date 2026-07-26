import {useTheme} from "../../lib/theme";
import {toast, Toaster as Sonner} from "sonner";

/**
 * Sonner toaster wired to ACTIRA ThemeProvider (light / dark / system → resolved).
 */
const Toaster = ({...props}) => {
    const {resolvedTheme} = useTheme();
    const theme = resolvedTheme === "light" ? "light" : "dark";

    return (
        <Sonner
            theme={theme}
            className="toaster group"
            position="top-right"
            toastOptions={{
                className: "soc-card border theme-border text-sm",
                style: {
                    background: "var(--shell-card)",
                    border: "1px solid var(--shell-border)",
                    color: "var(--shell-text)",
                },
                classNames: {
                    toast:
                        "group toast group-[.toaster]:bg-[var(--shell-card)] group-[.toaster]:text-[var(--shell-text)] group-[.toaster]:border-[var(--shell-border)] group-[.toaster]:shadow-md",
                    description: "group-[.toast]:text-muted-foreground",
                    actionButton:
                        "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
                    cancelButton:
                        "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
                    success: "group-[.toast]:border-[var(--success-border)]",
                    error: "group-[.toast]:border-[var(--error-border)]",
                },
            }}
            {...props}
        />
    );
};

export {Toaster, toast};
