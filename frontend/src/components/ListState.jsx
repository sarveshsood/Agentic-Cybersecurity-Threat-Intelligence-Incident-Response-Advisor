import {Link} from "react-router-dom";
import {Stack, WarningCircle} from "@phosphor-icons/react";

/**
 * Shared empty / error banner for list pages (A-F3).
 *
 * @param {"error"|"empty"|"loading"|null} variant
 * @param {string} [message]
 * @param {string} [testid] data-testid root
 * @param {{to: string, label: string}} [action] optional CTA link (empty state)
 */
export function ListState({
                              variant,
                              message,
                              testid = "list-state",
                              action = null,
                              className = "",
                          }) {
    if (!variant || variant === "ok") return null;

    if (variant === "loading") {
        return (
            <div
                className={`soc-card p-4 mb-4 ${className}`}
                data-testid={testid}
                role="status"
                aria-busy="true"
                aria-live="polite"
            >
                <div className="text-sm text-muted-foreground mb-3">{message || "Loading…"}</div>
                <div className="space-y-2" aria-hidden>
                    <div className="h-3 rounded bg-muted/60 animate-pulse w-full"/>
                    <div className="h-3 rounded bg-muted/60 animate-pulse w-5/6 max-w-md"/>
                    <div className="h-3 rounded bg-muted/60 animate-pulse w-2/3 max-w-sm"/>
                </div>
            </div>
        );
    }

    if (variant === "error") {
        return (
            <div
                className={`soc-card p-4 mb-4 text-sm text-error border-[var(--error-border)] flex items-start gap-2 ${className}`}
                data-testid={testid}
                role="alert"
            >
                <WarningCircle size={18} className="shrink-0 mt-0.5"/>
                <div>
                    <div className="font-medium text-error">Could not load data</div>
                    <p className="text-[12px] text-error mt-0.5">
                        {message || "Request failed — is the backend running?"}
                    </p>
                </div>
            </div>
        );
    }

    // empty
    return (
        <div
            className={`soc-card p-8 mb-4 text-center ${className}`}
            data-testid={testid}
        >
            <Stack size={28} className="text-muted-foreground mx-auto mb-2"/>
            <div className="text-sm text-muted-foreground">{message || "Nothing here yet."}</div>
            {action?.to && action?.label && (
                <Link
                    to={action.to}
                    className="inline-block mt-3 text-xs text-primary hover:underline"
                    data-testid={`${testid}-action`}
                >
                    {action.label}
                </Link>
            )}
        </div>
    );
}

export default ListState;
