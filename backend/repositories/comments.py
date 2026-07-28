"""Incident comments collection (H-07 — beside workspace notes)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


class CommentRepository:
    collection_name = "incident_comments"

    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db[self.collection_name]

    async def list_for_incident(
        self, incident_id: str, *, include_deleted: bool = False, limit: int = 200
    ) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {"incident_id": incident_id}
        if not include_deleted:
            q["deleted_at"] = None
        lim = max(1, min(500, int(limit or 200)))
        cursor = self.col.find(q, {"_id": 0}).sort("created_at", 1).limit(lim)
        return await cursor.to_list(lim)

    async def find_by_id(self, comment_id: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": comment_id}, {"_id": 0})

    async def insert(self, doc: Dict[str, Any]) -> None:
        await self.col.insert_one(doc)

    async def update_fields(self, comment_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return await self.col.find_one_and_update(
            {"id": comment_id},
            {"$set": fields},
            projection={"_id": 0},
            return_document=True,
        )

    async def delete_for_incidents(self, incident_ids: List[str]) -> int:
        if not incident_ids:
            return 0
        r = await self.col.delete_many({"incident_id": {"$in": list(incident_ids)}})
        return int(getattr(r, "deleted_count", 0) or 0)


comments_repo = CommentRepository()
