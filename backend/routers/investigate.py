"""AI investigation API — thin adapters over investigate_service."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.security import get_current_user
from backend.services import investigate_service
from backend.services.investigate_service import InvestigateRequest

router = APIRouter(tags=["investigate"])


@router.post("/incidents/{incident_id}/investigate")
async def investigate_incident(
    incident_id: str,
    body: InvestigateRequest,
    user=Depends(get_current_user),
):
    return await investigate_service.investigate(incident_id, body, user)


@router.post("/incidents/{incident_id}/investigate/stream")
async def investigate_incident_stream(
    incident_id: str,
    body: InvestigateRequest,
    user=Depends(get_current_user),
):
    return await investigate_service.investigate_stream_response(incident_id, body, user)


@router.get("/incidents/{incident_id}/investigations")
async def list_investigations(incident_id: str, user=Depends(get_current_user)):
    return await investigate_service.list_investigations(incident_id)


@router.get("/investigate/starter-questions")
async def starter_questions(user=Depends(get_current_user)):
    return investigate_service.starter_questions()


@router.get("/logs/jobs/{job_id}/events")
async def job_phase_events(job_id: str, user=Depends(get_current_user)):
    return await investigate_service.job_phase_events_response(job_id)
