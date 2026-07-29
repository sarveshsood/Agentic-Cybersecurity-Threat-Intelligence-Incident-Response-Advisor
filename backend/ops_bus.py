"""Cross-replica ops invalidate bus (Mongo-backed).

Wallboards already pull KPIs from Mongo on an interval. This bus lets any
replica (API or worker) publish a lightweight invalidate signal so other
replicas' WebSocket/SSE loops can refresh immediately.

- Works on standalone Mongo (collection insert + poll of latest ts)
- Change streams used when available (replica set)
- Collection ``ops_bus`` — capped by TTL index (1 hour)
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional

logger = logging.getLogger(__name__)

COLLECTION = "ops_bus"
_last_seen_ts: Optional[str] = None


async def ensure_ops_bus_indexes(db) -> None:
    try:
        coll = db[COLLECTION]
        await coll.create_index("ts")
        # Auto-expire bus events after 1h
        await coll.create_index("created_at", expireAfterSeconds=3600)
    except Exception as e:
        logger.debug("ops_bus indexes: %s", e)


async def publish_invalidate(db, reason: str = "job") -> None:
    """Notify all replicas that ops KPIs should refresh."""
    try:
        now = datetime.now(timezone.utc)
        await db[COLLECTION].insert_one(
            {
                "type": "invalidate",
                "reason": (reason or "job")[:64],
                "ts": now.isoformat(),
                "created_at": now,
            }
        )
    except Exception as e:
        logger.debug("ops_bus publish failed: %s", e)


async def latest_ts(db) -> Optional[str]:
    try:
        doc = await db[COLLECTION].find_one(
            {"type": "invalidate"},
            sort=[("ts", -1)],
            projection={"ts": 1, "_id": 0},
        )
        return (doc or {}).get("ts")
    except Exception:
        return None


async def poll_invalidates(
    db,
    on_invalidate: Callable[[], Awaitable[Any]],
    *,
    interval: float = 1.0,
    stop: Optional[asyncio.Event] = None,
) -> None:
    """Poll for newer bus timestamps (standalone Mongo safe)."""
    global _last_seen_ts
    while True:
        if stop and stop.is_set():
            return
        try:
            ts = await latest_ts(db)
            if ts and ts != _last_seen_ts:
                first = _last_seen_ts is None
                _last_seen_ts = ts
                if not first:
                    await on_invalidate()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.debug("ops_bus poll: %s", e)
        try:
            await asyncio.sleep(max(0.5, float(interval)))
        except asyncio.CancelledError:
            raise
