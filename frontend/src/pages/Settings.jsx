import {useCallback, useEffect, useMemo, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {toast} from "sonner";
import {
    ArrowCounterClockwise,
    ArrowDown,
    ArrowUp,
    Bell,
    CaretDown,
    CheckCircle,
    Cpu,
    Desktop,
    HardDrives,
    Info,
    Key,
    PaperPlaneTilt,
    Shield,
    Sliders,
    Sparkle,
    Trash,
    Warning,
    WarningCircle,
} from "@phosphor-icons/react";
import {
    loadUiPrefs,
    saveUiPrefs,
    TIMEZONE_OPTIONS,
    UI_PREF_DEFAULTS,
    UI_PREF_RECOMMENDED,
    uiPrefMatchesRecommended,
} from "../lib/uiPrefs";
import {HoverCard, HoverCardContent, HoverCardTrigger,} from "../components/ui/hover-card";
import {
    defaultModelForProvider,
    FACTORY_OPS,
    FIELD_META,
    getModelMeta,
    PROVIDER_MODELS,
    RECOMMENDED_OPS,
    tipFromMeta,
    validateSettingsForm,
} from "../constants/settingsMeta";

import {TI_FIELD_NAMES, TI_PROVIDERS} from "../constants/threatIntel";
import {AlertBanner, LoadingState, PageHeader, Panel as DsPanel} from "../design-system";

const TI_KEYS = TI_PROVIDERS;

const OPS_KEYS = [
    "llm_provider",
    "llm_model",
    "llm_temperature",
    "llm_token_budget_monthly",
    "grounding_threshold",
    "hitl_severity_min",
    "auto_approve_grounding_min",
    "correlation_window_minutes",
    "session_timeout_hours",
    "failed_login_lockout",
    "incident_retention_days",
    "enrichment_cache_ttl_hours",
    "cohere_rerank_enabled",
    "email_alerts_to",
];

const SECRET_FORM_KEYS = [
    "anthropic_api_key",
    "openai_api_key",
    "gemini_api_key",
    "groq_api_key",
    ...TI_FIELD_NAMES,
    "slack_webhook_url",
];

const SETTINGS_TABS = [
    {id: "llm", label: "LLM", icon: Cpu, iconColor: "text-primary", sectionKey: "llm"},
    {id: "pipeline", label: "Detection", icon: Sliders, iconColor: "text-primary", sectionKey: "pipeline"},
    {id: "threat_intel", label: "Threat intel", icon: Key, iconColor: "text-warning", sectionKey: "threat_intel"},
    {id: "notifications", label: "Alerts", icon: Bell, iconColor: "text-primary", sectionKey: "notifications"},
    {id: "access", label: "Access & data", icon: Shield, iconColor: "text-success", sectionKey: "security"},
    {id: "ui", label: "UI prefs", icon: Desktop, iconColor: "text-primary", sectionKey: "ui"},
];

const VALID_TAB_IDS = new Set(SETTINGS_TABS.map((t) => t.id));
const DEFAULT_TAB = "llm";

const FIELD_TO_TAB = {
    llm_provider: "llm",
    llm_model: "llm",
    llm_temperature: "llm",
    llm_token_budget_monthly: "llm",
    anthropic_api_key: "llm",
    openai_api_key: "llm",
    gemini_api_key: "llm",
    groq_api_key: "llm",
    grounding_threshold: "pipeline",
    hitl_severity_min: "pipeline",
    auto_approve_grounding_min: "pipeline",
    correlation_window_minutes: "pipeline",
    cohere_rerank_enabled: "pipeline",
    abuseipdb_key: "threat_intel",
    virustotal_key: "threat_intel",
    greynoise_key: "threat_intel",
    threatfox_key: "threat_intel",
    otx_api_key: "threat_intel",
    shodan_api_key: "threat_intel",
    cohere_api_key: "threat_intel",
    threat_intel: "threat_intel",
    slack_webhook_url: "notifications",
    email_alerts_to: "notifications",
    session_timeout_hours: "access",
    failed_login_lockout: "access",
    incident_retention_days: "access",
    enrichment_cache_ttl_hours: "access",
};

const PROFILE_COMPARE_KEYS = Object.keys(RECOMMENDED_OPS).filter((k) => k !== "email_alerts_to");

function valuesMatchProfile(form, profile) {
    if (!form || !profile) return false;
    for (const key of PROFILE_COMPARE_KEYS) {
        if (profile[key] === undefined) continue;
        const cur = form[key];
        const exp = profile[key];
        if (typeof exp === "number" && typeof cur === "number") {
            if (Math.abs(cur - exp) > 1e-9) return false;
        } else if (typeof exp === "boolean") {
            if (Boolean(cur) !== Boolean(exp)) return false;
        } else if (String(cur ?? "") !== String(exp ?? "")) {
            return false;
        }
    }
    return true;
}

function detectProfile(form) {
    if (valuesMatchProfile(form, RECOMMENDED_OPS)) return "recommended";
    if (valuesMatchProfile(form, FACTORY_OPS)) return "factory";
    return "custom";
}

function normalizeTabId(raw) {
    const id = String(raw || "").trim().toLowerCase();
    if (id === "detection" || id === "hitl") return "pipeline";
    if (id === "ti" || id === "intel") return "threat_intel";
    if (id === "alerts" || id === "notify") return "notifications";
    if (id === "security" || id === "retention" || id === "data") return "access";
    if (id === "prefs" || id === "ui_prefs") return "ui";
    return VALID_TAB_IDS.has(id) ? id : DEFAULT_TAB;
}

function buildSettingsPayload(form) {
    const payload = {};
    for (const k of OPS_KEYS) {
        if (form[k] === undefined || form[k] === null) continue;
        if (k === "email_alerts_to") {
            payload[k] = String(form[k] || "").trim();
            continue;
        }
        payload[k] = form[k];
    }
    for (const k of SECRET_FORM_KEYS) {
        const v = String(form[k] || "").trim();
        if (v) payload[k] = v;
    }
    return payload;
}

function apiErrorDetail(e) {
    const d = e?.response?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
        return d.map((x) => x.msg || JSON.stringify(x)).join("; ");
    }
    if (d && typeof d === "object") return JSON.stringify(d);
    const status = e?.response?.status;
    if (status === 404) {
        return "API route not found (404). Is the backend running?";
    }
    if (status === 403) return "Forbidden — admin role required";
    if (!e?.response) return e?.message || "Network error — backend unreachable";
    return e?.message || "Request failed";
}

function HelpBody({tip, badge}) {
    if (!tip) return null;
    const isModel = Array.isArray(tip.models) && tip.models.length > 0;

    return (
        <div className="space-y-2.5 text-left max-h-[min(70vh,28rem)] overflow-y-auto pr-0.5">
            <div className="flex items-start justify-between gap-2">
                <div className="text-[12px] font-semibold text-primary tracking-wide leading-snug">
                    {tip.title}
                </div>
                {badge && (
                    <span
                        className="shrink-0 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
            {badge}
          </span>
                )}
            </div>

            {tip.purpose && (
                <p className="text-[11px] leading-relaxed text-foreground/90">{tip.purpose}</p>
            )}
            {tip.notes && (
                <p className="text-[11px] leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {tip.notes}
                </p>
            )}

            {isModel && (
                <div className="space-y-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Models</div>
                    {tip.models.map((m, idx) => (
                        <div
                            key={`${m.id}-${idx}`}
                            className="rounded border border-border bg-background/80 px-2 py-1.5"
                        >
                            <div className="font-mono text-[11px] text-primary">{m.id}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">{m.role}</div>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-1.5 pt-1.5 border-t border-border">
                <div className="rounded-md bg-muted/50 px-2 py-1.5 border border-[var(--warning-border)]">
                    <div className="text-[9px] uppercase tracking-wider text-warning/80 mb-0.5">Default</div>
                    <div className="text-[11px] font-mono text-warning/95 leading-snug break-words">
                        {tip.default}
                    </div>
                </div>
                <div className="rounded-md bg-muted/50 px-2 py-1.5 border border-[var(--success-border)]">
                    <div className="text-[9px] uppercase tracking-wider text-success mb-0.5">Recommended</div>
                    <div className="text-[11px] font-mono text-success/95 leading-snug break-words">
                        {tip.recommended}
                    </div>
                    {tip.whyRecommended && (
                        <p className="text-[10px] text-success/75 leading-relaxed mt-1.5 border-t border-[var(--success-border)] pt-1.5">
                            <span className="text-success font-medium">Why: </span>
                            {tip.whyRecommended}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function FieldTip({meta, fieldKey, tipKey, badge}) {
    const m = meta || (fieldKey ? FIELD_META[fieldKey] : null);
    if (!m) return null;
    const tip = tipFromMeta(m);
    const label = tip.title || fieldKey || "Help";

    return (
        <HoverCard openDelay={140} closeDelay={80}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-full w-[18px] h-[18px] text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
                    aria-label={`Help: ${label}`}
                    data-testid={fieldKey ? `tip-${fieldKey}` : tipKey ? `tip-${tipKey}` : undefined}
                >
                    <Info size={13} weight="bold"/>
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                side="top"
                align="start"
                collisionPadding={16}
                className="w-[22rem] max-w-[min(22rem,calc(100vw-1.5rem))] bg-card border border-primary/30 text-foreground px-3 py-2.5 shadow-xl z-[200] break-words"
            >
                <HelpBody tip={tip} badge={badge}/>
            </HoverCardContent>
        </HoverCard>
    );
}

function Field({
                   label,
                   fieldKey,
                   children,
                   hint,
                   meta,
                   tipKey,
                   matchesRecommended,
                   warning,
               }) {
    return (
        <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap min-h-[1.25rem]">
                <label className="soc-label" htmlFor={fieldKey || undefined}>
                    {label}
                </label>
                {(meta || fieldKey) && (
                    <FieldTip fieldKey={fieldKey} meta={meta} tipKey={tipKey}/>
                )}
                {matchesRecommended && (
                    <span
                        className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider text-success px-1.5 py-0.5 rounded-md bg-success-soft border border-[var(--success-border)]"
                        title="Matches ACTIRA recommended value"
                    >
            <CheckCircle size={10} weight="fill"/>
            rec
          </span>
                )}
            </div>
            <div>{children}</div>
            {hint && <div className="text-[11px] text-muted-foreground leading-relaxed">{hint}</div>}
            {warning && (
                <div
                    className={`text-[11px] mt-0.5 flex items-start gap-1.5 ${
                        warning.level === "error"
                            ? "text-error"
                            : warning.level === "warning"
                                ? "text-warning"
                                : "text-muted-foreground"
                    }`}
                    data-testid={fieldKey ? `warn-${fieldKey}` : undefined}
                >
                    {warning.level === "error" ? (
                        <WarningCircle size={12} className="shrink-0 mt-px" weight="fill"/>
                    ) : (
                        <Warning size={12} className="shrink-0 mt-px" weight="fill"/>
                    )}
                    <span>{warning.message}</span>
                </div>
            )}
        </div>
    );
}

function CollapsibleSection({title, subtitle, icon: Icon, defaultOpen = true, children}) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="rounded-card border border-border bg-card shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left bg-card hover:bg-muted/40 transition-colors"
            >
                <div className="flex items-center gap-3">
                    {Icon && <Icon size={18} weight="duotone" className="text-primary shrink-0"/>}
                    <div>
                        <div className="text-sm font-semibold text-foreground">{title}</div>
                        {subtitle && <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>}
                    </div>
                </div>
                <CaretDown
                    size={16}
                    className={`text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                />
            </button>
            {isOpen && <div className="px-5 pb-5 pt-2 border-t border-border space-y-4">{children}</div>}
        </div>
    );
}

function ConfigHealth({issues, onJumpToField}) {
    const [open, setOpen] = useState(false);
    const errors = issues?.filter((i) => i.level === "error") || [];
    const warnings = issues?.filter((i) => i.level === "warning") || [];
    const infos = issues?.filter((i) => i.level === "info") || [];

    if (!issues?.length) {
        return (
            <AlertBanner
                variant="success"
                icon={CheckCircle}
                title="Configuration healthy"
                testid="config-health-ok"
                className="mb-5"
            />
        );
    }

    const summary = [
        errors.length ? `${errors.length} error${errors.length !== 1 ? "s" : ""}` : null,
        warnings.length ? `${warnings.length} warning${warnings.length !== 1 ? "s" : ""}` : null,
        infos.length ? `${infos.length} tip${infos.length !== 1 ? "s" : ""}` : null,
    ]
        .filter(Boolean)
        .join(" · ");

    return (
        <div
            className={`mb-5 rounded-card border ${
                errors.length
                    ? "border-[var(--error-border)] bg-error-soft"
                    : "border-[var(--warning-border)] bg-warning-soft"
            }`}
            data-testid="config-health-issues"
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-left rounded-card"
            >
                {errors.length ? (
                    <WarningCircle size={16} className="text-error shrink-0" weight="fill"/>
                ) : (
                    <Warning size={16} className="text-warning shrink-0" weight="fill"/>
                )}
                <span className="text-sm font-medium text-foreground flex-1">{summary}</span>
                <span className="text-[11px] text-primary font-medium">{open ? "Hide" : "Review"}</span>
                <CaretDown
                    size={14}
                    className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                />
            </button>
            {open && (
                <ul className="px-4 pb-3 space-y-1.5 text-[12px] border-t border-border pt-3">
                    {issues.map((issue, idx) => {
                        const tab = issue.field ? FIELD_TO_TAB[issue.field] : null;
                        const jumpable = Boolean(tab && onJumpToField);
                        return (
                            <li
                                key={`${issue.field || "x"}-${idx}`}
                                className={
                                    issue.level === "error"
                                        ? "text-error"
                                        : issue.level === "warning"
                                            ? "text-warning"
                                            : "text-muted-foreground"
                                }
                            >
                                {jumpable ? (
                                    <button
                                        type="button"
                                        className="text-left w-full hover:underline decoration-primary/50"
                                        title={`Open ${tab} tab`}
                                        data-testid={`health-jump-${issue.field}`}
                                        onClick={() => onJumpToField(issue.field)}
                                    >
                    <span className="uppercase text-[9px] tracking-wider opacity-70 mr-1.5">
                      {issue.level}
                    </span>
                                        {issue.field && (
                                            <span
                                                className="font-mono text-[10px] text-primary/80 mr-1.5">{issue.field}</span>
                                        )}
                                        {issue.message}
                                    </button>
                                ) : (
                                    <>
                    <span className="uppercase text-[9px] tracking-wider opacity-70 mr-1.5">
                      {issue.level}
                    </span>
                                        {issue.field && (
                                            <span
                                                className="font-mono text-[10px] text-muted-foreground mr-1.5">{issue.field}</span>
                                        )}
                                        {issue.message}
                                    </>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

function inputCls(hasError) {
    return `soc-input w-full ${
        hasError
            ? "!border-[var(--error-border)] focus:!border-[var(--error)] focus:!shadow-[0_0_0_3px_var(--error-bg)]"
            : ""
    }`;
}

const FIELD_GRID = "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-x-5 gap-y-4";
const FIELD_GRID_2 = "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-4";

const EMPTY_SECRETS = {
    anthropic_api_key: "",
    openai_api_key: "",
    gemini_api_key: "",
    groq_api_key: "",
    abuseipdb_key: "",
    virustotal_key: "",
    greynoise_key: "",
    threatfox_key: "",
    otx_api_key: "",
    shodan_api_key: "",
    cohere_api_key: "",
    slack_webhook_url: "",
};

function formFromSettings(d) {
    return {
        llm_provider: d?.llm_provider || "anthropic",
        llm_model: d?.llm_model || "claude-sonnet-4-6",
        llm_temperature: d?.llm_temperature ?? 0.2,
        llm_token_budget_monthly: d?.llm_token_budget_monthly ?? 0,
        grounding_threshold: d?.grounding_threshold ?? 0.7,
        hitl_severity_min: d?.hitl_severity_min || "high",
        auto_approve_grounding_min: d?.auto_approve_grounding_min ?? 0.85,
        correlation_window_minutes: d?.correlation_window_minutes ?? 30,
        session_timeout_hours: d?.session_timeout_hours ?? 24,
        failed_login_lockout: d?.failed_login_lockout ?? 5,
        incident_retention_days: d?.incident_retention_days ?? 90,
        enrichment_cache_ttl_hours: d?.enrichment_cache_ttl_hours ?? 24,
        cohere_rerank_enabled: d?.cohere_rerank_enabled !== false,
        ...EMPTY_SECRETS,
        email_alerts_to: d?.email_alerts_to || "",
    };
}

const PROVIDER_KEY = {
    anthropic: {field: "anthropic_api_key", flag: "has_anthropic", ph: "sk-ant-…"},
    openai: {field: "openai_api_key", flag: "has_openai", ph: "sk-…"},
    gemini: {field: "gemini_api_key", flag: "has_gemini", ph: "AIza…"},
    groq: {field: "groq_api_key", flag: "has_groq", ph: "gsk_…"},
};

function isRec(form, key) {
    const rec = RECOMMENDED_OPS[key];
    if (rec === undefined) return false;
    const cur = form[key];
    if (typeof rec === "number" && typeof cur === "number") {
        return Math.abs(rec - cur) < 1e-9;
    }
    return String(cur) === String(rec);
}

export default function Settings() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [settings, setSettings] = useState(null);
    const [form, setForm] = useState({});
    const [initialForm, setInitialForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [showLlmAdvanced, setShowLlmAdvanced] = useState(false);
    const [tiEditField, setTiEditField] = useState(null);
    const [showSlackHelp, setShowSlackHelp] = useState(false);
    const [uiPrefs, setUiPrefs] = useState(() => loadUiPrefs());
    const [uiPrefsDirty, setUiPrefsDirty] = useState(false);

    // Threat Intel Table Sorting State
    const [tiSortCol, setTiSortCol] = useState("label");
    const [tiSortDir, setTiSortDir] = useState("asc");

    const activeTab = normalizeTabId(searchParams.get("tab") || DEFAULT_TAB);

    const hydrate = useCallback((d) => {
        const raw = d?.settings || d || {};
        setSettings(raw);
        const parsed = formFromSettings(raw);
        setForm(parsed);
        setInitialForm(parsed);
    }, []);

    const isDirty = useMemo(() => {
        if (!initialForm || Object.keys(initialForm).length === 0) return false;
        for (const key of OPS_KEYS) {
            if (form[key] !== initialForm[key]) return true;
        }
        for (const key of SECRET_FORM_KEYS) {
            if (String(form[key] || "").trim() !== "") return true;
        }
        return false;
    }, [form, initialForm]);

    const setActiveTab = useCallback(
        (id) => {
            const next = normalizeTabId(id);
            setSearchParams(
                (prev) => {
                    const p = new URLSearchParams(prev);
                    if (next === DEFAULT_TAB) p.delete("tab");
                    else p.set("tab", next);
                    return p;
                },
                {replace: true},
            );
            requestAnimationFrame(() => {
                const el = document.querySelector(`[data-testid="settings-tab-panel"]`);
                if (el) el.scrollIntoView({behavior: "smooth", block: "nearest"});
            });
        },
        [setSearchParams],
    );

    const modelMeta = useMemo(
        () => getModelMeta(form.llm_provider),
        [form.llm_provider],
    );

    const issues = useMemo(
        () => validateSettingsForm(form, settings || {}),
        [form, settings],
    );

    const issueByField = useMemo(() => {
        const map = {};
        for (const i of issues) {
            if (i.field && !map[i.field]) map[i.field] = i;
        }
        return map;
    }, [issues]);

    const tabIssueCounts = useMemo(() => {
        const counts = {};
        for (const t of SETTINGS_TABS) counts[t.id] = {error: 0, warning: 0};
        for (const i of issues) {
            const tab = FIELD_TO_TAB[i.field];
            if (!tab || !counts[tab]) continue;
            if (i.level === "error") counts[tab].error += 1;
            else if (i.level === "warning") counts[tab].warning += 1;
        }
        return counts;
    }, [issues]);

    const profileTab = useMemo(() => detectProfile(form), [form]);
    const hasBlockingErrors = issues.some((i) => i.level === "error");

    // Sorted Threat Intel Providers list (Defined strictly before early returns to obey Hook rules)
    const sortedTiKeys = useMemo(() => {
        return [...TI_KEYS].sort((a, b) => {
            const [labelA, fieldA, flagA] = a;
            const [labelB, fieldB, flagB] = b;

            if (tiSortCol === "label") {
                const res = labelA.localeCompare(labelB);
                return tiSortDir === "asc" ? res : -res;
            } else if (tiSortCol === "status") {
                const liveA = !!(settings?.[flagA]) || Boolean(String(form[fieldA] || "").trim());
                const liveB = !!(settings?.[flagB]) || Boolean(String(form[fieldB] || "").trim());
                const res = (liveA === liveB ? 0 : liveA ? -1 : 1);
                return tiSortDir === "asc" ? res : -res;
            }
            return 0;
        });
    }, [settings, form, tiSortCol, tiSortDir]);

    // Load settings once with safety timer
    useEffect(() => {
        let isSubscribed = true;

        const safetyTimer = setTimeout(() => {
            if (isSubscribed && !settings) {
                hydrate({
                    llm_provider: "anthropic",
                    llm_model: "claude-sonnet-4-6",
                    llm_temperature: 0.2,
                    llm_token_budget_monthly: 0,
                    grounding_threshold: 0.7,
                    hitl_severity_min: "high",
                    auto_approve_grounding_min: 0.85,
                    correlation_window_minutes: 30,
                    session_timeout_hours: 24,
                    failed_login_lockout: 5,
                    incident_retention_days: 90,
                    enrichment_cache_ttl_hours: 24,
                    cohere_rerank_enabled: true,
                });
            }
        }, 1500);

        api.get("/settings")
            .then((r) => {
                if (isSubscribed) {
                    clearTimeout(safetyTimer);
                    hydrate(r.data);
                }
            })
            .catch((e) => {
                if (isSubscribed) {
                    clearTimeout(safetyTimer);
                    hydrate({
                        llm_provider: "anthropic",
                        llm_model: "claude-sonnet-4-6",
                        llm_temperature: 0.2,
                        llm_token_budget_monthly: 0,
                        grounding_threshold: 0.7,
                        hitl_severity_min: "high",
                        auto_approve_grounding_min: 0.85,
                        correlation_window_minutes: 30,
                        session_timeout_hours: 24,
                        failed_login_lockout: 5,
                        incident_retention_days: 90,
                        enrichment_cache_ttl_hours: 24,
                        cohere_rerank_enabled: true,
                    });
                }
            });

        return () => {
            isSubscribed = false;
            clearTimeout(safetyTimer);
        };
    }, [hydrate, settings]);

    const jumpToField = useCallback(
        (field) => {
            const tab = FIELD_TO_TAB[field];
            if (tab) setActiveTab(tab);
        },
        [setActiveTab],
    );

    const updateUiPrefs = useCallback((updater) => {
        setUiPrefs((prev) => {
            const next = typeof updater === "function" ? updater(prev) : {...prev, ...updater};
            return next;
        });
        setUiPrefsDirty(true);
    }, []);

    const persistUiPrefs = useCallback(() => {
        const next = saveUiPrefs(uiPrefs);
        setUiPrefs(next);
        setUiPrefsDirty(false);
        toast.success("UI preferences saved for this browser");
    }, [uiPrefs]);

    const save = async () => {
        if (activeTab === "ui") {
            persistUiPrefs();
            return;
        }
        if (hasBlockingErrors) {
            const firstErr = issues.find((i) => i.level === "error");
            if (firstErr?.field) jumpToField(firstErr.field);
            toast.error("Fix configuration errors before saving", {
                description: issues.filter((i) => i.level === "error").map((i) => i.message).join(" · "),
            });
            return;
        }
        setBusy(true);
        const payload = buildSettingsPayload(form);
        try {
            try {
                await api.put("/settings", payload);
            } catch (putErr) {
                if (putErr?.response?.status === 404 || putErr?.response?.status === 405) {
                    await api.post("/settings", payload);
                } else {
                    throw putErr;
                }
            }
            const alsoUi = uiPrefsDirty;
            if (alsoUi) {
                saveUiPrefs(uiPrefs);
                setUiPrefsDirty(false);
            }
            toast.success(alsoUi ? "Settings + UI prefs saved" : "Settings saved");
            const r = await api.get("/settings");
            hydrate(r.data);
            setTiEditField(null);
        } catch (e) {
            toast.error(apiErrorDetail(e) || "Save failed");
        } finally {
            setBusy(false);
        }
    };

    const resetDefaults = async () => {
        if (activeTab === "ui") {
            const next = saveUiPrefs({...UI_PREF_DEFAULTS});
            setUiPrefs(next);
            setUiPrefsDirty(false);
            toast.message("UI preferences reset to factory defaults");
            return;
        }
        const ok = window.confirm(
            "Reset ops settings to factory defaults?\n\n" +
            "• Temperature 0.2, grounding 0.7, HiTL critical-only, 24h sessions, 90d retention\n" +
            "• API keys and Slack webhook are kept\n" +
            "• Alert email is cleared",
        );
        if (!ok) return;
        setBusy(true);
        try {
            await api.post("/settings/apply-profile", {profile: "factory", keep_secrets: true});
            toast.success("Factory defaults applied (secrets kept)");
            const r = await api.get("/settings");
            hydrate(r.data);
        } catch (e) {
            try {
                await api.post("/settings/reset", {keep_secrets: true});
                toast.success("Settings reset to factory defaults (secrets kept)");
                const r = await api.get("/settings");
                hydrate(r.data);
            } catch (e2) {
                toast.error(apiErrorDetail(e2) || apiErrorDetail(e) || "Reset failed");
            }
        } finally {
            setBusy(false);
        }
    };

    const applyRecommended = async () => {
        if (activeTab === "ui") {
            updateUiPrefs({...UI_PREF_RECOMMENDED});
            toast.message("Recommended UI profile applied — Save to persist");
            return;
        }
        const ok = window.confirm(
            "Apply ACTIRA recommended settings?\n\n" +
            "• Anthropic + claude-sonnet-4-6\n" +
            "• Temperature 0.15 · grounding ≥ 0.75 · HiTL from high\n" +
            "• Session 8h · retention 180d\n" +
            "• API keys / Slack kept · email unchanged",
        );
        if (!ok) return;
        setBusy(true);
        try {
            await api.post("/settings/apply-profile", {profile: "recommended", keep_secrets: true});
            toast.success("Recommended profile applied");
            const r = await api.get("/settings");
            hydrate(r.data);
        } catch (e) {
            const next = {
                ...form,
                ...RECOMMENDED_OPS,
                email_alerts_to: form.email_alerts_to || "",
                ...EMPTY_SECRETS,
            };
            setForm(next);
            try {
                const payload = buildSettingsPayload(next);
                try {
                    await api.put("/settings", payload);
                } catch (putErr) {
                    if (putErr?.response?.status === 404 || putErr?.response?.status === 405) {
                        await api.post("/settings", payload);
                    } else {
                        throw putErr;
                    }
                }
                toast.success("Recommended values saved");
                const r = await api.get("/settings");
                hydrate(r.data);
            } catch (e2) {
                toast.error("Could not apply recommended settings", {
                    description: `${apiErrorDetail(e2)} (profile: ${apiErrorDetail(e)})`,
                });
            }
        } finally {
            setBusy(false);
        }
    };

    const sendTestEmail = async () => {
        const to = String(form.email_alerts_to || "").trim();
        if (!to) {
            toast.error("Enter an alert email first");
            return;
        }
        setBusy(true);
        try {
            const payload = buildSettingsPayload({...form, email_alerts_to: to});
            try {
                await api.put("/settings", payload);
            } catch (putErr) {
                if (putErr?.response?.status === 404 || putErr?.response?.status === 405) {
                    await api.post("/settings", payload);
                } else {
                    throw putErr;
                }
            }
            const r = await api.post("/settings/test-email", {
                to,
                save_recipient: true,
            });
            const transport = r.data?.result?.transport || "gateway";
            const needsActivation = !!(r.data?.needs_activation || r.data?.result?.needs_activation);
            const note =
                r.data?.message ||
                r.data?.activation_note ||
                r.data?.result?.activation_note;
            if (needsActivation) {
                toast.success(`Activation email sent to ${to}`, {
                    description: note || "Check inbox/spam → Activate → resend test.",
                    duration: 12000,
                });
            } else {
                toast.success(`Test email sent via ${transport}`, {
                    description: note || "Check inbox and spam.",
                    duration: 8000,
                });
            }
            const g = await api.get("/settings");
            hydrate(g.data);
        } catch (e) {
            const detail = e?.response?.data?.detail;
            const msg =
                (typeof detail === "object" && (detail?.detail || detail?.message || detail?.activation_note)) ||
                (typeof detail === "string" && detail) ||
                apiErrorDetail(e);
            toast.error("Test email failed", {description: String(msg), duration: 10000});
        } finally {
            setBusy(false);
        }
    };

    const sendTestSlack = async () => {
        const typed = String(form.slack_webhook_url || "").trim();
        if (!typed && !settings.has_slack) {
            toast.error("Install Slack first", {
                description: "Paste an Incoming Webhook URL (hooks.slack.com/services/…), not an xox… token.",
                duration: 14000,
            });
            return;
        }
        if (typed && (/^xox[a-z]?-/i.test(typed) || /\.xox[bp]-/i.test(typed) || !typed.includes("hooks.slack.com"))) {
            toast.error("Wrong Slack credential type", {
                description: "Use Incoming Webhook URL, not a bot/user token.",
                duration: 14000,
            });
            return;
        }
        setBusy(true);
        try {
            const body = typed ? {webhook_url: typed, save_webhook: true} : {};
            const r = await api.post("/settings/test-slack", body);
            toast.success("Slack test posted", {
                description: r.data?.message || "Check your Slack channel.",
                duration: 8000,
            });
            const g = await api.get("/settings");
            hydrate(g.data);
            setForm((f) => ({...f, slack_webhook_url: ""}));
        } catch (e) {
            const detail = e?.response?.data?.detail;
            const msg =
                (typeof detail === "object" && (detail?.message || detail?.detail || detail?.hint)) ||
                (typeof detail === "string" && detail) ||
                apiErrorDetail(e);
            toast.error("Slack test failed", {description: String(msg), duration: 14000});
        } finally {
            setBusy(false);
        }
    };

    const clearThreatIntelKeys = async () => {
        const configured = TI_KEYS.filter(([, , flag]) => settings[flag]).map(([label]) => label);
        const list = configured.length ? configured.join(", ") : "all TI fields";
        const ok = window.confirm(
            `Clear all Threat Intelligence API keys?\n\nRemoves: ${list}\nEnrichment falls back to mock.\nLLM/Slack untouched.`,
        );
        if (!ok) return;
        setBusy(true);
        try {
            await api.post("/settings/clear-secrets", {
                scope: "threat_intel",
                confirm: true,
            });
            toast.success("Threat intel keys cleared");
            const r = await api.get("/settings");
            hydrate(r.data);
            setForm((f) => {
                const next = {...f};
                for (const field of TI_FIELD_NAMES) next[field] = "";
                return next;
            });
            setTiEditField(null);
        } catch (e) {
            try {
                await api.put("/settings", {clear_fields: TI_FIELD_NAMES});
                toast.success("Threat intel keys cleared");
                const r = await api.get("/settings");
                hydrate(r.data);
                setForm((f) => {
                    const next = {...f};
                    for (const field of TI_FIELD_NAMES) next[field] = "";
                    return next;
                });
                setTiEditField(null);
            } catch (e2) {
                toast.error(apiErrorDetail(e2) || apiErrorDetail(e) || "Clear failed");
            }
        } finally {
            setBusy(false);
        }
    };

    if (!settings) {
        return (
            <div data-testid="settings-page">
                <PageHeader
                    testid="settings-header"
                    title="Settings"
                    icon={HardDrives}
                    subtitle="Admin configuration for LLM, detection, threat intel, and retention."
                />
                <LoadingState message="Loading settings…" testid="settings-loading"/>
            </div>
        );
    }

    const upd = (k, v) => {
        setForm((f) => ({...f, [k]: v}));
    };

    const onProviderChange = (provider) => {
        setForm((f) => ({
            ...f,
            llm_provider: provider,
            llm_model: defaultModelForProvider(provider) || f.llm_model,
        }));
    };

    const pk = PROVIDER_KEY[form.llm_provider] || PROVIDER_KEY.anthropic;
    const liveTiCount = TI_KEYS.filter(([, , flag]) => settings[flag]).length;

    const toggleTiSort = (col) => {
        if (tiSortCol === col) {
            setTiSortDir((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setTiSortCol(col);
            setTiSortDir("asc");
        }
    };

    return (
        <div data-testid="settings-page" className="pb-4">
            <PageHeader
                testid="settings-header"
                title="Settings"
                icon={HardDrives}
                tip={
                    <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Hover <Info size={12} className="inline text-primary/80"/> for field help · secrets stay blank after load
          </span>
                }
                subtitle="Admin configuration for providers, HiTL detection gates, threat intel keys, alerts, and browser UI preferences."
                actions={
                    <div className="flex flex-wrap items-center gap-2" data-testid="settings-profile-tabs">
                        {activeTab === "ui" ? (
                            <>
                                {uiPrefsDirty && (
                                    <span
                                        className="text-[10px] uppercase font-semibold text-warning px-2 py-1 rounded bg-warning-soft border border-[var(--warning-border)]">
                    Unsaved UI changes
                  </span>
                                )}
                                <button
                                    type="button"
                                    data-testid="profile-recommended"
                                    disabled={busy}
                                    onClick={applyRecommended}
                                    title="Apply recommended UI preferences"
                                    className="soc-btn-secondary !py-1.5 !px-3 !text-[12px] inline-flex items-center gap-1.5 border border-[var(--success-border)] text-success bg-success-soft"
                                >
                                    <Sparkle size={12} weight="fill"/>
                                    Recommended
                                </button>
                                <button
                                    type="button"
                                    data-testid="profile-factory"
                                    disabled={busy}
                                    onClick={resetDefaults}
                                    title="Reset UI preferences to factory defaults"
                                    className="soc-btn-secondary !py-1.5 !px-3 !text-[12px] inline-flex items-center gap-1.5 border border-[var(--warning-border)] text-warning bg-warning-soft"
                                >
                                    <ArrowCounterClockwise size={12}/>
                                    Factory
                                </button>
                            </>
                        ) : (
                            <>
                                {isDirty && (
                                    <span
                                        className="text-[10px] uppercase font-semibold text-warning px-2 py-1 rounded bg-warning-soft border border-[var(--warning-border)]">
                    Unsaved changes
                  </span>
                                )}
                                <button
                                    type="button"
                                    data-testid="profile-recommended"
                                    disabled={busy}
                                    onClick={applyRecommended}
                                    title="Apply production-leaning recommended ops profile"
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50 border ${
                                        profileTab === "recommended"
                                            ? "bg-success-soft text-success border-[var(--success-border)]"
                                            : "soc-btn-secondary !py-1.5 !px-3 !text-[12px]"
                                    }`}
                                >
                                    <Sparkle size={12} weight="fill"/>
                                    Recommended
                                </button>
                                <button
                                    type="button"
                                    data-testid="profile-factory"
                                    disabled={busy}
                                    onClick={resetDefaults}
                                    title="Reset ops settings to factory defaults (keeps secrets)"
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors disabled:opacity-50 border ${
                                        profileTab === "factory"
                                            ? "bg-warning-soft text-warning border-[var(--warning-border)]"
                                            : "soc-btn-secondary !py-1.5 !px-3 !text-[12px]"
                                    }`}
                                >
                                    <ArrowCounterClockwise size={12}/>
                                    Factory
                                </button>
                            </>
                        )}
                    </div>
                }
            />

            <ConfigHealth issues={issues} onJumpToField={jumpToField}/>

            <div
                className="flex flex-wrap gap-1.5 mb-6 p-2 rounded-card border border-border bg-card shadow-sm sticky top-14 z-20 items-center"
                data-testid="settings-tabs"
                role="tablist"
                aria-label="Settings categories"
            >
                {SETTINGS_TABS.map(({id, label, icon: Icon, iconColor}) => {
                    const active = activeTab === id;
                    const counts = tabIssueCounts[id] || {error: 0, warning: 0};
                    const badgeN = counts.error || counts.warning;
                    return (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-controls={`settings-panel-${id}`}
                            id={`settings-tab-${id}`}
                            data-testid={`tab-${id}`}
                            onClick={() => setActiveTab(id)}
                            className={`inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg text-[13px] font-medium transition-colors min-h-[2.5rem] ${
                                active
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            }`}
                        >
                            <Icon size={16} weight={active ? "bold" : "regular"}
                                  className={`shrink-0 ${active ? "text-primary-foreground" : iconColor}`}/>
                            <span className="tracking-wide">{label}</span>
                            {badgeN > 0 && (
                                <span
                                    className={`min-w-[1.25rem] h-[1.25rem] px-1.5 rounded-md text-[10px] font-mono grid place-items-center ${
                                        counts.error
                                            ? active
                                                ? "bg-white/20 text-white"
                                                : "bg-error-soft text-error border border-[var(--error-border)]"
                                            : active
                                                ? "bg-white/20 text-white"
                                                : "bg-warning-soft text-warning border border-[var(--warning-border)]"
                                    }`}
                                    title={
                                        counts.error
                                            ? `${counts.error} error(s) on this tab`
                                            : `${counts.warning} warning(s) on this tab`
                                    }
                                    data-testid={`tab-badge-${id}`}
                                >
                  {badgeN}
                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            <div
                data-testid="settings-tab-panel"
                id={`settings-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`settings-tab-${activeTab}`}
                className="w-full space-y-6"
            >

                {/* ——— LLM ——— */}
                {activeTab === "llm" && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                        <div className="xl:col-span-8 space-y-6">
                            <CollapsibleSection title="LLM Provider Configuration"
                                                subtitle="Select provider, model weights, and API keys" icon={Cpu}>
                                <div className={FIELD_GRID_2}>
                                    <Field
                                        label="Provider"
                                        fieldKey="llm_provider"
                                        matchesRecommended={isRec(form, "llm_provider")}
                                        warning={issueByField.llm_provider}
                                    >
                                        <select
                                            data-testid="llm-provider"
                                            className={inputCls(issueByField.llm_provider?.level === "error")}
                                            value={form.llm_provider}
                                            onChange={(e) => onProviderChange(e.target.value)}
                                        >
                                            {Object.keys(PROVIDER_MODELS).map((p) => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field
                                        key={`model-field-${form.llm_provider}`}
                                        label="Model"
                                        fieldKey="llm_model"
                                        meta={modelMeta}
                                        tipKey={`llm_model-${form.llm_provider}`}
                                        matchesRecommended={isRec(form, "llm_model") && isRec(form, "llm_provider")}
                                        warning={issueByField.llm_model}
                                    >
                                        <select
                                            data-testid="llm-model"
                                            className={`${inputCls(issueByField.llm_model?.level === "error")} font-mono text-[12px]`}
                                            value={form.llm_model}
                                            onChange={(e) => upd("llm_model", e.target.value)}
                                        >
                                            {PROVIDER_MODELS[form.llm_provider]?.map((m) => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                            {form.llm_model
                                                && !(PROVIDER_MODELS[form.llm_provider] || []).includes(form.llm_model) && (
                                                    <option
                                                        value={form.llm_model}>{form.llm_model} (unsupported)</option>
                                                )}
                                        </select>
                                    </Field>
                                </div>

                                <Field
                                    label={`${form.llm_provider || "Provider"} API key`}
                                    fieldKey={pk.field}
                                    warning={issueByField[pk.field]}
                                    hint={
                                        settings[pk.flag]
                                            ? "✓ configured — leave blank to keep"
                                            : "Required for live playbooks"
                                    }
                                >
                                    <input
                                        data-testid={`key-${pk.field}`}
                                        type="password"
                                        placeholder={pk.ph}
                                        autoComplete="off"
                                        className={`${inputCls(issueByField[pk.field]?.level === "error")} font-mono`}
                                        value={form[pk.field] || ""}
                                        onChange={(e) => upd(pk.field, e.target.value)}
                                    />
                                </Field>

                                <button
                                    type="button"
                                    onClick={() => setShowLlmAdvanced((v) => !v)}
                                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1 font-medium"
                                    data-testid="llm-advanced-toggle"
                                >
                                    <CaretDown
                                        size={12}
                                        className={`transition-transform ${showLlmAdvanced ? "rotate-180" : ""}`}
                                    />
                                    {showLlmAdvanced ? "Hide advanced" : "Advanced (temperature, budget)"}
                                </button>

                                {showLlmAdvanced && (
                                    <div className={`${FIELD_GRID_2} pt-2 border-t border-border`}>
                                        <Field
                                            label="Temperature"
                                            fieldKey="llm_temperature"
                                            matchesRecommended={isRec(form, "llm_temperature")}
                                            warning={issueByField.llm_temperature}
                                        >
                                            <input
                                                data-testid="llm-temperature"
                                                type="number"
                                                step="0.05"
                                                min="0"
                                                max="1"
                                                className={`${inputCls(issueByField.llm_temperature?.level === "error")} font-mono`}
                                                value={form.llm_temperature}
                                                onChange={(e) => upd("llm_temperature", parseFloat(e.target.value))}
                                            />
                                        </Field>
                                        <Field
                                            label="Monthly token budget"
                                            fieldKey="llm_token_budget_monthly"
                                            matchesRecommended={isRec(form, "llm_token_budget_monthly")}
                                            warning={issueByField.llm_token_budget_monthly}
                                            hint="0 = unlimited; blocks LLM when exhausted"
                                        >
                                            <input
                                                data-testid="llm-budget"
                                                type="number"
                                                min="0"
                                                className={`${inputCls(false)} font-mono`}
                                                value={form.llm_token_budget_monthly}
                                                onChange={(e) => upd("llm_token_budget_monthly", parseInt(e.target.value) || 0)}
                                            />
                                        </Field>
                                        {settings?.llm_usage && (
                                            <div
                                                className="md:col-span-2 xl:col-span-3 text-[11px] text-muted-foreground font-mono rounded-lg border border-border bg-muted/40 px-3 py-2"
                                                data-testid="llm-usage-meter"
                                            >
                                                Usage {settings.llm_usage.month}:{" "}
                                                <span
                                                    className={settings.llm_usage.exhausted ? "text-error" : "text-primary"}>
                    {(settings.llm_usage.tokens_used ?? 0).toLocaleString()}
                  </span>
                                                {settings.llm_usage.unlimited
                                                    ? " / unlimited"
                                                    : ` / ${(settings.llm_usage.budget ?? 0).toLocaleString()}`}
                                                {settings.llm_usage.exhausted ? " — budget exhausted" : ""}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </CollapsibleSection>
                        </div>
                        <aside className="xl:col-span-4 space-y-6">
                            <DsPanel title="Active stack" icon={Cpu} subtitle="Runtime snapshot from saved settings">
                                <dl className="space-y-3 text-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">Provider</dt>
                                        <dd className="font-mono text-primary font-semibold uppercase">{form.llm_provider || "—"}</dd>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">Model</dt>
                                        <dd className="font-mono text-xs text-right break-all max-w-[60%]">{form.llm_model || "—"}</dd>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">API key</dt>
                                        <dd className={settings[pk.flag] ? "text-success font-medium" : "text-warning font-medium"}>
                                            {settings[pk.flag] ? "Configured" : "Missing"}
                                        </dd>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">Temperature</dt>
                                        <dd className="font-mono">{form.llm_temperature ?? "—"}</dd>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">Token budget</dt>
                                        <dd className="font-mono">
                                            {Number(form.llm_token_budget_monthly) === 0
                                                ? "Unlimited"
                                                : (form.llm_token_budget_monthly ?? "—")}
                                        </dd>
                                    </div>
                                </dl>
                            </DsPanel>
                            <DsPanel title="Ops profile" icon={Sparkle} subtitle="Detected from current field values">
                                <div
                                    className={`rounded-lg border px-3 py-2.5 text-sm font-semibold ${
                                        profileTab === "recommended"
                                            ? "border-[var(--success-border)] bg-success-soft text-success"
                                            : profileTab === "factory"
                                                ? "border-[var(--warning-border)] bg-warning-soft text-warning"
                                                : "border-primary/30 bg-primary/10 text-primary"
                                    }`}
                                >
                                    {profileTab === "recommended"
                                        ? "Recommended production profile"
                                        : profileTab === "factory"
                                            ? "Factory defaults"
                                            : "Custom mix"}
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed mt-3">
                                    Use header actions or the sticky bar to apply recommended / factory ops without
                                    wiping secrets.
                                </p>
                            </DsPanel>
                        </aside>
                    </div>
                )}

                {/* ——— Detection / Pipeline ——— */}
                {activeTab === "pipeline" && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                        <div className="xl:col-span-8">
                            <CollapsibleSection title="Detection & Review Thresholds"
                                                subtitle="Configure grounding thresholds and HITL gate rules"
                                                icon={Sliders}>
                                <div className={FIELD_GRID_2}>
                                    <Field
                                        label="Grounding threshold"
                                        fieldKey="grounding_threshold"
                                        matchesRecommended={isRec(form, "grounding_threshold")}
                                        warning={issueByField.grounding_threshold}
                                    >
                                        <input
                                            data-testid="grounding-threshold"
                                            type="number"
                                            step="0.05"
                                            min="0"
                                            max="1"
                                            className={`${inputCls(issueByField.grounding_threshold?.level === "error")} font-mono`}
                                            value={form.grounding_threshold}
                                            onChange={(e) => upd("grounding_threshold", parseFloat(e.target.value))}
                                        />
                                    </Field>
                                    <Field
                                        label="HiTL severity min"
                                        fieldKey="hitl_severity_min"
                                        matchesRecommended={isRec(form, "hitl_severity_min")}
                                        warning={issueByField.hitl_severity_min}
                                    >
                                        <select
                                            data-testid="hitl-severity"
                                            className={inputCls(false)}
                                            value={form.hitl_severity_min}
                                            onChange={(e) => upd("hitl_severity_min", e.target.value)}
                                        >
                                            {["low", "medium", "high", "critical"].map((s) => (
                                                <option key={s}>{s}</option>
                                            ))}
                                        </select>
                                    </Field>
                                    <Field
                                        label="Cohere re-rank after hybrid retrieve"
                                        fieldKey="cohere_rerank_enabled"
                                        matchesRecommended={isRec(form, "cohere_rerank_enabled")}
                                        hint={
                                            settings?.has_cohere
                                                ? "Key configured — re-rank runs on playbook/KB search"
                                                : "Add Cohere key under Threat intel to enable live re-rank"
                                        }
                                    >
                                        <select
                                            data-testid="cohere-rerank-enabled"
                                            className={inputCls(false)}
                                            value={form.cohere_rerank_enabled === false ? "false" : "true"}
                                            onChange={(e) => upd("cohere_rerank_enabled", e.target.value === "true")}
                                        >
                                            <option value="true">Enabled (when key set)</option>
                                            <option value="false">Disabled</option>
                                        </select>
                                    </Field>
                                    <Field
                                        label="Auto-approve grounding ≥"
                                        fieldKey="auto_approve_grounding_min"
                                        matchesRecommended={isRec(form, "auto_approve_grounding_min")}
                                        warning={issueByField.auto_approve_grounding_min}
                                    >
                                        <input
                                            data-testid="auto-approve"
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            max="1"
                                            className={`${inputCls(issueByField.auto_approve_grounding_min?.level === "error")} font-mono`}
                                            value={form.auto_approve_grounding_min}
                                            onChange={(e) => upd("auto_approve_grounding_min", parseFloat(e.target.value))}
                                        />
                                    </Field>
                                    <Field
                                        label="Correlation window (min)"
                                        fieldKey="correlation_window_minutes"
                                        matchesRecommended={isRec(form, "correlation_window_minutes")}
                                        warning={issueByField.correlation_window_minutes}
                                    >
                                        <input
                                            data-testid="corr-window"
                                            type="number"
                                            min="1"
                                            className={`${inputCls(issueByField.correlation_window_minutes?.level === "error")} font-mono`}
                                            value={form.correlation_window_minutes}
                                            onChange={(e) => upd("correlation_window_minutes", parseInt(e.target.value) || 30)}
                                        />
                                    </Field>
                                </div>
                            </CollapsibleSection>
                        </div>
                        <aside className="xl:col-span-4 space-y-6">
                            <DsPanel title="HiTL summary" icon={Sliders} subtitle="How review gates behave">
                                <dl className="space-y-3 text-sm">
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Grounding gate</dt>
                                        <dd className="font-mono">{form.grounding_threshold ?? "—"}</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Min severity → HiTL</dt>
                                        <dd className="font-mono capitalize">{form.hitl_severity_min || "—"}</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Auto-approve ≥</dt>
                                        <dd className="font-mono">{form.auto_approve_grounding_min ?? "—"}</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Corr. window</dt>
                                        <dd className="font-mono">{form.correlation_window_minutes ?? "—"}m</dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">Cohere re-rank</dt>
                                        <dd className={form.cohere_rerank_enabled === false ? "text-muted-foreground" : "text-success"}>
                                            {form.cohere_rerank_enabled === false ? "Off" : settings?.has_cohere ? "On (live)" : "On (needs key)"}
                                        </dd>
                                    </div>
                                </dl>
                            </DsPanel>
                        </aside>
                    </div>
                )}

                {/* ——— Threat intel table ——— */}
                {activeTab === "threat_intel" && (
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                        <div className="xl:col-span-8">
                            <CollapsibleSection title="Threat Intelligence Providers"
                                                subtitle="Manage API keys and integration endpoints" icon={Key}>
                                <div className="flex flex-wrap items-center justify-between gap-2 -mt-1">
                                    <p className="text-[12px] text-muted-foreground">
                                        {liveTiCount === 0 ? (
                                            <>All sources <span className="text-warning font-medium">mock</span> until
                                                you add keys.</>
                                        ) : (
                                            <>
                                                <span className="text-success font-medium">{liveTiCount} live</span>
                                                {" · "}
                                                {TI_KEYS.length - liveTiCount} mock
                                            </>
                                        )}
                                    </p>
                                    <button
                                        type="button"
                                        data-testid="clear-ti-keys"
                                        disabled={busy || liveTiCount === 0}
                                        onClick={clearThreatIntelKeys}
                                        className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border border-[var(--error-border)] text-error hover:bg-error-soft transition-colors disabled:opacity-40"
                                    >
                                        <Trash size={12} weight="bold"/>
                                        Clear all
                                    </button>
                                </div>
                                {issueByField.threat_intel && (
                                    <p className="text-[10px] text-muted-foreground flex items-start gap-1"
                                       data-testid="warn-threat_intel">
                                        <Warning size={12} className="shrink-0 mt-px" weight="fill"/>
                                        {issueByField.threat_intel.message}
                                    </p>
                                )}

                                <div className="rounded-card border border-border overflow-hidden">
                                    <table className="soc-table text-[12px]">
                                        <thead>
                                        <tr>
                                            <th className="cursor-pointer select-none hover:text-primary transition-colors"
                                                onClick={() => toggleTiSort("label")}>
                                                <div className="flex items-center gap-1.5">
                                                    <span>Source</span>
                                                    {tiSortCol === "label" && (tiSortDir === "asc" ?
                                                        <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                                                </div>
                                            </th>
                                            <th className="cursor-pointer select-none hover:text-primary transition-colors"
                                                onClick={() => toggleTiSort("status")}>
                                                <div className="flex items-center gap-1.5">
                                                    <span>Status</span>
                                                    {tiSortCol === "status" && (tiSortDir === "asc" ?
                                                        <ArrowUp size={12}/> : <ArrowDown size={12}/>)}
                                                </div>
                                            </th>
                                            <th className="text-right">Action</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {sortedTiKeys.map(([label, field, hasKey], idx) => {
                                            const live = !!settings[hasKey];
                                            const editing = tiEditField === field;
                                            const typed = String(form[field] || "").trim();
                                            return (
                                                <tr key={`${field}-${idx}`}>
                                                    <td className="text-foreground" colSpan={editing ? 3 : 1}>
                                                        {!editing ? (
                                                            label
                                                        ) : (
                                                            <div className="space-y-2">
                                                                <div
                                                                    className="text-foreground/90 font-medium">{label}</div>
                                                                <input
                                                                    data-testid={`key-${field}`}
                                                                    type="password"
                                                                    placeholder="paste API key…"
                                                                    autoComplete="off"
                                                                    className={`${inputCls(false)} font-mono`}
                                                                    value={form[field] || ""}
                                                                    onChange={(e) => upd(field, e.target.value)}
                                                                />
                                                                <div className="flex gap-2">
                                                                    <button
                                                                        type="button"
                                                                        className="text-[11px] px-2.5 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10"
                                                                        onClick={() => {
                                                                            if (!typed && !live) {
                                                                                toast.message("Paste a key, then Save all settings");
                                                                            }
                                                                            setTiEditField(null);
                                                                        }}
                                                                    >
                                                                        Done
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        className="text-[11px] px-2.5 py-1 rounded text-muted-foreground hover:text-foreground"
                                                                        onClick={() => {
                                                                            upd(field, "");
                                                                            setTiEditField(null);
                                                                        }}
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                                <p className="text-[10px] text-muted-foreground/80">
                                                                    Click <span className="text-muted-foreground">Save all settings</span> to
                                                                    persist the new key.
                                                                </p>
                                                            </div>
                                                        )}
                                                    </td>
                                                    {!editing && (
                                                        <>
                                                            <td className="px-3 py-2.5">
                                                                {live || typed ? (
                                                                    <span
                                                                        className="inline-flex items-center gap-1 text-success text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]"/>
                                                                        {typed && !live ? "pending save" : "live"}
                              </span>
                                                                ) : (
                                                                    <span
                                                                        className="inline-flex items-center gap-1 text-warning/80 text-[11px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)]/80"/>
                                mock
                              </span>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2.5 text-right">
                                                                <button
                                                                    type="button"
                                                                    className="text-[11px] text-primary/90 hover:text-primary"
                                                                    onClick={() => setTiEditField(field)}
                                                                    data-testid={`ti-edit-${field}`}
                                                                >
                                                                    {live ? "Replace key" : "Add key"}
                                                                </button>
                                                            </td>
                                                        </>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                            </CollapsibleSection>
                        </div>
                        <aside className="xl:col-span-4 space-y-6">
                            <DsPanel title="Intel coverage" icon={Key}
                                     subtitle={`${liveTiCount} of ${TI_KEYS.length} providers live`}>
                                <div className="space-y-2">
                                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-primary transition-all"
                                            style={{width: `${Math.round((liveTiCount / Math.max(TI_KEYS.length, 1)) * 100)}%`}}
                                        />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Live keys power real enrichment scores. Without keys, ACTIRA uses deterministic
                                        mock intel so pipelines still run offline.
                                    </p>
                                    <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-1.5 pt-1">
                                        {sortedTiKeys.map(([label, , hasKey], idx) => (
                                            <li
                                                key={`cov-${label}-${idx}`}
                                                className="flex items-center justify-between gap-2 text-[12px] px-2 py-1.5 rounded-md border border-border bg-muted/30"
                                            >
                                                <span className="truncate">{label}</span>
                                                <span
                                                    className={settings[hasKey] ? "text-success font-medium" : "text-warning font-medium"}>
                      {settings[hasKey] ? "live" : "mock"}
                    </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </DsPanel>
                        </aside>
                    </div>
                )}

                {/* ——— Alerts compact ——— */}
                {activeTab === "notifications" && (
                    <CollapsibleSection title="Notification Channels"
                                        subtitle="Configure Slack webhooks and alert email recipients" icon={Bell}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="rounded-card border border-border bg-muted/30 p-4 space-y-2.5 h-full">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-foreground">Slack</span>
                                        {settings.has_slack ? (
                                            <span className="text-[10px] text-success flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]"/> connected
                    </span>
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"/> not set
                    </span>
                                        )}
                                        <FieldTip fieldKey="slack_webhook_url"/>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            data-testid="send-test-slack"
                                            disabled={busy}
                                            onClick={sendTestSlack}
                                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                                        >
                                            <PaperPlaneTilt size={12} weight="fill"/>
                                            Test
                                        </button>
                                        <button
                                            type="button"
                                            className="text-[10px] text-muted-foreground hover:text-foreground"
                                            onClick={() => setShowSlackHelp((v) => !v)}
                                        >
                                            {showSlackHelp ? "Hide help" : "How to connect"}
                                        </button>
                                    </div>
                                </div>
                                <input
                                    data-testid="slack-webhook"
                                    type="password"
                                    placeholder={
                                        settings.has_slack
                                            ? "leave blank to keep · or paste new hooks.slack.com URL"
                                            : "https://hooks.slack.com/services/T…/B…/…"
                                    }
                                    className={`${inputCls(!!issueByField.slack_webhook_url)} font-mono text-[12px]`}
                                    value={form.slack_webhook_url}
                                    onChange={(e) => upd("slack_webhook_url", e.target.value)}
                                />
                                {issueByField.slack_webhook_url && (
                                    <p className="text-[10px] text-error" data-testid="warn-slack_webhook_url">
                                        {issueByField.slack_webhook_url.message}
                                    </p>
                                )}
                                {showSlackHelp && (
                                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                                        Create an{" "}
                                        <a
                                            href="https://api.slack.com/messaging/webhooks"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-primary underline underline-offset-2"
                                        >
                                            Incoming Webhook
                                        </a>
                                        , pick a channel, paste the URL (not an xox… token), then Test.
                                    </p>
                                )}
                            </div>

                            <div className="rounded-card border border-border bg-muted/30 p-4 space-y-2.5 h-full">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-foreground">Email</span>
                                        {settings.has_email || form.email_alerts_to ? (
                                            <span className="text-[10px] text-success flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]"/>
                                                {(form.email_alerts_to || settings.email_alerts_to || "").slice(0, 32)}
                                                {(form.email_alerts_to || settings.email_alerts_to || "").length > 32 ? "…" : ""}
                    </span>
                                        ) : (
                                            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground"/> not set
                    </span>
                                        )}
                                        <FieldTip fieldKey="email_alerts_to"/>
                                    </div>
                                    <button
                                        type="button"
                                        data-testid="send-test-email"
                                        disabled={busy}
                                        onClick={sendTestEmail}
                                        className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                                    >
                                        <PaperPlaneTilt size={12} weight="fill"/>
                                        Test
                                    </button>
                                </div>
                                <input
                                    data-testid="email-alerts"
                                    type="email"
                                    placeholder="soc-oncall@company.com"
                                    className={inputCls(issueByField.email_alerts_to?.level === "error")}
                                    value={form.email_alerts_to || ""}
                                    onChange={(e) => upd("email_alerts_to", e.target.value)}
                                />
                                {issueByField.email_alerts_to && (
                                    <p className="text-[10px] text-error" data-testid="warn-email_alerts_to">
                                        {issueByField.email_alerts_to.message}
                                    </p>
                                )}
                                <p className="text-[10px] text-muted-foreground/80">
                                    No SMTP required · check spam · first FormSubmit send may need activation
                                </p>
                            </div>
                        </div>
                    </CollapsibleSection>
                )}

                {/* ——— Access & data (security + retention) ——— */}
                {activeTab === "access" && (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <CollapsibleSection title="Access Security"
                                            subtitle="Configure session timeouts and login lockouts" icon={Shield}>
                            <div className={FIELD_GRID_2}>
                                <Field
                                    label="Session timeout (hours)"
                                    fieldKey="session_timeout_hours"
                                    matchesRecommended={isRec(form, "session_timeout_hours")}
                                    warning={issueByField.session_timeout_hours}
                                >
                                    <input
                                        data-testid="session-timeout"
                                        type="number"
                                        min="1"
                                        className={`${inputCls(issueByField.session_timeout_hours?.level === "error")} font-mono`}
                                        value={form.session_timeout_hours}
                                        onChange={(e) => upd("session_timeout_hours", parseInt(e.target.value) || 24)}
                                    />
                                </Field>
                                <Field
                                    label="Failed login lockout"
                                    fieldKey="failed_login_lockout"
                                    matchesRecommended={isRec(form, "failed_login_lockout")}
                                    warning={issueByField.failed_login_lockout}
                                >
                                    <input
                                        data-testid="login-lockout"
                                        type="number"
                                        min="1"
                                        className={`${inputCls(false)} font-mono`}
                                        value={form.failed_login_lockout}
                                        onChange={(e) => upd("failed_login_lockout", parseInt(e.target.value) || 5)}
                                    />
                                </Field>
                            </div>
                        </CollapsibleSection>
                        <CollapsibleSection title="Data Retention & TTL"
                                            subtitle="Manage incident storage history and cache limits"
                                            icon={HardDrives}>
                            <div className={FIELD_GRID_2}>
                                <Field
                                    label="Incident retention (days)"
                                    fieldKey="incident_retention_days"
                                    matchesRecommended={isRec(form, "incident_retention_days")}
                                    warning={issueByField.incident_retention_days}
                                >
                                    <input
                                        data-testid="retention-days"
                                        type="number"
                                        min="1"
                                        className={`${inputCls(false)} font-mono`}
                                        value={form.incident_retention_days}
                                        onChange={(e) => upd("incident_retention_days", parseInt(e.target.value) || 90)}
                                    />
                                </Field>
                                <Field
                                    label="Enrichment cache TTL (hours)"
                                    fieldKey="enrichment_cache_ttl_hours"
                                    matchesRecommended={isRec(form, "enrichment_cache_ttl_hours")}
                                    warning={issueByField.enrichment_cache_ttl_hours}
                                >
                                    <input
                                        data-testid="cache-ttl"
                                        type="number"
                                        min="1"
                                        className={`${inputCls(false)} font-mono`}
                                        value={form.enrichment_cache_ttl_hours}
                                        onChange={(e) => upd("enrichment_cache_ttl_hours", parseInt(e.target.value) || 24)}
                                    />
                                </Field>
                            </div>
                        </CollapsibleSection>
                    </div>
                )}

                {/* ——— UI preferences ——— */}
                {activeTab === "ui" && (
                    <div className="space-y-6" data-testid="settings-ui-prefs">
                        <CollapsibleSection title="Time & Pagination Limits"
                                            subtitle="Configure timezone standards and list capacities" icon={Desktop}>
                            <div className={FIELD_GRID_2}>
                                <Field
                                    label="Time display standard"
                                    fieldKey="time_display_timezone"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "time_display_timezone")}
                                    hint="Used across dashboard, processing, incidents, review queue, and detail pages"
                                >
                                    <select
                                        data-testid="ui-timezone"
                                        className={`${inputCls(false)} font-mono text-[12px]`}
                                        value={uiPrefs.time_display_timezone || "UTC"}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, time_display_timezone: e.target.value}))
                                        }
                                    >
                                        {TIMEZONE_OPTIONS.map((tz) => (
                                            <option key={tz.value} value={tz.value}>
                                                {tz.label}
                                            </option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="Dashboard recent limit"
                                    fieldKey="dashboard_recent_limit"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "dashboard_recent_limit")}
                                    hint="Rows in Recent Incidents (5–50)"
                                >
                                    <input
                                        data-testid="ui-recent-limit"
                                        type="number"
                                        min={5}
                                        max={50}
                                        className={`${inputCls(false)} font-mono`}
                                        value={uiPrefs.dashboard_recent_limit}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                dashboard_recent_limit: Math.max(5, Math.min(50, parseInt(e.target.value, 10) || 8)),
                                            }))
                                        }
                                    />
                                </Field>
                                <Field
                                    label="Incidents list cap"
                                    fieldKey="incidents_page_size"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "incidents_page_size")}
                                >
                                    <input
                                        data-testid="ui-incidents-page-size"
                                        type="number"
                                        min={20}
                                        max={500}
                                        className={`${inputCls(false)} font-mono`}
                                        value={uiPrefs.incidents_page_size ?? 200}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                incidents_page_size: Math.max(20, Math.min(500, parseInt(e.target.value, 10) || 200)),
                                            }))
                                        }
                                    />
                                </Field>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Default Sorting & Filters"
                                            subtitle="Set default views for incidents and review queues" icon={Sliders}>
                            <div className={FIELD_GRID_2}>
                                <Field
                                    label="Analytics default window (days)"
                                    fieldKey="analytics_default_days"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "analytics_default_days")}
                                >
                                    <select
                                        data-testid="ui-analytics-days"
                                        className={inputCls(false)}
                                        value={uiPrefs.analytics_default_days}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                analytics_default_days: parseInt(e.target.value, 10) || 30,
                                            }))
                                        }
                                    >
                                        {[7, 14, 30, 60, 90].map((d) => (
                                            <option key={d} value={d}>{d} days</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="Incidents default sort"
                                    fieldKey="incidents_default_sort"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "incidents_default_sort")}
                                >
                                    <select
                                        data-testid="ui-incidents-sort"
                                        className={`${inputCls(false)} font-mono text-[12px]`}
                                        value={uiPrefs.incidents_default_sort}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, incidents_default_sort: e.target.value}))
                                        }
                                    >
                                        {[
                                            "created_at:desc",
                                            "created_at:asc",
                                            "threat_score:desc",
                                            "severity:desc",
                                            "title:asc",
                                        ].map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="Review queue default sort"
                                    fieldKey="review_default_sort"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "review_default_sort")}
                                >
                                    <select
                                        data-testid="ui-review-sort"
                                        className={`${inputCls(false)} font-mono text-[12px]`}
                                        value={uiPrefs.review_default_sort}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, review_default_sort: e.target.value}))
                                        }
                                    >
                                        {[
                                            "threat_score:desc",
                                            "severity:desc",
                                            "grounding:asc",
                                            "created_at:desc",
                                        ].map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="KB default search mode"
                                    fieldKey="kb_default_mode"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "kb_default_mode")}
                                >
                                    <select
                                        data-testid="ui-kb-mode"
                                        className={inputCls(false)}
                                        value={uiPrefs.kb_default_mode}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, kb_default_mode: e.target.value}))
                                        }
                                    >
                                        <option value="hybrid">Hybrid</option>
                                        <option value="bm25">BM25</option>
                                        <option value="dense">Dense</option>
                                    </select>
                                </Field>
                                <Field
                                    label="Review queue default view"
                                    fieldKey="review_default_view"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "review_default_view")}
                                >
                                    <select
                                        data-testid="ui-review-view"
                                        className={inputCls(false)}
                                        value={uiPrefs.review_default_view || "cards"}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, review_default_view: e.target.value}))
                                        }
                                    >
                                        <option value="cards">Cards</option>
                                        <option value="table">Table</option>
                                    </select>
                                </Field>
                                <Field
                                    label="Incidents default severity filter"
                                    fieldKey="incidents_default_severity"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "incidents_default_severity")}
                                >
                                    <select
                                        data-testid="ui-incidents-sev"
                                        className={inputCls(false)}
                                        value={uiPrefs.incidents_default_severity || ""}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, incidents_default_severity: e.target.value}))
                                        }
                                    >
                                        <option value="">All</option>
                                        {["low", "medium", "high", "critical"].map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="Incidents default status filter"
                                    fieldKey="incidents_default_status"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "incidents_default_status")}
                                >
                                    <select
                                        data-testid="ui-incidents-status"
                                        className={inputCls(false)}
                                        value={uiPrefs.incidents_default_status || ""}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, incidents_default_status: e.target.value}))
                                        }
                                    >
                                        <option value="">All</option>
                                        {["new", "in_progress", "pending_review", "approved", "rejected", "closed"].map((s) => (
                                            <option key={s} value={s}>{s}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field
                                    label="Incidents min threat (default)"
                                    fieldKey="incidents_min_threat"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "incidents_min_threat")}
                                    hint="0 = no default min filter"
                                >
                                    <input
                                        data-testid="ui-incidents-min-threat"
                                        type="number"
                                        min={0}
                                        max={100}
                                        className={`${inputCls(false)} font-mono`}
                                        value={uiPrefs.incidents_min_threat ?? 0}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                incidents_min_threat: Math.max(0, parseInt(e.target.value, 10) || 0),
                                            }))
                                        }
                                    />
                                </Field>
                                <Field
                                    label="Review min threat (default)"
                                    fieldKey="review_min_threat"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "review_min_threat")}
                                >
                                    <input
                                        data-testid="ui-review-min-threat"
                                        type="number"
                                        min={0}
                                        max={100}
                                        className={`${inputCls(false)} font-mono`}
                                        value={uiPrefs.review_min_threat ?? 0}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                review_min_threat: Math.max(0, parseInt(e.target.value, 10) || 0),
                                            }))
                                        }
                                    />
                                </Field>
                                <Field
                                    label="Review max grounding filter"
                                    fieldKey="review_max_grounding"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "review_max_grounding")}
                                    hint="1 = show all; e.g. 0.7 focuses low-grounding cases"
                                >
                                    <input
                                        data-testid="ui-review-max-g"
                                        type="number"
                                        min={0}
                                        max={1}
                                        step={0.05}
                                        className={`${inputCls(false)} font-mono`}
                                        value={uiPrefs.review_max_grounding ?? 1}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                review_max_grounding: Math.min(1, Math.max(0, parseFloat(e.target.value) || 1)),
                                            }))
                                        }
                                    />
                                </Field>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Polling Intervals & Thresholds"
                                            subtitle="Manage background data refresh intervals and threat highlights"
                                            icon={Key}>
                            <div className={FIELD_GRID_2}>
                                <Field
                                    label="Status refresh interval (ms)"
                                    fieldKey="status_refresh_ms"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "status_refresh_ms")}
                                    hint="0 = disable layout status polling"
                                >
                                    <input
                                        data-testid="ui-refresh-ms"
                                        type="number"
                                        min={0}
                                        step={5000}
                                        className={`${inputCls(false)} font-mono`}
                                        value={uiPrefs.status_refresh_ms}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                status_refresh_ms: Math.max(0, parseInt(e.target.value, 10) || 0),
                                            }))
                                        }
                                    />
                                </Field>
                                <Field
                                    label="High-threat highlight threshold"
                                    fieldKey="high_threat_score_threshold"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "high_threat_score_threshold")}
                                    hint="Scores ≥ this value render in rose on tables"
                                >
                                    <input
                                        data-testid="ui-high-threat"
                                        type="number"
                                        min={0}
                                        max={100}
                                        className={`${inputCls(false)} font-mono`}
                                        value={uiPrefs.high_threat_score_threshold ?? 70}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                high_threat_score_threshold: Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 70)),
                                            }))
                                        }
                                    />
                                </Field>
                                <Field
                                    label="Dashboard refresh (ms)"
                                    fieldKey="dashboard_refresh_ms"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "dashboard_refresh_ms")}
                                    hint="0 = no auto-refresh of KPIs / recent table"
                                >
                                    <input
                                        data-testid="ui-dash-refresh"
                                        type="number"
                                        min={0}
                                        step={5000}
                                        className={`${inputCls(false)} font-mono`}
                                        value={uiPrefs.dashboard_refresh_ms ?? 0}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                dashboard_refresh_ms: Math.max(0, parseInt(e.target.value, 10) || 0),
                                            }))
                                        }
                                    />
                                </Field>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Interface Toggles"
                                            subtitle="Enable or disable auxiliary UI widgets and features"
                                            icon={Shield}>
                            <div className={FIELD_GRID_2}>
                                <Field
                                    label="Dashboard extra widgets"
                                    fieldKey="dashboard_extra_widgets"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "dashboard_extra_widgets")}
                                >
                                    <select
                                        data-testid="ui-extra-widgets"
                                        className={inputCls(false)}
                                        value={uiPrefs.dashboard_extra_widgets ? "true" : "false"}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                dashboard_extra_widgets: e.target.value === "true"
                                            }))
                                        }
                                    >
                                        <option value="true">On — severity / status / IoC / SOC health / trends</option>
                                        <option value="false">Off</option>
                                    </select>
                                </Field>
                                <Field
                                    label="Compact incident tables"
                                    fieldKey="compact_tables"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "compact_tables")}
                                >
                                    <select
                                        data-testid="ui-compact-tables"
                                        className={inputCls(false)}
                                        value={uiPrefs.compact_tables ? "true" : "false"}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, compact_tables: e.target.value === "true"}))
                                        }
                                    >
                                        <option value="false">Off — standard density</option>
                                        <option value="true">On — compact rows</option>
                                    </select>
                                </Field>
                                <Field
                                    label="Incident hover previews"
                                    fieldKey="show_incident_previews"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "show_incident_previews")}
                                >
                                    <select
                                        data-testid="ui-previews"
                                        className={inputCls(false)}
                                        value={uiPrefs.show_incident_previews !== false ? "true" : "false"}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                show_incident_previews: e.target.value === "true"
                                            }))
                                        }
                                    >
                                        <option value="true">On</option>
                                        <option value="false">Off</option>
                                    </select>
                                </Field>
                                <Field
                                    label="Metric help icons"
                                    fieldKey="show_help_tips"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "show_help_tips")}
                                >
                                    <select
                                        data-testid="ui-help-tips"
                                        className={inputCls(false)}
                                        value={uiPrefs.show_help_tips !== false ? "true" : "false"}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({...p, show_help_tips: e.target.value === "true"}))
                                        }
                                    >
                                        <option value="true">On — show (i) tips</option>
                                        <option value="false">Off</option>
                                    </select>
                                </Field>
                                <Field
                                    label="Analytics retrieval panel"
                                    fieldKey="analytics_show_retrieval"
                                    matchesRecommended={uiPrefMatchesRecommended(uiPrefs, "analytics_show_retrieval")}
                                >
                                    <select
                                        data-testid="ui-analytics-retrieval"
                                        className={inputCls(false)}
                                        value={uiPrefs.analytics_show_retrieval !== false ? "true" : "false"}
                                        onChange={(e) =>
                                            updateUiPrefs((p) => ({
                                                ...p,
                                                analytics_show_retrieval: e.target.value === "true"
                                            }))
                                        }
                                    >
                                        <option value="true">On by default</option>
                                        <option value="false">Off by default</option>
                                    </select>
                                </Field>
                            </div>
                        </CollapsibleSection>
                    </div>
                )}

            </div>

            <div
                className="mt-6 w-full flex flex-wrap items-center justify-between gap-3 sticky bottom-4 z-10 bg-card/95 backdrop-blur-md border border-border rounded-card px-4 py-3 shadow-md">
                {activeTab === "ui" ? (
                    <>
                        {uiPrefsDirty ? (
                            <span className="text-[12px] text-warning flex items-center gap-1 mr-auto">
                <Warning size={13} weight="fill"/> Unsaved UI modifications in browser storage
              </span>
                        ) : (
                            <span className="text-[12px] text-muted-foreground mr-auto">UI preferences up to date</span>
                        )}
                        <div className="flex items-center gap-2.5 ml-auto">
                            <button
                                type="button"
                                data-testid="reset-settings"
                                disabled={busy}
                                onClick={resetDefaults}
                                className="soc-btn-secondary"
                            >
                                <ArrowCounterClockwise size={14}/>
                                Reset
                            </button>
                            <button
                                type="button"
                                data-testid="apply-recommended"
                                disabled={busy}
                                onClick={applyRecommended}
                                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold border border-[var(--success-border)] text-success hover:bg-success-soft transition-colors disabled:opacity-50"
                            >
                                <Sparkle size={14} weight="fill"/>
                                Recommended
                            </button>
                            <button
                                type="button"
                                data-testid="save-settings"
                                disabled={busy || !uiPrefsDirty}
                                onClick={save}
                                className="soc-btn-primary"
                            >
                                Save all settings
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        {hasBlockingErrors ? (
                            <span className="text-[12px] text-error flex items-center gap-1.5 mr-auto">
                <WarningCircle size={14} weight="fill"/>
                Fix errors before save
                <button
                    type="button"
                    className="underline text-primary ml-1 font-medium"
                    onClick={() => {
                        const first = issues.find((i) => i.level === "error");
                        if (first?.field) jumpToField(first.field);
                    }}
                >
                  Go to issue
                </button>
              </span>
                        ) : isDirty ? (
                            <span className="text-[12px] text-warning flex items-center gap-1 mr-auto">
                <Warning size={13} weight="fill"/> Unsaved modifications in settings
              </span>
                        ) : uiPrefsDirty ? (
                            <span className="text-[12px] text-warning mr-auto">UI prefs also dirty — Save all writes both</span>
                        ) : (
                            <span className="text-[12px] text-muted-foreground mr-auto">All settings up to date</span>
                        )}

                        <div className="flex items-center gap-2.5 ml-auto">
                            <button
                                type="button"
                                data-testid="reset-settings"
                                disabled={busy}
                                onClick={resetDefaults}
                                className="soc-btn-secondary"
                            >
                                <ArrowCounterClockwise size={14}/>
                                Reset
                            </button>
                            <button
                                type="button"
                                data-testid="apply-recommended"
                                disabled={busy}
                                onClick={applyRecommended}
                                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold border border-[var(--success-border)] text-success hover:bg-success-soft transition-colors disabled:opacity-50"
                            >
                                <Sparkle size={14} weight="fill"/>
                                Recommended
                            </button>
                            <button
                                type="button"
                                data-testid="save-settings"
                                disabled={busy || hasBlockingErrors || (!isDirty && !uiPrefsDirty)}
                                onClick={save}
                                className="soc-btn-primary"
                            >
                                Save all settings
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}