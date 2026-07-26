"""Analytics / KPI aggregations."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict

from backend.database import db


async def kpis() -> Dict[str, Any]:
    total = await db.incidents.count_documents({})
    critical = await db.incidents.count_documents({"severity": "critical"})
    pending = await db.incidents.count_documents({"status": "pending_review"})
    approved = await db.incidents.count_documents({"status": "approved"})
    rejected = await db.incidents.count_documents({"status": "rejected"})
    closed = await db.incidents.count_documents({"status": "closed"})
    new_count = await db.incidents.count_documents({"status": "new"})
    in_progress = await db.incidents.count_documents({"status": "in_progress"})
    closed_or_approved = approved + rejected
    acceptance_rate = round(approved / closed_or_approved, 2) if closed_or_approved else 0.0

    docs = await db.incidents.find(
        {},
        {
            "_id": 0,
            "playbook": 1,
            "created_at": 1,
            "reviewed_at": 1,
            "severity": 1,
            "status": 1,
            "iocs": 1,
            "techniques": 1,
        },
    ).to_list(1000)
    groundings = []
    review_hours: list = []
    sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    ioc_type_counts: dict = {}
    for d in docs:
        pb = d.get("playbook") or {}
        if isinstance(pb, dict) and pb.get("grounding_score") is not None:
            try:
                groundings.append(float(pb["grounding_score"]))
            except (TypeError, ValueError):
                pass
        sev = (d.get("severity") or "low").lower()
        if sev in sev_counts:
            sev_counts[sev] += 1
        for ioc in d.get("iocs") or []:
            if isinstance(ioc, dict):
                t = (ioc.get("type") or "other").lower()
                ioc_type_counts[t] = ioc_type_counts.get(t, 0) + 1
        created = d.get("created_at")
        reviewed = d.get("reviewed_at")
        if created and reviewed:
            try:
                c = (
                    created
                    if isinstance(created, datetime)
                    else datetime.fromisoformat(str(created).replace("Z", "+00:00"))
                )
                r = (
                    reviewed
                    if isinstance(reviewed, datetime)
                    else datetime.fromisoformat(str(reviewed).replace("Z", "+00:00"))
                )
                if c.tzinfo is None:
                    c = c.replace(tzinfo=timezone.utc)
                if r.tzinfo is None:
                    r = r.replace(tzinfo=timezone.utc)
                hrs = (r - c).total_seconds() / 3600.0
                if 0 <= hrs < 24 * 90:
                    review_hours.append(hrs)
            except (TypeError, ValueError):
                pass
    mean_grounding = round(sum(groundings) / len(groundings), 2) if groundings else 0.0
    mean_mttr_hours = (
        round(sum(review_hours) / len(review_hours), 2) if review_hours else None
    )
    median_mttr_hours = None
    if review_hours:
        sorted_h = sorted(review_hours)
        mid = len(sorted_h) // 2
        median_mttr_hours = round(
            sorted_h[mid] if len(sorted_h) % 2 else (sorted_h[mid - 1] + sorted_h[mid]) / 2,
            2,
        )

    tech_counts: dict = {}
    for inc in docs:
        for t in inc.get("techniques") or []:
            if not isinstance(t, dict):
                continue
            tid = t.get("technique_id")
            if not tid:
                continue
            tech_counts[tid] = tech_counts.get(tid, 0) + 1
            parent = t.get("parent_id")
            if parent:
                tech_counts[parent] = tech_counts.get(parent, 0) + 1

    top_ioc_types = sorted(
        [{"type": k, "count": v} for k, v in ioc_type_counts.items()],
        key=lambda x: -x["count"],
    )[:10]

    return {
        "total_incidents": total,
        "critical_incidents": critical,
        "pending_review": pending,
        "approved": approved,
        "rejected": rejected,
        "closed": closed,
        "new": new_count,
        "in_progress": in_progress,
        "acceptance_rate": acceptance_rate,
        "mean_grounding_score": mean_grounding,
        "mean_mttr_hours": mean_mttr_hours,
        "median_mttr_hours": median_mttr_hours,
        "mttr_sample_size": len(review_hours),
        "severity_distribution": [
            {"severity": k, "count": v} for k, v in sev_counts.items() if v > 0
        ],
        "status_distribution": [
            {"status": "new", "count": new_count},
            {"status": "in_progress", "count": in_progress},
            {"status": "pending_review", "count": pending},
            {"status": "approved", "count": approved},
            {"status": "rejected", "count": rejected},
            {"status": "closed", "count": closed},
        ],
        "top_ioc_types": top_ioc_types,
        "attack_heatmap": tech_counts,
    }


async def analytics(window_days: int = 30) -> Dict[str, Any]:
    from backend.analytics import compute_analytics

    return await compute_analytics(db, window_days=window_days)


async def retrieval_compare(top_k: int = 5) -> Dict[str, Any]:
    from backend.retrieval_eval import run_retrieval_compare

    return await asyncio.to_thread(
        run_retrieval_compare,
        top_k=top_k,
        use_lexical_rerank=True,
    )
