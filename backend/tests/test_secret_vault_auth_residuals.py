"""Unit tests for residual module-review items: A-S3 vault, A-A3 throttle atomicity."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


# -------------------- A-S3 encrypt-at-rest vault --------------------
class TestSecretVault:
    def setup_method(self):
        import secret_vault as sv

        os.environ["SECRETS_MASTER_KEY"] = "unit-test-master-key-actira-residuals-2026"
        os.environ.setdefault("JWT_SECRET", "unit-test-jwt-secret-not-for-prod")
        # Isolate from host Vault env so key_source stays local Fernet
        for k in (
                "VAULT_ADDR",
                "VAULT_TOKEN",
                "VAULT_TRANSIT_ENABLED",
                "VAULT_TRANSIT_KEY",
        ):
            os.environ.pop(k, None)
        sv.reset_fernet_cache()

    def teardown_method(self):
        import secret_vault as sv

        sv.reset_fernet_cache()
        os.environ.pop("SECRETS_MASTER_KEY", None)

    def test_encrypt_decrypt_roundtrip(self):
        from secret_vault import decrypt_secret, encrypt_secret, is_encrypted_value

        plain = "sk-ant-test-secret-value-12345"
        enc = encrypt_secret(plain)
        assert enc and is_encrypted_value(enc)
        assert enc.startswith("enc:v1:")
        assert plain not in enc
        assert decrypt_secret(enc) == plain

    def test_idempotent_encrypt(self):
        from secret_vault import encrypt_secret, is_encrypted_value

        plain = "hooks.slack.com/services/T000/B000/XXXXXXXX"
        once = encrypt_secret(plain)
        twice = encrypt_secret(once)
        assert once == twice
        assert is_encrypted_value(twice)

    def test_legacy_plaintext_passthrough_on_read(self):
        from secret_vault import decrypt_secret

        assert decrypt_secret("sk-legacy-plaintext") == "sk-legacy-plaintext"
        assert decrypt_secret(None) is None
        assert decrypt_secret("") is None

    def test_settings_doc_encrypt_decrypt(self):
        from secret_vault import decrypt_settings_doc, encrypt_settings_doc, is_encrypted_value

        doc = {
            "id": "global",
            "llm_provider": "anthropic",
            "anthropic_api_key": "sk-ant-real-key-abcdef",
            "openai_api_key": None,
            "slack_webhook_url": (
                "https://hooks.slack.com/services/"
                + "TAAAAAAA/BBBBBBBB/CCCCCCCCCCCCCCCCCCCC"
            ),
        }
        storage = encrypt_settings_doc(doc)
        assert is_encrypted_value(storage["anthropic_api_key"])
        assert is_encrypted_value(storage["slack_webhook_url"])
        assert storage["llm_provider"] == "anthropic"
        assert storage["openai_api_key"] is None

        runtime = decrypt_settings_doc(storage)
        assert runtime["anthropic_api_key"] == "sk-ant-real-key-abcdef"
        assert "hooks.slack.com" in (runtime["slack_webhook_url"] or "")

    def test_migrate_plaintext_to_encrypted(self):
        from secret_vault import is_encrypted_value, migrate_settings_doc

        doc = {"anthropic_api_key": "sk-plain-to-migrate", "llm_model": "x"}
        storage, changed = migrate_settings_doc(doc)
        assert changed is True
        assert is_encrypted_value(storage["anthropic_api_key"])

        storage2, changed2 = migrate_settings_doc(storage)
        assert changed2 is False

    def test_resolve_secret_decrypts_vault_blob(self):
        from secret_vault import encrypt_secret
        from secrets_util import resolve_secret

        enc = encrypt_secret("sk-from-mongo-vault")
        settings = {"anthropic_api_key": enc}
        assert resolve_secret(settings, "anthropic_api_key", "ANTHROPIC_API_KEY") == "sk-from-mongo-vault"

    def test_vault_status_reports_key_source(self):
        from secret_vault import vault_status

        st = vault_status()
        assert st["enabled"] is True
        assert st["prefix"] == "enc:v1:"
        assert st["key_source"] == "SECRETS_MASTER_KEY"
        assert st["recommend_explicit_master_key"] is False


# -------------------- A-A3 atomic multi-worker rate limit --------------------
class TestAuthThrottleAtomic:
    def setup_method(self):
        import auth_throttle as at

        at._login_failures.clear()
        at._rate_limit.clear()

    def test_rate_limit_find_one_and_update_is_source_of_truth(self):
        """Mongo find_one_and_update path (not memory-first allow)."""
        import auth_throttle as at

        async def run():
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

            allowed = 0
            for _ in range(5):
                if await at.rate_limit_allow(db, "10.0.0.9", window_seconds=60, max_attempts=3):
                    allowed += 1
            assert allowed == 3
            # First 3 allows hit Mongo; further rejects may use memory reject-only path
            assert coll.find_one_and_update.await_count == 3
            # Clear memory — next call must re-consult Mongo and still block
            at._rate_limit.clear()
            assert await at.rate_limit_allow(db, "10.0.0.9", window_seconds=60, max_attempts=3) is False
            assert coll.find_one_and_update.await_count == 4

        asyncio.run(run())

    def test_two_workers_share_mongo_counter(self):
        """Simulate two processes sharing one Mongo store (no shared memory)."""
        import auth_throttle as at

        async def run():
            store: dict = {}

            async def find_one_and_update(query, update, upsert=False, return_document=None):
                ip = query.get("_id")
                hits = list((store.get(ip) or {}).get("hits") or [])
                push = (update.get("$push") or {}).get("hits") or {}
                each = push.get("$each") or []
                hits.extend(float(x) for x in each)
                slice_n = push.get("$slice")
                if slice_n is not None:
                    hits = hits[int(slice_n):]
                store[ip] = {"_id": ip, "hits": hits}
                return dict(store[ip])

            coll = AsyncMock()
            coll.find_one_and_update = AsyncMock(side_effect=find_one_and_update)
            coll.update_one = AsyncMock()
            db = MagicMock()
            db.__getitem__ = MagicMock(return_value=coll)

            # Worker A memory is empty; worker B memory is empty — only Mongo binds them
            at._rate_limit.clear()
            ok_a = await at.rate_limit_allow(db, "9.9.9.9", window_seconds=120, max_attempts=2)
            # Wipe process memory to simulate another worker
            at._rate_limit.clear()
            ok_b = await at.rate_limit_allow(db, "9.9.9.9", window_seconds=120, max_attempts=2)
            at._rate_limit.clear()
            blocked = await at.rate_limit_allow(db, "9.9.9.9", window_seconds=120, max_attempts=2)
            assert ok_a is True
            assert ok_b is True
            assert blocked is False

        asyncio.run(run())

    def test_login_lockout_uses_atomic_inc(self):
        import auth_throttle as at
        from pymongo import ReturnDocument

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

            coll = AsyncMock()
            coll.find_one = AsyncMock(side_effect=find_one)
            coll.find_one_and_update = AsyncMock(side_effect=find_one_and_update)
            coll.update_one = AsyncMock(side_effect=update_one)
            coll.delete_one = AsyncMock(side_effect=lambda q: store.pop(q.get("_id"), None))
            db = MagicMock()
            db.__getitem__ = MagicMock(return_value=coll)

            msg = None
            for _ in range(3):
                msg = await at.record_login_failure(db, "a@b.com", limit=3)
            assert msg and "Locked" in msg
            assert coll.find_one_and_update.await_count >= 3
            _ = ReturnDocument  # imported for intentional API parity
            locked, _mins = await at.get_login_lockout_status(db, "a@b.com")
            assert locked is True

        asyncio.run(run())
