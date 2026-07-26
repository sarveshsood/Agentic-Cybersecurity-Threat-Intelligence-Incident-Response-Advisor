"""User collection access."""
from __future__ import annotations

import re
from typing import Any, Dict, Optional

from backend.database import db


class UserRepository:
    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db.users

    async def find_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"email": email})

    async def find_by_email_ci(self, email: str) -> Optional[Dict[str, Any]]:
        doc = await self.col.find_one({"email": email}, {"_id": 0})
        if doc:
            return doc
        return await self.col.find_one(
            {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
            {"_id": 0},
        )

    async def find_by_id_public(self, user_id: str) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})

    async def insert(self, doc: Dict[str, Any]) -> None:
        await self.col.insert_one(doc)

    async def count(self) -> int:
        return await self.col.count_documents({})


users_repo = UserRepository()
