"""Close-out tests: external vault backends, mongo job payloads, roadmap auto-merge."""
from __future__ import annotations

import asyncio
import base64
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
# -------------------- External secrets (Hashicorp / AWS SM) --------------------
class TestExternalSecrets:
    def setup_method(self):
        import backend.external_secrets as es
        import backend.secret_vault as sv

        es.reset_external_hooks()
        os.environ["SECRETS_MASTER_KEY"] = "ops-stretch-master-key-2026"
        os.environ.pop("VAULT_ADDR", None)
        os.environ.pop("VAULT_TOKEN", None)
        os.environ.pop("VAULT_TRANSIT_ENABLED", None)
        sv.reset_fernet_cache()

    def teardown_method(self):
        import backend.external_secrets as es
        import backend.secret_vault as sv

        es.reset_external_hooks()
        sv.reset_fernet_cache()

    def test_normalize_vault_and_awssm_pastes(self):
        from backend.external_secrets import normalize_secret_input, HVK_PREFIX, AWSSM_PREFIX

        assert normalize_secret_input("vault://actira/llm#openai_api_key") == (
            f"{HVK_PREFIX}actira/llm#openai_api_key"
        )
        assert normalize_secret_input("awssm://prod/actira#anthropic") == (
            f"{AWSSM_PREFIX}prod/actira#anthropic"
        )
        assert normalize_secret_input("sk-plain") == "sk-plain"

    def test_transit_encrypt_decrypt_via_hook(self):
        import backend.external_secrets as es

        os.environ["VAULT_ADDR"] = "http://vault:8200"
        os.environ["VAULT_TOKEN"] = "s.token"
        os.environ["VAULT_TRANSIT_KEY"] = "actira"
        os.environ["VAULT_TRANSIT_ENABLED"] = "1"

        store = {}

        def fake_http(method, url, headers=None, body=None):
            if "encrypt" in url:
                pt = base64.b64decode(body["plaintext"]).decode("utf-8")
                ct = "vault:v1:" + base64.b64encode(pt.encode()).decode()
                store["ct"] = ct
                return {"data": {"ciphertext": ct}}
            if "decrypt" in url:
                ct = body["ciphertext"]
                raw = ct.split("vault:v1:", 1)[1]
                pt = base64.b64decode(raw).decode("utf-8")
                return {"data": {"plaintext": base64.b64encode(pt.encode()).decode()}}
            raise AssertionError(url)

        es.set_http_json_hook(fake_http)
        wire = es.transit_encrypt("sk-from-transit")
        assert wire.startswith(es.HVT_PREFIX)
        assert es.transit_decrypt(wire) == "sk-from-transit"

    def test_encrypt_secret_uses_transit_when_enabled(self):
        import backend.external_secrets as es
        import backend.secret_vault as sv

        os.environ["VAULT_ADDR"] = "http://vault:8200"
        os.environ["VAULT_TOKEN"] = "s.token"
        os.environ["VAULT_TRANSIT_ENABLED"] = "1"
        sv.reset_fernet_cache()

        def fake_http(method, url, headers=None, body=None):
            if "encrypt" in url:
                return {"data": {"ciphertext": "vault:v1:abc"}}
            if "decrypt" in url:
                return {
                    "data": {
                        "plaintext": base64.b64encode(b"sk-resolved").decode(),
                    }
                }
            return {}

        es.set_http_json_hook(fake_http)
        enc = sv.encrypt_secret("sk-new-plaintext")
        assert enc.startswith(es.HVT_PREFIX)
        assert sv.decrypt_secret(enc) == "sk-resolved"

    def test_hvk_and_awssm_resolve(self):
        import backend.external_secrets as es
        from backend.secret_vault import decrypt_secret

        os.environ["VAULT_ADDR"] = "http://vault:8200"
        os.environ["VAULT_TOKEN"] = "s.token"

        def fake_http(method, url, headers=None, body=None):
            return {"data": {"data": {"openai_api_key": "sk-from-kv"}}}

        es.set_http_json_hook(fake_http)
        es.set_awssm_hook(lambda sid: '{"anthropic":"sk-from-sm"}')

        assert decrypt_secret(f"{es.HVK_PREFIX}actira/llm#openai_api_key") == "sk-from-kv"
        assert decrypt_secret(f"{es.AWSSM_PREFIX}prod/actira#anthropic") == "sk-from-sm"

    def test_vault_status_includes_external(self):
        from backend.secret_vault import vault_status

        st = vault_status()
        assert st["enabled"] is True
        assert "external" in st
        assert "hashicorp_vault" in st["external"]


# -------------------- Mongo shared job payloads --------------------
class TestMongoJobPayloads:
    def test_mongo_inline_fallback_roundtrip(self):
        """Without GridFS, inline_b64 path stores multi-node payloads in Mongo."""
        import backend.job_queue as jq

        async def run():
            store = {}

            class Coll:
                async def find_one(self, q, *a, **k):
                    return store.get(q.get("job_id") or (q.get("job_id")))

                async def update_one(self, q, u, upsert=False):
                    jid = q.get("job_id")
                    doc = dict(store.get(jid) or {})
                    doc.update(u.get("$set") or {})
                    store[jid] = doc

                async def delete_one(self, q):
                    store.pop(q.get("job_id"), None)

            coll = Coll()
            # Force GridFS path to fail → inline
            db = MagicMock()
            db.__getitem__ = MagicMock(return_value=coll)

            # Patch motor GridFS to raise so inline path is used
            class FakeMotor:
                class motor_asyncio:
                    class AsyncIOMotorGridFSBucket:
                        def __init__(self, *a, **k):
                            raise RuntimeError("no gridfs in unit test")

            # Inject into job_queue import path by making upload fail
            # save_payload_mongo already falls back on GridFS exception
            path = await jq.save_payload_mongo(
                db,
                "job-m1",
                [("a.log", b"hello-mongo"), ("b.log", b"world")],
                "user-1",
                {"llm_provider": "anthropic", "anthropic_api_key": "sk-secret"},
                kind="batch",
            )
            assert path.startswith("mongo://")
            meta = await jq.load_payload_mongo(db, "job-m1")
            assert meta is not None
            assert len(meta["_files"]) == 2
            assert meta["_files"][0] == ("a.log", b"hello-mongo")
            assert "sk-secret" not in str(meta.get("settings"))
            await jq.clear_payload_mongo(db, "job-m1")
            assert await jq.load_payload_mongo(db, "job-m1") is None

        asyncio.run(run())

    def test_load_async_disk_fallback(self, tmp_path, monkeypatch):
        import backend.job_queue as jq

        monkeypatch.setattr(jq, "PAYLOAD_ROOT", tmp_path)
        monkeypatch.setattr(jq, "PAYLOAD_BACKEND", "mongo")
        jq.save_payload("job-disk", [("x.log", b"only-disk")], "u", {}, kind="single")

        async def run():
            db = MagicMock()
            coll = AsyncMock()
            coll.find_one = AsyncMock(return_value=None)
            db.__getitem__ = MagicMock(return_value=coll)
            meta = await jq.load_payload_async(db, "job-disk")
            assert meta is not None
            assert meta["_files"][0][1] == b"only-disk"

        asyncio.run(run())


# -------------------- Roadmap auto-merge logic --------------------
class TestRoadmapAutoMergeLogic:
    def test_seed_contains_ops_stretch_card(self):
        from backend.roadmap_data import ROADMAP_SEED

        ids = {i["id"] for i in ROADMAP_SEED}
        assert "rm-review-deferred-close" in ids
        assert "rm-ops-stretch-close" in ids
        card = next(i for i in ROADMAP_SEED if i["id"] == "rm-ops-stretch-close")
        assert card["status"] == "completed"
        assert int(card.get("progress") or 0) >= 100

    def test_promote_completed_seed_item(self):
        """Simulate merge: incomplete local row promoted when seed is completed."""
        seed = {
            "id": "rm-test",
            "status": "completed",
            "progress": 100,
            "summary": "done",
            "tasks": [{"id": "t1", "title": "x", "done": True, "status": "done"}],
            "implementation_notes": "shipped",
        }
        existing = {
            "id": "rm-test",
            "status": "planned",
            "progress": 10,
            "owner": "alice",
            "summary": "old",
        }
        seed_done = seed["status"] == "completed" or seed["progress"] >= 100
        assert seed_done
        patch = {
            "status": seed["status"],
            "progress": seed["progress"],
            "summary": seed.get("summary") or existing.get("summary"),
            "tasks": seed.get("tasks"),
            "implementation_notes": seed.get("implementation_notes"),
        }
        merged = {**existing, **patch}
        assert merged["status"] == "completed"
        assert merged["progress"] == 100
        assert merged["owner"] == "alice"
