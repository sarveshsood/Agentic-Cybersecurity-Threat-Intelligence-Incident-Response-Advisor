"""Attack matrix layout, OIDC disabled, OTEL status (offline)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_attack_matrix_layout():
    from backend.attack_catalog import matrix_layout

    m = matrix_layout()
    assert m["columns"]
    assert any(c["tactic"] for c in m["columns"])
    assert any(c["techniques"] for c in m["columns"])


def test_attack_matrix_route_registered():
    from backend.routers import incidents as ir

    paths = {getattr(r, "path", None) for r in ir.router.routes}
    assert "/attack/matrix" in paths


def test_oidc_disabled_by_default(monkeypatch):
    from backend.services import oidc_service as oidc

    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    monkeypatch.delenv("OIDC_CLIENT_ID", raising=False)
    assert oidc.oidc_enabled() is False
    assert oidc.oidc_config_public()["enabled"] is False


def test_oidc_routes_registered():
    from backend.routers import auth as ar

    # Auth router uses prefix="/auth" — full paths are /auth/oidc/*
    paths = {getattr(r, "path", None) for r in ar.router.routes}
    assert "/auth/oidc/config" in paths
    assert "/auth/oidc/login" in paths
    assert "/auth/oidc/callback" in paths


def test_public_register_allowed_in_lab(monkeypatch):
    from backend.services import auth_service as auth

    monkeypatch.delenv("ALLOW_PUBLIC_REGISTER", raising=False)
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    monkeypatch.delenv("OIDC_CLIENT_ID", raising=False)
    monkeypatch.setenv("ENV", "dev")
    assert auth.public_register_allowed() is True


def test_public_register_disabled_when_oidc(monkeypatch):
    from backend.services import auth_service as auth

    monkeypatch.delenv("ALLOW_PUBLIC_REGISTER", raising=False)
    monkeypatch.setenv("OIDC_ISSUER", "https://login.example.com")
    monkeypatch.setenv("OIDC_CLIENT_ID", "actira-app")
    monkeypatch.setenv("ENV", "dev")
    assert auth.public_register_allowed() is False


def test_public_register_disabled_in_production(monkeypatch):
    from backend.services import auth_service as auth

    monkeypatch.delenv("ALLOW_PUBLIC_REGISTER", raising=False)
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    monkeypatch.delenv("OIDC_CLIENT_ID", raising=False)
    monkeypatch.setenv("ENV", "production")
    assert auth.public_register_allowed() is False


def test_public_register_explicit_override(monkeypatch):
    from backend.services import auth_service as auth

    monkeypatch.setenv("ALLOW_PUBLIC_REGISTER", "true")
    monkeypatch.setenv("OIDC_ISSUER", "https://login.example.com")
    monkeypatch.setenv("OIDC_CLIENT_ID", "actira-app")
    monkeypatch.setenv("ENV", "production")
    assert auth.public_register_allowed() is True

    monkeypatch.setenv("ALLOW_PUBLIC_REGISTER", "false")
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    monkeypatch.delenv("OIDC_CLIENT_ID", raising=False)
    monkeypatch.setenv("ENV", "dev")
    assert auth.public_register_allowed() is False


def test_auth_public_config_includes_register_flag(monkeypatch):
    from backend.services import auth_service as auth

    monkeypatch.delenv("ALLOW_PUBLIC_REGISTER", raising=False)
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    monkeypatch.delenv("OIDC_CLIENT_ID", raising=False)
    monkeypatch.setenv("ENV", "dev")
    cfg = auth.auth_public_config()
    assert cfg["enabled"] is False
    assert cfg["public_register"] is True


def test_otel_setup_noop_without_env(monkeypatch):
    from backend import otel_setup

    monkeypatch.delenv("ACTIRA_OTEL_ENABLED", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    # reset module flags
    otel_setup._configured = False
    otel_setup._status = {
        "configured": False,
        "enabled_env": False,
        "endpoint_set": False,
        "sdk_available": False,
        "exporter": None,
        "error": None,
    }
    assert otel_setup.setup_otel() is False
    st = otel_setup.otel_status()
    assert st["configured"] is False
