"""Log format parsers with auto-detection.

Every parser converts raw log lines into a list of Common Event Schema (CES) dicts.
CES fields (all optional except source_file & raw):

    timestamp, source_ip, dest_ip, hostname, username, event_type, severity,
    process, parent_process, command_line, hash, url, domain, email,
    event_id, vendor, product, source_file, raw
"""
from __future__ import annotations

import csv
import io
import json
import re
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple

# ---------- Shared regex ----------
_IP = r"(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)"
_APACHE_RE = re.compile(
    rf'(?P<ip>{_IP}) \S+ \S+ \[(?P<ts>[^\]]+)\] "(?P<method>\S+) (?P<url>\S+) [^"]+" (?P<status>\d+) (?P<size>\S+)'
)
_NGINX_RE = _APACHE_RE  # same combined format
_SYSLOG_RE = re.compile(
    r"(?P<ts>[A-Z][a-z]{2}\s+\d+\s\d{2}:\d{2}:\d{2})\s+(?P<host>\S+)\s+(?P<proc>[\w\-\.\/]+)(?:\[(?P<pid>\d+)\])?:\s*(?P<msg>.*)"
)
_CEF_RE = re.compile(
    r"CEF:(?P<ver>\d+)\|(?P<vendor>[^|]*)\|(?P<product>[^|]*)\|(?P<pv>[^|]*)\|(?P<sig>[^|]*)\|(?P<name>[^|]*)\|(?P<sev>[^|]*)\|(?P<ext>.*)"
)
_LEEF_RE = re.compile(
    r"LEEF:(?P<ver>[\d\.]+)\|(?P<vendor>[^|]*)\|(?P<product>[^|]*)\|(?P<pv>[^|]*)\|(?P<sig>[^|]*)\|?(?P<ext>.*)"
)


def _ces(source_file: str, raw: str, **fields) -> Dict[str, Any]:
    """Build a CES record with optional fields."""
    event = {
        "timestamp": None,
        "source_ip": None,
        "dest_ip": None,
        "hostname": None,
        "username": None,
        "event_type": None,
        "severity": None,
        "process": None,
        "parent_process": None,
        "command_line": None,
        "hash": None,
        "url": None,
        "domain": None,
        "email": None,
        "event_id": None,
        "vendor": None,
        "product": None,
        "source_file": source_file,
        "raw": raw,
    }
    event.update({k: v for k, v in fields.items() if v is not None})
    return event


def _try_parse_ts(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    fmts = [
        "%d/%b/%Y:%H:%M:%S %z",  # apache
        "%b %d %H:%M:%S",  # syslog (year missing)
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%S%z",
    ]
    s = s.strip()
    for f in fmts:
        try:
            dt = datetime.strptime(s, f)
            if not dt.tzinfo:
                dt = dt.replace(tzinfo=timezone.utc)
            if "%Y" not in f:
                dt = dt.replace(year=datetime.now(timezone.utc).year)
            return dt.astimezone(timezone.utc).isoformat()
        except ValueError:
            continue
    return None


# ---------- Parsers ----------
class BaseParser:
    name = "base"

    def matches(self, sample: str) -> float:
        return 0.0

    def parse(self, content: str, filename: str) -> List[Dict[str, Any]]:
        return []


class ApacheParser(BaseParser):
    name = "apache"

    def matches(self, sample: str) -> float:
        lines = [l for l in sample.splitlines() if l.strip()][:10]
        if not lines:
            return 0.0
        hits = sum(1 for l in lines if _APACHE_RE.match(l))
        return hits / len(lines)

    def parse(self, content, filename):
        out = []
        for line in content.splitlines():
            m = _APACHE_RE.match(line)
            if not m:
                continue
            g = m.groupdict()
            out.append(_ces(
                filename, line,
                timestamp=_try_parse_ts(g["ts"]),
                source_ip=g["ip"],
                event_type=f"http_{g['method'].lower()}",
                url=g["url"],
                event_id=g["status"],
                vendor="Apache", product="httpd",
                severity="high" if g["status"].startswith(("4", "5")) else "info",
            ))
        return out


class SyslogParser(BaseParser):
    name = "syslog"

    def matches(self, sample: str) -> float:
        lines = [l for l in sample.splitlines() if l.strip()][:10]
        if not lines:
            return 0.0
        hits = sum(1 for l in lines if _SYSLOG_RE.match(l))
        return hits / len(lines)

    def parse(self, content, filename):
        out = []
        for line in content.splitlines():
            m = _SYSLOG_RE.match(line)
            if not m:
                continue
            g = m.groupdict()
            msg = g["msg"]
            # Enrich common patterns
            ip_m = re.search(_IP, msg)
            user_m = re.search(r"(?:user|for)\s+(\S+)", msg, re.I)
            evt = "auth" if g["proc"].startswith(("sshd", "sudo", "pam", "login")) else g["proc"]
            sev = "high" if "failed" in msg.lower() or "denied" in msg.lower() else "info"
            out.append(_ces(
                filename, line,
                timestamp=_try_parse_ts(g["ts"]),
                hostname=g["host"],
                process=g["proc"],
                event_type=evt,
                severity=sev,
                source_ip=ip_m.group(0) if ip_m else None,
                username=user_m.group(1) if user_m else None,
                vendor="Linux", product="syslog",
            ))
        return out


class JSONLinesParser(BaseParser):
    name = "json"

    def matches(self, sample: str) -> float:
        lines = [l for l in sample.splitlines() if l.strip()][:10]
        if not lines:
            return 0.0
        hits = 0
        for l in lines:
            try:
                if isinstance(json.loads(l), dict):
                    hits += 1
            except Exception:
                pass
        return hits / len(lines)

    def parse(self, content, filename):
        out = []
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                if not isinstance(d, dict):
                    continue
            except Exception:
                continue
            # AWS CloudTrail heuristic
            is_ct = "eventName" in d and "awsRegion" in d
            out.append(_ces(
                filename, line,
                timestamp=_try_parse_ts(d.get("eventTime") or d.get("@timestamp") or d.get("timestamp")),
                source_ip=d.get("sourceIPAddress") or d.get("src_ip") or d.get("source_ip"),
                dest_ip=d.get("dest_ip") or d.get("destinationIPAddress"),
                hostname=d.get("host") or d.get("hostname") or d.get("recipientAccountId"),
                username=d.get("userIdentity", {}).get("userName") if isinstance(d.get("userIdentity"),
                                                                                 dict) else d.get("user"),
                event_type=d.get("eventName") or d.get("event_type") or d.get("action"),
                severity=d.get("severity"),
                process=d.get("process") or d.get("processName"),
                url=d.get("url") or d.get("request"),
                domain=d.get("domain") or d.get("query"),
                email=d.get("email"),
                event_id=str(d.get("eventID") or d.get("event_id") or ""),
                vendor="AWS" if is_ct else d.get("vendor"),
                product="CloudTrail" if is_ct else d.get("product"),
            ))
        return out


class CSVParser(BaseParser):
    name = "csv"

    def matches(self, sample: str) -> float:
        lines = [l for l in sample.splitlines() if l.strip()][:10]
        if len(lines) < 2:
            return 0.0
        first_cols = lines[0].count(",")
        if first_cols < 2:
            return 0.0
        consistent = sum(1 for l in lines[1:] if abs(l.count(",") - first_cols) <= 1)
        return 0.6 if consistent >= len(lines) - 2 else 0.0

    def parse(self, content, filename):
        out = []
        try:
            reader = csv.DictReader(io.StringIO(content))
            for row in reader:
                lc = {k.lower().strip(): v for k, v in row.items() if k}
                out.append(_ces(
                    filename, ",".join(row.values()),
                    timestamp=_try_parse_ts(lc.get("timestamp") or lc.get("time") or lc.get("@timestamp")),
                    source_ip=lc.get("src_ip") or lc.get("source_ip") or lc.get("srcip"),
                    dest_ip=lc.get("dst_ip") or lc.get("dest_ip") or lc.get("dstip"),
                    hostname=lc.get("host") or lc.get("hostname"),
                    username=lc.get("user") or lc.get("username"),
                    event_type=lc.get("event") or lc.get("action") or lc.get("event_type"),
                    severity=lc.get("severity"),
                    url=lc.get("url"),
                    domain=lc.get("domain"),
                    hash=lc.get("hash") or lc.get("sha256") or lc.get("md5"),
                    vendor="CSV", product="generic",
                ))
        except Exception:
            pass
        return out


class CEFParser(BaseParser):
    name = "cef"

    def matches(self, sample):
        return 0.99 if "CEF:" in sample[:512] else 0.0

    def parse(self, content, filename):
        out = []
        for line in content.splitlines():
            m = _CEF_RE.search(line)
            if not m:
                continue
            g = m.groupdict()
            # extension key=value pairs
            ext = dict(re.findall(r"(\w+)=([^ ]+)", g["ext"]))
            out.append(_ces(
                filename, line,
                event_type=g["name"],
                severity=_cef_sev(g["sev"]),
                source_ip=ext.get("src") or ext.get("srcip"),
                dest_ip=ext.get("dst") or ext.get("dstip"),
                hostname=ext.get("dhost") or ext.get("shost"),
                username=ext.get("suser") or ext.get("duser"),
                event_id=g["sig"],
                vendor=g["vendor"], product=g["product"],
            ))
        return out


class LEEFParser(BaseParser):
    name = "leef"

    def matches(self, sample):
        return 0.99 if "LEEF:" in sample[:512] else 0.0

    def parse(self, content, filename):
        out = []
        for line in content.splitlines():
            m = _LEEF_RE.search(line)
            if not m:
                continue
            g = m.groupdict()
            ext = dict(re.findall(r"(\w+)=([^\t]+)", g["ext"]))
            out.append(_ces(
                filename, line,
                event_type=g["sig"],
                source_ip=ext.get("src"),
                dest_ip=ext.get("dst"),
                username=ext.get("usrName") or ext.get("user"),
                vendor=g["vendor"], product=g["product"],
            ))
        return out


class PlainTextParser(BaseParser):
    """Fallback — treats each line as an unstructured event, extracts IPs/URLs."""
    name = "plaintext"

    def matches(self, sample: str) -> float:
        return 0.05  # low priority fallback

    def parse(self, content, filename):
        out = []
        for line in content.splitlines():
            if not line.strip():
                continue
            ip = re.search(_IP, line)
            out.append(_ces(
                filename, line,
                source_ip=ip.group(0) if ip else None,
                event_type="unstructured",
                vendor="generic", product="text",
            ))
        return out


def _cef_sev(s: str) -> str:
    try:
        n = int(s)
        if n >= 8: return "critical"
        if n >= 6: return "high"
        if n >= 4: return "medium"
        return "low"
    except (ValueError, TypeError):
        return s or "info"


class EvtxParser(BaseParser):
    """Windows Event Log (.evtx) — optional ``python-evtx`` / ``Evtx`` package.

    When the library is missing, detection still works (magic/filename) but
    ``parse`` returns a single placeholder CES event so the pipeline continues.
    """

    name = "evtx"
    MAGIC = b"ElfFile\x00"

    def matches(self, sample: str) -> float:
        # Text sample path rarely hits EVTX; detect_and_parse short-circuits bytes.
        if sample and "ElfFile" in sample[:32]:
            return 0.95
        return 0.0

    def matches_bytes(self, raw: bytes, filename: str = "") -> float:
        if raw[:7] == self.MAGIC or (raw[:8] == self.MAGIC):
            return 0.99
        if (filename or "").lower().endswith(".evtx"):
            return 0.9
        return 0.0

    def parse(self, content: str, filename: str) -> List[Dict[str, Any]]:
        # Text path: not useful for real EVTX
        return [
            _ces(
                filename,
                content[:500] if content else "",
                event_type="evtx_text_fallback",
                vendor="Microsoft",
                product="Windows",
                severity="info",
            )
        ]

    def parse_bytes(self, raw: bytes, filename: str) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        try:
            from Evtx.Evtx import Evtx  # type: ignore
            from Evtx.Views import evtx_file_xml_view  # type: ignore
        except Exception:
            return [
                _ces(
                    filename,
                    "EVTX detected but python-evtx not installed; install optional dep to parse records.",
                    event_type="evtx_unparsed",
                    vendor="Microsoft",
                    product="Windows",
                    severity="info",
                )
            ]
        try:
            # Evtx expects a path or file-like; use BytesIO via tempfile if needed
            import tempfile
            from pathlib import Path

            with tempfile.NamedTemporaryFile(suffix=".evtx", delete=False) as tf:
                tf.write(raw)
                path = tf.name
            try:
                with Evtx(path) as log:
                    for i, record in enumerate(log.records()):
                        if i >= 2000:  # hard cap for large channels
                            break
                        try:
                            xml = record.xml()
                        except Exception:
                            continue
                        events.append(self._xml_to_ces(xml, filename))
            finally:
                try:
                    Path(path).unlink(missing_ok=True)
                except Exception:
                    pass
        except Exception as e:
            return [
                _ces(
                    filename,
                    f"EVTX parse error: {type(e).__name__}: {e}"[:500],
                    event_type="evtx_error",
                    vendor="Microsoft",
                    product="Windows",
                    severity="medium",
                )
            ]
        return events or [
            _ces(
                filename,
                "EVTX opened but no records extracted",
                event_type="evtx_empty",
                vendor="Microsoft",
                product="Windows",
                severity="info",
            )
        ]

    def _xml_to_ces(self, xml: str, filename: str) -> Dict[str, Any]:
        # Lightweight tag pulls (avoid hard dependency on lxml)
        def _tag(name: str) -> Optional[str]:
            m = re.search(rf"<{name}[^>]*>([^<]*)</{name}>", xml or "", re.I)
            return m.group(1).strip() if m else None

        eid = _tag("EventID")
        ts = _tag("TimeCreated") or _tag("SystemTime")
        # TimeCreated often uses attribute SystemTime=
        if not ts:
            m = re.search(r'SystemTime="([^"]+)"', xml or "")
            ts = m.group(1) if m else None
        host = _tag("Computer")
        user = _tag("SubjectUserName") or _tag("TargetUserName") or _tag("User")
        proc = _tag("NewProcessName") or _tag("Image") or _tag("ProcessName")
        cmd = _tag("CommandLine")
        sip = _tag("IpAddress") or _tag("SourceAddress")
        dip = _tag("DestAddress")
        return _ces(
            filename,
            (xml or "")[:2000],
            timestamp=_try_parse_ts(ts) if ts and "T" not in (ts or "") else (
                ts if ts else None
            ),
            event_id=eid,
            hostname=host,
            username=user,
            process=proc,
            command_line=cmd,
            source_ip=sip if sip and sip not in ("-", "::1") else None,
            dest_ip=dip,
            vendor="Microsoft",
            product="Windows",
            event_type=f"windows_event_{eid}" if eid else "windows_event",
            severity="info",
        )


PARSERS: List[BaseParser] = [
    ApacheParser(),
    CEFParser(),
    LEEFParser(),
    JSONLinesParser(),
    CSVParser(),
    SyslogParser(),
    PlainTextParser(),
]

_EVTX = EvtxParser()


def detect_and_parse(content: bytes | str, filename: str) -> Tuple[str, List[Dict[str, Any]]]:
    """Detect format via confidence scoring and parse into CES events."""
    raw: Optional[bytes] = content if isinstance(content, bytes) else None

    # Binary short-circuit: Windows Event Log
    if raw is not None and _EVTX.matches_bytes(raw, filename) >= 0.9:
        return _EVTX.name, _EVTX.parse_bytes(raw, filename)

    if isinstance(content, bytes):
        try:
            text = content.decode("utf-8", errors="ignore")
        except Exception:
            text = content.decode("latin-1", errors="ignore")
    else:
        text = content
    sample = "\n".join(text.splitlines()[:50])
    scores = [(p, p.matches(sample)) for p in PARSERS]
    scores.sort(key=lambda x: x[1], reverse=True)
    best, score = scores[0]
    if score <= 0:
        return "unknown", []
    return best.name, best.parse(text, filename)
