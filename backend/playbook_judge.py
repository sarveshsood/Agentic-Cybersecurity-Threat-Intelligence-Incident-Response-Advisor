"""Lightweight playbook quality judge (rule-based, offline-safe).

Optional second-pass LLM judge is behind ``ACTIRA_PLAYBOOK_JUDGE_LLM=1`` and
uses a small prompt; default is deterministic rules only (no cost).
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

REQUIRED_PHASES = ("containment", "eradication", "recovery", "lessons_learned")


def judge_playbook(
    playbook: Any,
    *,
    valid_citation_ids: Optional[set] = None,
) -> Dict[str, Any]:
    """Score a Playbook model or dict. Returns confidence 0–1 + findings."""
    findings: List[str] = []
    score = 1.0

    if hasattr(playbook, "model_dump"):
        data = playbook.model_dump()
    elif isinstance(playbook, dict):
        data = playbook
    else:
        return {
            "ok": False,
            "confidence": 0.0,
            "findings": ["unreadable_playbook"],
            "engine": "rules_v1",
        }

    steps = data.get("steps") or []
    if not steps:
        return {
            "ok": False,
            "confidence": 0.15,
            "findings": ["no_steps"],
            "engine": "rules_v1",
        }

    phases = {(s.get("phase") or "").lower() for s in steps if isinstance(s, dict)}
    missing = [p for p in REQUIRED_PHASES if p not in phases]
    if missing:
        findings.append(f"missing_phases:{','.join(missing)}")
        score -= 0.12 * len(missing)

    bare = 0
    bad_cite = 0
    valid = valid_citation_ids or set()
    for s in steps:
        if not isinstance(s, dict):
            continue
        action = (s.get("action") or "").strip()
        if len(action) < 12:
            bare += 1
        cids = s.get("citation_ids") or []
        if not cids:
            bare += 1
        elif valid:
            for c in cids:
                if c not in valid:
                    bad_cite += 1

    if bare:
        findings.append(f"thin_or_uncited_steps:{bare}")
        score -= min(0.35, 0.05 * bare)
    if bad_cite:
        findings.append(f"unknown_citations:{bad_cite}")
        score -= min(0.25, 0.04 * bad_cite)

    conf = max(0.0, min(1.0, score))
    return {
        "ok": conf >= 0.45 and not missing,
        "confidence": round(conf, 3),
        "findings": findings,
        "step_count": len(steps),
        "phases_present": sorted(phases),
        "engine": "rules_v1",
    }


def llm_judge_enabled() -> bool:
    """Optional LLM second-pass. Rules always run first; default off (no cost).

    Set ``ACTIRA_PLAYBOOK_JUDGE_LLM=1`` to enable. Values ``auto`` also enable
    only when ``ENV`` is production/staging (still opt-in via profile, not silent).
    """
    raw = (os.environ.get("ACTIRA_PLAYBOOK_JUDGE_LLM") or "0").strip().lower()
    if raw in ("1", "true", "yes", "on"):
        return True
    if raw in ("0", "false", "no", "off", ""):
        return False
    if raw in ("auto",):
        env = (os.environ.get("ENV") or "dev").strip().lower()
        return env in ("production", "prod", "staging")
    return False


JUDGE_SYSTEM = """You are a SOC quality reviewer. Score an IR playbook JSON for structure and usefulness.
Return ONLY JSON:
{"confidence": 0.0-1.0, "ok": true/false, "findings": ["short issues"], "summary": "one sentence"}
Be strict about missing phases, vague actions, and uncited steps. Do not invent evidence."""


async def judge_playbook_llm(
    playbook: Any,
    *,
    settings: Optional[Dict[str, Any]] = None,
    valid_citation_ids: Optional[set] = None,
) -> Dict[str, Any]:
    """Optional LLM second-pass judge. Falls back to rules if disabled or on error."""
    rules = judge_playbook(playbook, valid_citation_ids=valid_citation_ids)
    if not llm_judge_enabled():
        return rules

    try:
        from backend.llm_provider import call_llm, parse_llm_json

        if hasattr(playbook, "model_dump"):
            data = playbook.model_dump()
        else:
            data = playbook if isinstance(playbook, dict) else {}
        import json

        user = (
            "Playbook steps to review:\n"
            + json.dumps(data.get("steps") or [], ensure_ascii=False)[:6000]
            + "\n\nAllowed citation ids: "
            + ", ".join(sorted(valid_citation_ids or []))[:500]
        )
        text, prov, model = await call_llm(
            system=JUDGE_SYSTEM,
            user=user,
            settings=settings or {},
            json_mode=True,
            session_id="playbook-judge",
        )
        parsed = parse_llm_json(text) or {}
        conf = float(parsed.get("confidence", rules["confidence"]))
        conf = max(0.0, min(1.0, conf))
        findings = list(parsed.get("findings") or []) + list(rules.get("findings") or [])
        # Never score above rules by more than 0.15 (LLM optimism guard)
        conf = min(conf, float(rules["confidence"]) + 0.15)
        return {
            "ok": bool(parsed.get("ok", conf >= 0.5)) and rules.get("ok", True),
            "confidence": round(conf, 3),
            "findings": findings[:12],
            "summary": (parsed.get("summary") or "")[:300],
            "engine": f"rules+llm:{prov}/{model}",
            "rules_confidence": rules.get("confidence"),
        }
    except Exception as e:
        logger.info("LLM playbook judge failed, using rules: %s", e)
        rules = dict(rules)
        rules["engine"] = "rules_v1_llm_fallback"
        rules["findings"] = list(rules.get("findings") or []) + [f"llm_judge_error:{type(e).__name__}"]
        return rules
