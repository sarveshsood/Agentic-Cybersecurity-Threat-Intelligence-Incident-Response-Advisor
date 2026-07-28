"""Audit log listing, normalization, integrity, and rule-based intelligence."""
from __future__ import annotations

import logging
from collections import Counter
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.database import db
from backend.repositories.audit import audit_repo, verify_entry_hash

logger = logging.getLogger("actira")


def _detail_comment(detail: Any) -> str:
    if detail is None:
        return ""
    if isinstance(detail, str):
        return detail
    if not isinstance(detail, dict):
        return str(detail)
    for key in ("notes", "comment", "reason", "message", "summary"):
        val = detail.get(key)
        if val:
            return str(val)
    # compact non-empty detail
    try:
        parts = [f"{k}={v}" for k, v in detail.items() if v not in (None, "", [], {})]
        return "; ".join(parts[:6])
    except Exception:
        return ""


def normalize_audit_row(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Map storage shape → UI-friendly audit trail row (plus raw fields)."""
    detail = raw.get("detail") if isinstance(raw.get("detail"), dict) else {}
    target_type = raw.get("target_type") or ""
    target_id = raw.get("target_id") or ""
    incident_id = (
        raw.get("incident_id")
        or (target_id if target_type in ("incident", "case", "") and target_id else "")
        or detail.get("incident_id")
        or ""
    )
    analyst = (
        raw.get("analyst")
        or raw.get("actor_email")
        or raw.get("actor_id")
        or raw.get("user_id")
        or "system"
    )
    ts = raw.get("ts") or raw.get("timestamp") or ""
    action = raw.get("action") or raw.get("event") or ""
    return {
        "id": raw.get("id"),
        "ts": ts,
        "timestamp": ts,
        "actor_id": raw.get("actor_id"),
        "actor_email": raw.get("actor_email"),
        "analyst": analyst,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "incident_id": incident_id or target_id or "",
        "comment": raw.get("comment") or _detail_comment(detail) or raw.get("details") or "",
        "detail": detail,
        "entry_hash": raw.get("entry_hash"),
        "prev_hash": raw.get("prev_hash"),
        "hash_ok": bool(raw.get("entry_hash")) and verify_entry_hash(raw),
    }


async def list_audit(
    *,
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    action: Optional[str] = None,
    actor: Optional[str] = None,
    target_type: Optional[str] = None,
    normalize: bool = True,
    include_meta: bool = False,
):
    try:
        raw = await audit_repo.list_filtered(
            skip=skip,
            limit=limit,
            action=action,
            actor=actor,
            target_type=target_type,
            q=q,
            with_total=include_meta,
        )
    except Exception as e:
        logger.exception("audit list failed")
        raise HTTPException(status_code=503, detail="Audit log temporarily unavailable") from e
    if include_meta:
        rows, total = raw
    else:
        rows, total = raw, None
    if normalize:
        rows = [normalize_audit_row(r) for r in rows]
    if not include_meta:
        return rows
    return {
        "items": rows,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


async def list_audit_logs(
    *,
    q: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    """Compatibility shape for Audit Trail UI (GET /audit/logs)."""
    return await list_audit(skip=0, limit=limit, q=q, action=action, normalize=True)


async def list_actions(*, limit: int = 200) -> Dict[str, Any]:
    """Dynamic action vocabulary for Audit filter dropdowns."""
    try:
        actions = await audit_repo.distinct_actions(limit=limit)
    except Exception as e:
        logger.exception("audit distinct actions failed")
        raise HTTPException(status_code=503, detail="Audit actions unavailable") from e
    return {
        "actions": actions,
        "count": len(actions),
        "source": "mongo_distinct",
    }


def _parse_ts(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        s = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


async def summary(*, days: int = 7, sample_limit: int = 1000) -> Dict[str, Any]:
    """Rule-based audit intelligence over a recent window (no LLM)."""
    days = max(1, min(int(days or 7), 90))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    try:
        cursor = (
            db.audit_log.find({}, {"_id": 0})
            .sort("ts", -1)
            .limit(sample_limit)
        )
        rows = await cursor.to_list(sample_limit)
    except Exception as e:
        logger.exception("audit summary failed")
        raise HTTPException(status_code=503, detail="Audit summary unavailable") from e

    window = []
    for r in rows:
        dt = _parse_ts(str(r.get("ts") or ""))
        if dt and dt >= cutoff:
            window.append(r)

    by_action = Counter(str(r.get("action") or "unknown") for r in window)
    by_actor = Counter(
        str(r.get("actor_email") or r.get("actor_id") or "system") for r in window
    )
    by_target = Counter(str(r.get("target_type") or "unknown") for r in window)
    review_approve = sum(1 for r in window if str(r.get("action") or "").endswith("approve"))
    review_reject = sum(1 for r in window if "reject" in str(r.get("action") or "").lower())

    # Daily buckets for sparkline
    buckets: Dict[str, int] = {}
    for r in window:
        dt = _parse_ts(str(r.get("ts") or ""))
        if not dt:
            continue
        day = dt.date().isoformat()
        buckets[day] = buckets.get(day, 0) + 1
    sparkline = [{"date": d, "count": buckets[d]} for d in sorted(buckets.keys())]

    top_actions = [{"action": a, "count": c} for a, c in by_action.most_common(10)]
    top_actors = [{"actor": a, "count": c} for a, c in by_actor.most_common(8)]
    top_targets = [{"target_type": t, "count": c} for t, c in by_target.most_common(8)]

    bullets: List[str] = [
        f"{len(window)} audit events in the last {days} day(s) (sample cap {sample_limit}).",
    ]
    if top_actions:
        bullets.append(
            "Top actions: "
            + ", ".join(f"{x['action']} ({x['count']})" for x in top_actions[:5])
            + "."
        )
    if top_actors:
        bullets.append(
            "Most active actors: "
            + ", ".join(f"{x['actor']} ({x['count']})" for x in top_actors[:3])
            + "."
        )
    bullets.append(
        f"Review outcomes in window: {review_approve} approve-class / {review_reject} reject-class."
    )
    if not window:
        bullets = [
            f"No audit events in the last {days} day(s) (or collection empty).",
            "Writes occur on review decisions, settings changes, ingest, and workspace mutations.",
        ]

    return {
        "days": days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "event_count": len(window),
        "sample_limit": sample_limit,
        "by_action": top_actions,
        "by_actor": top_actors,
        "by_target_type": top_targets,
        "review_approve": review_approve,
        "review_reject": review_reject,
        "sparkline": sparkline,
        "narrative": bullets,
        "disclaimer": (
            "Rule-based audit intelligence from stored events — not a formal SIEM "
            "or forensic chain-of-custody product."
        ),
    }


async def integrity(*, sample: int = 100) -> Dict[str, Any]:
    """Best-effort hash verification on the newest N entries."""
    sample = max(1, min(int(sample or 100), 500))
    try:
        cursor = db.audit_log.find({}, {"_id": 0}).sort("ts", -1).limit(sample)
        rows = await cursor.to_list(sample)
    except Exception as e:
        logger.exception("audit integrity failed")
        raise HTTPException(status_code=503, detail="Audit integrity check unavailable") from e

    ok = 0
    mismatch = 0
    missing_hash = 0
    broken_chain = 0
    # Verify oldest→newest within sample for chain (rows are newest-first)
    chronological = list(reversed(rows))
    prev: Optional[str] = None
    for r in chronological:
        has_hash = bool((r.get("entry_hash") or "").strip())
        if not has_hash:
            missing_hash += 1
            continue
        if verify_entry_hash(r):
            ok += 1
        else:
            mismatch += 1
        ph = str(r.get("prev_hash") or "")
        if prev is not None and ph and prev and ph != prev:
            # only flag when both sides claim chain membership
            if (r.get("entry_hash") or "") and prev:
                broken_chain += 1
        prev = str(r.get("entry_hash") or "") or prev

    status = "ok"
    if mismatch:
        status = "mismatch"
    elif broken_chain:
        status = "broken_chain"
    elif missing_hash and ok == 0:
        status = "legacy_unhashed"
    elif missing_hash:
        status = "partial"

    return {
        "status": status,
        "sampled": len(rows),
        "ok": ok,
        "mismatch": mismatch,
        "missing_hash": missing_hash,
        "broken_chain": broken_chain,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "note": (
            "Best-effort SHA-256 chain on insert — not WORM/immutable storage. "
            "Legacy rows without entry_hash are expected until new writes accumulate."
        ),
    }


async def record_telemetry(
    *,
    actor: dict,
    event: str,
    detail: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Lightweight authz/UI telemetry (e.g. 403 page)."""
    try:
        eid = await audit_repo.insert(
            actor=actor or {"sub": "anonymous", "email": "anonymous"},
            action=f"telemetry.{event}" if event and not event.startswith("telemetry.") else (event or "telemetry.event"),
            target_type="ui",
            target_id=str((detail or {}).get("path") or "client"),
            detail=detail or {},
        )
        return {"ok": True, "id": eid}
    except Exception as e:
        logger.warning("telemetry audit write failed: %s", e)
        return {"ok": False, "error": "audit_write_failed"}
