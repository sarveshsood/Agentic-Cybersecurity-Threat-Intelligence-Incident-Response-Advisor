"""User pins / favorites (H-08)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


class PinRepository:
    collection_name = "user_pins"

    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db[self.collection_name]

    async def list_for_user(
        self, owner_id: str, *, target_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {"owner_id": owner_id}
        if target_type:
            q["target_type"] = target_type
        cursor = self.col.find(q, {"_id": 0}).sort("created_at", -1).limit(200)
        return await cursor.to_list(200)

    async def find(
        self, owner_id: str, target_type: str, target_id: str
    ) -> Optional[Dict[str, Any]]:
        return await self.col.find_one(
            {
                "owner_id": owner_id,
                "target_type": target_type,
                "target_id": target_id,
            },
            {"_id": 0},
        )

    async def insert(self, doc: Dict[str, Any]) -> None:
        await self.col.insert_one(doc)

    async def delete(self, pin_id: str, owner_id: str) -> bool:
        r = await self.col.delete_one({"id": pin_id, "owner_id": owner_id})
        return bool(r.deleted_count)

    async def delete_by_target(
        self, owner_id: str, target_type: str, target_id: str
    ) -> bool:
        r = await self.col.delete_one(
            {
                "owner_id": owner_id,
                "target_type": target_type,
                "target_id": target_id,
            }
        )
        return bool(r.deleted_count)


pins_repo = PinRepository()
