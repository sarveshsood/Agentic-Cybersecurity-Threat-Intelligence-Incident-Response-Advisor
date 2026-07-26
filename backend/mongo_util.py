"""Mongo document helpers — prefer native datetimes for time fields (A-H2)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_mongo_doc(model: Any) -> Dict[str, Any]:
    """Dump a Pydantic model for Mongo insert keeping datetime objects.

    ``model_dump(mode="json")`` stringifies datetimes, which breaks mixed-type
    range queries. Use this for domain documents (incidents, jobs, audit, users).
    """
    if hasattr(model, "model_dump"):
        doc = model.model_dump(mode="python")
    elif isinstance(model, dict):
        doc = dict(model)
    else:
        raise TypeError(f"Cannot convert {type(model)!r} to mongo doc")
    doc.pop("_id", None)
    return doc


def ensure_datetime(value: Any, *, default: Optional[datetime] = None) -> Any:
    """Coerce ISO strings to aware UTC datetime when possible."""
    if value is None:
        return default if default is not None else utc_now()
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, str) and value.strip():
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            return value
    return value


def created_at_match(cutoff: datetime) -> Dict[str, Any]:
    """Match docs whose created_at is >= cutoff whether stored as datetime or ISO string.

    Supports legacy rows written with ``model_dump(mode="json")``.
    """
    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=timezone.utc)
    return {
        "$or": [
            {"created_at": {"$gte": cutoff}},
            {"created_at": {"$gte": cutoff.isoformat()}},
        ]
    }
