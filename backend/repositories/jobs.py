"""Log-job collection access."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


class JobRepository:
    """Mongo-backed pipeline job queries (no business rules)."""

    collection_name = "log_jobs"

    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db.log_jobs

    async def find_by_id(self, job_id: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": job_id}, {"_id": 0})

    async def list_recent(self, *, limit: int = 50, state: Optional[str] = None) -> List[Dict[str, Any]]:
        query: Dict[str, Any] = {}
        if state:
            query["status"] = state
        cursor = self.col.find(query, {"_id": 0}).sort("created_at", -1).limit(limit)
        return await cursor.to_list(limit)

    async def count_by_status(self, status: str) -> int:
        return int(await self.col.count_documents({"status": status}))

    async def count_all(self) -> int:
        return int(await self.col.count_documents({}))


jobs_repo = JobRepository()
