"""QA use-case catalog (capstone seed) + run tracking from the UI."""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.database import db
from backend.models import new_id, utc_now
from backend.qa.module_map import MODULE_MAP_VERSION

logger = logging.getLogger("actira")

SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "qa_catalog_seed_v1.json"
COLLECTION = "qa_test_cases"
RUNS_COLLECTION = "qa_usecase_runs"
HISTORY_CAP = 25

# Catalog fields safe to refresh from seed without wiping run tracking
_SEED_SET_KEYS = (
    "title",
    "module",
    "feature",
    "category",
    "priority",
    "severity",
    "type",
    "automation",
    "automation_raw",
    "runner",
    "owner",
    "linked_bug",
    "requirement_ids",
    "description",
    "expected",
    "evidence",
    "source",
    "catalog_module_raw",
    "org_id",
    "module_map_version",
    "updated_at",
)


def _col():
    return db[COLLECTION]


def _runs_col():
    return db[RUNS_COLLECTION]


def load_seed_file() -> Dict[str, Any]:
    if not SEED_PATH.is_file():
        raise HTTPException(500, f"Catalog seed missing: {SEED_PATH}")
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


async def seed_catalog(*, force: bool = False) -> Dict[str, Any]:
    """Upsert catalog definitions from JSON seed without wiping run status."""
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
            "message": "Catalog already present; pass force=true to reseed definitions (keeps status)",
            "version": payload.get("version"),
        }

    now = utc_now().isoformat()
    upserted = 0
    for c in cases:
        base = {k: c.get(k) for k in _SEED_SET_KEYS if k in c or k in ("module_map_version", "updated_at")}
        base["module_map_version"] = MODULE_MAP_VERSION
        base["updated_at"] = now
        # Always set id
        cid = c["id"]
        await _col().update_one(
            {"id": cid},
            {
                "$set": base,
                "$setOnInsert": {
                    "id": cid,
                    "status": "not_run",
                    "last_run_at": None,
                    "last_run_id": None,
                    "last_batch_id": None,
                    "actual_last": None,
                    "run_count": 0,
                    "run_history": [],
                },
            },
            upsert=True,
        )
        upserted += 1

    try:
        await _col().create_index("id", unique=True)
        await _col().create_index([("module", 1), ("priority", 1)])
        await _col().create_index([("runner", 1)])
        await _col().create_index([("status", 1)])
        await _col().create_index([("last_run_at", -1)])
        await _runs_col().create_index([("finished_at", -1)])
    except Exception:
        pass

    return {
        "ok": True,
        "seeded": True,
        "upserted": upserted,
        "seed_count": len(cases),
        "version": payload.get("version"),
        "source": str(SEED_PATH.as_posix()),
        "preserved_status": True,
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

    last_batch = await _runs_col().find_one({}, {"_id": 0}, sort=[("finished_at", -1)])

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
            "runnable_from_ui": by_runner.get("golden", 0),
            "pass": by_status.get("pass", 0),
            "fail": by_status.get("fail", 0),
            "skipped": by_status.get("skipped", 0),
            "not_run": by_status.get("not_run", 0),
            "blocked": by_status.get("blocked", 0),
        },
        "last_batch": last_batch,
        "module_map_version": MODULE_MAP_VERSION,
    }


async def get_case(case_id: str) -> Dict[str, Any]:
    await ensure_seeded()
    row = await _col().find_one({"id": case_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, f"Use case not found: {case_id}")
    return row


async def list_batches(*, limit: int = 20) -> Dict[str, Any]:
    limit = max(1, min(int(limit or 20), 50))
    items = (
        await _runs_col()
        .find({}, {"_id": 0})
        .sort("finished_at", -1)
        .limit(limit)
        .to_list(limit)
    )
    return {"items": items, "limit": limit}


async def _mark_case_result(
    case_id: str,
    *,
    status: str,
    actual: str,
    run_id: Optional[str] = None,
    batch_id: Optional[str] = None,
    runner: Optional[str] = None,
) -> None:
    """Update status + append run_history entry (capped)."""
    now = utc_now().isoformat()
    hist_entry = {
        "at": now,
        "status": status,
        "run_id": run_id,
        "batch_id": batch_id,
        "runner": runner,
        "actual": (actual or "")[:500],
    }
    await _col().update_one(
        {"id": case_id},
        {
            "$set": {
                "status": status,
                "actual_last": (actual or "")[:2000],
                "last_run_at": now,
                "last_run_id": run_id,
                "last_batch_id": batch_id,
                "updated_at": now,
            },
            "$inc": {"run_count": 1},
            "$push": {
                "run_history": {
                    "$each": [hist_entry],
                    "$position": 0,
                    "$slice": HISTORY_CAP,
                }
            },
        },
    )


async def set_case_verdict(
    case_id: str,
    *,
    actor: dict,
    status: str,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    """Admin manual Pass/Fail/Blocked for non-auto cases."""
    # Fail-fast RBAC before any Mongo touch (also keeps unit tests free of event-loop/DB).
    role = (actor or {}).get("role")
    if role != "admin":
        raise HTTPException(403, "Setting use-case verdict requires admin")

    await ensure_seeded()

    status = (status or "").strip().lower()
    allowed = {"pass", "fail", "blocked", "skipped", "not_run"}
    if status not in allowed:
        raise HTTPException(400, f"status must be one of {sorted(allowed)}")

    row = await _col().find_one({"id": case_id}, {"_id": 0})
    if not row:
        raise HTTPException(404, f"Use case not found: {case_id}")

    batch_id = new_id()
    actual = (
        f"manual_verdict by={(actor or {}).get('email') or (actor or {}).get('sub')} "
        f"status={status}"
    )
    if note:
        actual += f" note={str(note)[:500]}"

    await _mark_case_result(
        case_id,
        status=status,
        actual=actual,
        run_id=batch_id,
        batch_id=batch_id,
        runner=row.get("runner") or "manual",
    )
    batch_doc = {
        "id": batch_id,
        "scope": "verdict",
        "started_at": utc_now().isoformat(),
        "finished_at": utc_now().isoformat(),
        "actor": {
            "id": (actor or {}).get("sub") or (actor or {}).get("id"),
            "email": (actor or {}).get("email"),
            "role": (actor or {}).get("role"),
        },
        "counts": {
            "total": 1,
            "pass": 1 if status == "pass" else 0,
            "fail": 1 if status == "fail" else 0,
            "skipped": 1 if status == "skipped" else 0,
            "blocked": 1 if status == "blocked" else 0,
            "error": 0,
        },
        "case_ids": [case_id],
        "note": "Manual verdict from QA UI",
    }
    try:
        await _runs_col().insert_one(batch_doc)
    except Exception as e:
        logger.warning("verdict batch insert failed: %s", e)

    updated = await get_case(case_id)
    return {
        "ok": True,
        "case": updated,
        "batch_id": batch_id,
        "status": status,
    }


async def run_usecases(
    *,
    actor: dict,
    scope: str = "golden",
    case_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Run / track use cases from the UI and persist status for every case touched.

    Scopes (mutually distinct engines):
      - ``golden``: offline IR golden suite only (runner=golden rows)
      - ``e2e``: Playwright browser suite only (TC-E2E-* + mapped UI) — no golden, no API smoke
      - ``all`` / ``all_runnable``: golden + API smoke for full catalog — **no Playwright**
      - ``case``: selected ids (golden / smoke / blocked only; Playwright only if id is E2E-mapped
        and you use scope=e2e instead)
    """
    await ensure_seeded()
    scope = (scope or "golden").strip().lower()
    role = (actor or {}).get("role")
    if role != "admin":
        raise HTTPException(403, "Running use cases requires admin")

    batch_id = new_id()
    started = utc_now().isoformat()
    results: List[Dict[str, Any]] = []
    golden_out: Optional[Dict[str, Any]] = None
    golden_run_id: Optional[str] = None
    summary: Dict[str, Any] = {}
    playwright_meta: Dict[str, Any] = {"ran": False}

    from backend.services.qa_playwright_runner import PLAYWRIGHT_TC_IDS, is_playwright_case

    # Resolve target cases
    if scope in ("all", "all_runnable"):
        cases = await _col().find({}, {"_id": 0}).to_list(500)
        ids = [c["id"] for c in cases]
    elif scope == "golden":
        cases = await _col().find({"runner": "golden"}, {"_id": 0}).to_list(500)
        ids = [c["id"] for c in cases]
    elif scope == "e2e":
        cases = await _col().find({}, {"_id": 0}).to_list(500)
        cases = [c for c in cases if is_playwright_case(c) or c.get("id") in PLAYWRIGHT_TC_IDS]
        ids = [c["id"] for c in cases]
    elif scope == "case":
        ids = list(case_ids or [])
        if not ids:
            raise HTTPException(400, "case_ids required when scope=case")
        cases = await _col().find({"id": {"$in": ids}}, {"_id": 0}).to_list(500)
        if not cases:
            raise HTTPException(404, "No matching use cases for case_ids")
    else:
        raise HTTPException(400, f"Unknown scope: {scope}")

    if not cases:
        raise HTTPException(400, "No use cases to process")

    # Partition engines by scope — e2e never runs golden; all never runs Playwright
    if scope == "e2e":
        golden_cases = []
        other_cases = list(cases)
        run_playwright = True
        run_api_smoke = False  # e2e is browser-only
    elif scope == "golden":
        golden_cases = list(cases)
        other_cases = []
        run_playwright = False
        run_api_smoke = False
    else:
        # all | all_runnable | case
        golden_cases = [c for c in cases if c.get("runner") == "golden"]
        other_cases = [c for c in cases if c.get("runner") != "golden"]
        run_playwright = False  # Playwright is only scope=e2e
        run_api_smoke = True

    counts = {"pass": 0, "fail": 0, "skipped": 0, "blocked": 0, "error": 0}

    # --- Golden offline suite ---
    if golden_cases:
        from backend.models import new_id as _nid
        from backend.repositories.qa_repo import qa_repo
        from backend.services import eval_service
        from backend.services.qa_ingest_service import recompute_for_build

        try:
            golden_out = await eval_service.run_golden_benchmark(
                actor,
                include_cases=False,
                live_llm=False,
            )
        except Exception as e:
            logger.exception("golden run failed")
            golden_out = {"passed": False, "summary": {}, "error": str(e)[:300]}

        summary = (golden_out or {}).get("summary") or {}
        if not isinstance(summary, dict):
            summary = {}
        passed = bool((golden_out or {}).get("passed"))
        if "passed" not in (golden_out or {}) and summary:
            fails = (golden_out or {}).get("failures") or []
            passed = len(fails) == 0 and not (golden_out or {}).get("error")

        golden_run_id = _nid()
        finished = utc_now().isoformat()
        n_cases = int(summary.get("n_cases") or 0)
        suite_doc = {
            "id": golden_run_id,
            "source": "golden_mirror",
            "suite_type": "golden",
            "category": "AI",
            "name": "golden-offline-ui",
            "status": "passed" if passed else "failed",
            "counts": {
                "total": n_cases or len(golden_cases),
                "passed": (n_cases or len(golden_cases)) if passed else 0,
                "failed": 0 if passed else max(1, n_cases or len(golden_cases)),
                "skipped": 0,
                "blocked": 0,
                "errors": int(summary.get("n_errors") or 0),
            },
            "duration_s": float(summary.get("mean_latency_s") or 0) * max(1, n_cases or 1),
            "finished_at": finished,
            "started_at": started,
            "env": "LAB",
            "build": {"id": f"ui-golden-{golden_run_id[:8]}", "branch": "ui", "commit": None},
            "artifacts": [],
            "failures_sample": [],
            "ingested_at": finished,
            "ingested_by": {"id": actor.get("sub"), "email": actor.get("email")},
            "module_map_version": MODULE_MAP_VERSION,
            "passed": passed,
            "batch_id": batch_id,
        }
        try:
            await qa_repo.upsert_suite_run(suite_doc)
            await recompute_for_build(build_id=suite_doc["build"]["id"], actor=actor)
        except Exception as e:
            logger.warning("golden suite mirror failed: %s", e)

        g_status = "pass" if passed else "fail"
        actual = (
            f"batch={batch_id} golden_run={golden_run_id} status={suite_doc['status']} "
            f"n_cases={n_cases} mean_ioc_f1={summary.get('mean_ioc_f1')} "
            f"tech_recall={summary.get('mean_technique_recall')}"
        )
        if (golden_out or {}).get("error"):
            actual += f" error={golden_out.get('error')}"
            g_status = "fail"

        for c in golden_cases:
            await _mark_case_result(
                c["id"],
                status=g_status,
                actual=actual,
                run_id=golden_run_id,
                batch_id=batch_id,
                runner="golden",
            )
            counts[g_status] = counts.get(g_status, 0) + 1
            results.append(
                {
                    "id": c["id"],
                    "title": c.get("title"),
                    "runner": "golden",
                    "status": g_status,
                    "run_id": golden_run_id,
                    "batch_id": batch_id,
                    "kind": "golden",
                }
            )

    # --- Playwright E2E only (scope=e2e) ---
    if other_cases and run_playwright:
        import asyncio

        from backend.services import qa_playwright_runner

        try:
            playwright_meta = await asyncio.to_thread(
                qa_playwright_runner.run_playwright_catalog
            )
        except Exception as e:
            logger.exception("playwright runner failed")
            playwright_meta = {
                "ran": False,
                "ok": False,
                "reason": f"playwright exception: {e}",
                "by_tc": {},
            }
        pw_results = qa_playwright_runner.apply_playwright_to_cases(
            other_cases, playwright_meta
        )
        for pr in pw_results:
            st = pr.get("status") or "blocked"
            await _mark_case_result(
                pr["id"],
                status=st,
                actual=f"batch={batch_id} scope=e2e {pr.get('actual') or ''}",
                run_id=batch_id,
                batch_id=batch_id,
                runner=pr.get("runner") or "e2e_playwright",
            )
            counts[st] = counts.get(st, 0) + 1
            results.append(
                {
                    "id": pr["id"],
                    "title": pr.get("title"),
                    "runner": pr.get("runner"),
                    "status": st,
                    "run_id": batch_id,
                    "batch_id": batch_id,
                    "kind": "playwright",
                    "message": pr.get("actual"),
                }
            )

    # --- API smoke / manual verdict (scope=all / case) — never Playwright ---
    if other_cases and run_api_smoke:
        from backend.services.qa_smoke_runner import execute_smoke_case

        for c in other_cases:
            smoke = await execute_smoke_case(c, actor=actor)
            st = smoke.get("status") or "blocked"
            if st not in counts:
                counts[st] = 0
            actual = f"batch={batch_id} scope={scope} {smoke.get('actual') or ''}"
            await _mark_case_result(
                c["id"],
                status=st,
                actual=actual,
                run_id=batch_id,
                batch_id=batch_id,
                runner=smoke.get("runner") or c.get("runner") or "manual",
            )
            counts[st] = counts.get(st, 0) + 1
            results.append(
                {
                    "id": c["id"],
                    "title": c.get("title"),
                    "runner": smoke.get("runner") or c.get("runner"),
                    "status": st,
                    "run_id": batch_id,
                    "batch_id": batch_id,
                    "kind": smoke.get("kind"),
                    "message": smoke.get("actual"),
                }
            )

    finished = utc_now().isoformat()
    batch_doc = {
        "id": batch_id,
        "scope": scope,
        "started_at": started,
        "finished_at": finished,
        "actor": {
            "id": actor.get("sub") or actor.get("id"),
            "email": actor.get("email"),
            "role": actor.get("role"),
        },
        "counts": {
            "total": len(results),
            "pass": counts.get("pass", 0),
            "fail": counts.get("fail", 0),
            "skipped": counts.get("skipped", 0),
            "blocked": counts.get("blocked", 0),
            "error": counts.get("error", 0),
        },
        "golden_run_id": golden_run_id,
        "golden_passed": (golden_out or {}).get("passed") if golden_out else None,
        "playwright": {
            "ran": bool(playwright_meta.get("ran")),
            "ok": playwright_meta.get("ok"),
            "test_count": playwright_meta.get("test_count"),
            "exit_code": playwright_meta.get("exit_code"),
            "reason": playwright_meta.get("reason"),
            "base_url": playwright_meta.get("base_url"),
        },
        "case_ids": [r["id"] for r in results],
        "note": (
            "Scopes are separate engines: "
            "golden = offline IR suite only; "
            "e2e = Playwright browser only (TC-E2E-* + mapped UI); "
            "all = golden + API smoke for full catalog (no browser). "
            "Pure manual rows in all → blocked until Pass/Fail verdict."
        ),
        "engines": {
            "golden": bool(golden_cases),
            "playwright": bool(run_playwright),
            "api_smoke": bool(run_api_smoke),
        },
    }
    try:
        await _runs_col().insert_one(batch_doc)
    except Exception as e:
        logger.warning("batch insert failed: %s", e)

    batch_public = {k: v for k, v in batch_doc.items() if k != "_id"}

    return {
        "ok": True,
        "scope": scope,
        "batch_id": batch_id,
        "batch": batch_public,
        "results": results,
        "result_count": len(results),
        "counts": batch_public["counts"],
        "golden": {
            "ran": golden_out is not None,
            "passed": (golden_out or {}).get("passed"),
            "run_id": golden_run_id,
            "summary": summary if golden_out else None,
            "error": (golden_out or {}).get("error"),
        },
        "playwright": batch_public.get("playwright"),
        "engines": batch_public.get("engines"),
        "note": batch_public["note"],
    }
