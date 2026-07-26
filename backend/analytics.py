"""Analytics/EDA aggregations over incidents + jobs."""
from __future__ import annotations

import logging
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Union

from backend.mongo_util import created_at_match

logger = logging.getLogger(__name__)


def _cutoff_dt(window_days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=window_days)


def _cutoff_iso(window_days: int) -> str:
    return _cutoff_dt(window_days).isoformat()


async def compute_analytics(db, window_days: int = 30) -> Dict[str, Any]:
    """Aggregate incidents over the last N days into dashboard-ready analytics.

    A-H1: try Mongo aggregation for core distributions first; fall back to
    in-process scan for nested IoC/technique breakdowns.
    A-H2: match both datetime and legacy ISO-string created_at values.
    """
    window_days = max(1, min(int(window_days or 30), 365))
    cutoff = _cutoff_dt(window_days)

    try:
        return await _compute_with_aggregation(db, cutoff, window_days)
    except Exception as e:
        logger.warning("analytics aggregation path failed, using legacy: %s", e)
        return await _compute_legacy(db, cutoff, window_days)


async def _compute_with_aggregation(db, cutoff: datetime, window_days: int) -> Dict[str, Any]:
    match = created_at_match(cutoff)

    # Severity / status via $group
    sev_pipe = [
        {"$match": match},
        {"$group": {"_id": "$severity", "count": {"$sum": 1}}},
    ]
    status_pipe = [
        {"$match": match},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]
    # Daily timeline — handle BSON date and legacy ISO strings (A-H2)
    daily_pipe = [
        {"$match": match},
        {
            "$addFields": {
                "_day": {
                    "$cond": [
                        {"$eq": [{"$type": "$created_at"}, "date"]},
                        {
                            "$dateToString": {
                                "format": "%Y-%m-%d",
                                "date": "$created_at",
                            }
                        },
                        {
                            "$substrCP": [
                                {"$toString": {"$ifNull": ["$created_at", ""]}},
                                0,
                                10,
                            ]
                        },
                    ]
                }
            }
        },
        {
            "$group": {
                "_id": "$_day",
                "total": {"$sum": 1},
                "critical": {
                    "$sum": {"$cond": [{"$eq": ["$severity", "critical"]}, 1, 0]}
                },
                "high": {"$sum": {"$cond": [{"$eq": ["$severity", "high"]}, 1, 0]}},
                "medium": {
                    "$sum": {"$cond": [{"$eq": ["$severity", "medium"]}, 1, 0]}
                },
                "low": {"$sum": {"$cond": [{"$eq": ["$severity", "low"]}, 1, 0]}},
            }
        },
        {"$sort": {"_id": 1}},
    ]
    # Top techniques
    tech_pipe = [
        {"$match": match},
        {"$unwind": {"path": "$techniques", "preserveNullAndEmptyArrays": False}},
        {
            "$group": {
                "_id": "$techniques.technique_id",
                "count": {"$sum": 1},
            }
        },
        {"$sort": {"count": -1}},
        {"$limit": 15},
    ]
    # Mean grounding
    ground_pipe = [
        {"$match": {**match, "playbook.grounding_score": {"$exists": True}}},
        {
            "$group": {
                "_id": None,
                "avg": {"$avg": "$playbook.grounding_score"},
                "n": {"$sum": 1},
            }
        },
    ]

    sev_rows = await db.incidents.aggregate(sev_pipe).to_list(20)
    status_rows = await db.incidents.aggregate(status_pipe).to_list(20)
    daily_rows = await db.incidents.aggregate(daily_pipe).to_list(400)
    tech_rows = await db.incidents.aggregate(tech_pipe).to_list(20)
    ground_rows = await db.incidents.aggregate(ground_pipe).to_list(1)

    sev_counts = Counter({(r["_id"] or "unknown"): r["count"] for r in sev_rows})
    status_counts = Counter({(r["_id"] or "unknown"): r["count"] for r in status_rows})
    total = sum(sev_counts.values())
    mean_grounding = 0.0
    if ground_rows and ground_rows[0].get("avg") is not None:
        mean_grounding = round(float(ground_rows[0]["avg"]), 2)

    timeline = [
        {
            "date": r["_id"],
            "total": r.get("total", 0),
            "critical": r.get("critical", 0),
            "high": r.get("high", 0),
            "medium": r.get("medium", 0),
            "low": r.get("low", 0),
        }
        for r in daily_rows
        if r.get("_id")
    ]
    tech_counter = Counter({r["_id"]: r["count"] for r in tech_rows if r.get("_id")})

    # Nested IoC details still need a bounded document scan
    nested = await _nested_ioc_scan(db, cutoff, limit=2000)

    approved = status_counts.get("approved", 0)
    rejected = status_counts.get("rejected", 0)
    pending = status_counts.get("pending_review", 0)
    acceptance_rate = (
        round(approved / (approved + rejected), 2) if (approved + rejected) else 0.0
    )

    return {
        "window_days": window_days,
        "engine": "mongo_aggregation",
        "totals": {
            "incidents": total,
            "critical": sev_counts.get("critical", 0),
            "high": sev_counts.get("high", 0),
            "medium": sev_counts.get("medium", 0),
            "low": sev_counts.get("low", 0),
            "pending_review": pending,
            "approved": approved,
            "rejected": rejected,
            "events_processed": nested["events_processed"],
            "unique_source_ips": nested["unique_source_ips"],
            "correlated_incidents": nested["correlated_incidents"],
            "multi_file_incidents": nested["multi_file_incidents"],
            "high_threat_iocs": nested["high_threat_iocs"],
            "unique_iocs": nested["unique_iocs"],
            "unique_techniques": len(tech_counter),
            "mean_grounding_score": mean_grounding,
            "acceptance_rate": acceptance_rate,
        },
        "severity_distribution": [
            {"severity": s, "count": c} for s, c in sev_counts.most_common()
        ],
        "status_distribution": [
            {"status": s, "count": c} for s, c in status_counts.most_common()
        ],
        "ioc_type_distribution": nested["ioc_type_distribution"],
        "top_source_ips": nested["top_source_ips"],
        "top_domains": nested["top_domains"],
        "top_hashes": nested["top_hashes"],
        "top_techniques": [{"id": t, "count": c} for t, c in tech_counter.most_common(15)],
        "top_tactics": nested["top_tactics"],
        "timeline": timeline,
    }


async def _nested_ioc_scan(db, cutoff: Union[str, datetime], limit: int = 2000) -> Dict[str, Any]:
    if isinstance(cutoff, datetime):
        q = created_at_match(cutoff)
    else:
        q = {"created_at": {"$gte": cutoff}}
    incidents: List[dict] = await db.incidents.find(
        q,
        {
            "_id": 0,
            "iocs": 1,
            "techniques": 1,
            "correlation": 1,
            "files_meta": 1,
        },
    ).sort("created_at", -1).to_list(limit)

    ioc_types: Counter = Counter()
    ip_counter: Counter = Counter()
    domain_counter: Counter = Counter()
    hash_counter: Counter = Counter()
    tactic_counter: Counter = Counter()
    high_threat_iocs = 0
    correlated_incidents = 0
    multi_file_incidents = 0
    events_processed = 0
    unique_ips_total = 0

    for inc in incidents:
        if (inc.get("correlation") or {}).get("correlations"):
            correlated_incidents += 1
        if len({m.get("file") for m in (inc.get("files_meta") or []) if isinstance(m, dict)}) > 1:
            multi_file_incidents += 1
        stats = (inc.get("correlation") or {}).get("stats") or {}
        events_processed += int(stats.get("total_events") or 0)
        unique_ips_total += int(stats.get("unique_source_ips") or 0)
        for i in inc.get("iocs") or []:
            ioc_types[i.get("type")] += 1
            if (i.get("threat_score") or 0) >= 70:
                high_threat_iocs += 1
            val = i.get("value")
            if not val:
                continue
            if i.get("type") == "ip":
                ip_counter[val] += 1
            elif i.get("type") == "domain":
                domain_counter[val] += 1
            elif (i.get("type") or "").startswith("hash"):
                hash_counter[val] += 1
        for t in inc.get("techniques") or []:
            for tac in (t.get("tactic") or "").split(","):
                tac = tac.strip()
                if tac:
                    tactic_counter[tac] += 1

    return {
        "events_processed": events_processed,
        "unique_source_ips": unique_ips_total,
        "correlated_incidents": correlated_incidents,
        "multi_file_incidents": multi_file_incidents,
        "high_threat_iocs": high_threat_iocs,
        "unique_iocs": sum(ioc_types.values()),
        "ioc_type_distribution": [
            {"type": t, "count": c} for t, c in ioc_types.most_common()
        ],
        "top_source_ips": [{"value": v, "count": c} for v, c in ip_counter.most_common(10)],
        "top_domains": [{"value": v, "count": c} for v, c in domain_counter.most_common(10)],
        "top_hashes": [
            {"value": (v[:16] + "…") if len(v) > 16 else v, "count": c}
            for v, c in hash_counter.most_common(10)
        ],
        "top_tactics": [{"tactic": t, "count": c} for t, c in tactic_counter.most_common(10)],
    }


async def _compute_legacy(db, cutoff: Union[str, datetime], window_days: int) -> Dict[str, Any]:
    """Original in-process path (fallback)."""
    if isinstance(cutoff, datetime):
        q = created_at_match(cutoff)
    else:
        q = {"created_at": {"$gte": cutoff}}
    incidents: List[dict] = await db.incidents.find(
        q, {"_id": 0}
    ).sort("created_at", -1).to_list(1000)

    total = len(incidents)
    sev_counts = Counter(i.get("severity") for i in incidents)
    status_counts = Counter(i.get("status") for i in incidents)

    ioc_types = Counter()
    ip_counter = Counter()
    domain_counter = Counter()
    hash_counter = Counter()
    high_threat_iocs = 0
    for inc in incidents:
        for i in inc.get("iocs", []):
            ioc_types[i.get("type")] += 1
            if i.get("threat_score", 0) >= 70:
                high_threat_iocs += 1
            val = i.get("value")
            if not val:
                continue
            if i.get("type") == "ip":
                ip_counter[val] += 1
            elif i.get("type") == "domain":
                domain_counter[val] += 1
            elif (i.get("type") or "").startswith("hash"):
                hash_counter[val] += 1

    tech_counter = Counter()
    tactic_counter = Counter()
    for inc in incidents:
        for t in inc.get("techniques", []):
            tech_counter[t.get("technique_id")] += 1
            for tac in (t.get("tactic") or "").split(","):
                tac = tac.strip()
                if tac:
                    tactic_counter[tac] += 1

    daily = defaultdict(lambda: {"total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0})
    for inc in incidents:
        ca = str(inc.get("created_at", ""))[:10]
        if ca:
            daily[ca]["total"] += 1
            sev = inc.get("severity", "low")
            daily[ca][sev] = daily[ca].get(sev, 0) + 1
    timeline = [{"date": d, **v} for d, v in sorted(daily.items())]

    correlated_incidents = sum(
        1 for i in incidents if (i.get("correlation") or {}).get("correlations")
    )
    multi_file_incidents = sum(
        1
        for i in incidents
        if len({m.get("file") for m in (i.get("files_meta") or []) if isinstance(m, dict)}) > 1
    )
    events_processed = sum(
        (i.get("correlation") or {}).get("stats", {}).get("total_events", 0) for i in incidents
    )
    unique_ips_total = sum(
        (i.get("correlation") or {}).get("stats", {}).get("unique_source_ips", 0)
        for i in incidents
    )
    groundings = [
        (i.get("playbook") or {}).get("grounding_score", 0)
        for i in incidents
        if i.get("playbook")
    ]
    mean_grounding = round(sum(groundings) / len(groundings), 2) if groundings else 0.0
    approved = status_counts.get("approved", 0)
    rejected = status_counts.get("rejected", 0)
    pending = status_counts.get("pending_review", 0)
    acceptance_rate = (
        round(approved / (approved + rejected), 2) if (approved + rejected) else 0.0
    )

    return {
        "window_days": window_days,
        "engine": "legacy_scan",
        "totals": {
            "incidents": total,
            "critical": sev_counts.get("critical", 0),
            "high": sev_counts.get("high", 0),
            "medium": sev_counts.get("medium", 0),
            "low": sev_counts.get("low", 0),
            "pending_review": pending,
            "approved": approved,
            "rejected": rejected,
            "events_processed": events_processed,
            "unique_source_ips": unique_ips_total,
            "correlated_incidents": correlated_incidents,
            "multi_file_incidents": multi_file_incidents,
            "high_threat_iocs": high_threat_iocs,
            "unique_iocs": sum(ioc_types.values()),
            "unique_techniques": len(tech_counter),
            "mean_grounding_score": mean_grounding,
            "acceptance_rate": acceptance_rate,
        },
        "severity_distribution": [
            {"severity": s, "count": c} for s, c in sev_counts.most_common()
        ],
        "status_distribution": [
            {"status": s, "count": c} for s, c in status_counts.most_common()
        ],
        "ioc_type_distribution": [
            {"type": t, "count": c} for t, c in ioc_types.most_common()
        ],
        "top_source_ips": [{"value": v, "count": c} for v, c in ip_counter.most_common(10)],
        "top_domains": [{"value": v, "count": c} for v, c in domain_counter.most_common(10)],
        "top_hashes": [
            {"value": v[:16] + "…", "count": c} for v, c in hash_counter.most_common(10)
        ],
        "top_techniques": [{"id": t, "count": c} for t, c in tech_counter.most_common(15)],
        "top_tactics": [{"tactic": t, "count": c} for t, c in tactic_counter.most_common(10)],
        "timeline": timeline,
    }
