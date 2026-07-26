"""Natural-language threat hunting helpers (Wave B).

Rule-based NL → intent + keyword bag, then score incidents offline-friendly.
No LLM required for MVP hunting (deterministic, CI-safe).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, Tuple

# Intent patterns: (regex, intent_id, display_label, extra_keywords, technique_hints)
_INTENT_RULES: List[Tuple[str, str, str, List[str], List[str]]] = [
    (
        r"powershell|pwsh|encoded\s+command|base64.*command|-enc\b|downloadstring",
        "powershell",
        "Suspicious PowerShell / encoded commands",
        ["powershell", "pwsh", "encoded", "base64", "-enc", "invoke-expression", "iex", "downloadstring"],
        ["T1059", "T1059.001"],
    ),
    (
        r"lateral\s+movement|psexec|wmi(exec)?|remote\s+desktop|rdp|smb\s+lateral|pass[\s-]?the[\s-]?hash",
        "lateral_movement",
        "Lateral movement",
        ["lateral", "psexec", "wmiexec", "rdp", "smb", "pass-the-hash", "remote"],
        ["T1021", "T1021.001", "T1021.002", "T1570"],
    ),
    (
        r"ransom|encrypt(ed|ion)?\s+files?|lockbit|conti|blackcat|extortion",
        "ransomware",
        "Ransomware indicators",
        ["ransom", "encrypt", "lockbit", "conti", "blackcat", "extortion", ".encrypted"],
        ["T1486", "T1490"],
    ),
    (
        r"dns|dga|tunnel(ing)?|suspicious\s+domain|cname\s+abuse",
        "suspicious_dns",
        "Suspicious DNS",
        ["dns", "dga", "tunnel", "nxdomain", "txt query", "domain"],
        ["T1071.004", "T1568"],
    ),
    (
        r"persist(ence)?|run\s*key|scheduled\s+task|startup|cron|launchagent|services?\.exe",
        "persistence",
        "Persistence",
        ["persistence", "run key", "scheduled task", "startup", "cron", "autostart", "service"],
        ["T1547", "T1053", "T1543"],
    ),
    (
        r"beacon|c2|command\s*&\s*control|callback|implant",
        "c2_beacon",
        "C2 / beaconing",
        ["beacon", "c2", "callback", "implant", "command and control"],
        ["T1071", "T1573"],
    ),
    (
        r"lolbin|living[\s-]?off[\s-]?the[\s-]?land|certutil|mshta|regsvr32|rundll32|bitsadmin",
        "lolbins",
        "LOLBins / living-off-the-land",
        ["lolbin", "certutil", "mshta", "regsvr32", "rundll32", "bitsadmin", "wscript"],
        ["T1218", "T1105"],
    ),
    (
        r"brute\s*force|password\s+spray|failed\s+login|credential\s+stuff",
        "bruteforce",
        "Brute force / credential attacks",
        ["brute", "password spray", "failed login", "credential", "ssh", "rdp login"],
        ["T1110", "T1110.001", "T1110.003"],
    ),
    (
        r"exfil|data\s+theft|upload\s+to|cloud\s+sync\s+exfil",
        "exfiltration",
        "Data exfiltration",
        ["exfil", "exfiltration", "data theft", "upload", "transfer"],
        ["T1041", "T1567"],
    ),
    (
        r"phish|spear.?phish|macro|attachment|invoice\.doc",
        "phishing",
        "Phishing / initial access mail",
        ["phish", "macro", "attachment", "spear", "email"],
        ["T1566", "T1566.001"],
    ),
    (
        r"privilege\s+escalat|getsystem|uac\s+bypass|token\s+imperson",
        "priv_esc",
        "Privilege escalation",
        ["privilege", "escalat", "getsystem", "uac", "token"],
        ["T1068", "T1134", "T1548"],
    ),
]


@dataclass
class HuntIntent:
    intent_id: str
    label: str
    keywords: List[str] = field(default_factory=list)
    technique_hints: List[str] = field(default_factory=list)
    free_tokens: List[str] = field(default_factory=list)
    severity_min: Optional[str] = None


def _tokenize(q: str) -> List[str]:
    return [t for t in re.split(r"[^a-zA-Z0-9_.+-]+", (q or "").lower()) if len(t) >= 2]


def parse_hunt_query(query: str) -> HuntIntent:
    """Map NL query to a HuntIntent (deterministic)."""
    q = (query or "").strip()
    ql = q.lower()
    free = _tokenize(q)

    severity_min = None
    if re.search(r"\bcritical\b", ql):
        severity_min = "critical"
    elif re.search(r"\bhigh\b", ql):
        severity_min = "high"

    matched: List[Tuple[str, str, List[str], List[str]]] = []
    for pattern, iid, label, kws, techs in _INTENT_RULES:
        if re.search(pattern, ql, re.I):
            matched.append((iid, label, kws, techs))

    if matched:
        # Prefer first match order as priority list order
        iid, label, kws, techs = matched[0]
        # merge keywords from all matched intents
        all_kws = list(dict.fromkeys([*kws, *[k for m in matched for k in m[2]]]))
        all_techs = list(dict.fromkeys([*techs, *[t for m in matched for t in m[3]]]))
        labels = " + ".join(m[1] for m in matched[:3])
        return HuntIntent(
            intent_id="+".join(m[0] for m in matched[:3]),
            label=labels,
            keywords=all_kws,
            technique_hints=all_techs,
            free_tokens=free,
            severity_min=severity_min,
        )

    # Free-text bag: drop stopwords
    stop = {
        "find",
        "show",
        "all",
        "the",
        "a",
        "an",
        "of",
        "to",
        "for",
        "and",
        "or",
        "with",
        "any",
        "suspicious",
        "incidents",
        "incident",
        "cases",
        "case",
        "please",
        "list",
        "get",
        "me",
    }
    tokens = [t for t in free if t not in stop]
    return HuntIntent(
        intent_id="free_text",
        label="Free-text hunt",
        keywords=tokens,
        technique_hints=[],
        free_tokens=tokens,
        severity_min=severity_min,
    )


def _incident_blob(inc: dict) -> str:
    parts: List[str] = [
        str(inc.get("title") or ""),
        str(inc.get("summary") or ""),
        str(inc.get("severity") or ""),
        str(inc.get("status") or ""),
    ]
    for i in inc.get("iocs") or []:
        if isinstance(i, dict):
            parts.append(str(i.get("type") or ""))
            parts.append(str(i.get("value") or ""))
    for t in inc.get("techniques") or []:
        if isinstance(t, dict):
            parts.append(str(t.get("technique_id") or t.get("id") or ""))
            parts.append(str(t.get("name") or ""))
            parts.append(str(t.get("tactic") or ""))
    corr = inc.get("correlation") if isinstance(inc.get("correlation"), dict) else {}
    for step in (corr.get("attack_chain") or [])[:20]:
        if isinstance(step, dict):
            parts.append(str(step.get("event_type") or ""))
            parts.append(str(step.get("summary") or ""))
            parts.append(str(step.get("actor") or ""))
            parts.append(str(step.get("target") or ""))
    for c in (corr.get("correlations") or [])[:20]:
        if isinstance(c, dict):
            parts.append(str(c.get("kind") or ""))
            parts.append(str(c.get("value") or ""))
    return " ".join(parts).lower()


_SEV_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}


def score_incident(inc: dict, intent: HuntIntent) -> Tuple[float, List[str]]:
    """Return (score, match_reasons). Score 0 = no match."""
    blob = _incident_blob(inc)
    reasons: List[str] = []
    score = 0.0

    if intent.severity_min:
        need = _SEV_RANK.get(intent.severity_min, 0)
        have = _SEV_RANK.get(str(inc.get("severity") or "info").lower(), 0)
        if have < need:
            return 0.0, []
        reasons.append(f"severity>={intent.severity_min}")

    for kw in intent.keywords:
        if kw and kw.lower() in blob:
            score += 2.0
            reasons.append(f"keyword:{kw}")

    tech_ids = {
        (t.get("technique_id") or t.get("id") or "").upper()
        for t in (inc.get("techniques") or [])
        if isinstance(t, dict)
    }
    for hint in intent.technique_hints:
        h = hint.upper()
        if any(tid == h or tid.startswith(h + ".") for tid in tech_ids):
            score += 4.0
            reasons.append(f"technique:{h}")

    # free tokens not already counted as keywords
    for tok in intent.free_tokens:
        if tok in (k.lower() for k in intent.keywords):
            continue
        if tok in blob:
            score += 1.0
            reasons.append(f"token:{tok}")

    # Mild boost for higher severity when already matching
    if score > 0:
        score += 0.1 * _SEV_RANK.get(str(inc.get("severity") or "info").lower(), 0)

    return score, reasons[:12]


def hunt_incidents(
    incidents: Sequence[dict],
    query: str,
    *,
    limit: int = 25,
) -> Dict[str, Any]:
    """Score and rank incidents for a NL query."""
    intent = parse_hunt_query(query)
    limit = max(1, min(int(limit or 25), 100))
    scored: List[Dict[str, Any]] = []
    for inc in incidents:
        if not isinstance(inc, dict):
            continue
        sc, reasons = score_incident(inc, intent)
        if sc <= 0:
            continue
        scored.append(
            {
                "id": inc.get("id"),
                "title": inc.get("title"),
                "severity": inc.get("severity"),
                "status": inc.get("status"),
                "threat_score": inc.get("threat_score"),
                "score": round(sc, 2),
                "reasons": reasons,
                "techniques": [
                    t.get("technique_id") or t.get("id")
                    for t in (inc.get("techniques") or [])[:6]
                    if isinstance(t, dict)
                ],
            }
        )
    scored.sort(key=lambda x: (-x["score"], str(x.get("id") or "")))
    return {
        "query": query,
        "intent": {
            "id": intent.intent_id,
            "label": intent.label,
            "keywords": intent.keywords[:20],
            "technique_hints": intent.technique_hints,
            "severity_min": intent.severity_min,
        },
        "total_candidates": len(incidents),
        "total_matches": len(scored),
        "hits": scored[:limit],
        "suggestions": [
            "Find suspicious PowerShell",
            "Show lateral movement",
            "Find ransomware indicators",
            "Show suspicious DNS",
            "Find persistence",
            "Find all encoded commands",
            "Show high severity brute force",
        ],
    }
