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
    Lightning,
    PaperPlaneTilt,
    Shield,
    Sliders,
    Sparkle,
    Trash,
    Warning,
    WarningCircle,
    Flag,
    GearSix,
} from "@phosphor-icons/react";
import FeatureFlagsPanel from "../components/FeatureFlagsPanel";
import {
    loadUiPrefs,
    saveUiPrefs,
    TIMEZONE_OPTIONS,
    UI_PREF_DEFAULTS,
    UI_PREF_RECOMMENDED,
    uiPrefMatchesRecommended,
} from "../lib/uiPrefs";
import {HoverCard, HoverCardContent, HoverCardTrigger,} from "../components/ui/hover-card";
import {HelpTip} from "../components/HelpTip";
import {
    catalogFromApi,
    cloneModelCatalog,
    defaultModelForProvider,
    FACTORY_OPS,
    FIELD_META,
    getModelMeta,
    modelIdsForProvider,
    modelLabel,
    modelsByTier,
    normalizeProvider,
    RECOMMENDED_OPS,
    SUPPORTED_PROVIDERS,
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
    "llm_fallback_enabled",
    "llm_fallback_provider",
    "llm_fallback_model",
    "llm_manual_route",
    "grounding_threshold",
    "hitl_severity_min",
    "auto_approve_grounding_min",
    "correlation_window_minutes",
    "session_timeout_hours",
    "failed_login_lockout",
    "incident_retention_days",
    "enrichment_cache_ttl_hours",
    "cohere_rerank_enabled",
    "llm_technique_refine",
    "llm_redact_iocs",
    "email_alerts_to",
    // Platform / enterprise
    "max_enrich_iocs",
    "enrich_concurrency",
    "parse_concurrency",
    "ti_http_timeout",
    "ti_http_retries",
    "ti_http_backoff_base",
    "ti_circuit_failures",
    "ti_circuit_cooldown_seconds",
    "log_format",
    "log_file_format",
    "log_level",
    "log_to_file",
    "log_archive_enabled",
    "log_archive_retain_days",
    "job_artifacts_enabled",
    "job_payload_retain",
    "job_artifacts_retain_hours",
    "audit_worm_enabled",
    "job_broker_enabled",
    "job_broker_queue",
];

const SECRET_FORM_KEYS = [
    "anthropic_api_key",
    "openai_api_key",
    "gemini_api_key",
    "groq_api_key",
    ...TI_FIELD_NAMES,
    "slack_webhook_url",
    "audit_siem_webhook_url",
    "job_broker_url",
];

const SETTINGS_TABS = [
    {id: "llm", label: "LLM", icon: Cpu, iconColor: "text-primary", sectionKey: "llm", tip: "Provider, model, API keys, temperature, budget, and LLM fallback."},
    {id: "pipeline", label: "Detection", icon: Sliders, iconColor: "text-primary", sectionKey: "pipeline", tip: "Grounding threshold, HiTL severity floor, auto-approve, correlation window, ATT&CK LLM refine, IoC redaction."},
    {id: "threat_intel", label: "Threat intel", icon: Key, iconColor: "text-warning", sectionKey: "threat_intel", tip: "Live CTI API keys (empty = mock enrichment)."},
    {id: "notifications", label: "Alerts", icon: Bell, iconColor: "text-primary", sectionKey: "notifications", tip: "Slack webhook and alert email for critical/HiTL events."},
    {id: "access", label: "Access & data", icon: Shield, iconColor: "text-success", sectionKey: "security", tip: "Session timeout, login lockout, retention, enrichment cache TTL."},
    {id: "platform", label: "Platform", icon: GearSix, iconColor: "text-primary", sectionKey: "platform", tip: "Enrichment pool, TI HTTP, logging, artifacts/replay, audit WORM, AMQP broker."},
    {
        id: "features",
        label: "Feature flags",
        icon: Flag,
        iconColor: "text-primary",
        sectionKey: "features",
        tip: "Read-only env feature flags (FEATURE_*) — QA Health, collab, related knobs. Not runtime toggles.",
    },
    {id: "ui", label: "UI prefs", icon: Desktop, iconColor: "text-primary", sectionKey: "ui", tip: "Browser-local presentation prefs (tables, refresh, help tips) — not stored in Mongo."},
];

const VALID_TAB_IDS = new Set(SETTINGS_TABS.map((t) => t.id));
const DEFAULT_TAB = "llm";

const FIELD_TO_TAB = {
    llm_provider: "llm",
    llm_model: "llm",
    llm_temperature: "llm",
    llm_token_budget_monthly: "llm",
    llm_fallback_enabled: "llm",
    llm_fallback_provider: "llm",
    llm_fallback_model: "llm",
    llm_manual_route: "llm",
    anthropic_api_key: "llm",
    openai_api_key: "llm",
    gemini_api_key: "llm",
    groq_api_key: "llm",
    grounding_threshold: "pipeline",
    hitl_severity_min: "pipeline",
    auto_approve_grounding_min: "pipeline",
    correlation_window_minutes: "pipeline",
    cohere_rerank_enabled: "pipeline",
    llm_technique_refine: "pipeline",
    llm_redact_iocs: "pipeline",
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
    max_enrich_iocs: "platform",
    enrich_concurrency: "platform",
    parse_concurrency: "platform",
    ti_http_timeout: "platform",
    ti_http_retries: "platform",
    ti_http_backoff_base: "platform",
    ti_circuit_failures: "platform",
    ti_circuit_cooldown_seconds: "platform",
    log_format: "platform",
    log_file_format: "platform",
    log_level: "platform",
    log_to_file: "platform",
    log_archive_enabled: "platform",
    log_archive_retain_days: "platform",
    job_artifacts_enabled: "platform",
    job_payload_retain: "platform",
    job_artifacts_retain_hours: "platform",
    audit_worm_enabled: "platform",
    audit_siem_webhook_url: "platform",
    job_broker_enabled: "platform",
    job_broker_url: "platform",
    job_broker_queue: "platform",
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
    if (id === "enterprise" || id === "ops" || id === "logging") return "platform";
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
    audit_siem_webhook_url: "",
    job_broker_url: "",
};

function formFromSettings(d) {
    return {
        llm_provider: normalizeProvider(d?.llm_provider),
        llm_model: d?.llm_model || "claude-sonnet-4-6",
        llm_temperature: d?.llm_temperature ?? 0.2,
        llm_token_budget_monthly: d?.llm_token_budget_monthly ?? 0,
        llm_fallback_enabled: d?.llm_fallback_enabled !== false,
        llm_fallback_provider: normalizeProvider(d?.llm_fallback_provider || "anthropic"),
        llm_fallback_model: d?.llm_fallback_model || "",
        llm_manual_route: d?.llm_manual_route === "backup" ? "backup" : "primary",
        grounding_threshold: d?.grounding_threshold ?? 0.7,
        hitl_severity_min: d?.hitl_severity_min || "high",
        auto_approve_grounding_min: d?.auto_approve_grounding_min ?? 0.85,
        correlation_window_minutes: d?.correlation_window_minutes ?? 30,
        session_timeout_hours: d?.session_timeout_hours ?? 24,
        failed_login_lockout: d?.failed_login_lockout ?? 5,
        incident_retention_days: d?.incident_retention_days ?? 90,
        enrichment_cache_ttl_hours: d?.enrichment_cache_ttl_hours ?? 24,
        cohere_rerank_enabled: d?.cohere_rerank_enabled !== false,
        llm_technique_refine: Boolean(d?.llm_technique_refine),
        llm_redact_iocs: Boolean(d?.llm_redact_iocs),
        max_enrich_iocs: d?.max_enrich_iocs ?? FACTORY_OPS.max_enrich_iocs,
        enrich_concurrency: d?.enrich_concurrency ?? FACTORY_OPS.enrich_concurrency,
        parse_concurrency: d?.parse_concurrency ?? FACTORY_OPS.parse_concurrency,
        ti_http_timeout: d?.ti_http_timeout ?? FACTORY_OPS.ti_http_timeout,
        ti_http_retries: d?.ti_http_retries ?? FACTORY_OPS.ti_http_retries,
        ti_http_backoff_base: d?.ti_http_backoff_base ?? FACTORY_OPS.ti_http_backoff_base,
        ti_circuit_failures: d?.ti_circuit_failures ?? FACTORY_OPS.ti_circuit_failures,
        ti_circuit_cooldown_seconds: d?.ti_circuit_cooldown_seconds ?? FACTORY_OPS.ti_circuit_cooldown_seconds,
        log_format: d?.log_format || FACTORY_OPS.log_format,
        log_file_format: d?.log_file_format ?? FACTORY_OPS.log_file_format,
        log_level: d?.log_level || FACTORY_OPS.log_level,
        log_to_file: d?.log_to_file !== false,
        log_archive_enabled: d?.log_archive_enabled !== false,
        log_archive_retain_days: d?.log_archive_retain_days ?? FACTORY_OPS.log_archive_retain_days,
        job_artifacts_enabled: Boolean(d?.job_artifacts_enabled),
        job_payload_retain: Boolean(d?.job_payload_retain),
        job_artifacts_retain_hours: d?.job_artifacts_retain_hours ?? FACTORY_OPS.job_artifacts_retain_hours,
        audit_worm_enabled: d?.audit_worm_enabled !== false,
        job_broker_enabled: Boolean(d?.job_broker_enabled),
        job_broker_queue: d?.job_broker_queue || FACTORY_OPS.job_broker_queue,
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

const PROVIDER_LABELS = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    gemini: "Gemini",
    groq: "Groq",
};

export default function Settings() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [settings, setSettings] = useState(null);
    const [settingsLoadMode, setSettingsLoadMode] = useState("loading"); // loading | live | fallback
    const [form, setForm] = useState({});
    const [initialForm, setInitialForm] = useState({});
    const [busy, setBusy] = useState(false);
    const [showLlmAdvanced, setShowLlmAdvanced] = useState(false);
    const [customModelMode, setCustomModelMode] = useState(false);
    // Catalog lives in React state so provider/model UI always re-renders correctly
    const [llmCatalog, setLlmCatalog] = useState(() => cloneModelCatalog());
    const [llmEffective, setLlmEffective] = useState(null);
    const [routeHealth, setRouteHealth] = useState({primary: null, backup: null});
    const [tiEditField, setTiEditField] = useState(null);
    const [showSlackHelp, setShowSlackHelp] = useState(false);
    const [uiPrefs, setUiPrefs] = useState(() => loadUiPrefs());
    const [uiPrefsDirty, setUiPrefsDirty] = useState(false);

    // Threat Intel Table Sorting State
    const [tiSortCol, setTiSortCol] = useState("label");
    const [tiSortDir, setTiSortDir] = useState("asc");

    const activeTab = normalizeTabId(searchParams.get("tab") || DEFAULT_TAB);

    const hydrate = useCallback((d, cat = null) => {
        const raw = d?.settings || d || {};
        setSettings(raw);
        const parsed = formFromSettings(raw);
        setForm(parsed);
        setInitialForm(parsed);
        if (cat) {
            const ids = modelIdsForProvider(cat, parsed.llm_provider);
            setCustomModelMode(Boolean(parsed.llm_model && !ids.includes(parsed.llm_model)));
        }
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

    const activeProvider = normalizeProvider(form.llm_provider);

    const modelMeta = useMemo(
        () => getModelMeta(activeProvider),
        [activeProvider],
    );

    const issues = useMemo(
        () => validateSettingsForm(form, settings || {}, llmCatalog),
        [form, settings, llmCatalog],
    );

    const modelGroups = useMemo(
        () => modelsByTier(llmCatalog, activeProvider),
        [llmCatalog, activeProvider],
    );

    const curatedModelIds = useMemo(
        () => modelIdsForProvider(llmCatalog, activeProvider),
        [llmCatalog, activeProvider],
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

    // Load catalog + settings once on mount (do NOT re-run when settings changes —
    // that previously reset the form while the user was editing the provider).
    useEffect(() => {
        let isSubscribed = true;
        let resolved = false;
        const fallback = {
            llm_provider: "anthropic",
            llm_model: "claude-sonnet-4-6",
            llm_temperature: 0.2,
            llm_token_budget_monthly: 0,
            llm_fallback_enabled: true,
            llm_fallback_provider: "anthropic",
            llm_fallback_model: "",
            llm_manual_route: "primary",
            grounding_threshold: 0.7,
            hitl_severity_min: "high",
            auto_approve_grounding_min: 0.85,
            correlation_window_minutes: 30,
            session_timeout_hours: 24,
            failed_login_lockout: 5,
            incident_retention_days: 90,
            enrichment_cache_ttl_hours: 24,
            cohere_rerank_enabled: true,
            llm_technique_refine: false,
            llm_redact_iocs: false,
        };

        const safetyTimer = setTimeout(() => {
            if (isSubscribed && !resolved) {
                hydrate(fallback, cloneModelCatalog());
                setSettingsLoadMode("fallback");
            }
        }, 2500);

        Promise.all([
            api.get("/settings/llm-catalog").catch(() => ({data: null})),
            api.get("/settings").catch(() => null),
            api.get("/settings/llm-routes").catch(() => null),
        ]).then(([catRes, settingsRes, routesRes]) => {
            if (!isSubscribed) return;
            resolved = true;
            clearTimeout(safetyTimer);
            const cat = catalogFromApi(catRes?.data || null);
            setLlmCatalog(cat);
            if (settingsRes?.data) {
                hydrate(settingsRes.data, cat);
                setSettingsLoadMode("live");
                if (settingsRes.data.llm_effective_provider) {
                    setLlmEffective({
                        provider: settingsRes.data.llm_effective_provider,
                        model: settingsRes.data.llm_effective_model,
                        via: settingsRes.data.llm_via_fallback,
                        ts: settingsRes.data.llm_effective_ts,
                    });
                }
            } else {
                hydrate(fallback, cat);
                setSettingsLoadMode("fallback");
            }
            if (routesRes?.data) {
                const d = routesRes.data;
                setRouteHealth({
                    primary: d.primary?.latency_ms != null || d.primary?.probe_ok != null
                        ? {
                            ok: d.primary.probe_ok,
                            latency_ms: d.primary.latency_ms,
                            provider: d.primary.provider,
                            model: d.primary.model,
                        }
                        : null,
                    backup: d.backup?.latency_ms != null || d.backup?.probe_ok != null
                        ? {
                            ok: d.backup.probe_ok,
                            latency_ms: d.backup.latency_ms,
                            provider: d.backup.provider,
                            model: d.backup.model,
                        }
                        : null,
                });
            }
        });

        return () => {
            isSubscribed = false;
            clearTimeout(safetyTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
        if (activeTab === "features") {
            toast.message("Feature flags are env-only", {
                description: "Edit backend/.env (FEATURE_*) and restart the API. This tab is read-only.",
            });
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
        const payload = buildSettingsPayload({
            ...form,
            llm_provider: activeProvider,
            llm_model: String(form.llm_model || "").trim(),
        });
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
            toast.success(
                alsoUi
                    ? "Settings + UI prefs saved"
                    : `Settings saved (${activeProvider} / ${payload.llm_model})`,
            );
            const r = await api.get("/settings");
            hydrate(r.data, llmCatalog);
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
        const p = normalizeProvider(provider);
        setCustomModelMode(false);
        const nextModel = defaultModelForProvider(p, llmCatalog);
        setForm((f) => ({
            ...f,
            llm_provider: p,
            llm_model: nextModel || f.llm_model,
        }));
    };

    const pk = PROVIDER_KEY[activeProvider] || PROVIDER_KEY.anthropic;
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
                    <HelpTip
                        title="Settings"
                        body="Admin configuration for LLM providers, HiTL gates, threat-intel keys, alerts, retention, and browser UI prefs. Hover (i) on fields for impact notes. Secret values stay blank after load — leave blank to keep existing."
                        how="GET/PUT /settings · UI prefs in localStorage (actira_ui_prefs_v1). show_help_tips toggles HelpTip icons platform-wide."
                        testid="tip-settings-page"
                    />
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

            {settingsLoadMode === "fallback" && (
                <AlertBanner
                    variant="warning"
                    title="Using offline defaults — server settings not loaded"
                    description="GET /settings failed or timed out. Values below are browser defaults, not necessarily what is saved on the API. Fix connectivity and refresh before saving."
                    testid="settings-fallback-banner"
                    className="mb-4"
                />
            )}

            <ConfigHealth issues={issues} onJumpToField={jumpToField}/>

            <div
                className="flex flex-wrap gap-1 mb-6 p-1.5 rounded-card border border-border bg-card shadow-sm sticky top-14 z-20 items-stretch"
                data-testid="settings-tabs"
                role="tablist"
                aria-label="Settings categories"
            >
                {SETTINGS_TABS.map(({id, label, icon: Icon, tip: tabTip}) => {
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
                            title={tabTip || label}
                            onClick={() => setActiveTab(id)}
                            className={`inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-medium leading-none tracking-tight transition-colors min-h-[2.375rem] ${
                                active
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                            }`}
                        >
                            <Icon
                                size={15}
                                weight={active ? "bold" : "regular"}
                                className={`shrink-0 ${active ? "text-primary-foreground" : "text-muted-foreground"}`}
                                aria-hidden
                            />
                            <span className="whitespace-nowrap">{label}</span>
                            {badgeN > 0 && (
                                <span
                                    className={`min-w-[1.15rem] h-[1.15rem] px-1 rounded text-[10px] font-mono font-semibold grid place-items-center leading-none ${
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
                                <Field
                                    label="Provider"
                                    fieldKey="llm_provider"
                                    matchesRecommended={isRec(form, "llm_provider")}
                                    warning={issueByField.llm_provider}
                                    hint="Click a provider to switch. Model list updates immediately."
                                >
                                    <div
                                        className="flex flex-wrap gap-2"
                                        role="radiogroup"
                                        aria-label="LLM provider"
                                        data-testid="llm-provider"
                                    >
                                        {SUPPORTED_PROVIDERS.map((p) => {
                                            const active = activeProvider === p;
                                            const keyMeta = PROVIDER_KEY[p];
                                            const hasKey = keyMeta && settings?.[keyMeta.flag];
                                            return (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={active}
                                                    data-testid={`llm-provider-${p}`}
                                                    onClick={() => onProviderChange(p)}
                                                    className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-[13px] font-semibold border transition-colors ${
                                                        active
                                                            ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                                            : "bg-card text-foreground border-border hover:bg-muted hover:border-primary/40"
                                                    }`}
                                                >
                                                    {PROVIDER_LABELS[p] || p}
                                                    <span
                                                        className={`text-[10px] font-mono font-normal ${
                                                            active ? "text-primary-foreground/80" : "text-muted-foreground"
                                                        }`}
                                                    >
                                                        {hasKey ? "key✓" : "no key"}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {/* Hidden select keeps accessibility + form parity */}
                                    <select
                                        id="llm_provider"
                                        className="sr-only"
                                        tabIndex={-1}
                                        aria-hidden
                                        value={activeProvider}
                                        onChange={(e) => onProviderChange(e.target.value)}
                                    >
                                        {SUPPORTED_PROVIDERS.map((p) => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </Field>

                                {llmEffective?.provider && (
                                    <div
                                        className="rounded-lg border theme-border px-3 py-2 text-xs mb-3"
                                        data-testid="llm-effective-strip"
                                    >
                                        <span className="font-semibold text-foreground">Last effective LLM: </span>
                                        <span className="font-mono text-primary">
                                            {llmEffective.provider}/{llmEffective.model || "—"}
                                        </span>
                                        {llmEffective.via ? (
                                            <span className="ml-2 text-[10px] uppercase font-bold text-warning">via fallback</span>
                                        ) : (
                                            <span className="ml-2 text-[10px] uppercase font-bold text-success">primary</span>
                                        )}
                                        {llmEffective.ts && (
                                            <span className="ml-2 text-muted-foreground font-mono text-[10px]">
                                                {llmEffective.ts}
                                            </span>
                                        )}
                                    </div>
                                )}
                                <Field
                                    key={`model-field-${activeProvider}`}
                                    label={`Model (${PROVIDER_LABELS[activeProvider] || activeProvider})`}
                                    fieldKey="llm_model"
                                    meta={modelMeta}
                                    tipKey={`llm_model-${activeProvider}`}
                                    matchesRecommended={isRec(form, "llm_model") && isRec(form, "llm_provider")}
                                    warning={issueByField.llm_model}
                                    hint={`${curatedModelIds.length} curated models · free + paid · experimental tagged · custom ID allowed`}
                                >
                                    {!customModelMode ? (
                                        <select
                                            id="llm_model"
                                            data-testid="llm-model"
                                            className={`${inputCls(issueByField.llm_model?.level === "error")} font-mono text-[12px]`}
                                            value={curatedModelIds.includes(form.llm_model) ? form.llm_model : ""}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v === "__custom__") {
                                                    setCustomModelMode(true);
                                                    return;
                                                }
                                                if (v) upd("llm_model", v);
                                            }}
                                        >
                                            {!curatedModelIds.includes(form.llm_model) && (
                                                <option value="" disabled>
                                                    {form.llm_model ? `Select model (current: ${form.llm_model})` : "Select a model…"}
                                                </option>
                                            )}
                                            {modelGroups.free.length > 0 && (
                                                <optgroup label={`Free tier (${modelGroups.free.length})`}>
                                                    {modelGroups.free.map((m) => (
                                                        <option key={m.id} value={m.id}>
                                                            {modelLabel(llmCatalog, activeProvider, m.id)}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            {modelGroups.paid.length > 0 && (
                                                <optgroup label={`Paid (${modelGroups.paid.length})`}>
                                                    {modelGroups.paid.map((m) => (
                                                        <option key={m.id} value={m.id}>
                                                            {modelLabel(llmCatalog, activeProvider, m.id)}
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            )}
                                            <option value="__custom__">Custom model ID…</option>
                                        </select>
                                    ) : (
                                        <div className="space-y-1.5">
                                            <input
                                                id="llm_model"
                                                data-testid="llm-model-custom"
                                                type="text"
                                                className={`${inputCls(issueByField.llm_model?.level === "error")} font-mono text-[12px]`}
                                                value={form.llm_model || ""}
                                                placeholder="e.g. gpt-5.6-sol or gemini-3.6-flash"
                                                onChange={(e) => upd("llm_model", e.target.value)}
                                                autoComplete="off"
                                            />
                                            <button
                                                type="button"
                                                className="text-[11px] text-primary hover:underline"
                                                data-testid="llm-model-use-list"
                                                onClick={() => {
                                                    setCustomModelMode(false);
                                                    if (!curatedModelIds.includes(form.llm_model)) {
                                                        upd("llm_model", defaultModelForProvider(activeProvider, llmCatalog));
                                                    }
                                                }}
                                            >
                                                ← Back to curated list
                                            </button>
                                        </div>
                                    )}
                                    {!customModelMode && form.llm_model && !curatedModelIds.includes(form.llm_model) && (
                                        <button
                                            type="button"
                                            className="mt-1 text-[11px] text-warning hover:underline"
                                            onClick={() => setCustomModelMode(true)}
                                        >
                                            Current value “{form.llm_model}” is custom — click to edit
                                        </button>
                                    )}
                                </Field>

                                <Field
                                    label={`${PROVIDER_LABELS[activeProvider] || activeProvider} API key (active)`}
                                    fieldKey={pk.field}
                                    warning={issueByField[pk.field]}
                                    hint={
                                        settings?.[pk.flag]
                                            ? "✓ configured — leave blank to keep"
                                            : "Required for live playbooks on this provider"
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

                                <div
                                    className="rounded-lg border border-border bg-muted/30 p-3 space-y-2"
                                    data-testid="llm-all-keys"
                                >
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        All provider keys (for fallback)
                                    </div>
                                    <p className="text-[11px] text-muted-foreground m-0">
                                        Store keys for multiple providers so cross-provider fallback can run when the primary fails.
                                        Leave blank to keep an existing secret.
                                    </p>
                                    <div className={`${FIELD_GRID_2}`}>
                                        {SUPPORTED_PROVIDERS.map((prov) => {
                                            const meta = PROVIDER_KEY[prov];
                                            return (
                                                <Field
                                                    key={prov}
                                                    label={`${PROVIDER_LABELS[prov] || prov}${prov === activeProvider ? " ★" : ""}`}
                                                    fieldKey={meta.field}
                                                    hint={settings?.[meta.flag] ? "✓ configured" : "not set"}
                                                >
                                                    <input
                                                        data-testid={`key-all-${meta.field}`}
                                                        type="password"
                                                        placeholder={meta.ph}
                                                        autoComplete="off"
                                                        className={`${inputCls(false)} font-mono text-[12px]`}
                                                        value={form[meta.field] || ""}
                                                        onChange={(e) => upd(meta.field, e.target.value)}
                                                    />
                                                </Field>
                                            );
                                        })}
                                    </div>
                                </div>

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
                                    {showLlmAdvanced ? "Hide advanced" : "Advanced (temperature, budget, fallback)"}
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
                                        <Field
                                            label="Provider fallback"
                                            fieldKey="llm_fallback_enabled"
                                            matchesRecommended={isRec(form, "llm_fallback_enabled")}
                                            hint="On primary failure, try other providers that have keys"
                                        >
                                            <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                                                <input
                                                    data-testid="llm-fallback-enabled"
                                                    type="checkbox"
                                                    className="rounded border-border"
                                                    checked={form.llm_fallback_enabled !== false}
                                                    onChange={(e) => upd("llm_fallback_enabled", e.target.checked)}
                                                />
                                                Enable cross-provider fallback
                                            </label>
                                        </Field>
                                        <Field
                                            label="Preferred fallback provider"
                                            fieldKey="llm_fallback_provider"
                                            matchesRecommended={isRec(form, "llm_fallback_provider")}
                                            hint="Tried first after primary (automatic); also used for manual backup route"
                                        >
                                            <select
                                                data-testid="llm-fallback-provider"
                                                className={`${inputCls(false)} font-mono text-[12px]`}
                                                value={form.llm_fallback_provider || "anthropic"}
                                                onChange={(e) => {
                                                    const p = e.target.value;
                                                    upd("llm_fallback_provider", p);
                                                    if (p && p !== "none") {
                                                        const def = defaultModelForProvider(p, llmCatalog);
                                                        if (def) upd("llm_fallback_model", def);
                                                    }
                                                }}
                                                disabled={form.llm_fallback_enabled === false}
                                            >
                                                {SUPPORTED_PROVIDERS.map((p) => (
                                                    <option key={p} value={p}>{PROVIDER_LABELS[p] || p}</option>
                                                ))}
                                                <option value="none">none (disable preferred)</option>
                                            </select>
                                        </Field>
                                        <Field
                                            label="Preferred fallback model"
                                            fieldKey="llm_fallback_model"
                                            hint="Model used on automatic fallback and manual backup route"
                                        >
                                            <input
                                                data-testid="llm-fallback-model"
                                                type="text"
                                                className={`${inputCls(false)} font-mono text-[12px]`}
                                                value={form.llm_fallback_model || ""}
                                                placeholder={
                                                    form.llm_fallback_provider === "groq"
                                                        ? "openai/gpt-oss-120b"
                                                        : "provider default if empty"
                                                }
                                                onChange={(e) => upd("llm_fallback_model", e.target.value)}
                                                disabled={form.llm_fallback_enabled === false || form.llm_fallback_provider === "none"}
                                            />
                                        </Field>
                                        <Field
                                            label="Manual routing"
                                            fieldKey="llm_manual_route"
                                            hint="primary = normal auto path; backup = force preferred fallback stack for all LLM calls"
                                        >
                                            <select
                                                data-testid="llm-manual-route"
                                                className={`${inputCls(false)} font-mono text-[12px]`}
                                                value={form.llm_manual_route || "primary"}
                                                onChange={(e) => upd("llm_manual_route", e.target.value)}
                                            >
                                                <option value="primary">Primary (+ automatic fallback on error)</option>
                                                <option value="backup">Manual backup only (preferred fallback)</option>
                                            </select>
                                        </Field>
                                        <div className="md:col-span-2 xl:col-span-3 flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                data-testid="llm-test-connection"
                                                disabled={busy}
                                                onClick={async () => {
                                                    setBusy(true);
                                                    try {
                                                        const res = await api.post("/settings/test-llm", {route: "primary"});
                                                        const d = res.data || {};
                                                        setRouteHealth((rh) => ({
                                                            ...rh,
                                                            primary: {
                                                                ok: true,
                                                                latency_ms: d.latency_ms,
                                                                provider: d.provider,
                                                                model: d.model,
                                                            },
                                                        }));
                                                        toast.success(
                                                            `Primary ok: ${d.provider}/${d.model} (${d.latency_ms}ms)`,
                                                        );
                                                    } catch (e) {
                                                        const detail = e?.response?.data?.detail;
                                                        const msg = typeof detail === "object"
                                                            ? (detail.message || detail.error || JSON.stringify(detail))
                                                            : (e?.userMessage || e?.message || "LLM test failed");
                                                        setRouteHealth((rh) => ({
                                                            ...rh,
                                                            primary: {
                                                                ok: false,
                                                                latency_ms: typeof detail === "object" ? detail.latency_ms : null,
                                                                error: msg,
                                                            },
                                                        }));
                                                        toast.error(msg);
                                                    } finally {
                                                        setBusy(false);
                                                    }
                                                }}
                                                className="soc-btn-secondary !py-1.5 !px-3 !text-[12px]"
                                                title="Test primary provider/model"
                                            >
                                                Test primary
                                            </button>
                                            <button
                                                type="button"
                                                data-testid="llm-test-backup"
                                                disabled={busy || form.llm_fallback_enabled === false}
                                                onClick={async () => {
                                                    setBusy(true);
                                                    try {
                                                        const res = await api.post("/settings/test-llm", {route: "backup"});
                                                        const d = res.data || {};
                                                        setRouteHealth((rh) => ({
                                                            ...rh,
                                                            backup: {
                                                                ok: true,
                                                                latency_ms: d.latency_ms,
                                                                provider: d.provider,
                                                                model: d.model,
                                                            },
                                                        }));
                                                        toast.success(
                                                            `Backup ok: ${d.provider}/${d.model} (${d.latency_ms}ms)`,
                                                        );
                                                    } catch (e) {
                                                        const detail = e?.response?.data?.detail;
                                                        const msg = typeof detail === "object"
                                                            ? (detail.message || detail.error || JSON.stringify(detail))
                                                            : (e?.userMessage || e?.message || "Backup LLM test failed");
                                                        setRouteHealth((rh) => ({
                                                            ...rh,
                                                            backup: {
                                                                ok: false,
                                                                latency_ms: typeof detail === "object" ? detail.latency_ms : null,
                                                                error: msg,
                                                            },
                                                        }));
                                                        toast.error(msg);
                                                    } finally {
                                                        setBusy(false);
                                                    }
                                                }}
                                                className="soc-btn-secondary !py-1.5 !px-3 !text-[12px]"
                                                title="Test preferred fallback provider/model (manual backup path)"
                                            >
                                                Test backup
                                            </button>
                                            <button
                                                type="button"
                                                data-testid="llm-one-click-backup-settings"
                                                disabled={busy}
                                                onClick={async () => {
                                                    const next = form.llm_manual_route === "backup" ? "primary" : "backup";
                                                    upd("llm_manual_route", next);
                                                    setBusy(true);
                                                    try {
                                                        await api.put("/settings", {llm_manual_route: next});
                                                        setInitialForm((prev) => ({...prev, llm_manual_route: next}));
                                                        toast.success(
                                                            next === "backup"
                                                                ? "Saved: manual routing = backup"
                                                                : "Saved: manual routing = primary",
                                                        );
                                                    } catch (e) {
                                                        toast.error(e?.userMessage || e?.message || "Could not save route");
                                                    } finally {
                                                        setBusy(false);
                                                    }
                                                }}
                                                className="soc-btn-secondary !py-1.5 !px-3 !text-[12px]"
                                                title="Save one-click manual backup/primary without full form save"
                                            >
                                                {form.llm_manual_route === "backup" ? "Save → primary" : "Save → backup"}
                                            </button>
                                            <span className="text-[10px] text-muted-foreground">
                                                Save settings first for model/key changes. Automatic = chain on error; Manual routing = force backup.
                                            </span>
                                        </div>
                                        {/* Route health strip (latency chips) */}
                                        <div
                                            className="md:col-span-2 xl:col-span-3 flex flex-wrap gap-2"
                                            data-testid="llm-route-health"
                                        >
                                            <span
                                                className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border ${
                                                    routeHealth?.primary?.ok === true
                                                        ? "border-success/40 text-success"
                                                        : routeHealth?.primary?.ok === false
                                                          ? "border-error/40 text-error"
                                                          : "theme-border text-muted-foreground"
                                                }`}
                                                data-testid="llm-primary-health-chip"
                                            >
                                                Primary
                                                {routeHealth?.primary?.latency_ms != null
                                                    ? ` · ${routeHealth.primary.latency_ms}ms`
                                                    : " · not probed"}
                                                {routeHealth?.primary?.ok === true ? " · ok" : ""}
                                                {routeHealth?.primary?.ok === false ? " · fail" : ""}
                                            </span>
                                            <span
                                                className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border ${
                                                    routeHealth?.backup?.ok === true
                                                        ? "border-success/40 text-success"
                                                        : routeHealth?.backup?.ok === false
                                                          ? "border-error/40 text-error"
                                                          : "theme-border text-muted-foreground"
                                                }`}
                                                data-testid="llm-backup-health-chip"
                                            >
                                                Backup
                                                {routeHealth?.backup?.latency_ms != null
                                                    ? ` · ${routeHealth.backup.latency_ms}ms`
                                                    : " · not probed"}
                                                {routeHealth?.backup?.ok === true ? " · ok" : ""}
                                                {routeHealth?.backup?.ok === false ? " · fail" : ""}
                                            </span>
                                            <span
                                                className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-md border ${
                                                    form.llm_manual_route === "backup"
                                                        ? "border-warning/40 text-warning"
                                                        : "border-success/40 text-success"
                                                }`}
                                                data-testid="llm-active-route-chip"
                                            >
                                                Active route · {form.llm_manual_route === "backup" ? "backup" : "primary"}
                                            </span>
                                        </div>
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
                                        <dd className="font-mono text-primary font-semibold uppercase">{activeProvider || "—"}</dd>
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
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">Cross-provider fallback</dt>
                                        <dd className={form.llm_fallback_enabled !== false ? "text-success font-medium" : "text-muted-foreground"}>
                                            {form.llm_fallback_enabled === false ? "Off" : "On"}
                                        </dd>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">Preferred fallback</dt>
                                        <dd className="font-mono text-xs uppercase">
                                            {form.llm_fallback_enabled === false
                                                ? "—"
                                                : (form.llm_fallback_provider || "anthropic")}
                                        </dd>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">Fallback model</dt>
                                        <dd className="font-mono text-xs text-right break-all max-w-[60%]" data-testid="llm-fallback-model-display">
                                            {form.llm_fallback_enabled === false
                                                ? "—"
                                                : (form.llm_fallback_model || "(provider default)")}
                                        </dd>
                                    </div>
                                    <div className="flex items-start justify-between gap-3">
                                        <dt className="text-muted-foreground">Manual routing</dt>
                                        <dd className="font-mono text-xs uppercase" data-testid="llm-manual-route-display">
                                            {form.llm_manual_route === "backup" ? "backup" : "primary"}
                                        </dd>
                                    </div>
                                </dl>
                                {/* Groq backup strip — free-tier / latency path in FALLBACK_PROVIDER_ORDER */}
                                <div
                                    className="mt-4 rounded-lg border theme-border px-3 py-2.5 space-y-1.5"
                                    data-testid="llm-groq-backup-panel"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                            Groq backup
                                        </span>
                                        <span
                                            className={`text-[10px] font-mono font-bold uppercase ${
                                                settings?.has_groq ? "text-success" : "text-warning"
                                            }`}
                                        >
                                            {settings?.has_groq ? "key ready" : "no key"}
                                        </span>
                                    </div>
                                    <div className="flex items-start justify-between gap-3 text-[11px]">
                                        <span className="text-muted-foreground">Default backup model</span>
                                        <span className="font-mono text-right break-all max-w-[65%]" data-testid="llm-groq-backup-model">
                                            openai/gpt-oss-120b
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed m-0">
                                        Groq sits last in the automatic fallback chain (Anthropic → OpenAI → Gemini → Groq)
                                        when cross-provider fallback is enabled and a key is stored. Free-tier default:
                                        <span className="font-mono"> openai/gpt-oss-120b</span>
                                        {" "}(also 20b / compound models in the catalog). Low-latency demos; not
                                        prompt-cache friendly for multi-step playbooks.
                                    </p>
                                    {activeProvider === "groq" && (
                                        <p className="text-[11px] text-primary font-medium m-0">
                                            Groq is the active primary provider
                                            {form.llm_model ? (
                                                <> · model <span className="font-mono">{form.llm_model}</span></>
                                            ) : null}
                                            .
                                        </p>
                                    )}
                                    {form.llm_fallback_provider === "groq" && form.llm_fallback_enabled !== false && (
                                        <p className="text-[11px] text-warning font-medium m-0">
                                            Groq is your preferred fallback after the primary fails.
                                        </p>
                                    )}
                                    {llmEffective?.provider === "groq" && llmEffective?.via && (
                                        <p className="text-[11px] text-warning font-medium m-0" data-testid="llm-groq-via-fallback">
                                            Last effective call used Groq via fallback.
                                        </p>
                                    )}
                                </div>
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
                                    <Field
                                        label="LLM ATT&CK technique refine"
                                        fieldKey="llm_technique_refine"
                                        matchesRecommended={isRec(form, "llm_technique_refine")}
                                        hint="Optional second LLM pass to refine mapped techniques (allow-list validated; costs tokens)"
                                    >
                                        <select
                                            data-testid="llm-technique-refine"
                                            className={inputCls(false)}
                                            value={form.llm_technique_refine ? "true" : "false"}
                                            onChange={(e) => upd("llm_technique_refine", e.target.value === "true")}
                                        >
                                            <option value="false">Off (heuristic mapping only)</option>
                                            <option value="true">On (extra LLM refine)</option>
                                        </select>
                                    </Field>
                                    <Field
                                        label="Redact IoCs in LLM prompts"
                                        fieldKey="llm_redact_iocs"
                                        matchesRecommended={isRec(form, "llm_redact_iocs")}
                                        hint="Partially masks IPs/emails sent to the model (AI Investigator / privacy). Recommended for production."
                                    >
                                        <select
                                            data-testid="llm-redact-iocs"
                                            className={inputCls(false)}
                                            value={form.llm_redact_iocs ? "true" : "false"}
                                            onChange={(e) => upd("llm_redact_iocs", e.target.value === "true")}
                                        >
                                            <option value="false">Off (full IoC values in prompts)</option>
                                            <option value="true">On (partial redaction)</option>
                                        </select>
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
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">ATT&CK LLM refine</dt>
                                        <dd className={form.llm_technique_refine ? "text-warning" : "text-muted-foreground"}>
                                            {form.llm_technique_refine ? "On" : "Off"}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between gap-3">
                                        <dt className="text-muted-foreground">IoC redact in LLM</dt>
                                        <dd className={form.llm_redact_iocs ? "text-success" : "text-muted-foreground"}>
                                            {form.llm_redact_iocs ? "On" : "Off"}
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

                {/* ——— Platform / enterprise ——— */}
                {activeTab === "platform" && (
                    <div className="space-y-6" data-testid="settings-platform">
                        <CollapsibleSection
                            title="Enrichment & TI HTTP"
                            subtitle="Concurrency, timeouts, retries, circuit breakers"
                            icon={Lightning}
                            defaultOpen
                        >
                            <div className={FIELD_GRID_2}>
                                <Field label="Max IoCs to enrich" fieldKey="max_enrich_iocs" matchesRecommended={isRec(form, "max_enrich_iocs")}>
                                    <input data-testid="max-enrich-iocs" type="number" min={1} max={200} className={`${inputCls(false)} font-mono`}
                                           value={form.max_enrich_iocs ?? 50}
                                           onChange={(e) => upd("max_enrich_iocs", parseInt(e.target.value, 10) || 50)}/>
                                </Field>
                                <Field label="Enrich concurrency" fieldKey="enrich_concurrency" matchesRecommended={isRec(form, "enrich_concurrency")}>
                                    <input data-testid="enrich-concurrency" type="number" min={1} max={32} className={`${inputCls(false)} font-mono`}
                                           value={form.enrich_concurrency ?? 8}
                                           onChange={(e) => upd("enrich_concurrency", parseInt(e.target.value, 10) || 8)}/>
                                </Field>
                                <Field label="Parse concurrency" fieldKey="parse_concurrency" matchesRecommended={isRec(form, "parse_concurrency")}>
                                    <input data-testid="parse-concurrency" type="number" min={1} max={16} className={`${inputCls(false)} font-mono`}
                                           value={form.parse_concurrency ?? 4}
                                           onChange={(e) => upd("parse_concurrency", parseInt(e.target.value, 10) || 4)}/>
                                </Field>
                                <Field label="TI timeout (s)" fieldKey="ti_http_timeout" matchesRecommended={isRec(form, "ti_http_timeout")}>
                                    <input data-testid="ti-http-timeout" type="number" min={1} step={0.5} className={`${inputCls(false)} font-mono`}
                                           value={form.ti_http_timeout ?? 8}
                                           onChange={(e) => upd("ti_http_timeout", parseFloat(e.target.value) || 8)}/>
                                </Field>
                                <Field label="TI retries" fieldKey="ti_http_retries" matchesRecommended={isRec(form, "ti_http_retries")}>
                                    <input data-testid="ti-http-retries" type="number" min={0} max={8} className={`${inputCls(false)} font-mono`}
                                           value={form.ti_http_retries ?? 2}
                                           onChange={(e) => upd("ti_http_retries", parseInt(e.target.value, 10) || 0)}/>
                                </Field>
                                <Field label="TI backoff base (s)" fieldKey="ti_http_backoff_base" matchesRecommended={isRec(form, "ti_http_backoff_base")}>
                                    <input data-testid="ti-http-backoff" type="number" min={0.05} step={0.05} className={`${inputCls(false)} font-mono`}
                                           value={form.ti_http_backoff_base ?? 0.4}
                                           onChange={(e) => upd("ti_http_backoff_base", parseFloat(e.target.value) || 0.4)}/>
                                </Field>
                                <Field label="TI circuit failures" fieldKey="ti_circuit_failures" matchesRecommended={isRec(form, "ti_circuit_failures")}>
                                    <input data-testid="ti-circuit-failures" type="number" min={1} className={`${inputCls(false)} font-mono`}
                                           value={form.ti_circuit_failures ?? 5}
                                           onChange={(e) => upd("ti_circuit_failures", parseInt(e.target.value, 10) || 5)}/>
                                </Field>
                                <Field label="TI circuit cooldown (s)" fieldKey="ti_circuit_cooldown_seconds" matchesRecommended={isRec(form, "ti_circuit_cooldown_seconds")}>
                                    <input data-testid="ti-circuit-cooldown" type="number" min={5} className={`${inputCls(false)} font-mono`}
                                           value={form.ti_circuit_cooldown_seconds ?? 60}
                                           onChange={(e) => upd("ti_circuit_cooldown_seconds", parseInt(e.target.value, 10) || 60)}/>
                                </Field>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Logging & archival" subtitle="Format, file, archive lifecycle" icon={HardDrives} defaultOpen>
                            <div className={FIELD_GRID_2}>
                                <Field label="Log format" fieldKey="log_format" matchesRecommended={isRec(form, "log_format")}>
                                    <select data-testid="log-format" className={inputCls(false)} value={form.log_format || "text"}
                                            onChange={(e) => upd("log_format", e.target.value)}>
                                        <option value="text">text (human greps)</option>
                                        <option value="json">json (SIEM / ELK)</option>
                                    </select>
                                </Field>
                                <Field label="Log file format" fieldKey="log_file_format" matchesRecommended={isRec(form, "log_file_format")}>
                                    <select data-testid="log-file-format" className={inputCls(false)} value={form.log_file_format ?? ""}
                                            onChange={(e) => upd("log_file_format", e.target.value)}>
                                        <option value="">same as log format</option>
                                        <option value="text">text</option>
                                        <option value="json">json</option>
                                    </select>
                                </Field>
                                <Field label="Log level" fieldKey="log_level" matchesRecommended={isRec(form, "log_level")}>
                                    <select data-testid="log-level" className={inputCls(false)} value={form.log_level || "INFO"}
                                            onChange={(e) => upd("log_level", e.target.value)}>
                                        {["DEBUG", "INFO", "WARNING", "ERROR"].map((lv) => (
                                            <option key={lv} value={lv}>{lv}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="Write logs to file" fieldKey="log_to_file" matchesRecommended={isRec(form, "log_to_file")}>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input data-testid="log-to-file" type="checkbox" checked={form.log_to_file !== false}
                                               onChange={(e) => upd("log_to_file", e.target.checked)}/>
                                        Enabled (backend/logs)
                                    </label>
                                </Field>
                                <Field label="Log archival" fieldKey="log_archive_enabled" matchesRecommended={isRec(form, "log_archive_enabled")}>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input data-testid="log-archive-enabled" type="checkbox" checked={form.log_archive_enabled !== false}
                                               onChange={(e) => upd("log_archive_enabled", e.target.checked)}/>
                                        Copy into dated archive folders
                                    </label>
                                </Field>
                                <Field label="Archive retain (days)" fieldKey="log_archive_retain_days" matchesRecommended={isRec(form, "log_archive_retain_days")}>
                                    <input data-testid="log-archive-days" type="number" min={1} className={`${inputCls(false)} font-mono`}
                                           value={form.log_archive_retain_days ?? 30}
                                           onChange={(e) => upd("log_archive_retain_days", parseInt(e.target.value, 10) || 30)}/>
                                </Field>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Jobs, artifacts & replay" subtitle="Pipeline snapshots and payload retain" icon={Sliders}>
                            <div className={FIELD_GRID_2}>
                                <Field label="Job artifacts" fieldKey="job_artifacts_enabled" matchesRecommended={isRec(form, "job_artifacts_enabled")}>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input data-testid="job-artifacts-enabled" type="checkbox" checked={Boolean(form.job_artifacts_enabled)}
                                               onChange={(e) => upd("job_artifacts_enabled", e.target.checked)}/>
                                        Store stage snapshots (parse / enrich / playbook)
                                    </label>
                                </Field>
                                <Field label="Retain upload payloads" fieldKey="job_payload_retain" matchesRecommended={isRec(form, "job_payload_retain")}>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input data-testid="job-payload-retain" type="checkbox" checked={Boolean(form.job_payload_retain)}
                                               onChange={(e) => upd("job_payload_retain", e.target.checked)}/>
                                        Keep raw uploads after success (full re-queue)
                                    </label>
                                </Field>
                                <Field label="Artifact retain (hours)" fieldKey="job_artifacts_retain_hours" matchesRecommended={isRec(form, "job_artifacts_retain_hours")}>
                                    <input data-testid="job-artifacts-hours" type="number" min={1} className={`${inputCls(false)} font-mono`}
                                           value={form.job_artifacts_retain_hours ?? 168}
                                           onChange={(e) => upd("job_artifacts_retain_hours", parseInt(e.target.value, 10) || 168)}/>
                                </Field>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="Audit WORM & SIEM" subtitle="Append-only export and webhook" icon={Shield}>
                            <div className={FIELD_GRID_2}>
                                <Field label="Audit WORM file" fieldKey="audit_worm_enabled" matchesRecommended={isRec(form, "audit_worm_enabled")}>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input data-testid="audit-worm-enabled" type="checkbox" checked={form.audit_worm_enabled !== false}
                                               onChange={(e) => upd("audit_worm_enabled", e.target.checked)}/>
                                        Append every audit event to JSONL
                                    </label>
                                </Field>
                                <Field label="SIEM webhook URL" fieldKey="audit_siem_webhook_url">
                                    <input
                                        data-testid="audit-siem-webhook"
                                        type="password"
                                        autoComplete="off"
                                        placeholder={settings?.has_audit_siem_webhook ? "•••• configured — paste to replace" : "https://siem.example/hooks/…"}
                                        className={inputCls(false)}
                                        value={form.audit_siem_webhook_url || ""}
                                        onChange={(e) => upd("audit_siem_webhook_url", e.target.value)}
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                        Secret · never returned after save · blank keeps existing
                                    </p>
                                </Field>
                            </div>
                        </CollapsibleSection>

                        <CollapsibleSection title="AMQP job broker" subtitle="Optional wake-up path for multi-worker" icon={GearSix}>
                            <div className={FIELD_GRID_2}>
                                <Field label="Enable broker" fieldKey="job_broker_enabled" matchesRecommended={isRec(form, "job_broker_enabled")}>
                                    <label className="flex items-center gap-2 text-sm">
                                        <input data-testid="job-broker-enabled" type="checkbox" checked={Boolean(form.job_broker_enabled)}
                                               onChange={(e) => upd("job_broker_enabled", e.target.checked)}/>
                                        Publish AMQP wake-ups (Mongo still claims jobs)
                                    </label>
                                </Field>
                                <Field label="Queue name" fieldKey="job_broker_queue" matchesRecommended={isRec(form, "job_broker_queue")}>
                                    <input data-testid="job-broker-queue" type="text" className={`${inputCls(false)} font-mono`}
                                           value={form.job_broker_queue || "actira.jobs"}
                                           onChange={(e) => upd("job_broker_queue", e.target.value)}/>
                                </Field>
                                <Field label="AMQP URL" fieldKey="job_broker_url">
                                    <input
                                        data-testid="job-broker-url"
                                        type="password"
                                        autoComplete="off"
                                        placeholder={settings?.has_job_broker_url ? "•••• configured — paste to replace" : "amqp://guest:guest@localhost:5672/"}
                                        className={inputCls(false)}
                                        value={form.job_broker_url || ""}
                                        onChange={(e) => upd("job_broker_url", e.target.value)}
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-1">
                                        Requires <code className="font-mono">pip install pika</code> · secret field
                                    </p>
                                </Field>
                            </div>
                        </CollapsibleSection>
                    </div>
                )}

                {/* ——— Feature flags (env, read-only) ——— */}
                {activeTab === "features" && (
                    <div data-testid="settings-feature-flags">
                        <FeatureFlagsPanel/>
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
                {activeTab === "features" ? (
                    <>
                        <span className="text-[12px] text-muted-foreground mr-auto">
                            Feature flags are env-only — not saved from Settings
                        </span>
                        <button
                            type="button"
                            data-testid="feature-flags-footer-refresh"
                            className="soc-btn-secondary"
                            onClick={() => {
                                window.dispatchEvent(new Event("actira-refresh-feature-flags"));
                                toast.message("Set FEATURE_*=1 in backend/.env, restart API, then Refresh", {
                                    description: "Example: FEATURE_QA_HEALTH_CENTER=1",
                                    duration: 10000,
                                });
                            }}
                        >
                            <ArrowCounterClockwise size={14}/>
                            Refresh flags
                        </button>
                    </>
                ) : activeTab === "ui" ? (
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