"""Audit log collection access."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from backend.database import db
from backend.models import new_id


class AuditRepository:
    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db.audit_log

    async def insert(
        self,
        *,
        actor: dict,
        action: str,
        target_type: str,
        target_id: str,
        detail: Optional[Dict[str, Any]] = None,
    ) -> str:
        entry_id = new_id()
        await self.col.insert_one(
            {
                "id": entry_id,
                "ts": datetime.now(timezone.utc).isoformat(),
                "actor_id": actor.get("sub", "system"),
                "actor_email": actor.get("email", "system"),
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "detail": detail or {},
            }
        )
        return entry_id

    async def list_recent(self, *, limit: int = 500) -> list:
        cursor = self.col.find({}, {"_id": 0}).sort([("ts", -1), ("timestamp", -1)]).limit(limit)
        return await cursor.to_list(limit)


audit_repo = AuditRepository()
