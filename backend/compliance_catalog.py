"""Compliance control catalog for ACTIRA Wave C scoring.

Controls map GRC-style requirements to **product evidence keys** evaluated
at runtime (not a certification claim).
"""
from __future__ import annotations

from typing import Any, Dict, List, TypedDict


class Control(TypedDict):
    id: str
    framework: str
    domain: str
    title: str
    evidence_keys: List[str]
    weight: float
    remediation: str


# Weight 1.0 = standard control; 1.5 = higher impact for SOC platform
CONTROLS: List[Control] = [
    # --- Identity & access ---
    {
        "id": "IAM-01",
        "framework": "ISO 27001",
        "domain": "Identity",
        "title": "Role-based access control (RBAC)",
        "evidence_keys": ["rbac"],
        "weight": 1.5,
        "remediation": "Ensure analyst/senior_reviewer/admin roles remain enforced on all routes.",
    },
    {
        "id": "IAM-02",
        "framework": "SOC2",
        "domain": "Identity",
        "title": "Authentication with session protection",
        "evidence_keys": ["auth_jwt_cookie"],
        "weight": 1.5,
        "remediation": "Use strong JWT_SECRET outside lab; prefer httpOnly cookie sessions.",
    },
    {
        "id": "IAM-03",
        "framework": "NIST CSF",
        "domain": "Identity",
        "title": "Enterprise SSO (OIDC) available",
        "evidence_keys": ["oidc_configured"],
        "weight": 1.2,
        "remediation": "Set OIDC_ISSUER + OIDC_CLIENT_ID + OIDC_REDIRECT_URI for staging/prod SSO.",
    },
    {
        "id": "IAM-04",
        "framework": "CIS",
        "domain": "Identity",
        "title": "Public registration gated",
        "evidence_keys": ["register_policy"],
        "weight": 1.0,
        "remediation": "Leave ALLOW_PUBLIC_REGISTER unset in enterprise (auto-off with OIDC/prod).",
    },
    # --- Logging & monitoring ---
    {
        "id": "LOG-01",
        "framework": "ISO 27001",
        "domain": "Logging",
        "title": "Security event ingest multi-format",
        "evidence_keys": ["multi_format_ingest"],
        "weight": 1.3,
        "remediation": "Continue expanding parsers; keep upload size/ZIP guards enabled.",
    },
    {
        "id": "LOG-02",
        "framework": "NIST CSF",
        "domain": "Logging",
        "title": "Immutable audit trail of privileged actions",
        "evidence_keys": ["audit_log", "audit_integrity"],
        "weight": 1.5,
        "remediation": "Protect audit collection; restrict /audit to reviewer/admin; fix hash mismatches.",
    },
    {
        "id": "LOG-03",
        "framework": "SOC2",
        "domain": "Logging",
        "title": "Pipeline job observability",
        "evidence_keys": ["job_status"],
        "weight": 1.0,
        "remediation": "Enable durable job queue for multi-worker production.",
    },
    {
        "id": "LOG-04",
        "framework": "CIS",
        "domain": "Logging",
        "title": "OpenTelemetry / metrics export path",
        "evidence_keys": ["otel_or_metrics"],
        "weight": 0.9,
        "remediation": "Set ACTIRA_OTEL_ENABLED + OTLP endpoint; scrape /metrics with auth.",
    },
    # --- Detection & response ---
    {
        "id": "IR-01",
        "framework": "NIST CSF",
        "domain": "Response",
        "title": "Human-in-the-loop gate for critical playbooks",
        "evidence_keys": ["hitl"],
        "weight": 1.5,
        "remediation": "Keep hitl_severity_min and grounding thresholds configured in Settings.",
    },
    {
        "id": "IR-02",
        "framework": "ISO 27001",
        "domain": "Response",
        "title": "Citation-grounded IR playbooks",
        "evidence_keys": ["playbooks_rag"],
        "weight": 1.3,
        "remediation": "Maintain KB quality; review golden benchmark offline scores.",
    },
    {
        "id": "IR-03",
        "framework": "SOC2",
        "domain": "Response",
        "title": "Investigation workspace / case system of record",
        "evidence_keys": ["investigation_workspace"],
        "weight": 1.2,
        "remediation": "Use /incidents/:id workspace tabs for notes, RCA, timeline.",
    },
    {
        "id": "IR-04",
        "framework": "NIST CSF",
        "domain": "Detect",
        "title": "ATT&CK mapping and coverage matrix",
        "evidence_keys": ["attack_mapping"],
        "weight": 1.1,
        "remediation": "Keep attack catalog updated; use heatmap + matrix views.",
    },
    {
        "id": "IR-05",
        "framework": "CIS",
        "domain": "Detect",
        "title": "Threat hunting and behavioral signals",
        "evidence_keys": ["hunt_behavior"],
        "weight": 1.0,
        "remediation": "Run /hunt and review behavioral hotspots regularly.",
    },
    # --- Secrets & crypto ---
    {
        "id": "SEC-01",
        "framework": "ISO 27001",
        "domain": "Assets",
        "title": "Secrets redaction and encrypt-at-rest path",
        "evidence_keys": ["secret_vault"],
        "weight": 1.4,
        "remediation": "Set SECRETS_MASTER_KEY in non-lab; never return raw secrets on GET settings.",
    },
    {
        "id": "SEC-02",
        "framework": "SOC2",
        "domain": "Assets",
        "title": "Password policy on registration",
        "evidence_keys": ["password_policy"],
        "weight": 1.0,
        "remediation": "Keep min length + complexity validators enabled.",
    },
    # --- Network / ops ---
    {
        "id": "OPS-01",
        "framework": "NIST CSF",
        "domain": "Network",
        "title": "CORS and security response headers",
        "evidence_keys": ["security_headers"],
        "weight": 0.9,
        "remediation": "Configure CORS_ORIGINS to exact SPA origins only.",
    },
    {
        "id": "OPS-02",
        "framework": "CIS",
        "domain": "Network",
        "title": "Auth rate limiting / lockout",
        "evidence_keys": ["auth_throttle"],
        "weight": 1.1,
        "remediation": "Use Mongo-backed throttle in multi-worker deploys.",
    },
    {
        "id": "OPS-03",
        "framework": "ISO 27001",
        "domain": "Assets",
        "title": "Retention policy configuration",
        "evidence_keys": ["retention"],
        "weight": 0.9,
        "remediation": "Set INCIDENT_RETENTION_DAYS and document purge jobs.",
    },
    {
        "id": "OPS-04",
        "framework": "SOC2",
        "domain": "Logging",
        "title": "Admin ops health visibility",
        "evidence_keys": ["ops_health"],
        "weight": 0.8,
        "remediation": "Monitor /ops UI for queue, HA flags, timings.",
    },
    # --- Privacy / AI governance ---
    {
        "id": "AI-01",
        "framework": "ISO 27001",
        "domain": "Identity",
        "title": "Optional IoC redaction in LLM prompts",
        "evidence_keys": ["llm_redact"],
        "weight": 0.8,
        "remediation": "Enable llm_redact_iocs in Settings for production LLM use.",
    },
    {
        "id": "AI-02",
        "framework": "NIST CSF",
        "domain": "Response",
        "title": "Offline evaluation / golden IR path",
        "evidence_keys": ["golden_eval", "golden_eval_pass"],
        "weight": 1.0,
        "remediation": "Run golden CI /admin Benchmark; expand labels over time. Last stored run must pass gates.",
    },
    {
        "id": "AI-03",
        "framework": "SOC2",
        "domain": "Logging",
        "title": "LLM token budget metering",
        "evidence_keys": ["llm_budget"],
        "weight": 0.7,
        "remediation": "Configure monthly token budget for cost control.",
    },
]


FRAMEWORK_ALIASES = {
    "ISO 27001": "ISO 27001",
    "SOC2": "SOC2",
    "SOC 2": "SOC2",
    "NIST CSF": "NIST CSF",
    "NIST": "NIST CSF",
    "CIS": "CIS",
}


def frameworks() -> List[str]:
    return sorted({c["framework"] for c in CONTROLS})


def domains() -> List[str]:
    return sorted({c["domain"] for c in CONTROLS})


def controls_for_framework(name: str) -> List[Control]:
    alias = FRAMEWORK_ALIASES.get(name, name)
    return [c for c in CONTROLS if c["framework"] == alias]
