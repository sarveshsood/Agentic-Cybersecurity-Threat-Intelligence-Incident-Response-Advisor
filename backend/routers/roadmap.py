"""Roadmap API — thin adapters over roadmap_service."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query, Response

from backend.security import get_current_user, require_roles
from backend.services import roadmap_service
from backend.services.roadmap_service import (
    RoadmapCreateBody,
    RoadmapTaskBody,
    RoadmapTaskUpdateBody,
    RoadmapUpdateBody,
)

router = APIRouter(tags=["roadmap"])


@router.get("/roadmap")
async def list_roadmap(
    response: Response,
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    user=Depends(get_current_user),
):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return await roadmap_service.list_items(
        status=status,
        priority=priority,
        category=category,
        q=q,
        skip=skip,
        limit=limit,
    )


@router.get("/roadmap/{item_id}")
async def get_roadmap_item(item_id: str, user=Depends(get_current_user)):
    return await roadmap_service.get_item(item_id)


@router.post("/roadmap")
async def create_roadmap_item(
    body: RoadmapCreateBody, user=Depends(require_roles("admin"))
):
    return await roadmap_service.create_item(body, user)


@router.patch("/roadmap/{item_id}")
async def update_roadmap_item(
    item_id: str,
    body: RoadmapUpdateBody,
    user=Depends(require_roles("admin", "senior_reviewer")),
):
    return await roadmap_service.update_item(item_id, body, user)


@router.delete("/roadmap/{item_id}")
async def delete_roadmap_item(item_id: str, user=Depends(require_roles("admin"))):
    return await roadmap_service.delete_item(item_id, user)


@router.post("/roadmap/deduplicate")
async def deduplicate_roadmap(user=Depends(require_roles("admin"))):
    return await roadmap_service.deduplicate(user)


@router.post("/roadmap/{item_id}/tasks")
async def add_roadmap_task(
    item_id: str,
    body: RoadmapTaskBody,
    user=Depends(require_roles("admin", "senior_reviewer")),
):
    return await roadmap_service.add_task(item_id, body, user)


@router.patch("/roadmap/{item_id}/tasks/{task_id}")
async def update_roadmap_task(
    item_id: str,
    task_id: str,
    body: RoadmapTaskUpdateBody,
    user=Depends(require_roles("admin", "senior_reviewer")),
):
    return await roadmap_service.update_task(item_id, task_id, body, user)


@router.delete("/roadmap/{item_id}/tasks/{task_id}")
async def delete_roadmap_task(
    item_id: str,
    task_id: str,
    user=Depends(require_roles("admin", "senior_reviewer")),
):
    return await roadmap_service.delete_task(item_id, task_id, user)


@router.post("/roadmap/{item_id}/generate-tasks")
async def generate_roadmap_tasks(
    item_id: str,
    user=Depends(require_roles("admin", "senior_reviewer")),
):
    return await roadmap_service.generate_tasks(item_id, user)


@router.post("/roadmap/seed")
async def reseed_roadmap(
    force: bool = Query(False),
    reset_progress: bool = Query(
        False,
        description="With force=true, overwrite status/progress/tasks/notes from seed.",
    ),
    user=Depends(require_roles("admin")),
):
    return await roadmap_service.reseed(user, force=force, reset_progress=reset_progress)
