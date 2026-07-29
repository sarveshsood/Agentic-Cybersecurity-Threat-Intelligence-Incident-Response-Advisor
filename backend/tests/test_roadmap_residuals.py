"""Tests for roadmap residual features: judge, MFA helpers, embedding profile, ops bus."""
from __future__ import annotations

import os


def test_playbook_judge_missing_phases():
    from backend.playbook_judge import judge_playbook

    v = judge_playbook({"steps": [{"phase": "containment", "action": "isolate host now", "citation_ids": ["T1"]}]})
    assert v["ok"] is False
    assert any("missing_phases" in f for f in v["findings"])


def test_playbook_judge_full_structure():
    from backend.playbook_judge import judge_playbook

    steps = [
        {"phase": "containment", "action": "Isolate affected hosts from network", "citation_ids": ["A"]},
        {"phase": "eradication", "action": "Remove malware and reset credentials", "citation_ids": ["A"]},
        {"phase": "recovery", "action": "Restore from known-good backups carefully", "citation_ids": ["B"]},
        {"phase": "lessons_learned", "action": "Update detections and document timeline", "citation_ids": ["B"]},
    ]
    v = judge_playbook({"steps": steps}, valid_citation_ids={"A", "B"})
    assert v["ok"] is True
    assert v["confidence"] >= 0.7


def test_embedding_profile_quality(monkeypatch):
    from backend import embeddings

    monkeypatch.delenv("ACTIRA_EMBEDDING_BACKEND", raising=False)
    monkeypatch.setenv("ACTIRA_EMBEDDING_PROFILE", "quality")
    assert embeddings._env_backend() == "sbert"
    monkeypatch.setenv("ACTIRA_EMBEDDING_PROFILE", "offline")
    assert embeddings._env_backend() == "hash"
    monkeypatch.setenv("ACTIRA_EMBEDDING_PROFILE", "auto")
    monkeypatch.setenv("ENV", "test")
    assert embeddings._env_backend() == "hash"


def test_mfa_disabled_by_default(monkeypatch):
    monkeypatch.delenv("FEATURE_MFA", raising=False)
    from backend import mfa

    assert mfa.mfa_feature_enabled() is False


def test_mfa_challenge_roundtrip(monkeypatch):
    monkeypatch.setenv("FEATURE_MFA", "1")
    from backend import mfa

    # Without pyotp, available() may be false — challenge store still works
    tok = mfa.create_pending_challenge("u1", "a@b.com", "admin", name="A")
    row = mfa.consume_pending(tok)
    assert row and row["user_id"] == "u1"
    assert mfa.consume_pending(tok) is None


def test_ops_bus_module_importable():
    from backend import ops_bus

    assert ops_bus.COLLECTION == "ops_bus"


def test_tenancy_disabled_by_default(monkeypatch):
    monkeypatch.delenv("FEATURE_MULTI_TENANT", raising=False)
    from backend import tenancy

    assert tenancy.multi_tenant_enabled() is False
    assert tenancy.org_filter() == {}
    assert tenancy.stamp_org({"id": "1"}) == {"id": "1"}


def test_tenancy_stamp_and_filter(monkeypatch):
    monkeypatch.setenv("FEATURE_MULTI_TENANT", "1")
    monkeypatch.setenv("ACTIRA_DEFAULT_ORG_ID", "acme")
    # re-import not needed — functions read env live
    from backend import tenancy

    assert tenancy.multi_tenant_enabled() is True
    assert tenancy.org_filter() == {"org_id": "acme"}
    assert tenancy.stamp_org({"id": "1"})["org_id"] == "acme"
    pub = tenancy.status_public()
    assert pub["mode"] == "multi_tenant_scaffold"
    assert pub["feature_enabled"] is True


def test_embedding_auto_prod_uses_sbert(monkeypatch):
    from backend import embeddings

    monkeypatch.delenv("ACTIRA_EMBEDDING_BACKEND", raising=False)
    monkeypatch.setenv("ACTIRA_EMBEDDING_PROFILE", "auto")
    monkeypatch.setenv("ENV", "production")
    assert embeddings._env_backend() == "sbert"
    monkeypatch.setenv("ENV", "dev")
    assert embeddings._env_backend() == "hash"


def test_llm_judge_flag_off(monkeypatch):
    monkeypatch.delenv("ACTIRA_PLAYBOOK_JUDGE_LLM", raising=False)
    from backend.playbook_judge import llm_judge_enabled

    assert llm_judge_enabled() is False
