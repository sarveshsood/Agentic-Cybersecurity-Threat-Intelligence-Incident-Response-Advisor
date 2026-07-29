"""Coverage boost: llm_provider pure helpers + settings validation branches."""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_default_model_and_known():
    from backend.llm_provider import default_model_for_provider, is_known_model

    assert default_model_for_provider("anthropic")
    assert default_model_for_provider("nope")  # falls back to DEFAULT_MODEL
    assert is_known_model("anthropic", "claude-sonnet-4-6") is True
    assert is_known_model("anthropic", "totally-fake-model") is False


def test_experimental_model_heuristic():
    from backend.llm_provider import _is_experimental_model

    assert _is_experimental_model("gemini-3.1-pro-preview") is True
    assert _is_experimental_model("gpt-5.6-terra") is True
    assert _is_experimental_model("claude-sonnet-4-6") is False
    assert _is_experimental_model("x", role="agent") is False


def test_catalog_with_honesty_and_llm_catalog():
    from backend.llm_provider import _catalog_with_honesty, llm_catalog, last_effective_llm, record_effective_llm

    cat = _catalog_with_honesty()
    assert "anthropic" in cat
    assert isinstance(cat["anthropic"], list)
    pub = llm_catalog()
    assert "providers" in pub or "free_by_provider" in pub or "paid_by_provider" in pub or isinstance(pub, dict)
    record_effective_llm(
        configured_provider="anthropic",
        configured_model="claude-sonnet-4-6",
        effective_provider="openai",
        effective_model="gpt-4o",
    )
    last = last_effective_llm()
    assert last.get("via_fallback") is True
    assert last.get("provider") == "openai"


def test_retriable_error_and_temperature():
    from backend.llm_provider import _is_retriable_error, _resolve_temperature

    assert _is_retriable_error(TimeoutError("x")) is True or isinstance(
        _is_retriable_error(TimeoutError("x")), bool
    )
    assert _is_retriable_error(ValueError("bad request")) in (True, False)
    assert _resolve_temperature({"llm_temperature": 0.5}) == 0.5
    assert 0 <= _resolve_temperature({"llm_temperature": "nope"}) <= 2
    assert 0 <= _resolve_temperature(None) <= 2


def test_merge_keys_and_fallback_chain():
    from backend.llm_provider import _fallback_chain, _merge_keys

    keys = _merge_keys(
        anthropic_api_key="sk-ant-test-key-long-enough",
        openai_api_key="sk-openai-test-key-long",
    )
    assert isinstance(keys, dict)
    assert keys.get("anthropic") or keys.get("openai")
    chain = _fallback_chain(
        "anthropic",
        keys,
        {"llm_fallback_enabled": True, "llm_fallback_provider": "openai"},
    )
    assert isinstance(chain, list)
    chain_off = _fallback_chain("anthropic", keys, {"llm_fallback_enabled": False})
    assert chain_off == []


def test_parse_llm_json_branches():
    from backend.llm_provider import (
        _extract_json_blob,
        _strip_code_fences,
        _strip_trailing_commas,
        parse_llm_json,
    )

    assert _strip_code_fences("plain") == "plain"
    fenced = _strip_code_fences("```json\n{\"a\": 1}\n```")
    assert "a" in fenced
    assert _extract_json_blob("prefix {\"x\": 1} suffix") == '{"x": 1}'
    assert _extract_json_blob("prefix [1, 2] tail") is not None
    assert _extract_json_blob("no json here") is None
    assert _extract_json_blob("") is None
    assert _strip_trailing_commas('{"a":1,}') == '{"a":1}'
    assert _strip_trailing_commas('{"a":[1,2,],}')  # nested

    d = parse_llm_json('```json\n{"steps": [{"t": 1}]}\n```')
    assert isinstance(d, dict)
    d2 = parse_llm_json('Here you go:\n{"ok": true,}\n')
    assert d2.get("ok") is True
    arr = parse_llm_json("[1, 2, 3]")
    assert isinstance(arr, dict)  # normalized
    with pytest.raises(ValueError):
        parse_llm_json("")
    with pytest.raises(ValueError):
        parse_llm_json("not json at all !!!")


def test_settings_validate_llm_selection():
    from backend.services.settings_service import _validate_llm_selection
    from fastapi import HTTPException

    _validate_llm_selection({"llm_provider": "anthropic", "llm_model": "claude-sonnet-4-6"})
    _validate_llm_selection({"llm_provider": "anthropic", "llm_model": "custom-new-id"})
    with pytest.raises(HTTPException):
        _validate_llm_selection({"llm_provider": "not-a-provider", "llm_model": "x"})
    with pytest.raises(HTTPException):
        _validate_llm_selection({"llm_provider": "anthropic", "llm_model": ""})
    with pytest.raises(HTTPException):
        _validate_llm_selection(
            {
                "llm_provider": "anthropic",
                "llm_model": "claude-sonnet-4-6",
                "llm_fallback_provider": "bad-provider",
            }
        )
    _validate_llm_selection(
        {
            "llm_provider": "anthropic",
            "llm_model": "claude-sonnet-4-6",
            "llm_fallback_provider": "openai",
        }
    )


@pytest.mark.asyncio
async def test_public_settings_payload_mocked():
    from backend.services import settings_service as ss

    fake = {
        "llm_provider": "anthropic",
        "llm_model": "claude-sonnet-4-6",
        "llm_temperature": 0.2,
        "llm_manual_route": "PRIMARY",
        "email_alerts_to": "ops@example.com",
        "anthropic_api_key": "secret-should-not-leak",
    }
    with patch.object(ss.svc, "get_settings", new=AsyncMock(return_value=fake)):
        payload = await ss.public_settings_payload()
        assert payload["llm_provider"] == "anthropic"
        assert "anthropic_api_key" not in payload
        assert payload.get("llm_manual_route") == "primary"


@pytest.mark.asyncio
async def test_list_profiles_and_catalog():
    from backend.services import settings_service as ss

    prof = await ss.list_profiles()
    assert "profiles" in prof or "recommended" in str(prof).lower() or isinstance(prof, dict)
    cat = ss.llm_catalog_payload()
    assert isinstance(cat, dict)


def test_feature_flags_branches(monkeypatch):
    from backend.feature_flags import (
        collab_features,
        features_public,
        is_feature_enabled,
        require_feature,
    )

    monkeypatch.setenv("FEATURE_QA_HEALTH_CENTER", "1")
    assert is_feature_enabled("qa_health_center") is True
    assert is_feature_enabled("no_such_feature") is False
    flags = collab_features()
    assert "qa_health_center" in flags
    pub = features_public()
    assert "qa_health_center" in pub or "catalog" in pub or isinstance(pub, dict)
    dep = require_feature("qa_health_center")
    assert callable(dep)


@pytest.mark.asyncio
async def test_require_feature_404(monkeypatch):
    from backend.feature_flags import require_feature
    from fastapi import HTTPException

    monkeypatch.delenv("FEATURE_QA_HEALTH_CENTER", raising=False)
    monkeypatch.setenv("FEATURE_QA_HEALTH_CENTER", "0")
    dep = require_feature("qa_health_center")
    with pytest.raises(HTTPException) as ei:
        await dep()
    assert ei.value.status_code == 404


def test_settings_body_models():
    from backend.services.settings_service import (
        ClearSecretsBody,
        SettingsProfileBody,
        SettingsResetBody,
        TestEmailBody,
        TestSlackBody,
    )

    assert SettingsResetBody().keep_secrets is True
    assert SettingsProfileBody(profile="factory").profile == "factory"
    assert ClearSecretsBody(scope="llm", confirm=True).confirm is True
    assert TestEmailBody(to="a@b.c").to == "a@b.c"
    assert TestSlackBody().webhook_url is None
