"""Bounded parallel pools for pipeline stages (Sprint 4).

Does not change stage order: parse files and enrich IoCs may run concurrently;
correlate / RAG / playbook / HiTL remain sequential for auditability.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Mapping, Optional


def _clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(n)))


def resolve_parse_concurrency(settings: Optional[Mapping[str, Any]] = None) -> int:
    s = settings or {}
    raw = s.get("parse_concurrency")
    if raw is None or str(raw).strip() == "":
        raw = os.environ.get("PARSE_CONCURRENCY") or 4
    try:
        return _clamp(int(raw), 1, 16)
    except (TypeError, ValueError):
        return 4


def resolve_enrich_concurrency(settings: Optional[Mapping[str, Any]] = None) -> int:
    s = settings or {}
    raw = s.get("enrich_concurrency")
    if raw is None or str(raw).strip() == "":
        raw = os.environ.get("ENRICH_CONCURRENCY") or 8
    try:
        return _clamp(int(raw), 1, 32)
    except (TypeError, ValueError):
        return 8


def parallel_snapshot(settings: Optional[Mapping[str, Any]] = None) -> Dict[str, Any]:
    """Config snapshot for Ops / Settings honesty panel."""
    return {
        "mode": "safe",
        "parse_concurrency": resolve_parse_concurrency(settings),
        "enrich_concurrency": resolve_enrich_concurrency(settings),
        "sequential_stages": [
            "correlate",
            "attack_map",
            "rag",
            "playbook",
            "hitl_gate",
        ],
        "parallel_stages": ["parse_files", "enrich_iocs"],
        "note": (
            "Playbook LLM and HiTL stay single-threaded per job. "
            "Tune pools under Settings → Platform."
        ),
    }
