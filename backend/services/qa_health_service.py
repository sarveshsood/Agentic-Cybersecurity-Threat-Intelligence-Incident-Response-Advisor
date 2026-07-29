"""Read APIs for Testing Health Center summary / runs / coverage / release."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import HTTPException

from backend.repositories.qa_repo import json_safe, qa_repo
from backend.services.qa_ingest_service import recompute_for_build


async def get_summary() -> Dict[str, Any]:
    rollup = await qa_repo.get_rollup("latest") or {}
    release = await qa_repo.latest_release()
    coverage = await qa_repo.get_coverage()
    return json_safe({
        "quality_score": rollup.get("quality_score"),
        "grade": rollup.get("grade"),
        "verdict": (release or {}).get("verdict") or rollup.get("verdict"),
        "pass_rate": rollup.get("pass_rate"),
        "coverage_percent": rollup.get("coverage_percent"),
        "module_scores": rollup.get("module_scores") or {},
        "release_id": (release or {}).get("id") or rollup.get("release_id"),
        "build_id": rollup.get("build_id"),
        "updated_at": rollup.get("updated_at"),
        "coverage_mode": (release or {}).get("coverage_mode"),
        "blockers": (release or {}).get("blockers") or [],
        "soft_warnings": (release or {}).get("soft_warnings") or [],
        "frontend_coverage": (coverage or {}).get("frontend"),
        "empty": not rollup and not release,
    })


async def list_runs(*, skip: int = 0, limit: int = 50, suite_type: Optional[str] = None) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 50), 200))
    skip = max(0, int(skip or 0))
    items = await qa_repo.list_suite_runs(skip=skip, limit=limit, suite_type=suite_type)
    return {"items": items, "skip": skip, "limit": limit}


async def get_run(run_id: str) -> Dict[str, Any]:
    row = await qa_repo.get_suite_run(run_id)
    if not row:
        raise HTTPException(404, "Suite run not found")
    return row


async def get_coverage(*, build_id: Optional[str] = None) -> Dict[str, Any]:
    row = await qa_repo.get_coverage(build_id=build_id)
    if not row:
        return {
            "available": False,
            "note": "No coverage snapshot ingested yet",
            "frontend": {"available": False, "note": "No Istanbul/nyc CI artifact ingested"},
        }
    return {"available": True, **row}


async def get_release_latest() -> Dict[str, Any]:
    row = await qa_repo.latest_release()
    if not row:
        return {"available": False, "verdict": None, "note": "No release snapshot yet — ingest artifacts first"}
    return {"available": True, **row}


async def get_release(rel_id: str) -> Dict[str, Any]:
    row = await qa_repo.get_release(rel_id)
    if not row:
        raise HTTPException(404, "Release snapshot not found")
    return row


async def force_recompute(actor: dict, build_id: Optional[str] = None) -> Dict[str, Any]:
    # Always JSON-safe — ObjectId in nested suite/coverage fields broke the UI
    return json_safe(await recompute_for_build(build_id=build_id, actor=actor))
