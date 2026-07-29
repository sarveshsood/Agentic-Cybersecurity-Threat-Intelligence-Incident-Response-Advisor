"""Versioned system prompts for ACTIRA LLM stages (Sprint 10 extraction).

Import stable names from this package so agents do not own long prompt strings.
Texts live in sibling modules for review under docs/ai-governance/PROMPT_*.
"""
from __future__ import annotations

from backend.prompts.playbook import PLAYBOOK_SYSTEM_PROMPT
from backend.prompts.investigator import INVESTIGATOR_SYSTEM_PROMPT
from backend.prompts.rca import RCA_SYSTEM_PROMPT

# Back-compat aliases used by agents and tests
SYSTEM_PROMPT = PLAYBOOK_SYSTEM_PROMPT  # playbook default export name in older tests
PLAYBOOK_SYSTEM = PLAYBOOK_SYSTEM_PROMPT
INVESTIGATOR_SYSTEM = INVESTIGATOR_SYSTEM_PROMPT
RCA_SYSTEM = RCA_SYSTEM_PROMPT

PROMPT_CATALOG = {
    "playbook": {
        "id": "playbook.v1",
        "module": "backend.prompts.playbook",
        "name": "IR playbook generation",
    },
    "investigator": {
        "id": "investigator.v1",
        "module": "backend.prompts.investigator",
        "name": "AI investigation Q&A",
    },
    "rca": {
        "id": "rca.v1",
        "module": "backend.prompts.rca",
        "name": "Root-cause analysis",
    },
}

__all__ = [
    "PLAYBOOK_SYSTEM_PROMPT",
    "INVESTIGATOR_SYSTEM_PROMPT",
    "RCA_SYSTEM_PROMPT",
    "SYSTEM_PROMPT",
    "PLAYBOOK_SYSTEM",
    "INVESTIGATOR_SYSTEM",
    "RCA_SYSTEM",
    "PROMPT_CATALOG",
]
