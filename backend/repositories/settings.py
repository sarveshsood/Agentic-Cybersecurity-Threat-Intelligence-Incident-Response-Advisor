"""Global settings document access."""
from __future__ import annotations

from typing import Any, Dict, Optional

from backend.database import db


class SettingsRepository:
    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db.settings

    async def get_global(self) -> Optional[Dict[str, Any]]:
        return await self.col.find_one({"id": "global"}, {"_id": 0})

    async def upsert_global(self, storage: Dict[str, Any]) -> None:
        await self.col.update_one({"id": "global"}, {"$set": storage}, upsert=True)

    async def insert_global(self, storage: Dict[str, Any]) -> None:
        await self.col.insert_one(storage)


settings_repo = SettingsRepository()
