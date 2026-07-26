"""Offline tests for Wave 3 / remaining module-review items.

  - A-T4 job_status sidecar merge
  - A-M1 retention purge + token budget meter
  - A-P5 Incident correlation / files_meta fields
  - A-L5 citation_quality on Playbook
"""
from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


# -------------------- A-T4 job_status --------------------
class TestJobStatusSidecar:
    def test_write_read_merge(self, tmp_path, monkeypatch):
        import job_status as js

        monkeypatch.setattr(js, "FAILURE_DIR", tmp_path)
        path = js.write_failure_sidecar("job-1", "boom exploded", stage="enrich")
        assert path is not None and path.exists()
        side = js.read_failure_sidecar("job-1")
        assert side["status"] == "failed"
        assert "boom" in side["error"]
        assert side.get("stage") == "enrich"

        stuck = {"id": "job-1", "status": "enriching", "progress": 40}
        merged = js.merge_job_with_sidecar(stuck)
        assert merged["status"] == "failed"
        assert merged["error_source"] == "sidecar"
        assert "boom" in merged["error"]

        done = {"id": "job-1", "status": "done", "progress": 100}
        assert js.merge_job_with_sidecar(done)["status"] == "done"

        already = {"id": "job-1", "status": "failed", "error": "mongo"}
        assert js.merge_job_with_sidecar(already)["error"] == "mongo"

    def test_purge_old_sidecars(self, tmp_path, monkeypatch):
        import job_status as js
        import time

        monkeypatch.setattr(js, "FAILURE_DIR", tmp_path)
        js.write_failure_sidecar("new", "x")
        old = tmp_path / "old.json"
        old.write_text(json.dumps({"id": "old", "error": "y"}), encoding="utf-8")
        # backdate mtime
        old_time = time.time() - 10 * 86400
        import os
        os.utime(old, (old_time, old_time))
        removed = js.purge_old_sidecars(max_age_days=7)
        assert removed >= 1
        assert not old.exists()
        assert (tmp_path / "new.json").exists()


# -------------------- A-M1 retention --------------------
class TestIncidentRetention:
    def test_cutoff_iso_is_past(self):
        from retention import retention_cutoff_iso

        cut = retention_cutoff_iso(30)
        assert cut < datetime.now(timezone.utc).isoformat()

    def test_purge_skips_zero_or_negative(self):
        from retention import purge_old_incidents

        class FakeDB:
            def __init__(self):
                self.incidents = self

            async def delete_many(self, q):
                raise AssertionError("should not delete when retention disabled")

        n = asyncio.run(purge_old_incidents(FakeDB(), 0))
        assert n == 0

    def test_purge_deletes_older_than_cutoff(self):
        from retention import purge_old_incidents

        class Result:
            deleted_count = 2

        class Coll:
            def __init__(self):
                self.last_q = None

            async def delete_many(self, q):
                self.last_q = q
                return Result()

        class FakeDB:
            def __init__(self):
                self.incidents = Coll()

        db = FakeDB()
        n = asyncio.run(purge_old_incidents(db, 90))
        assert n == 2
        assert "$lt" in db.incidents.last_q["created_at"]


# -------------------- A-M1 token budget --------------------
class TestLlmUsageBudget:
    def test_estimate_and_budget_zero_unlimited(self):
        from llm_usage import estimate_tokens, budget_from_settings

        assert estimate_tokens("abcd") == 1  # 4//4
        assert estimate_tokens("a" * 40) == 10
        assert budget_from_settings({}) == 0
        assert budget_from_settings({"llm_token_budget_monthly": 5000}) == 5000

    def test_assert_within_budget_raises(self):
        from llm_usage import assert_within_budget, BudgetExceededError, set_usage_db

        class Coll:
            async def find_one(self, *a, **k):
                return {"id": "x", "tokens": 1000}

        class FakeDB:
            llm_usage = Coll()

        set_usage_db(FakeDB())
        try:
            with pytest.raises(BudgetExceededError):
                asyncio.run(assert_within_budget({"llm_token_budget_monthly": 100}))
            # unlimited
            asyncio.run(assert_within_budget({"llm_token_budget_monthly": 0}))
        finally:
            set_usage_db(None)


# -------------------- A-P5 / A-L5 models --------------------
class TestIncidentSchema:
    def test_correlation_and_files_meta_on_incident(self):
        from backend.models import Incident, Playbook, PlaybookStep

        pb = Playbook(
            steps=[
                PlaybookStep(
                    order=1, phase="containment", action="block", citation_ids=["T1110", "PB-1"]
                ),
                PlaybookStep(
                    order=2, phase="eradication", action="wipe", citation_ids=["T1110"]
                ),
            ],
            grounding_score=1.0,
            citation_quality=0.5,
        )
        inc = Incident(
            title="t",
            created_by="u1",
            correlation={"stats": {"total_events": 3}, "correlations": []},
            files_meta=[{"file": "a.log", "events": 2}],
            playbook=pb,
        )
        d = inc.model_dump(mode="json")
        assert d["correlation"]["stats"]["total_events"] == 3
        assert d["files_meta"][0]["file"] == "a.log"
        assert d["playbook"]["citation_quality"] == 0.5
