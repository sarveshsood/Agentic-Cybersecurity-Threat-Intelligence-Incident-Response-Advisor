"""Unit tests for investigation timeline + entity graph builders (PR-1)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def _sample_incident() -> dict:
    return {
        "id": "inc-1",
        "title": "Sample",
        "iocs": [
            {"type": "ip", "value": "1.2.3.4", "threat_score": 0.9},
            {"type": "domain", "value": "evil.example", "threat_score": 0.7},
        ],
        "techniques": [{"id": "T1110", "name": "Brute Force"}],
        "timeline": [
            {"label": "parsing", "detail": "done", "ts": "2024-01-01T10:00:00+00:00"},
        ],
        "correlation": {
            "attack_chain": [
                {
                    "timestamp": "2024-01-01T12:01:00+00:00",
                    "source_file": "auth.log",
                    "event_type": "failed_login",
                    "severity": "high",
                    "actor": "admin",
                    "target": "web01",
                    "summary": "Failed password for admin",
                },
                {
                    "timestamp": "2024-01-01T12:03:00+00:00",
                    "source_file": "auth.log",
                    "event_type": "success_login",
                    "severity": "medium",
                    "actor": "admin",
                    "target": "web01",
                    "summary": "Accepted password",
                },
            ],
            "timeline": [
                # Overlaps first attack_chain step → should de-dupe
                {
                    "timestamp": "2024-01-01T12:01:00+00:00",
                    "source_file": "auth.log",
                    "event_type": "failed_login",
                    "severity": "high",
                    "username": "admin",
                    "hostname": "web01",
                    "source_ip": "1.2.3.4",
                    "raw": "Failed password for admin",
                },
                {
                    "timestamp": "2024-01-01T12:05:00+00:00",
                    "source_file": "proxy.log",
                    "event_type": "http_connect",
                    "severity": "low",
                    "username": "admin",
                    "hostname": "web01",
                    "domain": "evil.example",
                    "source_ip": "1.2.3.4",
                    "raw": "CONNECT evil.example:443",
                },
                {
                    "timestamp": None,
                    "source_file": "auth.log",
                    "event_type": "unknown",
                    "severity": "info",
                    "username": "svc",
                    "raw": "no ts",
                },
            ],
            "entities": {
                "ips": [{"value": "1.2.3.4", "count": 5}],
                "users": [{"value": "admin", "count": 4}],
                "hosts": [{"value": "web01", "count": 3}],
                "domains": [{"value": "evil.example", "count": 2}],
                "hashes": [],
            },
            "correlations": [
                {
                    "kind": "ip",
                    "value": "1.2.3.4",
                    "event_count": 5,
                    "file_count": 2,
                    "files": ["auth.log", "proxy.log"],
                },
                {
                    "kind": "user",
                    "value": "admin",
                    "event_count": 4,
                    "file_count": 2,
                    "files": ["auth.log", "proxy.log"],
                },
            ],
        },
    }


def test_normalize_workspace_defaults():
    from backend.investigation_views import normalize_workspace

    assert normalize_workspace(None) == {"version": 1, "notes": [], "rca": None}
    assert normalize_workspace({})["notes"] == []
    assert normalize_workspace({"version": "2", "notes": [{"id": "n1"}], "rca": {"narrative": "x"}})[
        "version"
    ] == 2


def test_timeline_attack_chain_and_ces_dedupe():
    from backend.investigation_views import build_investigation_timeline

    out = build_investigation_timeline(_sample_incident(), limit=100)
    assert out["source"] == "correlation"
    kinds = [e["kind"] for e in out["events"]]
    assert "attack_chain" in kinds
    assert out["events"][0]["id"] == "ac:0" or any(e["id"] == "ac:0" for e in out["events"])
    # de-dupe: only one failed_login at 12:01
    failed = [
        e
        for e in out["events"]
        if e.get("label") == "failed_login" and str(e.get("ts", "")).startswith("2024-01-01T12:01")
    ]
    assert len(failed) == 1
    assert failed[0]["kind"] == "attack_chain"
    # CES-only event present
    assert any(e["kind"] == "ces" and e.get("label") == "http_connect" for e in out["events"])
    # null timestamp last among returned
    ts_null = [e for e in out["events"] if e.get("ts") is None]
    if ts_null:
        assert out["events"][-1]["ts"] is None
    assert out["stats"]["returned"] == len(out["events"])
    assert out["stats"]["by_kind"]["attack_chain"] >= 1


def test_timeline_filter_source_file_and_kind():
    from backend.investigation_views import build_investigation_timeline

    out = build_investigation_timeline(
        _sample_incident(), source_file="proxy.log", kind="ces"
    )
    assert all(e.get("source_file") == "proxy.log" for e in out["events"])
    assert all(e.get("kind") == "ces" for e in out["events"])


def test_timeline_pipeline_fallback():
    from backend.investigation_views import build_investigation_timeline

    out = build_investigation_timeline(
        {"timeline": [{"label": "queued", "detail": "start", "ts": "2024-06-01T00:00:00Z"}]}
    )
    assert out["source"] == "pipeline"
    assert out["events"][0]["id"] == "pipe:0"
    assert out["events"][0]["kind"] == "pipeline"


def test_timeline_empty_correlation_falls_back_to_pipeline():
    """Correlation shell with empty chain/CES must not blank the Investigation tab."""
    from backend.investigation_views import build_investigation_timeline

    out = build_investigation_timeline(
        {
            "correlation": {
                "attack_chain": [],
                "timeline": [],
                "correlations": [],
                "entities": {},
                "stats": {},
            },
            "timeline": [
                {"label": "Files ingested", "detail": "3 file(s)", "ts": "2024-06-01T00:00:00Z"},
                {"label": "Playbook generated", "detail": "grounding 1.0"},
            ],
        }
    )
    assert out["source"] == "pipeline"
    assert len(out["events"]) == 2
    assert out["events"][0]["kind"] == "pipeline"
    assert out["events"][0]["label"] == "Files ingested"


def test_timeline_dense_ces_groups():
    from backend.investigation_views import CES_GROUP_THRESHOLD, build_investigation_timeline

    ces = []
    for i in range(CES_GROUP_THRESHOLD + 20):
        ces.append(
            {
                "timestamp": f"2024-02-01T10:{(i % 3):02d}:{(i % 60):02d}+00:00",
                "source_file": "big.log",
                "event_type": "noise",
                "severity": "info" if i % 2 else "low",
                "username": "u",
                "hostname": "h",
                "raw": f"line-{i}",
            }
        )
    inc = {
        "correlation": {
            "attack_chain": [
                {
                    "timestamp": "2024-02-01T09:00:00+00:00",
                    "source_file": "big.log",
                    "event_type": "anchor",
                    "severity": "critical",
                    "actor": "u",
                    "target": "h",
                    "summary": "anchor",
                }
            ],
            "timeline": ces,
            "entities": {},
            "correlations": [],
        }
    }
    out = build_investigation_timeline(inc, limit=500)
    ces_events = [e for e in out["events"] if e["kind"] == "ces"]
    # Grouped: far fewer than 70 raw CES rows
    assert len(ces_events) < CES_GROUP_THRESHOLD + 20
    assert len(ces_events) <= CES_GROUP_THRESHOLD  # rough: buckets by minute+type+actor
    assert any(e["kind"] == "attack_chain" for e in out["events"])


def test_entity_graph_caps_and_nodes():
    from backend.investigation_views import build_entity_graph

    out = build_entity_graph(_sample_incident(), max_nodes=10, max_edges=20)
    assert out["stats"]["node_count"] <= 10
    assert out["stats"]["edge_count"] <= 20
    assert out["stats"]["node_count"] == len(out["nodes"])
    assert out["stats"]["edge_count"] == len(out["edges"])
    ids = {n["id"] for n in out["nodes"]}
    assert "ip:1.2.3.4" in ids
    assert "user:admin" in ids
    # edges only among selected
    for e in out["edges"]:
        assert e["source"] in ids
        assert e["target"] in ids
        assert e["source"] != e["target"]
        assert "id" in e and "kind" in e


def test_entity_graph_dense_truncation():
    from backend.investigation_views import build_entity_graph

    entities = {
        "ips": [{"value": f"10.0.0.{i}", "count": 100 - i} for i in range(30)],
        "users": [{"value": f"user{i}", "count": 50 - i} for i in range(20)],
        "hosts": [{"value": f"host{i}", "count": 40 - i} for i in range(15)],
        "domains": [],
        "hashes": [],
    }
    timeline = []
    for i in range(100):
        timeline.append(
            {
                "timestamp": f"2024-03-01T12:00:{i % 60:02d}+00:00",
                "source_ip": f"10.0.0.{i % 30}",
                "username": f"user{i % 20}",
                "hostname": f"host{i % 15}",
            }
        )
    corr_list = [
        {
            "kind": "ip",
            "value": f"10.0.0.{i}",
            "event_count": 10,
            "file_count": 2,
            "files": ["a.log", "b.log"],
        }
        for i in range(10)
    ]
    inc = {
        "correlation": {
            "entities": entities,
            "timeline": timeline,
            "correlations": corr_list,
            "attack_chain": [],
        },
        "iocs": [],
    }
    out = build_entity_graph(inc, max_nodes=15, max_edges=25)
    assert out["stats"]["node_count"] <= 15
    assert out["stats"]["edge_count"] <= 25
    assert out["stats"]["truncated"] is True


def test_timeline_limit_clamp():
    from backend.investigation_views import build_investigation_timeline

    out = build_investigation_timeline(_sample_incident(), limit=1)
    assert out["stats"]["returned"] == 1
    assert len(out["events"]) == 1
