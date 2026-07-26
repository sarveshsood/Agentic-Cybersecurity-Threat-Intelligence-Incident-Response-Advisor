"""Golden benchmark eval service."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import HTTPException

from backend.core import services as svc
from backend.database import db
from backend.golden_eval import DEFAULT_THRESHOLDS, load_golden_dataset, run_benchmark

logger = logging.getLogger("actira")


async def get_golden_benchmark(*, include_cases: bool = True) -> Dict[str, Any]:
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
        body["last_run"] = svc.slim_golden_payload(
            svc.last_golden_run, include_cases=include_cases
        )
    else:
        try:
            stored = await db.golden_runs.find_one({"id": "last"}, {"_id": 0})
            if stored:
                body["last_run"] = svc.slim_golden_payload(
                    stored, include_cases=include_cases
                )
                body["last_run_source"] = "mongo"
        except Exception as e:
            logger.debug("golden last_run mongo load: %s", e)

    # Recent run history (no per-case detail) for trend strip
    try:
        hist = (
            await db.golden_runs.find(
                {"id": {"$ne": "last"}, "ran_at": {"$exists": True}},
                {
                    "_id": 0,
                    "id": 1,
                    "ran_at": 1,
                    "passed": 1,
                    "mode": 1,
                    "summary.n_cases": 1,
                    "summary.mean_ioc_f1": 1,
                    "summary.mean_technique_recall": 1,
                    "summary.mean_grounding": 1,
                    "summary.mean_latency_s": 1,
                    "summary.n_errors": 1,
                    "failures": 1,
                    "ran_by": 1,
                },
            )
            .sort("ran_at", -1)
            .limit(12)
            .to_list(12)
        )
        body["history"] = hist
    except Exception as e:
        logger.debug("golden history load: %s", e)
        body["history"] = []
    return body


async def run_golden_benchmark(
    user: dict,
    *,
    include_cases: bool = True,
    live_llm: bool = False,
) -> Dict[str, Any]:
    try:
        if live_llm:

            def _live():
                from dataclasses import asdict

                from backend.golden_eval import (
                    DEFAULT_THRESHOLDS as thr,
                    aggregate,
                    check_thresholds,
                    evaluate_case,
                    load_golden_dataset,
                )

                cases = load_golden_dataset()
                results = [
                    evaluate_case(c, force_template_playbook=False) for c in cases[:5]
                ]
                summary = aggregate(results)
                failures = check_thresholds(summary, {**thr, "min_cases": 1})
                return {
                    "summary": summary,
                    "thresholds": {**thr, "min_cases": 1},
                    "failures": failures,
                    "passed": len(failures) == 0,
                    "results": [asdict(r) for r in results],
                    "mode": "live_llm_sample",
                    "note": "Sampled first 5 cases only; force_template_playbook=False",
                }

            out = await asyncio.to_thread(_live)
            out.setdefault("mode", "live_llm_sample")
        else:
            out = await asyncio.to_thread(run_benchmark)
            out.setdefault("mode", "offline_template")
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
    # Ensure UI can always map results → cases even if slim is skipped
    if "results" in out and "cases" not in out:
        pass  # slim_golden_payload maps results → cases
    try:
        store = svc.slim_golden_payload(out, include_cases=True)
        store["id"] = "last"
        await db.golden_runs.update_one({"id": "last"}, {"$set": store}, upsert=True)
        # Append history entry (slim, no cases) for regression trend
        hist_id = f"run_{out['ran_at'].replace(':', '').replace('+', 'p')}"
        hist = {
            "id": hist_id,
            "ran_at": out["ran_at"],
            "passed": bool(out.get("passed")),
            "mode": out.get("mode") or ("live_llm_sample" if live_llm else "offline_template"),
            "summary": out.get("summary") or {},
            "failures": out.get("failures") or [],
            "ran_by": out.get("ran_by"),
        }
        await db.golden_runs.update_one({"id": hist_id}, {"$set": hist}, upsert=True)
        # Cap history growth (~40 run docs + last)
        try:
            old = (
                await db.golden_runs.find(
                    {"id": {"$ne": "last"}, "ran_at": {"$exists": True}},
                    {"_id": 0, "id": 1},
                )
                .sort("ran_at", -1)
                .skip(40)
                .to_list(100)
            )
            if old:
                await db.golden_runs.delete_many({"id": {"$in": [r["id"] for r in old if r.get("id")]}})
        except Exception as prune_err:
            logger.debug("golden history prune: %s", prune_err)
    except Exception as e:
        logger.warning("golden run persist failed: %s", e)
    svc.last_golden_run = out
    logger.info(
        "Golden benchmark finished: passed=%s n_cases=%s failures=%s by=%s",
        out.get("passed"),
        (out.get("summary") or {}).get("n_cases"),
        out.get("failures"),
        out["ran_by"].get("email"),
    )
    return svc.slim_golden_payload(out, include_cases=include_cases)
