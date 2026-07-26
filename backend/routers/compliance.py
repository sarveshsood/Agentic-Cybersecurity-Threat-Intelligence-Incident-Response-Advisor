"""ACTIRA API routes — Compliance module."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from backend.auth import require_roles

router = APIRouter(prefix="/compliance", tags=["Compliance"])


@router.get("/status")
async def get_compliance_status(user=Depends(require_roles("analyst", "senior_reviewer", "admin"))):
    """Return compliance mapping scores and active framework metrics."""
    return {
        "score": 89,
        "frameworks": [
            {"name": "ISO 27001", "status": "Passing", "controls": "42/45"},
            {"name": "SOC 2 Type II", "status": "Compliant", "controls": "61/61"},
            {"name": "NIST SP 800-61", "status": "Review", "controls": "18/22"}
        ],
        "last_audit": datetime.now(timezone.utc).isoformat()
    }
