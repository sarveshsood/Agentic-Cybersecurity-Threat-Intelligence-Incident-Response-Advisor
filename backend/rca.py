"""Root-cause analysis generation for Investigation Workspace (v1.4).

Uses pipeline-derived fields only (no analyst notes in prompt — injection surface).
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from backend.llm_provider import call_llm, parse_llm_json
from backend.models import WorkspaceRca, utc_now
from backend.prompts import RCA_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

# Source of truth: backend/prompts/rca.py
RCA_SYSTEM = RCA_SYSTEM_PROMPT


def _valid_mitre(incident: dict) -> set:
    return {
        t.get("technique_id") or t.get("id")
        for t in (incident.get("techniques") or [])
        if isinstance(t, dict) and (t.get("technique_id") or t.get("id"))
    }


def _context_blob(incident: dict) -> str:
    lines = [
        f"Title: {incident.get('title')}",
        f"Severity: {incident.get('severity')}  Threat: {incident.get('threat_score')}",
        f"Summary: {incident.get('summary') or ''}",
        "",
        "Techniques:",
    ]
    for t in incident.get("techniques") or []:
        if not isinstance(t, dict):
            continue
        lines.append(
            f"  - {t.get('technique_id') or t.get('id')}: {t.get('name')} ({t.get('tactic')})"
        )
    lines.append("IoCs:")
    for i in (incident.get("iocs") or [])[:20]:
        if not isinstance(i, dict):
            continue
        lines.append(
            f"  - {i.get('type')}: {i.get('value')} score={i.get('threat_score')}"
        )
    corr = incident.get("correlation") or {}
    if isinstance(corr, dict):
        lines.append("Attack chain:")
        for step in (corr.get("attack_chain") or [])[:12]:
            if not isinstance(step, dict):
                continue
            lines.append(
                f"  - {step.get('timestamp')} [{step.get('source_file')}] "
                f"{step.get('event_type')} actor={step.get('actor')} "
                f"target={step.get('target')} :: {(step.get('summary') or '')[:120]}"
            )
        lines.append("Correlations:")
        for c in (corr.get("correlations") or [])[:8]:
            if not isinstance(c, dict):
                continue
            lines.append(
                f"  - {c.get('kind')}={c.get('value')} files={c.get('file_count')} events={c.get('event_count')}"
            )
    files = incident.get("files_meta") or []
    if files:
        lines.append("Source files:")
        for f in files[:15]:
            if isinstance(f, dict):
                lines.append(f"  - {f.get('name') or f.get('filename') or f}")
            else:
                lines.append(f"  - {f}")
    return "\n".join(lines)


def fallback_rca(incident: dict, *, reason: str = "LLM unavailable") -> WorkspaceRca:
    """Offline / budget / error RCA stitched from attack_chain + techniques + IoCs."""
    corr = incident.get("correlation") or {}
    chain = (corr.get("attack_chain") or []) if isinstance(corr, dict) else []
    steps: List[str] = []
    for step in chain[:10]:
        if not isinstance(step, dict):
            continue
        steps.append(
            f"{step.get('event_type') or 'event'} "
            f"({step.get('actor') or '?'} → {step.get('target') or '?'})"
        )
    techs = [
        (t.get("technique_id") or t.get("id") or "")
        for t in (incident.get("techniques") or [])
        if isinstance(t, dict)
    ]
    techs = [t for t in techs if t]
    iocs = (incident.get("iocs") or [])[:5]
    top_ioc = ""
    if iocs and isinstance(iocs[0], dict):
        top_ioc = f"{iocs[0].get('type')}:{iocs[0].get('value')} score={iocs[0].get('threat_score')}"

    narrative_parts = [
        f"Fallback root-cause sketch for «{incident.get('title') or 'incident'}» "
        f"(severity {incident.get('severity')}, threat {incident.get('threat_score')}).",
    ]
    if steps:
        narrative_parts.append("Observed chain: " + " → ".join(steps) + ".")
    if techs:
        narrative_parts.append("Mapped techniques: " + ", ".join(techs[:6]) + ".")
    if top_ioc:
        narrative_parts.append(f"Highest-listed IoC: {top_ioc}.")
    narrative_parts.append(f"Full LLM RCA unavailable: {reason}")

    evidence = steps[:5] + techs[:3]
    if top_ioc:
        evidence.append(top_ioc)

    return WorkspaceRca(
        narrative=" ".join(narrative_parts),
        hypothesis=steps[0] if steps else (techs[0] if techs else "Insufficient automated chain"),
        confidence=0.35 if steps or techs else 0.2,
        evidence=evidence or ["incident metadata only"],
        mitre_refs=techs[:8],
        unknowns=[
            f"LLM RCA not generated: {reason}",
            "Upload additional host/proxy logs if the chain is incomplete.",
        ],
        generated_at=utc_now(),
        provider="fallback",
        model="template",
        fallback=True,
        fallback_reason=reason[:300],
    )


def _from_llm_dict(data: dict, valid_mitre: set, provider: str, model: str) -> WorkspaceRca:
    data = dict(data or {})
    mitre = [x for x in (data.get("mitre_refs") or []) if x in valid_mitre]
    try:
        conf = float(data.get("confidence", 0.5))
    except (TypeError, ValueError):
        conf = 0.5
    conf = max(0.0, min(1.0, conf))
    return WorkspaceRca(
        narrative=str(data.get("narrative") or data.get("answer") or ""),
        hypothesis=data.get("hypothesis"),
        confidence=conf,
        evidence=list(data.get("evidence") or [])[:20],
        mitre_refs=mitre[:15],
        unknowns=list(data.get("unknowns") or [])[:15],
        generated_at=utc_now(),
        provider=provider,
        model=model,
        fallback=False,
        fallback_reason=None,
    )


async def generate_rca(
    incident: dict,
    settings: Optional[Dict[str, Any]] = None,
) -> WorkspaceRca:
    """Generate RCA via LLM; on any failure or budget block return fallback (never raises for LLM)."""
    settings = settings or {}
    valid = _valid_mitre(incident)
    user_msg = (
        "INCIDENT EVIDENCE (trusted pipeline fields only):\n"
        f"{_context_blob(incident)}\n\n"
        "Produce the root-cause JSON object now."
    )

    # Budget check before live call — budget exhaust → fallback (design §3.5)
    try:
        from backend.llm_usage import assert_within_budget, BudgetExceededError

        try:
            await assert_within_budget(settings)
        except BudgetExceededError as be:
            return fallback_rca(incident, reason=f"token budget exceeded: {be}")
    except Exception as e:
        logger.debug("budget check skipped: %s", e)

    provider = settings.get("llm_provider") or "anthropic"
    model = settings.get("llm_model") or "claude-sonnet-4-6"
    try:
        text, eff_p, eff_m = await call_llm(
            system=RCA_SYSTEM,
            user=user_msg,
            provider=provider,
            model=model,
            settings=settings,
            json_mode=(provider in ("groq", "openai")),
            session_id=f"rca-{incident.get('id', '')}",
        )
        data = parse_llm_json(text)
        rca = _from_llm_dict(data, valid, eff_p, eff_m)
        if not (rca.narrative or "").strip():
            return fallback_rca(incident, reason="LLM returned empty narrative")
        return rca
    except Exception as e:
        logger.warning("RCA LLM failed: %s", e)
        return fallback_rca(incident, reason=str(e)[:240] or type(e).__name__)
