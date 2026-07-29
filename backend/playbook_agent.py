"""Playbook generation via unified LLM provider with citation grounding."""
import logging
from typing import List, Dict, Any

from backend.knowledge_base import kb
from backend.llm_provider import call_llm, parse_llm_json
from backend.models import Playbook, PlaybookStep, IoC
from backend.prompts import PLAYBOOK_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# Stable system prefix — identical on every call. Anthropic path marks this for
# prompt caching (see llm_provider.call_llm use_prompt_cache). Source of truth:
# backend/prompts/playbook.py (Sprint 10 pack).
SYSTEM_PROMPT = PLAYBOOK_SYSTEM_PROMPT


async def generate_playbook(
        incident_summary: str,
        iocs: List[IoC],
        techniques: List[Dict[str, Any]],
        provider: str = "anthropic",
        model: str = "claude-sonnet-4-6",
        groq_api_key: str = None,
        settings: Dict[str, Any] = None,
) -> Playbook:
    tech_ids = [t["technique_id"] for t in techniques]
    query = incident_summary + " " + " ".join(t["name"] for t in techniques)
    retrieved = kb.search(query, top_k=8, settings=settings)

    for tid in tech_ids:
        doc = kb.get_by_id(tid)
        if doc and not any(r["id"] == tid for r in retrieved):
            retrieved.append({**doc, "score": 5.0})

    valid_ids = {r["id"] for r in retrieved}
    sources_text = "\n\n".join(
        f"[{r['id']}] {r['source']} — {r['title']}\n{r['text']}" for r in retrieved
    )

    ioc_summary = "\n".join(f"- {i.type}: {i.value} (score {i.threat_score})" for i in iocs[:15])
    tech_summary = "\n".join(f"- {t['technique_id']}: {t['name']} ({t['tactic']})" for t in techniques)

    user_msg = f"""INCIDENT SUMMARY:
{incident_summary}

IOCS:
{ioc_summary or 'None'}

MITRE ATT&CK TECHNIQUES DETECTED:
{tech_summary or 'None'}

SOURCES (cite these IDs only):
{sources_text}

Generate the incident response playbook JSON now."""

    steps: List[PlaybookStep] = []
    eff_provider, eff_model = provider, model
    try:
        text, eff_provider, eff_model = await call_llm(
            system=SYSTEM_PROMPT, user=user_msg,
            provider=provider, model=model,
            groq_api_key=groq_api_key,
            settings=settings,
            json_mode=(provider == "groq"),
            session_id=f"pb-{hash(incident_summary) & 0xffffffff}",
        )
        data = parse_llm_json(text)
        for s in data.get("steps", []) or []:
            if not isinstance(s, dict):
                continue
            cids = [c for c in (s.get("citation_ids") or []) if c in valid_ids]
            try:
                order = int(s.get("order", len(steps) + 1))
            except (TypeError, ValueError):
                order = len(steps) + 1
            action = str(s.get("action") or "").strip()
            if not action:
                continue
            # A-L2: normalize phase to allowed set
            phase_raw = str(s.get("phase") or "containment").strip().lower().replace(" ", "_")
            allowed = {"containment", "eradication", "recovery", "lessons_learned"}
            aliases = {
                "contain": "containment",
                "eradicate": "eradication",
                "recover": "recovery",
                "lessons": "lessons_learned",
                "lesson_learned": "lessons_learned",
                "post_incident": "lessons_learned",
            }
            phase = aliases.get(phase_raw, phase_raw)
            if phase not in allowed:
                phase = "containment"
            steps.append(PlaybookStep(
                order=order,
                phase=phase,
                action=action,
                citation_ids=cids,
            ))
    except Exception as e:
        logger.exception(f"LLM playbook generation failed: {e}")

    used_fallback = False
    if not steps:
        steps = _fallback_playbook(techniques, retrieved)
        used_fallback = True
        eff_provider, eff_model = "template", "fallback"

    total = len(steps)
    cited = sum(1 for s in steps if s.citation_ids)
    grounding = round(cited / total, 2) if total else 0.0
    # A-L5: citation quality = unique citation ids / steps (source diversity)
    unique_cites = {c for s in steps for c in (s.citation_ids or [])}
    citation_quality = round(len(unique_cites) / total, 2) if total else 0.0
    # A-L3: mark template path so pipeline can force HiTL
    if used_fallback:
        eff_provider = "template"
        eff_model = "fallback"

    return Playbook(
        steps=steps,
        grounding_score=grounding,
        citation_quality=citation_quality,
        llm_provider=eff_provider,
        llm_model=eff_model,
    )


def _fallback_playbook(techniques, retrieved) -> List[PlaybookStep]:
    top_ids = [r["id"] for r in retrieved[:5]]
    return [
        PlaybookStep(order=1, phase="containment",
                     action="Isolate affected hosts from the network and preserve volatile evidence (memory, running processes).",
                     citation_ids=[i for i in ["NIST-800-61-4.3"] if i in top_ids] or top_ids[:1]),
        PlaybookStep(order=2, phase="containment",
                     action="Block malicious IoCs (IPs, domains, hashes) at perimeter and endpoint controls.",
                     citation_ids=top_ids[:2]),
        PlaybookStep(order=3, phase="eradication",
                     action="Remove malware artifacts, disable compromised accounts, and eliminate persistence mechanisms.",
                     citation_ids=[i for i in ["NIST-800-61-4.4", "PB-MALWARE"] if i in top_ids] or top_ids[:1]),
        PlaybookStep(order=4, phase="recovery",
                     action="Restore systems from clean backups, rotate credentials, and validate integrity before returning to production.",
                     citation_ids=[i for i in ["NIST-800-61-4.4"] if i in top_ids] or top_ids[:1]),
        PlaybookStep(order=5, phase="lessons_learned",
                     action="Conduct a retrospective, update detections, and share IoCs with intel sharing partners.",
                     citation_ids=[i for i in ["NIST-800-61-4.5"] if i in top_ids] or top_ids[:1]),
    ]
