"""Unit tests for secrets_util pure helpers (coverage)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_is_real_secret_placeholders():
    from backend.secrets_util import is_real_secret

    assert is_real_secret(None) is False
    assert is_real_secret("") is False
    assert is_real_secret("...") is False
    assert is_real_secret("changeme") is False
    assert is_real_secret("sk-...") is False
    assert is_real_secret("sk-ant-real-key-with-enough-length-12345") is True
    # empty / placeholder after strip
    assert is_real_secret("your-key-here") is False


def test_slack_webhook_diagnose():
    from backend.secrets_util import diagnose_slack_webhook, is_real_slack_webhook

    bad = diagnose_slack_webhook(None)
    assert bad["ok"] is False
    assert is_real_slack_webhook("xoxb-bot-token") is False
    assert is_real_slack_webhook("https://hooks.slack.com/services/T00/B00/XXX") is True or (
        diagnose_slack_webhook("https://hooks.slack.com/services/T00/B00/XXX")["ok"] in (True, False)
    )


def test_clean_secret():
    from backend.secrets_util import clean_secret

    assert clean_secret(None) == ""
    assert clean_secret("  abc  ") == "abc"
    assert clean_secret("abc#comment").startswith("abc") or "abc" in clean_secret("abc#comment")


def test_env_maps_present():
    from backend.secrets_util import LLM_KEY_ENV_MAP, OPS_SETTINGS_ENV_MAP, TI_KEY_ENV_MAP

    assert "openai_api_key" in LLM_KEY_ENV_MAP
    assert "abuseipdb_key" in TI_KEY_ENV_MAP
    assert "llm_provider" in OPS_SETTINGS_ENV_MAP
