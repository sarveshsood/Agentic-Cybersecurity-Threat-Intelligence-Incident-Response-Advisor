"""Natural-language threat hunting + behavioral analytics API (Wave B)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from backend.security import get_current_user
from backend.services import behavior_service, hunt_service

router = APIRouter(tags=["hunt"])


@router.get("/hunt")
async def hunt(
    q: str = Query(..., min_length=1, max_length=500, description="Natural language hunt query"),
    limit: int = Query(25, ge=1, le=100),
    severity: Optional[str] = None,
    status: Optional[str] = None,
    user=Depends(get_current_user),
):
    """NL threat hunt over recent incidents (rule-based, no live LLM required)."""
    return await hunt_service.run_hunt(
        q, limit=limit, severity=severity, status=status, user=user
    )


@router.get("/hunt/suggestions")
async def hunt_suggestions(user=Depends(get_current_user)):
    from backend.hunting import hunt_incidents

    empty = hunt_incidents([], "x")
    return {"suggestions": empty["suggestions"]}


@router.get("/hunt/behavior")
async def hunt_behavior_hotspots(
    limit: int = Query(25, ge=1, le=100),
    user=Depends(get_current_user),
):
    """Incidents ranked by behavioral anomaly signals."""
    return await behavior_service.list_behavior_hotspots(limit=limit)


@router.get("/incidents/{incident_id}/behavior")
async def incident_behavior(incident_id: str, user=Depends(get_current_user)):
    """Behavioral signals for a single incident (beaconing, login burst, etc.)."""
    return await behavior_service.get_incident_behavior(incident_id)
