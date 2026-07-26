/**
 * Settings field metadata: factory defaults vs ACTIRA recommended profile.
 * Recommended values follow memory/WEEKLY_DISCUSSIONS.md (Anthropic for prompt
 * cache, strict HiTL/grounding, production-leaning security/retention).
 *
 * Used by Admin → Settings for:
 *  - per-field help popovers (default + recommended + impact)
 *  - section purpose / when / best practices / implications
 *  - provider-aware model tips (dynamic with provider dropdown)
 *  - client-side validation warnings
 *  - “Apply recommended” / factory profile buttons
 */

export const FACTORY_OPS = {
    llm_provider: "anthropic",
    llm_model: "claude-sonnet-4-6",
    llm_temperature: 0.2,
    llm_token_budget_monthly: 0,
    llm_fallback_enabled: true,
    llm_fallback_provider: "anthropic",
    grounding_threshold: 0.7,
    hitl_severity_min: "critical",
    auto_approve_grounding_min: 0.9,
    correlation_window_minutes: 30,
    session_timeout_hours: 24,
    failed_login_lockout: 5,
    incident_retention_days: 90,
    enrichment_cache_ttl_hours: 24,
    cohere_rerank_enabled: true,
    email_alerts_to: "",
};

/** Production / demo-quality recommended ops (secrets never auto-filled). */
export const RECOMMENDED_OPS = {
    llm_provider: "anthropic",
    llm_model: "claude-sonnet-4-6",
    llm_temperature: 0.15,
    llm_token_budget_monthly: 500000,
    llm_fallback_enabled: true,
    llm_fallback_provider: "anthropic",
    grounding_threshold: 0.75,
    hitl_severity_min: "high",
    auto_approve_grounding_min: 0.92,
    correlation_window_minutes: 45,
    session_timeout_hours: 8,
    failed_login_lockout: 5,
    incident_retention_days: 180,
    enrichment_cache_ttl_hours: 12,
    cohere_rerank_enabled: true,
    email_alerts_to: "",
};

/** Short bullets for the Recommended profile panel in Settings. */
export const RECOMMENDED_PROFILE_BULLETS = [
    "Anthropic + claude-sonnet-4-6 (prompt-cache friendly multi-step playbooks)",
    "Temperature 0.15 · monthly soft budget 500k tokens",
    "Grounding ≥ 0.75 · HiTL from high · auto-approve ≥ 0.92 · correlation 45m",
    "Session 8h · lockout 5 · incident retention 180d · enrichment cache 12h",
    "API keys / Slack webhook kept — email left unchanged",
];

/**
 * Why the ACTIRA recommended profile is a good default for most SOC teams.
 * Shown on the Recommended tab as a short rationale (1–2 sentences).
 */
export const RECOMMENDED_PROFILE_WHY =
    "Balances playbook quality and cost (Anthropic cache + low temp) with safer automation " +
    "(stricter grounding/HiTL) and production-leaning session/retention posture — without touching your API keys.";

/**
 * Supported providers in the UI (must match backend models.Settings / llm_provider).
 * Ollama / OpenRouter are listed as planned so the help UI can explain gaps.
 */
/**
 * Full catalog with free/paid tiers (must match backend llm_provider.MODEL_CATALOG).
 * Settings page prefers live GET /settings/llm-catalog when available.
 * @type {Record<string, Array<{id: string, tier: 'free'|'paid', role?: string, label?: string}>>}
 */
export const MODEL_CATALOG = {
    anthropic: [
        {id: "claude-sonnet-4-6", tier: "paid", role: "default", label: "Claude Sonnet 4.6 (recommended)"},
        {id: "claude-opus-4-6", tier: "paid", role: "flagship", label: "Claude Opus 4.6"},
        {id: "claude-opus-4-8", tier: "paid", role: "flagship", label: "Claude Opus 4.8"},
        {id: "claude-opus-4-5", tier: "paid", role: "flagship", label: "Claude Opus 4.5"},
        {id: "claude-opus-4-1", tier: "paid", role: "flagship", label: "Claude Opus 4.1"},
        {id: "claude-sonnet-4-5", tier: "paid", role: "mid", label: "Claude Sonnet 4.5"},
        {id: "claude-sonnet-4-0", tier: "paid", role: "prior", label: "Claude Sonnet 4"},
        {id: "claude-sonnet-4", tier: "paid", role: "prior", label: "Claude Sonnet 4 (alias)"},
        {id: "claude-opus-4", tier: "paid", role: "prior", label: "Claude Opus 4"},
        {id: "claude-haiku-4-5", tier: "paid", role: "fast", label: "Claude Haiku 4.5 (cheap/fast)"},
        {id: "claude-3-7-sonnet-latest", tier: "paid", role: "prior", label: "Claude 3.7 Sonnet (latest alias)"},
        {id: "claude-3-7-sonnet-20250219", tier: "paid", role: "prior", label: "Claude 3.7 Sonnet (dated)"},
        {id: "claude-3-5-sonnet-latest", tier: "paid", role: "prior", label: "Claude 3.5 Sonnet (latest alias)"},
        {id: "claude-3-5-sonnet-20241022", tier: "paid", role: "prior", label: "Claude 3.5 Sonnet (20241022)"},
        {id: "claude-3-5-haiku-latest", tier: "paid", role: "fast", label: "Claude 3.5 Haiku (latest alias)"},
        {id: "claude-3-5-haiku-20241022", tier: "paid", role: "fast", label: "Claude 3.5 Haiku (20241022)"},
        {id: "claude-3-opus-latest", tier: "paid", role: "prior", label: "Claude 3 Opus (latest alias)"},
        {id: "claude-3-haiku-20240307", tier: "paid", role: "legacy", label: "Claude 3 Haiku (legacy)"},
    ],
    openai: [
        {id: "gpt-5.6-terra", tier: "paid", role: "default", label: "GPT-5.6 Terra (balanced)"},
        {id: "gpt-5.6-sol", tier: "paid", role: "flagship", label: "GPT-5.6 Sol (frontier)"},
        {id: "gpt-5.6-luna", tier: "paid", role: "fast", label: "GPT-5.6 Luna (cost)"},
        {id: "gpt-5.6", tier: "paid", role: "flagship", label: "GPT-5.6 (alias)"},
        {id: "gpt-5.5", tier: "paid", role: "flagship", label: "GPT-5.5"},
        {id: "gpt-5.5-pro", tier: "paid", role: "flagship", label: "GPT-5.5 Pro"},
        {id: "gpt-5.5-instant", tier: "paid", role: "fast", label: "GPT-5.5 Instant"},
        {id: "gpt-5.4", tier: "paid", role: "mid", label: "GPT-5.4"},
        {id: "gpt-5.4-mini", tier: "paid", role: "fast", label: "GPT-5.4 mini"},
        {id: "gpt-5.4-pro", tier: "paid", role: "flagship", label: "GPT-5.4 pro"},
        {id: "gpt-5.3", tier: "paid", role: "prior", label: "GPT-5.3"},
        {id: "gpt-5.2", tier: "paid", role: "prior", label: "GPT-5.2"},
        {id: "gpt-5.1", tier: "paid", role: "prior", label: "GPT-5.1"},
        {id: "gpt-5", tier: "paid", role: "prior", label: "GPT-5"},
        {id: "gpt-5-mini", tier: "paid", role: "fast", label: "GPT-5 mini"},
        {id: "gpt-5-nano", tier: "paid", role: "fast", label: "GPT-5 nano"},
        {id: "gpt-5-codex", tier: "paid", role: "code", label: "GPT-5 Codex"},
        {id: "gpt-4.1", tier: "paid", role: "prior", label: "GPT-4.1"},
        {id: "gpt-4.1-mini", tier: "paid", role: "fast", label: "GPT-4.1 mini"},
        {id: "gpt-4.1-nano", tier: "paid", role: "fast", label: "GPT-4.1 nano"},
        {id: "gpt-4o", tier: "paid", role: "prior", label: "GPT-4o"},
        {id: "gpt-4o-mini", tier: "paid", role: "fast", label: "GPT-4o mini"},
        {id: "chatgpt-4o-latest", tier: "paid", role: "prior", label: "ChatGPT-4o latest"},
        {id: "o3", tier: "paid", role: "reasoning", label: "o3 (reasoning)"},
        {id: "o3-mini", tier: "paid", role: "reasoning", label: "o3-mini"},
        {id: "o3-pro", tier: "paid", role: "reasoning", label: "o3-pro"},
        {id: "o4-mini", tier: "paid", role: "reasoning", label: "o4-mini"},
        {id: "o1", tier: "paid", role: "reasoning", label: "o1 (reasoning)"},
        {id: "o1-mini", tier: "paid", role: "reasoning", label: "o1-mini"},
        {id: "o1-pro", tier: "paid", role: "reasoning", label: "o1-pro"},
    ],
    gemini: [
        {id: "gemini-3.1-pro-preview", tier: "paid", role: "default", label: "Gemini 3.1 Pro (preview)"},
        {id: "gemini-3-pro-preview", tier: "paid", role: "flagship", label: "Gemini 3 Pro (preview)"},
        {id: "gemini-3.6-flash", tier: "free", role: "fast", label: "Gemini 3.6 Flash (free tier)"},
        {id: "gemini-3.5-flash", tier: "free", role: "fast", label: "Gemini 3.5 Flash (free tier)"},
        {id: "gemini-3.5-flash-lite", tier: "free", role: "fast", label: "Gemini 3.5 Flash-Lite (free tier)"},
        {id: "gemini-3.1-flash-lite", tier: "free", role: "fast", label: "Gemini 3.1 Flash-Lite (free tier)"},
        {id: "gemini-3-flash-preview", tier: "free", role: "fast", label: "Gemini 3 Flash (preview / free)"},
        {id: "gemini-2.5-pro", tier: "free", role: "prior", label: "Gemini 2.5 Pro (limited free)"},
        {id: "gemini-2.5-flash", tier: "free", role: "fast", label: "Gemini 2.5 Flash (free tier)"},
        {id: "gemini-2.5-flash-lite", tier: "free", role: "fast", label: "Gemini 2.5 Flash-Lite (free tier)"},
        {id: "gemini-2.0-flash", tier: "free", role: "fast", label: "Gemini 2.0 Flash (free tier)"},
        {id: "gemini-2.0-flash-lite", tier: "free", role: "fast", label: "Gemini 2.0 Flash-Lite (free tier)"},
        {id: "gemini-1.5-pro", tier: "paid", role: "legacy", label: "Gemini 1.5 Pro (legacy)"},
        {id: "gemini-1.5-flash", tier: "free", role: "legacy", label: "Gemini 1.5 Flash (legacy)"},
    ],
    groq: [
        {id: "openai/gpt-oss-120b", tier: "free", role: "default", label: "GPT-OSS 120B (free tier)"},
        {id: "openai/gpt-oss-20b", tier: "free", role: "fast", label: "GPT-OSS 20B (free tier)"},
        {id: "openai/gpt-oss-safeguard-20b", tier: "free", role: "mid", label: "GPT-OSS Safeguard 20B"},
        {id: "llama-3.3-70b-versatile", tier: "free", role: "prior", label: "Llama 3.3 70B Versatile"},
        {id: "llama-3.1-8b-instant", tier: "free", role: "fast", label: "Llama 3.1 8B Instant"},
        {id: "meta-llama/llama-4-scout-17b-16e-instruct", tier: "free", role: "fast", label: "Llama 4 Scout 17B"},
        {id: "meta-llama/llama-4-maverick-17b-128e-instruct", tier: "free", role: "mid", label: "Llama 4 Maverick 17B"},
        {id: "qwen/qwen3.6-27b", tier: "free", role: "mid", label: "Qwen3.6 27B"},
        {id: "qwen/qwen3-32b", tier: "free", role: "prior", label: "Qwen3 32B"},
        {id: "moonshotai/kimi-k2-instruct", tier: "free", role: "mid", label: "Kimi K2 Instruct"},
        {id: "groq/compound", tier: "free", role: "agent", label: "Groq Compound (agentic)"},
        {id: "groq/compound-mini", tier: "free", role: "agent", label: "Groq Compound Mini"},
        {id: "deepseek-r1-distill-llama-70b", tier: "free", role: "reasoning", label: "DeepSeek R1 Distill Llama 70B"},
        {id: "gemma2-9b-it", tier: "free", role: "fast", label: "Gemma 2 9B IT"},
    ],
};

/** Static flat id lists (fallback when live catalog not loaded). */
export const PROVIDER_MODELS = Object.fromEntries(
    Object.entries(MODEL_CATALOG).map(([p, models]) => [p, models.map((m) => m.id)]),
);

/** Providers selectable today (backend-supported). */
export const SUPPORTED_PROVIDERS = ["anthropic", "openai", "gemini", "groq"];

/**
 * Deep-clone static catalog into React state (never mutate module exports).
 * @returns {Record<string, Array<{id: string, tier: string, role?: string, label?: string}>>}
 */
export function cloneModelCatalog() {
    return Object.fromEntries(
        Object.entries(MODEL_CATALOG).map(([p, rows]) => [
            p,
            rows.map((r) => ({...r})),
        ]),
    );
}

/**
 * Build catalog from GET /settings/llm-catalog (pure — does not mutate module globals).
 * @param {object|null} payload
 * @returns {Record<string, Array<{id: string, tier: string, role?: string, label?: string}>>}
 */
export function catalogFromApi(payload) {
    const base = cloneModelCatalog();
    if (!payload || typeof payload !== "object") return base;

    const cat = payload.catalog;
    if (cat && typeof cat === "object") {
        for (const [p, rows] of Object.entries(cat)) {
            if (!Array.isArray(rows) || !rows.length) continue;
            base[p] = rows.map((r) =>
                typeof r === "string"
                    ? {id: r, tier: "paid", role: "mid", label: r}
                    : {
                        id: r.id || String(r),
                        tier: r.tier || "paid",
                        role: r.role || "mid",
                        label: r.label || r.id || String(r),
                    },
            );
        }
        return base;
    }
    if (payload.models && typeof payload.models === "object") {
        for (const [p, ids] of Object.entries(payload.models)) {
            if (!Array.isArray(ids) || !ids.length) continue;
            const freeSet = new Set(payload.free_models?.[p] || []);
            base[p] = ids.map((id) => ({
                id,
                tier: freeSet.has(id) ? "free" : "paid",
                role: "mid",
                label: id,
            }));
        }
    }
    return base;
}

/** @deprecated use catalogFromApi — kept so older imports do not crash */
export function applyLiveCatalog(payload) {
    return catalogFromApi(payload);
}

/** Flat id list for a provider from a catalog object. */
export function modelIdsForProvider(catalog, provider) {
    return (catalog?.[provider] || []).map((m) => m.id);
}

/** @param {object} catalog @param {string} provider @param {string} modelId */
export function modelTier(catalogOrProvider, modelId, maybeId) {
    // Support (provider, id) legacy and (catalog, provider, id)
    let catalog = MODEL_CATALOG;
    let provider = catalogOrProvider;
    let id = modelId;
    if (maybeId !== undefined) {
        catalog = catalogOrProvider || MODEL_CATALOG;
        provider = modelId;
        id = maybeId;
    }
    const row = (catalog[provider] || []).find((m) => m.id === id);
    return row?.tier || "custom";
}

/** @param {object} catalog @param {string} provider @param {string} modelId */
export function modelLabel(catalogOrProvider, modelId, maybeId) {
    let catalog = MODEL_CATALOG;
    let provider = catalogOrProvider;
    let id = modelId;
    if (maybeId !== undefined) {
        catalog = catalogOrProvider || MODEL_CATALOG;
        provider = modelId;
        id = maybeId;
    }
    const row = (catalog[provider] || []).find((m) => m.id === id);
    if (!row) return `${id} · custom`;
    const badge = row.tier === "free" ? " · free" : " · paid";
    return `${row.label || row.id}${badge}`;
}

/** Models grouped by free/paid for optgroups. */
export function modelsByTier(catalogOrProvider, maybeProvider) {
    let rows;
    if (maybeProvider !== undefined) {
        rows = catalogOrProvider?.[maybeProvider] || [];
    } else {
        rows = MODEL_CATALOG[catalogOrProvider] || [];
    }
    return {
        free: rows.filter((m) => m.tier === "free"),
        paid: rows.filter((m) => m.tier !== "free"),
    };
}

/**
 * Default model for a provider (first curated entry).
 * @param {string} provider
 * @param {object} [catalog]
 */
export function defaultModelForProvider(provider, catalog) {
    const cat = catalog || MODEL_CATALOG;
    const list = cat[provider];
    if (Array.isArray(list) && list.length) {
        return typeof list[0] === "string" ? list[0] : list[0].id;
    }
    return FACTORY_OPS.llm_model;
}

/** Normalize provider string from API / UI. */
export function normalizeProvider(raw) {
    const p = String(raw || "anthropic").trim().toLowerCase();
    return SUPPORTED_PROVIDERS.includes(p) ? p : "anthropic";
}

/**
 * Planned providers (not wired in backend yet). Shown in help, not the dropdown.
 */
export const PLANNED_PROVIDERS = {
    ollama: {
        title: "Ollama (planned)",
        summary:
            "Local open models via Ollama — no cloud API key, full data residency. Not yet wired into ACTIRA’s LLM layer.",
        models: ["llama3.1:70b", "mistral", "qwen2.5"],
        requirements: "Local Ollama daemon + sufficient GPU/RAM; base URL env (future).",
    },
    openrouter: {
        title: "OpenRouter (planned)",
        summary:
            "Multi-vendor router (one key → many models). Useful for A/B model testing. Not yet wired.",
        models: ["anthropic/claude-sonnet-4", "openai/gpt-4.1", "meta-llama/…"],
        requirements: "OPENROUTER_API_KEY + model slug format vendor/model (future).",
    },
};

/**
 * Section-level guidance (card header + expandable panel).
 * @typedef {{
 *   title: string,
 *   purpose: string,
 *   when: string,
 *   bestPractices: string,
 *   implications: string,
 *   notes: string,
 *   default: string,
 *   recommended: string,
 *   whyRecommended: string,
 * }} SectionMeta
 * @type {Record<string, SectionMeta>}
 */
export const SECTION_META = {
    llm: {
        title: "LLM Provider",
        purpose:
            "Choose which cloud model generates IR playbooks and AI investigations for every incident.",
        when:
            "Change when you switch cloud accounts, hit rate limits, or need lower cost / lower latency for demos. Leave alone during active incident response if playbooks are already stable.",
        bestPractices:
            "Prefer Anthropic + claude-sonnet-4-6 for multi-step pipelines (prompt caching on the stable system prefix). Keep temperature ≤0.2 for structured JSON. Set a monthly soft budget so runaway loops are visible. Only one provider is active at a time — store keys for others but they are unused until selected.",
        implications:
            "Cost: paid frontier models (Opus / Pro / gpt-5.4) raise $ per incident. Free-tier options (Groq open models, Gemini Flash) are rate-limited. Latency: Groq is fastest but no Anthropic-style cache. Missing key → cross-provider fallback (if enabled) then template playbooks.",
        notes:
            "API keys stay blank after load — “✓ configured” means a secret is stored. Dropdown labels show free vs paid. Advanced: provider fallback + Test LLM. Ollama/OpenRouter planned.",
        default: "anthropic · claude-sonnet-4-6 · temp 0.2 · budget unlimited · fallback on",
        recommended: "anthropic · claude-sonnet-4-6 · temp 0.15 · budget 500k · fallback on",
        whyRecommended:
            "Claude Sonnet with a low temperature and soft budget gives stable playbook JSON, multi-step prompt-cache savings, and visible spend; free Groq/Gemini models remain available for demos.",
    },
    pipeline: {
        title: "Pipeline & HiTL",
        purpose:
            "Control how strictly playbooks must cite the knowledge base and when human analysts must review.",
        when:
            "Tune after you see too many false HiTL queues (lower thresholds carefully) or after a bad auto-approve (raise grounding / severity floor). Widen correlation only when multi-file campaigns span >30 minutes.",
        bestPractices:
            "Never set auto-approve above 0.95 unless you have a senior always online — critical never auto-approves regardless. Raise grounding toward 0.8 for production IR; drop toward 0.65 only for noisy demo logs. Keep HiTL floor at high or critical — medium floods the review queue.",
        implications:
            "Higher grounding + HiTL high = more review load, safer IR. Low grounding + critical-only = faster demos, higher risk of weak citations shipping. Long correlation windows merge slow attacks but can glue unrelated noise into one narrative. CPU/LLM cost rises with re-runs when many jobs fail grounding.",
        notes:
            "Grounding scores measure valid KB citation coverage on playbook steps. Below threshold → force HiTL. Severity floor always queues high-risk incidents. Auto-approve only applies below critical when grounding is high enough.",
        default: "grounding 0.7 · HiTL critical · auto-approve 0.9 · window 30m",
        recommended: "grounding 0.75 · HiTL high · auto-approve 0.92 · window 45m",
        whyRecommended:
            "Slightly stricter grounding and HiTL-from-high catch weak citations and serious incidents, while a higher auto-approve bar and 45m window keep noise manageable for real campaigns.",
    },
    threat_intel: {
        title: "Threat Intelligence",
        purpose:
            "Wire live CTI APIs for IP, hash, domain, and host enrichment during log ingest.",
        when:
            "Enable live keys when moving from demo mock scores to real reputation. Disable (clear key / leave mock) if a vendor is rate-limiting or for air-gapped demos.",
        bestPractices:
            "Start with AbuseIPDB + VirusTotal + OTX (strong free/cheap stack). Add GreyNoise to reduce scanner noise, ThreatFox for malware IoCs, Shodan for exposure context. Never paste production keys into shared screenshots. Leave fields blank on save to keep existing secrets.",
        implications:
            "Live mode increases external API cost and latency on ingest. Mock mode is free and offline-safe but scores are synthetic. Keys are never returned by the API — only has_* flags. Existing incidents keep prior enrichment until re-ingest.",
        notes:
            "Empty keys run mock enrichment (safe for demos). Paste a key to switch that source to live on the next ingest.",
        default: "all empty → mock mode",
        recommended: "set AbuseIPDB, VirusTotal, OTX (others optional)",
        whyRecommended:
            "Those three cover IP abuse, multi-type reputation, and community pulses at low cost — enough live CTI for most labs without buying every vendor.",
    },
    notifications: {
        title: "Notifications",
        purpose:
            "Route critical and HiTL alerts to the SOC channel and on-call mailbox.",
        when:
            "Configure before production use or live tabletop exercises. Skip for pure local demos if you do not want alert noise.",
        bestPractices:
            "Use a dedicated Slack Incoming Webhook for a SOC channel (not personal DMs). Set a real on-call mailbox. SMTP is optional — default email uses a zero-config HTTP gateway. Rotate webhooks if leaked. Factory reset clears email; Apply recommended never invents an address.",
        implications:
            "Misconfigured webhooks fail silently or spam the wrong channel. Email is non-secret and reloads after save. Without SMTP, first send to a new address may require clicking a gateway activation link. Optional SMTP_* in backend/.env upgrades delivery for production.",
        notes:
            "Slack webhook is secret (blank after load). Alert email is non-secret. No SMTP host/user/password needed for Send test email.",
        default: "Slack empty · email empty · no SMTP",
        recommended: "Slack SOC webhook · real soc-oncall@ address · SMTP optional",
        whyRecommended:
            "A shared SOC channel plus a real on-call mailbox means critical and HiTL events reach people who can act — not only the person who configured the demo.",
    },
    security: {
        title: "Security",
        purpose:
            "Session lifetime and brute-force lockout for analyst browser logins.",
        when:
            "Tighten for shared SOC workstations or compliance. Loosen slightly only for classroom demos with frequent re-login friction.",
        bestPractices:
            "Prefer 8h sessions in production; 24h is the demo default. Keep lockout at 3–5 attempts. Changing timeout applies to new logins (existing JWTs expire at old lifetime).",
        implications:
            "Long sessions increase risk on unattended terminals. Aggressive lockout (1–2) can lock analysts out during password typos. Lockout tracking is process-local (resets if the API process restarts).",
        notes:
            "Session timeout is JWT lifetime. Failed login lockout thresholds temporary lockout after N bad passwords.",
        default: "session 24h · lockout after 5 failures",
        recommended: "session 8h · lockout after 5 failures",
        whyRecommended:
            "An 8-hour session matches a SOC shift and limits abandoned-browser risk; five failures still blocks brute force without locking analysts out on typos.",
    },
    retention: {
        title: "Data Retention",
        purpose:
            "How long incidents stay available and how long TI enrichment results may be reused.",
        when:
            "Align with your org’s retention policy and CTI freshness needs. Shorten cache when investigating fast-changing campaigns; lengthen incident history for golden-set benchmarking.",
        bestPractices:
            "180d incident retention for IR audit/demo history. 12h enrichment cache balances freshness vs vendor rate limits. Mock enrichment ignores real cache backends today.",
        implications:
            "Longer retention = more disk/Mongo growth. Short cache = more CTI API calls and cost. Purge jobs may enforce retention later — treat the number as policy intent now.",
        notes:
            "Incident retention is the policy horizon. Enrichment cache TTL trades fresher CTI vs API cost.",
        default: "incidents 90d · enrichment cache 24h",
        recommended: "incidents 180d · enrichment cache 12h",
        whyRecommended:
            "Six months of incidents supports audit and golden-set work; a 12-hour CTI cache stays fresher for active campaigns without thrashing vendor APIs every ingest.",
    },
    ui: {
        title: "Dashboard & tables",
        purpose:
            "Browser-local presentation defaults: how many rows dashboards show, default sorts/filters, refresh intervals, and UX toggles (previews, help icons, widgets).",
        when:
            "Tune per workstation after onboarding or when SOC screens feel too sparse/dense. These never leave the browser and do not change Mongo pipeline settings.",
        bestPractices:
            "Keep help icons and hover previews on for junior analysts. Prefer hybrid KB search. Use a mild dashboard refresh (≈60s) on wallboards; leave 0 on quiet analyst laptops. Table view for dense review queues.",
        implications:
            "Higher row caps and refresh rates increase API traffic. Aggressive default filters can hide cases until cleared. Compact tables save space but reduce scanability.",
        notes:
            "Stored in localStorage (actira_ui_prefs_v1). Reset defaults restores factory UI values; Apply recommended UI uses the ACTIRA presentation profile. Ops thresholds (grounding, HiTL) stay on Detection / Access tabs.",
        default: "recent 8 · analytics 30d · cards review · no dash refresh",
        recommended: "recent 12 · analytics 30d · table review · 60s dash refresh · help+previews on",
        whyRecommended:
            "A slightly larger recent sample, sortable table review, and gentle auto-refresh give shift leads better situational awareness without hammering the API.",
    },
};

/**
 * Rich model field tooltip content keyed by LLM provider.
 * When the provider dropdown changes, Model help must use this map.
 *
 * @typedef {{
 *   id: string,
 *   role: string,
 *   context: string,
 *   cost: string,
 *   speed: string,
 *   quality: string,
 * }} ModelOption
 * @typedef {{
 *   title: string,
 *   default: string,
 *   recommended: string,
 *   whyRecommended: string,
 *   notes: string,
 *   models: ModelOption[],
 *   contextWindow: string,
 *   estimatedCost: string,
 *   performance: string,
 *   useCases: string,
 *   limitations: string,
 * }} ModelProviderMeta
 */
export const MODEL_META_BY_PROVIDER = {
    anthropic: {
        title: "Model (Anthropic)",
        default: "claude-sonnet-4-6",
        recommended: "claude-sonnet-4-6",
        whyRecommended:
            "Best quality-to-cost balance for structured IR JSON, and it benefits most from Anthropic prompt caching on multi-step playbook runs.",
        notes:
            "Claude powers structured IR playbooks with Anthropic prompt caching on the stable system prefix (cheaper multi-step runs).",
        models: MODEL_CATALOG.anthropic.map((m) => ({
            id: m.id,
            role: m.label || m.role || m.id,
            context: "~200k tokens",
            cost: m.tier === "free" ? "free tier" : "$$$ paid",
            speed: m.role === "fast" ? "Fast" : m.role === "flagship" ? "Slower" : "Medium",
            quality: m.role === "flagship" ? "Highest" : "High",
        })),
        contextWindow: "~200k tokens (model-dependent; large enough for multi-file IR context + KB snippets)",
        estimatedCost: "Sonnet: mid-tier $/M tokens; Opus ~2–3× Sonnet; Haiku fraction of Sonnet. Prompt cache hits cut multi-step cost significantly.",
        performance: "Sonnet balances quality vs latency. Opus is slower/costlier. Haiku is snappy for tabletop demos.",
        useCases: "Production IR playbooks (Sonnet), complex multi-stage attacks (Opus), live workshops & bulk reprocessing (Haiku).",
        limitations: "Requires ANTHROPIC_API_KEY (paid). Network egress to Anthropic API.",
    },
    openai: {
        title: "Model (OpenAI)",
        default: "gpt-5.6-terra",
        recommended: "gpt-5.6-terra (or gpt-5.6-luna for cost; Sol for max quality)",
        whyRecommended:
            "GPT-5.6 Terra balances fidelity and cost for IR JSON; Sol for hardest cases, Luna for volume. Custom IDs are allowed if your org pins another slug.",
        notes:
            "OpenAI path when your org standardizes on the OpenAI ecosystem. No Anthropic-style cache_control — multi-step pipelines re-send the full system prompt each call. All OpenAI models are paid.",
        models: MODEL_CATALOG.openai.map((m) => ({
            id: m.id,
            role: m.label || m.role || m.id,
            context: "Large",
            cost: "$$$ paid",
            speed: m.role === "fast" ? "Faster" : m.role === "flagship" ? "Medium–slow" : "Medium",
            quality: m.role === "flagship" || m.role === "default" ? "Top-tier" : "Strong",
        })),
        contextWindow: "Large context (model family defaults; sufficient for IR + citations)",
        estimatedCost: "Flagship models cost more per incident than mini. No Anthropic prompt-cache discount on this path.",
        performance: "Mini favors throughput; flagship favors deeper reasoning and structured fidelity.",
        useCases: "Orgs already on OpenAI billing, Azure OpenAI-adjacent workflows, GPT-only compliance choices.",
        limitations: "Requires OPENAI_API_KEY (paid). Prefer Anthropic if multi-step prompt-cache savings matter.",
    },
    gemini: {
        title: "Model (Gemini)",
        default: "gemini-3.1-pro-preview",
        recommended: "gemini-3.1-pro-preview (Flash free tier for demos)",
        whyRecommended:
            "Pro-class Gemini handles long log packs and structured steps more reliably; switch to Flash free-tier models for demos and volume.",
        notes:
            "Google Gemini via the official google-genai SDK. Flash models often run on Google free quota; Pro is paid.",
        models: MODEL_CATALOG.gemini.map((m) => ({
            id: m.id,
            role: m.label || m.role || m.id,
            context: "Very large",
            cost: m.tier === "free" ? "free tier" : "$$ paid",
            speed: m.role === "fast" ? "Fast" : "Medium",
            quality: m.role === "default" || m.role === "prior" ? "Strong" : "Good for demos",
        })),
        contextWindow: "Very large context windows (family strength) — helpful for long log batches",
        estimatedCost: "Flash free-tier is cost-efficient (quota limits); Pro is higher for harder IR.",
        performance: "Flash = speed; Pro = quality. Structured JSON quality varies — keep temperature ≤0.2.",
        useCases: "Free-tier demos on Flash; Google Cloud / Gemini Pro for production depth.",
        limitations: "Requires GEMINI_API_KEY. Preview model IDs may rename; free tier is rate-limited.",
    },
    groq: {
        title: "Model (Groq)",
        default: "openai/gpt-oss-120b",
        recommended: "openai/gpt-oss-120b (free tier demos)",
        whyRecommended:
            "GPT-OSS 120B on Groq free tier is the best current demo default: fast, open-weight, and not on the Llama deprecation path.",
        notes:
            "Groq free developer tier (rate-limited, no card required) covers all listed open-weight models. Excellent for demos; less reliable for citation-heavy production playbooks.",
        models: MODEL_CATALOG.groq.map((m) => ({
            id: m.id,
            role: m.label || m.role || m.id,
            context: "~128k",
            cost: "free tier",
            speed: "Very fast",
            quality: m.role === "default" || m.role === "mid" ? "Good demo quality" : "Lower fidelity",
        })),
        contextWindow: "Typically 32k–128k depending on model (lower than Claude/Gemini flagships)",
        estimatedCost: "Free developer tier (rate limits); paid Developer plan raises limits.",
        performance: "Best-in-class raw speed. Trade-off: less reliable citation-heavy JSON than Claude Sonnet.",
        useCases: "Live demos, free-tier labs, latency showcases, workshops with Groq quota.",
        limitations:
            "Requires GROQ_API_KEY. Free tier rate limits apply. On failure, backend falls back across providers with keys.",
    },
};

/** Fallback model meta when provider is unknown. */
export const MODEL_META_FALLBACK = {
    title: "Model",
    default: "claude-sonnet-4-6",
    recommended: "claude-sonnet-4-6",
    whyRecommended:
        "Pick a model from the selected provider’s list so playbooks run with supported IDs and predictable quality.",
    notes:
        "Select a model that belongs to the chosen provider. Changing the provider resets the model to that provider’s first listed option.",
    models: [],
    contextWindow: "—",
    estimatedCost: "—",
    performance: "—",
    useCases: "—",
    limitations: "Provider must be one of: anthropic, openai, gemini, groq.",
};

/**
 * Resolve model tooltip metadata for the currently selected provider.
 * @param {string} [provider]
 */
export function getModelMeta(provider) {
    return MODEL_META_BY_PROVIDER[provider] || MODEL_META_FALLBACK;
}

/**
 * @typedef {{
 *   title: string,
 *   default: string,
 *   recommended: string,
 *   whyRecommended?: string,
 *   notes: string,
 *   valid?: string,
 *   impact?: string,
 * }} FieldMeta
 * @type {Record<string, FieldMeta>}
 */
export const FIELD_META = {
    llm_provider: {
        title: "LLM provider",
        default: "anthropic",
        recommended: "anthropic",
        whyRecommended:
            "Anthropic is the best fit for ACTIRA’s multi-step playbooks: stable system prompts get prompt-cache savings that OpenAI/Gemini/Groq paths do not match as cleanly.",
        valid: "anthropic | openai | gemini | groq",
        impact: "Switches the entire playbook generation backend and which API key is required.",
        notes:
            "Anthropic supports prompt caching on the stable SYSTEM_PROMPT. Groq is fast but has no Anthropic-style cache_control. OpenAI/Gemini work if you prefer those ecosystems.\n\nChanging the provider updates the Model dropdown and the Model help tooltip. Ollama and OpenRouter are planned — not selectable yet.",
    },
    /** Static fallback; UI should prefer getModelMeta(provider). */
    llm_model: {
        title: "Model",
        default: "claude-sonnet-4-6",
        recommended: "claude-sonnet-4-6",
        whyRecommended:
            "Sonnet delivers high-quality structured playbooks without Opus cost; it is the sweet spot for most IR workloads.",
        valid: "Must appear in the selected provider’s model list",
        impact: "Directly affects playbook quality, latency, and $ per incident.",
        notes:
            "Must match the selected provider’s model list. Hover this tip after changing provider for vendor-specific guidance (models, context, cost, performance).",
    },
    llm_temperature: {
        title: "Temperature",
        default: "0.2",
        recommended: "0.15",
        whyRecommended:
            "Slightly below the factory 0.2 keeps steps more deterministic so JSON and citation IDs stay valid without feeling robotic.",
        valid: "0.0 – 1.0 (step 0.05)",
        impact: "Higher values increase creativity but break JSON / citation stability.",
        notes:
            "Playbooks require valid structured JSON + citation IDs. Lower temperature → more deterministic steps. 0 is strictest; avoid >0.4 for production IR.",
    },
    llm_token_budget_monthly: {
        title: "Monthly token budget",
        default: "0 (unlimited)",
        recommended: "500000",
        whyRecommended:
            "A 500k soft ceiling surfaces runaway loops and demo burn early without hard-stopping the pipeline mid-incident.",
        valid: "Integer ≥ 0 (0 = unlimited)",
        impact:
            "When set (>0), ACTIRA blocks new LLM calls once estimated monthly tokens reach the budget. GET /settings shows llm_usage.",
        notes:
            "Estimated tokens (chars/4) per call are summed in Mongo llm_usage for the calendar month. 0 = unlimited. Raise the budget or wait for next month after exhaustion.",
    },
    anthropic_api_key: {
        title: "Anthropic API key",
        default: "from backend/.env or empty",
        recommended: "set a real key (never committed)",
        whyRecommended:
            "Live Claude needs a real key in Mongo or backend/.env — without it, recommended Anthropic playbooks cannot run.",
        valid: "Usually starts with sk-ant-",
        impact: "Required for live Claude when provider=anthropic.",
        notes:
            "Required for live Claude playbooks. Leave blank on save to keep the existing key. UI never displays the raw secret — only “✓ configured”.",
    },
    openai_api_key: {
        title: "OpenAI API key",
        default: "empty / env",
        recommended: "only if provider=openai",
        whyRecommended:
            "Only set this when OpenAI is the active provider so you are not maintaining unused cloud credentials.",
        valid: "Usually starts with sk-",
        impact: "Required when provider=openai.",
        notes: "Used when OpenAI is selected. Blank on save preserves the stored key.",
    },
    gemini_api_key: {
        title: "Gemini API key",
        default: "empty / env",
        recommended: "only if provider=gemini",
        whyRecommended:
            "Only needed when Gemini is selected; keeps the active provider path live without extra unused keys.",
        valid: "Google AI Studio / Vertex key",
        impact: "Required when provider=gemini.",
        notes: "Used when Gemini is selected. Blank on save preserves the stored key.",
    },
    groq_api_key: {
        title: "Groq API key",
        default: "empty / env",
        recommended: "optional — demos only",
        whyRecommended:
            "Useful for latency demos; skip for production IR where Anthropic caching and quality matter more.",
        valid: "Usually starts with gsk_",
        impact: "Without a key, backend may fall back to Anthropic.",
        notes:
            "Groq is great for latency demos but cannot use Anthropic prompt caching. Prefer Anthropic for production multi-incident pipelines (Week-2 notes).",
    },
    grounding_threshold: {
        title: "Grounding threshold",
        default: "0.7",
        recommended: "0.75",
        whyRecommended:
            "0.75 is a practical step up from demo defaults: more steps must cite the KB without flooding HiTL on every noisy log.",
        valid: "0.0 – 1.0",
        impact: "Below → force HiTL review (more queue volume).",
        notes:
            "Share of playbook steps that must cite valid KB IDs. Below this → force HiTL. Raise toward 0.8 for stricter citation quality; lower for noisy demo logs.",
    },
    hitl_severity_min: {
        title: "HiTL severity minimum",
        default: "critical",
        recommended: "high",
        whyRecommended:
            "Queuing high (not only critical) gives seniors eyes on serious incidents without drowning the queue in medium/low noise.",
        valid: "low | medium | high | critical",
        impact: "Lower floors send more incidents to the review queue.",
        notes:
            "Incidents at or above this severity always enter the review queue. Factory = critical only. Recommended also queues high-severity so seniors see more real IR load.",
    },
    auto_approve_grounding_min: {
        title: "Auto-approve grounding ≥",
        default: "0.9",
        recommended: "0.92",
        whyRecommended:
            "A slightly higher bar than factory means only well-cited drafts skip review, reducing the chance weak playbooks auto-ship.",
        valid: "0.0 – 1.0 (must be ≥ grounding threshold ideally)",
        impact: "Lower values auto-approve more drafts (riskier automation).",
        notes:
            "Non-critical incidents with grounding ≥ this value auto-approve (skip queue). Never auto-approves critical. Higher = safer automation, more queue volume.",
    },
    correlation_window_minutes: {
        title: "Correlation window (minutes)",
        default: "30",
        recommended: "45",
        whyRecommended:
            "45 minutes catches slower multi-stage campaigns across files without the noise risk of hour-plus windows.",
        valid: "Integer ≥ 1",
        impact: "Longer windows merge more events into one narrative (noise risk).",
        notes:
            "Events within this window may be grouped into one attack narrative across multi-file uploads. Longer windows catch slow multi-stage campaigns; too long can merge unrelated noise.",
    },
    cohere_rerank_enabled: {
        title: "Cohere re-rank",
        default: "on (needs API key to take effect)",
        recommended: "on when COHERE_API_KEY is set",
        whyRecommended:
            "After hybrid BM25+dense retrieve, Cohere Rerank lifts the best IR docs into the top 5–8 for playbooks.",
        valid: "boolean",
        impact: "Off = hybrid RRF order only; on + key = live re-rank (cost/latency per search).",
        notes:
            "Works with hybrid RAG (LanceDB + BM25). Without a key, search is unchanged. Offline tests use a lexical mock.",
    },
    cohere_api_key: {
        title: "Cohere Rerank API key",
        default: "empty → skip re-rank",
        recommended: "set for production playbook grounding quality",
        whyRecommended:
            "Rerank-english-v3.0 improves citation relevance after hybrid retrieve without changing the vector index.",
        valid: "Cohere API key string",
        impact: "Live re-rank on KB search / playbook generation; rate limits apply.",
        notes: "Stored like other secrets (has_cohere only on GET). Env: COHERE_API_KEY.",
    },
    abuseipdb_key: {
        title: "AbuseIPDB",
        default: "empty → mock enrichment",
        recommended: "set for live IP reputation",
        whyRecommended:
            "Live IP abuse scores turn synthetic mock risk into real reputation signals on the next ingest.",
        valid: "Vendor API key string",
        impact: "Live IP abuse scores on next ingest; API cost/rate limits apply.",
        notes: "IP abuse scores. Empty = mock scores for demos. Live keys apply on the next ingest only.",
    },
    virustotal_key: {
        title: "VirusTotal",
        default: "empty → mock",
        recommended: "set for hash/URL/domain reputation",
        whyRecommended:
            "Covers hashes, URLs, and domains in one feed — the highest-value multi-type CTI key for most IR demos.",
        valid: "Vendor API key string",
        impact: "Live hash/URL/domain scores; free tier rate limits are tight.",
        notes: "File hashes, URLs, domains. Mock mode if blank. Existing incidents keep old scores until re-ingest.",
    },
    greynoise_key: {
        title: "GreyNoise",
        default: "empty → mock",
        recommended: "set to filter internet noise vs targeted",
        whyRecommended:
            "Helps analysts ignore mass scanners so high-severity work focuses on targeted probes.",
        valid: "Vendor API key string",
        impact: "Helps de-prioritize mass scanners vs targeted probes.",
        notes: "Classifies mass-internet scanners vs targeted attacks on source IPs.",
    },
    threatfox_key: {
        title: "ThreatFox",
        default: "empty → mock",
        recommended: "optional malware IoC feed",
        whyRecommended:
            "Add when malware C2/hash correlation matters; skip if your cases are mostly network noise.",
        valid: "Vendor API key string",
        impact: "Malware C2/hash context when live.",
        notes: "abuse.ch ThreatFox malware IoCs. Useful for C2/hash correlation.",
    },
    otx_api_key: {
        title: "AlienVault OTX",
        default: "empty → mock",
        recommended: "set for community pulses",
        whyRecommended:
            "Strong free-tier community CTI that complements commercial IP/hash feeds without high cost.",
        valid: "OTX API key",
        impact: "Community pulse context; good free-tier CTI.",
        notes: "OTX pulses for IoC context. Good free-tier CTI source for demos + lab.",
    },
    shodan_api_key: {
        title: "Shodan",
        default: "empty → mock",
        recommended: "optional host exposure context",
        whyRecommended:
            "Useful when internet-facing service context helps triage; optional if you already have asset inventory.",
        valid: "Shodan API key",
        impact: "Internet-facing service context; rate-limited.",
        notes: "Internet-facing service context for IPs. Rate-limited; mock if blank.",
    },
    slack_webhook_url: {
        title: "Slack webhook",
        default: "empty",
        recommended: "Incoming Webhook for SOC channel",
        whyRecommended:
            "A dedicated SOC channel webhook gets critical/HiTL alerts in front of the team instead of only the UI.",
        valid: "https://hooks.slack.com/services/T…/B…/… (real path, not SMOKE/TEST)",
        impact: "Critical/high/HiTL alerts post to the Slack channel when configured.",
        notes:
            "Install: https://api.slack.com/messaging/webhooks → Create Incoming Webhook → pick channel → paste URL. " +
            "Use Send test Slack to verify. Leave blank on save to keep the existing webhook. Never commit webhooks.",
    },
    email_alerts_to: {
        title: "Alert email",
        default: "empty",
        recommended: "soc-oncall@your-org",
        whyRecommended:
            "A real on-call mailbox covers people who are not watching Slack when high-severity events fire.",
        valid: "Valid email address or empty",
        impact: "On-call mailbox for critical / HiTL routing. SMTP details are not required.",
        notes:
            "Recipient for critical / HiTL alert routing. Non-secret — returned on reload. SMTP is optional: default delivery uses a zero-config HTTP gateway (FormSubmit) plus a local outbox. Use Send test email to verify. First send to a new address may need an activation click in that inbox. Cleared by factory reset; not filled by Apply recommended.",
    },
    session_timeout_hours: {
        title: "Session timeout (hours)",
        default: "24",
        recommended: "8",
        whyRecommended:
            "Matches a typical SOC shift and reduces risk from unattended browsers compared with 24h demo sessions.",
        valid: "Integer ≥ 1",
        impact: "Shorter sessions reduce risk on shared workstations.",
        notes:
            "JWT lifetime for browser sessions. Changing this applies to new logins.",
    },
    failed_login_lockout: {
        title: "Failed login lockout",
        default: "5",
        recommended: "5",
        whyRecommended:
            "Five attempts blocks credential stuffing while still forgiving normal password typos — a proven ops default.",
        valid: "Integer ≥ 1 (prefer 3–10)",
        impact: "Too low locks out analysts; too high weakens brute-force defense.",
        notes:
            "Failed password attempts before a temporary lockout (process-local tracker).",
    },
    incident_retention_days: {
        title: "Incident retention (days)",
        default: "90",
        recommended: "180",
        whyRecommended:
            "Six months supports audit trails and golden-set benchmarking without unbounded Mongo growth.",
        valid: "Integer ≥ 1 (0 = disable purge)",
        impact: "Startup purge deletes incidents with created_at older than this window.",
        notes:
            "Enforced on backend startup (retention.purge_from_settings). Set 0 only if you intentionally keep all history forever.",
    },
    enrichment_cache_ttl_hours: {
        title: "Enrichment cache TTL (hours)",
        default: "24",
        recommended: "12",
        whyRecommended:
            "Half-day cache keeps CTI fresher for active campaigns while still shielding free-tier rate limits.",
        valid: "Integer ≥ 1",
        impact: "Shorter TTL = fresher CTI + more vendor API calls.",
        notes:
            "How long TI enrichment scores may be reused. Mock mode ignores real cache backends today.",
    },

    // —— UI prefs (browser-local; Settings → UI prefs tab) ——
    dashboard_recent_limit: {
        title: "Dashboard recent limit",
        default: "8",
        recommended: "12",
        whyRecommended:
            "Twelve recent cases give enough signal for shift handoff without overcrowding the Recent Incidents table.",
        valid: "Integer 5–50",
        impact: "Rows fetched/shown in Dashboard → Recent Incidents.",
        notes: "Client-side sample size after sort. Does not change Mongo pagination APIs.",
    },
    analytics_default_days: {
        title: "Analytics default window (days)",
        default: "30",
        recommended: "30",
        whyRecommended:
            "A 30-day window balances trend visibility with noise from multi-month history — standard SOC reporting month.",
        valid: "7 | 14 | 30 | 60 | 90",
        impact: "Initial window on Analytics page load.",
        notes: "Analysts can still change the window selector anytime.",
    },
    incidents_default_sort: {
        title: "Incidents default sort",
        default: "created_at:desc",
        recommended: "created_at:desc",
        whyRecommended:
            "Newest-first is the expected IR inbox order; threat-score sort is available on demand.",
        valid: "key:asc|desc (e.g. created_at:desc)",
        impact: "Initial sort on Incidents table until the user clicks a header.",
        notes: "Parsed by useSortableData / parseSortSpec.",
    },
    review_default_sort: {
        title: "Review queue default sort",
        default: "threat_score:desc",
        recommended: "threat_score:desc",
        whyRecommended:
            "Highest threat first surfaces the riskiest HiTL cases when the queue is long.",
        valid: "key:asc|desc",
        impact: "Initial sort for Review Queue (cards + table).",
        notes: "Third click on a column clears sort back to natural order.",
    },
    status_refresh_ms: {
        title: "Status refresh interval (ms)",
        default: "60000",
        recommended: "60000",
        whyRecommended:
            "One-minute polling keeps layout LLM/TI chips fresh on wallboards without chatty traffic.",
        valid: "Integer ≥ 0 (0 = off)",
        impact: "How often Layout re-fetches /settings for status chips.",
        notes: "Set 0 on low-power laptops or when API load is a concern.",
    },
    kb_default_mode: {
        title: "KB default search mode",
        default: "hybrid",
        recommended: "hybrid",
        whyRecommended:
            "Hybrid (BM25 + dense RRF) recovers both exact CVEs and paraphrased IR language — best default for analysts.",
        valid: "hybrid | bm25 | dense",
        impact: "Initial mode on Knowledge Base search.",
        notes: "Dense needs a healthy LanceDB + embedder; BM25 always works offline.",
    },
    review_default_view: {
        title: "Review queue default view",
        default: "cards",
        recommended: "table",
        whyRecommended:
            "Table view packs more HiTL cases with sortable columns — better for senior reviewers clearing a queue.",
        valid: "cards | table",
        impact: "Initial Review Queue layout.",
        notes: "Toggle still available in the queue toolbar.",
    },
    incidents_default_severity: {
        title: "Incidents default severity filter",
        default: "(all)",
        recommended: "(all)",
        whyRecommended:
            "No default severity filter avoids hiding medium/low noise that still needs triage during exercises.",
        valid: "empty | low | medium | high | critical",
        impact: "Pre-selects severity filter on Incidents.",
        notes: "Deep links (?severity=critical) still override for KPI drill-downs.",
    },
    incidents_default_status: {
        title: "Incidents default status filter",
        default: "(all)",
        recommended: "(all)",
        whyRecommended:
            "Show the full lifecycle by default so closed/approved history remains discoverable.",
        valid: "empty | new | in_progress | pending_review | approved | rejected | closed",
        impact: "Pre-selects status filter on Incidents.",
        notes: "Use pending_review only if this workstation is dedicated to HiTL.",
    },
    incidents_min_threat: {
        title: "Incidents min threat (default)",
        default: "0",
        recommended: "0",
        whyRecommended:
            "Zero keeps the full list visible; raise temporarily when hunting high-score IoCs only.",
        valid: "Integer 0–100",
        impact: "Client-side filter floor on Incidents.",
        notes: "0 disables the min-threat filter.",
    },
    high_threat_score_threshold: {
        title: "High-threat highlight threshold",
        default: "70",
        recommended: "70",
        whyRecommended:
            "70 matches common TI “elevated” cutoffs so rose highlighting is meaningful without flooding the table.",
        valid: "Integer 0–100",
        impact: "Threat score cells ≥ this render in rose on Dashboard/Incidents/Review.",
        notes: "Display-only; does not change pipeline severity.",
    },
    dashboard_refresh_ms: {
        title: "Dashboard refresh (ms)",
        default: "0 (off)",
        recommended: "60000",
        whyRecommended:
            "60s auto-refresh suits SOC wallboards so KPIs track new ingests without a manual reload.",
        valid: "Integer ≥ 0 (0 = off)",
        impact: "Interval for reloading Dashboard KPIs + recent incidents.",
        notes: "Leave 0 on personal laptops to avoid surprise network load.",
    },
    incidents_page_size: {
        title: "Incidents list cap",
        default: "200",
        recommended: "200",
        whyRecommended:
            "200 rows is enough for most lab datasets while keeping the browser responsive.",
        valid: "Integer 20–500",
        impact: "Client truncate after filter/sort on Incidents.",
        notes: "Not a server page size — raise only if you routinely hold more open cases.",
    },
    review_min_threat: {
        title: "Review min threat (default)",
        default: "0",
        recommended: "0",
        whyRecommended:
            "Do not hide low-threat HiTL items by default — grounding/severity already forced the queue entry.",
        valid: "Integer 0–100",
        impact: "Default min threat filter on Review Queue.",
        notes: "0 = show all queue items.",
    },
    review_max_grounding: {
        title: "Review max grounding filter",
        default: "1 (show all)",
        recommended: "1",
        whyRecommended:
            "Show the full queue by default; lower to 0.7 when focusing only on weakly cited drafts.",
        valid: "Number 0–1",
        impact: "Hides items with grounding above this value when < 1.",
        notes: "1 = filter off.",
    },
    dashboard_extra_widgets: {
        title: "Dashboard extra widgets",
        default: "on",
        recommended: "on",
        whyRecommended:
            "Severity/status/IoC/SOC health/trend widgets turn the dashboard into a real ops board instead of a KPI strip alone.",
        valid: "boolean",
        impact: "Shows or hides the secondary dashboard chart row.",
        notes: "Turn off for ultra-minimal kiosks.",
    },
    compact_tables: {
        title: "Compact incident tables",
        default: "off",
        recommended: "off",
        whyRecommended:
            "Standard density is easier to scan; compact is optional for large monitors with many columns.",
        valid: "boolean",
        impact: "Reduces row padding/font on Incidents and Review tables.",
        notes: "Does not change column set.",
    },
    show_incident_previews: {
        title: "Incident hover previews",
        default: "on",
        recommended: "on",
        whyRecommended:
            "Hover cards surface severity, scores, and techniques without opening every case — faster triage.",
        valid: "boolean",
        impact: "Enables HoverCard previews on incident titles.",
        notes: "Disable if you find previews intrusive on trackpads.",
    },
    show_help_tips: {
        title: "Metric help icons",
        default: "on",
        recommended: "on",
        whyRecommended:
            "Info icons explain KPIs and columns for new analysts without cluttering every label permanently.",
        valid: "boolean",
        impact: "Shows/hides HelpTip (i) icons across dashboards and tables.",
        notes: "Lightweight Tip tooltips on buttons still appear for accessibility.",
    },
    analytics_show_retrieval: {
        title: "Analytics retrieval panel",
        default: "on",
        recommended: "on",
        whyRecommended:
            "BM25 vs LanceDB comparison is a core identification metric — keep visible unless you only care about volume EDA.",
        valid: "boolean",
        impact: "Default visibility of the Analytics retrieval comparison panel.",
        notes: "Can still be toggled on the Analytics page for the session.",
    },
};

/**
 * Normalize any meta object for FieldTip rendering.
 * Keeps structured fields separate so the UI can render them without duplication.
 */
export function tipFromMeta(meta) {
    if (!meta) return null;
    return {
        title: meta.title || "Help",
        notes: meta.notes || "",
        default: meta.default ?? "—",
        recommended: meta.recommended ?? "—",
        whyRecommended: meta.whyRecommended || "",
        models: meta.models,
        contextWindow: meta.contextWindow,
        estimatedCost: meta.estimatedCost,
        performance: meta.performance,
        useCases: meta.useCases,
        limitations: meta.limitations,
        valid: meta.valid,
        impact: meta.impact,
        when: meta.when,
        bestPractices: meta.bestPractices,
        implications: meta.implications,
        purpose: meta.purpose,
    };
}

export function formatTooltip(meta) {
    if (!meta) return "";
    const tip = tipFromMeta(meta);
    return [
        tip.purpose,
        tip.notes,
        tip.when && `When: ${tip.when}`,
        tip.bestPractices && `Best practices: ${tip.bestPractices}`,
        tip.implications && `Implications: ${tip.implications}`,
        tip.valid && `Valid: ${tip.valid}`,
        tip.impact && `Impact: ${tip.impact}`,
        "",
        `Default: ${tip.default}`,
        `Recommended: ${tip.recommended}`,
        tip.whyRecommended && `Why recommended: ${tip.whyRecommended}`,
    ]
        .filter(Boolean)
        .join("\n");
}

/**
 * Client-side validation / warning messages for the Settings form.
 * @param {Record<string, any>} form
 * @param {Record<string, any>|null} settings  server flags (has_anthropic, …)
 * @returns {{ level: 'error'|'warning'|'info', field?: string, message: string }[]}
 */
export function validateSettingsForm(form, settings = {}, catalog = null) {
    const issues = [];
    if (!form || typeof form !== "object") return issues;

    const provider = normalizeProvider(form.llm_provider);
    const cat = catalog || MODEL_CATALOG;
    const models = modelIdsForProvider(cat, provider);

    if (form.llm_provider && !SUPPORTED_PROVIDERS.includes(String(form.llm_provider).trim().toLowerCase())) {
        issues.push({
            level: "error",
            field: "llm_provider",
            message: `Provider “${form.llm_provider}” is not supported. Use anthropic, openai, gemini, or groq.`,
        });
    }

    if (!form.llm_model || !String(form.llm_model).trim()) {
        issues.push({
            level: "error",
            field: "llm_model",
            message: "Select or enter an LLM model ID.",
        });
    } else if (models.length && form.llm_model && !models.includes(form.llm_model)) {
        // Custom / newly released IDs are allowed — do not block Save
        issues.push({
            level: "warning",
            field: "llm_model",
            message: `Model “${form.llm_model}” is not in the curated list for “${provider}”. It will still be saved and used if the provider accepts it.`,
        });
    }

    const keyFlag = {
        anthropic: "has_anthropic",
        openai: "has_openai",
        gemini: "has_gemini",
        groq: "has_groq",
    }[provider];
    const keyField = {
        anthropic: "anthropic_api_key",
        openai: "openai_api_key",
        gemini: "gemini_api_key",
        groq: "groq_api_key",
    }[provider];
    const hasStored = keyFlag ? !!settings[keyFlag] : false;
    const hasTyped = keyField && String(form[keyField] || "").trim().length > 0;
    if (provider && !hasStored && !hasTyped) {
        issues.push({
            level: "warning",
            field: keyField,
            message:
                provider === "groq"
                    ? "Groq API key is missing — backend may fall back to Anthropic for playbooks."
                    : `No ${provider} API key configured. Saving still works, but playbook generation will fail until you paste a key or set it in backend/.env.`,
        });
    }

    const temp = Number(form.llm_temperature);
    if (Number.isFinite(temp)) {
        if (temp < 0 || temp > 1) {
            issues.push({
                level: "error",
                field: "llm_temperature",
                message: "Temperature must be between 0 and 1.",
            });
        } else if (temp > 0.4) {
            issues.push({
                level: "warning",
                field: "llm_temperature",
                message: "Temperature > 0.4 often breaks structured playbook JSON — prefer ≤ 0.2.",
            });
        }
    }

    const g = Number(form.grounding_threshold);
    const aa = Number(form.auto_approve_grounding_min);
    if (Number.isFinite(g) && (g < 0 || g > 1)) {
        issues.push({
            level: "error",
            field: "grounding_threshold",
            message: "Grounding threshold must be between 0 and 1.",
        });
    }
    if (Number.isFinite(aa) && (aa < 0 || aa > 1)) {
        issues.push({
            level: "error",
            field: "auto_approve_grounding_min",
            message: "Auto-approve grounding must be between 0 and 1.",
        });
    }
    if (Number.isFinite(g) && Number.isFinite(aa) && aa < g) {
        issues.push({
            level: "warning",
            field: "auto_approve_grounding_min",
            message:
                "Auto-approve threshold is below the grounding threshold — nearly every draft that clears grounding will auto-approve. Consider auto-approve ≥ grounding.",
        });
    }
    if (Number.isFinite(g) && g < 0.6) {
        issues.push({
            level: "warning",
            field: "grounding_threshold",
            message: "Grounding < 0.6 allows weakly cited playbooks — risky for production IR.",
        });
    }

    if (form.hitl_severity_min === "low" || form.hitl_severity_min === "medium") {
        issues.push({
            level: "warning",
            field: "hitl_severity_min",
            message: `HiTL floor “${form.hitl_severity_min}” will flood the review queue. Prefer high or critical.`,
        });
    }

    const corr = Number(form.correlation_window_minutes);
    if (Number.isFinite(corr) && corr > 120) {
        issues.push({
            level: "warning",
            field: "correlation_window_minutes",
            message: "Correlation window > 120 minutes may merge unrelated activity into one narrative.",
        });
    }
    if (Number.isFinite(corr) && corr < 1) {
        issues.push({
            level: "error",
            field: "correlation_window_minutes",
            message: "Correlation window must be at least 1 minute.",
        });
    }

    const sess = Number(form.session_timeout_hours);
    if (Number.isFinite(sess) && sess > 72) {
        issues.push({
            level: "warning",
            field: "session_timeout_hours",
            message: "Session timeout > 72h is risky on shared SOC workstations.",
        });
    }
    if (Number.isFinite(sess) && sess < 1) {
        issues.push({
            level: "error",
            field: "session_timeout_hours",
            message: "Session timeout must be at least 1 hour.",
        });
    }

    const lock = Number(form.failed_login_lockout);
    if (Number.isFinite(lock) && lock < 3) {
        issues.push({
            level: "warning",
            field: "failed_login_lockout",
            message: "Lockout after < 3 failures will frustrate analysts on typos. Prefer 3–5.",
        });
    }

    const budget = Number(form.llm_token_budget_monthly);
    if (Number.isFinite(budget) && budget === 0) {
        issues.push({
            level: "info",
            field: "llm_token_budget_monthly",
            message: "Monthly token budget is unlimited (0). Recommended soft ceiling is 500,000 for demos.",
        });
    }

    const email = String(form.email_alerts_to || "").trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        issues.push({
            level: "error",
            field: "email_alerts_to",
            message: "Alert email does not look like a valid address.",
        });
    }

    const slack = String(form.slack_webhook_url || "").trim();
    if (slack) {
        if (/^xox[a-z]?-/i.test(slack) || /\.xox[bp]-/i.test(slack)) {
            issues.push({
                level: "error",
                field: "slack_webhook_url",
                message:
                    "That is a Slack API/OAuth token (xox…), not an Incoming Webhook. Use https://hooks.slack.com/services/T…/B…/… from api.slack.com/messaging/webhooks.",
            });
        } else if (!slack.startsWith("https://hooks.slack.com/services/")) {
            issues.push({
                level: "error",
                field: "slack_webhook_url",
                message:
                    "Slack field must be an Incoming Webhook URL starting with https://hooks.slack.com/services/.",
            });
        }
    }

    const tiConfigured = [
        settings.has_abuseipdb,
        settings.has_virustotal,
        settings.has_greynoise,
        settings.has_threatfox,
        settings.has_otx,
        settings.has_shodan,
    ].some(Boolean);
    const tiTyped = [
        "abuseipdb_key",
        "virustotal_key",
        "greynoise_key",
        "threatfox_key",
        "otx_api_key",
        "shodan_api_key",
    ].some((k) => String(form[k] || "").trim());
    if (!tiConfigured && !tiTyped) {
        issues.push({
            level: "info",
            field: "threat_intel",
            message:
                "All threat-intel keys empty — enrichment runs in mock mode (fine for demos; not live CTI).",
        });
    }

    if (provider === "groq") {
        issues.push({
            level: "info",
            field: "llm_provider",
            message:
                "Groq is optimized for demo latency, not production multi-step prompt caching. Prefer Anthropic for sustained IR pipelines.",
        });
    }

    return issues;
}
