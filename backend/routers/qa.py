"""Testing Health Center (QA Health) routes.

Flag-gated under ``/qa/*`` (dual ``/api`` + ``/api/v1``).
See ``docs/product/TESTING_HEALTH_CENTER_DESIGN.md``.
"""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, Header, Query, Request, UploadFile

from backend.feature_flags import require_feature
from backend.security import require_roles
from backend.services import qa_health_service, qa_ingest_service

router = APIRouter(
    prefix="/qa",
    tags=["qa"],
    dependencies=[Depends(require_feature("qa_health_center"))],
)

_READ = require_roles("admin", "senior_reviewer")
_ADMIN = require_roles("admin")


@router.get(
    "/healthz",
    summary="QA Health Center feature probe",
)
async def qa_healthz(user=Depends(_READ)):
    return {
        "ok": True,
        "feature": "qa_health_center",
        "phase": "pr3_ingest",
        "role": user.get("role"),
    }


@router.get("/summary", summary="Overview KPIs from rollups + latest readiness")
async def qa_summary(user=Depends(_READ)):
    return await qa_health_service.get_summary()


@router.get("/runs", summary="Paginated suite runs")
async def qa_list_runs(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    suite_type: Optional[str] = Query(None),
    user=Depends(_READ),
):
    return await qa_health_service.list_runs(skip=skip, limit=limit, suite_type=suite_type)


@router.get("/runs/{run_id}", summary="Suite run detail")
async def qa_get_run(run_id: str, user=Depends(_READ)):
    return await qa_health_service.get_run(run_id)


@router.get("/coverage", summary="Latest or build-scoped coverage snapshot")
async def qa_coverage(
    build: Optional[str] = Query(None, description="build.id"),
    user=Depends(_READ),
):
    return await qa_health_service.get_coverage(build_id=build)


@router.get("/release/latest", summary="Latest release readiness snapshot")
async def qa_release_latest(user=Depends(_READ)):
    return await qa_health_service.get_release_latest()


@router.get("/release/{rel_id}", summary="Release snapshot by id")
async def qa_release_get(rel_id: str, user=Depends(_READ)):
    return await qa_health_service.get_release(rel_id)


@router.post("/release/recompute", summary="Force readiness recompute")
async def qa_release_recompute(
    build_id: Optional[str] = Query(None),
    user=Depends(_ADMIN),
):
    return await qa_health_service.force_recompute(user, build_id=build_id)


@router.post(
    "/ingest",
    summary="Ingest JUnit / coverage artifacts (admin session or X-QA-Ingest-Token)",
)
async def qa_ingest(
    request: Request,
    x_qa_ingest_token: Optional[str] = Header(default=None, alias="X-QA-Ingest-Token"),
    meta: Optional[UploadFile] = File(None, description="meta.json"),
    junit: Optional[UploadFile] = File(None, description="Primary JUnit XML"),
    junit_security: Optional[UploadFile] = File(None),
    junit_e2e: Optional[UploadFile] = File(None),
    coverage: Optional[UploadFile] = File(None, description="coverage.xml Cobertura"),
    # optional form fields if not using meta file
    suite_type: Optional[str] = Form(None),
    build_id: Optional[str] = Form(None),
    branch: Optional[str] = Form(None),
    commit: Optional[str] = Form(None),
):
    actor = await qa_ingest_service.resolve_qa_ingest_actor(
        request, x_qa_ingest_token=x_qa_ingest_token
    )

    meta_bytes = await qa_ingest_service._read_upload(meta, label="meta")
    # Merge simple form fields into meta when no meta file
    if not meta_bytes and (suite_type or build_id or branch or commit):
        import json

        meta_obj = {
            "suite_type": suite_type or "unit",
            "source": "upload",
            "build": {
                k: v
                for k, v in {
                    "id": build_id,
                    "branch": branch,
                    "commit": commit,
                }.items()
                if v
            },
        }
        meta_bytes = json.dumps(meta_obj).encode("utf-8")

    junit_files: List[tuple] = []
    for uf in (junit, junit_security, junit_e2e):
        if uf is None:
            continue
        raw = await qa_ingest_service._read_upload(uf, label=uf.filename or "junit")
        if raw:
            junit_files.append((uf.filename or "junit.xml", raw))

    cov_raw = await qa_ingest_service._read_upload(coverage, label="coverage")
    return await qa_ingest_service.ingest_artifacts(
        actor=actor,
        meta_bytes=meta_bytes,
        junit_files=junit_files,
        coverage_bytes=cov_raw,
        coverage_filename=(coverage.filename if coverage else "coverage.xml") or "coverage.xml",
    )
