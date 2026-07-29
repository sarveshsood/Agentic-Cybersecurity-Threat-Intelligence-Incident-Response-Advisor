"""One-shot live quality run (admin actor). Used by ops/AI for QA Health refresh."""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))

# Load backend/.env without overriding explicit process env
envp = REPO / "backend" / ".env"
if envp.is_file():
    for line in envp.read_text(encoding="utf-8", errors="replace").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        k, v = k.strip(), v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)

os.environ["FEATURE_QA_HEALTH_CENTER"] = "1"
os.environ.setdefault("QA_LIVE_QUALITY", "1")
os.environ.setdefault("QA_LIVE_QUALITY_TIMEOUT_S", "1200")
os.environ["PYTHONPATH"] = str(REPO) + os.pathsep + os.environ.get("PYTHONPATH", "")


async def main() -> int:
    from backend.services.qa_live_quality_service import run_live_quality

    actor = {
        "role": "admin",
        "email": "admin@soc.example.com",
        "sub": "live-admin",
        "id": "live-admin",
    }
    print("starting live quality...", flush=True)
    out = await run_live_quality(actor=actor)
    print("ok", out.get("ok"), flush=True)
    print("build_id", out.get("build_id"), flush=True)
    py = out.get("pytest") or {}
    print("pytest exit", py.get("exit_code"), "duration_s", py.get("duration_s"), flush=True)
    print("junit_exists", py.get("junit_exists"), "coverage_exists", py.get("coverage_exists"), flush=True)
    cov = (out.get("ingest") or {}).get("coverage") or {}
    if isinstance(cov, dict):
        print(
            "coverage line_rate",
            cov.get("line_rate"),
            "branch_rate",
            cov.get("branch_rate"),
            flush=True,
        )
        totals = cov.get("totals") or cov.get("summary") or {}
        if totals:
            print("coverage totals", totals, flush=True)
    rel = out.get("release") or {}
    print("release verdict", rel.get("verdict") or rel, flush=True)
    if py.get("exit_code") not in (0, None):
        print("--- stdout_tail ---", flush=True)
        print((py.get("stdout_tail") or "")[-1200:], flush=True)
        print("--- stderr_tail ---", flush=True)
        print((py.get("stderr_tail") or "")[-800:], flush=True)
    return 0 if out.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
