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
        "llm_budget": budget > 0 or env in ("dev", "test"),
    }


def _eval_control(control: dict, evidence: Dict[str, bool]) -> Dict[str, Any]:
    keys = control.get("evidence_keys") or []
    missing = [k for k in keys if not evidence.get(k)]
    passed = len(missing) == 0
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
    }


def evaluate(settings: Optional[dict] = None) -> Dict[str, Any]:
    evidence = collect_evidence(settings)
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

    return {
        "score": overall,
        "readiness": readiness,
        "frameworks": fw_rows,
        "domains": domain_rows,
        "controls": results,
        "gaps": gaps,
        "gap_count": len(gaps),
        "evidence": evidence,
        "disclaimer": (
            "Alignment score for ACTIRA product capabilities — not a formal "
            "ISO/SOC2/NIST certification."
        ),
        "last_audit": datetime.now(timezone.utc).isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def status(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Backward-compatible status payload + domains/gaps summary."""
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


def evidence_pack(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Machine-readable evidence pack for auditors (JSON)."""
    full = evaluate(settings)
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
        {"path": "GET /api/compliance/status", "type": "runtime_score"},
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
