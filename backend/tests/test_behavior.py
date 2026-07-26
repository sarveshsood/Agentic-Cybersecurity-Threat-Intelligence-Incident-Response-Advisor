"""Behavioral analytics unit tests (offline)."""
from __future__ import annotations

import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_login_burst():
    from backend.behavior import analyze_behavior

    base = datetime(2024, 1, 1, 12, 0, tzinfo=timezone.utc)
    rows = [
        {
            "timestamp": (base + timedelta(seconds=i * 3)).isoformat(),
            "event_type": "failed_login",
            "username": "admin",
            "hostname": "ssh01",
            "severity": "medium",
        }
        for i in range(12)
    ]
    out = analyze_behavior(
        {"id": "x", "severity": "high", "correlation": {"timeline": rows, "correlations": []}}
    )
    ids = {s["id"] for s in out["signals"]}
    assert "login_burst" in ids
    assert out["risk"] in ("medium", "high", "critical")


def test_beaconing_regular_interval():
    from backend.behavior import analyze_behavior

    base = datetime(2024, 6, 1, 10, 0, tzinfo=timezone.utc)
    rows = [
        {
            "timestamp": (base + timedelta(seconds=i * 300)).isoformat(),
            "dest_ip": "203.0.113.9",
            "event_type": "connect",
            "severity": "info",
        }
        for i in range(8)
    ]
    out = analyze_behavior({"id": "b", "correlation": {"timeline": rows, "correlations": []}})
    assert any(s["id"] == "beaconing" for s in out["signals"])


def test_lolbin_detection():
    from backend.behavior import analyze_behavior

    rows = [
        {
            "timestamp": "2024-01-01T00:00:00+00:00",
            "process": "certutil.exe",
            "command_line": "certutil -urlcache",
            "event_type": "process_create",
        }
    ]
    out = analyze_behavior({"id": "l", "title": "susp", "correlation": {"timeline": rows}})
    assert any(s["id"] == "lolbins" for s in out["signals"])


def test_empty_timeline_low_risk():
    from backend.behavior import analyze_behavior

    out = analyze_behavior({"id": "e", "correlation": {}})
    assert out["stats"]["signal_count"] == 0
    assert out["risk"] == "low"


def test_batch_hotspots():
    from backend.behavior import analyze_behavior_batch

    base = datetime(2024, 1, 1, tzinfo=timezone.utc)
    noisy = {
        "id": "n1",
        "title": "Noisy",
        "severity": "high",
        "correlation": {
            "timeline": [
                {
                    "timestamp": (base + timedelta(seconds=i)).isoformat(),
                    "event_type": "failed_login",
                    "username": "root",
                    "hostname": "h1",
                    "severity": "high",
                }
                for i in range(20)
            ]
        },
    }
    quiet = {"id": "q1", "title": "Quiet", "correlation": {"timeline": []}}
    out = analyze_behavior_batch([quiet, noisy], limit=10)
    assert out["total_flagged"] >= 1
    assert out["items"][0]["id"] == "n1"


def test_behavior_routes_registered():
    from backend.routers import hunt as hr

    paths = {getattr(r, "path", None) for r in hr.router.routes}
    assert "/hunt/behavior" in paths
    assert "/incidents/{incident_id}/behavior" in paths
