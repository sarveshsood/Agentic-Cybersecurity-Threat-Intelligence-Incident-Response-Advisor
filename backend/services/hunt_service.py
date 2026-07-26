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

    # Pull a working set (newest first); hunt scores in-process for MVP
    pool = await incidents_repo.list_filtered(
        status=status,
        severity=severity,
        skip=0,
        limit=200,
    )
    return hunt_incidents(pool, q, limit=limit)
