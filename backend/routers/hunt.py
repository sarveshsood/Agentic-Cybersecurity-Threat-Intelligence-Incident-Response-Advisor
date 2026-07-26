"""Natural-language threat hunting API (Wave B)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from backend.security import get_current_user
from backend.services import hunt_service

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
        q, limit=limit, severity=severity, status=status
    )


@router.get("/hunt/suggestions")
async def hunt_suggestions(user=Depends(get_current_user)):
    from backend.hunting import hunt_incidents

    empty = hunt_incidents([], "x")
    return {"suggestions": empty["suggestions"]}
