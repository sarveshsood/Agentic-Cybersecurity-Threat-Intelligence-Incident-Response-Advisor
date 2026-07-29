import {createContext, useCallback, useContext, useEffect, useMemo, useState} from "react";
import {api, purgeStoredTokens, USER_KEY} from "./api";

const AuthContext = createContext(null);

/**
 * A-F1 pure cookie-only SPA session:
 * - JWT lives only in httpOnly `actira_access_token` cookie (set by login/register)
 * - axios `withCredentials: true` sends the cookie on every API call
 * - sessionStorage holds a non-secret user snapshot for UI only (role, name, email)
 * - Never stores JWT in localStorage/sessionStorage (XSS cannot steal the token)
 * - Periodic /auth/me revalidate picks up role demotions (A-S6)
 */
function storageGetUser() {
    try {
        const s = sessionStorage.getItem(USER_KEY);
        if (s) return s;
    } catch { /* private mode */
    }
    try {
        const legacy = localStorage.getItem(USER_KEY);
        if (legacy) {
            try {
                sessionStorage.setItem(USER_KEY, legacy);
            } catch { /* ignore */
            }
            try {
                localStorage.removeItem(USER_KEY);
            } catch { /* ignore */
            }
            return legacy;
        }
    } catch { /* ignore */
    }
    return null;
}

function storageSetUser(value) {
    try {
        sessionStorage.setItem(USER_KEY, value);
    } catch { /* ignore */
    }
    try {
        localStorage.removeItem(USER_KEY);
    } catch { /* ignore */
    }
}

function storageRemoveUser() {
    try {
        sessionStorage.removeItem(USER_KEY);
    } catch { /* ignore */
    }
    try {
        localStorage.removeItem(USER_KEY);
    } catch { /* ignore */
    }
}

function persistUser(data) {
    // Prefer TokenResponse { user }; fall back to flat User. Ignore access_token body.
    const user = data?.user ?? data;
    if (user) {
        storageSetUser(JSON.stringify(user));
    }
    // A-F1: never persist JWT — httpOnly cookie is the session
    purgeStoredTokens();
    return user;
}

function clearSession() {
    storageRemoveUser();
    purgeStoredTokens();
}

const SESSION_REVALIDATE_MS = 5 * 60 * 1000; // A-F1 / A-S6: re-bind role periodically

export function AuthProvider({children}) {
    const [user, setUser] = useState(() => {
        const s = storageGetUser();
        try {
            return s ? JSON.parse(s) : null;
        } catch {
            return null;
        }
    });
    const [loading, setLoading] = useState(true);

    const revalidate = useCallback(() => {
        return api
            .get("/auth/me", {silentError: true})
            .then((r) => {
                setUser(r.data);
                storageSetUser(JSON.stringify(r.data));
                purgeStoredTokens();
                return r.data;
            })
            .catch(() => {
                clearSession();
                setUser(null);
                return null;
            });
    }, []);

    useEffect(() => {
        // Cookie session only (withCredentials); purge any legacy stored JWTs
        purgeStoredTokens();
        revalidate().finally(() => setLoading(false));
    }, [revalidate]);

    // A-F1: periodic session re-validate so role demotions apply without full reload
    useEffect(() => {
        if (!user) return undefined;
        const t = setInterval(() => {
            revalidate();
        }, SESSION_REVALIDATE_MS);
        return () => clearInterval(t);
    }, [user, revalidate]);

    const login = useCallback(async (email, password, mfaCode) => {
        const body = {email, password};
        if (mfaCode) body.mfa_code = mfaCode;
        const r = await api.post("/auth/login", body);
        // Step-up TOTP: password ok, MFA still required
        if (r.data?.mfa_required && r.data?.mfa_token) {
            return {mfaRequired: true, mfaToken: r.data.mfa_token};
        }
        const u = persistUser(r.data);
        setUser(u);
        return u;
    }, []);

    const verifyMfa = useCallback(async (mfaToken, code) => {
        const r = await api.post("/auth/mfa/verify", {mfa_token: mfaToken, code});
        const u = persistUser(r.data);
        setUser(u);
        return u;
    }, []);

    const register = useCallback(async (payload) => {
        const r = await api.post("/auth/register", payload);
        const u = persistUser(r.data);
        setUser(u);
        return u;
    }, []);

    const logout = useCallback(() => {
        // Server clears httpOnly cookie (A-S11); ignore network errors
        api.post("/auth/logout").catch(() => {
        });
        clearSession();
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({user, loading, login, register, logout, verifyMfa}),
        [user, loading, login, register, logout, verifyMfa],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
