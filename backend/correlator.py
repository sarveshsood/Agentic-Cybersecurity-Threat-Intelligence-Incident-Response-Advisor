"""Cross-log event correlator.

Takes a flat list of Common Event Schema events (possibly from multiple files)
and produces a unified correlation graph + attack chain.
"""
from __future__ import annotations

from collections import defaultdict, Counter
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional


def _sort_key(ev: Dict[str, Any]):
    ts = ev.get("timestamp")
    return (ts or "9999",)


def _severity_rank(s: str) -> int:
    return {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}.get((s or "info").lower(), 0)


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
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _idxs_within_window(
        events_sorted: List[Dict[str, Any]],
        idxs: List[int],
        window_minutes: Optional[int],
) -> List[int]:
    """If window set, keep only indices whose timestamps fall within the densest window."""
    if not window_minutes or window_minutes <= 0 or len(idxs) < 2:
        return idxs
    stamped = []
    for i in idxs:
        ts = _parse_ts(events_sorted[i].get("timestamp"))
        if ts is not None:
            stamped.append((i, ts))
    if len(stamped) < 2:
        return idxs
    stamped.sort(key=lambda x: x[1])
    window = timedelta(minutes=int(window_minutes))
    best: List[int] = []
    j = 0
    for i in range(len(stamped)):
        while stamped[i][1] - stamped[j][1] > window:
            j += 1
        span = [stamped[k][0] for k in range(j, i + 1)]
        if len(span) > len(best):
            best = span
    return best if len(best) >= 2 else idxs


def correlate_events(
        events: List[Dict[str, Any]],
        window_minutes: Optional[int] = None,
) -> Dict[str, Any]:
    """Return correlation metadata + unified timeline for a batch of CES events.

    window_minutes (A-P1): when set, multi-event entity correlations prefer
    events that cluster within that time window.
    """
    if not events:
        return {"timeline": [], "correlations": [], "entities": {}, "stats": {}, "attack_chain": []}

    # Sort chronologically (Nones sink to end)
    events_sorted = sorted(events, key=_sort_key)

    # Entity indices
    by_ip: Dict[str, List[int]] = defaultdict(list)
    by_user: Dict[str, List[int]] = defaultdict(list)
    by_host: Dict[str, List[int]] = defaultdict(list)
    by_domain: Dict[str, List[int]] = defaultdict(list)
    by_hash: Dict[str, List[int]] = defaultdict(list)
    files_seen: Counter = Counter()

    for i, ev in enumerate(events_sorted):
        files_seen[ev.get("source_file", "?")] += 1
        for k, bucket in [("source_ip", by_ip), ("username", by_user),
                          ("hostname", by_host), ("domain", by_domain), ("hash", by_hash)]:
            v = ev.get(k)
            if v:
                bucket[v].append(i)
        dip = ev.get("dest_ip")
        if dip:
            by_ip[dip].append(i)

    # Build correlations: any entity appearing in ≥2 files or ≥3 events
    correlations: List[Dict[str, Any]] = []
    for kind, index in [("ip", by_ip), ("user", by_user), ("host", by_host),
                        ("domain", by_domain), ("hash", by_hash)]:
        for value, idxs in index.items():
            use_idxs = _idxs_within_window(events_sorted, idxs, window_minutes)
            distinct_files = {events_sorted[i].get("source_file") for i in use_idxs}
            if len(use_idxs) >= 3 or len(distinct_files) >= 2:
                correlations.append({
                    "kind": kind,
                    "value": value,
                    "event_count": len(use_idxs),
                    "file_count": len(distinct_files),
                    "files": sorted(f for f in distinct_files if f is not None),
                    "window_minutes": window_minutes,
                })

    correlations.sort(key=lambda c: (c["file_count"], c["event_count"]), reverse=True)

    # Attack-chain heuristic: pick anchor entities (top correlations) and list
    # their event sequence in chronological order.
    attack_chain: List[Dict[str, Any]] = []
    if correlations:
        anchor = correlations[0]
        anchor_bucket = {"ip": by_ip, "user": by_user, "host": by_host,
                         "domain": by_domain, "hash": by_hash}[anchor["kind"]]
        for i in anchor_bucket[anchor["value"]][:20]:
            ev = events_sorted[i]
            attack_chain.append({
                "timestamp": ev.get("timestamp"),
                "source_file": ev.get("source_file"),
                "event_type": ev.get("event_type"),
                "severity": ev.get("severity"),
                "actor": ev.get("username") or ev.get("source_ip"),
                "target": ev.get("hostname") or ev.get("dest_ip"),
                "summary": (ev.get("raw") or "")[:180],
            })

    # Stats
    sev_counter = Counter((ev.get("severity") or "info").lower() for ev in events_sorted)
    stats = {
        "total_events": len(events_sorted),
        "files": dict(files_seen),
        "severity_counts": dict(sev_counter),
        "unique_source_ips": len(by_ip),
        "unique_users": len(by_user),
        "unique_hosts": len(by_host),
        "unique_domains": len(by_domain),
        "unique_hashes": len(by_hash),
    }

    return {
        "timeline": events_sorted[:500],  # cap to keep documents small
        "correlations": correlations[:50],
        "entities": {
            "ips": _top(by_ip),
            "users": _top(by_user),
            "hosts": _top(by_host),
            "domains": _top(by_domain),
            "hashes": _top(by_hash),
        },
        "stats": stats,
        "attack_chain": attack_chain,
    }


def _top(bucket: Dict[str, List[int]], k: int = 20) -> List[Dict[str, Any]]:
    return [
        {"value": v, "count": len(ids)}
        for v, ids in sorted(bucket.items(), key=lambda x: len(x[1]), reverse=True)[:k]
    ]
