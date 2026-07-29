"""QA use-case catalog (capstone seed) + safe run-from-UI actions."""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.database import db
from backend.models import new_id, utc_now
from backend.qa.module_map import MODULE_MAP_VERSION

logger = logging.getLogger("actira")

SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "qa_catalog_seed_v1.json"
COLLECTION = "qa_test_cases"


def _col():
    return db[COLLECTION]


def load_seed_file() -> Dict[str, Any]:
    if not SEED_PATH.is_file():
        raise HTTPException(500, f"Catalog seed missing: {SEED_PATH}")
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


async def seed_catalog(*, force: bool = False) -> Dict[str, Any]:
    """Upsert cases from committed JSON seed (idempotent)."""
    payload = load_seed_file()
    cases = payload.get("cases") or []
    if not cases:
        raise HTTPException(500, "Catalog seed has no cases")

    existing = await _col().count_documents({})
    if existing and not force:
        return {
            "ok": True,
            "seeded": False,
            "existing": existing,
            "seed_count": len(cases),
            "message": "Catalog already present; pass force=true to reseed",
            "version": payload.get("version"),
        }

    now = utc_now().isoformat()
    upserted = 0
    for c in cases:
        doc = dict(c)
        doc["updated_at"] = now
        doc["module_map_version"] = MODULE_MAP_VERSION
        await _col().update_one({"id": doc["id"]}, {"$set": doc}, upsert=True)
        upserted += 1

    try:
        await _col().create_index("id", unique=True)
        await _col().create_index([("module", 1), ("priority", 1)])
        await _col().create_index([("runner", 1)])
        await _col().create_index([("status", 1)])
    except Exception:
        pass

    return {
        "ok": True,
        "seeded": True,
        "upserted": upserted,
        "seed_count": len(cases),
        "version": payload.get("version"),
        "source": str(SEED_PATH.as_posix()),
    }


async def ensure_seeded() -> None:
    n = await _col().count_documents({})
    if n == 0:
        await seed_catalog(force=False)


async def list_cases(
    *,
    q: Optional[str] = None,
    module: Optional[str] = None,
    runner: Optional[str] = None,
    automation: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    skip: int = 0,
    limit: int = 200,
) -> Dict[str, Any]:
    await ensure_seeded()
    filt: Dict[str, Any] = {}
    if module:
        filt["module"] = module
    if runner:
        filt["runner"] = runner
    if automation:
        filt["automation"] = automation
    if status:
        filt["status"] = status
    if priority:
        filt["priority"] = priority
    if q:
        qx = {"$regex": q, "$options": "i"}
        filt["$or"] = [
            {"id": qx},
            {"title": qx},
            {"description": qx},
            {"type": qx},
            {"catalog_module_raw": qx},
        ]

    limit = max(1, min(int(limit or 200), 500))
    skip = max(0, int(skip or 0))
    total = await _col().count_documents(filt)
    cursor = (
        _col()
        .find(filt, {"_id": 0})
        .sort([("priority", 1), ("id", 1)])
        .skip(skip)
        .limit(limit)
    )
    items = await cursor.to_list(limit)

    # stats over full collection (not filtered) for KPI strip
    all_n = await _col().count_documents({})
    by_runner: Dict[str, int] = {}
    by_module: Dict[str, int] = {}
    by_status: Dict[str, int] = {}
    async for row in _col().find({}, {"_id": 0, "runner": 1, "module": 1, "status": 1}):
        r = row.get("runner") or "unknown"
        m = row.get("module") or "Unmapped"
        s = row.get("status") or "not_run"
        by_runner[r] = by_runner.get(r, 0) + 1
        by_module[m] = by_module.get(m, 0) + 1
        by_status[s] = by_status.get(s, 0) + 1

    runnable = by_runner.get("golden", 0)
    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit,
        "catalog_total": all_n,
        "stats": {
            "by_runner": by_runner,
            "by_module": by_module,
            "by_status": by_status,
            "runnable_from_ui": runnable,
        },
        "module_map_version": MODULE_MAP_VERSION,
    }


async def get_case(case_id: str) -> Dict[str, Any]:
    await ensure_seeded()
    row = await _col().find_one({"id": case_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, f"Use case not found: {case_id}")
    return row


async def _mark_case_result(
    case_id: str,
    *,
    status: str,
    actual: str,
    run_id: Optional[str] = None,
) -> None:
    await _col().update_one(
        {"id": case_id},
        {
            "$set": {
                "status": status,
                "actual_last": (actual or "")[:2000],
                "last_run_at": utc_now().isoformat(),
                "last_run_id": run_id,
                "updated_at": utc_now().isoformat(),
            }
        },
    )


async def run_usecases(
    *,
    actor: dict,
    scope: str = "golden",
    case_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Execute runnable use cases from the UI.

    Scopes:
      - ``golden`` / ``all_runnable``: offline golden IR benchmark (admin)
      - ``case`` / list of ids: run golden if any golden-runner ids; manual ids return instructions
    """
    await ensure_seeded()
    scope = (scope or "golden").strip().lower()
    role = (actor or {}).get("role")

    results: List[Dict[str, Any]] = []
    golden_out: Optional[Dict[str, Any]] = None

    # Resolve which cases
    ids = list(case_ids or [])
    if scope in ("golden", "all_runnable", "all"):
        cursor = _col().find({"runner": "golden"}, {"_id": 0, "id": 1})
        ids = [d["id"] async for d in cursor]
    elif scope == "case" and not ids:
        raise HTTPException(400, "case_ids required when scope=case")

    if not ids and scope not in ("golden", "all_runnable", "all"):
        raise HTTPException(400, "No use cases selected")

    # Load case docs
    cases = []
    if ids:
        cases = await _col().find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)

    golden_ids = [c["id"] for c in cases if c.get("runner") == "golden"]
    manual_ids = [c["id"] for c in cases if c.get("runner") in ("manual", "semi", "e2e_manual", "pytest_hint")]

    # Run golden offline suite once if any golden cases requested
    if golden_ids or scope in ("golden", "all_runnable", "all"):
        if role != "admin":
            raise HTTPException(403, "Running golden use cases requires admin (POST golden eval)")
        from backend.services import eval_service
        from backend.services.qa_ingest_service import recompute_for_build
        from backend.repositories.qa_repo import qa_repo
        from backend.models import new_id as _nid

        golden_out = await eval_service.run_golden_benchmark(
            actor,
            include_cases=False,
            live_llm=False,
        )

        # Mirror as suite run
        passed = bool((golden_out or {}).get("passed") or (golden_out or {}).get("summary", {}).get("passed"))
        # eval returns various shapes
        summary = (golden_out or {}).get("summary") or golden_out or {}
        if "passed" in (golden_out or {}):
            passed = bool(golden_out.get("passed"))
        elif isinstance(summary, dict) and "passed" in summary:
            passed = bool(summary.get("passed"))

        run_id = _nid()
        finished = utc_now().isoformat()
        n_cases = int(summary.get("n_cases") or len(golden_ids) or 0)
        doc = {
            "id": run_id,
            "source": "golden_mirror",
            "suite_type": "golden",
            "category": "AI",
            "name": "golden-offline-ui",
            "status": "passed" if passed else "failed",
            "counts": {
                "total": n_cases,
                "passed": n_cases if passed else 0,
                "failed": 0 if passed else max(1, n_cases),
                "skipped": 0,
                "blocked": 0,
                "errors": int(summary.get("n_errors") or 0),
            },
            "duration_s": float(summary.get("mean_latency_s") or 0) * max(1, n_cases),
            "finished_at": finished,
            "started_at": finished,
            "env": "LAB",
            "build": {"id": f"ui-golden-{run_id[:8]}", "branch": "ui", "commit": None},
            "artifacts": [],
            "failures_sample": [],
            "ingested_at": finished,
            "ingested_by": {"id": actor.get("sub"), "email": actor.get("email")},
            "module_map_version": MODULE_MAP_VERSION,
            "passed": passed,
        }
        # Prefer eval payload fields
        if golden_out and "passed" in golden_out:
            doc["status"] = "passed" if golden_out["passed"] else "failed"
            doc["passed"] = golden_out["passed"]
        await qa_repo.upsert_suite_run(doc)
        await recompute_for_build(build_id=doc["build"]["id"], actor=actor)

        status_for_cases = "pass" if doc["status"] == "passed" else "fail"
        actual = (
            f"Golden offline run {run_id}: status={doc['status']} "
            f"n_cases={n_cases} mean_ioc_f1={summary.get('mean_ioc_f1')} "
            f"tech_recall={summary.get('mean_technique_recall')}"
        )
        for cid in golden_ids or ids:
            cdoc = next((c for c in cases if c["id"] == cid), None)
            if cdoc and cdoc.get("runner") != "golden" and golden_ids:
                continue
            if not golden_ids or cid in golden_ids:
                await _mark_case_result(cid, status=status_for_cases, actual=actual, run_id=run_id)
                results.append({"id": cid, "runner": "golden", "status": status_for_cases, "run_id": run_id})

        # If scope golden and no catalog golden_ids loaded, mark all golden runners
        if not golden_ids and scope in ("golden", "all_runnable", "all"):
            async for c in _col().find({"runner": "golden"}, {"_id": 0, "id": 1}):
                await _mark_case_result(c["id"], status=status_for_cases, actual=actual, run_id=run_id)
                results.append({"id": c["id"], "runner": "golden", "status": status_for_cases, "run_id": run_id})

    for cid in manual_ids:
        c = next((x for x in cases if x["id"] == cid), None)
        if not c:
            continue
        if c.get("runner") == "golden":
            continue
        msg = (
            f"Manual/semi use case — not auto-executed in API. "
            f"Steps: {c.get('description') or '—'} | Expected: {c.get('expected') or '—'}"
        )
        results.append(
            {
                "id": cid,
                "runner": c.get("runner"),
                "status": "manual",
                "message": msg,
            }
        )

    return {
        "ok": True,
        "scope": scope,
        "results": results,
        "result_count": len(results),
        "golden": {
            "ran": golden_out is not None,
            "passed": (golden_out or {}).get("passed"),
            "summary": (golden_out or {}).get("summary") if isinstance(golden_out, dict) else None,
        }
        if golden_out is not None
        else {"ran": False},
        "note": (
            "Golden IR offline suite is the automated runner from QA UI. "
            "Manual/e2e cases are listed with steps only (not executed in-process)."
        ),
    }
