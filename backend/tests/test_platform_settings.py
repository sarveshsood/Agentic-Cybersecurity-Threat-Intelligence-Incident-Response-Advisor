"""Platform settings defaults + env apply."""
from __future__ import annotations

import os

from backend.models import Settings, SECRET_SETTINGS_FIELDS
from backend.platform_settings import (
    FACTORY_PLATFORM,
    RECOMMENDED_PLATFORM,
    apply_platform_to_environ,
    public_platform_payload,
)


def test_settings_model_includes_platform_defaults():
    s = Settings()
    assert s.enrich_concurrency == 8
    assert s.parse_concurrency == 4
    assert s.log_format == "text"
    assert s.audit_worm_enabled is True
    assert s.job_artifacts_enabled is False
    assert s.ti_http_timeout == 8.0
    assert "audit_siem_webhook_url" in SECRET_SETTINGS_FIELDS
    assert "job_broker_url" in SECRET_SETTINGS_FIELDS


def test_apply_platform_to_environ(monkeypatch):
    # Isolate from suite pollution — restore env after test
    for key in (
        "LOG_FORMAT",
        "ENRICH_CONCURRENCY",
        "PARSE_CONCURRENCY",
        "LOG_TO_FILE",
    ):
        monkeypatch.delenv(key, raising=False)
    doc = {
        **FACTORY_PLATFORM,
        "log_format": "json",
        "enrich_concurrency": 12,
        "parse_concurrency": 6,
    }
    apply_platform_to_environ(doc)
    assert os.environ.get("LOG_FORMAT") == "json"
    assert os.environ.get("ENRICH_CONCURRENCY") == "12"
    assert os.environ.get("PARSE_CONCURRENCY") == "6"
    assert os.environ.get("LOG_TO_FILE") == "1"


def test_public_platform_payload_no_secrets():
    doc = Settings(
        audit_siem_webhook_url="https://hook.example/x",
        job_broker_url="amqp://guest:guest@localhost:5672/",
    ).model_dump()
    pub = public_platform_payload(doc)
    assert "audit_siem_webhook_url" not in pub
    assert "job_broker_url" not in pub
    assert pub["has_audit_siem_webhook"] is True
    assert pub["has_job_broker_url"] is True
    assert pub["enrich_concurrency"] == 8


def test_recommended_stricter_than_factory():
    assert RECOMMENDED_PLATFORM["log_format"] == "json"
    assert RECOMMENDED_PLATFORM["ti_http_retries"] >= FACTORY_PLATFORM["ti_http_retries"]
    assert RECOMMENDED_PLATFORM["job_artifacts_enabled"] is True
