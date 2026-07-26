import axios from "axios";
import {toast} from "sonner";

// A-F2: fail loud when CRA env is missing (avoids requests to "undefined/api")
const BACKEND_URL = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
if (!BACKEND_URL) {
    // eslint-disable-next-line no-console
    console.error(
        "[ACTIRA] REACT_APP_BACKEND_URL is not set. Create frontend/.env with e.g.\n" +
        "  REACT_APP_BACKEND_URL=http://localhost:8001\n" +
        "then restart npm start.",
    );
}
export const API = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

export const TOKEN_KEY = "soc_token";
export const USER_KEY = "soc_user";

export const api = axios.create({
    baseURL: API,
    withCredentials: true,
    // Avoid hanging the UI forever when the backend is down
    timeout: 60000,
});

/**
 * A-F1 cookie-only SPA: never keep JWTs in web storage.
 * Purges legacy localStorage/sessionStorage tokens on first load.
 * Optional REACT_APP_ALLOW_BEARER_STORAGE=1 re-enables storage Bearer for odd
 * reverse-proxy setups that strip cookies (not recommended).
 */
export function purgeStoredTokens() {
    for (const store of [sessionStorage, localStorage]) {
        try {
            store.removeItem(TOKEN_KEY);
        } catch { /* private mode */
        }
    }
}

/** @deprecated Prefer httpOnly cookie. Returns null unless allow-bearer is on. */
export function getStoredToken() {
    const allow =
        String(process.env.REACT_APP_ALLOW_BEARER_STORAGE || "").toLowerCase() === "1" ||
        String(process.env.REACT_APP_ALLOW_BEARER_STORAGE || "").toLowerCase() === "true";
    if (!allow) {
        purgeStoredTokens();
        return null;
    }
    try {
        return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

// Cookie auth via withCredentials; Bearer only if explicitly re-enabled (legacy)
purgeStoredTokens();
api.interceptors.request.use((config) => {
    const token = getStoredToken();
    if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

/** Normalize FastAPI / axios errors into a short user-facing string. */
export function apiErrorMessage(err, fallback = "Request failed") {
    if (!err) return fallback;
    // Network / CORS / backend down (no HTTP response)
    if (!err.response) {
        if (err.code === "ECONNABORTED" || /timeout/i.test(err.message || "")) {
            return "Request timed out — is the backend still running?";
        }
        if (typeof err.message === "string" && /network error/i.test(err.message)) {
            return "Network error — cannot reach the API. Check backend URL and that the server is up.";
        }
        return err.message || "Network error — cannot reach the API.";
    }
    const detail = err.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
        return detail.map((d) => d?.msg || JSON.stringify(d)).join("; ") || fallback;
    }
    if (detail && typeof detail === "object") {
        return (
            detail.message ||
            detail.detail ||
            detail.error ||
            (typeof detail === "object" ? JSON.stringify(detail) : String(detail))
        );
    }
    if (err.response?.data?.error && typeof err.response.data.error === "string") {
        return err.response.data.error;
    }
    if (err.response?.status === 503) {
        return "Service unavailable (database or dependency down).";
    }
    if (err.response?.status >= 500) {
        return "Server error — try again or check backend logs.";
    }
    return err.message || fallback;
}

// Throttle global toasts so polling does not spam the UI
let _lastNetworkToastAt = 0;
let _lastServerToastAt = 0;
const TOAST_COOLDOWN_MS = 8000;

function maybeToast(kind, message) {
    const now = Date.now();
    if (kind === "network") {
        if (now - _lastNetworkToastAt < TOAST_COOLDOWN_MS) return;
        _lastNetworkToastAt = now;
        toast.error(message, {id: "api-network", duration: 6000});
        return;
    }
    if (kind === "server") {
        if (now - _lastServerToastAt < TOAST_COOLDOWN_MS) return;
        _lastServerToastAt = now;
        toast.error(message, {id: "api-server", duration: 5000});
    }
}

api.interceptors.response.use(
    (r) => r,
    (err) => {
        const status = err?.response?.status;
        const url = String(err?.config?.url || "");
        const silent =
            err?.config?.silentError === true ||
            err?.config?.headers?.["X-Silent-Error"] === "1" ||
            err?.config?.headers?.["x-silent-error"] === "1";

        // 401 → clear session snapshot + any legacy tokens; cookie cleared server-side on logout
        if (status === 401) {
            try {
                sessionStorage.removeItem(USER_KEY);
                localStorage.removeItem(USER_KEY);
            } catch { /* ignore */
            }
            purgeStoredTokens();
            if (!window.location.pathname.startsWith("/login")) {
                window.location.href = "/login";
            }
            return Promise.reject(err);
        }

        // Attach a stable message for callers
        const message = apiErrorMessage(err);
        if (err && typeof err === "object") {
            err.userMessage = message;
        }

        if (!silent) {
            // No response → backend down / network / CORS
            if (!err.response) {
                maybeToast("network", message);
            } else if (status === 503 || status >= 500) {
                // Avoid toasting every poll on optional endpoints
                const isPoll =
                    url.includes("/logs/jobs") ||
                    url.includes("/kpis") ||
                    url.includes("/auth/me");
                if (!isPoll) {
                    maybeToast("server", message);
                }
            }
        }

        return Promise.reject(err);
    },
);
