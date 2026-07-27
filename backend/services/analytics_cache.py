"""Short-lived in-process cache for dashboard analytics (P2).

Dashboard widgets hit /kpis and /analytics often; recomputing on every request
causes timeouts under load. TTL defaults are conservative and overridable via env.
"""
from __future__ import annotations

import os
import time
from typing import Any, Dict, Optional, Tuple

_store: Dict[str, Tuple[float, Any]] = {}


def _ttl_seconds(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return max(0.0, float(raw))
    except (TypeError, ValueError):
        return default


def get(key: str) -> Optional[Any]:
    meta = get_meta(key)
    return None if meta is None else meta["value"]


def get_meta(key: str) -> Optional[Dict[str, Any]]:
    """Return value plus remaining TTL when the key is still live."""
    item = _store.get(key)
    if not item:
        return None
    expires_at, value = item
    now = time.monotonic()
    if now >= expires_at:
        _store.pop(key, None)
        return None
    return {
        "value": value,
        "expires_in_seconds": max(0.0, expires_at - now),
    }


def set(key: str, value: Any, *, ttl: float) -> None:
    if ttl <= 0:
        return
    _store[key] = (time.monotonic() + ttl, value)


def invalidate(prefix: Optional[str] = None) -> int:
    """Drop all entries, or those whose key starts with prefix."""
    if prefix is None:
        n = len(_store)
        _store.clear()
        return n
    keys = [k for k in _store if k.startswith(prefix)]
    for k in keys:
        _store.pop(k, None)
    return len(keys)


def kpi_ttl() -> float:
    return _ttl_seconds("ANALYTICS_KPI_CACHE_TTL_SECONDS", 30.0)


def analytics_ttl() -> float:
    return _ttl_seconds("ANALYTICS_DASHBOARD_CACHE_TTL_SECONDS", 60.0)
