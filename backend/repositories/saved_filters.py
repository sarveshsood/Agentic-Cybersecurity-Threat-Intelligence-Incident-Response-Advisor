"""Saved filters (H-08)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


class SavedFilterRepository:
    collection_name = "saved_filters"

    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db[self.collection_name]

    async def list_for_user(
        self, owner_id: str, *, page: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {"owner_id": owner_id}
        if page:
            q["page"] = page
        cursor = self.col.find(q, {"_id": 0}).sort("name", 1)
        return await cursor.to_list(200)

    async def find_by_id(self, filter_id: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": filter_id}, {"_id": 0})

    async def insert(self, doc: Dict[str, Any]) -> None:
        await self.col.insert_one(doc)

    async def update_fields(
        self, filter_id: str, owner_id: str, fields: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        return await self.col.find_one_and_update(
            {"id": filter_id, "owner_id": owner_id},
            {"$set": fields},
            projection={"_id": 0},
            return_document=True,
        )

    async def delete(self, filter_id: str, owner_id: str) -> bool:
        r = await self.col.delete_one({"id": filter_id, "owner_id": owner_id})
        return bool(r.deleted_count)

    async def clear_defaults(self, owner_id: str, page: str) -> None:
        await self.col.update_many(
            {"owner_id": owner_id, "page": page, "is_default": True},
            {"$set": {"is_default": False}},
        )


saved_filters_repo = SavedFilterRepository()
