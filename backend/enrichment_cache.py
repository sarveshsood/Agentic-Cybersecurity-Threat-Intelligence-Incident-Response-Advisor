"""IoC enrichment cache (A-E2).

Two tiers:
  1. Process-local memory (fast; lost on restart)
  2. MongoDB collection ``enrichment_cache`` (durable across restarts)

Cache key: type + lowercased value + mode signature (mock/live/force_mock).
TTL from Settings.enrichment_cache_ttl_hours (default 24). Set 0 to disable.
"""
from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

COLLECTION = "enrichment_cache"

# key -> (expires_monotonic, payload_dict)
_mem: Dict[str, Tuple[float, Dict[str, Any]]] = {}
_MEM_MAX = 5000


def _ttl_seconds(settings: Optional[dict]) -> int:
    if not settings:
        return 24 * 3600
    try:
        hours = float(settings.get("enrichment_cache_ttl_hours", 24) or 0)
    except (TypeError, ValueError):
        hours = 24.0
    if hours <= 0:
        return 0
    return int(hours * 3600)


def mode_signature(*, force_mock: bool, allow_mock: bool, has_any_key: bool) -> str:
    if force_mock:
        return "force_mock"
    if not has_any_key and allow_mock:
        return "mock_default"
    if not has_any_key and not allow_mock:
        return "unscored"
    return "live_keys"


def make_key(ioc_type: str, value: str, mode_sig: str) -> str:
    raw = f"{(ioc_type or '').lower()}|{(value or '').strip().lower()}|{mode_sig}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def mem_get(key: str) -> Optional[Dict[str, Any]]:
    ent = _mem.get(key)
    if not ent:
        return None
    exp, payload = ent
    if time.monotonic() > exp:
        _mem.pop(key, None)
        return None
    return dict(payload)


def mem_put(key: str, payload: Dict[str, Any], ttl_sec: int) -> None:
    if ttl_sec <= 0:
        return
    if len(_mem) >= _MEM_MAX:
        # drop arbitrary old entries
        for k in list(_mem.keys())[: max(1, _MEM_MAX // 10)]:
            _mem.pop(k, None)
    _mem[key] = (time.monotonic() + ttl_sec, dict(payload))


def mem_clear() -> None:
    _mem.clear()


async def mongo_get(db, key: str) -> Optional[Dict[str, Any]]:
    if db is None:
        return None
    try:
        doc = await db[COLLECTION].find_one({"_id": key})
        if not doc:
            return None
        exp = doc.get("expires_at")
        if isinstance(exp, str):
            try:
                exp_dt = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            except ValueError:
                return None
        elif isinstance(exp, datetime):
            exp_dt = exp if exp.tzinfo else exp.replace(tzinfo=timezone.utc)
        else:
            return None
        if exp_dt <= datetime.now(timezone.utc):
            await db[COLLECTION].delete_one({"_id": key})
            return None
        payload = doc.get("payload")
        return dict(payload) if isinstance(payload, dict) else None
    except Exception as e:
        logger.debug("enrichment cache mongo get failed: %s", e)
        return None


async def mongo_put(db, key: str, payload: Dict[str, Any], ttl_sec: int) -> None:
    if db is None or ttl_sec <= 0:
        return
    try:
        expires = datetime.now(timezone.utc).timestamp() + ttl_sec
        exp_dt = datetime.fromtimestamp(expires, tz=timezone.utc)
        await db[COLLECTION].update_one(
            {"_id": key},
            {
                "$set": {
                    "payload": payload,
                    "expires_at": exp_dt.isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )
    except Exception as e:
        logger.debug("enrichment cache mongo put failed: %s", e)


async def ensure_indexes(db) -> None:
    try:
        await db[COLLECTION].create_index("expires_at")
    except Exception as e:
        logger.warning("enrichment_cache index: %s", e)


def apply_cached_to_ioc(ioc, payload: Dict[str, Any]):
    """Mutate IoC with cached threat_score + enrichment."""
    try:
        ioc.threat_score = float(payload.get("threat_score") or 0)
    except (TypeError, ValueError):
        ioc.threat_score = 0.0
    enr = payload.get("enrichment")
    if isinstance(enr, dict):
        ioc.enrichment = dict(enr)
        ioc.enrichment["cache_hit"] = True
    return ioc


def snapshot_ioc(ioc) -> Dict[str, Any]:
    return {
        "threat_score": float(getattr(ioc, "threat_score", 0) or 0),
        "enrichment": dict(getattr(ioc, "enrichment") or {}),
    }
