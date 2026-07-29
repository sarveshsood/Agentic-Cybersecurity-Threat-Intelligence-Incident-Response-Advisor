"""Testing Health Center (QA Health) — PR-1 scaffold.

Flag-gated routes under ``/qa/*`` (dual-mounted as ``/api/qa`` and ``/api/v1/qa``).
When ``FEATURE_QA_HEALTH_CENTER`` is off, routes return **404** via ``require_feature``.

See ``docs/product/TESTING_HEALTH_CENTER_DESIGN.md`` (Phase 0 / PR-1).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends

from backend.feature_flags import require_feature
from backend.security import require_roles

router = APIRouter(
    prefix="/qa",
    tags=["qa"],
    dependencies=[Depends(require_feature("qa_health_center"))],
)


@router.get(
    "/healthz",
    summary="QA Health Center feature probe",
    response_description="200 when FEATURE_QA_HEALTH_CENTER is on and caller is admin or senior_reviewer",
)
async def qa_healthz(user=Depends(require_roles("admin", "senior_reviewer"))):
    """Lightweight readiness for the QA surface (no artifact data yet).

    Used by SPA/nav to confirm the flag path works before full ingest APIs land.
    """
    return {
        "ok": True,
        "feature": "qa_health_center",
        "phase": "pr1_scaffold",
        "role": user.get("role"),
    }
