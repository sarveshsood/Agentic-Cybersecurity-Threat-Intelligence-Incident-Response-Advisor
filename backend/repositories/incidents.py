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

    async def push_workspace_note(
        self,
        incident_id: str,
        note_doc: Dict[str, Any],
        *,
        notes_limit: int = 200,
    ) -> Optional[Dict[str, Any]]:
        """Atomically $push a note if under notes_limit. Returns updated note list slice or None."""
        # Cap via $expr size of workspace.notes
        result = await self.col.find_one_and_update(
            {
                "id": incident_id,
                "$expr": {
                    "$lt": [
                        {"$size": {"$ifNull": ["$workspace.notes", []]}},
                        notes_limit,
                    ]
                },
            },
            {
                "$set": {"workspace.version": 1},
                "$push": {"workspace.notes": note_doc},
            },
            projection={"_id": 0, "id": 1, "workspace": 1},
            return_document=True,
        )
        return result

    async def update_workspace_note(
        self,
        incident_id: str,
        note_id: str,
        fields: Dict[str, Any],
        *,
        author_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """arrayFilters update. If author_id set, only that author's note."""
        elem: Dict[str, Any] = {"id": note_id}
        if author_id is not None:
            elem["author_id"] = author_id
        set_doc = {f"workspace.notes.$[n].{k}": v for k, v in fields.items()}
        if not set_doc:
            return await self.find_by_id(incident_id)
        result = await self.col.find_one_and_update(
            {"id": incident_id, "workspace.notes": {"$elemMatch": elem}},
            {"$set": set_doc},
            array_filters=[{"n.id": note_id}],
            projection={"_id": 0, "id": 1, "workspace": 1},
            return_document=True,
        )
        return result

    async def pull_workspace_note(
        self,
        incident_id: str,
        note_id: str,
        *,
        author_id: Optional[str] = None,
    ) -> int:
        """$pull note; returns modified_count."""
        pull_filter: Dict[str, Any] = {"id": note_id}
        if author_id is not None:
            pull_filter["author_id"] = author_id
        res = await self.col.update_one(
            {"id": incident_id},
            {"$pull": {"workspace.notes": pull_filter}},
        )
        return int(res.modified_count or 0)

    async def set_workspace_rca(
        self,
        incident_id: str,
        rca_doc: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        return await self.col.find_one_and_update(
            {"id": incident_id},
            {"$set": {"workspace.rca": rca_doc, "workspace.version": 1}},
            projection={"_id": 0, "id": 1, "workspace": 1},
            return_document=True,
        )


# Process-wide default (Motor db is already a singleton handle)
incidents_repo = IncidentRepository()
