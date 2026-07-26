"""AI / agent layer facades (P1).

Routers should call services; services may orchestrate these agents.
Deep re-architecture (planner, copilot, etc.) is a later sprint.
"""
from __future__ import annotations

# Lazy-friendly re-exports — import submodules at call sites for heavy deps.
__all__ = [
    "ai_investigator",
    "playbook_agent",
    "attack_mapping",
    "knowledge_base",
]


def __getattr__(name: str):
    if name == "ai_investigator":
        from backend import ai_investigator as m

        return m
    if name == "playbook_agent":
        from backend import playbook_agent as m

        return m
    if name == "attack_mapping":
        from backend import attack_mapping as m

        return m
    if name == "knowledge_base":
        from backend import knowledge_base as m

        return m
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
