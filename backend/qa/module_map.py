"""Versioned health-module mapping (qa_module_map_v1).

Normative rules: ``docs/product/TESTING_HEALTH_CENTER_DESIGN.md`` Appendix C.
Unmapped results are excluded from quality score weight renormalization.
"""
from __future__ import annotations

import re
from typing import Optional

MODULE_MAP_VERSION = "qa_module_map_v1"

HEALTH_MODULES = frozenset(
    {
        "Backend",
        "Frontend",
        "API",
        "AI",
        "Security",
        "Performance",
        "UX",
        "Database",
        "DevOps",
        "Documentation",
        "Unmapped",
    }
)

# Prior weights for overall Q (exclude Unmapped when scoring)
MODULE_WEIGHTS = {
    "Backend": 0.18,
    "Frontend": 0.12,
    "API": 0.12,
    "AI": 0.15,
    "Security": 0.15,
    "Performance": 0.08,
    "UX": 0.05,
    "Database": 0.05,
    "DevOps": 0.05,
    "Documentation": 0.05,
}

# C.1 TC prefix → module (first match on uppercased id)
_TC_PREFIX_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^TC-AUTH-", re.I), "Security"),
    (re.compile(r"^TC-SEC-", re.I), "Security"),
    (re.compile(r"^TC-ING-", re.I), "Backend"),
    (re.compile(r"^TC-PAR-", re.I), "Backend"),
    (re.compile(r"^TC-TI-", re.I), "AI"),
    (re.compile(r"^TC-ATK-", re.I), "AI"),
    (re.compile(r"^TC-AI-", re.I), "AI"),
    (re.compile(r"^TC-RAG-", re.I), "AI"),
    (re.compile(r"^TC-GOLD-", re.I), "AI"),
    (re.compile(r"^TC-HITL-", re.I), "Backend"),
    (re.compile(r"^TC-DASH-", re.I), "Frontend"),
    (re.compile(r"^TC-WS-", re.I), "Frontend"),
    (re.compile(r"^TC-AN-", re.I), "Frontend"),
    (re.compile(r"^TC-E2E-", re.I), "Frontend"),
    (re.compile(r"^TC-SET-", re.I), "Frontend"),
    (re.compile(r"^TC-AUD-", re.I), "Documentation"),
    (re.compile(r"^TC-CMP-", re.I), "Documentation"),
    (re.compile(r"^TC-RES-", re.I), "DevOps"),
    (re.compile(r"^TC-OPS-", re.I), "DevOps"),
    (re.compile(r"^TC-PERF-", re.I), "Performance"),
    (re.compile(r"^TC-API-", re.I), "API"),
    (re.compile(r"^TC-HUNT-", re.I), "Backend"),
]

# C.3 free-text catalog Module cell
_CATALOG_RAW: dict[str, str] = {
    "test_hardening": "Security",
    "auth": "Security",
    "rbac": "Security",
    "pipeline": "Backend",
    "parsers": "Backend",
    "ioc_extractor": "Backend",
    "golden": "AI",
    "attack_mapping": "AI",
    "playbook": "AI",
    "e2e smoke": "Frontend",
    "smoke": "Frontend",
    "enrichment": "Backend",
}


def map_tc_id(tc_id: str, catalog_type: Optional[str] = None) -> str:
    """Map catalog test-case id (and optional Type) → health module."""
    tid = (tc_id or "").strip()
    for pat, mod in _TC_PREFIX_RULES:
        if pat.search(tid):
            return mod
    # Type overrides when prefix missing / unknown
    t = (catalog_type or "").strip().lower()
    if t in ("api",):
        return "API"
    if t in ("performance", "perf"):
        return "Performance"
    if t in ("ui", "e2e"):
        return "Frontend"
    if t in ("security",):
        return "Security"
    if t in ("ai", "ai/rag", "rag"):
        return "AI"
    if t in ("functional", "integration"):
        return "Backend"
    return "Unmapped"


def map_catalog_module_raw(raw: Optional[str]) -> str:
    """Map capstone free-text Module cell → health module."""
    if not raw:
        return "Unmapped"
    key = raw.strip().lower()
    if key in _CATALOG_RAW:
        return _CATALOG_RAW[key]
    # loose contains
    for needle, mod in _CATALOG_RAW.items():
        if needle in key:
            return mod
    return "Unmapped"


def map_junit_nodeid(
    nodeid: Optional[str] = None,
    *,
    classname: Optional[str] = None,
    file_path: Optional[str] = None,
) -> str:
    """Map JUnit nodeid / classname / path → health module (first match wins).

    Appendix C.2 rules.
    """
    blob = " ".join(
        p for p in ((nodeid or ""), (classname or ""), (file_path or "")) if p
    ).replace("\\", "/")
    low = blob.lower()

    # 1 Frontend e2e
    if (
        "frontend/e2e/" in low
        or "/e2e/" in low
        or low.startswith("e2e/")
        or ("e2e" in low and "frontend" in low)
        or re.search(r"\be2e\b", low)
        or "playwright" in low
    ):
        return "Frontend"

    # 2 Security
    if (
        "tests/security" in low
        or "test_security" in low
        or "/security/" in low
        or re.search(r"\bsecurity\b", low)
        or "test_hardening" in low
        or "test_rbac" in low
    ):
        return "Security"

    # 3 Performance
    if (
        "tests/performance" in low
        or "benchmarks/" in low
        or re.search(r"\bperformance\b", low)
        or "load_test" in low
    ):
        return "Performance"

    # 4 API
    if "tests/api" in low or re.search(r"\btest_api\b", low) or "/api/test" in low:
        return "API"

    # 5 AI / golden
    if (
        "golden" in low
        or "test_golden" in low
        or "retrieval_eval" in low
        or "attack_mapping" in low
        or "playbook_judge" in low
    ):
        return "AI"

    # 6 Integration → Backend
    if "tests/integration" in low or "test_integration" in low:
        return "Backend"

    # 7 Backend default for python suites
    if (
        "backend/" in low
        or "tests/unit" in low
        or low.startswith("tests.")
        or low.startswith("backend.")
        or "test_" in low
    ):
        return "Backend"

    return "Unmapped"
