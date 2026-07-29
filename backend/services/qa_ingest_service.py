"""QA artifact ingest — JUnit + coverage → suite runs, readiness, rollups."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, Request, UploadFile

from backend.core import services as svc
from backend.metrics_registry import inc_counter
from backend.models import new_id, utc_now
from backend.qa.coverage_xml_parser import CoverageParseError, parse_coverage_xml
from backend.qa.junit_parser import JUnitParseError, parse_junit_xml
from backend.qa.limits import MAX_XML_BYTES
from backend.qa.module_map import MODULE_MAP_VERSION, MODULE_WEIGHTS
from backend.qa.readiness import CODE_COVERAGE_GATE, compute_readiness
from backend.repositories.qa_repo import json_safe, qa_repo
from backend.secrets_util import clean_secret, is_real_secret

logger = logging.getLogger("actira")


def _keys_match(expected: str, provided: str) -> bool:
    import secrets as _secrets

    if not expected or not provided:
        return False
    exp_b = expected.encode("utf-8")
    got_b = provided.encode("utf-8")
    if len(exp_b) != len(got_b):
        _secrets.compare_digest(exp_b, exp_b)
        return False
    return _secrets.compare_digest(exp_b, got_b)


async def resolve_qa_ingest_actor(
    request: Request,
    x_qa_ingest_token: Optional[str] = None,
) -> Dict[str, Any]:
    """Admin session **or** ``X-QA-Ingest-Token`` (never Bearer shared secret)."""
    expected = clean_secret(os.environ.get("QA_INGEST_TOKEN", ""))
    provided = clean_secret(
        x_qa_ingest_token or request.headers.get("X-QA-Ingest-Token", "")
    )
    if is_real_secret(expected) and _keys_match(expected, provided):
        return {
            "sub": "ci-bot",
            "email": "ci@system.local",
            "role": "admin",
            "ingested_by": {"system": "ci", "kind": "ingest_token"},
        }

    # Fall back to admin JWT (cookie is injected as Bearer by middleware)
    auth_header = request.headers.get("Authorization") or ""
    token = ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = (request.cookies.get("actira_access_token") or "").strip()
    if token:
        from backend.auth import decode_token

        try:
            user = decode_token(token)
        except HTTPException:
            user = None
        if user and user.get("role") == "admin":
            return {
                **user,
                "ingested_by": {
                    "id": user.get("sub") or user.get("id"),
                    "email": user.get("email"),
                },
            }
        if user and user.get("role") != "admin":
            raise HTTPException(403, "QA ingest requires admin role or X-QA-Ingest-Token")

    if is_real_secret(expected):
        raise HTTPException(401, "Invalid or missing X-QA-Ingest-Token (or admin session)")
    raise HTTPException(
        401,
        "Set QA_INGEST_TOKEN and send X-QA-Ingest-Token, or authenticate as admin",
    )


def _iso_now() -> str:
    return utc_now().isoformat()


def _parse_meta(raw: Optional[bytes]) -> Dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw.decode("utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception as e:
        raise HTTPException(400, f"Invalid meta JSON: {e}") from e


async def _read_upload(uf: Optional[UploadFile], *, label: str) -> Optional[bytes]:
    if uf is None:
        return None
    data = await uf.read()
    if len(data) > MAX_XML_BYTES:
        raise HTTPException(413, f"{label} exceeds max size ({MAX_XML_BYTES} bytes)")
    return data


def _suite_type_from_filename(name: str, meta_type: Optional[str]) -> str:
    if meta_type:
        return str(meta_type)
    n = (name or "").lower()
    if "security" in n:
        return "security"
    if "golden" in n:
        return "golden"
    if "e2e" in n or "playwright" in n:
        return "e2e"
    if "perf" in n:
        return "performance"
    return "unit"


async def ingest_artifacts(
    *,
    actor: Dict[str, Any],
    meta_bytes: Optional[bytes] = None,
    junit_files: Optional[List[Tuple[str, bytes]]] = None,
    coverage_bytes: Optional[bytes] = None,
    coverage_filename: str = "coverage.xml",
) -> Dict[str, Any]:
    """Parse and persist JUnit + coverage; recompute readiness for the build."""
    await qa_repo.ensure_indexes()
    meta = _parse_meta(meta_bytes)
    build = dict(meta.get("build") or {})
    source = meta.get("source") or ("ci" if actor.get("ingested_by", {}).get("kind") == "ingest_token" else "upload")
    env = meta.get("env") or "CI"
    category = meta.get("category") or "Functional"
    ci_cov_strict = meta.get("ci_cov_strict")
    finished = _iso_now()
    warnings: List[str] = []
    runs_out: List[Dict[str, Any]] = []

    junit_files = junit_files or []
    for filename, raw in junit_files:
        if not raw:
            continue
        try:
            parsed = parse_junit_xml(raw)
        except JUnitParseError as e:
            inc_counter("actira_qa_parse_errors_total", kind="junit")
            raise HTTPException(400, f"JUnit parse failed ({filename}): {e}") from e

        suite_type = _suite_type_from_filename(filename, meta.get("suite_type") if len(junit_files) == 1 else None)
        # multi-file: allow filename hint; meta suite_type only for single
        if len(junit_files) > 1:
            suite_type = _suite_type_from_filename(filename, None)
            if "security" in (filename or "").lower():
                suite_type = "security"

        run_id = new_id()
        summary = parsed.to_summary()
        doc = {
            "id": run_id,
            "org_id": None,
            "source": source,
            "suite_type": suite_type,
            "category": category if suite_type == "unit" else (
                "Security" if suite_type == "security" else category
            ),
            "name": meta.get("name") or filename or suite_type,
            "status": summary["status"],
            "counts": summary["counts"],
            "duration_s": summary["duration_s"],
            "started_at": meta.get("started_at"),
            "finished_at": finished,
            "env": env,
            "build": build,
            "artifacts": [
                {
                    "kind": "junit",
                    "filename": filename,
                    "sha256": parsed.sha256,
                    "bytes": parsed.bytes,
                }
            ],
            "failures_sample": summary["failures_sample"],
            "ingested_at": finished,
            "ingested_by": actor.get("ingested_by") or {"id": actor.get("sub")},
            "raw_ref": None,
            "module_map_version": MODULE_MAP_VERSION,
            "warnings": summary.get("warnings") or [],
        }
        doc = await qa_repo.upsert_suite_run(doc)
        run_id = doc["id"]
        await qa_repo.delete_case_results_for_run(run_id)
        case_docs = []
        for c in parsed.cases:
            case_docs.append(
                {
                    "id": new_id(),
                    "run_id": run_id,
                    "test_case_id": None,
                    "nodeid": c.nodeid,
                    "name": c.name,
                    "classname": c.classname,
                    "module": c.module,
                    "status": c.status,
                    "duration_s": c.duration_s,
                    "message": c.message,
                    "system_out": c.system_out,
                    "build_id": build.get("id"),
                    "finished_at": finished,
                }
            )
        await qa_repo.insert_case_results(case_docs)
        runs_out.append({"id": run_id, "suite_type": suite_type, "status": doc["status"], "counts": doc["counts"]})
        inc_counter("actira_qa_ingest_total", kind="junit", suite_type=suite_type)

    coverage_out = None
    if coverage_bytes:
        try:
            cov = parse_coverage_xml(coverage_bytes, gate_percent=CODE_COVERAGE_GATE)
        except CoverageParseError as e:
            inc_counter("actira_qa_parse_errors_total", kind="coverage")
            raise HTTPException(400, f"Coverage parse failed: {e}") from e
        cov_doc = {
            "id": new_id(),
            "build": build,
            "captured_at": finished,
            **cov.to_snapshot_fields(),
            "html_artifact_ref": meta.get("html_artifact_ref"),
            "source": source,
            "ci_cov_strict": ci_cov_strict,
            "files": [],
            "critical_gaps": [],
        }
        cov_doc = await qa_repo.upsert_coverage(cov_doc)
        coverage_out = {
            "id": cov_doc["id"],
            "percent": cov_doc["backend"]["percent"],
            "gate_passed": cov_doc["backend"]["gate_passed"],
            "gap_to_gate": cov_doc["backend"]["gap_to_gate"],
        }
        warnings.extend(cov.warnings)
        inc_counter("actira_qa_ingest_total", kind="coverage")

    if not runs_out and not coverage_out:
        raise HTTPException(400, "Provide at least one junit file and/or coverage.xml")

    build_id = build.get("id")
    release = await recompute_for_build(build_id=build_id, actor=actor)

    try:
        await svc.audit(
            actor if actor.get("sub") else {"sub": "ci-bot", "email": "ci@system.local", "role": "admin"},
            "qa.ingest",
            "qa_build",
            build_id or "local",
            {
                "runs": [r["id"] for r in runs_out],
                "coverage_id": (coverage_out or {}).get("id"),
                "auth": "ingest_token" if actor.get("ingested_by", {}).get("kind") == "ingest_token" else "admin",
                "verdict": (release or {}).get("verdict"),
            },
        )
    except Exception as e:
        logger.warning("qa ingest audit failed: %s", e)

    return {
        "ok": True,
        "build": build,
        "runs": runs_out,
        "coverage": coverage_out,
        "release": {
            "id": (release or {}).get("id"),
            "verdict": (release or {}).get("verdict"),
            "score": (release or {}).get("score"),
            "blockers": (release or {}).get("blockers"),
        },
        "warnings": warnings,
    }


def _module_scores_from_runs(runs: List[Dict[str, Any]]) -> Dict[str, float]:
    """Best-effort: pass rate * 100 per suite category mapped to modules."""
    # Without scanning all cases, derive coarse scores from suite pass/fail
    scores: Dict[str, List[float]] = {}
    type_to_mod = {
        "unit": "Backend",
        "integration": "Backend",
        "security": "Security",
        "e2e": "Frontend",
        "golden": "AI",
        "performance": "Performance",
        "lint": "DevOps",
    }
    for r in runs:
        mod = type_to_mod.get(r.get("suite_type") or "", "Backend")
        counts = r.get("counts") or {}
        total = int(counts.get("total") or 0)
        if total <= 0:
            val = 100.0 if r.get("status") == "passed" else 0.0
        else:
            passed = int(counts.get("passed") or 0)
            val = 100.0 * passed / total
        scores.setdefault(mod, []).append(val)
    return {m: round(sum(v) / len(v), 1) for m, v in scores.items()}


def _quality_from_modules(module_scores: Dict[str, float]) -> float:
    num = den = 0.0
    for m, w in MODULE_WEIGHTS.items():
        if m in module_scores and m != "Unmapped":
            num += w * float(module_scores[m])
            den += w
    if den <= 0:
        return 0.0
    return round(num / den, 1)


async def recompute_for_build(
    *,
    build_id: Optional[str] = None,
    actor: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Recompute readiness + rollups after ingest (KD-15).

    Uses build-scoped suites when present, then **falls back to latest global**
    suite of each type. UI golden runs use synthetic build ids (``ui-golden-*``)
    that never have unit/coverage — without fallback, unit_pass always fails.
    """
    unit = await qa_repo.find_suite("unit", build_id=build_id)
    if not unit:
        unit = await qa_repo.find_suite("unit", build_id=None)
    golden = await qa_repo.find_suite("golden", build_id=build_id)
    if not golden:
        golden = await qa_repo.find_suite("golden", build_id=None)
    security = await qa_repo.find_suite("security", build_id=build_id)
    if not security:
        security = await qa_repo.find_suite("security", build_id=None)
    e2e = await qa_repo.find_suite("e2e", build_id=build_id)
    if not e2e:
        e2e = await qa_repo.find_suite("e2e", build_id=None)
    coverage = await qa_repo.get_coverage(build_id=build_id)
    if not coverage:
        coverage = await qa_repo.get_coverage(build_id=None)

    # collect recent runs for module scores
    recent = await qa_repo.list_suite_runs(limit=30)
    module_scores = _module_scores_from_runs(recent)
    q = _quality_from_modules(module_scores)

    build_meta = (
        (unit or {}).get("build")
        or (golden or {}).get("build")
        or (coverage or {}).get("build")
        or ({"id": build_id} if build_id else None)
    )

    snap = compute_readiness(
        unit_run=unit,
        golden_run=golden,
        security_run=security,
        e2e_run=e2e,
        coverage=coverage,
        open_critical_defects=0,
        build=build_meta,
        quality_score=q,
    )
    rel_id = new_id()
    rel_doc = {"id": rel_id, **snap}
    # insert_release returns ObjectId-free payload (safe for FastAPI JSON)
    public = await qa_repo.insert_release(rel_doc)

    pass_rate = None
    if unit and unit.get("counts"):
        c = unit["counts"]
        t = int(c.get("total") or 0)
        if t:
            pass_rate = round(int(c.get("passed") or 0) / t, 4)

    cov_pct = None
    if coverage:
        cov_pct = (coverage.get("backend") or {}).get("percent")

    effective_build = (build_meta or {}).get("id") if isinstance(build_meta, dict) else build_id

    rollup = {
        "id": "latest",
        "updated_at": _iso_now(),
        "build_id": effective_build,
        "module_scores": module_scores,
        "quality_score": q,
        "grade": snap["grade"],
        "pass_rate": pass_rate,
        "automation_pct": None,
        "coverage_percent": cov_pct,
        "unmapped_case_count": 0,
        "flaky_nodeids": [],
        "module_map_version": MODULE_MAP_VERSION,
        "recent_failure_ids": [],
        "verdict": snap["verdict"],
        "release_id": rel_id,
        "unit_run_id": (unit or {}).get("id"),
        "golden_run_id": (golden or {}).get("id"),
        "coverage_id": (coverage or {}).get("id"),
    }
    if build_id:
        await qa_repo.upsert_rollup({**rollup, "id": f"build:{build_id}"})
    await qa_repo.upsert_rollup(rollup)

    inc_counter("actira_qa_readiness_total", verdict=snap["verdict"])
    # Never leak Mongo ObjectId into HTTP response (deep sanitize)
    return json_safe(public or rel_doc)
