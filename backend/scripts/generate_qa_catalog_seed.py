"""Generate ``backend/data/qa_catalog_seed_v1.json`` from capstone Appendix A.

Parses both full 8-column tables and shorter suite tables (SEC / E2E / PERF),
plus resilience IDs referenced in the traceability matrix.

Usage (repo root)::

    python backend/scripts/generate_qa_catalog_seed.py
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
APPENDIX = REPO / "docs" / "capstone" / "appendices" / "A_test_case_catalog.md"
OUT = REPO / "backend" / "data" / "qa_catalog_seed_v1.json"

# Priority → severity for seed
_SEV = {"P0": "high", "P1": "medium", "P2": "low", "P3": "low"}


def _map_module(tc_id: str, type_cell: str, raw_module: str) -> str:
    from backend.qa.module_map import map_catalog_module_raw, map_tc_id

    m = map_tc_id(tc_id, type_cell)
    if m != "Unmapped":
        return m
    m2 = map_catalog_module_raw(raw_module)
    if m2 != "Unmapped":
        return m2
    t = (type_cell or "").lower()
    if "security" in t:
        return "Security"
    if "perf" in t:
        return "Performance"
    if "ui" in t or "e2e" in t:
        return "Frontend"
    if "api" in t:
        return "API"
    if "ops" in t:
        return "DevOps"
    if "ai" in t or "rag" in t:
        return "AI"
    return "Unmapped"


def _automation(raw: str) -> tuple[str, str, str]:
    r = (raw or "Manual").strip()
    low = r.lower()
    if "playwright" in low or "e2e" in low:
        auto = "auto" if "auto" in low else "manual"
        return auto, r, "e2e_manual"
    if low.startswith("auto") or low == "auto ci" or "pytest" in low:
        return "auto", r, "api_smoke" if "ci" not in low else "api_smoke"
    if "semi" in low:
        return "semi", r, "manual"
    if "manual" in low:
        return "manual", r, "manual"
    if "workflow" in low or "theme" in low or "smoke" in low:
        return "auto", r, "e2e_manual"
    return "manual", r, "manual"


# Cases executed by offline IR golden suite (mirrors prior curated seed)
_GOLDEN_IDS = frozenset(
    {
        "TC-PAR-001",
        "TC-PAR-002",
        "TC-PAR-003",
        "TC-ATK-001",
        "TC-ATK-004",
        "TC-AI-002",
        "TC-AI-003",
        "TC-AI-004",
        "TC-AI-006",
        "TC-AI-008",
        "TC-AI-009",
        "TC-RAG-001",
        "TC-RAG-002",
        "TC-RAG-003",
        "TC-GOLD-001",
        # TC-GOLD-002 is UI (/benchmark) — Playwright, not offline IR suite
        "TC-RES-001",
    }
)


def _case(
    *,
    cid: str,
    title: str,
    steps: str,
    expected: str,
    priority: str,
    type_cell: str,
    automation_raw: str,
    module_raw: str,
) -> dict:
    automation, auto_raw, runner = _automation(automation_raw)
    if cid in _GOLDEN_IDS:
        runner = "golden"
    if cid == "TC-GOLD-002":
        # UI /benchmark page — executed by Playwright qa-catalog.spec.js
        automation = "auto"
        runner = "e2e_manual"
        auto_raw = "Playwright qa-catalog"
    module = _map_module(cid, type_cell, module_raw)
    pri = (priority or "P2").strip().upper()
    if pri not in _SEV:
        pri = "P2"
    return {
        "id": cid,
        "title": title.strip(),
        "module": module,
        "feature": (type_cell or module).strip() or module,
        "category": (type_cell or module).strip() or module,
        "priority": pri,
        "severity": _SEV[pri],
        "type": (type_cell or "Functional").strip(),
        "automation": automation,
        "automation_raw": auto_raw,
        "runner": runner,
        "owner": None,
        "status": "not_run",
        "last_run_at": None,
        "last_run_id": None,
        "linked_bug": None,
        "requirement_ids": [],
        "description": (steps or "").strip(),
        "expected": (expected or "").strip(),
        "actual_last": None,
        "evidence": [],
        "source": "capstone_seed_json",
        "catalog_module_raw": (module_raw or "").strip(),
        "org_id": None,
    }


def parse_appendix(text: str) -> dict[str, dict]:
    by_id: dict[str, dict] = {}

    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("| TC-"):
            continue
        parts = [p.strip() for p in line.strip("|").split("|")]
        if not parts or not parts[0].startswith("TC-"):
            continue
        cid = parts[0]

        # Full 8-col: ID Title Steps Expected Priority Type Automation Module
        if len(parts) >= 8:
            by_id[cid] = _case(
                cid=cid,
                title=parts[1],
                steps=parts[2],
                expected=parts[3],
                priority=parts[4],
                type_cell=parts[5],
                automation_raw=parts[6],
                module_raw=parts[7],
            )
            continue

        # SEC table: ID Title Expected Priority Automation
        if len(parts) >= 5 and cid.startswith("TC-SEC-"):
            by_id[cid] = _case(
                cid=cid,
                title=parts[1],
                steps=parts[1],
                expected=parts[2],
                priority=parts[3],
                type_cell="Security",
                automation_raw=parts[4],
                module_raw="security suite",
            )
            continue

        # E2E: ID Flow Expected Automation
        if len(parts) >= 4 and cid.startswith("TC-E2E-"):
            by_id[cid] = _case(
                cid=cid,
                title=parts[1],
                steps=parts[1],
                expected=parts[2],
                priority="P0",
                type_cell="UI",
                automation_raw=parts[3],
                module_raw="e2e smoke",
            )
            continue

        # PERF: ID Title Expected Priority
        if len(parts) >= 4 and cid.startswith("TC-PERF-"):
            by_id[cid] = _case(
                cid=cid,
                title=parts[1],
                steps=parts[1],
                expected=parts[2],
                priority=parts[3],
                type_cell="Performance",
                automation_raw="Manual" if "benchmark" not in parts[1].lower() else "Semi",
                module_raw="performance harness",
            )
            continue

    # Traceability-only resilience id
    if "TC-RES-001" not in by_id:
        by_id["TC-RES-001"] = _case(
            cid="TC-RES-001",
            title="Fallbacks / resilience path",
            steps="Clear LLM keys or force provider fail; run pipeline / investigate",
            expected="Template/fallback path used; HiTL or safe degrade; no crash",
            priority="P0",
            type_cell="AI",
            automation_raw="Auto",
            module_raw="resilience golden",
        )

    return by_id


def main() -> None:
    text = APPENDIX.read_text(encoding="utf-8")
    by_id = parse_appendix(text)
    # Stable sort by id
    cases = [by_id[k] for k in sorted(by_id.keys())]
    payload = {
        "version": "qa_catalog_seed_v1",
        "generated_from": "docs/capstone/appendices/A_test_case_catalog.md",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "count": len(cases),
        "areas": sorted({c["module"] for c in cases}),
        "cases": cases,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {OUT} count={len(cases)} modules={payload['areas']}")


if __name__ == "__main__":
    main()
