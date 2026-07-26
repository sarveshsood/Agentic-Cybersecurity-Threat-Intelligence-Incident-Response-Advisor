"""Analytics / KPI aggregations (P2: facet + cache, avoid N×count_documents)."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.database import db
from backend.services import analytics_cache as cache

logger = logging.getLogger("actira")


async def ensure_analytics_indexes(database=None) -> None:
    """Indexes that speed KPI + windowed analytics (safe to call at startup)."""
    col = (database if database is not None else db).incidents
    await col.create_index([("severity", 1)])
    await col.create_index([("status", 1)])
    await col.create_index([("created_at", -1)])
    await col.create_index([("techniques.technique_id", 1)])
    await col.create_index([("playbook.grounding_score", 1)])


async def _attach_llm_usage(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Fresh LLM budget meter (cheap single-doc read; not facet-cached)."""
    out = dict(payload)
    try:
        from backend.core import services as svc
        from backend.llm_usage import usage_snapshot

        settings = await svc.get_settings()
        out["llm_usage"] = await usage_snapshot(settings)
    except Exception as e:
        logger.debug("llm_usage on KPIs skipped: %s", e)
        out.setdefault("llm_usage", None)
    return out


async def kpis(*, force_refresh: bool = False) -> Dict[str, Any]:
    """Dashboard KPIs — one Mongo $facet instead of many count_documents."""
    cache_key = "kpis:v2"
    if not force_refresh:
        hit = cache.get(cache_key)
        if hit is not None:
            out = dict(hit)
            out["cache"] = "hit"
            return await _attach_llm_usage(out)

    payload = await _kpis_compute()
    payload["cache"] = "miss"
    # Cache aggregates only — llm_usage is attached fresh every request.
    cache.set(
        cache_key,
        {k: v for k, v in payload.items() if k not in ("cache", "llm_usage")},
        ttl=cache.kpi_ttl(),
    )
    return await _attach_llm_usage(payload)


async def _kpis_compute() -> Dict[str, Any]:
    facet = {
        "by_status": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
        "by_severity": [{"$group": {"_id": "$severity", "count": {"$sum": 1}}}],
        "grounding": [
            {"$match": {"playbook.grounding_score": {"$exists": True, "$ne": None}}},
            {
                "$group": {
                    "_id": None,
                    "avg": {"$avg": "$playbook.grounding_score"},
                    "n": {"$sum": 1},
                }
            },
        ],
        "mttr_sample": [
            {
                "$match": {
                    "created_at": {"$exists": True},
                    "reviewed_at": {"$exists": True, "$ne": None},
                }
            },
            {"$project": {"created_at": 1, "reviewed_at": 1}},
            {"$limit": 2000},
        ],
        "ioc_types": [
            {"$unwind": {"path": "$iocs", "preserveNullAndEmptyArrays": False}},
            {"$group": {"_id": {"$ifNull": ["$iocs.type", "other"]}, "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 10},
        ],
        "techniques": [
            {"$unwind": {"path": "$techniques", "preserveNullAndEmptyArrays": False}},
            {
                "$group": {
                    "_id": "$techniques.technique_id",
                    "count": {"$sum": 1},
                    "parent": {"$first": "$techniques.parent_id"},
                }
            },
        ],
        "total": [{"$count": "n"}],
    }

    try:
        rows = await db.incidents.aggregate([{"$facet": facet}]).to_list(1)
        block = rows[0] if rows else {}
    except Exception as e:
        logger.warning("KPI facet failed, falling back to sequential: %s", e)
        return await _kpis_legacy()

    status_counts = {
        (r.get("_id") or "unknown"): int(r.get("count") or 0)
        for r in (block.get("by_status") or [])
    }
    sev_counts = {
        (r.get("_id") or "unknown"): int(r.get("count") or 0)
        for r in (block.get("by_severity") or [])
    }
    total = int((block.get("total") or [{"n": 0}])[0].get("n") or 0)
    if not total:
        total = sum(status_counts.values()) or sum(sev_counts.values())

    pending = status_counts.get("pending_review", 0)
    approved = status_counts.get("approved", 0)
    rejected = status_counts.get("rejected", 0)
    closed = status_counts.get("closed", 0)
    new_count = status_counts.get("new", 0)
    in_progress = status_counts.get("in_progress", 0)
    closed_or_approved = approved + rejected
    acceptance_rate = (
        round(approved / closed_or_approved, 2) if closed_or_approved else 0.0
    )

    ground_rows = block.get("grounding") or []
    mean_grounding = 0.0
    if ground_rows and ground_rows[0].get("avg") is not None:
        mean_grounding = round(float(ground_rows[0]["avg"]), 2)

    review_hours: List[float] = []
    for d in block.get("mttr_sample") or []:
        created = d.get("created_at")
        reviewed = d.get("reviewed_at")
        if not created or not reviewed:
            continue
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
            continue

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

    tech_counts: Dict[str, int] = {}
    for r in block.get("techniques") or []:
        tid = r.get("_id")
        if not tid:
            continue
        n = int(r.get("count") or 0)
        tech_counts[tid] = tech_counts.get(tid, 0) + n
        parent = r.get("parent")
        if parent:
            tech_counts[parent] = tech_counts.get(parent, 0) + n

    top_ioc_types = [
        {"type": (r.get("_id") or "other").lower(), "count": int(r.get("count") or 0)}
        for r in (block.get("ioc_types") or [])
    ]

    return {
        "total_incidents": total,
        "critical_incidents": sev_counts.get("critical", 0),
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
            {"severity": k, "count": v}
            for k, v in sev_counts.items()
            if v > 0 and k in ("critical", "high", "medium", "low")
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
        "engine": "mongo_facet",
    }


async def _kpis_legacy() -> Dict[str, Any]:
    """Fallback: parallel counts + bounded scan (still better than serial)."""
    total, critical, pending, approved, rejected, closed, new_count, in_progress = (
        await asyncio.gather(
            db.incidents.count_documents({}),
            db.incidents.count_documents({"severity": "critical"}),
            db.incidents.count_documents({"status": "pending_review"}),
            db.incidents.count_documents({"status": "approved"}),
            db.incidents.count_documents({"status": "rejected"}),
            db.incidents.count_documents({"status": "closed"}),
            db.incidents.count_documents({"status": "new"}),
            db.incidents.count_documents({"status": "in_progress"}),
        )
    )
    closed_or_approved = approved + rejected
    acceptance_rate = (
        round(approved / closed_or_approved, 2) if closed_or_approved else 0.0
    )
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
    ).limit(1000).to_list(1000)

    groundings = []
    review_hours: list = []
    sev_counts = {"critical": 0, "high": 0, "medium": 0, "low": 0}
    ioc_type_counts: dict = {}
    tech_counts: dict = {}
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
        for t in d.get("techniques") or []:
            if not isinstance(t, dict):
                continue
            tid = t.get("technique_id")
            if tid:
                tech_counts[tid] = tech_counts.get(tid, 0) + 1
                parent = t.get("parent_id")
                if parent:
                    tech_counts[parent] = tech_counts.get(parent, 0) + 1
        created, reviewed = d.get("created_at"), d.get("reviewed_at")
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
        "engine": "legacy_parallel",
    }


async def analytics(window_days: int = 30, *, force_refresh: bool = False) -> Dict[str, Any]:
    window_days = max(1, min(int(window_days or 30), 365))
    cache_key = f"analytics:v1:{window_days}"
    if not force_refresh:
        hit = cache.get(cache_key)
        if hit is not None:
            out = dict(hit)
            out["cache"] = "hit"
            return out

    from backend.analytics import compute_analytics

    payload = await compute_analytics(db, window_days=window_days)
    payload = dict(payload)
    payload["cache"] = "miss"
    cache.set(
        cache_key,
        {k: v for k, v in payload.items() if k != "cache"},
        ttl=cache.analytics_ttl(),
    )
    return payload


async def retrieval_compare(top_k: int = 5) -> Dict[str, Any]:
    from backend.retrieval_eval import run_retrieval_compare

    return await asyncio.to_thread(
        run_retrieval_compare,
        top_k=top_k,
        use_lexical_rerank=True,
    )
