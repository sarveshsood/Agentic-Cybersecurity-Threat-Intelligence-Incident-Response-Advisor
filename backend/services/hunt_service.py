"""Threat hunting service — NL query over incidents."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException

from backend.hunting import hunt_incidents
from backend.repositories.incidents import incidents_repo


async def run_hunt(
    query: str,
    *,
    limit: int = 25,
    severity: Optional[str] = None,
    status: Optional[str] = None,
) -> Dict[str, Any]:
    q = (query or "").strip()
    if not q:
        raise HTTPException(400, "query is required")
    if len(q) > 500:
        raise HTTPException(400, "query too long (max 500 characters)")

    # Working set (newest first); score in-process. Cap is honesty-surfaced as total_candidates.
    pool = await incidents_repo.list_filtered(
        status=status,
        severity=severity,
        skip=0,
        limit=500,
    )
    out = hunt_incidents(pool, q, limit=limit)
    # Honesty fields for UI (pool may be smaller than 500 when corpus is small)
    if isinstance(out, dict):
        out.setdefault("pool_limit", 500)
        out.setdefault("pool_filters", {
            "severity": severity or None,
            "status": status or None,
        })
        out["honesty"] = (
            "Scores newest up to 500 incidents matching optional severity/status filters — "
            "not a full SIEM log-lake search."
        )
    return out
