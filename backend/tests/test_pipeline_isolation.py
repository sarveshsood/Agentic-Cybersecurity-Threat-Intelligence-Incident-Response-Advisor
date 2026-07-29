"""A-T6: Offline pipeline ZIP expansion + per-file parse isolation tests.

No Mongo/LLM required.
"""
from __future__ import annotations

import io
import sys
import zipfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
from backend.pipeline import (  # noqa: E402
    MAX_UNCOMPRESSED_BYTES,
    MAX_ZIP_MEMBERS,
    _expand_zip,
    flatten_uploads,
    run_batch_pipeline,
)


def _zip_bytes(members: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in members.items():
            zf.writestr(name, data)
    return buf.getvalue()


class TestZipExpansion:
    def test_flatten_expands_zip_members(self):
        raw = _zip_bytes(
            {
                "a.log": b"Failed password for root from 1.2.3.4",
                "b.log": b"GET /wp-admin HTTP/1.1",
            }
        )
        out = flatten_uploads([("bundle.zip", raw)])
        names = [n for n, _ in out]
        assert len(out) == 2
        assert any(n.endswith("a.log") for n in names)
        assert any(n.endswith("b.log") for n in names)

    def test_flatten_passes_through_plain_files(self):
        out = flatten_uploads([("plain.log", b"hello")])
        assert out == [("plain.log", b"hello")]

    def test_zip_bomb_member_size_skipped(self):
        # Single member larger than MAX_UNCOMPRESSED_BYTES is skipped
        huge = b"x" * (MAX_UNCOMPRESSED_BYTES + 100)
        raw = _zip_bytes({"huge.bin": huge, "ok.log": b"ok"})
        out = _expand_zip("t.zip", raw)
        names = [n for n, _ in out]
        assert not any("huge" in n for n in names)
        assert any("ok.log" in n for n in names)

    def test_zip_member_cap(self):
        members = {f"f{i}.log": b"line\n" for i in range(MAX_ZIP_MEMBERS + 10)}
        raw = _zip_bytes(members)
        out = _expand_zip("many.zip", raw)
        assert len(out) <= MAX_ZIP_MEMBERS

    def test_bad_zip_returns_empty(self):
        out = _expand_zip("bad.zip", b"not-a-zip")
        assert out == []


class TestPerFileParseIsolation:
    def test_one_bad_file_does_not_abort_batch(self):
        """run_batch_pipeline isolates parse failures per file."""

        async def run():
            db = MagicMock()
            db.log_jobs = MagicMock()
            db.log_jobs.update_one = AsyncMock()
            db.incidents = MagicMock()
            db.incidents.insert_one = AsyncMock()
            db.audit_log = MagicMock()
            db.audit_log.insert_one = AsyncMock()

            good = (
                b"Feb  1 09:13:02 web01 sshd[2211]: Failed password for root "
                b"from 45.155.205.199 port 34521 ssh2\n"
            )
            # Empty / binary-ish content may parse as 0 events but should not crash job
            files = [
                ("good.log", good),
                ("broken.dat", b"\x00\x01\xff not really a log"),
            ]

            # Pipeline writes via hashed audit_repo (not raw audit_log.insert_one)
            with patch("backend.pipeline.enrich_ioc", side_effect=lambda ioc, s: ioc), \
                    patch("backend.pipeline.generate_playbook", new_callable=AsyncMock) as gp, \
                    patch("backend.pipeline.mark_job_failed", new_callable=AsyncMock) as mjf, \
                    patch("backend.repositories.audit.audit_repo.insert", new_callable=AsyncMock) as audit_ins:
                from backend.models import Playbook, PlaybookStep

                gp.return_value = Playbook(
                    steps=[
                        PlaybookStep(
                            order=1,
                            phase="containment",
                            action="isolate",
                            citation_ids=["kb1"],
                        ),
                        PlaybookStep(
                            order=2,
                            phase="eradication",
                            action="wipe",
                            citation_ids=["kb1"],
                        ),
                        PlaybookStep(
                            order=3,
                            phase="recovery",
                            action="restore",
                            citation_ids=["kb1"],
                        ),
                        PlaybookStep(
                            order=4,
                            phase="lessons_learned",
                            action="note",
                            citation_ids=["kb1"],
                        ),
                    ],
                    grounding_score=0.9,
                    llm_provider="template",
                    llm_model="test",
                )
                await run_batch_pipeline(
                    db,
                    "job-iso-1",
                    files,
                    "user-1",
                    {
                        "llm_provider": "anthropic",
                        "hitl_severity_min": "critical",
                        "grounding_threshold": 0.5,
                        "auto_approve_grounding_min": 0.9,
                        "correlation_window_minutes": 30,
                        "max_enrich_iocs": 10,
                    },
                )
                # Job should complete (incident insert), not mark failed solely due to noise file
                assert db.incidents.insert_one.await_count >= 1
                # mark_job_failed should not be the happy path
                assert mjf.await_count == 0
                # Hashed chain path (unified with reviews/settings)
                assert audit_ins.await_count >= 1
                actions = [
                    (c.kwargs.get("action") if c.kwargs else None)
                    or (c.args[1] if len(c.args) > 1 else None)
                    for c in audit_ins.await_args_list
                ]
                # pipeline also emits pipeline.completed after incident.created
                assert "incident.created" in actions
                created = next(
                    c for c in audit_ins.await_args_list
                    if (c.kwargs or {}).get("action") == "incident.created"
                    or (len(c.args) > 1 and c.args[1] == "incident.created")
                )
                ck = created.kwargs or {}
                assert ck.get("target_type") == "incident" or (
                    len(created.args) > 2 and created.args[2] == "incident"
                )

        import asyncio

        asyncio.run(run())
