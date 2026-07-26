"""HiTL gate + auto-approve decision (pure, race-free policy).

Pipeline calls decide_incident_status() once when creating an incident.
Review endpoints must use atomic conditional updates so two reviewers
cannot both apply actions on the same pending_review incident.
"""
from __future__ import annotations

from typing import Dict, Tuple

# Higher rank = more severe
SEVERITY_RANK: Dict[str, int] = {
    "low": 0,
    "medium": 1,
    "high": 2,
    "critical": 3,
}


def severity_rank(severity: str) -> int:
    return SEVERITY_RANK.get((severity or "").strip().lower(), 0)


def decide_incident_status(
        severity: str,
        grounding_score: float,
        *,
        grounding_threshold: float = 0.7,
        hitl_severity_min: str = "critical",
        auto_approve_grounding_min: float = 0.9,
) -> Tuple[str, bool, bool]:
    """Decide post-pipeline incident status.

    Returns:
        (status, hitl_required, auto_approved)

    Rules:
      1. Severity at or above ``hitl_severity_min`` → always HiTL (pending_review).
      2. Grounding below ``grounding_threshold`` → HiTL.
      3. Auto-approve only when severity is *below* the HiTL minimum AND
         grounding >= ``auto_approve_grounding_min`` → status approved, no HiTL.
         Auto-approve never bypasses severity-based HiTL.
      4. Otherwise → status new, no HiTL.
    """
    try:
        score = float(grounding_score)
    except (TypeError, ValueError):
        score = 0.0
    try:
        g_thresh = float(grounding_threshold)
    except (TypeError, ValueError):
        g_thresh = 0.7
    try:
        auto_min = float(auto_approve_grounding_min)
    except (TypeError, ValueError):
        auto_min = 0.9

    sev = (severity or "low").strip().lower()
    min_sev = (hitl_severity_min or "critical").strip().lower()
    if min_sev not in SEVERITY_RANK:
        min_sev = "critical"

    requires_by_severity = severity_rank(sev) >= severity_rank(min_sev)
    requires_by_grounding = score < g_thresh
    hitl_required = requires_by_severity or requires_by_grounding

    # Never auto-approve past a severity gate
    auto_approved = (not requires_by_severity) and (score >= auto_min)

    if auto_approved:
        return "approved", False, True
    if hitl_required:
        return "pending_review", True, False
    return "new", False, False
