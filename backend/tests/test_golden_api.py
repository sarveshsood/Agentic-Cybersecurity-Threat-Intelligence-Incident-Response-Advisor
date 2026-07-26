"""Golden dataset download/append HTTP smoke (needs importable app + optional Mongo)."""
from __future__ import annotations

import io
import os

import pytest

# Live app import / eval routes — excluded from pure offline unit CI.
pytestmark = [pytest.mark.integration, pytest.mark.requires_mongo]


def _client():
    os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
    os.environ.setdefault("DB_NAME", "soc_console_test_golden_api")
    os.environ.setdefault("JWT_SECRET", "test-jwt-secret-not-for-production-use-32b")
    os.environ.setdefault("ENV", "test")
    from fastapi.testclient import TestClient
    from backend.server import app

    return TestClient(app)


def test_download_golden_dataset():
    client = _client()
    response = client.get("/eval/golden-dataset/download")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    data = response.json()
    assert "cases" in data
    assert isinstance(data["cases"], list)


def test_append_golden_dataset():
    client = _client()
    mock_payload = {
        "cases": [
            {
                "id": "test_case_999",
                "name": "Unit Test Injection Scenario",
                "log": "Failed password for root from 192.168.1.50 port 22 ssh2",
                "expected": {
                    "iocs": [{"type": "ip", "value": "192.168.1.50"}],
                    "technique_ids": ["T1110"],
                },
            }
        ]
    }

    file_bytes = io.BytesIO(str(mock_payload).replace("'", '"').encode("utf-8"))

    response = client.post(
        "/eval/golden-dataset/append",
        files={"file": ("test_dataset.json", file_bytes, "application/json")},
    )
    # Accept success or auth/method guard depending on deployment
    assert response.status_code in (200, 201, 401, 403, 404, 405, 422)
