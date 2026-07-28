"""Audit log collection access with best-effort integrity hashing."""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.database import db
from backend.models import new_id

logger = logging.getLogger("actira")


def _canonical_payload(
    *,
    entry_id: str,
    ts: str,
    actor_id: str,
    actor_email: str,
    action: str,
    target_type: str,
    target_id: str,
    detail: Dict[str, Any],
    prev_hash: str,
) -> str:
    """Stable JSON for hashing (sorted keys)."""
    body = {
        "id": entry_id,
        "ts": ts,
        "actor_id": actor_id,
        "actor_email": actor_email,
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "detail": detail or {},
        "prev_hash": prev_hash or "",
    }
    return json.dumps(body, sort_keys=True, default=str, separators=(",", ":"))


def compute_entry_hash(
    *,
    entry_id: str,
    ts: str,
    actor_id: str,
    actor_email: str,
    action: str,
    target_type: str,
    target_id: str,
    detail: Dict[str, Any],
    prev_hash: str,
) -> str:
    raw = _canonical_payload(
        entry_id=entry_id,
        ts=ts,
        actor_id=actor_id,
        actor_email=actor_email,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        prev_hash=prev_hash,
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def verify_entry_hash(doc: Dict[str, Any]) -> bool:
    """Recompute hash for a stored document. Missing hash → not verifiable."""
    stored = (doc.get("entry_hash") or "").strip()
    if not stored:
        return False
    recomputed = compute_entry_hash(
        entry_id=str(doc.get("id") or ""),
        ts=str(doc.get("ts") or ""),
        actor_id=str(doc.get("actor_id") or ""),
        actor_email=str(doc.get("actor_email") or ""),
        action=str(doc.get("action") or ""),
        target_type=str(doc.get("target_type") or ""),
        target_id=str(doc.get("target_id") or ""),
        detail=doc.get("detail") if isinstance(doc.get("detail"), dict) else {},
        prev_hash=str(doc.get("prev_hash") or ""),
    )
    return recomputed == stored


class AuditRepository:
    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def col(self):
        return self._db.audit_log

    async def _latest_hash(self) -> str:
        try:
            cursor = self.col.find(
                {"entry_hash": {"$exists": True, "$ne": ""}},
                {"_id": 0, "entry_hash": 1},
            ).sort("ts", -1).limit(1)
            rows = await cursor.to_list(1)
            if rows:
                return str(rows[0].get("entry_hash") or "")
        except Exception as e:
            logger.debug("audit prev_hash lookup skipped: %s", e)
        return ""

    async def insert(
        self,
        *,
        actor: dict,
        action: str,
        target_type: str,
        target_id: str,
        detail: Optional[Dict[str, Any]] = None,
    ) -> str:
        entry_id = new_id()
        ts = datetime.now(timezone.utc).isoformat()
        actor_id = str((actor or {}).get("sub", "system"))
        actor_email = str((actor or {}).get("email", "system"))
        detail_doc = detail or {}
        prev_hash = await self._latest_hash()
        entry_hash = compute_entry_hash(
            entry_id=entry_id,
            ts=ts,
            actor_id=actor_id,
            actor_email=actor_email,
            action=action,
            target_type=target_type,
            target_id=target_id,
            detail=detail_doc,
            prev_hash=prev_hash,
        )
        doc = {
            "id": entry_id,
            "ts": ts,
            "actor_id": actor_id,
            "actor_email": actor_email,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "detail": detail_doc,
            "prev_hash": prev_hash,
            "entry_hash": entry_hash,
        }
        await self.col.insert_one(doc)
        # Append-only local JSONL + optional SIEM webhook (best-effort)
        try:
            from backend.audit_export import on_audit_inserted

            on_audit_inserted({k: v for k, v in doc.items()})
        except Exception:
            pass
        return entry_id

    async def list_recent(self, *, limit: int = 500) -> list:
        cursor = self.col.find({}, {"_id": 0}).sort([("ts", -1), ("timestamp", -1)]).limit(limit)
        return await cursor.to_list(limit)

    async def list_filtered(
        self,
        *,
        skip: int = 0,
        limit: int = 50,
        action: Optional[str] = None,
        actor: Optional[str] = None,
        target_type: Optional[str] = None,
        q: Optional[str] = None,
        with_total: bool = False,
    ):
        """Return rows, or (rows, total) when with_total=True for server pagination."""
        query: Dict[str, Any] = {}
        if action:
            query["action"] = action
        if actor:
            query["$or"] = [
                {"actor_email": {"$regex": actor, "$options": "i"}},
                {"actor_id": {"$regex": actor, "$options": "i"}},
            ]
        if target_type:
            query["target_type"] = target_type

        if q:
            # Free-text: scan a bounded newest window then filter in-process
            fetch_limit = min(max(limit + skip, 500), 2000)
            cursor = self.col.find(query, {"_id": 0}).sort("ts", -1).limit(fetch_limit)
            rows = await cursor.to_list(fetch_limit)
            needle = q.strip().lower()
            rows = [
                r
                for r in rows
                if needle
                in " ".join(
                    [
                        str(r.get("id") or ""),
                        str(r.get("action") or ""),
                        str(r.get("actor_email") or ""),
                        str(r.get("actor_id") or ""),
                        str(r.get("target_id") or ""),
                        str(r.get("target_type") or ""),
                        json.dumps(r.get("detail") or {}, default=str),
                    ]
                ).lower()
            ]
            total = len(rows)
            page = rows[skip : skip + limit]
            return (page, total) if with_total else page

        total = int(await self.col.count_documents(query)) if with_total else 0
        cursor = self.col.find(query, {"_id": 0}).sort("ts", -1).skip(skip).limit(limit)
        page = await cursor.to_list(limit)
        return (page, total) if with_total else page

    async def distinct_actions(self, *, limit: int = 200) -> List[str]:
        """Distinct action names for dynamic Audit UI filters (newest-agnostic)."""
        try:
            raw = await self.col.distinct("action")
        except Exception:
            return []
        out = sorted({str(v).strip() for v in (raw or []) if v and str(v).strip()})
        return out[: max(1, min(int(limit or 200), 500))]


audit_repo = AuditRepository()
