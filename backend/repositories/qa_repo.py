"""Mongo access for Testing Health Center artifacts."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from backend.database import db


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
        except Exception:
            pass

    async def upsert_suite_run(self, doc: Dict[str, Any]) -> Dict[str, Any]:
        build_id = (doc.get("build") or {}).get("id")
        suite_type = doc.get("suite_type")
        if build_id and suite_type:
            existing = await self.suite_runs.find_one(
                {"build.id": build_id, "suite_type": suite_type},
                {"_id": 0, "id": 1},
            )
            if existing and existing.get("id"):
                doc = {**doc, "id": existing["id"]}
                await self.suite_runs.replace_one({"id": doc["id"]}, doc, upsert=True)
                return doc
        await self.suite_runs.insert_one(doc)
        return doc

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
        if build_id:
            existing = await self.coverage.find_one({"build.id": build_id}, {"_id": 0, "id": 1})
            if existing and existing.get("id"):
                doc = {**doc, "id": existing["id"]}
                await self.coverage.replace_one({"id": doc["id"]}, doc, upsert=True)
                return doc
        await self.coverage.insert_one(doc)
        return doc

    async def get_coverage(self, *, build_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        q: Dict[str, Any] = {}
        if build_id:
            q["build.id"] = build_id
        return await self.coverage.find_one(q, {"_id": 0}, sort=[("captured_at", -1)])

    async def insert_release(self, doc: Dict[str, Any]) -> None:
        await self.release.insert_one(doc)

    async def latest_release(self) -> Optional[Dict[str, Any]]:
        return await self.release.find_one({}, {"_id": 0}, sort=[("computed_at", -1)])

    async def get_release(self, rel_id: str) -> Optional[Dict[str, Any]]:
        return await self.release.find_one({"id": rel_id}, {"_id": 0})

    async def upsert_rollup(self, doc: Dict[str, Any]) -> None:
        rid = doc.get("id") or "latest"
        doc = {**doc, "id": rid}
        await self.rollups.replace_one({"id": rid}, doc, upsert=True)

    async def get_rollup(self, rid: str = "latest") -> Optional[Dict[str, Any]]:
        return await self.rollups.find_one({"id": rid}, {"_id": 0})

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
