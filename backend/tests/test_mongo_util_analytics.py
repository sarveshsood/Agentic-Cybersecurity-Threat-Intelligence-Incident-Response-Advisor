"""A-H2: mongo_util datetime helpers + analytics match shape."""
from __future__ import annotations

import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
from backend.mongo_util import created_at_match, ensure_datetime, to_mongo_doc  # noqa: E402
from backend.models import Incident  # noqa: E402


class TestMongoUtil:
    def test_to_mongo_doc_keeps_datetime(self):
        inc = Incident(
            title="t",
            severity="low",
            status="new",
            source_files=["a.log"],
            created_by="u1",
        )
        doc = to_mongo_doc(inc)
        assert isinstance(doc["created_at"], datetime)

    def test_ensure_datetime_iso(self):
        dt = ensure_datetime("2026-07-19T12:00:00+00:00")
        assert isinstance(dt, datetime)
        assert dt.tzinfo is not None

    def test_created_at_match_dual(self):
        cutoff = datetime.now(timezone.utc) - timedelta(days=7)
        m = created_at_match(cutoff)
        assert "$or" in m
        assert len(m["$or"]) == 2
        assert isinstance(m["$or"][0]["created_at"]["$gte"], datetime)
        assert isinstance(m["$or"][1]["created_at"]["$gte"], str)
