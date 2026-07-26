"""Durable auth throttles: failed-login lockouts + IP rate limits.

Primary store is MongoDB so restarts do not wipe lockouts or rate counters.
In-process dicts act as a fast path / fallback if Mongo is briefly unavailable.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Process-local mirrors (survive only for the process lifetime)
_login_failures: Dict[str, Dict[str, Any]] = {}
_rate_limit: Dict[str, list] = {}  # ip -> list of unix timestamps

LOGIN_COLLECTION = "login_lockouts"
RATE_COLLECTION = "auth_rate_limits"
LOCKOUT_MINUTES = 15


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(float(value), tz=timezone.utc)
    if isinstance(value, str):
        try:
            # support trailing Z
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


async def get_login_lockout_status(db, email_key: str) -> Tuple[bool, Optional[int]]:
    """Return (is_locked, minutes_remaining)."""
    now = _now()

    # Memory first (hot path)
    mem = _login_failures.get(email_key) or {}
    locked_until = mem.get("locked_until")
    if isinstance(locked_until, datetime) and locked_until > now:
        mins = max(1, int((locked_until - now).total_seconds() // 60) + 1)
        return True, mins

    # Durable store
    try:
        doc = await db[LOGIN_COLLECTION].find_one({"_id": email_key})
    except Exception as e:
        logger.warning("login lockout read failed (using memory only): %s", e)
        return False, None

    if not doc:
        return False, None

    lu = _parse_dt(doc.get("locked_until"))
    if lu and lu > now:
        _login_failures[email_key] = {
            "count": int(doc.get("count") or 0),
            "locked_until": lu,
        }
        mins = max(1, int((lu - now).total_seconds() // 60) + 1)
        return True, mins

    # Expired lock — mirror count into memory
    _login_failures[email_key] = {
        "count": int(doc.get("count") or 0),
        "locked_until": None,
    }
    return False, None


async def record_login_failure(
        db,
        email_key: str,
        limit: int,
) -> Optional[str]:
    """Increment fail count atomically. Returns 429 message if newly locked, else None.

    Multi-node: prefer ``$inc`` on Mongo so concurrent failures across workers
    cannot under-count. On lock threshold, reset count and set locked_until.
    """
    from pymongo import ReturnDocument

    now = _now()
    lim = max(1, int(limit))
    lock_msg: Optional[str] = None
    locked_until: Optional[datetime] = None
    count = 0

    try:
        coll = db[LOGIN_COLLECTION]
        # If already locked, do not inflate count
        existing = await coll.find_one({"_id": email_key})
        if existing:
            lu = _parse_dt(existing.get("locked_until"))
            if lu and lu > now:
                _login_failures[email_key] = {
                    "count": int(existing.get("count") or 0),
                    "locked_until": lu,
                }
                return (
                    f"Too many failed logins ({lim}). "
                    f"Locked for {LOCKOUT_MINUTES} minutes."
                )

        doc = await coll.find_one_and_update(
            {"_id": email_key},
            {
                "$inc": {"count": 1},
                "$set": {"updated_at": now.isoformat()},
                "$setOnInsert": {"locked_until": None},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        count = int((doc or {}).get("count") or 0)
        if count >= lim:
            locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            lock_msg = (
                f"Too many failed logins ({lim}). "
                f"Locked for {LOCKOUT_MINUTES} minutes."
            )
            await coll.update_one(
                {"_id": email_key},
                {
                    "$set": {
                        "count": 0,
                        "locked_until": locked_until.isoformat(),
                        "updated_at": now.isoformat(),
                    }
                },
            )
            count = 0
        _login_failures[email_key] = {
            "count": count,
            "locked_until": locked_until,
        }
        return lock_msg
    except Exception as e:
        logger.warning("login failure persist failed (memory still active): %s", e)
        mem = _login_failures.get(email_key) or {}
        count = int(mem.get("count") or 0) + 1
        if count >= lim:
            locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            count = 0
            lock_msg = (
                f"Too many failed logins ({lim}). "
                f"Locked for {LOCKOUT_MINUTES} minutes."
            )
        _login_failures[email_key] = {"count": count, "locked_until": locked_until}
        return lock_msg


async def clear_login_failures(db, email_key: str) -> None:
    _login_failures.pop(email_key, None)
    try:
        await db[LOGIN_COLLECTION].delete_one({"_id": email_key})
    except Exception as e:
        logger.warning("login failure clear failed: %s", e)


async def rate_limit_allow(
        db,
        client_ip: str,
        *,
        window_seconds: int,
        max_attempts: int,
) -> bool:
    """Return True if the request is allowed, False if rate-limited.

    A-A3 multi-node: Mongo is the sole source of truth. We use a single atomic
    ``find_one_and_update`` (push hit + return AFTER) so concurrent workers
    never race between update and find. Memory is a *reject-only* hot path
    (local over-limit) and a mirror after the durable decision — never the
    allow path when Mongo is up.
    """
    from pymongo import ReturnDocument

    now = time.time()
    window = max(1, int(window_seconds))
    limit = max(1, int(max_attempts))
    ip = (client_ip or "unknown").strip() or "unknown"
    cutoff = now - window
    slice_n = -max(limit * 3, 20)

    # Memory fast-path reject only (local cache already over limit)
    mem_hits = [t for t in (_rate_limit.get(ip) or []) if now - t < window]
    if len(mem_hits) >= limit:
        _rate_limit[ip] = mem_hits
        return False

    # Durable atomic path — multi-worker safe
    try:
        coll = db[RATE_COLLECTION]
        doc = await coll.find_one_and_update(
            {"_id": ip},
            {
                "$push": {
                    "hits": {
                        "$each": [now],
                        "$slice": slice_n,
                    }
                },
                "$set": {"updated_at": _now().isoformat()},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
        stored = []
        if doc and isinstance(doc.get("hits"), list):
            stored = [float(t) for t in doc["hits"] if isinstance(t, (int, float))]
        stored = [t for t in stored if t >= cutoff]
        # Compact when window filter dropped many old hits
        if doc and len(doc.get("hits") or []) > len(stored) + 2:
            try:
                await coll.update_one(
                    {"_id": ip},
                    {"$set": {"hits": stored[-limit * 2:], "updated_at": _now().isoformat()}},
                )
            except Exception:
                pass
        _rate_limit[ip] = stored[-limit * 2:]
        # After push, more than `limit` hits in window → reject this request
        if len(stored) > limit:
            return False
        return True
    except Exception as e:
        logger.warning("auth rate-limit persist failed (memory only): %s", e)
        mem_hits.append(now)
        _rate_limit[ip] = mem_hits
        return len(mem_hits) <= limit


async def ensure_throttle_indexes(db) -> None:
    """Optional indexes for cleanup queries (idempotent)."""
    try:
        await db[LOGIN_COLLECTION].create_index("updated_at")
        await db[RATE_COLLECTION].create_index("updated_at")
    except Exception as e:
        logger.warning("throttle index create skipped: %s", e)


async def purge_stale_throttle_docs(db, *, max_age_days: int = 14) -> Dict[str, int]:
    """A-A4: delete old lockout/rate docs (and clear expired locks)."""
    from datetime import timedelta

    cutoff = (_now() - timedelta(days=max(1, int(max_age_days)))).isoformat()
    removed = {"login_lockouts": 0, "auth_rate_limits": 0}
    try:
        r1 = await db[LOGIN_COLLECTION].delete_many(
            {"$or": [
                {"updated_at": {"$lt": cutoff}},
                {"updated_at": {"$exists": False}},
            ]}
        )
        removed["login_lockouts"] = int(getattr(r1, "deleted_count", 0) or 0)
    except Exception as e:
        logger.warning("purge login_lockouts: %s", e)
    try:
        r2 = await db[RATE_COLLECTION].delete_many(
            {"$or": [
                {"updated_at": {"$lt": cutoff}},
                {"updated_at": {"$exists": False}},
            ]}
        )
        removed["auth_rate_limits"] = int(getattr(r2, "deleted_count", 0) or 0)
    except Exception as e:
        logger.warning("purge auth_rate_limits: %s", e)
    return removed
