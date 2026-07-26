"""LLM catalog, model allow-list, and fallback helpers (offline)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_provider_models_non_empty():
    from backend.llm_provider import (
        MODEL_CATALOG,
        PROVIDER_MODELS,
        llm_catalog,
        default_model_for_provider,
    )

    assert set(PROVIDER_MODELS) == {"anthropic", "openai", "gemini", "groq"}
    for p, models in PROVIDER_MODELS.items():
        assert models, p
        assert default_model_for_provider(p) == models[0]
        assert len(models) == len(MODEL_CATALOG[p])
    cat = llm_catalog()
    assert cat["models"]["anthropic"][0] == "claude-sonnet-4-6"
    assert "openai/gpt-oss-120b" in cat["models"]["groq"]
    assert "mixtral-8x7b-32768" not in cat["models"]["groq"]
    # free + paid tiers exposed for Settings UI
    assert cat["free_models"]["groq"]
    assert cat["paid_models"]["anthropic"]
    assert any(m["tier"] == "free" for m in cat["catalog"]["gemini"])
    assert any(m["tier"] == "paid" for m in cat["catalog"]["openai"])
    assert "gpt-4o-mini" in cat["models"]["openai"]
    assert "gpt-5.6-sol" in cat["models"]["openai"]
    assert "gpt-5.6-terra" in cat["models"]["openai"]
    assert "o4-mini" in cat["models"]["openai"]
    assert "gemini-3.5-flash-lite" in cat["models"]["gemini"]
    assert "meta-llama/llama-4-scout-17b-16e-instruct" in cat["models"]["groq"]
    assert len(cat["models"]["openai"]) >= 15
    assert len(cat["models"]["anthropic"]) >= 8
    assert len(cat["models"]["gemini"]) >= 10
    assert len(cat["models"]["groq"]) >= 10


def test_is_known_model():
    from backend.llm_provider import is_known_model

    assert is_known_model("anthropic", "claude-sonnet-4-6")
    assert is_known_model("openai", "gpt-5.4-pro")
    assert is_known_model("openai", "gpt-5.6-sol")
    assert is_known_model("openai", "gpt-4o-mini")
    assert is_known_model("groq", "qwen/qwen3.6-27b")
    assert is_known_model("gemini", "gemini-2.0-flash")
    assert not is_known_model("openai", "gpt-3.5-turbo")
    assert not is_known_model("nope", "x")


def test_retriable_error_classification():
    from backend.llm_provider import LLMConfigError, _is_retriable_error

    assert _is_retriable_error(TimeoutError("connection timeout"))
    assert _is_retriable_error(RuntimeError("rate limit 429"))
    assert _is_retriable_error(RuntimeError("503 service unavailable"))
    assert not _is_retriable_error(LLMConfigError("ANTHROPIC_API_KEY not configured"))
    assert not _is_retriable_error(ValueError("unknown provider"))
    assert not _is_retriable_error(RuntimeError("model_not_found 404"))


def test_fallback_chain_respects_keys_and_settings():
    from backend.llm_provider import _fallback_chain

    keys = {"anthropic": "a", "openai": "o", "gemini": "", "groq": "g"}
    chain = _fallback_chain("openai", keys, {"llm_fallback_enabled": True, "llm_fallback_provider": "anthropic"})
    providers = [p for p, _ in chain]
    assert providers[0] == "anthropic"
    assert "openai" not in providers  # primary excluded
    assert "gemini" not in providers  # no key
    assert "groq" in providers

    empty = _fallback_chain("anthropic", keys, {"llm_fallback_enabled": False})
    assert empty == []


@pytest.mark.asyncio
async def test_call_llm_missing_keys_raises():
    from backend.llm_provider import call_llm, LLMCallError, LLMConfigError

    with pytest.raises((LLMCallError, LLMConfigError, RuntimeError)):
        await call_llm(
            system="s",
            user="u",
            provider="openai",
            model="gpt-5.4",
            settings={"llm_fallback_enabled": False},
            api_keys={"openai": "", "anthropic": "", "gemini": "", "groq": ""},
            use_prompt_cache=False,
        )
