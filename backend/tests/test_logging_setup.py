"""Physical log routing + user context in log records."""
from __future__ import annotations

import logging
from pathlib import Path

import jwt
import pytest

from backend.auth import JWT_ALGO, JWT_SECRET
from backend.logging_setup import (
    RequestContextFilter,
    configure_logging,
    identity_from_authorization,
    resolve_log_path,
)
from backend.request_context import bind_log_context, get_user, get_user_id


def test_resolve_log_path_default(monkeypatch, tmp_path):
    monkeypatch.delenv("LOG_DIR", raising=False)
    monkeypatch.delenv("LOG_FILE", raising=False)
    p = resolve_log_path()
    assert p.name == "actira.log"
    assert p.parent.name == "logs"


def test_resolve_log_path_custom_dir(monkeypatch, tmp_path):
    monkeypatch.setenv("LOG_DIR", str(tmp_path / "custom-logs"))
    monkeypatch.setenv("LOG_FILE", "ops.log")
    p = resolve_log_path()
    assert p == tmp_path / "custom-logs" / "ops.log"


def test_log_file_strips_path_traversal(monkeypatch, tmp_path):
    monkeypatch.setenv("LOG_DIR", str(tmp_path))
    monkeypatch.setenv("LOG_FILE", "../../evil.log")
    p = resolve_log_path()
    assert p.name == "evil.log"
    assert p.parent == tmp_path


def test_configure_logging_writes_file(monkeypatch, tmp_path):
    monkeypatch.setenv("LOG_TO_FILE", "1")
    monkeypatch.setenv("LOG_DIR", str(tmp_path))
    monkeypatch.setenv("LOG_FILE", "test-actira.log")
    monkeypatch.setenv("LOG_LEVEL", "INFO")
    path = configure_logging(force=True)
    assert path is not None
    assert path.exists() or path.parent.exists()

    with bind_log_context(request_id="rid-test", email="analyst@example.com", user_id="u1", role="analyst"):
        log = logging.getLogger("actira.test")
        log.info("hello-audit")

    # Force flush
    for h in logging.getLogger().handlers:
        h.flush()

    text = path.read_text(encoding="utf-8")
    assert "hello-audit" in text
    assert "analyst@example.com" in text
    assert "rid-test" in text
    # Structured audit fields on every line
    assert "[user=analyst@example.com]" in text
    assert "[uid=u1]" in text
    assert "[role=analyst]" in text


def test_request_context_filter_injects_fields():
    with bind_log_context(request_id="abc", email="rev@soc.example.com", user_id="uid-9", role="senior_reviewer"):
        assert get_user() == "rev@soc.example.com"
        assert get_user_id() == "uid-9"
        rec = logging.LogRecord(
            name="t",
            level=logging.INFO,
            pathname=__file__,
            lineno=1,
            msg="x",
            args=(),
            exc_info=None,
        )
        assert RequestContextFilter().filter(rec) is True
        assert rec.request_id == "abc"  # type: ignore[attr-defined]
        assert rec.user == "rev@soc.example.com"  # type: ignore[attr-defined]
        assert rec.user_role == "senior_reviewer"  # type: ignore[attr-defined]


def test_identity_from_authorization():
    token = jwt.encode(
        {"sub": "user-42", "email": "ops@soc.example.com", "role": "admin"},
        JWT_SECRET,
        algorithm=JWT_ALGO,
    )
    ident = identity_from_authorization(f"Bearer {token}")
    assert ident["user_id"] == "user-42"
    assert ident["email"] == "ops@soc.example.com"
    assert ident["role"] == "admin"

    assert identity_from_authorization(None)["user_id"] == ""
    assert identity_from_authorization("Basic x")["email"] == ""
    assert identity_from_authorization("Bearer not-a-jwt")["user_id"] == ""
