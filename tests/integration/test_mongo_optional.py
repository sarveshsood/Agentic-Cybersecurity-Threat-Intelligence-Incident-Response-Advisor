"""Integration tests — skipped unless ACTIRA_INTEGRATION=1 and Mongo is up."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

pytestmark = [pytest.mark.integration, pytest.mark.requires_mongo]


@pytest.mark.asyncio
async def test_mongo_ping():
    from motor.motor_asyncio import AsyncIOMotorClient

    url = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
    client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=2000)
    try:
        await client.admin.command("ping")
    finally:
        client.close()


@pytest.mark.asyncio
async def test_settings_roundtrip_collection():
    from motor.motor_asyncio import AsyncIOMotorClient

    url = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
    db_name = os.environ.get("DB_NAME", "soc_console_test")
    client = AsyncIOMotorClient(url, serverSelectionTimeoutMS=2000)
    db = client[db_name]
    coll = db["settings_integration_probe"]
    try:
        await coll.delete_many({})
        await coll.insert_one({"_id": "probe", "ok": True})
        doc = await coll.find_one({"_id": "probe"})
        assert doc and doc.get("ok") is True
    finally:
        await coll.delete_many({})
        client.close()
