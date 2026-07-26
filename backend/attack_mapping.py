"""ATT&CK technique inference with sub-techniques, evidence, and CES-aware rules.

Pipeline calls ``infer_techniques(log_text, iocs, events=...)``.
Optional LLM refinement: ``refine_techniques_with_llm`` (allow-list validated).
"""
from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

from backend.attack_catalog import (
    ATTACK_CATALOG,
    catalog_entry_for_api,
    get_technique,
    is_known_technique,
    root_id,
)

logger = logging.getLogger(__name__)

# Ordered rules: more specific (sub-technique) first. Each rule:
#   technique_id, keywords (any match in lower text), weight
# CES heuristics applied separately in _ces_rules.

_KEYWORD_RULES: List[Tuple[str, List[str], float]] = [
    # T1110 sub
    ("T1110.003", ["password spray", "password spraying", "spray attack", "spraying passwords"], 0.35),
    ("T1110.004", ["credential stuffing", "stuffed credentials", "breach combo", "combolist"], 0.35),
    ("T1110.002", ["hashcat", "john the ripper", "password crack", "ntlm crack", "offline crack"], 0.35),
    ("T1110.001", ["password guess", "guessing password", "dictionary attack"], 0.3),
    ("T1110", ["failed password", "authentication failure", "brute", "invalid user", "login failed", "failed login",
               "failed logon"], 0.2),
    # T1078 sub
    ("T1078.004", ["azure ad", "office 365", "oauth token", "cloud account", "aws iam", "assumed role"], 0.3),
    ("T1078", ["successful login", "accepted password", "user logged on", "logon type", "session opened"], 0.2),
    # T1566 sub
    ("T1566.001", ["attachment", "macro-enabled", "invoice.docm", "winword", "ole object", ".xlsm", "vba project"],
     0.3),
    ("T1566.002", ["phishing link", "click the link", "suspicious url in email", "bit.ly", "credential harvest page"],
     0.3),
    ("T1566.003", ["oauth phishing", "consent phishing", "third-party app consent", "slack phishing"], 0.3),
    ("T1566", ["phishing", "suspicious email", "smtp", "spearphish", "malicious email"], 0.2),
    # T1059 sub
    ("T1059.001", ["powershell", "pwsh", "invoke-expression", "iex(", "frombase64string", "-enc ", "-encodedcommand"],
     0.35),
    ("T1059.003", ["cmd.exe", "cmd /c", "command.com"], 0.3),
    ("T1059.004", ["/bin/sh", "/bin/bash", "bash -c", "zsh -c"], 0.3),
    ("T1059.005", ["wscript", "cscript", "vbscript", "vba", ".vbs"], 0.3),
    ("T1059.007", ["wscript.shell", "jscript", "mshta javascript", "node -e"], 0.25),
    ("T1059", ["scripting interpreter", "command interpreter"], 0.15),
    # T1053 sub
    ("T1053.003", ["crontab", "cron job", "/etc/cron", "cron.d"], 0.35),
    ("T1053.005", ["schtasks", "scheduled task", "task scheduler", "at.exe"], 0.35),
    ("T1053", ["scheduled job", "at "], 0.15),
    # T1071 sub
    ("T1071.004", ["dns tunneling", "dns query c2", "txt record beacon", "dns c2"], 0.35),
    ("T1071.001", ["http post", "https beacon", "user-agent", "c2 http", "callback http"], 0.3),
    ("T1071", ["c2", "beacon", "callback", "command and control"], 0.2),
    # T1105
    ("T1105", ["wget", "curl ", "certutil -urlcache", "bitsadmin", "downloadstring", "iwr ", "invoke-webrequest"], 0.3),
    # T1190
    ("T1190", ["sql injection", "xss", "log4j", "jndi:", "proxyshell", "cve-", "exploit", "rce"], 0.25),
    # T1046
    ("T1046", ["port scan", "nmap", "masscan", "connection refused", "syn scan", "service discovery"], 0.25),
    # T1486
    ("T1486", ["ransomware", "encrypted", "readme.txt", ".locked", ".enc", "your files have been"], 0.3),
]


def _snippet(text: str, keyword: str, width: int = 100) -> str:
    lower = text.lower()
    idx = lower.find(keyword.lower())
    if idx < 0:
        return (text or "")[:width]
    start = max(0, idx - 40)
    end = min(len(text), idx + len(keyword) + 60)
    snip = text[start:end].replace("\n", " ").strip()
    if start > 0:
        snip = "…" + snip
    if end < len(text):
        snip = snip + "…"
    return snip[:width]


def _empty_hit(tid: str) -> Optional[Dict[str, Any]]:
    meta = get_technique(tid)
    if not meta:
        return None
    return {
        "technique_id": tid,
        "parent_id": meta.get("parent_id"),
        "name": meta["name"],
        "tactic": meta.get("tactic") or "",
        "confidence": 0.5,
        "matched_keywords": [],
        "matched_rules": [],
        "evidence": [],
        "platforms": list(meta.get("platforms") or []),
        "data_sources": list(meta.get("data_sources") or []),
        "mitigations": list(meta.get("mitigations") or []),
        "url": meta.get("url") or "",
        "description": meta.get("description") or "",
        "source": "keyword",
    }


def _merge_hit(bucket: Dict[str, Dict[str, Any]], hit: Dict[str, Any]) -> None:
    tid = hit["technique_id"]
    if tid not in bucket:
        bucket[tid] = hit
        return
    cur = bucket[tid]
    cur["confidence"] = min(0.98, max(float(cur.get("confidence") or 0), float(hit.get("confidence") or 0)) + 0.05)
    for k in ("matched_keywords", "matched_rules"):
        seen = set(cur.get(k) or [])
        for x in hit.get(k) or []:
            if x not in seen:
                cur.setdefault(k, []).append(x)
                seen.add(x)
    ev = cur.setdefault("evidence", [])
    for e in hit.get("evidence") or []:
        key = (e.get("snippet"), e.get("source_file"), e.get("rule"))
        if not any((x.get("snippet"), x.get("source_file"), x.get("rule")) == key for x in ev):
            ev.append(e)
            if len(ev) >= 8:
                break


def _keyword_pass(log_text: str) -> Dict[str, Dict[str, Any]]:
    lower = (log_text or "").lower()
    text = log_text or ""
    bucket: Dict[str, Dict[str, Any]] = {}
    for tid, kws, weight in _KEYWORD_RULES:
        matched = [k for k in kws if k in lower]
        if not matched:
            continue
        base = _empty_hit(tid)
        if not base:
            continue
        conf = min(0.5 + weight * len(matched) + 0.08 * (len(matched) - 1), 0.98)
        base["confidence"] = conf
        base["matched_keywords"] = matched
        base["matched_rules"] = [f"keyword:{tid}"]
        base["evidence"] = [
            {
                "rule": f"keyword:{tid}",
                "keyword": m,
                "snippet": _snippet(text, m),
                "source_file": None,
            }
            for m in matched[:3]
        ]
        base["source"] = "keyword"
        _merge_hit(bucket, base)
    return bucket


def _ces_pass(events: Sequence[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """CES-aware heuristics for sub-technique discrimination."""
    if not events:
        return {}
    bucket: Dict[str, Dict[str, Any]] = {}

    failed_auth: List[Dict[str, Any]] = []
    success_auth: List[Dict[str, Any]] = []
    for ev in events:
        raw = (ev.get("raw") or "").lower()
        et = (ev.get("event_type") or "").lower()
        proc = (ev.get("process") or "").lower()
        if any(x in raw for x in ("failed password", "authentication failure", "failed logon",
                                  "invalid user")) or "fail" in et and "auth" in et:
            failed_auth.append(ev)
        if any(x in raw for x in
               ("accepted password", "successful login", "session opened")) or "success" in et and "logon" in et:
            success_auth.append(ev)

        # Process-based
        if "powershell" in proc or "powershell" in raw or "pwsh" in proc:
            h = _empty_hit("T1059.001")
            if h:
                h["confidence"] = 0.88
                h["matched_rules"] = ["ces:process_powershell"]
                h["source"] = "ces"
                h["evidence"] = [{
                    "rule": "ces:process_powershell",
                    "snippet": (ev.get("raw") or "")[:160],
                    "source_file": ev.get("source_file"),
                    "event_type": ev.get("event_type"),
                    "process": ev.get("process"),
                }]
                _merge_hit(bucket, h)
        if proc in ("cmd.exe", "cmd") or "cmd.exe" in raw:
            h = _empty_hit("T1059.003")
            if h:
                h["confidence"] = 0.82
                h["matched_rules"] = ["ces:process_cmd"]
                h["source"] = "ces"
                h["evidence"] = [{
                    "rule": "ces:process_cmd",
                    "snippet": (ev.get("raw") or "")[:160],
                    "source_file": ev.get("source_file"),
                }]
                _merge_hit(bucket, h)
        if any(x in proc or x in raw for x in ("/bin/bash", "/bin/sh", "bash -c")):
            h = _empty_hit("T1059.004")
            if h:
                h["confidence"] = 0.82
                h["matched_rules"] = ["ces:process_unix_shell"]
                h["source"] = "ces"
                h["evidence"] = [{
                    "rule": "ces:process_unix_shell",
                    "snippet": (ev.get("raw") or "")[:160],
                    "source_file": ev.get("source_file"),
                }]
                _merge_hit(bucket, h)

        # DNS C2-ish
        if ev.get("domain") and any(x in raw for x in ("dns", "query", "txt")):
            if any(x in raw for x in ("beacon", "c2", "tunnel")):
                h = _empty_hit("T1071.004")
                if h:
                    h["confidence"] = 0.8
                    h["matched_rules"] = ["ces:dns_c2"]
                    h["source"] = "ces"
                    h["evidence"] = [{
                        "rule": "ces:dns_c2",
                        "snippet": (ev.get("raw") or "")[:160],
                        "source_file": ev.get("source_file"),
                        "domain": ev.get("domain"),
                    }]
                    _merge_hit(bucket, h)

    # Brute-force discrimination
    if len(failed_auth) >= 3:
        users = [e.get("username") for e in failed_auth if e.get("username")]
        ips = [e.get("source_ip") for e in failed_auth if e.get("source_ip")]
        user_counts = Counter(users)
        ip_counts = Counter(ips)
        distinct_users = len(set(users))
        distinct_ips = len(set(ips))
        top_user_n = user_counts.most_common(1)[0][1] if user_counts else 0
        top_ip_n = ip_counts.most_common(1)[0][1] if ip_counts else 0

        # Spray: many users, relatively few attempts per user, often same IP
        if distinct_users >= 4 and top_user_n <= 3:
            tid = "T1110.003"
            rule = "ces:auth_spray"
            conf = 0.9
        # Guessing: one/few users, many failures
        elif top_user_n >= 5 or (distinct_users <= 2 and len(failed_auth) >= 5):
            tid = "T1110.001"
            rule = "ces:auth_guessing"
            conf = 0.88
        else:
            tid = "T1110"
            rule = "ces:auth_brute_generic"
            conf = 0.75

        h = _empty_hit(tid)
        if h:
            h["confidence"] = conf
            h["matched_rules"] = [rule]
            h["source"] = "ces"
            sample = failed_auth[:3]
            h["evidence"] = [
                {
                    "rule": rule,
                    "snippet": (e.get("raw") or "")[:160],
                    "source_file": e.get("source_file"),
                    "username": e.get("username"),
                    "source_ip": e.get("source_ip"),
                    "stats": {
                        "failed_auth_events": len(failed_auth),
                        "distinct_users": distinct_users,
                        "distinct_source_ips": distinct_ips,
                        "top_user_failures": top_user_n,
                        "top_ip_failures": top_ip_n,
                    },
                }
                for e in sample
            ]
            _merge_hit(bucket, h)

    if success_auth:
        h = _empty_hit("T1078")
        if h:
            h["confidence"] = 0.72
            h["matched_rules"] = ["ces:successful_auth"]
            h["source"] = "ces"
            h["evidence"] = [{
                "rule": "ces:successful_auth",
                "snippet": (success_auth[0].get("raw") or "")[:160],
                "source_file": success_auth[0].get("source_file"),
            }]
            _merge_hit(bucket, h)

    return bucket


def _ioc_pass(iocs: Sequence[Any]) -> Dict[str, Dict[str, Any]]:
    bucket: Dict[str, Dict[str, Any]] = {}
    for i in iocs or []:
        itype = getattr(i, "type", None) or (i.get("type") if isinstance(i, dict) else None)
        ival = getattr(i, "value", None) or (i.get("value") if isinstance(i, dict) else None)
        if itype == "cve":
            h = _empty_hit("T1190")
            if h:
                h["confidence"] = 0.85
                h["matched_rules"] = ["ioc:cve"]
                h["source"] = "ioc"
                h["related_iocs"] = [f"cve:{ival}"]
                h["evidence"] = [{
                    "rule": "ioc:cve",
                    "snippet": f"CVE indicator: {ival}",
                    "source_file": None,
                }]
                _merge_hit(bucket, h)
        if itype in ("url", "domain") and ival:
            # phishing-ish free hosts
            low = str(ival).lower()
            if any(x in low for x in ("phish", "login-", "credential", "oauth")):
                h = _empty_hit("T1566.002")
                if h:
                    h["confidence"] = 0.7
                    h["matched_rules"] = ["ioc:suspicious_url"]
                    h["source"] = "ioc"
                    h["related_iocs"] = [f"{itype}:{ival}"]
                    h["evidence"] = [{
                        "rule": "ioc:suspicious_url",
                        "snippet": str(ival)[:160],
                    }]
                    _merge_hit(bucket, h)
    return bucket


def _prefer_subtechniques(bucket: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    """If both parent and child present, keep child (and drop parent unless higher unique evidence)."""
    ids = set(bucket.keys())
    drop: Set[str] = set()
    for tid in list(ids):
        meta = get_technique(tid)
        if not meta:
            continue
        parent = meta.get("parent_id")
        if parent and parent in ids:
            # Prefer sub-technique
            child_conf = float(bucket[tid].get("confidence") or 0)
            parent_conf = float(bucket[parent].get("confidence") or 0)
            if child_conf + 0.05 >= parent_conf:
                drop.add(parent)
                # attach parent context
                bucket[tid]["parent_id"] = parent
            else:
                drop.add(tid)
    return [bucket[t] for t in sorted(bucket.keys()) if t not in drop]


def _attach_related_iocs(hits: List[Dict[str, Any]], iocs: Sequence[Any]) -> None:
    if not iocs:
        return
    sample = []
    for i in list(iocs)[:12]:
        itype = getattr(i, "type", None) or (i.get("type") if isinstance(i, dict) else "")
        ival = getattr(i, "value", None) or (i.get("value") if isinstance(i, dict) else "")
        if itype and ival:
            sample.append(f"{itype}:{ival}")
    for h in hits:
        existing = h.get("related_iocs") or []
        # keep existing + a few global IoCs for context
        merged = list(existing)
        for s in sample:
            if s not in merged:
                merged.append(s)
            if len(merged) >= 8:
                break
        h["related_iocs"] = merged


def infer_techniques(
        log_text: str,
        iocs: Optional[Sequence[Any]] = None,
        events: Optional[Sequence[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    """Infer ATT&CK techniques (incl. sub-techniques) with evidence.

    Returns list of dicts compatible with models.ATTACKTechnique (+ extra fields).
    """
    iocs = iocs or []
    events = events or []
    bucket: Dict[str, Dict[str, Any]] = {}

    for src in (_keyword_pass(log_text or ""), _ces_pass(events), _ioc_pass(iocs)):
        for tid, hit in src.items():
            _merge_hit(bucket, hit)

    hits = _prefer_subtechniques(bucket)
    # Sort by confidence desc
    hits.sort(key=lambda h: float(h.get("confidence") or 0), reverse=True)
    _attach_related_iocs(hits, iocs)

    # Ensure catalog enrichment fields present
    for h in hits:
        meta = get_technique(h["technique_id"]) or {}
        h.setdefault("platforms", meta.get("platforms") or [])
        h.setdefault("data_sources", meta.get("data_sources") or [])
        h.setdefault("mitigations", meta.get("mitigations") or [])
        h.setdefault("url", meta.get("url") or "")
        h.setdefault("description", meta.get("description") or "")
        h.setdefault("parent_id", meta.get("parent_id"))
        h["confidence"] = round(float(h.get("confidence") or 0.5), 3)

    return hits


def technique_ids_for_eval(hits: Sequence[Dict[str, Any]]) -> List[str]:
    """IDs for golden eval: include both sub and parent roots for recall vs parent gold."""
    out: List[str] = []
    seen: Set[str] = set()
    for h in hits:
        tid = h.get("technique_id") if isinstance(h, dict) else None
        if not tid:
            continue
        for x in (tid, root_id(tid)):
            if x not in seen:
                seen.add(x)
                out.append(x)
    return out


async def refine_techniques_with_llm(
        log_text: str,
        current_hits: List[Dict[str, Any]],
        *,
        settings: Optional[dict] = None,
        provider: str = "anthropic",
        model: str = "claude-sonnet-4-6",
) -> List[Dict[str, Any]]:
    """Optional LLM refinement — only allow-listed technique IDs are kept.

    Disabled unless settings.get('llm_technique_refine') is truthy.
    On any failure, returns current_hits unchanged.
    """
    if not settings or not settings.get("llm_technique_refine"):
        return current_hits
    try:
        from backend.llm_provider import call_llm, parse_llm_json
    except Exception as e:
        logger.warning("LLM refine unavailable: %s", e)
        return current_hits

    allow = sorted(ATTACK_CATALOG.keys())
    system = (
        "You are a MITRE ATT&CK mapper. Given log excerpts and candidate techniques, "
        "return JSON {\"techniques\":[{\"technique_id\":\"T#### or T####.###\","
        "\"confidence\":0-1,\"rationale\":\"...\",\"evidence_snippet\":\"...\"}]}. "
        f"ONLY use technique_id values from this allow-list: {', '.join(allow)}. "
        "Prefer sub-techniques when evidence supports them. No markdown."
    )
    user = (
        f"CANDIDATES:\n{current_hits[:12]!r}\n\n"
        f"LOG (truncated):\n{(log_text or '')[:4000]}\n\n"
        "Return refined techniques JSON."
    )
    try:
        text, _, _ = await call_llm(
            system=system,
            user=user,
            provider=provider,
            model=model,
            settings=settings,
            json_mode=(provider in ("openai", "groq")),
        )
        data = parse_llm_json(text)
        refined: List[Dict[str, Any]] = []
        for item in data.get("techniques") or []:
            if not isinstance(item, dict):
                continue
            tid = str(item.get("technique_id") or "").strip().upper()
            if not is_known_technique(tid):
                logger.info("LLM technique rejected (not in allow-list): %s", tid)
                continue
            meta = get_technique(tid) or {}
            refined.append({
                "technique_id": tid,
                "parent_id": meta.get("parent_id"),
                "name": meta.get("name") or tid,
                "tactic": meta.get("tactic") or "",
                "confidence": min(0.98, max(0.4, float(item.get("confidence") or 0.7))),
                "matched_keywords": [],
                "matched_rules": ["llm:refine"],
                "evidence": [{
                    "rule": "llm:refine",
                    "snippet": str(item.get("evidence_snippet") or item.get("rationale") or "")[:200],
                    "rationale": str(item.get("rationale") or "")[:300],
                }],
                "platforms": meta.get("platforms") or [],
                "data_sources": meta.get("data_sources") or [],
                "mitigations": meta.get("mitigations") or [],
                "url": meta.get("url") or "",
                "description": meta.get("description") or "",
                "source": "llm",
            })
        if refined:
            return refined
    except Exception as e:
        logger.warning("LLM technique refine failed: %s", e)
    return current_hits


def catalog_payload(technique_id: str) -> Optional[Dict[str, Any]]:
    return catalog_entry_for_api(technique_id)
