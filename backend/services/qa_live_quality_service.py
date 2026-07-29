"""Run real local pytest + coverage and ingest into QA Health (no fixtures).

Admin-only. Spawns pytest with JUnit + Cobertura XML, then
``qa_ingest_service.ingest_artifacts`` so Release / Coverage UI show
measured numbers — not lab sample XML.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.models import new_id, utc_now
from backend.repositories.qa_repo import json_safe
from backend.services import qa_ingest_service

logger = logging.getLogger("actira")

REPO_ROOT = Path(__file__).resolve().parents[2]
BACKEND = REPO_ROOT / "backend"
REPORTS = REPO_ROOT / "reports"
COVERAGERC = REPO_ROOT / ".coveragerc"

# Default: unit-ish suite (skip heavy integration/e2e/perf/llm)
DEFAULT_PYTEST_ARGS = [
    "tests",
    "-n",
    "0",
    "-m",
    "not integration and not e2e and not performance and not requires_llm",
    "-q",
    "--tb=line",
]


def _env_timeout_s() -> int:
    try:
        return max(60, int(os.environ.get("QA_LIVE_QUALITY_TIMEOUT_S") or "900"))
    except (TypeError, ValueError):
        return 900


def _run_pytest_sync(*, timeout_s: int) -> Dict[str, Any]:
    REPORTS.mkdir(parents=True, exist_ok=True)
    junit_path = REPORTS / "junit-live-unit.xml"
    cov_xml = REPORTS / "coverage-live.xml"
    cov_html = REPORTS / "coverage_live_html"

    # Fresh files
    for p in (junit_path, cov_xml):
        try:
            if p.is_file():
                p.unlink()
        except OSError:
            pass

    # Run from backend/: tests/ path, cov=. (backend package), coveragerc at repo root
    junit_rel = os.path.relpath(junit_path, BACKEND)
    cov_xml_rel = os.path.relpath(cov_xml, BACKEND)
    cov_html_rel = os.path.relpath(cov_html, BACKEND)
    cov_cfg = os.path.relpath(COVERAGERC, BACKEND) if COVERAGERC.is_file() else None
    cmd: List[str] = [
        sys.executable,
        "-m",
        "pytest",
        *DEFAULT_PYTEST_ARGS,
        f"--junitxml={junit_rel}",
        "--cov=.",
        *( [f"--cov-config={cov_cfg}"] if cov_cfg else [] ),
        f"--cov-report=xml:{cov_xml_rel}",
        f"--cov-report=html:{cov_html_rel}",
        "--cov-report=term-missing:skip-covered",
        # Always produce XML even if below gate — readiness uses its own gate
        "--cov-fail-under=0",
    ]
    # Prefer running from backend/ so tests/ resolves
    env = os.environ.copy()
    env["PYTHONPATH"] = str(REPO_ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONDONTWRITEBYTECODE"] = "1"

    started = time.time()
    logger.info("qa live quality pytest start: %s", " ".join(cmd))
    try:
        proc = subprocess.run(
            cmd,
            cwd=str(BACKEND),
            env=env,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired as e:
        return {
            "ok": False,
            "error": f"pytest timed out after {timeout_s}s",
            "duration_s": time.time() - started,
            "stdout_tail": (e.stdout or "")[-2000:] if isinstance(e.stdout, str) else "",
            "stderr_tail": (e.stderr or "")[-2000:] if isinstance(e.stderr, str) else "",
            "junit_path": str(junit_path),
            "coverage_path": str(cov_xml),
            "exit_code": -1,
        }
    except FileNotFoundError as e:
        return {
            "ok": False,
            "error": f"pytest not runnable: {e}",
            "duration_s": time.time() - started,
        }

    duration = time.time() - started
    return {
        "ok": True,
        "exit_code": proc.returncode,
        "duration_s": round(duration, 2),
        "junit_path": str(junit_path),
        "junit_exists": junit_path.is_file(),
        "coverage_path": str(cov_xml),
        "coverage_exists": cov_xml.is_file(),
        "stdout_tail": (proc.stdout or "")[-2500:],
        "stderr_tail": (proc.stderr or "")[-1500:],
        "cmd": cmd,
    }


async def run_live_quality(*, actor: dict) -> Dict[str, Any]:
    """Execute real pytest+coverage and ingest into QA Health."""
    role = (actor or {}).get("role")
    if role != "admin":
        raise HTTPException(403, "Live quality run requires admin")

    # Optional kill-switch
    if (os.environ.get("QA_LIVE_QUALITY") or "1").strip().lower() in ("0", "false", "no", "off"):
        raise HTTPException(503, "Live quality disabled (QA_LIVE_QUALITY=0)")

    timeout_s = _env_timeout_s()
    pytest_out = await asyncio.to_thread(_run_pytest_sync, timeout_s=timeout_s)
    if not pytest_out.get("ok"):
        raise HTTPException(500, pytest_out.get("error") or "pytest failed to start")

    junit_path = Path(pytest_out["junit_path"])
    cov_path = Path(pytest_out["coverage_path"])
    if not junit_path.is_file() and not cov_path.is_file():
        raise HTTPException(
            500,
            "pytest finished but produced no junit/coverage XML. "
            f"exit={pytest_out.get('exit_code')} stderr={(pytest_out.get('stderr_tail') or '')[-400:]}",
        )

    build_id = f"live-{utc_now().strftime('%Y%m%dT%H%M%SZ')}-{new_id()[:8]}"
    meta = {
        "suite_type": "unit",
        "source": "live_pytest",
        "env": "LAB",
        "category": "Functional",
        "name": "live-pytest-unit+cov",
        "build": {
            "id": build_id,
            "branch": os.environ.get("GIT_BRANCH") or "local",
            "commit": os.environ.get("GIT_COMMIT"),
        },
    }
    meta_bytes = json.dumps(meta).encode("utf-8")

    junit_files = []
    if junit_path.is_file():
        junit_files.append((junit_path.name, junit_path.read_bytes()))
    coverage_bytes = cov_path.read_bytes() if cov_path.is_file() else None

    ingest = await qa_ingest_service.ingest_artifacts(
        actor=actor,
        meta_bytes=meta_bytes,
        junit_files=junit_files,
        coverage_bytes=coverage_bytes,
        coverage_filename=cov_path.name if cov_path.is_file() else "coverage.xml",
    )

    release = ingest.get("release") or {}
    cov_out = ingest.get("coverage") or {}

    return json_safe(
        {
            "ok": True,
            "mode": "live_pytest",
            "note": (
                "Artifacts generated by local pytest+pytest-cov and ingested. "
                "Not lab fixtures. UI Coverage/Release reflect this run."
            ),
            "build_id": build_id,
            "pytest": {
                "exit_code": pytest_out.get("exit_code"),
                "duration_s": pytest_out.get("duration_s"),
                "junit_path": pytest_out.get("junit_path"),
                "coverage_path": pytest_out.get("coverage_path"),
                "junit_exists": pytest_out.get("junit_exists"),
                "coverage_exists": pytest_out.get("coverage_exists"),
                "stdout_tail": pytest_out.get("stdout_tail"),
                "stderr_tail": pytest_out.get("stderr_tail"),
            },
            "ingest": {
                "runs": ingest.get("runs") or ingest.get("suite_runs"),
                "coverage": cov_out,
            },
            "release": {
                "verdict": release.get("verdict"),
                "score": release.get("score"),
                "grade": release.get("grade"),
                "blockers": release.get("blockers"),
                "id": release.get("id"),
            },
            "coverage_percent": (cov_out or {}).get("percent")
            or ((release.get("checklist") or []) and None),
        }
    )
