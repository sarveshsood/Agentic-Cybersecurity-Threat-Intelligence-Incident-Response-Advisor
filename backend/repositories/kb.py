"""Custom knowledge-base document collection access."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


class KnowledgeRepository:
    """Mongo-backed custom KB docs (no retrieval business rules)."""

    collection_name = "kb_docs"

    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db.kb_docs

    async def find_by_id(self, doc_id: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": doc_id}, {"_id": 0})

    async def list_all(self, *, limit: int = 500) -> List[Dict[str, Any]]:
        cursor = self.col.find({}, {"_id": 0}).limit(limit)
        return await cursor.to_list(limit)

    async def upsert(self, doc: Dict[str, Any]) -> None:
        doc_id = doc.get("id")
        if not doc_id:
            raise ValueError("kb doc requires id")
        await self.col.update_one({"id": doc_id}, {"$set": doc}, upsert=True)

    async def delete(self, doc_id: str) -> int:
        result = await self.col.delete_one({"id": doc_id})
        return int(result.deleted_count or 0)


kb_repo = KnowledgeRepository()
