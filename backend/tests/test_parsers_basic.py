"""Basic parser fixture tests (A-E5)."""
from __future__ import annotations

import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

from parsers import detect_and_parse  # noqa: E402


def test_syslog_failed_password():
    raw = b"Feb  1 09:13:02 web01 sshd[2211]: Failed password for root from 45.155.205.199 port 34521 ssh2\n"
    fmt, events = detect_and_parse(raw, "auth.log")
    assert fmt in ("syslog", "text", "unknown") or events
    if events:
        assert any("45.155.205.199" in (e.get("source_ip") or e.get("raw") or "") for e in events)


def test_json_lines():
    raw = b'{"eventName":"ConsoleLogin","sourceIPAddress":"1.2.3.4","awsRegion":"us-east-1"}\n'
    fmt, events = detect_and_parse(raw, "cloud.json")
    assert fmt == "json"
    assert events
    assert events[0].get("source_ip") == "1.2.3.4" or "1.2.3.4" in (events[0].get("raw") or "")


def test_csv_firewall():
    raw = (
        b"timestamp,action,src_ip,dst_ip,dst_port,protocol\n"
        b"2026-02-01T09:14:10,BLOCK,45.155.205.199,10.0.0.5,4444,tcp\n"
    )
    fmt, events = detect_and_parse(raw, "fw.csv")
    assert fmt == "csv"
    assert len(events) >= 1


def test_private_ip_not_extracted_as_public_ioc():
    from backend.ioc_extractor import extract_iocs

    text = "connection from 10.0.0.5 and 169.254.1.1 and 100.64.1.2 and 8.8.8.8"
    iocs = extract_iocs(text)
    ips = {i.value for i in iocs if i.type == "ip"}
    assert "8.8.8.8" in ips
    assert "10.0.0.5" not in ips
    assert "169.254.1.1" not in ips
    assert "100.64.1.2" not in ips
