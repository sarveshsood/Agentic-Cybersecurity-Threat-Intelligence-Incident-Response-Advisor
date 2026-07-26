"""
Shared fixtures for ACTIRA framework suites under tests/.

Design:
  - Offline by default (no live LLM / TI / Mongo).
  - Integration fixtures activate only when ACTIRA_INTEGRATION=1.
  - Puts backend/ on sys.path so imports match production modules.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, Generator, List
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
DATA = Path(__file__).resolve().parent / "data"

if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

# Deterministic test environment (before most backend imports)
os.environ.setdefault("ENV", "test")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-not-for-production-use-32b")
os.environ.setdefault("DB_NAME", "soc_console_test")
os.environ.setdefault("MONGO_URL", os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017"))
os.environ.setdefault("FORCE_MOCK_TI", "true")
os.environ.setdefault("ACTIRA_EMBEDDING_BACKEND", "hash")


# ---------------------------------------------------------------------------
# Session / env
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def repo_root() -> Path:
    return ROOT


@pytest.fixture(scope="session")
def backend_root() -> Path:
    return BACKEND


@pytest.fixture(scope="session")
def test_data_dir() -> Path:
    return DATA


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    """Ensure each test starts with mock-friendly TI/LLM defaults."""
    monkeypatch.setenv("ENV", "test")
    monkeypatch.setenv("FORCE_MOCK_TI", "true")
    monkeypatch.setenv("ACTIRA_EMBEDDING_BACKEND", "hash")
    yield


def pytest_configure(config: pytest.Config) -> None:
    # Quiet noisy plugins when not installed
    config.addinivalue_line("markers", "unit: offline unit")


def pytest_collection_modifyitems(config: pytest.Config, items: List[pytest.Item]) -> None:
    """Auto-skip integration/e2e/mongo unless env flags are set."""
    run_int = os.environ.get("ACTIRA_INTEGRATION", "").lower() in ("1", "true", "yes")
    run_e2e = os.environ.get("ACTIRA_E2E", "").lower() in ("1", "true", "yes")
    run_llm = os.environ.get("ACTIRA_LIVE_LLM", "").lower() in ("1", "true", "yes")
    for item in items:
        marks = {m.name for m in item.iter_markers()}
        if "integration" in marks or "requires_mongo" in marks:
            if not run_int:
                item.add_marker(pytest.mark.skip(reason="Set ACTIRA_INTEGRATION=1 (+ Mongo) to run"))
        if "e2e" in marks:
            if not run_e2e:
                item.add_marker(pytest.mark.skip(reason="Set ACTIRA_E2E=1 and start stack for e2e"))
        if "requires_llm" in marks and not run_llm:
            item.add_marker(pytest.mark.skip(reason="Set ACTIRA_LIVE_LLM=1 for live LLM tests"))


# ---------------------------------------------------------------------------
# Auth / JWT
# ---------------------------------------------------------------------------

@pytest.fixture
def jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


@pytest.fixture
def fake_users() -> List[Dict[str, Any]]:
    return [
        {"id": "u-admin", "email": "admin@soc.example.com", "name": "Admin", "role": "admin"},
        {"id": "u-analyst", "email": "analyst@soc.example.com", "name": "Analyst", "role": "analyst"},
        {
            "id": "u-reviewer",
            "email": "reviewer@soc.example.com",
            "name": "Reviewer",
            "role": "senior_reviewer",
        },
    ]


@pytest.fixture
def sample_password() -> str:
    return "SecurePass123!"


@pytest.fixture
def make_jwt(jwt_secret: str):
    """Factory: make_jwt(sub, role, exp_delta_s=3600) -> token string."""
    import time
    import jwt as pyjwt

    def _make(sub: str = "u-analyst", role: str = "analyst", exp_delta_s: int = 3600) -> str:
        now = int(time.time())
        payload = {
            "sub": sub,
            "role": role,
            "iat": now,
            "exp": now + exp_delta_s,
        }
        return pyjwt.encode(payload, jwt_secret, algorithm="HS256")

    return _make


# ---------------------------------------------------------------------------
# Domain samples
# ---------------------------------------------------------------------------

@pytest.fixture
def sample_iocs() -> List[Dict[str, Any]]:
    return [
        {"type": "ip", "value": "203.0.113.50", "threat_score": 80},
        {"type": "domain", "value": "evil.example.com", "threat_score": 70},
        {"type": "hash", "value": "d41d8cd98f00b204e9800998ecf8427e", "threat_score": 10},
        {"type": "email", "value": "phish@evil.example.com", "threat_score": 40},
        {"type": "url", "value": "https://evil.example.com/payload", "threat_score": 75},
    ]


@pytest.fixture
def sample_incident(sample_iocs: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "id": "inc-test-001",
        "title": "Suspicious SSH brute force from 203.0.113.50",
        "summary": "Multiple failed SSH attempts against bastion hosts.",
        "severity": "high",
        "status": "pending_review",
        "threat_score": 78,
        "iocs": sample_iocs,
        "techniques": [
            {"technique_id": "T1110", "name": "Brute Force", "tactic": "Credential Access"},
            {"technique_id": "T1021.004", "name": "SSH", "tactic": "Lateral Movement"},
        ],
        "playbook": {
            "grounding_score": 0.62,
            "steps": [
                {"order": 1, "phase": "detect", "action": "Review auth logs", "citations": ["KB-1"]},
                {"order": 2, "phase": "contain", "action": "Block source IP", "citations": []},
            ],
        },
        "created_at": "2026-07-01T12:00:00Z",
    }


@pytest.fixture
def sample_settings() -> Dict[str, Any]:
    return {
        "llm_provider": "anthropic",
        "llm_model": "claude-sonnet-4-6",
        "llm_temperature": 0.15,
        "grounding_threshold": 0.75,
        "hitl_severity_min": "high",
        "auto_approve_grounding_min": 0.92,
        "correlation_window_minutes": 45,
        "session_timeout_hours": 8,
        "failed_login_lockout": 5,
        "incident_retention_days": 180,
        "enrichment_cache_ttl_hours": 12,
        "cohere_rerank_enabled": True,
        "email_alerts_to": "",
    }


@pytest.fixture
def apache_log_path(test_data_dir: Path) -> Path:
    return test_data_dir / "logs" / "apache_access.log"


@pytest.fixture
def syslog_path(test_data_dir: Path) -> Path:
    return test_data_dir / "logs" / "syslog_auth.log"


@pytest.fixture
def empty_log_path(test_data_dir: Path) -> Path:
    return test_data_dir / "edge" / "empty.log"


@pytest.fixture
def malformed_json_path(test_data_dir: Path) -> Path:
    return test_data_dir / "edge" / "malformed.json"


@pytest.fixture
def zip_sample_path(test_data_dir: Path) -> Path:
    return test_data_dir / "packages" / "multi_source.zip"


# ---------------------------------------------------------------------------
# Mocks — LLM / TI / Mongo
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_llm_response() -> Dict[str, Any]:
    return {
        "steps": [
            {
                "order": 1,
                "phase": "detect",
                "action": "Confirm IoCs in SIEM",
                "citations": ["MITRE-T1110"],
            },
            {
                "order": 2,
                "phase": "contain",
                "action": "Block IP at perimeter",
                "citations": ["NIST-800-61"],
            },
        ],
        "summary": "Mock playbook for offline tests",
    }


@pytest.fixture
def mock_llm(mocker, mock_llm_response: Dict[str, Any]):
    """Patch llm_provider complete helpers when module is importable."""
    try:
        mod = mocker.patch("llm_provider.complete_json", return_value=mock_llm_response)
        return mod
    except Exception:
        m = MagicMock(return_value=mock_llm_response)
        return m


@pytest.fixture
def mock_ti_enrich():
    """Return a pure function that marks IoCs as mock-enriched."""

    def _enrich(ioc: Dict[str, Any], **_kw: Any) -> Dict[str, Any]:
        out = dict(ioc)
        out.setdefault("threat_score", 42)
        out["sources"] = ["mock"]
        out["enriched"] = True
        return out

    return _enrich


@pytest.fixture
def mock_mongo_db():
    """In-memory async-ish Mongo stand-in for unit tests."""
    store: Dict[str, List[Dict[str, Any]]] = {
        "users": [],
        "incidents": [],
        "settings": [],
        "log_jobs": [],
    }

    class Coll:
        def __init__(self, name: str):
            self.name = name

        async def find_one(self, q: Dict[str, Any] | None = None, **_):
            q = q or {}
            for doc in store[self.name]:
                if all(doc.get(k) == v for k, v in q.items()):
                    return doc
            return None

        async def insert_one(self, doc: Dict[str, Any]):
            store[self.name].append(dict(doc))
            return MagicMock(inserted_id=doc.get("id") or doc.get("_id"))

        def find(self, q: Dict[str, Any] | None = None):
            q = q or {}

            class Cursor:
                def __init__(self, docs):
                    self._docs = docs

                def sort(self, *_a, **_k):
                    return self

                def limit(self, n: int):
                    self._docs = self._docs[:n]
                    return self

                async def to_list(self, n: int = 1000):
                    return list(self._docs)[:n]

            docs = [
                d
                for d in store[self.name]
                if all(d.get(k) == v for k, v in q.items())
            ]
            return Cursor(docs)

        async def update_one(self, q, update, **_):
            doc = await self.find_one(q)
            if not doc:
                return MagicMock(matched_count=0)
            if "$set" in update:
                doc.update(update["$set"])
            return MagicMock(matched_count=1)

        async def delete_many(self, q=None):
            store[self.name].clear()
            return MagicMock(deleted_count=1)

    class DB:
        def __getattr__(self, name: str):
            if name not in store:
                store[name] = []
            return Coll(name)

    return DB()


@pytest.fixture
def cleanup_tmp(tmp_path: Path) -> Generator[Path, None, None]:
    yield tmp_path
    # tmp_path auto-cleaned by pytest
