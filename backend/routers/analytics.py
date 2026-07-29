"""Analytics API — thin adapters over analytics_service."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from backend.security import get_current_user
from backend.services import analytics_service

router = APIRouter(tags=["analytics"])


@router.get("/kpis")
async def kpis(
    force_refresh: bool = Query(
        False,
        description="Bypass short-lived KPI cache (default TTL ANALYTICS_KPI_CACHE_TTL_SECONDS=30)",
    ),
    user=Depends(get_current_user),
):
    return await analytics_service.kpis(force_refresh=force_refresh)


@router.get("/kpis/queue")
async def kpis_queue(
    force_refresh: bool = Query(False),
    user=Depends(get_current_user),
):
    """Rich analyst-queue metrics (Assigned, Open, Waiting Review, SLA risk, trends)."""
    return await analytics_service.queue_kpis(force_refresh=force_refresh)


@router.get("/analytics")
async def analytics(
    window_days: int = Query(30, ge=1, le=365),
    force_refresh: bool = Query(
        False,
        description="Bypass dashboard cache (default TTL ANALYTICS_DASHBOARD_CACHE_TTL_SECONDS=60)",
    ),
    user=Depends(get_current_user),
):
    return await analytics_service.analytics(
        window_days=window_days, force_refresh=force_refresh
    )


@router.get("/analytics/retrieval-compare")
async def analytics_retrieval_compare(
    top_k: int = Query(5, ge=1, le=20),
    user=Depends(get_current_user),
):
    return await analytics_service.retrieval_compare(top_k=top_k)
