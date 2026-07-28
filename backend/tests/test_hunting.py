"""NL threat hunting unit tests (offline)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def _inc(**kwargs):
    base = {
        "id": "i1",
        "title": "SSH brute force",
        "summary": "Multiple failed logins",
        "severity": "high",
        "status": "new",
        "threat_score": 70,
        "iocs": [{"type": "ip", "value": "1.2.3.4"}],
        "techniques": [{"technique_id": "T1110", "name": "Brute Force"}],
        "correlation": {"attack_chain": [], "correlations": []},
    }
    base.update(kwargs)
    return base


def test_parse_powershell_intent():
    from backend.hunting import parse_hunt_query

    intent = parse_hunt_query("Find all suspicious PowerShell encoded commands")
    assert "powershell" in intent.intent_id
    assert any("powershell" in k for k in intent.keywords)


def test_parse_lateral_movement():
    from backend.hunting import parse_hunt_query

    intent = parse_hunt_query("Show lateral movement")
    assert "lateral" in intent.intent_id


def test_hunt_ranks_matching_incident():
    from backend.hunting import hunt_incidents

    ps = _inc(
        id="ps1",
        title="Malicious PowerShell",
        summary="Encoded PowerShell -enc base64 payload",
        techniques=[{"technique_id": "T1059.001", "name": "PowerShell"}],
    )
    other = _inc(id="other", title="Benign", summary="routine patch", techniques=[], severity="low")
    out = hunt_incidents([other, ps], "Find suspicious PowerShell", limit=10)
    assert out["total_matches"] >= 1
    assert out["hits"][0]["id"] == "ps1"
    assert out["hits"][0]["score"] > 0
    assert out["intent"]["id"]


def test_hunt_ransomware_and_persistence():
    from backend.hunting import hunt_incidents

    r = _inc(
        id="r1",
        title="Ransomware",
        summary="files encrypted lockbit note",
        techniques=[{"technique_id": "T1486", "name": "Data Encrypted"}],
    )
    p = _inc(
        id="p1",
        title="Persistence",
        summary="scheduled task run key startup",
        techniques=[{"technique_id": "T1053", "name": "Scheduled Task"}],
    )
    out = hunt_incidents([r, p], "Find ransomware indicators")
    assert any(h["id"] == "r1" for h in out["hits"])
    out2 = hunt_incidents([r, p], "Find persistence")
    assert any(h["id"] == "p1" for h in out2["hits"])


def test_severity_min_filter():
    from backend.hunting import hunt_incidents

    low = _inc(id="l", severity="low", title="powershell low", summary="powershell")
    high = _inc(id="h", severity="high", title="powershell high", summary="powershell")
    out = hunt_incidents([low, high], "high severity powershell")
    ids = {h["id"] for h in out["hits"]}
    assert "h" in ids
    assert "l" not in ids


def test_hunt_routes_registered():
    from backend.routers import hunt as hr
    from backend.routers import ALL_DOMAIN_ROUTERS

    assert hr in ALL_DOMAIN_ROUTERS
    paths = {getattr(r, "path", None) for r in hr.router.routes}
    assert "/hunt" in paths
    assert "/hunt/suggestions" in paths or any(
        p and "suggestions" in str(p) for p in paths
    )


@pytest.mark.asyncio
async def test_run_hunt_honesty_and_filters(monkeypatch):
    """Service smoke: pool honesty fields + severity/status passed to repo."""
    from backend.services import hunt_service as hs

    captured = {}

    async def fake_list_filtered(**kwargs):
        captured.update(kwargs)
        return [
            _inc(id="ps1", title="PowerShell abuse", summary="powershell -enc", severity="high", status="new"),
            _inc(id="other", title="Benign", summary="patch", severity="low", status="closed"),
        ]

    monkeypatch.setattr(hs.incidents_repo, "list_filtered", fake_list_filtered)
    out = await hs.run_hunt("PowerShell", limit=10, severity="high", status="new")
    assert isinstance(out, dict)
    assert out.get("pool_limit") == 500
    assert out.get("pool_filters", {}).get("severity") == "high"
    assert out.get("pool_filters", {}).get("status") == "new"
    assert "SIEM" in (out.get("honesty") or "") or "500" in (out.get("honesty") or "")
    assert captured.get("severity") == "high"
    assert captured.get("status") == "new"
    assert captured.get("limit") == 500


@pytest.mark.asyncio
async def test_run_hunt_requires_query():
    from backend.services import hunt_service as hs
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as ei:
        await hs.run_hunt("  ", limit=5)
    assert ei.value.status_code == 400
