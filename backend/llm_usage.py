"""Monthly LLM token budget metering (A-M1).

Tracks estimated token usage per calendar month in Mongo ``llm_usage``.
Providers rarely expose exact usage in our thin wrappers, so we estimate
``len(text) // 4`` (common heuristic). 0 budget = unlimited.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_db = None


def set_usage_db(db) -> None:
    """Bind Motor DB at app startup (optional for offline unit tests)."""
    global _db
    _db = db


def estimate_tokens(*parts: str) -> int:
    total = sum(len(p or "") for p in parts)
    return max(1, total // 4)


def month_id(when: Optional[datetime] = None) -> str:
    dt = when or datetime.now(timezone.utc)
    return dt.strftime("%Y-%m")


def budget_from_settings(settings: Optional[dict]) -> int:
    if not settings:
        return 0
    try:
        return max(0, int(settings.get("llm_token_budget_monthly") or 0))
    except (TypeError, ValueError):
        return 0


async def get_month_usage(db=None, *, month: Optional[str] = None) -> int:
    db = db if db is not None else _db
    if db is None:
        return 0
    mid = month or month_id()
    try:
        doc = await db.llm_usage.find_one({"id": mid}, {"_id": 0, "tokens": 1})
        return int((doc or {}).get("tokens") or 0)
    except Exception as e:
        logger.warning("llm_usage read failed: %s", e)
        return 0


async def record_usage(
        tokens: int,
        *,
        provider: str = "",
        model: str = "",
        db=None,
) -> int:
    """Increment monthly counter. Returns new total (best-effort)."""
    db = db if db is not None else _db
    n = max(0, int(tokens or 0))
    if n <= 0:
        return await get_month_usage(db)
    if db is None:
        return n
    mid = month_id()
    try:
        await db.llm_usage.update_one(
            {"id": mid},
            {
                "$inc": {"tokens": n, "calls": 1},
                "$set": {
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "last_provider": provider or "",
                    "last_model": model or "",
                },
                "$setOnInsert": {"id": mid, "created_at": datetime.now(timezone.utc).isoformat()},
            },
            upsert=True,
        )
        return await get_month_usage(db, month=mid)
    except Exception as e:
        logger.warning("llm_usage record failed: %s", e)
        return 0


class BudgetExceededError(RuntimeError):
    """Raised when monthly token budget is already exhausted."""

    def __init__(self, used: int, budget: int):
        self.used = used
        self.budget = budget
        super().__init__(
            f"Monthly LLM token budget exceeded ({used:,} / {budget:,}). "
            "Raise llm_token_budget_monthly in Settings or wait until next month."
        )


async def assert_within_budget(settings: Optional[dict], db=None) -> None:
    budget = budget_from_settings(settings)
    if budget <= 0:
        return
    used = await get_month_usage(db)
    if used >= budget:
        raise BudgetExceededError(used, budget)


async def usage_snapshot(settings: Optional[dict] = None, db=None) -> Dict[str, Any]:
    budget = budget_from_settings(settings)
    used = await get_month_usage(db)
    return {
        "month": month_id(),
        "tokens_used": used,
        "budget": budget,
        "unlimited": budget <= 0,
        "remaining": None if budget <= 0 else max(0, budget - used),
        "exhausted": budget > 0 and used >= budget,
    }
