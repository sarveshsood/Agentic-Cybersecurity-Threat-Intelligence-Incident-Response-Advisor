"""Incident API routes — thin HTTP adapters over incident_service."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from backend.security import get_current_user
from backend.services import incident_service

router = APIRouter(tags=["incidents"])


@router.get("/incidents")
async def list_incidents(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    technique: Optional[str] = Query(
        None,
        description="Filter by ATT&CK technique or parent (e.g. T1110 or T1110.003)",
    ),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_current_user),
):
    return await incident_service.list_incidents(
        status=status,
        severity=severity,
        technique=technique,
        skip=skip,
        limit=limit,
    )


@router.get("/attack/catalog")
async def attack_catalog_list(user=Depends(get_current_user)):
    """List curated ATT&CK techniques + sub-techniques for drill-down UI."""
    return incident_service.list_attack_catalog()


@router.get("/attack/catalog/{technique_id}")
async def attack_catalog_get(technique_id: str, user=Depends(get_current_user)):
    return incident_service.get_attack_catalog_entry(technique_id)


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str, user=Depends(get_current_user)):
    return await incident_service.get_incident(incident_id)


@router.get("/incidents/{incident_id}/citations")
async def get_citations(incident_id: str, user=Depends(get_current_user)):
    return await incident_service.get_citations(incident_id)


@router.get("/incidents/{incident_id}/similar")
async def similar_incidents(
    incident_id: str,
    top_k: int = Query(5, ge=1, le=20),
    user=Depends(get_current_user),
):
    """LanceDB ANN over incident embeddings — similar past cases (excludes self)."""
    return await incident_service.similar_incidents(incident_id, top_k=top_k)
