"""Mongo access for Testing Health Center artifacts."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


def json_safe(obj: Any) -> Any:
    """Recursively make Mongo/BSON values JSON-serializable for FastAPI responses.

    ``insert_one`` mutates dicts with ``ObjectId``; returning those causes:
    ``TypeError: 'ObjectId' object is not iterable`` in jsonable_encoder.
    """
    try:
        from bson import ObjectId
    except Exception:  # pragma: no cover
        ObjectId = ()  # type: ignore

    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if ObjectId and isinstance(obj, ObjectId):
        return str(obj)
    # datetime already ISO in our docs; handle generically
    if hasattr(obj, "isoformat") and callable(getattr(obj, "isoformat")):
        try:
            return obj.isoformat()
        except Exception:
            return str(obj)
    if isinstance(obj, dict):
        return {str(k): json_safe(v) for k, v in obj.items() if k != "_id"}
    if isinstance(obj, (list, tuple)):
        return [json_safe(v) for v in obj]
    if isinstance(obj, set):
        return [json_safe(v) for v in obj]
    # bytes / other
    if isinstance(obj, (bytes, bytearray)):
        return obj.decode("utf-8", errors="replace")
    return obj


class QaRepository:
    def __init__(self, database=None):
        self._db = database if database is not None else db

    @property
    def suite_runs(self):
        return self._db.qa_suite_runs

    @property
    def case_results(self):
        return self._db.qa_case_results

    @property
    def coverage(self):
        return self._db.qa_coverage_snapshots

    @property
    def release(self):
        return self._db.qa_release_snapshots

    @property
    def rollups(self):
        return self._db.qa_rollups

    @property
    def recommendation_signals(self):
        return self._db.qa_recommendation_signals

    @property
    def recommendations(self):
        return self._db.qa_recommendations

    async def ensure_indexes(self) -> None:
        try:
            await self.suite_runs.create_index([("build.id", 1), ("suite_type", 1)])
            await self.suite_runs.create_index([("finished_at", -1)])
            await self.suite_runs.create_index([("suite_type", 1), ("finished_at", -1)])
            await self.case_results.create_index([("run_id", 1)])
            await self.case_results.create_index([("nodeid", 1), ("finished_at", -1)])
            await self.coverage.create_index([("build.id", 1)])
            await self.coverage.create_index([("captured_at", -1)])
            await self.release.create_index([("computed_at", -1)])
            await self.recommendation_signals.create_index([("timestamp", -1)])
            await self.recommendation_signals.create_index(
                [("entity_type", 1), ("entity_id", 1), ("signal_type", 1)]
            )
            await self.recommendations.create_index([("status", 1), ("risk_score", -1)])
            await self.recommendations.create_index([("updated_at", -1)])
        except Exception:
            pass

    async def upsert_suite_run(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        build_id = (doc.get("build") or {}).get("id")
        suite_type = doc.get("suite_type")
        payload = json_safe(doc) if isinstance(doc, dict) else doc
        if not isinstance(payload, dict):
            payload = dict(doc or {})
        payload.pop("_id", None)
        if build_id and suite_type:
            existing = await self.suite_runs.find_one(
                {"build.id": build_id, "suite_type": suite_type},
                {"_id": 0, "id": 1},
            )
            if existing and existing.get("id"):
                payload = {**payload, "id": existing["id"]}
                await self.suite_runs.replace_one(
                    {"id": payload["id"]}, dict(payload), upsert=True
                )
                return json_safe(payload)
        to_insert = dict(payload)
        await self.suite_runs.insert_one(to_insert)
        return json_safe(payload)

    async def get_suite_run(self, run_id: str) -> Optional[Dict[str, Any]]:
        return await self.suite_runs.find_one({"id": run_id}, {"_id": 0})

    async def find_suite(
        self,
        suite_type: str,
        *,
        build_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        q: Dict[str, Any] = {"suite_type": suite_type}
        if build_id:
            q["build.id"] = build_id
        return await self.suite_runs.find_one(q, {"_id": 0}, sort=[("finished_at", -1)])

    async def list_suite_runs(
        self, *, skip: int = 0, limit: int = 50, suite_type: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {}
        if suite_type:
            q["suite_type"] = suite_type
        cursor = self.suite_runs.find(q, {"_id": 0}).sort("finished_at", -1).skip(skip).limit(limit)
        return await cursor.to_list(limit)

    async def delete_case_results_for_run(self, run_id: str) -> int:
        r = await self.case_results.delete_many({"run_id": run_id})
        return int(getattr(r, "deleted_count", 0) or 0)

    async def insert_case_results(self, docs: List[Dict[str, Any]]) -> int:
        if not docs:
            return 0
        await self.case_results.insert_many(docs)
        return len(docs)

    async def upsert_coverage(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        build_id = (doc.get("build") or {}).get("id")
        payload = json_safe(doc) if isinstance(doc, dict) else dict(doc or {})
        if not isinstance(payload, dict):
            payload = dict(doc or {})
        payload.pop("_id", None)
        if build_id:
            existing = await self.coverage.find_one({"build.id": build_id}, {"_id": 0, "id": 1})
            if existing and existing.get("id"):
                payload = {**payload, "id": existing["id"]}
                await self.coverage.replace_one(
                    {"id": payload["id"]}, dict(payload), upsert=True
                )
                return json_safe(payload)
        to_insert = dict(payload)
        await self.coverage.insert_one(to_insert)
        return json_safe(payload)

    async def get_coverage(self, *, build_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        q: Dict[str, Any] = {}
        if build_id:
            q["build.id"] = build_id
        row = await self.coverage.find_one(q, {"_id": 0}, sort=[("captured_at", -1)])
        return json_safe(row) if row else None

    async def insert_release(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        """Persist release snapshot. Never return Mongo ``_id`` (ObjectId breaks JSON)."""
        payload = json_safe(doc) if isinstance(doc, dict) else dict(doc or {})
        if not isinstance(payload, dict):
            payload = {k: v for k, v in (doc or {}).items() if k != "_id"}
        payload.pop("_id", None)
        # insert_one mutates the dict with ObjectId — insert a copy only
        to_insert = dict(payload)
        await self.release.insert_one(to_insert)
        return json_safe(payload)

    async def latest_release(self) -> Optional[Dict[str, Any]]:
        row = await self.release.find_one({}, {"_id": 0}, sort=[("computed_at", -1)])
        return json_safe(row) if row else None

    async def get_release(self, rel_id: str) -> Optional[Dict[str, Any]]:
        row = await self.release.find_one({"id": rel_id}, {"_id": 0})
        return json_safe(row) if row else None

    async def upsert_rollup(self, doc: Dict[str, Any]) -> None:
        rid = doc.get("id") or "latest"
        payload = json_safe({**(doc or {}), "id": rid})
        if not isinstance(payload, dict):
            payload = {"id": rid}
        payload.pop("_id", None)
        await self.rollups.replace_one({"id": rid}, dict(payload), upsert=True)

    async def get_rollup(self, rid: str = "latest") -> Optional[Dict[str, Any]]:
        return await self.rollups.find_one({"id": rid}, {"_id": 0})

    # --- Recommendations / signals ---

    async def replace_signals(self, docs: List[Dict[str, Any]]) -> int:
        """Replace open-window signals with a fresh generation batch."""
        if not docs:
            await self.recommendation_signals.delete_many({})
            return 0
        await self.recommendation_signals.delete_many({})
        clean = [json_safe(d) for d in docs]
        for d in clean:
            if isinstance(d, dict):
                d.pop("_id", None)
        await self.recommendation_signals.insert_many([dict(d) for d in clean if isinstance(d, dict)])
        return len(clean)

    async def list_signals(
        self,
        *,
        signal_type: Optional[str] = None,
        entity_type: Optional[str] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {}
        if signal_type:
            q["signal_type"] = signal_type
        if entity_type:
            q["entity_type"] = entity_type
        limit = max(1, min(int(limit or 100), 500))
        cur = self.recommendation_signals.find(q, {"_id": 0}).sort("timestamp", -1).limit(limit)
        rows = await cur.to_list(limit)
        return json_safe(rows) or []

    async def upsert_recommendations(self, docs: List[Dict[str, Any]]) -> int:
        """Upsert by stable title+type key; preserve status if already decided."""
        n = 0
        for raw in docs:
            doc = json_safe(raw) if isinstance(raw, dict) else {}
            if not isinstance(doc, dict):
                continue
            doc.pop("_id", None)
            key = {
                "recommendation_type": doc.get("recommendation_type"),
                "title": doc.get("title"),
            }
            existing = await self.recommendations.find_one(key, {"_id": 0})
            if existing:
                # Keep human decisions
                status = existing.get("status") or "open"
                if status in ("accepted", "rejected", "implemented"):
                    doc["status"] = status
                    doc["id"] = existing.get("id") or doc.get("id")
                else:
                    doc["id"] = existing.get("id") or doc.get("id")
                    doc["status"] = doc.get("status") or "open"
                doc["created_at"] = existing.get("created_at") or doc.get("created_at")
                await self.recommendations.replace_one({"id": doc["id"]}, dict(doc), upsert=True)
            else:
                await self.recommendations.insert_one(dict(doc))
            n += 1
        return n

    async def list_recommendations(
        self,
        *,
        status: Optional[str] = None,
        recommendation_type: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        q: Dict[str, Any] = {}
        if status:
            q["status"] = status
        if recommendation_type:
            q["recommendation_type"] = recommendation_type
        limit = max(1, min(int(limit or 50), 200))
        cur = (
            self.recommendations.find(q, {"_id": 0})
            .sort([("status", 1), ("risk_score", -1), ("updated_at", -1)])
            .limit(limit)
        )
        rows = await cur.to_list(limit)
        return json_safe(rows) or []

    async def get_recommendation(self, rid: str) -> Optional[Dict[str, Any]]:
        row = await self.recommendations.find_one({"id": rid}, {"_id": 0})
        return json_safe(row) if row else None

    async def update_recommendation_status(
        self, rid: str, *, status: str, note: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        from backend.models import utc_now as _utc_now

        row = await self.recommendations.find_one({"id": rid}, {"_id": 0})
        if not row:
            return None
        row["status"] = status
        row["updated_at"] = _utc_now().isoformat()
        if note:
            meta = dict(row.get("metadata") or {})
            meta["status_note"] = note[:1000]
            row["metadata"] = meta
        payload = json_safe(row)
        if not isinstance(payload, dict):
            return None
        await self.recommendations.replace_one({"id": rid}, dict(payload), upsert=True)
        return payload

    async def purge_older_than(self, *, cutoff_iso: str) -> Dict[str, int]:
        """Delete suite runs / case results / coverage older than cutoff (ISO)."""
        out = {"suite_runs": 0, "case_results": 0, "coverage": 0, "release": 0}
        try:
            old_runs = await self.suite_runs.find(
                {"finished_at": {"$lt": cutoff_iso}},
                {"_id": 0, "id": 1},
            ).to_list(50_000)
            run_ids = [r["id"] for r in old_runs if r.get("id")]
            if run_ids:
                cr = await self.case_results.delete_many({"run_id": {"$in": run_ids}})
                out["case_results"] = int(getattr(cr, "deleted_count", 0) or 0)
                sr = await self.suite_runs.delete_many({"id": {"$in": run_ids}})
                out["suite_runs"] = int(getattr(sr, "deleted_count", 0) or 0)
            cv = await self.coverage.delete_many({"captured_at": {"$lt": cutoff_iso}})
            out["coverage"] = int(getattr(cv, "deleted_count", 0) or 0)
            # keep last 50 release snapshots always; also purge very old
            rl = await self.release.delete_many({"computed_at": {"$lt": cutoff_iso}})
            out["release"] = int(getattr(rl, "deleted_count", 0) or 0)
        except Exception:
            pass
        return out


qa_repo = QaRepository()
