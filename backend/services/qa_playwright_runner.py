"""Run Playwright catalog suite and map results → TC-* status.

Invoked from ``qa_catalog_service.run_usecases`` for UI / E2E use cases.
Requires frontend deps + Chromium and a live SPA (PLAYWRIGHT_BASE_URL).

Env:
  QA_PLAYWRIGHT=0          force disable (default: auto if frontend/ present)
  QA_PLAYWRIGHT=1          force enable
  PLAYWRIGHT_BASE_URL      default http://127.0.0.1:3000
  REACT_APP_BACKEND_URL    passed through for FE (default http://127.0.0.1:8001)
  QA_PLAYWRIGHT_TIMEOUT_S  default 240
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("actira")

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND = REPO_ROOT / "frontend"
SPEC = FRONTEND / "e2e" / "qa-catalog.spec.js"
TC_RE = re.compile(r"(TC-[A-Z0-9]+-\d+)")

# Catalog IDs this suite is intended to cover (titles in qa-catalog.spec.js)
PLAYWRIGHT_TC_IDS: Set[str] = {
    "TC-E2E-001",
    "TC-E2E-002",
    "TC-E2E-003",
    "TC-E2E-004",
    "TC-E2E-005",
    "TC-E2E-006",
    "TC-E2E-007",
    "TC-DASH-001",
    "TC-GOLD-002",
    "TC-AN-001",
    "TC-WS-001",
    "TC-SET-001",
}


def playwright_enabled() -> bool:
    flag = (os.getenv("QA_PLAYWRIGHT") or "").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return False
    if flag in ("1", "true", "yes", "on"):
        return True
    # Auto: frontend tree + spec present
    return SPEC.is_file() and (FRONTEND / "package.json").is_file()


def is_playwright_case(case: dict) -> bool:
    cid = case.get("id") or ""
    if cid in PLAYWRIGHT_TC_IDS:
        return True
    if cid.startswith("TC-E2E-"):
        return True
    runner = (case.get("runner") or "").lower()
    if runner == "e2e_manual" and (case.get("automation") or "").lower() in ("auto", "semi", "manual"):
        # Only if we have a mapped test; unmapped e2e stay for smoke/manual path
        return cid in PLAYWRIGHT_TC_IDS
    return False


def _npx_cmd() -> List[str]:
    npx = shutil.which("npx") or shutil.which("npx.cmd")
    if not npx:
        raise FileNotFoundError("npx not found on PATH — install Node.js to run Playwright E2E")
    return [npx, "playwright", "test"]


def _walk_specs(node: dict, out: List[dict]) -> None:
    """Flatten Playwright JSON reporter tree into {title, status, error} rows."""
    if not isinstance(node, dict):
        return
    for spec in node.get("specs") or []:
        title = spec.get("title") or ""
        tests = spec.get("tests") or []
        status = "skipped"
        err = ""
        for t in tests:
            results = t.get("results") or []
            for r in results:
                st = (r.get("status") or "").lower()
                if st == "passed":
                    status = "pass"
                elif st in ("failed", "timedout", "interrupted"):
                    status = "fail"
                    err = (r.get("error") or {}).get("message") or err or st
                elif st == "skipped" and status not in ("pass", "fail"):
                    status = "skipped"
        out.append({"title": title, "status": status, "error": err})
    for suite in node.get("suites") or []:
        _walk_specs(suite, out)


def parse_playwright_json(report: dict) -> Dict[str, Dict[str, str]]:
    """Map TC-id → {status, title, error}."""
    rows: List[dict] = []
    for suite in report.get("suites") or []:
        _walk_specs(suite, rows)
    # Also handle flat tests array if present
    for t in report.get("tests") or []:
        title = t.get("title") or ""
        st = (t.get("status") or t.get("outcome") or "").lower()
        if st == "expected":
            st = "pass"
        elif st in ("unexpected", "flaky"):
            st = "fail" if st == "unexpected" else "pass"
        rows.append({"title": title, "status": st if st in ("pass", "fail", "skipped") else "fail", "error": ""})

    by_tc: Dict[str, Dict[str, str]] = {}
    for row in rows:
        title = row.get("title") or ""
        m = TC_RE.search(title)
        if not m:
            continue
        cid = m.group(1)
        st = row.get("status") or "fail"
        if st not in ("pass", "fail", "skipped", "blocked"):
            st = "fail"
        # Prefer fail over pass if re-run
        prev = by_tc.get(cid)
        if prev and prev.get("status") == "fail":
            continue
        by_tc[cid] = {
            "status": st,
            "title": title,
            "error": (row.get("error") or "")[:500],
        }
    return by_tc


def run_playwright_catalog(
    *,
    base_url: Optional[str] = None,
    timeout_s: Optional[int] = None,
) -> Dict[str, Any]:
    """Execute qa-catalog.spec.js; return mapped TC results + meta."""
    if not playwright_enabled():
        return {
            "ran": False,
            "ok": False,
            "reason": "Playwright disabled (QA_PLAYWRIGHT=0 or frontend/e2e/qa-catalog.spec.js missing)",
            "by_tc": {},
        }
    if not SPEC.is_file():
        return {
            "ran": False,
            "ok": False,
            "reason": f"Spec missing: {SPEC}",
            "by_tc": {},
        }

    base = (base_url or os.getenv("PLAYWRIGHT_BASE_URL") or "http://127.0.0.1:3000").rstrip("/")
    timeout_s = int(timeout_s or os.getenv("QA_PLAYWRIGHT_TIMEOUT_S") or 240)
    backend = (os.getenv("REACT_APP_BACKEND_URL") or "http://127.0.0.1:8001").rstrip("/")

    with tempfile.TemporaryDirectory(prefix="qa-pw-") as tmp:
        report_path = Path(tmp) / "pw-report.json"
        cmd = _npx_cmd() + [
            "e2e/qa-catalog.spec.js",
            "--reporter=json",
            "--workers=1",
        ]
        # Playwright writes JSON reporter to stdout when --reporter=json
        env = os.environ.copy()
        env["PLAYWRIGHT_BASE_URL"] = base
        env["REACT_APP_BACKEND_URL"] = backend
        env["CI"] = env.get("CI") or "1"

        logger.info("playwright catalog start base=%s cmd=%s", base, " ".join(cmd))
        try:
            proc = subprocess.run(
                cmd,
                cwd=str(FRONTEND),
                env=env,
                capture_output=True,
                text=True,
                timeout=timeout_s,
                check=False,
            )
        except subprocess.TimeoutExpired as e:
            return {
                "ran": True,
                "ok": False,
                "reason": f"Playwright timed out after {timeout_s}s",
                "by_tc": {},
                "exit_code": -1,
                "stdout_tail": (e.stdout or "")[-1500:] if isinstance(e.stdout, str) else "",
            }
        except FileNotFoundError as e:
            return {
                "ran": False,
                "ok": False,
                "reason": str(e),
                "by_tc": {},
            }

        raw = proc.stdout or ""
        # JSON reporter dumps full JSON to stdout; may have leading noise
        report: dict = {}
        try:
            report = json.loads(raw)
        except json.JSONDecodeError:
            # try last JSON object in output
            start = raw.find("{")
            end = raw.rfind("}")
            if start >= 0 and end > start:
                try:
                    report = json.loads(raw[start : end + 1])
                except json.JSONDecodeError:
                    report = {}
            if not report:
                # write for debug
                try:
                    report_path.write_text(raw[:200_000], encoding="utf-8")
                except Exception:
                    pass
                return {
                    "ran": True,
                    "ok": False,
                    "reason": "Could not parse Playwright JSON report (is Chromium installed? npx playwright install chromium)",
                    "by_tc": {},
                    "exit_code": proc.returncode,
                    "stderr_tail": (proc.stderr or "")[-1500:],
                    "stdout_tail": raw[-1500:],
                }

        by_tc = parse_playwright_json(report)
        return {
            "ran": True,
            "ok": proc.returncode == 0 or bool(by_tc),
            "exit_code": proc.returncode,
            "base_url": base,
            "by_tc": by_tc,
            "test_count": len(by_tc),
            "stderr_tail": (proc.stderr or "")[-800:],
            "reason": None if by_tc else "No TC-* titles found in Playwright report",
        }


def apply_playwright_to_cases(
    cases: List[dict],
    pw: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Build per-case result dicts for Playwright-eligible cases in ``cases``."""
    by_tc = pw.get("by_tc") or {}
    out: List[Dict[str, Any]] = []
    for c in cases:
        if not is_playwright_case(c):
            continue
        cid = c["id"]
        hit = by_tc.get(cid)
        if not pw.get("ran"):
            out.append(
                {
                    "id": cid,
                    "title": c.get("title"),
                    "runner": "e2e_playwright",
                    "status": "blocked",
                    "kind": "playwright",
                    "actual": pw.get("reason") or "Playwright not run",
                }
            )
            continue
        if not hit:
            # Suite ran but no test for this id
            out.append(
                {
                    "id": cid,
                    "title": c.get("title"),
                    "runner": "e2e_playwright",
                    "status": "blocked",
                    "kind": "playwright",
                    "actual": f"No Playwright test mapped for {cid} in qa-catalog.spec.js",
                }
            )
            continue
        st = hit.get("status") or "fail"
        if st == "skipped":
            st = "blocked"
        actual = f"playwright title={hit.get('title')} status={hit.get('status')}"
        if hit.get("error"):
            actual += f" error={hit['error'][:300]}"
        if pw.get("base_url"):
            actual += f" base={pw['base_url']}"
        out.append(
            {
                "id": cid,
                "title": c.get("title"),
                "runner": "e2e_playwright",
                "status": st if st in ("pass", "fail", "blocked") else "fail",
                "kind": "playwright",
                "actual": actual,
            }
        )
    return out
