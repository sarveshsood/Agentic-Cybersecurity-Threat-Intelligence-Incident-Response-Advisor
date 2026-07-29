"""Pure Investigation Workspace view builders (timeline + entity graph).

No I/O, no LLM — offline unit-testable. Used by workspace HTTP routes (PR-3+).
See docs/product/INVESTIGATION_WORKSPACE_DESIGN.md §3.4.
"""
from __future__ import annotations

import hashlib
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

CES_GROUP_THRESHOLD = 50

_SEV_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}


def _severity_rank(s: Any) -> int:
    return _SEV_RANK.get(str(s or "info").lower(), 0)


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


def _str_or_empty(v: Any) -> str:
    if v is None:
        return ""
    return str(v)


def _event_key(ts: Any, source_file: Any, event_type: Any, actor: Any, target: Any) -> Tuple[str, str, str, str, str]:
    return (
        _str_or_empty(ts),
        _str_or_empty(source_file),
        _str_or_empty(event_type),
        _str_or_empty(actor),
        _str_or_empty(target),
    )


def _ces_fingerprint(
    ts: Any,
    source_file: Any,
    event_type: Any,
    actor: Any,
    target: Any,
    raw: Any,
) -> str:
    raw_s = _str_or_empty(raw)[:64]
    payload = (
        f"{_str_or_empty(ts)}|{_str_or_empty(source_file)}|"
        f"{_str_or_empty(event_type)}|{_str_or_empty(actor)}|"
        f"{_str_or_empty(target)}|{raw_s}"
    )
    # Non-cryptographic stable id for CES rows (not security-sensitive)
    return hashlib.sha1(  # nosec B324
        payload.encode("utf-8", errors="replace"),
        usedforsecurity=False,
    ).hexdigest()[:16]


def _minute_bucket(ts: Any) -> str:
    dt = _parse_ts(ts)
    if dt is None:
        return "_none_"
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M")


def _group_ces_rows(ces: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Bucket by (minute, event_type, actor); keep max severity per bucket (first on ties)."""
    buckets: Dict[Tuple[str, str, str], Dict[str, Any]] = {}
    order: List[Tuple[str, str, str]] = []
    for row in ces:
        key = (
            _minute_bucket(row.get("timestamp")),
            _str_or_empty(row.get("event_type")),
            _str_or_empty(row.get("username") or row.get("actor")),
        )
        if key not in buckets:
            buckets[key] = row
            order.append(key)
            continue
        cur = buckets[key]
        if _severity_rank(row.get("severity")) > _severity_rank(cur.get("severity")):
            buckets[key] = row
    return [buckets[k] for k in order]


def normalize_workspace(raw: Any) -> Dict[str, Any]:
    """Empty defaults for missing workspace; does not mutate input."""
    if not isinstance(raw, dict):
        return {"version": 1, "notes": [], "rca": None}
    notes = raw.get("notes")
    if not isinstance(notes, list):
        notes = []
    rca = raw.get("rca")
    if rca is not None and not isinstance(rca, dict):
        rca = None
    version = raw.get("version", 1)
    try:
        version = int(version)
    except (TypeError, ValueError):
        version = 1
    return {"version": version, "notes": notes, "rca": rca}


def build_investigation_timeline(
    incident: dict,
    *,
    limit: int = 100,
    source_file: Optional[str] = None,
    severity: Optional[str] = None,
    kind: Optional[str] = None,
) -> dict:
    """Deterministic investigation timeline from correlation or pipeline events."""
    limit = max(1, min(int(limit or 100), 500))
    events: List[Dict[str, Any]] = []
    source = "pipeline"
    corr = incident.get("correlation") if isinstance(incident, dict) else None

    def _append_pipeline_events() -> None:
        pipe = (incident or {}).get("timeline") or []
        if not isinstance(pipe, list):
            return
        for i, step in enumerate(pipe):
            if not isinstance(step, dict):
                continue
            events.append(
                {
                    "id": f"pipe:{i}",
                    "kind": "pipeline",
                    "ts": step.get("ts") or step.get("timestamp") or step.get("at"),
                    "label": step.get("label") or step.get("phase") or step.get("event"),
                    "detail": step.get("detail") or step.get("message") or "",
                    "severity": step.get("severity") or "info",
                    "actor": step.get("actor"),
                    "target": step.get("target"),
                    "source_file": step.get("source_file"),
                    "entities": [],
                }
            )

    if isinstance(corr, dict) and corr:
        source = "correlation"
        chain = corr.get("attack_chain") or []
        if not isinstance(chain, list):
            chain = []
        chain_keys = set()
        for i, step in enumerate(chain):
            if not isinstance(step, dict):
                continue
            ts = step.get("timestamp") or step.get("ts")
            sf = step.get("source_file")
            et = step.get("event_type")
            actor = step.get("actor")
            target = step.get("target")
            chain_keys.add(_event_key(ts, sf, et, actor, target))
            entities = [x for x in (actor, target) if x]
            events.append(
                {
                    "id": f"ac:{i}",
                    "kind": "attack_chain",
                    "ts": ts,
                    "label": et,
                    "detail": step.get("summary") or step.get("detail") or "",
                    "severity": step.get("severity"),
                    "actor": actor,
                    "target": target,
                    "source_file": sf,
                    "entities": entities,
                }
            )

        ces = corr.get("timeline") or []
        if not isinstance(ces, list):
            ces = []
        if len(ces) > CES_GROUP_THRESHOLD:
            ces_rows = _group_ces_rows([r for r in ces if isinstance(r, dict)])
        else:
            ces_rows = [r for r in ces if isinstance(r, dict)]

        for row in ces_rows:
            ts = row.get("timestamp") or row.get("ts")
            sf = row.get("source_file")
            et = row.get("event_type")
            actor = row.get("username") or row.get("actor")
            target = row.get("hostname") or row.get("dest_ip") or row.get("target")
            key = _event_key(ts, sf, et, actor, target)
            if key in chain_keys:
                continue
            raw = row.get("raw") or row.get("summary") or ""
            detail = (raw if isinstance(raw, str) else str(raw))[:180]
            fid = _ces_fingerprint(ts, sf, et, actor, target, raw)
            events.append(
                {
                    "id": f"ces:{fid}",
                    "kind": "ces",
                    "ts": ts,
                    "label": et,
                    "detail": detail,
                    "severity": row.get("severity"),
                    "actor": actor,
                    "target": target,
                    "source_file": sf,
                    "entities": [x for x in (actor, target) if x],
                }
            )

        # Empty correlation shell (common when parse yields few CES links) —
        # still show pipeline stage timeline so the Investigation tab is not blank.
        if not events:
            source = "pipeline"
            _append_pipeline_events()
    else:
        _append_pipeline_events()

    # Stable sort: parseable ts asc; unparseable last, preserve append order
    for idx, ev in enumerate(events):
        ev["_ord"] = idx
    def _sort_key(ev: Dict[str, Any]):
        dt = _parse_ts(ev.get("ts"))
        if dt is None:
            return (1, 0, ev["_ord"])
        return (0, dt.timestamp(), ev["_ord"])

    events.sort(key=_sort_key)
    for ev in events:
        ev.pop("_ord", None)

    # Filters
    filtered = events
    if source_file is not None and source_file != "":
        filtered = [e for e in filtered if e.get("source_file") == source_file]
    if severity is not None and severity != "":
        sev_l = str(severity).lower()
        filtered = [
            e for e in filtered if str(e.get("severity") or "").lower() == sev_l
        ]
    if kind is not None and kind != "":
        filtered = [e for e in filtered if e.get("kind") == kind]

    total_before = len(filtered)
    limited = filtered[:limit]

    by_kind = {"attack_chain": 0, "ces": 0, "pipeline": 0}
    for e in limited:
        k = e.get("kind")
        if k in by_kind:
            by_kind[k] += 1

    return {
        "events": limited,
        "stats": {
            "total_before_limit": total_before,
            "returned": len(limited),
            "by_kind": by_kind,
        },
        "source": source,
    }


def _node_id(ntype: str, value: str) -> str:
    return f"{ntype}:{value}"


def _ioc_type_to_node(ioc_type: str) -> Optional[str]:
    t = (ioc_type or "").lower()
    if t in ("ip", "ipv4", "ipv6"):
        return "ip"
    if t in ("domain", "hostname", "host"):
        return "domain" if t == "domain" else "host"
    if t in ("hash", "md5", "sha1", "sha256", "hash_md5", "hash_sha1", "hash_sha256"):
        return "hash"
    if t in ("email", "user", "username"):
        return "user"
    if t == "url":
        return None  # skip raw URLs for MVP node set
    return None


def build_entity_graph(
    incident: dict,
    *,
    max_nodes: int = 40,
    max_edges: int = 80,
) -> dict:
    """Deterministic entity graph with node/edge caps."""
    max_nodes = max(1, min(int(max_nodes or 40), 100))
    max_edges = max(1, min(int(max_edges or 80), 200))
    incident = incident or {}
    corr = incident.get("correlation") if isinstance(incident.get("correlation"), dict) else {}

    # weight / threat accumulators
    weights: Dict[str, float] = defaultdict(float)
    threats: Dict[str, float] = defaultdict(float)
    types: Dict[str, str] = {}
    labels: Dict[str, str] = {}

    def _add_node(ntype: str, value: Any, weight: float = 1.0, threat: float = 0.0) -> None:
        if value is None or value == "":
            return
        v = str(value)
        nid = _node_id(ntype, v)
        weights[nid] += float(weight)
        if threat:
            threats[nid] = max(threats[nid], float(threat))
        types[nid] = ntype
        labels[nid] = v

    entities = corr.get("entities") or {}
    if isinstance(entities, dict):
        mapping = [
            ("ips", "ip"),
            ("users", "user"),
            ("hosts", "host"),
            ("domains", "domain"),
            ("hashes", "hash"),
            ("processes", "process"),
        ]
        for key, ntype in mapping:
            for item in entities.get(key) or []:
                if isinstance(item, dict):
                    _add_node(ntype, item.get("value"), weight=float(item.get("count") or 1))
                elif item:
                    _add_node(ntype, item, weight=1.0)

    for ioc in incident.get("iocs") or []:
        if not isinstance(ioc, dict):
            continue
        ntype = _ioc_type_to_node(str(ioc.get("type") or ""))
        if not ntype:
            # try value heuristics
            continue
        score = ioc.get("threat_score")
        try:
            threat = float(score) if score is not None else 0.0
        except (TypeError, ValueError):
            threat = 0.0
        w = threat if threat > 0 else 1.0
        _add_node(ntype, ioc.get("value"), weight=w, threat=threat)

    # Sort nodes and take top max_nodes
    sorted_ids = sorted(weights.keys(), key=lambda nid: (-weights[nid], nid))
    selected = sorted_ids[:max_nodes]
    selected_set = set(selected)

    edges_acc: Dict[str, Dict[str, Any]] = {}

    def _add_edge(source: str, target: str, kind: str, weight: float = 1.0) -> None:
        if source not in selected_set or target not in selected_set:
            return
        if source == target:
            return
        a, b = (source, target) if source < target else (target, source)
        # chain / related_technique keep directed for id; undirected kinds normalize
        if kind in ("observed_with", "cross_file"):
            s, t = a, b
        else:
            s, t = source, target
            if s > t and kind == "chain":
                # chain is directed actor->target; keep as given if both selected
                s, t = source, target
        eid = f"{kind}:{s}->{t}"
        if eid in edges_acc:
            edges_acc[eid]["weight"] = float(edges_acc[eid]["weight"]) + float(weight)
        else:
            edges_acc[eid] = {
                "id": eid,
                "source": s,
                "target": t,
                "kind": kind,
                "weight": float(weight),
            }

    # cross_file edges among top correlations sharing files
    correlations = corr.get("correlations") or []
    if not isinstance(correlations, list):
        correlations = []
    top_corrs = [c for c in correlations if isinstance(c, dict) and (c.get("file_count") or 0) >= 2]
    for c in top_corrs:
        kind = str(c.get("kind") or "")
        value = c.get("value")
        if not kind or value is None:
            continue
        # map correlation kind to node type
        ntype = {"ip": "ip", "user": "user", "host": "host", "domain": "domain", "hash": "hash"}.get(kind, kind)
        nid = _node_id(ntype, str(value))
        if nid not in selected_set:
            continue
        files = set(c.get("files") or [])
        partners = 0
        for other in top_corrs:
            if other is c or partners >= 5:
                continue
            ofiles = set(other.get("files") or [])
            if not files.intersection(ofiles):
                continue
            okind = str(other.get("kind") or "")
            oval = other.get("value")
            ontype = {"ip": "ip", "user": "user", "host": "host", "domain": "domain", "hash": "hash"}.get(
                okind, okind
            )
            oid = _node_id(ontype, str(oval))
            if oid in selected_set and oid != nid:
                _add_edge(nid, oid, "cross_file", weight=float(c.get("event_count") or 1))
                partners += 1

    # observed_with from timeline co-occurrence
    timeline = corr.get("timeline") or []
    if not isinstance(timeline, list):
        timeline = []
    for row in timeline[:500]:
        if not isinstance(row, dict):
            continue
        present: List[str] = []
        for ntype, field in (
            ("ip", "source_ip"),
            ("ip", "dest_ip"),
            ("host", "hostname"),
            ("user", "username"),
            ("domain", "domain"),
            ("hash", "hash"),
        ):
            v = row.get(field)
            if v is None or v == "":
                continue
            nid = _node_id(ntype, str(v))
            if nid in selected_set:
                present.append(nid)
        # unique preserve order
        seen = set()
        uniq = []
        for p in present:
            if p not in seen:
                seen.add(p)
                uniq.append(p)
        if len(uniq) > 5:
            uniq = sorted(uniq, key=lambda nid: (-weights.get(nid, 0), nid))[:5]
        pairs = 0
        for i in range(len(uniq)):
            for j in range(i + 1, len(uniq)):
                if pairs >= 10:
                    break
                _add_edge(uniq[i], uniq[j], "observed_with", weight=1.0)
                pairs += 1
            if pairs >= 10:
                break

    # chain edges from consecutive attack_chain steps
    chain = corr.get("attack_chain") or []
    if not isinstance(chain, list):
        chain = []
    for i in range(len(chain) - 1):
        a, b = chain[i], chain[i + 1]
        if not isinstance(a, dict) or not isinstance(b, dict):
            continue
        # map actor/target to selected nodes by scanning known types
        def _resolve(val: Any) -> Optional[str]:
            if val is None or val == "":
                return None
            s = str(val)
            for ntype in ("user", "ip", "host", "domain", "hash", "process"):
                nid = _node_id(ntype, s)
                if nid in selected_set:
                    return nid
            return None

        sa = _resolve(a.get("actor"))
        tb = _resolve(b.get("target")) or _resolve(b.get("actor"))
        ta = _resolve(a.get("target"))
        sb = _resolve(b.get("actor"))
        if sa and tb:
            _add_edge(sa, tb, "chain", weight=1.0)
        elif sa and sb:
            _add_edge(sa, sb, "chain", weight=1.0)
        elif ta and sb:
            _add_edge(ta, sb, "chain", weight=1.0)

    # IoC–technique light edges
    tech_edges = 0
    for tech in incident.get("techniques") or []:
        if tech_edges >= 20:
            break
        if not isinstance(tech, dict):
            continue
        tid = tech.get("id") or tech.get("technique_id")
        related = tech.get("related_iocs") or tech.get("iocs") or []
        if not tid or not related:
            continue
        for riv in related:
            if tech_edges >= 20:
                break
            val = riv.get("value") if isinstance(riv, dict) else riv
            if not val:
                continue
            for ntype in ("ip", "domain", "hash", "host", "user"):
                nid = _node_id(ntype, str(val))
                if nid in selected_set:
                    # technique as meta edge endpoint encoded in kind label target
                    tech_nid = f"technique:{tid}"
                    # only if we somehow selected techniques — skip if not in nodes
                    if tech_nid in selected_set:
                        _add_edge(nid, tech_nid, "related_technique", weight=1.0)
                        tech_edges += 1
                    break

    edge_list = list(edges_acc.values())
    edge_list.sort(
        key=lambda e: (-float(e["weight"]), e["kind"], e["source"], e["target"])
    )
    truncated = len(edge_list) > max_edges
    edge_list = edge_list[:max_edges]

    nodes = [
        {
            "id": nid,
            "type": types[nid],
            "label": labels[nid],
            "weight": weights[nid],
            "threat_score": threats.get(nid) or 0.0,
            "meta": {},
        }
        for nid in selected
    ]
    # stable node order: weight desc, id asc (selected already ordered)
    return {
        "nodes": nodes,
        "edges": edge_list,
        "stats": {
            "node_count": len(nodes),
            "edge_count": len(edge_list),
            "truncated": truncated or len(sorted_ids) > max_nodes,
        },
    }
