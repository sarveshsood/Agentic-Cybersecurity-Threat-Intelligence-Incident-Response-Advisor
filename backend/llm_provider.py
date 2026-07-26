"""Unified LLM provider factory.

Supports, using your own API keys (no third-party proxy/key required):
- Anthropic via the official `anthropic` SDK
- OpenAI via the official `openai` SDK
- Gemini via the official `google-genai` SDK
- Groq via the official `groq` SDK

Keys are resolved at call time from:
1. Per-call overrides (from MongoDB settings / UI)
2. Environment variables (backend/.env bootstrap)

Provider/model is chosen by settings or LLM_PROVIDER / LLM_MODEL.
If Groq is selected but no key is configured, falls back to the default
provider (Anthropic).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any, AsyncIterator, Dict, Optional, Tuple

from backend.secrets_util import resolve_llm_keys

logger = logging.getLogger(__name__)

DEFAULT_PROVIDER = os.environ.get("LLM_PROVIDER", "anthropic")
DEFAULT_MODEL = os.environ.get("LLM_MODEL", "claude-sonnet-4-6")

# Product catalog with tier labels (FE can load via GET /settings/llm-catalog).
# tier: "paid" | "free" — free = usable on free/developer API tier (rate-limited).
MODEL_CATALOG: Dict[str, list] = {
    "anthropic": [
        {"id": "claude-sonnet-4-6", "tier": "paid", "role": "default", "label": "Claude Sonnet 4.6 (recommended)"},
        {"id": "claude-opus-4-6", "tier": "paid", "role": "flagship", "label": "Claude Opus 4.6"},
        {"id": "claude-opus-4-8", "tier": "paid", "role": "flagship", "label": "Claude Opus 4.8"},
        {"id": "claude-opus-4-5", "tier": "paid", "role": "flagship", "label": "Claude Opus 4.5"},
        {"id": "claude-opus-4-1", "tier": "paid", "role": "flagship", "label": "Claude Opus 4.1"},
        {"id": "claude-sonnet-4-5", "tier": "paid", "role": "mid", "label": "Claude Sonnet 4.5"},
        {"id": "claude-sonnet-4-0", "tier": "paid", "role": "prior", "label": "Claude Sonnet 4"},
        {"id": "claude-sonnet-4", "tier": "paid", "role": "prior", "label": "Claude Sonnet 4 (alias)"},
        {"id": "claude-opus-4", "tier": "paid", "role": "prior", "label": "Claude Opus 4"},
        {"id": "claude-haiku-4-5", "tier": "paid", "role": "fast", "label": "Claude Haiku 4.5 (cheap/fast)"},
        {"id": "claude-3-7-sonnet-latest", "tier": "paid", "role": "prior", "label": "Claude 3.7 Sonnet (latest alias)"},
        {"id": "claude-3-7-sonnet-20250219", "tier": "paid", "role": "prior", "label": "Claude 3.7 Sonnet (dated)"},
        {"id": "claude-3-5-sonnet-latest", "tier": "paid", "role": "prior", "label": "Claude 3.5 Sonnet (latest alias)"},
        {"id": "claude-3-5-sonnet-20241022", "tier": "paid", "role": "prior", "label": "Claude 3.5 Sonnet (20241022)"},
        {"id": "claude-3-5-haiku-latest", "tier": "paid", "role": "fast", "label": "Claude 3.5 Haiku (latest alias)"},
        {"id": "claude-3-5-haiku-20241022", "tier": "paid", "role": "fast", "label": "Claude 3.5 Haiku (20241022)"},
        {"id": "claude-3-opus-latest", "tier": "paid", "role": "prior", "label": "Claude 3 Opus (latest alias)"},
        {"id": "claude-3-haiku-20240307", "tier": "paid", "role": "legacy", "label": "Claude 3 Haiku (legacy)"},
    ],
    "openai": [
        # GPT-5.6 family (current frontier, mid-2026) — Terra first as balanced default
        {"id": "gpt-5.6-terra", "tier": "paid", "role": "default", "label": "GPT-5.6 Terra (balanced)"},
        {"id": "gpt-5.6-sol", "tier": "paid", "role": "flagship", "label": "GPT-5.6 Sol (frontier)"},
        {"id": "gpt-5.6-luna", "tier": "paid", "role": "fast", "label": "GPT-5.6 Luna (cost)"},
        {"id": "gpt-5.6", "tier": "paid", "role": "flagship", "label": "GPT-5.6 (alias)"},
        {"id": "gpt-5.5", "tier": "paid", "role": "flagship", "label": "GPT-5.5"},
        {"id": "gpt-5.5-pro", "tier": "paid", "role": "flagship", "label": "GPT-5.5 Pro"},
        {"id": "gpt-5.5-instant", "tier": "paid", "role": "fast", "label": "GPT-5.5 Instant"},
        {"id": "gpt-5.4", "tier": "paid", "role": "mid", "label": "GPT-5.4"},
        {"id": "gpt-5.4-mini", "tier": "paid", "role": "fast", "label": "GPT-5.4 mini"},
        {"id": "gpt-5.4-pro", "tier": "paid", "role": "flagship", "label": "GPT-5.4 pro"},
        {"id": "gpt-5.3", "tier": "paid", "role": "prior", "label": "GPT-5.3"},
        {"id": "gpt-5.2", "tier": "paid", "role": "prior", "label": "GPT-5.2"},
        {"id": "gpt-5.1", "tier": "paid", "role": "prior", "label": "GPT-5.1"},
        {"id": "gpt-5", "tier": "paid", "role": "prior", "label": "GPT-5"},
        {"id": "gpt-5-mini", "tier": "paid", "role": "fast", "label": "GPT-5 mini"},
        {"id": "gpt-5-nano", "tier": "paid", "role": "fast", "label": "GPT-5 nano"},
        {"id": "gpt-5-codex", "tier": "paid", "role": "code", "label": "GPT-5 Codex"},
        {"id": "gpt-4.1", "tier": "paid", "role": "prior", "label": "GPT-4.1"},
        {"id": "gpt-4.1-mini", "tier": "paid", "role": "fast", "label": "GPT-4.1 mini"},
        {"id": "gpt-4.1-nano", "tier": "paid", "role": "fast", "label": "GPT-4.1 nano"},
        {"id": "gpt-4o", "tier": "paid", "role": "prior", "label": "GPT-4o"},
        {"id": "gpt-4o-mini", "tier": "paid", "role": "fast", "label": "GPT-4o mini"},
        {"id": "chatgpt-4o-latest", "tier": "paid", "role": "prior", "label": "ChatGPT-4o latest"},
        {"id": "o3", "tier": "paid", "role": "reasoning", "label": "o3 (reasoning)"},
        {"id": "o3-mini", "tier": "paid", "role": "reasoning", "label": "o3-mini"},
        {"id": "o3-pro", "tier": "paid", "role": "reasoning", "label": "o3-pro"},
        {"id": "o4-mini", "tier": "paid", "role": "reasoning", "label": "o4-mini"},
        {"id": "o1", "tier": "paid", "role": "reasoning", "label": "o1 (reasoning)"},
        {"id": "o1-mini", "tier": "paid", "role": "reasoning", "label": "o1-mini"},
        {"id": "o1-pro", "tier": "paid", "role": "reasoning", "label": "o1-pro"},
    ],
    "gemini": [
        {"id": "gemini-3.1-pro-preview", "tier": "paid", "role": "default", "label": "Gemini 3.1 Pro (preview)"},
        {"id": "gemini-3-pro-preview", "tier": "paid", "role": "flagship", "label": "Gemini 3 Pro (preview)"},
        {"id": "gemini-3.6-flash", "tier": "free", "role": "fast", "label": "Gemini 3.6 Flash (free tier)"},
        {"id": "gemini-3.5-flash", "tier": "free", "role": "fast", "label": "Gemini 3.5 Flash (free tier)"},
        {"id": "gemini-3.5-flash-lite", "tier": "free", "role": "fast", "label": "Gemini 3.5 Flash-Lite (free tier)"},
        {"id": "gemini-3.1-flash-lite", "tier": "free", "role": "fast", "label": "Gemini 3.1 Flash-Lite (free tier)"},
        {"id": "gemini-3-flash-preview", "tier": "free", "role": "fast", "label": "Gemini 3 Flash (preview / free)"},
        {"id": "gemini-2.5-pro", "tier": "free", "role": "prior", "label": "Gemini 2.5 Pro (limited free)"},
        {"id": "gemini-2.5-flash", "tier": "free", "role": "fast", "label": "Gemini 2.5 Flash (free tier)"},
        {"id": "gemini-2.5-flash-lite", "tier": "free", "role": "fast", "label": "Gemini 2.5 Flash-Lite (free tier)"},
        {"id": "gemini-2.0-flash", "tier": "free", "role": "fast", "label": "Gemini 2.0 Flash (free tier)"},
        {"id": "gemini-2.0-flash-lite", "tier": "free", "role": "fast", "label": "Gemini 2.0 Flash-Lite (free tier)"},
        {"id": "gemini-1.5-pro", "tier": "paid", "role": "legacy", "label": "Gemini 1.5 Pro (legacy)"},
        {"id": "gemini-1.5-flash", "tier": "free", "role": "legacy", "label": "Gemini 1.5 Flash (legacy)"},
    ],
    "groq": [
        # Free developer tier (rate-limited) — chat-capable production + preview text models
        {"id": "openai/gpt-oss-120b", "tier": "free", "role": "default", "label": "GPT-OSS 120B (free tier)"},
        {"id": "openai/gpt-oss-20b", "tier": "free", "role": "fast", "label": "GPT-OSS 20B (free tier)"},
        {"id": "openai/gpt-oss-safeguard-20b", "tier": "free", "role": "mid", "label": "GPT-OSS Safeguard 20B"},
        {"id": "llama-3.3-70b-versatile", "tier": "free", "role": "prior", "label": "Llama 3.3 70B Versatile"},
        {"id": "llama-3.1-8b-instant", "tier": "free", "role": "fast", "label": "Llama 3.1 8B Instant"},
        {"id": "meta-llama/llama-4-scout-17b-16e-instruct", "tier": "free", "role": "fast", "label": "Llama 4 Scout 17B"},
        {"id": "meta-llama/llama-4-maverick-17b-128e-instruct", "tier": "free", "role": "mid", "label": "Llama 4 Maverick 17B"},
        {"id": "qwen/qwen3.6-27b", "tier": "free", "role": "mid", "label": "Qwen3.6 27B"},
        {"id": "qwen/qwen3-32b", "tier": "free", "role": "prior", "label": "Qwen3 32B"},
        {"id": "moonshotai/kimi-k2-instruct", "tier": "free", "role": "mid", "label": "Kimi K2 Instruct"},
        {"id": "groq/compound", "tier": "free", "role": "agent", "label": "Groq Compound (agentic)"},
        {"id": "groq/compound-mini", "tier": "free", "role": "agent", "label": "Groq Compound Mini"},
        {"id": "deepseek-r1-distill-llama-70b", "tier": "free", "role": "reasoning", "label": "DeepSeek R1 Distill Llama 70B"},
        {"id": "gemma2-9b-it", "tier": "free", "role": "fast", "label": "Gemma 2 9B IT"},
    ],
}

# Flat id lists for validation / dropdowns
PROVIDER_MODELS: Dict[str, list] = {
    p: [m["id"] for m in models] for p, models in MODEL_CATALOG.items()
}

# Preferred fallback order when primary fails (only used if key present)
# Prefer free-tier providers first for resilience when paid keys fail/exhaust.
FALLBACK_PROVIDER_ORDER = ("anthropic", "openai", "gemini", "groq")


class LLMConfigError(RuntimeError):
    """Missing key, unknown provider/model, or non-retriable config issue."""


class LLMCallError(RuntimeError):
    """Provider call failed after retries / fallbacks."""

    def __init__(self, message: str, *, provider: str = "", model: str = "", cause: BaseException | None = None):
        super().__init__(message)
        self.provider = provider
        self.model = model
        self.__cause__ = cause


def default_model_for_provider(provider: str) -> str:
    models = PROVIDER_MODELS.get(provider) or []
    return models[0] if models else DEFAULT_MODEL


def is_known_model(provider: str, model: str) -> bool:
    return model in (PROVIDER_MODELS.get(provider) or [])


def llm_catalog() -> Dict[str, Any]:
    """Public catalog for Settings UI / validation (includes free vs paid tiers)."""
    free_by_provider = {
        p: [m["id"] for m in models if m.get("tier") == "free"]
        for p, models in MODEL_CATALOG.items()
    }
    paid_by_provider = {
        p: [m["id"] for m in models if m.get("tier") != "free"]
        for p, models in MODEL_CATALOG.items()
    }
    return {
        "default_provider": DEFAULT_PROVIDER,
        "default_model": DEFAULT_MODEL,
        "providers": list(PROVIDER_MODELS.keys()),
        "models": {p: list(ms) for p, ms in PROVIDER_MODELS.items()},
        "catalog": {p: list(models) for p, models in MODEL_CATALOG.items()},
        "free_models": free_by_provider,
        "paid_models": paid_by_provider,
        "defaults": {p: (ms[0] if ms else "") for p, ms in PROVIDER_MODELS.items()},
        "fallback_order": list(FALLBACK_PROVIDER_ORDER),
        "notes": {
            "free": (
                "Free-tier models (Groq developer tier, Gemini free quota) are "
                "rate-limited; suitable for demos and low volume."
            ),
            "paid": (
                "Paid frontier models (Anthropic / OpenAI / Gemini Pro) for "
                "production IR playbook quality."
            ),
            "fallback": (
                "On primary failure, ACTIRA retries retriable errors then walks "
                "other providers that have API keys configured."
            ),
        },
    }


def _is_retriable_error(exc: BaseException) -> bool:
    """Retry only on transient network / rate-limit / 5xx-class failures."""
    if isinstance(exc, (LLMConfigError, ValueError)):
        return False
    msg = f"{type(exc).__name__}: {exc}".lower()
    permanent_markers = (
        "api_key",
        "apikey",
        "authentication",
        "unauthorized",
        "invalid_api_key",
        "permission",
        "not configured",
        "unknown provider",
        "invalid model",
        "model_not_found",
        "does not exist",
        "not_found_error",
        "404",
        "400",
        "budget",
    )
    if any(m in msg for m in permanent_markers):
        # 429 rate limit is retriable despite "permanent" digits check above —
        # handle after permanent auth markers
        if "429" in msg or "rate" in msg or "overloaded" in msg or "timeout" in msg:
            return True
        if "api_key" in msg or "not configured" in msg or "unauthorized" in msg or "authentication" in msg:
            return False
        if "404" in msg or "model_not_found" in msg or "does not exist" in msg:
            return False
        if "400" in msg and "rate" not in msg:
            return False
    retriable_markers = (
        "timeout",
        "timed out",
        "rate",
        "429",
        "500",
        "502",
        "503",
        "504",
        "overloaded",
        "temporarily",
        "connection",
        "connect",
        "reset",
        "unavailable",
        "capacity",
    )
    return any(m in msg for m in retriable_markers)


def _merge_keys(
        api_keys: Optional[Dict[str, str]] = None,
        *,
        anthropic_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        groq_api_key: Optional[str] = None,
        settings: Optional[dict] = None,
) -> Dict[str, str]:
    """Build effective key map: explicit args > api_keys dict > settings/env resolve."""
    base = resolve_llm_keys(settings)
    if api_keys:
        for k, v in api_keys.items():
            if v:
                base[k] = v
    if anthropic_api_key:
        base["anthropic"] = anthropic_api_key
    if openai_api_key:
        base["openai"] = openai_api_key
    if gemini_api_key:
        base["gemini"] = gemini_api_key
    if groq_api_key:
        base["groq"] = groq_api_key
    return base


def _resolve_temperature(settings: Optional[dict], default: float = 0.2) -> float:
    """A-L1: read llm_temperature from settings (clamped)."""
    if not settings:
        return default
    try:
        t = float(settings.get("llm_temperature", default))
    except (TypeError, ValueError):
        return default
    return max(0.0, min(2.0, t))


async def _dispatch_provider(
        provider: str,
        model: str,
        system: str,
        user: str,
        keys: Dict[str, str],
        json_mode: bool,
        *,
        use_prompt_cache: bool,
        temperature: float,
) -> Tuple[str, str, str]:
    """Single attempt against one provider (no retry / no cross-fallback)."""
    if provider not in PROVIDER_MODELS:
        raise LLMConfigError(f"Unknown provider: {provider}")
    key = (keys.get(provider) or "").strip()
    if not key:
        raise LLMConfigError(
            f"{provider.upper()}_API_KEY not configured (set in Settings UI or backend/.env)"
        )
    if provider == "anthropic":
        return await _call_anthropic(
            system, user, model, key, json_mode,
            use_prompt_cache=use_prompt_cache, temperature=temperature,
        )
    if provider == "openai":
        return await _call_openai(system, user, model, key, json_mode, temperature=temperature)
    if provider == "gemini":
        return await _call_gemini(system, user, model, key, json_mode, temperature=temperature)
    if provider == "groq":
        return await _call_groq(system, user, model, key, json_mode, temperature=temperature)
    raise LLMConfigError(f"Unknown provider: {provider}")


def _fallback_chain(
        primary: str,
        keys: Dict[str, str],
        settings: Optional[dict],
) -> list[tuple[str, str]]:
    """Ordered (provider, model) pairs to try after / instead of primary."""
    settings = settings or {}
    enabled = settings.get("llm_fallback_enabled")
    if enabled is None:
        enabled = True
    if not enabled:
        return []

    preferred = (settings.get("llm_fallback_provider") or "").strip().lower()
    chain: list[tuple[str, str]] = []
    seen = {primary}

    def _add(p: str) -> None:
        if not p or p in seen or p not in PROVIDER_MODELS:
            return
        if not (keys.get(p) or "").strip():
            return
        seen.add(p)
        chain.append((p, default_model_for_provider(p)))

    if preferred and preferred != "none":
        _add(preferred)
    for p in FALLBACK_PROVIDER_ORDER:
        _add(p)
    return chain


async def _call_with_retries(
        provider: str,
        model: str,
        system: str,
        user: str,
        keys: Dict[str, str],
        json_mode: bool,
        *,
        use_prompt_cache: bool,
        temperature: float,
        max_attempts: int = 2,
) -> Tuple[str, str, str]:
    last_err: Exception | None = None
    for attempt in range(max_attempts):
        try:
            return await _dispatch_provider(
                provider, model, system, user, keys, json_mode,
                use_prompt_cache=use_prompt_cache, temperature=temperature,
            )
        except LLMConfigError:
            raise
        except Exception as e:
            last_err = e
            if attempt + 1 < max_attempts and _is_retriable_error(e):
                logger.warning(
                    "LLM %s/%s attempt %s failed (retriable): %s",
                    provider, model, attempt + 1, e,
                )
                await asyncio.sleep(0.5 * (attempt + 1))
                continue
            raise
    raise LLMCallError(
        f"All attempts failed for {provider}/{model}",
        provider=provider, model=model, cause=last_err,
    ) from last_err


async def call_llm(
        system: str,
        user: str,
        provider: str = "anthropic",
        model: str = "claude-sonnet-4-6",
        groq_api_key: Optional[str] = None,
        anthropic_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        api_keys: Optional[Dict[str, str]] = None,
        settings: Optional[dict] = None,
        json_mode: bool = False,
        session_id: str = "soc",
        *,
        use_prompt_cache: bool = True,
        stream: bool = False,
) -> Tuple[str, str, str]:
    """Send a chat completion. Returns (text, effective_provider, effective_model).

    Resilience
    ----------
    1. Soft monthly token budget (when configured)
    2. Primary provider: up to 2 attempts on retriable errors only
    3. Cross-provider fallback chain (keys required; settings-gated)
    4. Callers (playbook/investigator/RCA) still apply template fallbacks

    Prompt caching (Anthropic): system block marked ephemeral when enabled.
    stream=True is ignored here — use stream_llm() for Investigator SSE.
    """
    if stream:
        logger.debug(
            "call_llm(stream=True) ignored — use stream_llm() for Investigator SSE"
        )

    # A-M1: soft monthly token budget (estimated tokens)
    try:
        from backend.llm_usage import assert_within_budget, estimate_tokens, record_usage
        await assert_within_budget(settings)
    except ImportError:
        estimate_tokens = None  # type: ignore
        record_usage = None  # type: ignore

    keys = _merge_keys(
        api_keys,
        anthropic_api_key=anthropic_api_key,
        openai_api_key=openai_api_key,
        gemini_api_key=gemini_api_key,
        groq_api_key=groq_api_key,
        settings=settings,
    )

    temperature = _resolve_temperature(settings)
    provider = (provider or DEFAULT_PROVIDER).strip().lower()
    model = (model or default_model_for_provider(provider)).strip()

    async def _meter(text: str, eff_p: str, eff_m: str) -> Tuple[str, str, str]:
        if record_usage and estimate_tokens:
            try:
                n = estimate_tokens(system, user, text or "")
                await record_usage(n, provider=eff_p, model=eff_m)
            except Exception as me:
                logger.debug("token meter skipped: %s", me)
        return text, eff_p, eff_m

    errors: list[str] = []

    # Primary
    try:
        text, p, m = await _call_with_retries(
            provider, model, system, user, keys, json_mode,
            use_prompt_cache=use_prompt_cache, temperature=temperature,
        )
        return await _meter(text, p, m)
    except Exception as e:
        errors.append(f"{provider}/{model}: {type(e).__name__}: {e}")
        logger.warning("LLM primary %s/%s failed: %s", provider, model, e)

    # Cross-provider fallbacks
    for fb_provider, fb_model in _fallback_chain(provider, keys, settings):
        try:
            logger.info(
                "LLM falling back: %s/%s → %s/%s",
                provider, model, fb_provider, fb_model,
            )
            text, p, m = await _call_with_retries(
                fb_provider, fb_model, system, user, keys, json_mode,
                use_prompt_cache=use_prompt_cache, temperature=temperature,
                max_attempts=1,
            )
            return await _meter(text, p, m)
        except Exception as e:
            errors.append(f"{fb_provider}/{fb_model}: {type(e).__name__}: {e}")
            logger.warning("LLM fallback %s/%s failed: %s", fb_provider, fb_model, e)

    detail = "; ".join(errors[-4:]) if errors else "unknown"
    raise LLMCallError(
        f"All LLM providers failed ({detail})",
        provider=provider,
        model=model,
    )


async def _call_default_fallback(
        system, user, json_mode, keys: Dict[str, str], use_prompt_cache: bool = True, temperature: float = 0.2,
):
    """Legacy helper: Anthropic default when key present."""
    return await _dispatch_provider(
        "anthropic", DEFAULT_MODEL, system, user, keys, json_mode,
        use_prompt_cache=use_prompt_cache, temperature=temperature,
    )


async def _call_anthropic(
        system, user, model, api_key, json_mode, use_prompt_cache: bool = True, temperature: float = 0.2,
):
    if not api_key:
        raise LLMConfigError("ANTHROPIC_API_KEY not configured (set in Settings UI or backend/.env)")
    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=api_key)
    # Anthropic prompt caching: mark stable system prefix so multi-step pipelines
    # (playbook + investigate loops) do not re-bill the full system tokens each call.
    if use_prompt_cache and system:
        system_param: object = [
            {
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }
        ]
    else:
        system_param = system
    resp = await client.messages.create(
        model=model,
        max_tokens=4096,
        temperature=temperature,
        system=system_param,
        messages=[{"role": "user", "content": user}],
    )
    text = "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")
    return text, "anthropic", model


async def _call_openai(system, user, model, api_key, json_mode, temperature: float = 0.2):
    if not api_key:
        raise LLMConfigError("OPENAI_API_KEY not configured (set in Settings UI or backend/.env)")
    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    completion = await client.chat.completions.create(**kwargs)
    return completion.choices[0].message.content, "openai", model


async def _call_gemini(system, user, model, api_key, json_mode, temperature: float = 0.2):
    if not api_key:
        raise LLMConfigError("GEMINI_API_KEY not configured (set in Settings UI or backend/.env)")
    from google import genai
    from google.genai import types
    client = genai.Client(api_key=api_key)
    config_kwargs = {"system_instruction": system, "temperature": temperature}
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"
    resp = await client.aio.models.generate_content(
        model=model,
        contents=user,
        config=types.GenerateContentConfig(**config_kwargs),
    )
    return resp.text, "gemini", model


async def _call_groq(system, user, model, api_key, json_mode, temperature: float = 0.2):
    if not api_key:
        raise LLMConfigError("GROQ_API_KEY not configured (set in Settings UI or backend/.env)")
    from groq import AsyncGroq
    client = AsyncGroq(api_key=api_key)
    kwargs = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": temperature,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    completion = await client.chat.completions.create(**kwargs)
    return completion.choices[0].message.content, "groq", model


async def stream_llm(
        system: str,
        user: str,
        provider: str = "anthropic",
        model: str = "claude-sonnet-4-6",
        settings: Optional[dict] = None,
        groq_api_key: Optional[str] = None,
        anthropic_api_key: Optional[str] = None,
        openai_api_key: Optional[str] = None,
        gemini_api_key: Optional[str] = None,
        api_keys: Optional[Dict[str, str]] = None,
        json_mode: bool = False,
        *,
        use_prompt_cache: bool = True,
) -> AsyncIterator[Dict[str, Any]]:
    """Yield token chunks then a final event for free-form / Investigator UX.

    Events:
      {"type": "meta", "provider": str, "model": str}
      {"type": "token", "text": str}
      {"type": "done", "text": str, "provider": str, "model": str}
      {"type": "error", "message": str}

    Falls back to a single non-stream call if the provider stream path fails.
    """
    try:
        from backend.llm_usage import assert_within_budget, BudgetExceededError
        try:
            await assert_within_budget(settings)
        except BudgetExceededError as be:
            yield {"type": "error", "message": str(be)}
            return
    except ImportError:
        pass

    keys = _merge_keys(
        api_keys,
        anthropic_api_key=anthropic_api_key,
        openai_api_key=openai_api_key,
        gemini_api_key=gemini_api_key,
        groq_api_key=groq_api_key,
        settings=settings,
    )

    provider = (provider or DEFAULT_PROVIDER).strip().lower()
    model = (model or default_model_for_provider(provider)).strip()
    eff_provider = provider
    eff_model = model

    if not (keys.get(provider) or "").strip():
        for fb_p, fb_m in _fallback_chain(provider, keys, settings):
            logger.info(
                "stream_llm: no key for %s — using fallback %s/%s",
                provider, fb_p, fb_m,
            )
            eff_provider, eff_model = fb_p, fb_m
            break
        else:
            yield {
                "type": "error",
                "message": (
                    f"{provider.upper()}_API_KEY not configured and no fallback provider key available"
                ),
            }
            return

    yield {"type": "meta", "provider": eff_provider, "model": eff_model}

    try:
        if eff_provider == "anthropic":
            async for ev in _stream_anthropic(
                    system, user, eff_model, keys.get("anthropic", ""), use_prompt_cache
            ):
                yield ev
            return
        if eff_provider == "openai":
            async for ev in _stream_openai(
                    system, user, eff_model, keys.get("openai", ""), json_mode
            ):
                yield ev
            return
        if eff_provider == "groq":
            async for ev in _stream_groq(
                    system, user, eff_model, keys.get("groq", ""), json_mode
            ):
                yield ev
            return
        if eff_provider == "gemini":
            async for ev in _stream_gemini(
                    system, user, eff_model, keys.get("gemini", ""), json_mode
            ):
                yield ev
            return
        raise LLMConfigError(f"Unknown provider: {eff_provider}")
    except Exception as e:
        logger.exception("stream_llm failed (%s); trying non-stream fallback", type(e).__name__)
        try:
            text, p, m = await call_llm(
                system=system,
                user=user,
                provider=eff_provider,
                model=eff_model,
                settings=settings,
                api_keys=keys,
                json_mode=json_mode,
                use_prompt_cache=use_prompt_cache,
            )
            if text:
                yield {"type": "token", "text": text}
            yield {"type": "done", "text": text or "", "provider": p, "model": m}
        except Exception as e2:
            yield {
                "type": "error",
                "message": str(e2) or type(e2).__name__,
                "error_class": type(e2).__name__,
            }


async def _stream_anthropic(system, user, model, api_key, use_prompt_cache: bool):
    if not api_key:
        raise LLMConfigError("ANTHROPIC_API_KEY not configured (set in Settings UI or backend/.env)")
    from anthropic import AsyncAnthropic

    client = AsyncAnthropic(api_key=api_key)
    if use_prompt_cache and system:
        system_param: object = [
            {
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }
        ]
    else:
        system_param = system

    parts: list[str] = []
    async with client.messages.stream(
            model=model,
            max_tokens=4096,
            system=system_param,
            messages=[{"role": "user", "content": user}],
    ) as stream:
        async for text in stream.text_stream:
            if text:
                parts.append(text)
                yield {"type": "token", "text": text}
    full = "".join(parts)
    yield {"type": "done", "text": full, "provider": "anthropic", "model": model}


async def _stream_openai(system, user, model, api_key, json_mode: bool):
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY not configured (set in Settings UI or backend/.env)")
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=api_key)
    kwargs: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": True,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    parts: list[str] = []
    stream = await client.chat.completions.create(**kwargs)
    async for chunk in stream:
        delta = ""
        try:
            delta = chunk.choices[0].delta.content or ""
        except (IndexError, AttributeError):
            delta = ""
        if delta:
            parts.append(delta)
            yield {"type": "token", "text": delta}
    full = "".join(parts)
    yield {"type": "done", "text": full, "provider": "openai", "model": model}


async def _stream_groq(system, user, model, api_key, json_mode: bool):
    if not api_key:
        raise RuntimeError("GROQ_API_KEY not configured")
    from groq import AsyncGroq

    client = AsyncGroq(api_key=api_key)
    kwargs: Dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
        "stream": True,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    parts: list[str] = []
    stream = await client.chat.completions.create(**kwargs)
    async for chunk in stream:
        delta = ""
        try:
            delta = chunk.choices[0].delta.content or ""
        except (IndexError, AttributeError):
            delta = ""
        if delta:
            parts.append(delta)
            yield {"type": "token", "text": delta}
    full = "".join(parts)
    yield {"type": "done", "text": full, "provider": "groq", "model": model}


async def _stream_gemini(system, user, model, api_key, json_mode: bool):
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured (set in Settings UI or backend/.env)")
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    config_kwargs: Dict[str, Any] = {"system_instruction": system}
    if json_mode:
        config_kwargs["response_mime_type"] = "application/json"

    parts: list[str] = []
    # google-genai async streaming
    stream = await client.aio.models.generate_content_stream(
        model=model,
        contents=user,
        config=types.GenerateContentConfig(**config_kwargs),
    )
    async for chunk in stream:
        text = getattr(chunk, "text", None) or ""
        if text:
            parts.append(text)
            yield {"type": "token", "text": text}
    full = "".join(parts)
    yield {"type": "done", "text": full, "provider": "gemini", "model": model}


def _strip_code_fences(text: str) -> str:
    """Remove leading/trailing markdown code fences (``` / ```json)."""
    t = (text or "").strip()
    if not t.startswith("```"):
        return t
    # Drop opening fence line
    rest = t[3:]
    if rest.lower().startswith("json"):
        rest = rest[4:]
    rest = rest.lstrip("\r\n")
    # Close at last fence if present
    if "```" in rest:
        rest = rest.rsplit("```", 1)[0]
    return rest.strip("` \n\r\t")


def _extract_json_blob(text: str) -> str | None:
    """Extract the first top-level JSON object or array via brace matching."""
    if not text:
        return None
    start_obj = text.find("{")
    start_arr = text.find("[")
    if start_obj < 0 and start_arr < 0:
        return None
    if start_obj < 0:
        start = start_arr
        open_c, close_c = "[", "]"
    elif start_arr < 0:
        start = start_obj
        open_c, close_c = "{", "}"
    else:
        if start_obj < start_arr:
            start = start_obj
            open_c, close_c = "{", "}"
        else:
            start = start_arr
            open_c, close_c = "[", "]"

    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
            continue
        if ch == open_c:
            depth += 1
        elif ch == close_c:
            depth -= 1
            if depth == 0:
                return text[start: i + 1]
    return None


def _strip_trailing_commas(text: str) -> str:
    """Remove trailing commas before } or ] (common LLM JSON glitch)."""
    import re
    prev = None
    out = text
    # Iterate until stable (nested trailing commas)
    while prev != out:
        prev = out
        out = re.sub(r",(\s*[}\]])", r"\1", out)
    return out


def parse_llm_json(text: str) -> dict:
    """Robust JSON parser for LLM outputs.

    Handles:
      - ``` / ```json fenced blocks
      - Prose before/after a JSON object
      - Trailing commas
      - Bare JSON arrays (normalized to {\"steps\": [...]})
    Raises ValueError when nothing parseable as a dict is found.
    """
    raw = (text or "").strip()
    if not raw:
        raise ValueError("empty LLM response")

    stripped = _strip_code_fences(raw)
    candidates: list[str] = []
    for piece in (stripped, raw):
        if piece and piece not in candidates:
            candidates.append(piece)
        blob = _extract_json_blob(piece)
        if blob and blob not in candidates:
            candidates.append(blob)

    last_err: Exception | None = None
    for cand in candidates:
        for attempt in (cand, _strip_trailing_commas(cand)):
            try:
                data = json.loads(attempt)
            except json.JSONDecodeError as e:
                last_err = e
                continue
            if isinstance(data, dict):
                return data
            if isinstance(data, list):
                # Playbook models occasionally emit a bare steps array
                return {"steps": data}
            last_err = ValueError(
                f"JSON root must be object or array, got {type(data).__name__}"
            )
    msg = f"Failed to parse LLM JSON: {last_err}" if last_err else "Failed to parse LLM JSON"
    raise ValueError(msg) from last_err
