"""Product roadmap CRUD and seed management."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from bson import ObjectId
from fastapi import HTTPException
from pydantic import BaseModel

from backend.core import services as svc
from backend.database import db
from backend.models import new_id
from backend.roadmap_data import ROADMAP_SEED, default_tasks_for_item

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


async def list_items(
    *,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    q: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
) -> Dict[str, Any]:
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
    cursor = (
        db.roadmap.find(query, {"_id": 0})
        .sort([("priority", 1), ("status", 1), ("title", 1)])
        .skip(skip)
        .limit(limit)
    )
    items = await cursor.to_list(limit)
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


async def get_item(item_id: str) -> Dict[str, Any]:
    await svc.ensure_roadmap_seeded()
    doc = await db.roadmap.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Roadmap item not found")
    return doc


async def create_item(body: RoadmapCreateBody, user: dict) -> Dict[str, Any]:
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


async def update_item(item_id: str, body: RoadmapUpdateBody, user: dict) -> Dict[str, Any]:
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


async def delete_item(item_id: str, user: dict) -> Dict[str, Any]:
    await svc.ensure_roadmap_seeded()
    result = await db.roadmap.delete_one({"id": item_id})
    if result.deleted_count == 0:
        result = await db.roadmap.delete_one({"title": item_id})
    if result.deleted_count == 0 and ObjectId.is_valid(item_id):
        result = await db.roadmap.delete_one({"_id": ObjectId(item_id)})
    if result.deleted_count == 0:
        raise HTTPException(
            status_code=404, detail=f"Roadmap item not found for identifier: {item_id}"
        )
    await svc.audit(user, "roadmap.delete", "roadmap", item_id, {"deleted": True})
    return {"success": True, "deleted_id": item_id}


async def deduplicate(user: dict) -> Dict[str, Any]:
    all_items = await db.roadmap.find({}).to_list(1000)
    seen = {}
    deleted_ids = []
    for doc in all_items:
        title = (doc.get("title") or "").strip().lower()
        doc_id = str(doc.get("id") or doc.get("_id"))
        if title not in seen:
            seen[title] = doc
        else:
            existing = seen[title]
            existing_id = str(existing.get("id") or existing.get("_id"))
            is_cur_custom = doc_id.startswith("rm-custom-")
            is_ext_custom = existing_id.startswith("rm-custom-")
            if is_cur_custom and not is_ext_custom:
                to_delete = doc
            elif is_ext_custom and not is_cur_custom:
                to_delete = existing
                seen[title] = doc
            else:
                cur_score = len(doc.get("description", "")) + len(doc.get("tasks", []))
                ext_score = len(existing.get("description", "")) + len(existing.get("tasks", []))
                if cur_score > ext_score:
                    to_delete = existing
                    seen[title] = doc
                else:
                    to_delete = doc
            await db.roadmap.delete_one({"_id": to_delete["_id"]})
            deleted_ids.append(to_delete.get("id"))
    await svc.audit(
        user, "roadmap.deduplicate", "roadmap", "all", {"deleted_count": len(deleted_ids)}
    )
    return {"success": True, "deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}


async def add_task(item_id: str, body: RoadmapTaskBody, user: dict) -> Dict[str, Any]:
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


async def update_task(
    item_id: str, task_id: str, body: RoadmapTaskUpdateBody, user: dict
) -> Dict[str, Any]:
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


async def delete_task(item_id: str, task_id: str, user: dict) -> Dict[str, Any]:
    await svc.ensure_roadmap_seeded()
    result = await db.roadmap.update_one({"id": item_id}, {"$pull": {"tasks": {"id": task_id}}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Task or roadmap item not found")
    await svc.audit(user, "roadmap.task_delete", "roadmap", item_id, {"task_id": task_id})
    return {"success": True, "deleted_task_id": task_id}


async def generate_tasks(item_id: str, user: dict) -> Dict[str, Any]:
    await svc.ensure_roadmap_seeded()
    existing = await db.roadmap.find_one({"id": item_id}, {"_id": 0})
    if not existing:
        raise HTTPException(404, "Roadmap item not found")
    current = list(existing.get("tasks") or [])
    if current:
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
        current = [{**t, "id": t.get("id") or f"t-{new_id()[:8]}"} for t in current]
        added = current
    await db.roadmap.update_one(
        {"id": item_id},
        {"$set": {"tasks": current, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    await svc.audit(user, "roadmap.generate_tasks", "roadmap", item_id, {"added": len(added)})
    return {"ok": True, "tasks": current, "added": added}


async def reseed(
    user: dict, *, force: bool = False, reset_progress: bool = False
) -> Dict[str, Any]:
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
                    d["owner"] = existing.get("owner") or d.get("owner") or ""
                    d["created_at"] = existing.get("created_at") or now
                else:
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
                await db.roadmap.update_one(
                    {"id": d["id"]},
                    {"$set": d, "$setOnInsert": {"created_at": now}},
                    upsert=True,
                )
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
