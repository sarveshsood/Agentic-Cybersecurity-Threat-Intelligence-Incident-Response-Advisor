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

# Provider → available models
PROVIDER_MODELS = {
    "anthropic": ["claude-sonnet-4-6", "claude-opus-4-8", "claude-haiku-4-5"],
    "openai": ["gpt-5.4", "gpt-5.4-mini", "gpt-5.2"],
    "gemini": ["gemini-3.1-pro-preview", "gemini-3-flash-preview", "gemini-3.5-flash"],
    "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"],
}


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

    Prompt caching (Week-2 note)
    ---------------------------
    SYSTEM_PROMPT is byte-identical across playbook/investigation calls. When the
    provider is Anthropic and use_prompt_cache=True, we mark the system block with
    cache_control ephemeral so repeated pipeline steps reuse the cached prefix.

    Groq does **not** expose Anthropic-style cache_control — caching is a no-op
    on Groq/OpenAI/Gemini paths today.

    Streaming
    ---------
    stream=True is accepted on call_llm for API symmetry but ignored here — the
    playbook pipeline needs full structured JSON. Use stream_llm() for token
    chunks (AI Investigator SSE).
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
        assert_within_budget = None  # type: ignore
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

    async def _meter(text: str, eff_p: str, eff_m: str) -> Tuple[str, str, str]:
        if record_usage and estimate_tokens:
            try:
                n = estimate_tokens(system, user, text or "")
                await record_usage(n, provider=eff_p, model=eff_m)
            except Exception as me:
                logger.debug("token meter skipped: %s", me)
        return text, eff_p, eff_m

    if provider == "groq":
        if not keys.get("groq"):
            logger.info("Groq selected but no API key — falling back to default provider")
            text, p, m = await _call_default_fallback(
                system, user, json_mode, keys, use_prompt_cache, temperature=temperature,
            )
            return await _meter(text, p, m)
        try:
            text, p, m = await _call_groq(
                system, user, model, keys["groq"], json_mode, temperature=temperature,
            )
            return await _meter(text, p, m)
        except Exception as e:
            logger.exception("Groq call failed, falling back to default provider: %s", type(e).__name__)
            text, p, m = await _call_default_fallback(
                system, user, json_mode, keys, use_prompt_cache, temperature=temperature,
            )
            return await _meter(text, p, m)

    if provider not in ("anthropic", "openai", "gemini"):
        raise ValueError(f"Unknown provider: {provider}")

    # Basic resilience: retry once on transient LLM errors for prod
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            if provider == "anthropic":
                text, p, m = await _call_anthropic(
                    system, user, model, keys.get("anthropic", ""), json_mode,
                    use_prompt_cache=use_prompt_cache, temperature=temperature,
                )
                return await _meter(text, p, m)
            if provider == "openai":
                text, p, m = await _call_openai(
                    system, user, model, keys.get("openai", ""), json_mode, temperature=temperature,
                )
                return await _meter(text, p, m)
            # gemini
            text, p, m = await _call_gemini(
                system, user, model, keys.get("gemini", ""), json_mode, temperature=temperature,
            )
            return await _meter(text, p, m)
        except Exception as e:
            last_err = e
            if attempt == 0:
                logger.warning("LLM call attempt %s failed, retrying: %s", attempt + 1, e)
                await asyncio.sleep(0.5)
                continue
            raise
    raise RuntimeError("All LLM attempts failed") from last_err


async def _call_default_fallback(
        system, user, json_mode, keys: Dict[str, str], use_prompt_cache: bool = True, temperature: float = 0.2,
):
    return await _call_anthropic(
        system, user, DEFAULT_MODEL, keys.get("anthropic", ""), json_mode,
        use_prompt_cache=use_prompt_cache, temperature=temperature,
    )


async def _call_anthropic(
        system, user, model, api_key, json_mode, use_prompt_cache: bool = True, temperature: float = 0.2,
):
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured (set in Settings UI or backend/.env)")
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
        raise RuntimeError("OPENAI_API_KEY not configured (set in Settings UI or backend/.env)")
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
        raise RuntimeError("GEMINI_API_KEY not configured (set in Settings UI or backend/.env)")
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

    eff_provider = provider
    eff_model = model

    if provider == "groq" and not keys.get("groq"):
        logger.info("Groq stream selected but no key — falling back to Anthropic")
        eff_provider = "anthropic"
        eff_model = DEFAULT_MODEL

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
        raise ValueError(f"Unknown provider: {eff_provider}")
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
            yield {"type": "error", "message": str(e2) or type(e2).__name__}


async def _stream_anthropic(system, user, model, api_key, use_prompt_cache: bool):
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured (set in Settings UI or backend/.env)")
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
