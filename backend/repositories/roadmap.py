"""Roadmap collection access."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


class RoadmapRepository:
    """Mongo-backed product roadmap cards (no seed/business rules)."""

    collection_name = "roadmap"

    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db.roadmap

    async def find_by_id(self, item_id: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": item_id}, {"_id": 0})

    async def list_filtered(
        self,
        *,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        limit: int = 500,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if status:
            query["status"] = status
        if priority:
            query["priority"] = priority
        cursor = self.col.find(query, {"_id": 0}).limit(limit)
        return await cursor.to_list(limit)

    async def list_status_priority(self, *, limit: int = 1000) -> List[Dict[str, Any]]:
        return await self.col.find({}, {"_id": 0, "status": 1, "priority": 1}).to_list(limit)

    async def insert(self, doc: Dict[str, Any]) -> None:
        await self.col.insert_one(doc)

    async def update_by_id(self, item_id: str, fields: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return await self.col.find_one_and_update(
            {"id": item_id},
            {"$set": fields},
            projection={"_id": 0},
            return_document=True,
        )

    async def delete_by_id(self, item_id: str) -> int:
        result = await self.col.delete_one({"id": item_id})
        return int(result.deleted_count or 0)

    async def delete_ids(self, ids: List[str]) -> int:
        if not ids:
            return 0
        result = await self.col.delete_many({"id": {"$in": list(ids)}})
        return int(result.deleted_count or 0)


roadmap_repo = RoadmapRepository()
