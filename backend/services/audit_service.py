"""Audit log listing."""
from __future__ import annotations

from typing import Any, Dict, List

from backend.database import db


async def list_audit(*, skip: int = 0, limit: int = 50) -> List[Dict[str, Any]]:
    cursor = db.audit_log.find({}, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit)
    return await cursor.to_list(limit)
