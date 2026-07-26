"""Behavioral analytics signals over incident correlation/CES (Wave B).

Deterministic heuristics — no live baseline DB required for MVP.
Surfaces analyst-facing signals: beaconing, login bursts, multi-host user,
rare high-severity spikes, LOLBin-like process names, DNS volume.
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from statistics import pstdev
from typing import Any, Dict, List, Optional, Tuple

_SEV = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}

_LOLBIN = re.compile(
    r"\b(certutil|mshta|regsvr32|rundll32|bitsadmin|wscript|cscript|msbuild|"
    r"installutil|powershell|pwsh|cmd\.exe|wmic|psexec)\b",
    re.I,
)


def _parse_ts(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc)
        except (OSError, ValueError, OverflowError):
            return None
    if isinstance(value, str) and value.strip():
        try:
            return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _timeline_rows(incident: dict) -> List[dict]:
    corr = incident.get("correlation") if isinstance(incident.get("correlation"), dict) else {}
    rows = corr.get("timeline") or []
    if not isinstance(rows, list):
        return []
    return [r for r in rows if isinstance(r, dict)]


def _signal(
    sid: str,
    title: str,
    severity: str,
    detail: str,
    *,
    evidence: Optional[List[str]] = None,
    score: float = 0.5,
) -> Dict[str, Any]:
    return {
        "id": sid,
        "title": title,
        "severity": severity,
        "detail": detail,
        "evidence": evidence or [],
        "score": round(score, 2),
    }


def detect_login_burst(rows: List[dict]) -> Optional[Dict[str, Any]]:
    """Many failed logins in a short window → credential attack signal."""
    fails = []
    for r in rows:
        et = str(r.get("event_type") or r.get("raw") or "").lower()
        if any(x in et for x in ("fail", "invalid", "denied", "auth_failure", "failed_login")):
            fails.append(r)
        elif "login" in et and str(r.get("severity") or "").lower() in ("high", "critical", "medium"):
            if "success" not in et:
                fails.append(r)
    if len(fails) < 5:
        return None
    users = Counter(
        str(r.get("username") or r.get("actor") or "unknown") for r in fails
    )
    top_user, cnt = users.most_common(1)[0]
    sev = "high" if len(fails) >= 15 else "medium"
    return _signal(
        "login_burst",
        "Failed login burst",
        sev,
        f"{len(fails)} failed/denied auth events; top user «{top_user}» ({cnt}).",
        evidence=[f"failed_events={len(fails)}", f"top_user={top_user}:{cnt}"],
        score=min(1.0, 0.4 + len(fails) / 40),
    )


def detect_multi_host_user(rows: List[dict], correlations: List[dict]) -> Optional[Dict[str, Any]]:
    """Same user across multiple hosts → possible lateral movement."""
    user_hosts: Dict[str, set] = defaultdict(set)
    for r in rows:
        u = r.get("username")
        h = r.get("hostname")
        if u and h:
            user_hosts[str(u)].add(str(h))
    # also from correlations
    for c in correlations:
        if not isinstance(c, dict):
            continue
        if c.get("kind") == "user" and (c.get("file_count") or 0) >= 2:
            val = str(c.get("value") or "")
            if val:
                for f in c.get("files") or []:
                    user_hosts[val].add(f"file:{f}")

    multi = [(u, hs) for u, hs in user_hosts.items() if len(hs) >= 3]
    if not multi:
        multi = [(u, hs) for u, hs in user_hosts.items() if len(hs) >= 2]
    if not multi:
        return None
    multi.sort(key=lambda x: -len(x[1]))
    u, hs = multi[0]
    sev = "high" if len(hs) >= 3 else "medium"
    return _signal(
        "multi_host_user",
        "User activity across multiple hosts",
        sev,
        f"User «{u}» observed on {len(hs)} hosts/sources — possible lateral movement.",
        evidence=[f"user={u}", f"host_count={len(hs)}", *list(hs)[:5]],
        score=min(1.0, 0.45 + 0.1 * len(hs)),
    )


def detect_beaconing(rows: List[dict]) -> Optional[Dict[str, Any]]:
    """Regular intervals to same destination IP/domain → beacon-like."""
    # group by dest
    series: Dict[str, List[datetime]] = defaultdict(list)
    for r in rows:
        dest = r.get("dest_ip") or r.get("domain") or r.get("url")
        ts = _parse_ts(r.get("timestamp") or r.get("ts"))
        if not dest or not ts:
            continue
        series[str(dest)].append(ts)

    best = None
    best_score = 0.0
    for dest, stamps in series.items():
        if len(stamps) < 5:
            continue
        stamps = sorted(stamps)
        deltas = [
            (stamps[i] - stamps[i - 1]).total_seconds()
            for i in range(1, len(stamps))
            if (stamps[i] - stamps[i - 1]).total_seconds() > 0
        ]
        if len(deltas) < 4:
            continue
        # low relative variance + median-ish interval between 30s and 1h
        mean = sum(deltas) / len(deltas)
        if mean < 30 or mean > 3600:
            continue
        try:
            sd = pstdev(deltas)
        except Exception:
            sd = mean
        cv = sd / mean if mean else 999
        if cv > 0.35:
            continue
        score = min(1.0, 0.5 + (len(stamps) / 30) + (0.35 - cv))
        if score > best_score:
            best_score = score
            best = (dest, len(stamps), mean, cv)

    if not best:
        return None
    dest, n, mean, cv = best
    return _signal(
        "beaconing",
        "Possible beaconing / periodic callbacks",
        "high" if n >= 8 else "medium",
        f"{n} events to «{dest}» with ~{mean:.0f}s interval (CV={cv:.2f}).",
        evidence=[f"dest={dest}", f"count={n}", f"interval_s={mean:.1f}", f"cv={cv:.3f}"],
        score=best_score,
    )


def detect_lolbins(rows: List[dict], incident: dict) -> Optional[Dict[str, Any]]:
    hits = []
    for r in rows:
        blob = " ".join(
            str(r.get(k) or "")
            for k in ("process", "command_line", "raw", "event_type", "parent_process")
        )
        m = _LOLBIN.search(blob)
        if m:
            hits.append(m.group(1).lower())
    # title/summary too
    for field in ("title", "summary"):
        m = _LOLBIN.search(str(incident.get(field) or ""))
        if m:
            hits.append(m.group(1).lower())
    if not hits:
        return None
    c = Counter(hits)
    top = ", ".join(f"{k}×{v}" for k, v in c.most_common(4))
    return _signal(
        "lolbins",
        "Living-off-the-land binary indicators",
        "medium",
        f"LOLBin-like process/command names observed: {top}.",
        evidence=[f"{k}:{v}" for k, v in c.most_common(6)],
        score=min(1.0, 0.4 + 0.1 * len(hits)),
    )


def detect_dns_volume(rows: List[dict]) -> Optional[Dict[str, Any]]:
    dns = [
        r
        for r in rows
        if "dns" in str(r.get("event_type") or "").lower()
        or r.get("domain")
        or "dns" in str(r.get("product") or "").lower()
    ]
    if len(dns) < 12:
        return None
    domains = Counter(str(r.get("domain") or r.get("dest_ip") or "?") for r in dns)
    uniq = len(domains)
    top_d, top_n = domains.most_common(1)[0]
    sev = "high" if uniq >= 25 else "medium"
    return _signal(
        "dns_volume",
        "Elevated DNS / domain activity",
        sev,
        f"{len(dns)} DNS-related events across {uniq} destinations; top «{top_d}» ({top_n}).",
        evidence=[f"dns_events={len(dns)}", f"unique={uniq}", f"top={top_d}:{top_n}"],
        score=min(1.0, 0.35 + len(dns) / 80),
    )


def detect_severity_spike(rows: List[dict], incident: dict) -> Optional[Dict[str, Any]]:
    high = sum(
        1
        for r in rows
        if _SEV.get(str(r.get("severity") or "info").lower(), 0) >= 3
    )
    if high < 3 and str(incident.get("severity") or "").lower() not in ("high", "critical"):
        return None
    if high < 3:
        return None
    return _signal(
        "severity_spike",
        "Cluster of high-severity events",
        "high" if high >= 8 else "medium",
        f"{high} high/critical severity events in the correlated timeline.",
        evidence=[f"high_sev_events={high}"],
        score=min(1.0, 0.4 + high / 20),
    )


def analyze_behavior(incident: dict) -> Dict[str, Any]:
    """Return behavioral signals + overall risk for one incident."""
    rows = _timeline_rows(incident)
    corr = incident.get("correlation") if isinstance(incident.get("correlation"), dict) else {}
    correlations = corr.get("correlations") or []
    if not isinstance(correlations, list):
        correlations = []

    detectors = [
        detect_login_burst(rows),
        detect_multi_host_user(rows, correlations),
        detect_beaconing(rows),
        detect_lolbins(rows, incident),
        detect_dns_volume(rows),
        detect_severity_spike(rows, incident),
    ]
    signals = [s for s in detectors if s]
    signals.sort(key=lambda s: (-_SEV.get(s["severity"], 0), -s["score"], s["id"]))

    if not signals:
        risk = "low"
        risk_score = 0.15
        summary = "No strong behavioral anomalies detected from correlated events alone."
    else:
        top = _SEV.get(signals[0]["severity"], 0)
        risk_score = min(1.0, sum(s["score"] for s in signals) / max(2, len(signals) + 1) + 0.1 * len(signals))
        risk = "critical" if top >= 4 and len(signals) >= 2 else "high" if top >= 3 else "medium"
        summary = f"{len(signals)} behavioral signal(s); strongest: {signals[0]['title']}."

    return {
        "incident_id": incident.get("id"),
        "risk": risk,
        "risk_score": round(risk_score, 2),
        "summary": summary,
        "signals": signals,
        "stats": {
            "timeline_events": len(rows),
            "signal_count": len(signals),
        },
    }


def analyze_behavior_batch(incidents: List[dict], *, limit: int = 50) -> Dict[str, Any]:
    """Rank incidents by behavioral risk for a SOC overview."""
    items = []
    for inc in incidents:
        if not isinstance(inc, dict):
            continue
        res = analyze_behavior(inc)
        if res["stats"]["signal_count"] == 0:
            continue
        items.append(
            {
                "id": inc.get("id"),
                "title": inc.get("title"),
                "severity": inc.get("severity"),
                "status": inc.get("status"),
                "risk": res["risk"],
                "risk_score": res["risk_score"],
                "summary": res["summary"],
                "signal_ids": [s["id"] for s in res["signals"]],
            }
        )
    items.sort(key=lambda x: (-x["risk_score"], str(x.get("id") or "")))
    return {
        "total_scanned": len(incidents),
        "total_flagged": len(items),
        "items": items[: max(1, min(limit, 100))],
    }
