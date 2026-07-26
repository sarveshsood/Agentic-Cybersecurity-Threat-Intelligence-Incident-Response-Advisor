import {useState} from "react";
import {useLocation, useNavigate} from "react-router-dom";
import {useAuth} from "../../lib/auth";
import {apiErrorMessage} from "../../lib/api";
import {toast} from "sonner";
import {Circle, ShieldCheck} from "@phosphor-icons/react";
import {BRAND} from "../../constants/branding";

const DEMO_ACCOUNTS = [
    {label: "Analyst", email: "analyst@soc.example.com", password: "Analyst123!"},
    {label: "Senior Reviewer", email: "reviewer@soc.example.com", password: "Reviewer123!"},
    {label: "Admin", email: "admin@soc.example.com", password: "Admin123!"},
];

/** Demo cards only when explicitly enabled (dev / local). Never show passwords in production. */
function showDemoOperators() {
    const flag = (process.env.REACT_APP_SHOW_DEMO_LOGINS || "").toLowerCase();
    if (flag === "true" || flag === "1") return true;
    if (flag === "false" || flag === "0") return false;
    return process.env.NODE_ENV !== "production";
}

export default function Login() {
    const {login, register} = useAuth();
    const nav = useNavigate();
    const location = useLocation();
    const [mode, setMode] = useState("login");
    const [form, setForm] = useState({email: "", password: "", name: ""});
    const [loading, setLoading] = useState(false);
    const demos = showDemoOperators();

    const redirectTo = (() => {
        const from = location.state?.from;
        if (from?.pathname && from.pathname !== "/login") {
            return `${from.pathname}${from.search || ""}${from.hash || ""}`;
        }
        return "/";
    })();

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === "login") {
                await login(form.email, form.password);
                toast.success("Signed in");
            } else {
                await register({email: form.email, password: form.password, name: form.name});
                toast.success("Account created");
            }
            nav(redirectTo, {replace: true});
        } catch (err) {
            toast.error(err?.userMessage || apiErrorMessage(err, "Sign-in failed"));
        } finally {
            setLoading(false);
        }
    };

    const setDemo = (email) => {
        const acc = DEMO_ACCOUNTS.find((a) => a.email === email);
        if (acc) setForm({...form, email: acc.email, password: acc.password});
        setMode("login");
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 theme-shell">
            <div
                className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden bg-[var(--shell-sidebar)] text-[var(--shell-sidebar-text)]">
                {/* Subtle enterprise wash — no neon AI glow */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-30 bg-[radial-gradient(ellipse_at_top_left,_rgba(37,99,235,0.12),_transparent_50%)]"/>
                <div className="relative">
                    <div className="flex items-center gap-2.5 mb-16">
                        <div
                            className="w-10 h-10 rounded-lg bg-primary/15 border border-primary/40 grid place-items-center">
                            <Circle weight="fill" size={14} className="text-primary" aria-hidden/>
                        </div>
                        <div>
                            <div className="font-bold text-lg tracking-tight"
                                 title={BRAND.fullName}>{BRAND.shortName}</div>
                            <div
                                className="text-[10px] uppercase tracking-[0.12em] text-[var(--shell-sidebar-muted)]">{BRAND.tagline}</div>
                        </div>
                    </div>
                    <h1 className="text-4xl xl:text-5xl font-semibold tracking-tight leading-[1.1] mb-6 text-[var(--shell-sidebar-text)]">
                        Turn noisy logs into<br/>
                        <span className="text-primary">grounded playbooks.</span>
                    </h1>
                    <p className="text-[var(--shell-sidebar-muted)] text-sm mb-4 max-w-md leading-snug"
                       title={BRAND.fullName}>
                        {BRAND.fullName}
                    </p>
                    <p className="text-[var(--shell-sidebar-muted)] leading-relaxed max-w-md text-sm">
                        Multi-agent pipeline that extracts IoCs, enriches them against threat intel,
                        maps to MITRE ATT&CK, and generates citation-grounded IR playbooks —
                        with a mandatory human-in-the-loop gate for critical incidents.
                    </p>
                </div>
                <div className="relative grid grid-cols-3 gap-3 text-[11px]">
                    {[
                        ["Ingested", "24.1k events"],
                        ["IoCs enriched", "3,442"],
                        ["Grounding avg.", "0.87"],
                    ].map(([k, v]) => (
                        <div key={k} className="rounded-xl border border-white/10 bg-white/5 p-3">
                            <div
                                className="text-[10px] uppercase tracking-wider text-[var(--shell-sidebar-muted)] font-semibold">{k}</div>
                            <div className="font-mono text-primary text-lg mt-1 font-semibold tabular-nums">{v}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center justify-center p-6 lg:p-12 bg-[var(--shell-bg)]">
                <form
                    onSubmit={submit}
                    className="w-full max-w-md soc-card p-8 relative"
                    data-testid="auth-form"
                >
                    <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck size={20} className="text-primary" aria-hidden/>
                        <div className="soc-label">Secure sign-in</div>
                    </div>
                    <h2 className="text-2xl font-semibold mb-6 tracking-tight">
                        {mode === "login" ? "Welcome back, analyst." : "Create your operator account."}
                    </h2>

                    {mode === "signup" && (
                        <>
                            <label className="soc-label" htmlFor="auth-name">Name</label>
                            <input
                                id="auth-name"
                                data-testid="auth-name"
                                required
                                autoComplete="name"
                                className="soc-input w-full mt-1 mb-4"
                                value={form.name}
                                onChange={(e) => setForm({...form, name: e.target.value})}
                            />
                            <p className="text-[11px] text-muted-foreground mb-4" data-testid="auth-role-hint">
                                New accounts are created as <span className="text-primary/90">analyst</span>.
                                Elevated roles are assigned by an admin.
                            </p>
                        </>
                    )}

                    <label className="soc-label" htmlFor="auth-email">Email</label>
                    <input
                        id="auth-email"
                        data-testid="auth-email"
                        required
                        type="email"
                        autoComplete="username"
                        className="soc-input w-full mt-1 mb-4 font-mono"
                        value={form.email}
                        onChange={(e) => setForm({...form, email: e.target.value})}
                    />

                    <label className="soc-label" htmlFor="auth-password">Password</label>
                    <input
                        id="auth-password"
                        data-testid="auth-password"
                        required
                        type="password"
                        autoComplete={mode === "login" ? "current-password" : "new-password"}
                        minLength={mode === "signup" ? 8 : undefined}
                        className="soc-input w-full mt-1 mb-5 font-mono"
                        value={form.password}
                        onChange={(e) => setForm({...form, password: e.target.value})}
                    />

                    <button
                        data-testid="auth-submit"
                        disabled={loading}
                        className="soc-btn-primary w-full py-2.5 disabled:opacity-50"
                    >
                        {loading ? "Authenticating…" : mode === "login" ? "Sign in" : "Create account"}
                    </button>

                    <button
                        type="button"
                        data-testid="auth-toggle"
                        className="w-full mt-3 text-xs text-muted-foreground hover:text-primary transition-colors"
                        onClick={() => setMode(mode === "login" ? "signup" : "login")}
                    >
                        {mode === "login" ? "Need an account? Register" : "Already have one? Sign in"}
                    </button>

                    {demos && (
                        <div className="mt-6 pt-6 border-t border-border" data-testid="demo-operators">
                            <div className="soc-label mb-2">Demo operators</div>
                            <p className="text-[10px] text-muted-foreground mb-2">
                                Dev only — disabled in production builds unless REACT_APP_SHOW_DEMO_LOGINS=true.
                            </p>
                            <div className="grid gap-2">
                                {DEMO_ACCOUNTS.map(({label, email}) => (
                                    <button
                                        key={email}
                                        type="button"
                                        data-testid={`demo-${label.toLowerCase().replace(/\s/g, "-")}`}
                                        onClick={() => setDemo(email)}
                                        className="text-left flex items-center justify-between px-3 py-2 rounded-lg bg-background border border-border hover:border-primary/40 transition-colors"
                                    >
                                        <span className="text-[12px]">{label}</span>
                                        <span className="soc-mono text-primary">{email}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
}
