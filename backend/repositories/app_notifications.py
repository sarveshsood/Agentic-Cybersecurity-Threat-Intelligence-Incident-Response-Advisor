"""In-app notification inbox (H-07) — not outbound Slack/email."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


class AppNotificationRepository:
    collection_name = "app_notifications"

    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db[self.collection_name]

    async def insert(self, doc: Dict[str, Any]) -> None:
        await self.col.insert_one(doc)

    async def list_for_user(
        self,
        user_id: str,
        *,
        unread_only: bool = False,
        before: Optional[str] = None,
        limit: int = 40,
    ) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {"user_id": user_id}
        if unread_only:
            q["read_at"] = None
        if before:
            q["created_at"] = {"$lt": before}
        lim = max(1, min(100, int(limit or 40)))
        cursor = self.col.find(q, {"_id": 0}).sort("created_at", -1).limit(lim)
        return await cursor.to_list(lim)

    async def unread_count(self, user_id: str) -> int:
        return int(
            await self.col.count_documents({"user_id": user_id, "read_at": None})
        )

    async def mark_read(self, user_id: str, notif_id: str, read_at: Any) -> bool:
        r = await self.col.update_one(
            {"id": notif_id, "user_id": user_id, "read_at": None},
            {"$set": {"read_at": read_at}},
        )
        return bool(r.modified_count)

    async def mark_all_read(self, user_id: str, read_at: Any) -> int:
        r = await self.col.update_many(
            {"user_id": user_id, "read_at": None},
            {"$set": {"read_at": read_at}},
        )
        return int(getattr(r, "modified_count", 0) or 0)

    async def delete_for_incidents(self, incident_ids: List[str]) -> int:
        if not incident_ids:
            return 0
        r = await self.col.delete_many(
            {"incident_id": {"$in": list(incident_ids)}}
        )
        return int(getattr(r, "deleted_count", 0) or 0)


app_notifications_repo = AppNotificationRepository()
