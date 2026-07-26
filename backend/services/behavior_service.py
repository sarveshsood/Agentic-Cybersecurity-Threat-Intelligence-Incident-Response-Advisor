"""Behavioral analytics service."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import HTTPException

from backend.behavior import analyze_behavior, analyze_behavior_batch
from backend.repositories.incidents import incidents_repo


async def get_incident_behavior(incident_id: str) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")
    return analyze_behavior(doc)


async def list_behavior_hotspots(*, limit: int = 25) -> Dict[str, Any]:
    pool = await incidents_repo.list_filtered(skip=0, limit=150)
    return analyze_behavior_batch(pool, limit=limit)
