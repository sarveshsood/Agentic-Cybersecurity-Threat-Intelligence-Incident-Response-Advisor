"""Unit tests for remaining P1 items: auth_throttle, enrichment cache, notifications, job queue helpers."""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
# -------------------- A-T1 auth_throttle (memory path) --------------------
class TestAuthThrottleMemory:
    def setup_method(self):
        import backend.auth_throttle as at
        at._login_failures.clear()
        at._rate_limit.clear()

    def test_rate_limit_memory_blocks(self):
        import backend.auth_throttle as at

        async def run():
            # A-A3: Mongo find_one_and_update is the allow/deny source of truth.
            store: dict = {}

            async def find_one_and_update(query, update, upsert=False, return_document=None):
                ip = query.get("_id")
                hits = list((store.get(ip) or {}).get("hits") or [])
                push = (update.get("$push") or {}).get("hits") or {}
                each = push.get("$each") or []
                hits.extend(each)
                slice_n = push.get("$slice")
                if slice_n is not None:
                    hits = hits[int(slice_n):]
                store[ip] = {"_id": ip, "hits": hits}
                return store[ip]

            coll = AsyncMock()
            coll.find_one_and_update = AsyncMock(side_effect=find_one_and_update)
            coll.update_one = AsyncMock()
            db = MagicMock()
            db.__getitem__ = MagicMock(return_value=coll)
            for _ in range(3):
                ok = await at.rate_limit_allow(db, "1.2.3.4", window_seconds=60, max_attempts=3)
                assert ok is True
            blocked = await at.rate_limit_allow(db, "1.2.3.4", window_seconds=60, max_attempts=3)
            assert blocked is False

        asyncio.run(run())

    def test_login_lockout_memory_and_persist(self):
        import backend.auth_throttle as at

        async def run():
            store: dict = {}

            async def find_one(query):
                return store.get(query.get("_id"))

            async def find_one_and_update(query, update, upsert=False, return_document=None):
                key = query.get("_id")
                doc = dict(store.get(key) or {"_id": key, "count": 0, "locked_until": None})
                inc = (update.get("$inc") or {}).get("count") or 0
                doc["count"] = int(doc.get("count") or 0) + int(inc)
                if "$set" in update:
                    doc.update(update["$set"])
                store[key] = doc
                return doc

            async def update_one(query, update):
                key = query.get("_id")
                doc = dict(store.get(key) or {"_id": key})
                if "$set" in update:
                    doc.update(update["$set"])
                store[key] = doc

            async def delete_one(query):
                store.pop(query.get("_id"), None)

            coll = AsyncMock()
            coll.find_one = AsyncMock(side_effect=find_one)
            coll.find_one_and_update = AsyncMock(side_effect=find_one_and_update)
            coll.update_one = AsyncMock(side_effect=update_one)
            coll.delete_one = AsyncMock(side_effect=delete_one)
            db = MagicMock()
            db.__getitem__ = MagicMock(return_value=coll)

            msg = None
            for _ in range(5):
                msg = await at.record_login_failure(db, "user@x.com", limit=5)
            assert msg and "Locked" in msg
            locked, mins = await at.get_login_lockout_status(db, "user@x.com")
            assert locked is True
            assert mins and mins >= 1
            await at.clear_login_failures(db, "user@x.com")
            locked2, _ = await at.get_login_lockout_status(db, "user@x.com")
            assert locked2 is False

        asyncio.run(run())


# -------------------- A-E2 enrichment cache --------------------
class TestEnrichmentCache:
    def setup_method(self):
        from backend.enrichment_cache import mem_clear
        mem_clear()

    def test_mem_roundtrip_ttl(self):
        from backend.enrichment_cache import make_key, mem_get, mem_put, mode_signature

        sig = mode_signature(force_mock=True, allow_mock=True, has_any_key=False)
        key = make_key("ip", "1.2.3.4", sig)
        mem_put(key, {"threat_score": 42.0, "enrichment": {"x": 1}}, ttl_sec=60)
        hit = mem_get(key)
        assert hit["threat_score"] == 42.0
        assert hit["enrichment"]["x"] == 1

    def test_ttl_zero_disables(self):
        from backend.enrichment_cache import _ttl_seconds
        assert _ttl_seconds({"enrichment_cache_ttl_hours": 0}) == 0
        assert _ttl_seconds({"enrichment_cache_ttl_hours": 2}) == 7200

    def test_apply_cached_to_ioc(self):
        from backend.enrichment_cache import apply_cached_to_ioc
        from backend.models import IoC

        ioc = IoC(type="ip", value="8.8.8.8")
        apply_cached_to_ioc(ioc, {"threat_score": 11, "enrichment": {"abuseipdb": {"score": 11}}})
        assert ioc.threat_score == 11
        assert ioc.enrichment.get("cache_hit") is True


# -------------------- A-T3 notifications --------------------
class TestNotificationsHelpers:
    def test_formsubmit_parse_activation(self):
        from backend.notifications import _parse_formsubmit_response

        r = _parse_formsubmit_response(
            200,
            '{"success":"false","message":"Please check your email for form activation"}',
        )
        assert r["needs_activation"] is True
        assert r["state"] == "needs_activation"

    def test_formsubmit_parse_ok(self):
        from backend.notifications import _parse_formsubmit_response

        r = _parse_formsubmit_response(200, '{"success":"true","message":"ok"}')
        assert r["delivered"] is True
        assert r["ok"] is True

    def test_slack_diagnose_placeholder(self):
        from backend.secrets_util import diagnose_slack_webhook

        d = diagnose_slack_webhook("https://hooks.slack.com/services/SMOKE/TEST/xxx")
        assert d.get("ok") is False

    def test_http_gateway_default_prod_off(self, monkeypatch):
        import importlib
        import backend.notifications as n

        monkeypatch.setenv("ENV", "prod")
        monkeypatch.delenv("EMAIL_HTTP_GATEWAY", raising=False)
        importlib.reload(n)
        assert n.http_gateway_enabled() is False
        monkeypatch.setenv("ENV", "dev")
        importlib.reload(n)
        assert n.http_gateway_enabled() is True


# -------------------- A-T2 job SSE payload shape + queue helpers --------------------
class TestJobQueueAndSseShape:
    def test_save_load_clear_payload(self, tmp_path, monkeypatch):
        import backend.job_queue as jq

        monkeypatch.setattr(jq, "PAYLOAD_ROOT", tmp_path)
        monkeypatch.setattr(jq, "PAYLOAD_BACKEND", "disk")
        jid = "job-test-1"
        path = jq.save_payload(
            jid,
            [("a.log", b"hello"), ("b.log", b"world")],
            "user-1",
            {"llm_provider": "anthropic"},
            kind="batch",
        )
        assert Path(path).exists()
        meta = jq.load_payload(jid)
        assert meta is not None
        assert len(meta["_files"]) == 2
        assert meta["_files"][0][0] == "a.log"
        assert meta["user_id"] == "user-1"
        jq.clear_payload(jid)
        assert jq.load_payload(jid) is None

    def test_sse_payload_prefers_incident_ids(self):
        """Document expected SSE fields after A-S4."""
        doc = {
            "status": "done",
            "progress": 100,
            "incident_ids": ["inc-1", "inc-2"],
            "error": None,
        }
        ids = doc.get("incident_ids") or []
        first = ids[0] if ids else doc.get("incident_id")
        payload = {
            "incident_ids": ids,
            "incident_id": first,
            "status": doc["status"],
        }
        assert payload["incident_id"] == "inc-1"
        assert payload["incident_ids"] == ["inc-1", "inc-2"]

    def test_force_requeue_requires_payload(self, tmp_path, monkeypatch):
        import backend.job_queue as jq

        monkeypatch.setattr(jq, "PAYLOAD_ROOT", tmp_path)
        monkeypatch.setattr(jq, "PAYLOAD_BACKEND", "disk")

        async def run():
            coll = AsyncMock()
            coll.find_one = AsyncMock(
                return_value={"id": "j1", "status": "failed", "queue_state": "failed"}
            )
            coll.update_one = AsyncMock()
            db = MagicMock()
            db.log_jobs = coll

            with pytest.raises(ValueError, match="durable payload"):
                await jq.force_requeue(db, "j1")

            jq.save_payload("j1", [("a.log", b"x")], "u1", {}, kind="single")
            out = await jq.force_requeue(db, "j1")
            assert out["ok"] is True
            assert out["status"] == "queued"
            coll.update_one.assert_called()

        asyncio.run(run())

    def test_payload_scrubs_secrets(self, tmp_path, monkeypatch):
        import backend.job_queue as jq
        import json

        monkeypatch.setattr(jq, "PAYLOAD_ROOT", tmp_path)
        monkeypatch.setattr(jq, "PAYLOAD_BACKEND", "disk")
        jid = "job-secret-1"
        jq.save_payload(
            jid,
            [("a.log", b"x")],
            "u1",
            {
                "llm_provider": "anthropic",
                "llm_temperature": 0.2,
                "anthropic_api_key": "sk-ant-secret-should-not-land",
                "openai_api_key": "sk-proj-secret",
                "slack_webhook_url": "https://hooks.slack.com/services/T/B/xxx",
            },
            kind="single",
        )
        meta_path = tmp_path / jid / "meta.json"
        text = meta_path.read_text(encoding="utf-8")
        assert "sk-ant-secret" not in text
        assert "sk-proj-secret" not in text
        assert "hooks.slack.com" not in text
        meta = json.loads(text)
        assert meta.get("settings_secrets_redacted") is True
        assert meta["settings"]["llm_provider"] == "anthropic"
        assert "anthropic_api_key" not in meta["settings"]

    def test_merge_settings_with_live_restores_secrets(self):
        import backend.job_queue as jq

        merged = jq.merge_settings_with_live(
            {"llm_provider": "groq", "llm_temperature": 0.1},
            {
                "llm_provider": "anthropic",
                "anthropic_api_key": "sk-live",
                "llm_temperature": 0.9,
            },
        )
        # Non-secret from payload kept
        assert merged["llm_provider"] == "groq"
        assert merged["llm_temperature"] == 0.1
        # Secret from live
        assert merged["anthropic_api_key"] == "sk-live"

    def test_requeue_on_startup_updates_running(self):
        import backend.job_queue as jq

        async def run():
            result = MagicMock()
            result.modified_count = 2
            coll = AsyncMock()
            coll.update_many = AsyncMock(return_value=result)
            db = MagicMock()
            db.log_jobs = coll
            n = await jq.requeue_on_startup(db)
            assert n == 2
            coll.update_many.assert_called_once()
            filt = coll.update_many.call_args[0][0]
            assert filt["status"]["$nin"] == ["done", "failed"]

        asyncio.run(run())


# -------------------- AI investigator fallback messaging --------------------
class TestInvestigatorFallback:
    def test_fallback_includes_api_key_hint(self):
        from backend.ai_investigator import _fallback_answer

        data = _fallback_answer(
            {"title": "t", "severity": "high", "threat_score": 80, "techniques": []},
            "why?",
            error=RuntimeError("ANTHROPIC_API_KEY not configured (set in Settings UI)"),
        )
        assert data["fallback"] is True
        assert any("API key" in u or "Settings" in u for u in data["unknowns"])
        assert "not configured" in data["fallback_reason"].lower() or "API key" in data["fallback_reason"]
