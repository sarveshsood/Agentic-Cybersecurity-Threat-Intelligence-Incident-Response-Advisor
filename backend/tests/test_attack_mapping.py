"""Unit tests for ATT&CK sub-technique inference + evidence (A-K4)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
from backend.attack_catalog import is_known_technique, root_id, get_technique  # noqa: E402
from backend.attack_mapping import (  # noqa: E402
    infer_techniques,
    technique_ids_for_eval,
)
from backend.models import ATTACKTechnique, IoC  # noqa: E402


class TestCatalog:
    def test_subtechnique_known(self):
        assert is_known_technique("T1110.003")
        assert get_technique("T1110.003")["parent_id"] == "T1110"
        assert root_id("T1110.003") == "T1110"

    def test_parent_known(self):
        assert is_known_technique("T1059")
        assert root_id("T1059") == "T1059"


class TestInferSubtechniques:
    def test_password_spray_keyword(self):
        log = "password spray against many accounts failed password for user1 failed password for user2"
        hits = infer_techniques(log, [])
        ids = [h["technique_id"] for h in hits]
        assert "T1110.003" in ids
        # parent dropped when sub present
        assert "T1110" not in ids or any(h.get("parent_id") == "T1110" for h in hits)
        spray = next(h for h in hits if h["technique_id"] == "T1110.003")
        assert spray["evidence"]
        assert spray["matched_keywords"]

    def test_powershell_subtechnique(self):
        log = "powershell -enc JABzAGMAcgBpAHAAdAAg executed Invoke-Expression download"
        hits = infer_techniques(log, [])
        ids = [h["technique_id"] for h in hits]
        assert "T1059.001" in ids
        assert any(h.get("url") for h in hits if h["technique_id"] == "T1059.001")

    def test_ces_auth_guessing_vs_spray(self):
        # many fails same user → guessing
        events_guess = [
            {
                "raw": f"Failed password for root from 1.2.3.4 port {p}",
                "username": "root",
                "source_ip": "1.2.3.4",
                "source_file": "auth.log",
            }
            for p in range(10)
        ]
        hits = infer_techniques("", [], events=events_guess)
        ids = [h["technique_id"] for h in hits]
        assert "T1110.001" in ids

        # many users few fails → spray
        events_spray = [
            {
                "raw": f"Failed password for user{i} from 9.9.9.9",
                "username": f"user{i}",
                "source_ip": "9.9.9.9",
                "source_file": "auth.log",
            }
            for i in range(8)
        ]
        hits2 = infer_techniques("", [], events=events_spray)
        ids2 = [h["technique_id"] for h in hits2]
        assert "T1110.003" in ids2

    def test_cve_ioc_maps_t1190(self):
        iocs = [IoC(type="cve", value="CVE-2021-44228")]
        hits = infer_techniques("app log", iocs)
        assert any(h["technique_id"] == "T1190" for h in hits)

    def test_eval_ids_include_parent(self):
        hits = [{"technique_id": "T1110.003", "name": "x", "tactic": "y"}]
        ids = technique_ids_for_eval(hits)
        assert "T1110.003" in ids
        assert "T1110" in ids

    def test_model_validate_extended_fields(self):
        hits = infer_techniques(
            "Failed password for admin from 185.1.1.1 password spray",
            [],
        )
        assert hits
        t = ATTACKTechnique.model_validate(hits[0])
        assert t.technique_id
        assert t.confidence > 0


class TestGoldenStillPasses:
    def test_offline_benchmark(self):
        from backend.golden_eval import run_benchmark

        out = run_benchmark()
        assert out["summary"]["n_cases"] >= 30
        assert out["passed"], out.get("failures")
