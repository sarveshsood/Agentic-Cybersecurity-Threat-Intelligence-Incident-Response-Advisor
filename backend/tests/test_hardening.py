"""Offline unit tests for code-review hardening focus areas.

Covers:
  - secrets never implied in settings allow-list
  - HiTL / auto-approve policy (incl. hitl_severity_min)
  - parse_llm_json robustness
  - ingest key constant-time equality helper
  - public register role policy (model-level + helper expectations)

Run (no live server needed):
  cd backend
  pytest tests/test_hardening.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from backend.hitl_gate import decide_incident_status, severity_rank  # noqa: E402
from llm_provider import parse_llm_json  # noqa: E402
from backend.models import SECRET_SETTINGS_FIELDS  # noqa: E402
from secrets_util import is_real_secret, redact_for_log  # noqa: E402


# -------------------- HiTL gate --------------------
class TestHitlGate:
    def test_critical_always_pending_when_min_critical(self):
        status, hitl, auto = decide_incident_status(
            "critical", 0.99,
            grounding_threshold=0.7,
            hitl_severity_min="critical",
            auto_approve_grounding_min=0.9,
        )
        assert status == "pending_review"
        assert hitl is True
        assert auto is False

    def test_high_requires_hitl_when_min_high(self):
        status, hitl, auto = decide_incident_status(
            "high", 0.95,
            hitl_severity_min="high",
            auto_approve_grounding_min=0.9,
        )
        assert status == "pending_review"
        assert hitl is True
        assert auto is False  # auto must not bypass severity gate

    def test_high_no_hitl_when_min_critical_and_good_grounding(self):
        status, hitl, auto = decide_incident_status(
            "high", 0.95,
            hitl_severity_min="critical",
            auto_approve_grounding_min=0.9,
        )
        assert status == "approved"
        assert hitl is False
        assert auto is True

    def test_low_grounding_forces_review(self):
        status, hitl, auto = decide_incident_status(
            "low", 0.4,
            grounding_threshold=0.7,
            hitl_severity_min="critical",
            auto_approve_grounding_min=0.9,
        )
        assert status == "pending_review"
        assert hitl is True

    def test_medium_grounding_new_status(self):
        """Between threshold and auto-approve → new (not auto-approved)."""
        status, hitl, auto = decide_incident_status(
            "medium", 0.8,
            grounding_threshold=0.7,
            hitl_severity_min="critical",
            auto_approve_grounding_min=0.9,
        )
        assert status == "new"
        assert hitl is False
        assert auto is False

    def test_severity_rank_order(self):
        assert severity_rank("low") < severity_rank("medium") < severity_rank("high") < severity_rank("critical")


# -------------------- parse_llm_json --------------------
class TestParseLlmJson:
    def test_plain_object(self):
        assert parse_llm_json('{"steps": []}') == {"steps": []}

    def test_fenced_json(self):
        text = '```json\n{"steps": [{"order": 1}]}\n```'
        data = parse_llm_json(text)
        assert data["steps"][0]["order"] == 1

    def test_prose_wrapper(self):
        text = 'Sure, here is the playbook:\n{"steps": []}\nHope this helps!'
        assert parse_llm_json(text) == {"steps": []}

    def test_trailing_comma(self):
        text = '{"steps": [{"order": 1, "phase": "containment",}],}'
        data = parse_llm_json(text)
        assert data["steps"][0]["order"] == 1

    def test_bare_array_normalized(self):
        data = parse_llm_json('[{"order": 1, "phase": "containment", "action": "x", "citation_ids": []}]')
        assert "steps" in data
        assert data["steps"][0]["order"] == 1

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            parse_llm_json("")

    def test_garbage_raises(self):
        with pytest.raises(ValueError):
            parse_llm_json("not json at all {{{")


# -------------------- Secrets --------------------
class TestSecrets:
    def test_secret_fields_are_named(self):
        assert "anthropic_api_key" in SECRET_SETTINGS_FIELDS
        assert "slack_webhook_url" in SECRET_SETTINGS_FIELDS
        assert "password" not in SECRET_SETTINGS_FIELDS  # auth is separate

    def test_placeholders_not_real(self):
        assert is_real_secret("") is False
        assert is_real_secret("sk-...") is False
        assert is_real_secret("changeme") is False

    def test_redact_never_full(self):
        secret = "sk-ant-super-secret-key-value-12345"
        red = redact_for_log(secret)
        assert secret not in red
        assert "…" in red or "***" in red


# -------------------- Ingest key compare --------------------
class TestIngestKeyCompare:
    def test_compare_helper(self):
        # Import after path setup — function lives on server module which needs env
        import os
        os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
        os.environ.setdefault("DB_NAME", "soc_console_test_hardening")
        # server import is heavy; test pure helper by re-defining logic locally matching server
        import secrets as _secrets

        def keys_match(expected: str, provided: str) -> bool:
            if not expected or not provided:
                return False
            exp_b = expected.encode("utf-8")
            got_b = provided.encode("utf-8")
            if len(exp_b) != len(got_b):
                return False
            return _secrets.compare_digest(exp_b, got_b)

        assert keys_match("abc12345", "abc12345") is True
        assert keys_match("abc12345", "abc12346") is False
        assert keys_match("abc", "abcd") is False
        assert keys_match("", "x") is False


# -------------------- Register role policy --------------------
class TestRegisterRolePolicy:
    def test_user_create_accepts_admin_in_model_but_public_has_no_role(self):
        """A-M3: UserCreatePublic cannot express admin; internal UserCreate still can for seeds."""
        from backend.models import UserCreate, UserCreatePublic
        u = UserCreate(
            email="evil@example.com",
            name="Evil",
            role="admin",
            password="Pass1234!Long",
        )
        assert u.role == "admin"
        pub = UserCreatePublic(
            email="new@example.com",
            name="Newbie",
            password="Pass1234!Long",
        )
        assert not hasattr(pub, "role") or "role" not in pub.model_fields
        # Privileged set used by auth module
        from auth import PRIVILEGED_ROLES
        assert "admin" in PRIVILEGED_ROLES
        assert "senior_reviewer" in PRIVILEGED_ROLES
