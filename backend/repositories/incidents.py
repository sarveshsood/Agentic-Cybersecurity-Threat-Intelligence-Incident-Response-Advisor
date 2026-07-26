"""Incident collection access."""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from backend.database import db


class IncidentRepository:
    """Mongo-backed incident queries (no business rules)."""

    collection_name = "incidents"

    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db.incidents

    async def find_by_id(self, incident_id: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": incident_id}, {"_id": 0})

    async def list_filtered(
        self,
        *,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        technique: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if status:
            query["status"] = status
        if severity:
            query["severity"] = severity
        if technique:
            tid = technique.strip().upper()
            query["$or"] = [
                {"techniques.technique_id": tid},
                {"techniques.parent_id": tid},
                {"techniques.technique_id": {"$regex": f"^{re.escape(tid)}\\."}},
            ]
        cursor = self.col.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
        return await cursor.to_list(limit)

    async def list_pending_review(self, *, skip: int = 0, limit: int = 50) -> List[Dict[str, Any]]:
        cursor = (
            self.col.find({"status": "pending_review"}, {"_id": 0})
            .sort("created_at", -1)
            .skip(skip)
            .limit(limit)
        )
        return await cursor.to_list(limit)

    async def claim_review(
        self,
        incident_id: str,
        update: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Atomic HiTL claim — only succeeds while status is pending_review."""
        return await self.col.find_one_and_update(
            {"id": incident_id, "status": "pending_review"},
            {"$set": update},
            projection={"_id": 0, "id": 1, "status": 1},
            return_document=True,
        )

    async def get_status(self, incident_id: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": incident_id}, {"_id": 0, "status": 1})


# Process-wide default (Motor db is already a singleton handle)
incidents_repo = IncidentRepository()
