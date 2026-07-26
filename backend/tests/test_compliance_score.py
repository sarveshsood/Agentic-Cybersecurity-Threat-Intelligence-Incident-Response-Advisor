"""Wave C compliance scoring (offline)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_evaluate_returns_score_and_domains(monkeypatch):
    from backend.services import compliance_service as cs

    monkeypatch.setenv("ENV", "dev")
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    monkeypatch.delenv("OIDC_CLIENT_ID", raising=False)
    full = cs.evaluate({})
    assert 0 <= full["score"] <= 100
    assert full["frameworks"]
    assert full["domains"]
    assert "Identity" in {d["domain"] for d in full["domains"]}
    assert full["disclaimer"]
    # W6-05: score is alignment only — never claim formal certification
    disc = full["disclaimer"].lower()
    assert "not a formal" in disc or "not a" in disc
    assert "certification" in disc
    assert "iso" in disc or "soc 2" in disc or "soc2" in disc
    assert isinstance(full["controls"], list)
    assert len(full["controls"]) >= 10


def test_oidc_gap_when_not_configured(monkeypatch):
    from backend.services import compliance_service as cs

    monkeypatch.setenv("ENV", "production")
    monkeypatch.delenv("OIDC_ISSUER", raising=False)
    monkeypatch.delenv("OIDC_CLIENT_ID", raising=False)
    monkeypatch.delenv("SECRETS_MASTER_KEY", raising=False)
    monkeypatch.setenv("ALLOW_PUBLIC_REGISTER", "true")  # force open register gap-ish
    full = cs.evaluate({"llm_redact_iocs": False, "llm_token_budget_monthly": 0})
    gap_ids = {g["id"] for g in full["gaps"]}
    # OIDC not configured in prod → IAM-03 fail
    assert "IAM-03" in gap_ids


def test_oidc_pass_when_configured(monkeypatch):
    from backend.services import compliance_service as cs

    monkeypatch.setenv("OIDC_ISSUER", "https://login.example.com")
    monkeypatch.setenv("OIDC_CLIENT_ID", "actira")
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRETS_MASTER_KEY", "test-master-key-not-for-prod-use-32")
    monkeypatch.delenv("ALLOW_PUBLIC_REGISTER", raising=False)
    full = cs.evaluate({"llm_redact_iocs": True, "llm_token_budget_monthly": 100000})
    iam03 = next(c for c in full["controls"] if c["id"] == "IAM-03")
    assert iam03["status"] == "pass"


def test_status_backward_compatible_shape(monkeypatch):
    from backend.services import compliance_service as cs

    monkeypatch.setenv("ENV", "dev")
    st = cs.status({})
    assert "score" in st
    assert "frameworks" in st
    assert st["frameworks"][0]["controls"]  # "x/y" string
    assert "domains" in st


def test_evidence_pack_has_artifacts(monkeypatch):
    from backend.services import compliance_service as cs

    monkeypatch.setenv("ENV", "dev")
    pack = cs.evidence_pack({})
    assert pack["overall_score"] is not None
    assert pack["artifacts"]
    assert pack["control_results"]
    assert "audit_integrity" in (pack.get("evidence_flags") or {})
    assert "golden_eval_pass" in (pack.get("evidence_flags") or {})


def test_log02_requires_audit_integrity_key(monkeypatch):
    from backend.services import compliance_service as cs

    monkeypatch.setenv("ENV", "dev")
    evidence = cs.collect_evidence({})
    assert evidence.get("audit_integrity") is True
    evidence["audit_integrity"] = False
    full = cs._evaluate_from_evidence(evidence)
    gap_ids = {g["id"] for g in full["gaps"]}
    assert "LOG-02" in gap_ids


def test_compliance_routes_registered():
    from backend.routers import compliance as cr

    paths = {getattr(r, "path", None) for r in cr.router.routes}
    assert "/compliance/status" in paths
    assert "/compliance/gaps" in paths
    assert "/compliance/evidence-pack" in paths
    assert "/compliance/score" in paths
