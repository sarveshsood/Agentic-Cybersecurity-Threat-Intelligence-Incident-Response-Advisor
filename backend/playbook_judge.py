"""Lightweight playbook quality judge (rule-based, offline-safe).

Optional second-pass LLM judge is behind ``ACTIRA_PLAYBOOK_JUDGE_LLM=1`` and
uses a small prompt; default is deterministic rules only (no cost).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

REQUIRED_PHASES = ("containment", "eradication", "recovery", "lessons_learned")


def judge_playbook(
    playbook: Any,
    *,
    valid_citation_ids: Optional[set] = None,
) -> Dict[str, Any]:
    """Score a Playbook model or dict. Returns confidence 0–1 + findings."""
    findings: List[str] = []
    score = 1.0

    if hasattr(playbook, "model_dump"):
        data = playbook.model_dump()
    elif isinstance(playbook, dict):
        data = playbook
    else:
        return {
            "ok": False,
            "confidence": 0.0,
            "findings": ["unreadable_playbook"],
            "engine": "rules_v1",
        }

    steps = data.get("steps") or []
    if not steps:
        return {
            "ok": False,
            "confidence": 0.15,
            "findings": ["no_steps"],
            "engine": "rules_v1",
        }

    phases = {(s.get("phase") or "").lower() for s in steps if isinstance(s, dict)}
    missing = [p for p in REQUIRED_PHASES if p not in phases]
    if missing:
        findings.append(f"missing_phases:{','.join(missing)}")
        score -= 0.12 * len(missing)

    bare = 0
    bad_cite = 0
    valid = valid_citation_ids or set()
    for s in steps:
        if not isinstance(s, dict):
            continue
        action = (s.get("action") or "").strip()
        if len(action) < 12:
            bare += 1
        cids = s.get("citation_ids") or []
        if not cids:
            bare += 1
        elif valid:
            for c in cids:
                if c not in valid:
                    bad_cite += 1

    if bare:
        findings.append(f"thin_or_uncited_steps:{bare}")
        score -= min(0.35, 0.05 * bare)
    if bad_cite:
        findings.append(f"unknown_citations:{bad_cite}")
        score -= min(0.25, 0.04 * bad_cite)

    conf = max(0.0, min(1.0, score))
    return {
        "ok": conf >= 0.45 and not missing,
        "confidence": round(conf, 3),
        "findings": findings,
        "step_count": len(steps),
        "phases_present": sorted(phases),
        "engine": "rules_v1",
    }
