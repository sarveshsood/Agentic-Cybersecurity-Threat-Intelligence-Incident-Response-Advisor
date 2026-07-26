"""Golden benchmark eval API — thin adapters over eval_service."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from backend.security import require_roles
from backend.services import eval_service

router = APIRouter(tags=["eval"])


@router.get("/eval/golden-benchmark")
async def get_golden_benchmark(
    include_cases: bool = Query(True),
    user=Depends(require_roles("admin")),
):
    return await eval_service.get_golden_benchmark(include_cases=include_cases)


@router.post("/eval/golden-benchmark")
async def post_golden_benchmark(
    include_cases: bool = Query(True),
    live_llm: bool = Query(
        False,
        description="A-G1 experimental: force_template_playbook=False (requires LLM keys; not CI)",
    ),
    user=Depends(require_roles("admin")),
):
    return await eval_service.run_golden_benchmark(
        user, include_cases=include_cases, live_llm=live_llm
    )
