"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, Query,
)
from pydantic import BaseModel

from auth import (
    get_current_user, require_roles,
)
from backend.models import (
    new_id,
)
from core import services as svc
from core.database import db
from roadmap_data import ROADMAP_SEED, default_tasks_for_item

router = APIRouter(tags=['roadmap'])

# ---------- Product roadmap (weekly discussions → trackable items) ----------
ROADMAP_STATUSES = ("planned", "in_progress", "completed", "future")
ROADMAP_PRIORITIES = ("p0", "p1", "p2", "p3")


class RoadmapUpdateBody(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    description: Optional[str] = None
    status: Optional[Literal["planned", "in_progress", "completed", "future"]] = None
    priority: Optional[Literal["p0", "p1", "p2", "p3"]] = None
    owner: Optional[str] = None
    effort: Optional[str] = None
    target_release: Optional[str] = None
    progress: Optional[int] = None
    implementation_notes: Optional[str] = None
    modules: Optional[List[str]] = None
    docs: Optional[List[str]] = None
    architecture_notes: Optional[str] = None
    category: Optional[str] = None
    week: Optional[str] = None
    # Full task list replace (optional) — used when marking an item complete with a new task set
    tasks: Optional[List[Dict[str, Any]]] = None


class RoadmapTaskBody(BaseModel):
    title: str
    status: Literal["todo", "in_progress", "done", "blocked"] = "todo"


class RoadmapTaskUpdateBody(BaseModel):
    title: Optional[str] = None
    status: Optional[Literal["todo", "in_progress", "done", "blocked"]] = None
    done: Optional[bool] = None


class RoadmapCreateBody(BaseModel):
    title: str
    summary: str = ""
    description: str = ""
    status: Literal["planned", "in_progress", "completed", "future"] = "planned"
    priority: Literal["p0", "p1", "p2", "p3"] = "p2"
    owner: str = ""
    effort: str = "m"
    target_release: str = ""
    category: str = "General"
    week: str = ""
    modules: List[str] = []
    docs: List[str] = []
    architecture_notes: str = ""
    implementation_notes: str = ""
    progress: int = 0


@router.get("/roadmap")
async def list_roadmap(
        status: Optional[str] = Query(None),
        priority: Optional[str] = Query(None),
        category: Optional[str] = Query(None),
        q: Optional[str] = Query(None),
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        user=Depends(get_current_user),
):
    """List product roadmap items (seeded from weekly discussions)."""
    await svc.ensure_roadmap_seeded()
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if priority:
        query["priority"] = priority
    if category:
        query["category"] = category
    if q and q.strip():
        rx = {"$regex": q.strip(), "$options": "i"}
        query["$or"] = [
            {"title": rx},
            {"summary": rx},
            {"description": rx},
            {"owner": rx},
            {"modules": rx},
        ]
    cursor = db.roadmap.find(query, {"_id": 0}).sort([("priority", 1), ("status", 1), ("title", 1)]).skip(skip).limit(
        limit)
    items = await cursor.to_list(limit)
    # Summary counts
    all_items = await db.roadmap.find({}, {"_id": 0, "status": 1, "priority": 1}).to_list(500)
    counts = {s: 0 for s in ROADMAP_STATUSES}
    for it in all_items:
        s = it.get("status") or "planned"
        if s in counts:
            counts[s] += 1
    return {
        "items": items,
        "counts": counts,
        "total": len(all_items),
        "source": "memory/WEEKLY_DISCUSSIONS.md + live Mongo updates",
    }


@router.get("/roadmap/{item_id}")
async def get_roadmap_item(item_id: str, user=Depends(get_current_user)):
    await svc.ensure_roadmap_seeded()
    doc = await db.roadmap.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Roadmap item not found")
    return doc


@router.post("/roadmap")
async def create_roadmap_item(body: RoadmapCreateBody, user=Depends(require_roles("admin"))):
    await svc.ensure_roadmap_seeded()
    now = datetime.now(timezone.utc).isoformat()
    doc = body.model_dump()
    doc["id"] = f"rm-custom-{new_id()[:8]}"
    doc["tasks"] = default_tasks_for_item(doc)
    doc["created_at"] = now
    doc["updated_at"] = now
    await db.roadmap.insert_one(doc)
    doc.pop("_id", None)
    await svc.audit(user, "roadmap.create", "roadmap", doc["id"], {"title": doc["title"]})
    return doc


@router.patch("/roadmap/{item_id}")
async def update_roadmap_item(
        item_id: str,
        body: RoadmapUpdateBody,
        user=Depends(require_roles("admin", "senior_reviewer")),
):
    await svc.ensure_roadmap_seeded()
    existing = await db.roadmap.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Roadmap item not found")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if "progress" in patch:
        patch["progress"] = max(0, min(100, int(patch["progress"])))
    if not patch:
        return existing
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.roadmap.update_one({"id": item_id}, {"$set": patch})
    doc = await db.roadmap.find_one({"id": item_id}, {"_id": 0})
    await svc.audit(user, "roadmap.update", "roadmap", item_id, {"fields": list(patch.keys())})
    return doc


@router.post("/roadmap/{item_id}/tasks")
async def add_roadmap_task(
        item_id: str,
        body: RoadmapTaskBody,
        user=Depends(require_roles("admin", "senior_reviewer")),
):
    """Add an actionable development task under a roadmap item."""
    await svc.ensure_roadmap_seeded()
    existing = await db.roadmap.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Roadmap item not found")
    task = {
        "id": f"t-{new_id()[:8]}",
        "title": body.title.strip(),
        "status": body.status,
        "done": body.status == "done",
    }
    tasks = list(existing.get("tasks") or [])
    tasks.append(task)
    await db.roadmap.update_one(
        {"id": item_id},
        {"$set": {"tasks": tasks, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await svc.audit(user, "roadmap.task_add", "roadmap", item_id, {"task_id": task["id"]})
    return {"ok": True, "task": task, "tasks": tasks}


@router.patch("/roadmap/{item_id}/tasks/{task_id}")
async def update_roadmap_task(
        item_id: str,
        task_id: str,
        body: RoadmapTaskUpdateBody,
        user=Depends(require_roles("admin", "senior_reviewer")),
):
    await svc.ensure_roadmap_seeded()
    existing = await db.roadmap.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Roadmap item not found")
    tasks = list(existing.get("tasks") or [])
    found = None
    for t in tasks:
        if t.get("id") == task_id:
            if body.title is not None:
                t["title"] = body.title.strip()
            if body.status is not None:
                t["status"] = body.status
                t["done"] = body.status == "done"
            if body.done is not None:
                t["done"] = body.done
                if body.done and t.get("status") != "done":
                    t["status"] = "done"
                if not body.done and t.get("status") == "done":
                    t["status"] = "todo"
            found = t
            break
    if not found:
        raise HTTPException(404, "Task not found")
    # Auto-bump progress from task completion ratio
    done_n = sum(1 for t in tasks if t.get("done") or t.get("status") == "done")
    progress = int(round(100 * done_n / len(tasks))) if tasks else existing.get("progress", 0)
    new_status = existing.get("status")
    if progress >= 100 and new_status != "completed":
        new_status = "completed"
    elif progress > 0 and new_status == "planned":
        new_status = "in_progress"
    await db.roadmap.update_one(
        {"id": item_id},
        {
            "$set": {
                "tasks": tasks,
                "progress": progress,
                "status": new_status,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
    )
    await svc.audit(user, "roadmap.task_update", "roadmap", item_id, {"task_id": task_id})
    return {"ok": True, "task": found, "progress": progress, "status": new_status, "tasks": tasks}


@router.post("/roadmap/{item_id}/generate-tasks")
async def generate_roadmap_tasks(
        item_id: str,
        user=Depends(require_roles("admin", "senior_reviewer")),
):
    """Convert a roadmap item into a starter set of development tasks (if empty or force fill gaps)."""
    await svc.ensure_roadmap_seeded()
    existing = await db.roadmap.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Roadmap item not found")
    current = list(existing.get("tasks") or [])
    if current:
        # Append only missing default titles
        defaults = default_tasks_for_item({**existing, "tasks": []})
        existing_titles = {t.get("title") for t in current}
        added = []
        for d in defaults:
            if d["title"] not in existing_titles:
                d = {**d, "id": f"t-{new_id()[:8]}"}
                current.append(d)
                added.append(d)
        if not added:
            return {"ok": True, "tasks": current, "added": [], "note": "Tasks already present"}
    else:
        current = default_tasks_for_item(existing)
        # refresh ids
        current = [{**t, "id": t.get("id") or f"t-{new_id()[:8]}"} for t in current]
        added = current
    await db.roadmap.update_one(
        {"id": item_id},
        {"$set": {"tasks": current, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await svc.audit(user, "roadmap.generate_tasks", "roadmap", item_id, {"added": len(added)})
    return {"ok": True, "tasks": current, "added": added}


@router.post("/roadmap/seed")
async def reseed_roadmap(
        force: bool = Query(False),
        reset_progress: bool = Query(
            False,
            description="With force=true, overwrite status/progress/tasks/notes from seed "
                        "(does not keep stale in-DB progress). Use after shipping a seed item as completed.",
        ),
        user=Depends(require_roles("admin")),
):
    """Seed roadmap from weekly discussions.

    force=true upserts seed items by id.
    By default preserves owner + local progress/status/tasks/notes.
    reset_progress=true applies seed status/progress/tasks/implementation_notes
    (still preserves owner and created_at).
    """
    now = datetime.now(timezone.utc).isoformat()
    if force:
        for item in ROADMAP_SEED:
            d = dict(item)
            d.setdefault("tasks", default_tasks_for_item(d))
            d["updated_at"] = now
            existing = await db.roadmap.find_one({"id": d["id"]})
            if existing:
                seed_done = (
                        str(d.get("status") or "") == "completed"
                        or int(d.get("progress") or 0) >= 100
                )
                if reset_progress or seed_done:
                    # Seed marks this item shipped (or admin requested reset):
                    # take status/progress/tasks/notes from seed; keep owner + created_at.
                    d["owner"] = existing.get("owner") or d.get("owner") or ""
                    d["created_at"] = existing.get("created_at") or now
                else:
                    # Preserve ownership / notes / task progress when re-seeding definitions
                    preserve = {
                        "owner": existing.get("owner"),
                        "implementation_notes": existing.get("implementation_notes"),
                        "tasks": existing.get("tasks") or d["tasks"],
                        "progress": existing.get("progress", d.get("progress", 0)),
                        "status": existing.get("status") or d.get("status"),
                        "created_at": existing.get("created_at") or now,
                    }
                    d.update({k: v for k, v in preserve.items() if v is not None})
                await db.roadmap.update_one({"id": d["id"]}, {"$set": d})
            else:
                d["created_at"] = now
                await db.roadmap.insert_one(d)
        await svc.audit(
            user,
            "roadmap.reseed",
            "roadmap",
            "all",
            {"force": True, "reset_progress": reset_progress},
        )
        return {
            "ok": True,
            "force": True,
            "reset_progress": reset_progress,
            "seed_count": len(ROADMAP_SEED),
        }

    await svc.ensure_roadmap_seeded()
    count = await db.roadmap.count_documents({})
    return {"ok": True, "force": False, "total": count}
