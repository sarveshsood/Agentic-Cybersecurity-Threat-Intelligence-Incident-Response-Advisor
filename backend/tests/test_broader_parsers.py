"""Wave B broader parsers: Suricata, Zeek, Defender, Sysmon (offline)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_suricata_eve_detect_and_parse():
    from backend.parsers import detect_and_parse

    line = json.dumps(
        {
            "timestamp": "2024-03-01T12:00:00.000000+0000",
            "event_type": "alert",
            "src_ip": "10.0.0.5",
            "dest_ip": "8.8.8.8",
            "alert": {
                "signature": "ET MALWARE Beacon",
                "signature_id": 2020001,
                "severity": 1,
            },
            "http": {"hostname": "evil.example", "url": "/c2"},
        }
    )
    name, events = detect_and_parse(line.encode(), "eve.json")
    assert name == "suricata_eve"
    assert events
    assert events[0]["source_ip"] == "10.0.0.5"
    assert events[0]["vendor"] == "OISF"
    assert "Beacon" in (events[0].get("event_type") or "")


def test_zeek_tsv_detect_and_parse():
    from backend.parsers import detect_and_parse

    content = (
        "#separator \\x09\n"
        "#fields\tts\tuid\tid.orig_h\tid.resp_h\tquery\n"
        "1710000000.1\tCabc123\t192.168.1.10\t1.1.1.1\tmalware.test\n"
    )
    name, events = detect_and_parse(content, "dns.log")
    assert name == "zeek"
    assert events
    assert events[0]["source_ip"] == "192.168.1.10"
    assert events[0]["domain"] == "malware.test"
    assert events[0]["vendor"] == "Zeek"


def test_zeek_json_path():
    from backend.parsers import detect_and_parse

    line = json.dumps(
        {
            "_path": "conn",
            "ts": 1710000000.5,
            "uid": "Cxyz",
            "id.orig_h": "10.1.1.1",
            "id.resp_h": "10.2.2.2",
        }
    )
    name, events = detect_and_parse(line + "\n", "conn.log")
    assert name == "zeek"
    assert events[0]["source_ip"] == "10.1.1.1"
    assert events[0]["dest_ip"] == "10.2.2.2"


def test_defender_alert_json():
    from backend.parsers import detect_and_parse

    alert = {
        "id": "alert-1",
        "title": "Suspicious PowerShell",
        "severity": "high",
        "detectionSource": "WindowsDefenderAv",
        "deviceName": "WS01",
        "sha256": "abc123",
        "FileName": "evil.exe",
        "firstActivityDateTime": "2024-04-01T10:00:00Z",
    }
    name, events = detect_and_parse(json.dumps(alert), "defender_alert.json")
    assert name == "defender"
    assert events
    assert events[0]["hostname"] == "WS01"
    assert events[0]["severity"] == "high"
    assert events[0]["product"] == "Defender"
    assert events[0]["hash"] == "abc123"


def test_sysmon_json_line():
    from backend.parsers import detect_and_parse

    line = json.dumps(
        {
            "@timestamp": "2024-05-01T08:00:00.000Z",
            "EventID": 1,
            "Image": "C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe",
            "CommandLine": "powershell -enc AAAA",
            "User": "CORP\\\\alice",
            "Computer": "WS01.corp.local",
            "ParentImage": "C:\\\\Windows\\\\explorer.exe",
        }
    )
    name, events = detect_and_parse(line + "\n", "sysmon.json")
    assert name == "sysmon"
    assert events
    assert "powershell" in (events[0].get("process") or "").lower()
    assert events[0]["event_type"] == "sysmon_1"
    assert events[0]["product"] == "Sysmon"


def test_existing_syslog_still_preferred_for_auth_log():
    from backend.parsers import detect_and_parse

    text = "Jan 12 10:00:01 web01 sshd[1]: Failed password for root from 1.2.3.4"
    name, events = detect_and_parse(text.encode(), "auth.log")
    assert name in ("syslog", "plaintext")
    assert events
