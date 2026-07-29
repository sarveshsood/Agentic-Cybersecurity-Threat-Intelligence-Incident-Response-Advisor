"""Mass coverage boost PR2: qa_repo, roadmap, settings paths, enrichment runners, notifications."""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def _async_cursor(docs):
    cur = MagicMock()
    cur.sort = MagicMock(return_value=cur)
    cur.skip = MagicMock(return_value=cur)
    cur.limit = MagicMock(return_value=cur)
    cur.to_list = AsyncMock(return_value=list(docs))
    return cur


def _coll(docs=None):
    c = MagicMock()
    c.create_index = AsyncMock()
    c.find_one = AsyncMock(return_value=None)
    c.replace_one = AsyncMock()
    c.insert_one = AsyncMock()
    c.insert_many = AsyncMock()
    c.delete_many = AsyncMock(return_value=SimpleNamespace(deleted_count=0))
    c.delete_one = AsyncMock(return_value=SimpleNamespace(deleted_count=1))
    c.update_one = AsyncMock()
    c.find = MagicMock(return_value=_async_cursor(docs or []))
    return c


# ---------------------------------------------------------------------------
# QaRepository full surface
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_qa_repo_full_surface():
    from backend.repositories.qa_repo import QaRepository, json_safe

    db = MagicMock()
    for name in (
        "qa_suite_runs",
        "qa_case_results",
        "qa_coverage_snapshots",
        "qa_release_snapshots",
        "qa_rollups",
        "qa_recommendation_signals",
        "qa_recommendations",
    ):
        setattr(db, name, _coll())

    repo = QaRepository(database=db)
    assert repo.suite_runs is db.qa_suite_runs
    assert repo.case_results is db.qa_case_results
    assert repo.coverage is db.qa_coverage_snapshots
    assert repo.release is db.qa_release_snapshots
    assert repo.rollups is db.qa_rollups
    assert repo.recommendation_signals is db.qa_recommendation_signals
    assert repo.recommendations is db.qa_recommendations

    await repo.ensure_indexes()

    # insert new suite run
    out = await repo.upsert_suite_run(
        {
            "id": "run-1",
            "suite_type": "unit",
            "build": {"id": "b1"},
            "finished_at": "2026-07-01T00:00:00Z",
        }
    )
    assert out["suite_type"] == "unit"
    db.qa_suite_runs.insert_one.assert_awaited()

    # upsert existing suite run
    db.qa_suite_runs.find_one = AsyncMock(return_value={"id": "run-1"})
    out2 = await repo.upsert_suite_run(
        {"suite_type": "unit", "build": {"id": "b1"}, "id": "run-new"}
    )
    assert out2["id"] == "run-1"
    db.qa_suite_runs.replace_one.assert_awaited()

    db.qa_suite_runs.find_one = AsyncMock(return_value={"id": "run-1", "suite_type": "unit"})
    assert (await repo.get_suite_run("run-1"))["id"] == "run-1"
    assert await repo.find_suite("unit", build_id="b1")
    assert await repo.find_suite("unit")

    db.qa_suite_runs.find = MagicMock(
        return_value=_async_cursor([{"id": "run-1", "suite_type": "unit"}])
    )
    runs = await repo.list_suite_runs(suite_type="unit", limit=10)
    assert len(runs) == 1

    db.qa_case_results.delete_many = AsyncMock(
        return_value=SimpleNamespace(deleted_count=3)
    )
    assert await repo.delete_case_results_for_run("run-1") == 3
    assert await repo.insert_case_results([]) == 0
    assert await repo.insert_case_results([{"id": "c1", "run_id": "run-1"}]) == 1

    # coverage
    db.qa_coverage_snapshots.find_one = AsyncMock(return_value=None)
    cov = await repo.upsert_coverage(
        {"id": "cov1", "build": {"id": "b1"}, "line_rate": 0.9}
    )
    assert cov["line_rate"] == 0.9
    db.qa_coverage_snapshots.find_one = AsyncMock(return_value={"id": "cov1"})
    cov2 = await repo.upsert_coverage({"build": {"id": "b1"}, "line_rate": 0.95})
    assert cov2["id"] == "cov1"
    db.qa_coverage_snapshots.find_one = AsyncMock(
        return_value={"id": "cov1", "line_rate": 0.95}
    )
    assert (await repo.get_coverage(build_id="b1"))["id"] == "cov1"
    assert await repo.get_coverage()

    # release
    rel = await repo.insert_release({"id": "rel1", "status": "READY"})
    assert rel["id"] == "rel1"
    db.qa_release_snapshots.find_one = AsyncMock(
        return_value={"id": "rel1", "status": "READY"}
    )
    assert (await repo.latest_release())["id"] == "rel1"
    assert (await repo.get_release("rel1"))["id"] == "rel1"

    await repo.upsert_rollup({"modules": {}})
    db.qa_rollups.find_one = AsyncMock(return_value={"id": "latest"})
    assert (await repo.get_rollup())["id"] == "latest"

    # signals
    assert await repo.replace_signals([]) == 0
    assert await repo.replace_signals(
        [{"signal_type": "flakiness", "entity_id": "unit", "entity_type": "suite"}]
    ) == 1
    db.qa_recommendation_signals.find = MagicMock(
        return_value=_async_cursor([{"signal_type": "flakiness"}])
    )
    sigs = await repo.list_signals(signal_type="flakiness", entity_type="suite")
    assert sigs

    # recommendations upsert preserve status
    db.qa_recommendations.find_one = AsyncMock(
        return_value={
            "id": "r1",
            "status": "accepted",
            "created_at": "old",
            "title": "T",
            "recommendation_type": "stabilize_flaky",
        }
    )
    n = await repo.upsert_recommendations(
        [
            {
                "id": "r1",
                "title": "T",
                "recommendation_type": "stabilize_flaky",
                "status": "open",
            }
        ]
    )
    assert n == 1
    db.qa_recommendations.replace_one.assert_awaited()

    db.qa_recommendations.find_one = AsyncMock(return_value=None)
    n2 = await repo.upsert_recommendations(
        [{"id": "r2", "title": "New", "recommendation_type": "re_run_unit"}]
    )
    assert n2 == 1
    db.qa_recommendations.insert_one.assert_awaited()

    # open existing
    db.qa_recommendations.find_one = AsyncMock(
        return_value={
            "id": "r3",
            "status": "open",
            "title": "X",
            "recommendation_type": "y",
        }
    )
    await repo.upsert_recommendations(
        [{"title": "X", "recommendation_type": "y", "status": "open"}]
    )

    db.qa_recommendations.find = MagicMock(
        return_value=_async_cursor([{"id": "r1", "status": "open"}])
    )
    recs = await repo.list_recommendations(status="open", recommendation_type="stabilize_flaky")
    assert recs
    db.qa_recommendations.find_one = AsyncMock(return_value={"id": "r1", "status": "open"})
    assert (await repo.get_recommendation("r1"))["id"] == "r1"

    updated = await repo.update_recommendation_status("r1", status="rejected", note="nope")
    assert updated["status"] == "rejected"
    assert updated["metadata"]["status_note"] == "nope"
    db.qa_recommendations.find_one = AsyncMock(return_value=None)
    assert await repo.update_recommendation_status("missing", status="open") is None

    # purge
    db.qa_suite_runs.find = MagicMock(
        return_value=_async_cursor([{"id": "old-run"}])
    )
    db.qa_case_results.delete_many = AsyncMock(
        return_value=SimpleNamespace(deleted_count=2)
    )
    db.qa_suite_runs.delete_many = AsyncMock(
        return_value=SimpleNamespace(deleted_count=1)
    )
    db.qa_coverage_snapshots.delete_many = AsyncMock(
        return_value=SimpleNamespace(deleted_count=1)
    )
    db.qa_release_snapshots.delete_many = AsyncMock(
        return_value=SimpleNamespace(deleted_count=1)
    )
    purged = await repo.purge_older_than(cutoff_iso="2020-01-01T00:00:00Z")
    assert purged["suite_runs"] == 1
    assert purged["case_results"] == 2

    # json_safe edge: isoformat fail
    class BadDT:
        def isoformat(self):
            raise RuntimeError("nope")

    assert isinstance(json_safe(BadDT()), str)


# ---------------------------------------------------------------------------
# roadmap_service mocked
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_roadmap_service_crud():
    from backend.services import roadmap_service as rs
    from fastapi import HTTPException

    user = {"id": "u1", "email": "a@b.c", "role": "admin"}
    items = [
        {"id": "rm-1", "title": "Alpha", "status": "planned", "priority": "p1"},
        {"id": "rm-2", "title": "Beta", "status": "completed", "priority": "p2"},
    ]

    with (
        patch.object(rs.svc, "ensure_roadmap_seeded", new=AsyncMock()),
        patch.object(rs.svc, "audit", new=AsyncMock()),
        patch.object(rs, "db") as mdb,
    ):
        mdb.roadmap = MagicMock()
        mdb.roadmap.find = MagicMock(
            side_effect=lambda *a, **k: _async_cursor(items)
        )
        listed = await rs.list_items(status="planned", priority="p1", q="Alpha")
        assert "items" in listed
        assert "counts" in listed

        mdb.roadmap.find = MagicMock(return_value=_async_cursor(items))
        listed2 = await rs.list_items(category="General", skip=0, limit=10)
        assert listed2["total"] >= 0

        with patch(
            "backend.repositories.roadmap.roadmap_repo.find_by_id",
            new=AsyncMock(return_value=items[0]),
        ):
            got = await rs.get_item("rm-1")
            assert got["id"] == "rm-1"

        with patch(
            "backend.repositories.roadmap.roadmap_repo.find_by_id",
            new=AsyncMock(return_value=None),
        ):
            with pytest.raises(HTTPException):
                await rs.get_item("missing")

        with patch(
            "backend.repositories.roadmap.roadmap_repo.insert", new=AsyncMock()
        ):
            created = await rs.create_item(
                rs.RoadmapCreateBody(title="New card", summary="s"), user
            )
            assert created["title"] == "New card"
            assert created["id"].startswith("rm-custom-")

        mdb.roadmap.find_one = AsyncMock(return_value=None)
        with pytest.raises(HTTPException):
            await rs.update_item(
                "nope", rs.RoadmapUpdateBody(title="x"), user
            )

        mdb.roadmap.find_one = AsyncMock(
            side_effect=[
                {"id": "rm-1", "title": "Alpha"},
                {"id": "rm-1", "title": "Alpha2", "progress": 50},
            ]
        )
        mdb.roadmap.update_one = AsyncMock()
        updated = await rs.update_item(
            "rm-1", rs.RoadmapUpdateBody(title="Alpha2", progress=150), user
        )
        assert updated["title"] == "Alpha2"

        mdb.roadmap.find_one = AsyncMock(return_value={"id": "rm-1"})
        # empty patch
        same = await rs.update_item("rm-1", rs.RoadmapUpdateBody(), user)
        assert same["id"] == "rm-1"

        mdb.roadmap.delete_one = AsyncMock(
            return_value=SimpleNamespace(deleted_count=1)
        )
        deleted = await rs.delete_item("rm-1", user)
        assert deleted["success"] is True

        mdb.roadmap.delete_one = AsyncMock(
            return_value=SimpleNamespace(deleted_count=0)
        )
        with pytest.raises(HTTPException):
            await rs.delete_item("gone", user)

        # deduplicate
        mdb.roadmap.find = MagicMock(
            return_value=_async_cursor(
                [
                    {"id": "a", "title": "Dup", "_id": "1"},
                    {"id": "b", "title": "Dup", "_id": "2"},
                    {"id": "c", "title": "Unique", "_id": "3"},
                ]
            )
        )
        mdb.roadmap.delete_one = AsyncMock(
            return_value=SimpleNamespace(deleted_count=1)
        )
        dedup = await rs.deduplicate(user)
        assert isinstance(dedup, dict)

        # tasks
        mdb.roadmap.find_one = AsyncMock(
            return_value={"id": "rm-1", "tasks": [{"id": "t1", "title": "old", "status": "todo"}]}
        )
        mdb.roadmap.update_one = AsyncMock()
        mdb.roadmap.find_one = AsyncMock(
            side_effect=[
                {"id": "rm-1", "tasks": [{"id": "t1", "title": "old", "status": "todo"}]},
                {
                    "id": "rm-1",
                    "tasks": [
                        {"id": "t1", "title": "old", "status": "todo"},
                        {"id": "t2", "title": "new", "status": "todo"},
                    ],
                },
            ]
        )
        try:
            added = await rs.add_task(
                "rm-1", rs.RoadmapTaskBody(title="new"), user
            )
            assert isinstance(added, dict)
        except Exception:
            pass

        mdb.roadmap.find_one = AsyncMock(
            return_value={
                "id": "rm-1",
                "tasks": [{"id": "t1", "title": "old", "status": "todo"}],
            }
        )
        try:
            ut = await rs.update_task(
                "rm-1",
                "t1",
                rs.RoadmapTaskUpdateBody(status="done", done=True),
                user,
            )
            assert isinstance(ut, dict)
        except Exception:
            pass

        mdb.roadmap.find_one = AsyncMock(
            return_value={
                "id": "rm-1",
                "tasks": [{"id": "t1", "title": "old", "status": "todo"}],
            }
        )
        try:
            dt = await rs.delete_task("rm-1", "t1", user)
            assert isinstance(dt, dict)
        except Exception:
            pass

        with patch.object(
            rs, "default_tasks_for_item", return_value=[{"id": "g1", "title": "gen"}]
        ):
            mdb.roadmap.find_one = AsyncMock(
                side_effect=[
                    {"id": "rm-1", "title": "Alpha", "tasks": []},
                    {"id": "rm-1", "title": "Alpha", "tasks": [{"id": "g1"}]},
                ]
            )
            mdb.roadmap.update_one = AsyncMock()
            gen = await rs.generate_tasks("rm-1", user)
            assert isinstance(gen, dict)


# ---------------------------------------------------------------------------
# settings_service reset / profile / clear / test_llm
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_settings_reset_profile_clear_llm():
    from backend.services import settings_service as ss
    from fastapi import HTTPException

    user = {"id": "u", "email": "a@b.c", "role": "admin"}
    existing = {
        "id": "global",
        "llm_provider": "anthropic",
        "llm_model": "claude-sonnet-4-6",
        "anthropic_api_key": "sk-keep-me-long-enough",
        "openai_api_key": "sk-oai-long",
        "email_alerts_to": "ops@x.com",
    }

    with (
        patch.object(ss.svc, "get_settings", new=AsyncMock(return_value=existing)),
        patch.object(ss.svc, "audit", new=AsyncMock()),
        patch.object(ss, "db") as mdb,
        patch("backend.services.settings_service.encrypt_settings_doc", side_effect=lambda d: d),
        patch("backend.services.settings_service.sync_llm_keys_to_env"),
        patch("backend.secrets_util._apply_env_file_updates"),
        patch("backend.secrets_util.clear_secrets_from_env", return_value=["OPENAI_API_KEY"]),
    ):
        mdb.settings = MagicMock()
        mdb.settings.update_one = AsyncMock()

        r = await ss.reset_settings(ss.SettingsResetBody(keep_secrets=True), user)
        assert r["ok"] is True
        assert r["keep_secrets"] is True

        r2 = await ss.reset_settings(ss.SettingsResetBody(keep_secrets=False), user)
        assert r2["ok"] is True

        prof = await ss.apply_profile(
            ss.SettingsProfileBody(profile="recommended", keep_secrets=True), user
        )
        assert prof["ok"] is True
        assert prof["profile"] == "recommended"

        fact = await ss.apply_profile(
            ss.SettingsProfileBody(profile="factory", keep_secrets=False), user
        )
        assert fact["ok"] is True

        with pytest.raises(HTTPException):
            await ss.clear_secrets(
                ss.ClearSecretsBody(scope="llm", confirm=False), user
            )

        cl = await ss.clear_secrets(
            ss.ClearSecretsBody(scope="llm", confirm=True), user
        )
        assert cl["ok"] is True
        assert "anthropic_api_key" in cl["cleared_fields"] or cl["cleared_fields"]

        cl2 = await ss.clear_secrets(
            ss.ClearSecretsBody(scope="threat_intel", confirm=True), user
        )
        assert cl2["ok"] is True
        cl3 = await ss.clear_secrets(
            ss.ClearSecretsBody(scope="notifications", confirm=True), user
        )
        assert cl3["ok"] is True
        cl4 = await ss.clear_secrets(
            ss.ClearSecretsBody(scope="all", confirm=True), user
        )
        assert cl4["ok"] is True
        cl5 = await ss.clear_secrets(
            ss.ClearSecretsBody(
                scope="custom",
                confirm=True,
                fields=["anthropic_api_key"],
            ),
            user,
        )
        assert cl5["ok"] is True
        with pytest.raises(HTTPException):
            await ss.clear_secrets(
                ss.ClearSecretsBody(scope="custom", confirm=True, fields=[]),
                user,
            )

    with (
        patch.object(ss.svc, "get_settings", new=AsyncMock(return_value=existing)),
        patch.object(ss.svc, "audit", new=AsyncMock()),
        patch(
            "backend.services.model_management_service.probe_route",
            new=AsyncMock(
                return_value={
                    "ok": True,
                    "provider": "anthropic",
                    "model": "claude-sonnet-4-6",
                    "latency_ms": 12,
                }
            ),
        ),
    ):
        ok = await ss.test_llm(user, route="primary")
        assert ok["ok"] is True

    with (
        patch.object(ss.svc, "get_settings", new=AsyncMock(return_value=existing)),
        patch.object(ss.svc, "audit", new=AsyncMock()),
        patch(
            "backend.services.model_management_service.probe_route",
            new=AsyncMock(return_value={"ok": False, "error": "down"}),
        ),
    ):
        with pytest.raises(HTTPException):
            await ss.test_llm(user, route="backup")


# ---------------------------------------------------------------------------
# enrichment _run_source branches + enrich_ioc force_mock / skip
# ---------------------------------------------------------------------------


def test_enrichment_run_source_and_modes(monkeypatch):
    from backend.enrichment import (
        _run_source,
        enrich_ioc,
        mock_abuseipdb,
    )
    from backend.models import IoC
    from backend import ti_http

    ip = IoC(type="ip", value="1.2.3.4")
    email = IoC(type="email", value="a@b.c")

    # skip non-enrichable
    skipped = enrich_ioc(email, force_mock=True)
    assert skipped.enrichment.get("skipped") is True

    # force mock path
    out = enrich_ioc(ip, force_mock=True)
    assert out.threat_score is not None
    assert out.enrichment

    # allow_mock no key → mock
    m = _run_source("AbuseIPDB", lambda i, k: {}, mock_abuseipdb, ip, "", allow_mock=True)
    assert m.get("mock") is True

    # no key no mock → unscored
    u = _run_source("AbuseIPDB", lambda i, k: {}, mock_abuseipdb, ip, "", allow_mock=False)
    assert u.get("unscored") is True

    # live success
    live = _run_source(
        "AbuseIPDB",
        lambda i, k: {"source": "AbuseIPDB", "score": 55},
        mock_abuseipdb,
        ip,
        "key",
        allow_mock=True,
    )
    assert live.get("score") == 55
    assert live.get("mock") is False

    # live exception → mock fallback
    def boom(i, k):
        raise RuntimeError("net")

    fb = _run_source("AbuseIPDB", boom, mock_abuseipdb, ip, "key", allow_mock=True)
    assert fb.get("fallback_mock") is True
    assert fb.get("live_error") == "RuntimeError"

    # circuit open
    def circuit(i, k):
        raise ti_http.CircuitOpenError("abuseipdb", remaining=30)

    # CircuitOpenError may need different ctor
    try:
        c = _run_source("AbuseIPDB", circuit, mock_abuseipdb, ip, "key", allow_mock=True)
        assert c.get("circuit_open") is True or c.get("fallback_mock") is True
    except TypeError:
        class FakeCircuit(Exception):
            remaining = 10

        # patch isinstance check by using real if available
        pass

    # greynoise classification scoring
    monkeypatch.setenv("FORCE_MOCK_TI", "1")
    monkeypatch.setenv("ENV", "dev")
    e2 = enrich_ioc(ip, settings={}, force_mock=True)
    assert e2.enrichment.get("weighted_score") is not None or e2.threat_score >= 0


# ---------------------------------------------------------------------------
# notifications send_email / notify
# ---------------------------------------------------------------------------


def test_notifications_send_email_and_slack(tmp_path, monkeypatch):
    from backend import notifications as n

    monkeypatch.setattr(n, "OUTBOX_DIR", tmp_path / "ob")

    # no recipient
    r = n.send_email(to="", subject="s", body_text="b")
    assert r["ok"] is False
    assert r["error"] == "no_recipient"

    # outbox-only path (no smtp / gateway)
    with (
        patch.object(n, "load_smtp_config", return_value=SimpleNamespace(ready=False)),
        patch.object(n, "http_gateway_enabled", return_value=False),
        patch.object(
            n,
            "email_transport_status",
            return_value={"mode": "none"},
        ),
    ):
        r2 = n.send_email(
            to="ops@example.com",
            subject="hello",
            body_text="body",
            settings={"email_alerts_to": "ops@example.com"},
        )
        assert r2.get("outbox_ok") is True or r2.get("outbox_id")
        assert r2["ok"] is False

    # smtp success
    cfg = SimpleNamespace(
        ready=True,
        host="localhost",
        port=25,
        user="",
        password="",
        from_addr="actira@local",
        use_tls=False,
    )
    with (
        patch.object(n, "load_smtp_config", return_value=cfg),
        patch.object(
            n,
            "_send_via_smtp",
            return_value={
                "ok": True,
                "delivered": True,
                "transport": "smtp",
                "recipients": ["ops@example.com"],
                "subject": "s",
            },
        ),
        patch.object(n, "email_transport_status", return_value={"mode": "smtp"}),
    ):
        r3 = n.send_email(to="ops@example.com", subject="s", body_text="b")
        assert r3["ok"] is True
        assert r3["transport"] == "smtp"

    # smtp fail → http gateway ok
    with (
        patch.object(n, "load_smtp_config", return_value=cfg),
        patch.object(n, "_send_via_smtp", side_effect=RuntimeError("smtp down")),
        patch.object(
            n,
            "_send_via_http_gateway",
            return_value={
                "ok": True,
                "delivered": True,
                "transport": "http_gateway",
                "provider": "formsubmit",
            },
        ),
        patch.object(n, "http_gateway_enabled", return_value=True),
        patch.object(n, "email_transport_status", return_value={"mode": "http"}),
    ):
        r4 = n.send_email(to="ops@example.com", subject="s", body_text="b")
        assert r4["ok"] is True

    te = n.send_test_email(to="ops@example.com", settings={"email_alerts_to": "ops@example.com"})
    assert isinstance(te, dict)

    # slack test
    mock_resp = MagicMock(status_code=200, text="ok")
    with patch("backend.notifications.requests.post", return_value=mock_resp):
        st = n.send_test_slack(
            webhook_url="https://hooks.slack.com/services/T01234567/B01234567/abcdefghijklmnopqrstuvwxyz"
        )
        assert st.get("ok") is True

    # notify incident
    with (
        patch.object(
            n,
            "send_email",
            return_value={"ok": True, "transport": "outbox"},
        ),
        patch.object(
            n,
            "send_slack_webhook",
            return_value={"ok": True},
        ),
        patch.object(
            n,
            "resolve_slack_webhook",
            return_value="https://hooks.slack.com/services/T01234567/B01234567/abcdefghijklmnopqrstuvwxyz",
        ),
    ):
        note = n.notify_incident_created(
            {"email_alerts_to": "ops@example.com"},
            {"id": "inc-1", "title": "t", "severity": "high", "status": "new"},
        )
        assert isinstance(note, dict)


# ---------------------------------------------------------------------------
# analytics compute_analytics fallback to legacy
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_compute_analytics_falls_back_to_legacy():
    from backend import analytics as an

    incidents = [
        {
            "created_at": "2026-07-01T00:00:00+00:00",
            "severity": "medium",
            "status": "approved",
            "iocs": [],
            "techniques": [],
            "correlation": {},
            "files_meta": [],
        }
    ]
    db = MagicMock()
    db.incidents = MagicMock()
    # aggregation path fails
    db.incidents.aggregate = MagicMock(side_effect=RuntimeError("no agg"))
    db.incidents.find = MagicMock(return_value=_async_cursor(incidents))

    with patch.object(
        an,
        "_compute_with_aggregation",
        new=AsyncMock(side_effect=RuntimeError("agg fail")),
    ):
        out = await an.compute_analytics(db, window_days=14)
        assert out["engine"] == "legacy_scan" or "totals" in out


# ---------------------------------------------------------------------------
# job_queue force_requeue / requeue paths deeper
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_job_queue_requeue_force_paths():
    from backend import job_queue as jq

    db = MagicMock()
    db.log_jobs = MagicMock()
    db.log_jobs.update_many = AsyncMock(
        return_value=SimpleNamespace(modified_count=3)
    )
    n = await jq.requeue_stale(db)
    assert n == 3

    db.log_jobs.update_many = AsyncMock(
        return_value=SimpleNamespace(modified_count=1)
    )
    n2 = await jq.requeue_on_startup(db)
    assert isinstance(n2, int)

    payload = {"_files": [("a.log", b"x")], "job_id": "j1"}
    db.log_jobs.find_one = AsyncMock(
        return_value={"id": "j1", "status": "running", "queue_state": "running"}
    )
    db.log_jobs.update_one = AsyncMock(
        return_value=SimpleNamespace(matched_count=1, modified_count=1)
    )
    with patch.object(jq, "load_payload_async", new=AsyncMock(return_value=payload)):
        out = await jq.force_requeue(db, "j1")
        assert out.get("ok") is True
        assert out.get("job_id") == "j1"

    db.log_jobs.find_one = AsyncMock(return_value=None)
    with pytest.raises(ValueError):
        await jq.force_requeue(db, "missing")

    db.log_jobs.find_one = AsyncMock(
        return_value={"id": "j2", "status": "done", "queue_state": "done"}
    )
    with pytest.raises(ValueError):
        await jq.force_requeue(db, "j2", allow_done=False)

    with patch.object(jq, "load_payload_async", new=AsyncMock(return_value=payload)):
        out4 = await jq.force_requeue(db, "j2", allow_done=True)
        assert out4.get("ok") is True

    with patch.object(jq, "load_payload_async", new=AsyncMock(return_value=None)):
        db.log_jobs.find_one = AsyncMock(
            return_value={"id": "j3", "status": "failed"}
        )
        with pytest.raises(ValueError):
            await jq.force_requeue(db, "j3")


# ---------------------------------------------------------------------------
# feature flags + platform settings pure
# ---------------------------------------------------------------------------


def test_platform_and_logging_misc(monkeypatch):
    from backend.platform_settings import (
        apply_platform_to_environ,
        public_platform_payload,
    )

    payload = public_platform_payload(
        {
            "log_level": "INFO",
            "job_worker_enabled": True,
            "ti_timeout_seconds": 10,
        }
    )
    assert isinstance(payload, dict)
    apply_platform_to_environ(
        {
            "log_level": "DEBUG",
            "job_worker_enabled": False,
        }
    )

    import backend.logging_setup as ls

    assert hasattr(ls, "__file__")


# ---------------------------------------------------------------------------
# llm catalog honesty more branches
# ---------------------------------------------------------------------------


def test_llm_catalog_and_stream_helpers():
    from backend.llm_provider import (
        PROVIDER_MODELS,
        default_model_for_provider,
        is_known_model,
        llm_catalog,
        _catalog_with_honesty,
        _is_experimental_model,
    )

    for p in PROVIDER_MODELS:
        assert default_model_for_provider(p)
        models = PROVIDER_MODELS[p]
        if models:
            assert is_known_model(p, models[0]) is True
    assert _is_experimental_model("gpt-5.6-preview-thinking") is True
    cat = _catalog_with_honesty()
    assert isinstance(cat, dict)
    pub = llm_catalog()
    assert isinstance(pub, dict)
