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
