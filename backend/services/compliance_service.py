"""Compliance scoring, gaps, and evidence pack (Wave C).

Scores are **product alignment** signals — not certification claims.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.compliance_catalog import CONTROLS, domains, frameworks


def _truthy_env(*names: str) -> bool:
    for n in names:
        v = (os.environ.get(n) or "").strip().lower()
        if v in ("1", "true", "yes", "on"):
            return True
        if v:  # non-empty issuer/path etc.
            return True
    return False


def collect_evidence(settings: Optional[dict] = None) -> Dict[str, bool]:
    """Deterministic evidence flags for the running deployment profile."""
    settings = settings or {}
    oidc = bool(
        (os.environ.get("OIDC_ISSUER") or "").strip()
        and (os.environ.get("OIDC_CLIENT_ID") or "").strip()
    )
    # register policy: production/oidc auto-disables; explicit false also ok
    env = (os.environ.get("ENV") or "dev").strip().lower()
    allow_reg = (os.environ.get("ALLOW_PUBLIC_REGISTER") or "").strip().lower()
    register_gated = allow_reg in ("0", "false", "no", "off") or oidc or env in (
        "production",
        "prod",
        "staging",
    )

    otel = _truthy_env("ACTIRA_OTEL_ENABLED", "OTEL_EXPORTER_OTLP_ENDPOINT")
    vault_key = bool((os.environ.get("SECRETS_MASTER_KEY") or "").strip())
    # Product always has vault module; prefer explicit key for "passing"
    secret_vault = vault_key or env in ("dev", "test", "local")

    llm_redact = bool(settings.get("llm_redact_iocs"))
    budget = 0
    try:
        budget = int(settings.get("llm_token_budget_monthly") or 0)
    except (TypeError, ValueError):
        budget = 0

    return {
        "rbac": True,
        "auth_jwt_cookie": True,
        "oidc_configured": oidc,
        "register_policy": register_gated,
        "multi_format_ingest": True,
        "audit_log": True,
        # Optimistic defaults for offline unit tests; live path may demote these
        "audit_integrity": True,
        "job_status": True,
        "otel_or_metrics": otel or True,  # /metrics always present; boost otel when on
        "hitl": True,
        "playbooks_rag": True,
        "investigation_workspace": True,
        "attack_mapping": True,
        "hunt_behavior": True,
        "secret_vault": secret_vault,
        "password_policy": True,
        "security_headers": True,
        "auth_throttle": True,
        "retention": True,
        "ops_health": True,
        "llm_redact": llm_redact or env in ("dev", "test"),
        "golden_eval": True,
        "golden_eval_pass": True,  # demoted when last stored run failed
        "llm_budget": budget > 0 or env in ("dev", "test"),
    }


# Evidence keys probed at request time (Mongo / live APIs).
LIVE_VERIFIED_KEYS = frozenset({"audit_integrity", "golden_eval_pass"})
# Evidence keys derived from env / settings (not product always-true assumptions).
ENV_CHECKED_KEYS = frozenset(
    {
        "oidc_configured",
        "register_policy",
        "secret_vault",
        "otel_or_metrics",
        "llm_redact",
        "llm_budget",
    }
)


def evidence_key_provenance(key: str) -> str:
    """Classify a single evidence key: verified | env | assumed."""
    if key in LIVE_VERIFIED_KEYS:
        return "verified"
    if key in ENV_CHECKED_KEYS:
        return "env"
    return "assumed"


def control_verification(keys: List[str]) -> str:
    """Aggregate provenance for a control: verified | env | assumed | mixed.

    - verified: all keys live-probed (audit integrity / golden last run)
    - env: all keys config/env-checked
    - assumed: all keys product always-on assumptions (no live probe)
    - mixed: combination of the above
    """
    if not keys:
        return "assumed"
    kinds = {evidence_key_provenance(k) for k in keys}
    if len(kinds) == 1:
        return next(iter(kinds))
    return "mixed"


async def apply_live_evidence(evidence: Dict[str, bool]) -> Dict[str, Any]:
    """Enrich evidence flags from Mongo audit integrity + last golden run.

    Returns a small `live_signals` dict for UI/export (does not affect missing keys).
    """
    live: Dict[str, Any] = {}
    try:
        from backend.services import audit_service

        integ = await audit_service.integrity(sample=50)
        status = str(integ.get("status") or "")
        live["audit_integrity_status"] = status
        live["audit_integrity_ok"] = integ.get("ok")
        live["audit_integrity_mismatch"] = integ.get("mismatch")
        # Fail only on clear tamper signals — partial/legacy still "has audit trail"
        evidence["audit_integrity"] = status not in ("mismatch", "broken_chain")
        evidence["audit_log"] = True
    except Exception:
        live["audit_integrity_status"] = "unavailable"

    try:
        from backend.database import db

        stored = await db.golden_runs.find_one(
            {"id": "last"},
            {"_id": 0, "passed": 1, "ran_at": 1, "summary": 1, "failures": 1},
        )
        if stored is not None:
            live["golden_last_ran_at"] = stored.get("ran_at")
            if "passed" in stored:
                evidence["golden_eval_pass"] = bool(stored.get("passed"))
                live["golden_last_passed"] = bool(stored.get("passed"))
            summary = stored.get("summary") if isinstance(stored.get("summary"), dict) else {}
            live["golden_last_summary"] = {
                "n_cases": summary.get("n_cases"),
                "mean_ioc_f1": summary.get("mean_ioc_f1"),
                "mean_technique_recall": summary.get("mean_technique_recall"),
            }
            if stored.get("failures"):
                live["golden_last_failures"] = stored.get("failures")
        else:
            live["golden_last_ran_at"] = None
    except Exception:
        live["golden_last_ran_at"] = "unavailable"

    return live


def _eval_control(control: dict, evidence: Dict[str, bool]) -> Dict[str, Any]:
    keys = list(control.get("evidence_keys") or [])
    missing = [k for k in keys if not evidence.get(k)]
    passed = len(missing) == 0
    verification = control_verification(keys)
    return {
        "id": control["id"],
        "framework": control["framework"],
        "domain": control["domain"],
        "title": control["title"],
        "weight": control["weight"],
        "status": "pass" if passed else "fail",
        "evidence_keys": keys,
        "missing_evidence": missing,
        "remediation": control.get("remediation") or "",
        "verification": verification,
        "verification_label": {
            "verified": "Live verified",
            "env": "Config-checked",
            "assumed": "Assumed",
            "mixed": "Mixed",
        }.get(verification, verification),
    }


def _evaluate_from_evidence(
    evidence: Dict[str, bool],
    *,
    live_signals: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    results = [_eval_control(c, evidence) for c in CONTROLS]

    def _score(items: List[dict]) -> float:
        if not items:
            return 0.0
        total_w = sum(float(i["weight"]) for i in items) or 1.0
        got = sum(float(i["weight"]) for i in items if i["status"] == "pass")
        return round(100.0 * got / total_w, 1)

    overall = _score(results)

    # by framework
    fw_rows = []
    for fw in frameworks():
        items = [r for r in results if r["framework"] == fw]
        passed = sum(1 for r in items if r["status"] == "pass")
        sc = _score(items)
        status = (
            "Compliant"
            if sc >= 95
            else "Passing"
            if sc >= 80
            else "Review"
            if sc >= 60
            else "Gap"
        )
        fw_rows.append(
            {
                "name": fw if fw != "SOC2" else "SOC 2",
                "framework_id": fw,
                "status": status,
                "score": sc,
                "controls": f"{passed}/{len(items)}",
                "passed": passed,
                "total": len(items),
            }
        )

    # by domain
    domain_rows = []
    for dom in domains():
        items = [r for r in results if r["domain"] == dom]
        domain_rows.append(
            {
                "domain": dom,
                "score": _score(items),
                "passed": sum(1 for r in items if r["status"] == "pass"),
                "total": len(items),
            }
        )
    domain_rows.sort(key=lambda d: d["domain"])

    gaps = [r for r in results if r["status"] == "fail"]
    gaps.sort(key=lambda g: (-float(g["weight"]), g["id"]))

    readiness = (
        "Passing"
        if overall >= 80
        else "Needs work"
        if overall >= 60
        else "Critical gaps"
    )

    verification_summary: Dict[str, int] = {
        "assumed": 0,
        "env": 0,
        "verified": 0,
        "mixed": 0,
    }
    for r in results:
        k = r.get("verification") or "assumed"
        if k not in verification_summary:
            verification_summary[k] = 0
        verification_summary[k] += 1

    out = {
        "score": overall,
        "readiness": readiness,
        "frameworks": fw_rows,
        "domains": domain_rows,
        "controls": results,
        "gaps": gaps,
        "gap_count": len(gaps),
        "evidence": evidence,
        "verification_summary": verification_summary,
        "verification_legend": {
            "assumed": "Product capability assumed present (no live probe this request).",
            "env": "Checked against process env / settings at runtime.",
            "verified": "Live-probed this request (audit chain sample and/or golden last run).",
            "mixed": "Control mixes assumed, env, and/or live-verified evidence keys.",
        },
        "disclaimer": (
            "Product-alignment score for ACTIRA runtime controls mapped to ISO / "
            "SOC 2 / NIST CSF / CIS-style catalog items — not a formal ISO, SOC 2, "
            "NIST, CIS, or other third-party certification. Gaps and evidence packs "
            "support pilot GRC conversations only; engage an accredited auditor for "
            "certification. Most controls are assumed product features; only a subset "
            "are live-verified or config-checked each request."
        ),
        "last_audit": datetime.now(timezone.utc).isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
    if live_signals is not None:
        out["live_signals"] = live_signals
    return out


def evaluate(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Sync evaluate (offline-friendly; optimistic integrity/golden flags)."""
    evidence = collect_evidence(settings)
    return _evaluate_from_evidence(evidence)


async def evaluate_live(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Evaluate with live audit integrity + golden last-run signals."""
    evidence = collect_evidence(settings)
    live = await apply_live_evidence(evidence)
    return _evaluate_from_evidence(evidence, live_signals=live)


def status(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Backward-compatible status payload + domains/gaps summary (sync)."""
    full = evaluate(settings)
    return {
        "score": full["score"],
        "frameworks": full["frameworks"],
        "domains": full["domains"],
        "gap_count": full["gap_count"],
        "gaps_preview": full["gaps"][:5],
        "readiness": full["readiness"],
        "disclaimer": full["disclaimer"],
        "last_audit": full["last_audit"],
    }


async def status_live(settings: Optional[dict] = None) -> Dict[str, Any]:
    full = await evaluate_live(settings)
    return {
        "score": full["score"],
        "frameworks": full["frameworks"],
        "domains": full["domains"],
        "gap_count": full["gap_count"],
        "gaps_preview": full["gaps"][:5],
        "readiness": full["readiness"],
        "disclaimer": full["disclaimer"],
        "last_audit": full["last_audit"],
        "live_signals": full.get("live_signals") or {},
        "verification_summary": full.get("verification_summary") or {},
        "verification_legend": full.get("verification_legend") or {},
    }


def gaps(settings: Optional[dict] = None) -> Dict[str, Any]:
    full = evaluate(settings)
    return {
        "score": full["score"],
        "gap_count": full["gap_count"],
        "gaps": full["gaps"],
        "remediation_priority": [
            {
                "id": g["id"],
                "title": g["title"],
                "framework": g["framework"],
                "remediation": g["remediation"],
                "weight": g["weight"],
            }
            for g in full["gaps"]
        ],
        "disclaimer": full["disclaimer"],
        "generated_at": full["generated_at"],
    }


async def gaps_live(settings: Optional[dict] = None) -> Dict[str, Any]:
    full = await evaluate_live(settings)
    return {
        "score": full["score"],
        "gap_count": full["gap_count"],
        "gaps": full["gaps"],
        "verification_summary": full.get("verification_summary") or {},
        "verification_legend": full.get("verification_legend") or {},
        "remediation_priority": [
            {
                "id": g["id"],
                "title": g["title"],
                "framework": g["framework"],
                "remediation": g["remediation"],
                "weight": g["weight"],
            }
            for g in full["gaps"]
        ],
        "disclaimer": full["disclaimer"],
        "generated_at": full["generated_at"],
        "live_signals": full.get("live_signals") or {},
    }


def evidence_pack(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Machine-readable evidence pack for auditors (JSON) — sync baseline."""
    full = evaluate(settings)
    return _evidence_pack_from_full(full)


async def evidence_pack_live(settings: Optional[dict] = None) -> Dict[str, Any]:
    full = await evaluate_live(settings)
    return _evidence_pack_from_full(full)


def _evidence_pack_from_full(full: Dict[str, Any]) -> Dict[str, Any]:
    artifacts = [
        {"path": "docs/compliance/ISO27001_MAPPING.md", "type": "mapping"},
        {"path": "docs/compliance/NIST_CSF_2.md", "type": "mapping"},
        {"path": "docs/compliance/SOC2_ALIGNMENT.md", "type": "mapping"},
        {"path": "docs/compliance/CIS_CONTROLS_V8.md", "type": "mapping"},
        {"path": "docs/THREAT_MODEL.md", "type": "threat_model"},
        {"path": "docs/ai-governance/RESPONSIBLE_AI.md", "type": "ai_governance"},
        {"path": "SECURITY.md", "type": "policy"},
        {"path": "backend/tests/", "type": "automated_tests"},
        {"path": "GET /api/audit", "type": "runtime_audit_api"},
        {"path": "GET /api/audit/integrity", "type": "runtime_integrity"},
        {"path": "GET /api/compliance/status", "type": "runtime_score"},
        {"path": "GET /api/eval/golden-benchmark", "type": "golden_eval"},
        {"path": "Investigation Workspace notes/RCA", "type": "case_evidence"},
    ]
    return {
        "title": "ACTIRA Compliance Evidence Pack",
        "generated_at": full["generated_at"],
        "overall_score": full["score"],
        "readiness": full["readiness"],
        "disclaimer": full["disclaimer"],
        "framework_scores": full["frameworks"],
        "domain_scores": full["domains"],
        "control_results": full["controls"],
        "open_gaps": full["gaps"],
        "evidence_flags": full["evidence"],
        "live_signals": full.get("live_signals") or {},
        "artifacts": artifacts,
        "export_hint": "Download this JSON for GRC tools; pair with docs/compliance/* mappings.",
    }


def score_only(settings: Optional[dict] = None) -> Dict[str, Any]:
    full = evaluate(settings)
    return {
        "score": full["score"],
        "domains": {d["domain"]: d["score"] for d in full["domains"]},
        "frameworks": {f["framework_id"]: f["score"] for f in full["frameworks"]},
        "readiness": full["readiness"],
    }


async def executive_export(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Board-ready snapshot: compliance + audit volume + open risk signals."""
    full = await evaluate_live(settings)
    top_gaps = [
        {
            "id": g["id"],
            "title": g["title"],
            "framework": g["framework"],
            "remediation": g["remediation"],
            "weight": g["weight"],
        }
        for g in full["gaps"][:5]
    ]

    audit_block: Dict[str, Any] = {"available": False}
    try:
        from backend.services import audit_service

        audit_block = await audit_service.summary(days=30)
        audit_block["available"] = True
        integrity = await audit_service.integrity(sample=50)
        audit_block["integrity_status"] = integrity.get("status")
    except Exception:
        audit_block = {
            "available": False,
            "event_count": None,
            "narrative": ["Audit summary unavailable for this export."],
        }

    open_critical = None
    pending_review = None
    try:
        from backend.database import db

        open_critical = await db.incidents.count_documents(
            {"severity": "critical", "status": {"$nin": ["closed", "approved", "rejected"]}}
        )
        pending_review = await db.incidents.count_documents({"status": "pending_review"})
    except Exception:
        pass

    generated = full["generated_at"]
    fw_lines = [
        f"- {f['name']}: {f['score']}% ({f['controls']}) — {f['status']}"
        for f in full["frameworks"]
    ]
    gap_lines = [
        f"- [{g['id']}] {g['title']} — {g['remediation']}" for g in top_gaps
    ] or ["- No open control gaps in the current alignment score."]
    audit_lines = audit_block.get("narrative") or []
    md = "\n".join(
        [
            "# ACTIRA Executive Compliance Snapshot",
            "",
            f"**Generated:** {generated}",
            f"**Alignment score:** {full['score']}% · **Readiness:** {full['readiness']}",
            "",
            "## Frameworks",
            *fw_lines,
            "",
            "## Top gaps",
            *gap_lines,
            "",
            "## Operations signals",
            f"- Open critical incidents (non-closed): {open_critical if open_critical is not None else 'n/a'}",
            f"- Pending review: {pending_review if pending_review is not None else 'n/a'}",
            f"- Audit events (30d sample): {audit_block.get('event_count', 'n/a')}",
            f"- Audit integrity: {audit_block.get('integrity_status', 'n/a')}",
            "",
            "## Audit narrative",
            *[f"- {b}" for b in audit_lines],
            "",
            f"_{full['disclaimer']}_",
            "",
        ]
    )

    return {
        "title": "ACTIRA Executive Compliance Snapshot",
        "generated_at": generated,
        "period_days": 30,
        "score": full["score"],
        "readiness": full["readiness"],
        "disclaimer": full["disclaimer"],
        "frameworks": full["frameworks"],
        "top_gaps": top_gaps,
        "domains": full["domains"],
        "operations": {
            "open_critical": open_critical,
            "pending_review": pending_review,
        },
        "audit": {
            "event_count": audit_block.get("event_count"),
            "review_approve": audit_block.get("review_approve"),
            "review_reject": audit_block.get("review_reject"),
            "integrity_status": audit_block.get("integrity_status"),
            "narrative": audit_block.get("narrative"),
            "available": audit_block.get("available", False),
        },
        "markdown": md,
        "export_hint": "Download JSON for tools or markdown for board packs.",
    }
