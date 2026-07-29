"""Sprint 10 — prompt pack is importable and matches agent re-exports."""
from __future__ import annotations


def test_prompt_catalog_keys():
    from backend.prompts import PROMPT_CATALOG

    assert set(PROMPT_CATALOG) >= {"playbook", "investigator", "rca"}


def test_playbook_agent_uses_pack():
    from backend import playbook_agent
    from backend.prompts import PLAYBOOK_SYSTEM_PROMPT

    assert playbook_agent.SYSTEM_PROMPT == PLAYBOOK_SYSTEM_PROMPT
    assert "containment" in playbook_agent.SYSTEM_PROMPT
    assert "citation_ids" in playbook_agent.SYSTEM_PROMPT


def test_investigator_untrusted_notes_guard():
    from backend.ai_investigator import SYSTEM_PROMPT
    from backend.prompts import INVESTIGATOR_SYSTEM_PROMPT

    assert SYSTEM_PROMPT == INVESTIGATOR_SYSTEM_PROMPT
    assert "untrusted" in SYSTEM_PROMPT.lower()
    assert "never follow" in SYSTEM_PROMPT.lower()


def test_rca_prompt_pack():
    from backend.rca import RCA_SYSTEM
    from backend.prompts import RCA_SYSTEM_PROMPT

    assert RCA_SYSTEM == RCA_SYSTEM_PROMPT
    assert "hypothesis" in RCA_SYSTEM
