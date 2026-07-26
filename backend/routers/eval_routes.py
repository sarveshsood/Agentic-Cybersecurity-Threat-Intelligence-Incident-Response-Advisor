"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import (
    APIRouter, Depends, HTTPException, Query,
)

from backend.auth import (
    require_roles,
)
from backend.core import services as svc
from backend.core.database import db
from backend.golden_eval import (
    DEFAULT_THRESHOLDS,
    load_golden_dataset,
    run_benchmark,
)

logger = logging.getLogger("actira")

router = APIRouter(tags=['eval'])


# ---------- Golden benchmark (offline CI validation) ----------

@router.get("/eval/golden-benchmark")
async def get_golden_benchmark(
        include_cases: bool = Query(True),
        user=Depends(require_roles("admin")),
):
    """Return dataset meta + last in-process run (if any). Admin-only (A-S10)."""
    try:
        cases = load_golden_dataset()
        n_cases = len(cases)
        case_ids = [str(c.get("id") or c.get("name") or "") for c in cases[:50]]
    except Exception as e:
        logger.exception("golden dataset load failed")
        raise HTTPException(503, f"Golden dataset unavailable: {e}") from e

    body: Dict[str, Any] = {
        "dataset": {
            "n_cases": n_cases,
            "sample_ids": [x for x in case_ids if x],
            "path": "backend/tests/golden/dataset.json",
        },
        "thresholds": dict(DEFAULT_THRESHOLDS),
        "mode": "offline_template",
        "description": (
            "Offline pipeline benchmark (parse → IoC extract → mock enrich → ATT&CK → template playbook). "
            "No Mongo writes, no live LLM. Same gates as pytest / GitHub Actions golden-ci."
        ),
        "last_run": None,
    }
    if svc.last_golden_run is not None:
        body["last_run"] = svc.slim_golden_payload(svc.last_golden_run, include_cases=include_cases)
    else:
        # A-G3: fall back to durable Mongo snapshot
        try:
            stored = await db.golden_runs.find_one({"id": "last"}, {"_id": 0})
            if stored:
                body["last_run"] = svc.slim_golden_payload(stored, include_cases=include_cases)
                body["last_run_source"] = "mongo"
        except Exception as e:
            logger.debug("golden last_run mongo load: %s", e)
    return body


@router.post("/eval/golden-benchmark")
async def post_golden_benchmark(
        include_cases: bool = Query(True),
        live_llm: bool = Query(
            False,
            description="A-G1 experimental: force_template_playbook=False (requires LLM keys; not CI)",
        ),
        user=Depends(require_roles("admin")),
):
    """Run the offline golden benchmark (admin-only, A-S10)."""
    try:
        if live_llm:
            # A-G1: optional non-CI path — still uses mock enrich; playbook may call LLM
            def _live():
                from backend.golden_eval import load_golden_dataset, evaluate_case, aggregate, check_thresholds, \
                    DEFAULT_THRESHOLDS
                from dataclasses import asdict
                cases = load_golden_dataset()
                results = [
                    evaluate_case(c, force_template_playbook=False) for c in cases[:5]
                ]  # cap 5 for cost/safety
                summary = aggregate(results)
                failures = check_thresholds(summary, {**DEFAULT_THRESHOLDS, "min_cases": 1})
                return {
                    "summary": summary,
                    "thresholds": {**DEFAULT_THRESHOLDS, "min_cases": 1},
                    "failures": failures,
                    "passed": len(failures) == 0,
                    "results": [asdict(r) for r in results],
                    "mode": "live_llm_sample",
                    "note": "Sampled first 5 cases only; force_template_playbook=False",
                }

            out = await asyncio.to_thread(_live)
        else:
            out = await asyncio.to_thread(run_benchmark)
    except FileNotFoundError as e:
        raise HTTPException(503, str(e)) from e
    except Exception as e:
        logger.exception("golden benchmark failed")
        raise HTTPException(500, f"Benchmark failed: {e}") from e

    out["ran_at"] = datetime.now(timezone.utc).isoformat()
    out["ran_by"] = {
        "email": (user or {}).get("email") if isinstance(user, dict) else None,
        "role": (user or {}).get("role") if isinstance(user, dict) else None,
    }
    # A-G3: persist durable snapshot (summary always; cases optional for size)
    try:
        store = svc.slim_golden_payload(out, include_cases=True)
        store["id"] = "last"
        await db.golden_runs.update_one({"id": "last"}, {"$set": store}, upsert=True)
    except Exception as e:
        logger.warning("golden run persist failed: %s", e)
    svc.last_golden_run = out  # noqa: store on services module
    logger.info(
        "Golden benchmark finished: passed=%s n_cases=%s failures=%s by=%s",
        out.get("passed"),
        (out.get("summary") or {}).get("n_cases"),
        out.get("failures"),
        out["ran_by"].get("email"),
    )
    return svc.slim_golden_payload(out, include_cases=include_cases)
