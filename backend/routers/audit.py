"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

from fastapi import (
    APIRouter, Depends, Query,
)

from backend.auth import (
    require_roles,
)
from backend.core.database import db

router = APIRouter(tags=['audit'])


# ---------- Audit ----------
@router.get("/audit")
async def audit_log(
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        user=Depends(require_roles("admin", "senior_reviewer")),
):
    cursor = db.audit_log.find({}, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(limit)
    return docs
