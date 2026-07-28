import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {useAuth} from "../lib/auth";
import {useTheme} from "../lib/theme";
import {api, apiErrorMessage} from "../lib/api";
import {toast} from "sonner";
import {
    ArrowRight,
    CheckCircle,
    Circle,
    Clock,
    Cpu,
    Database,
    Desktop,
    Eye,
    EyeSlash,
    FileText,
    Fingerprint,
    Globe,
    Key,
    MagnifyingGlass,
    Moon,
    Pulse,
    Robot,
    ShieldCheck,
    Sun,
    Target,
    User,
    Users,
} from "@phosphor-icons/react";
import {BRAND} from "../constants/branding";

const DEMO_ACCOUNTS = [
    {label: "Analyst", email: "analyst@soc.example.com", password: "Analyst123!", icon: MagnifyingGlass},
    {label: "Senior Reviewer", email: "reviewer@soc.example.com", password: "Reviewer123!", icon: ShieldCheck},
    {label: "Admin", email: "admin@soc.example.com", password: "Admin123!", icon: Key},
];

const FEATURES = [
    {icon: Robot, title: "AI Threat Detection", desc: "Continuous, model-driven triage of raw security events."},
    {icon: Globe, title: "Threat Intelligence", desc: "Automated enrichment against live threat intel sources."},
    {icon: Target, title: "MITRE ATT&CK Mapping", desc: "Findings mapped to tactics and techniques automatically."},
    {icon: Cpu, title: "Multi-Agent Reasoning", desc: "Specialized agents collaborate on complex investigations."},
    {icon: FileText, title: "IR Playbook Generation", desc: "Citation-grounded response playbooks, ready to execute."},
    {icon: Database, title: "RAG Grounding", desc: "Every recommendation traced back to source evidence."},
    {
        icon: MagnifyingGlass,
        title: "Evidence Collection",
        desc: "IoCs and artifacts gathered and organized for review."
    },
    {icon: Users, title: "Human Approval Workflow", desc: "Critical actions always pass through analyst sign-off."},
];

/** Default status tiles — live values filled from public /health (no fake "Connected"). */
const DEFAULT_STATUS_ROWS = [
    {key: "api", label: "Backend API", value: "Checking…", ok: null},
    {key: "mongo", label: "MongoDB", value: "Checking…", ok: null},
    {key: "llm", label: "LLM", value: "After sign-in", ok: null},
    {key: "ti", label: "Threat Intel", value: "After sign-in", ok: null},
];

/** Capability highlights — not live tenant metrics (dashboard is source of truth after login). */
const CAPABILITY_TILES = [
    {icon: Pulse, label: "Pipeline", value: "Parse → IoC → TI"},
    {icon: ShieldCheck, label: "HiTL", value: "Critical gated"},
    {icon: Target, label: "ATT&CK", value: "Heuristic map"},
    {icon: Database, label: "RAG", value: "Hybrid BM25+vec"},
    {icon: CheckCircle, label: "Eval", value: "Golden IR CI"},
];

const TEAM_MEMBERS = [
    "Abhishek Patre",
    "Aditya Sharma",
    "Barshan Mukhar Das",
    "Gaurav Eary",
    "Nishant Rameshrao Patil",
    "Prajwal B R",
    "Praveen S N",
    "Sarvesh Sood",
    "Sindhu Subramanya",
    "Vesalapu Satya Venkata Rupa",
];

const AVATAR_COLORS = [
    "bg-blue-100 text-blue-600 border-blue-200",
    "bg-emerald-100 text-emerald-600 border-emerald-200",
    "bg-amber-100 text-amber-600 border-amber-200",
    "bg-indigo-100 text-indigo-600 border-indigo-200",
    "bg-orange-100 text-orange-600 border-orange-200",
    "bg-sky-100 text-sky-600 border-sky-200",
    "bg-red-100 text-red-600 border-red-200",
    "bg-slate-100 text-slate-600 border-slate-200",
    "bg-green-100 text-green-600 border-green-200",
    "bg-zinc-100 text-zinc-600 border-zinc-200",
];

function showDemoOperators() {
    const flag = (process.env.REACT_APP_SHOW_DEMO_LOGINS || "").toLowerCase();
    if (flag === "true" || flag === "1") return true;
    if (flag === "false" || flag === "0") return false;
    return process.env.NODE_ENV !== "production";
}

function statusIconClass(ok) {
    if (ok === true) return "text-green-500";
    if (ok === false) return "text-red-500";
    return "text-slate-400";
}

const CAPABILITY_TIPS = {
    Pipeline: "Ingest path: parse → IoC extract → threat intel enrich → ATT&CK → playbook.",
    HiTL: "Human-in-the-loop: critical / low-grounding cases require senior review.",
    "ATT&CK": "Heuristic MITRE ATT&CK technique mapping from logs and keywords.",
    RAG: "Hybrid BM25 + vector retrieval grounds playbook citations in the KB.",
    Eval: "Offline golden IR suite (CI gates) for quality regression checks.",
};

function CapabilityTile({icon: Icon, label, value}) {
    return (
        <div
            className="sbp-status-tile"
            data-testid={`login-capability-${label.toLowerCase().replace(/\s+/g, "-")}`}
            title={CAPABILITY_TIPS[label] || label}
        >
            <div
                className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold mb-2">
                <Icon size={12} weight="bold" className="text-blue-600" aria-hidden/>
                {label}
            </div>
            <div className="font-mono text-slate-900 text-sm font-bold">{value}</div>
        </div>
    );
}

export default function Login() {
    const {login, register} = useAuth();
    const {theme, resolvedTheme, toggle: toggleTheme} = useTheme();
    const nav = useNavigate();
    const [mode, setMode] = useState("login");
    const [form, setForm] = useState({email: "", password: "", name: ""});
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [remember, setRemember] = useState(false);
    const [ssoEnabled, setSsoEnabled] = useState(false);
    const [publicRegister, setPublicRegister] = useState(true);
    const [statusRows, setStatusRows] = useState(DEFAULT_STATUS_ROWS);
    const demos = showDemoOperators();
    const ThemeIcon = theme === "light" ? Sun : theme === "system" ? Desktop : Moon;

    useEffect(() => {
        try {
            const rememberedEmail = window.localStorage.getItem("soc_remember_email");
            if (rememberedEmail) {
                setForm((f) => ({...f, email: rememberedEmail}));
                setRemember(true);
            }
        } catch {
            // Storage unavailable — ignore
        }
        api
            .get("/auth/oidc/config")
            .then((r) => {
                setSsoEnabled(Boolean(r.data?.enabled));
                // Default allow when field missing (older APIs / offline)
                setPublicRegister(r.data?.public_register !== false);
            })
            .catch(() => {
                setSsoEnabled(false);
                setPublicRegister(true);
            });

        // Live platform probe — only claim API/Mongo when /health responds.
        // LLM / TI require signed-in Settings; never hard-code "Connected".
        let cancelled = false;
        api
            .get("/health", {timeout: 8000})
            .then((r) => {
                if (cancelled) return;
                const body = r.data || {};
                const apiOk = body.status === "ok" || body.mongo === "up" || r.status === 200;
                const mongoUp = body.mongo === "up";
                const mongoDown = body.mongo === "down";
                setStatusRows([
                    {
                        key: "api",
                        label: "Backend API",
                        value: apiOk ? "Reachable" : "Degraded",
                        ok: apiOk,
                    },
                    {
                        key: "mongo",
                        label: "MongoDB",
                        value: mongoUp ? "Up" : mongoDown ? "Down" : "Unknown",
                        ok: mongoUp ? true : mongoDown ? false : null,
                    },
                    {
                        key: "llm",
                        label: "LLM",
                        value: "After sign-in",
                        ok: null,
                    },
                    {
                        key: "ti",
                        label: "Threat Intel",
                        value: "Keys optional",
                        ok: null,
                    },
                ]);
            })
            .catch(() => {
                if (cancelled) return;
                setStatusRows([
                    {key: "api", label: "Backend API", value: "Unreachable", ok: false},
                    {key: "mongo", label: "MongoDB", value: "Unknown", ok: null},
                    {key: "llm", label: "LLM", value: "After sign-in", ok: null},
                    {key: "ti", label: "Threat Intel", value: "Keys optional", ok: null},
                ]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!publicRegister && mode === "signup") {
            setMode("login");
        }
    }, [publicRegister, mode]);

    // Always land on main dashboard after auth (ignore deep-link return paths).
    const redirectTo = "/";

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (mode === "login") {
                await login(form.email, form.password);
                try {
                    if (remember) window.localStorage.setItem("soc_remember_email", form.email);
                    else window.localStorage.removeItem("soc_remember_email");
                } catch {
                    // ignore storage failures
                }
                toast.success("Signed in successfully");
            } else {
                await register({email: form.email, password: form.password, name: form.name});
                toast.success("Account created successfully");
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

    const forgotPassword = () => {
        toast("Password reset is managed by your SOC administrator. Contact them to regain access.");
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-5 theme-shell text-[var(--shell-text)]" data-testid="login-page">
            <style>{`
        @keyframes sbp-drift {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(18px, -14px); }
        }
        @keyframes sbp-fade-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sbp-fade-up { animation: sbp-fade-up 0.5s ease-out both; }
        .sbp-orb { animation: sbp-drift 12s ease-in-out infinite; }
        
        .sbp-status-tile {
          background: var(--shell-card);
          border: 1px solid var(--shell-border);
          border-radius: 0.75rem;
          padding: 1rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          color: var(--shell-text);
        }
        .sbp-status-tile:hover {
          border-color: hsl(var(--primary) / 0.45);
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.08);
        }
        
        .sbp-feature-card {
          background: var(--shell-card);
          border: 1px solid var(--shell-border);
          box-shadow: 0 1px 3px rgba(0,0,0,0.04);
          transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
          color: var(--shell-text);
        }
        .sbp-feature-card:hover {
          transform: translateY(-2px);
          border-color: hsl(var(--primary) / 0.45);
          box-shadow: 0 10px 15px -3px rgba(0,0,0,0.08);
        }
        
        .sbp-glass-card {
          background: var(--shell-card);
          border: 1px solid var(--shell-border);
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.12);
          color: var(--shell-text);
        }
        
        .sbp-input {
          background: var(--shell-bg);
          border: 1px solid var(--shell-border);
          color: var(--shell-text);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .sbp-input::placeholder { color: hsl(var(--muted-foreground)); }
        .sbp-input:focus {
          outline: none;
          border-color: hsl(var(--primary));
          box-shadow: 0 0 0 3px hsl(var(--primary) / 0.2);
        }
        
        .sbp-btn-primary {
          background: linear-gradient(135deg, hsl(var(--primary)), var(--primary-hover));
          color: hsl(var(--primary-foreground));
          transition: filter 0.15s ease, transform 0.1s ease;
        }
        .sbp-btn-primary:hover:not(:disabled) { filter: brightness(1.1); }
        .sbp-btn-primary:active:not(:disabled) { transform: scale(0.99); }
        
        @media (prefers-reduced-motion: reduce) {
          .sbp-orb, .sbp-fade-up, .sbp-feature-card, .sbp-btn-primary { 
            animation: none !important; 
            transition: none !important; 
          }
        }
      `}</style>

            {/* LEFT HERO SECTION */}
            <div
                className="hidden lg:flex lg:col-span-3 flex-col justify-between p-10 xl:p-16 relative overflow-y-auto max-h-screen scrollbar-thin border-r theme-border"
                style={{
                    // Light enterprise: soft slate canvas (avoid dark navy "blue skin").
                    // Dark theme still tints via CSS variables on .theme-shell.
                    background: "var(--shell-bg)",
                }}
            >
                <div
                    className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(37,99,235,0.08),_transparent_55%)] -z-10"/>
                <div
                    className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(56,189,248,0.06),_transparent_50%)] -z-10"/>
                <div
                    className="absolute inset-0 opacity-[0.03] -z-10 pointer-events-none"
                    style={{
                        backgroundImage:
                            "linear-gradient(rgba(15,23,42,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(15,23,42,0.8) 1px, transparent 1px)",
                        backgroundSize: "42px 42px",
                    }}
                    aria-hidden
                />
                <div
                    className="sbp-orb absolute w-72 h-72 rounded-full bg-blue-400/10 blur-3xl top-24 left-16 pointer-events-none"
                    aria-hidden/>
                <div
                    className="sbp-orb absolute w-96 h-96 rounded-full bg-sky-400/10 blur-3xl bottom-10 right-10 pointer-events-none"
                    style={{animationDelay: "3s"}}
                    aria-hidden
                />

                <div className="relative sbp-fade-up mb-10">
                    <div className="flex items-center gap-3 mb-8">
                        <div
                            className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 grid place-items-center shadow-sm">
                            <Circle weight="fill" size={16} className="text-blue-600" aria-hidden/>
                        </div>
                        <div>
                            <div className="font-bold text-lg tracking-tight text-slate-900" title={BRAND.fullName}>
                                {BRAND.shortName}
                            </div>
                            <div
                                className="text-[11px] uppercase tracking-[0.1em] text-slate-500 font-semibold">{BRAND.tagline}</div>
                        </div>
                    </div>

                    <h1 className="text-4xl xl:text-5xl font-bold tracking-tight leading-tight text-slate-900 mb-4">
                        Enterprise AI Security Operations Platform
                    </h1>
                    <p className="text-blue-600 text-sm font-semibold mb-4 max-w-lg">
                        Transform security events into actionable intelligence.
                    </p>
                    <p className="text-slate-600 leading-relaxed max-w-2xl text-sm mb-8">
                        {BRAND.fullName} is an enterprise-grade platform leveraging agentic AI to automate
                        threat detection, threat intelligence enrichment, MITRE ATT&amp;CK mapping, and incident
                        response playbook generation — backed by human analyst approval gates.
                    </p>

                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
                        {FEATURES.map(({icon: Icon, title, desc}, i) => (
                            <div
                                key={title}
                                className="sbp-feature-card sbp-fade-up rounded-xl p-4"
                                style={{animationDelay: `${0.04 * i}s`}}
                            >
                                <Icon size={20} weight="duotone" className="text-blue-600 mb-2.5" aria-hidden/>
                                <div className="text-[13px] font-bold text-slate-900 mb-1">{title}</div>
                                <div className="text-[11px] text-slate-600 leading-snug">{desc}</div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="relative sbp-fade-up mb-10" style={{animationDelay: "0.2s"}}>
                    <div className="flex items-center gap-2 mb-4">
                        <div
                            className="w-1.5 h-1.5 rounded-full bg-slate-400"
                            aria-hidden/>
                        <span className="text-[11px] uppercase tracking-[0.1em] text-slate-500 font-bold">
              Platform status (probed)
            </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mb-3 max-w-2xl" data-testid="login-status-honesty">
                        API/Mongo reflect a live <span className="font-mono">/health</span> check.
                        LLM and TI are configured after sign-in — not shown as connected until verified.
                        Live tenant KPIs appear on the Dashboard after login (demo fill is opt-in only).
                    </p>

                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-3" data-testid="login-status-rows">
                        {statusRows.map(({key, label, value, ok}) => (
                            <div key={key} className="sbp-status-tile" data-testid={`login-status-${key}`}>
                                <div
                                    className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-semibold mb-2">
                                    {label}
                                </div>
                                <div className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800">
                                    {ok === true ? (
                                        <CheckCircle size={14} weight="fill" className={statusIconClass(ok)} aria-hidden/>
                                    ) : ok === false ? (
                                        <Circle size={14} weight="fill" className={statusIconClass(ok)} aria-hidden/>
                                    ) : (
                                        <Clock size={14} weight="bold" className={statusIconClass(ok)} aria-hidden/>
                                    )}
                                    {value}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3" data-testid="login-capability-tiles">
                        {CAPABILITY_TILES.map((m) => (
                            <CapabilityTile key={m.label} {...m} />
                        ))}
                    </div>
                </div>

                <div
                    className="relative sbp-fade-up pt-6 border-t border-slate-200"
                    style={{animationDelay: "0.3s"}}
                    data-testid="login-project-team"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Users size={16} className="text-blue-600" aria-hidden/>
                            <span className="text-[11px] uppercase tracking-[0.12em] text-slate-500 font-bold">
                Project Team • Group 1
              </span>
                        </div>
                        <span
                            className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-[10px] text-blue-700 font-bold">
              Final Capstone Project
            </span>
                    </div>

                    <p className="text-[11px] text-slate-500 mb-4">
                        Advanced Certification Programme in Agentic &amp; Generative AI
                    </p>

                    <div className="grid grid-cols-2 xl:grid-cols-5 gap-2.5">
                        {TEAM_MEMBERS.map((member, index) => {
                            const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];
                            return (
                                <div
                                    key={member}
                                    className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 hover:border-blue-300 hover:shadow-sm transition-all duration-200"
                                >
                                    <div
                                        className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${colorClass}`}>
                                        <User size={12} weight="bold"/>
                                    </div>
                                    <span className="text-[11px] font-medium text-slate-700 truncate" title={member}>
                    {member}
                  </span>
                                </div>
                            );
                        })}
                    </div>

                    <footer
                        className="mt-8 text-[11px] text-slate-400 font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span>&copy; {new Date().getFullYear()} {BRAND.shortName}</span>
                        <span aria-hidden>·</span>
                        <span>Advanced Certification Programme</span>
                        <span aria-hidden>·</span>
                        <span>Agentic &amp; Generative AI</span>
                    </footer>
                </div>
            </div>

            {/* RIGHT AUTH CARD SECTION */}
            <div
                className="lg:col-span-2 flex items-center justify-center p-6 py-12 lg:p-12 relative"
                style={{background: "var(--shell-bg)"}}
            >
                <div
                    className="absolute inset-0 lg:hidden bg-[radial-gradient(ellipse_at_top,_hsl(var(--primary)_/_0.08),_transparent_60%)] pointer-events-none"
                    aria-hidden/>

                <form
                    onSubmit={submit}
                    className="sbp-glass-card sbp-fade-up w-full max-w-md rounded-2xl p-8 lg:p-10 relative"
                    data-testid="auth-form"
                    noValidate
                >
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-2">
                            <div
                                className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 grid place-items-center lg:hidden">
                                <Circle weight="fill" size={14} className="text-primary" aria-hidden/>
                            </div>
                            <span className="font-bold tracking-tight text-[var(--shell-text)] lg:hidden">{BRAND.shortName}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                data-testid="login-theme-toggle"
                                onClick={() => toggleTheme()}
                                className="p-1.5 rounded-md border theme-border theme-chip text-muted-foreground hover:text-primary transition-colors"
                                title={`Theme: ${theme} (${resolvedTheme}) — click to cycle`}
                                aria-label={`Theme ${theme}. Click to change`}
                            >
                                <ThemeIcon size={16} weight="bold"/>
                            </button>
                            <span
                                className="text-[10px] font-mono uppercase tracking-[0.08em] text-muted-foreground theme-chip border theme-border rounded-full px-3 py-1 font-semibold">
              v2 Enterprise Demo
            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mb-1.5">
                        <ShieldCheck size={18} className="text-blue-600" aria-hidden/>
                        <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-bold">
                            Secure Sign-In
                        </div>
                    </div>

                    <h2 className="text-2xl font-bold mb-4 tracking-tight text-slate-900">
                        {mode === "login" ? "Welcome back, analyst." : "Create your operator account."}
                    </h2>

                    <div className="flex flex-wrap gap-2 mb-8">
                        {[
                            {icon: ShieldCheck, label: "Role-Based Access"},
                            {icon: Fingerprint, label: "JWT Authentication"},
                            {icon: Users, label: "Human-in-the-Loop"},
                        ].map(({icon: Icon, label}) => (
                            <span
                                key={label}
                                className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1"
                            >
                <Icon size={12} className="text-blue-600" aria-hidden/>
                                {label}
              </span>
                        ))}
                    </div>

                    {mode === "signup" && (
                        <div className="mb-5">
                            <label
                                className="block text-[11px] uppercase tracking-[0.08em] text-slate-600 font-bold mb-2"
                                htmlFor="auth-name">
                                Name
                            </label>
                            <input
                                id="auth-name"
                                data-testid="auth-name"
                                required
                                autoComplete="name"
                                className="sbp-input w-full rounded-lg px-3.5 py-2.5 text-sm"
                                value={form.name}
                                onChange={(e) => setForm({...form, name: e.target.value})}
                            />
                            <p className="text-[11px] text-slate-500 mt-2 leading-relaxed" data-testid="auth-role-hint">
                                New accounts are created as <span className="text-blue-600 font-medium">analyst</span>.
                                Elevated roles are assigned by an admin.
                            </p>
                        </div>
                    )}

                    <div className="mb-5">
                        <label className="block text-[11px] uppercase tracking-[0.08em] text-slate-600 font-bold mb-2"
                               htmlFor="auth-email">
                            Email
                        </label>
                        <input
                            id="auth-email"
                            data-testid="auth-email"
                            required
                            type="email"
                            autoComplete="username"
                            placeholder="you@company.com"
                            className="sbp-input w-full rounded-lg px-3.5 py-2.5 text-sm font-mono"
                            value={form.email}
                            onChange={(e) => setForm({...form, email: e.target.value})}
                        />
                    </div>

                    <div className="mb-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="block text-[11px] uppercase tracking-[0.08em] text-slate-600 font-bold"
                                   htmlFor="auth-password">
                                Password
                            </label>
                            {mode === "login" && (
                                <button
                                    type="button"
                                    onClick={forgotPassword}
                                    className="text-[11px] font-medium text-blue-600 hover:text-blue-800 transition-colors focus:outline-none focus-visible:underline"
                                >
                                    Forgot password?
                                </button>
                            )}
                        </div>
                        <div className="relative">
                            <input
                                id="auth-password"
                                data-testid="auth-password"
                                required
                                type={showPassword ? "text" : "password"}
                                autoComplete={mode === "login" ? "current-password" : "new-password"}
                                minLength={mode === "signup" ? 8 : undefined}
                                placeholder="••••••••"
                                className="sbp-input w-full rounded-lg px-3.5 py-2.5 pr-11 text-sm font-mono"
                                value={form.password}
                                onChange={(e) => setForm({...form, password: e.target.value})}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((s) => !s)}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                aria-pressed={showPassword}
                                className="absolute inset-y-0 right-0 px-3 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors focus:outline-none"
                            >
                                {showPassword ? <EyeSlash size={18} aria-hidden/> : <Eye size={18} aria-hidden/>}
                            </button>
                        </div>
                    </div>

                    {mode === "login" && (
                        <label className="flex items-center gap-2 mb-6 mt-4 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-colors"
                            />
                            <span className="text-[12px] text-slate-600 font-medium">Remember me on this device</span>
                        </label>
                    )}

                    {mode === "signup" && <div className="mb-6"/>}

                    <button
                        data-testid="auth-submit"
                        type="submit"
                        disabled={loading}
                        className="sbp-btn-primary w-full py-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-blue-600/20 mt-2"
                    >
                        {loading ? (
                            <>
                                <span
                                    className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"
                                    aria-hidden/>
                                Authenticating…
                            </>
                        ) : (
                            <>
                                {mode === "login" ? "Sign in" : "Create account"}
                                <ArrowRight size={16} weight="bold" aria-hidden/>
                            </>
                        )}
                    </button>

                    {publicRegister ? (
                        <button
                            type="button"
                            data-testid="auth-toggle"
                            className="w-full mt-5 text-xs font-medium text-slate-500 hover:text-blue-600 transition-colors focus:outline-none focus-visible:underline"
                            onClick={() => setMode(mode === "login" ? "signup" : "login")}
                        >
                            {mode === "login" ? "Need an account? Register" : "Already have one? Sign in"}
                        </button>
                    ) : (
                        <p
                            className="w-full mt-5 text-xs text-center text-slate-500"
                            data-testid="auth-register-disabled"
                        >
                            {ssoEnabled
                                ? "Accounts are provisioned via SSO. Contact your administrator for access."
                                : "Public registration is disabled. Contact your SOC administrator."}
                        </p>
                    )}

                    {demos && (
                        <div className="mt-8 pt-6 border-t border-slate-200" data-testid="demo-operators">
                            <div className="text-[11px] uppercase tracking-[0.08em] text-slate-500 font-bold mb-2">
                                Demo Operators
                            </div>
                            <p className="text-[10px] text-slate-500 mb-4 font-medium leading-relaxed">
                                Dev environment only — autofills preset testing credentials.
                            </p>
                            <div className="grid gap-2.5">
                                {DEMO_ACCOUNTS.map(({label, email, icon: Icon}) => (
                                    <button
                                        key={email}
                                        type="button"
                                        data-testid={`demo-${label.toLowerCase().replace(/\s/g, "-")}`}
                                        onClick={() => setDemo(email)}
                                        className="text-left flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 hover:bg-blue-50 transition-colors shadow-sm"
                                    >
                    <span className="flex items-center gap-2.5 text-[12px] font-bold text-slate-700">
                      <Icon size={16} className="text-blue-600" aria-hidden/>
                        {label}
                    </span>
                                        <span className="text-[11px] font-mono text-slate-500">{email}</span>
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