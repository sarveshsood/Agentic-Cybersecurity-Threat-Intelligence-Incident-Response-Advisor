"""Audit normalization, integrity hashing, routes (offline-friendly)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_compute_and_verify_entry_hash():
    from backend.repositories.audit import compute_entry_hash, verify_entry_hash

    doc = {
        "id": "e1",
        "ts": "2026-07-26T12:00:00+00:00",
        "actor_id": "u1",
        "actor_email": "a@example.com",
        "action": "review.approve",
        "target_type": "incident",
        "target_id": "inc-1",
        "detail": {"notes": "looks good"},
        "prev_hash": "",
    }
    h = compute_entry_hash(
        entry_id=doc["id"],
        ts=doc["ts"],
        actor_id=doc["actor_id"],
        actor_email=doc["actor_email"],
        action=doc["action"],
        target_type=doc["target_type"],
        target_id=doc["target_id"],
        detail=doc["detail"],
        prev_hash=doc["prev_hash"],
    )
    doc["entry_hash"] = h
    assert verify_entry_hash(doc)
    doc["detail"] = {"notes": "tampered"}
    assert not verify_entry_hash(doc)


@pytest.mark.asyncio
async def test_list_actions_shape(monkeypatch):
    from backend.services import audit_service as asvc
    from backend.repositories import audit as arepo

    async def fake_distinct(*, limit=200):
        return ["review.approve", "settings.update", "kb.ingest"]

    monkeypatch.setattr(arepo.audit_repo, "distinct_actions", fake_distinct)
    out = await asvc.list_actions(limit=50)
    assert out["count"] == 3
    assert "review.approve" in out["actions"]
    assert out["source"] == "mongo_distinct"


def test_normalize_audit_row_maps_ui_fields():
    from backend.services.audit_service import normalize_audit_row
    from backend.repositories.audit import compute_entry_hash

    raw = {
        "id": "e2",
        "ts": "2026-07-26T12:00:00+00:00",
        "actor_id": "sub-1",
        "actor_email": "analyst@actira.local",
        "action": "review.reject",
        "target_type": "incident",
        "target_id": "inc-99",
        "detail": {"notes": "needs more IoCs"},
        "prev_hash": "",
    }
    raw["entry_hash"] = compute_entry_hash(
        entry_id=raw["id"],
        ts=raw["ts"],
        actor_id=raw["actor_id"],
        actor_email=raw["actor_email"],
        action=raw["action"],
        target_type=raw["target_type"],
        target_id=raw["target_id"],
        detail=raw["detail"],
        prev_hash=raw["prev_hash"],
    )
    row = normalize_audit_row(raw)
    assert row["incident_id"] == "inc-99"
    assert row["analyst"] == "analyst@actira.local"
    assert row["comment"] == "needs more IoCs"
    assert row["timestamp"] == raw["ts"]
    assert row["action"] == "review.reject"
    # Inspector payload fields for audit file-view style drawer
    assert row["detail"] == raw["detail"]
    assert row["entry_hash"] == raw["entry_hash"]
    assert row["hash_ok"] is True


def test_audit_routes_registered():
    from backend.routers import audit as ar

    paths = {getattr(r, "path", None) for r in ar.router.routes}
    assert "/audit" in paths
    assert "/audit/logs" in paths
    assert "/audit/summary" in paths
    assert "/audit/integrity" in paths
    assert "/audit/telemetry" in paths
    assert "/audit/actions" in paths
