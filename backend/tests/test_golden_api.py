import io

from fastapi.testclient import TestClient

from backend.server import app

client = TestClient(app)


def test_download_golden_dataset():
    response = client.get("/eval/golden-dataset/download")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/json"
    data = response.json()
    assert "cases" in data
    assert isinstance(data["cases"], list)


def test_append_golden_dataset():
    # Construct a sample mock fixture payload to append
    mock_payload = {
        "cases": [
            {
                "id": "test_case_999",
                "name": "Unit Test Injection Scenario",
                "log": "Failed password for root from 192.168.1.50 port 22 ssh2",
                "expected": {
                    "iocs": [{"type": "ip", "value": "192.168.1.50"}],
                    "technique_ids": ["T1110"]
                }
            }
        ]
    }

    file_bytes = io.BytesIO(str(mock_payload).replace("'", '"').encode("utf-8"))

    response = client.post(
        "/eval/golden-dataset/append",
        files={"file": ("test_dataset.json", file_bytes, "application/json")}
    )

    assert response.status_code == 200
    res_json = response.json()
    assert res_json["status"] == "success"
    assert "total_cases" in res_json
