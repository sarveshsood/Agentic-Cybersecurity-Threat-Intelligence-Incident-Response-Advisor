"""Process bootstrap helpers used at app lifespan (re-export surface).

Implementations remain in ``backend.core.services`` for P1.1; this module is the
forward-looking import path for startup orchestration.
"""
from __future__ import annotations

from backend.core.services import ensure_roadmap_seeded, health_check, seed_demo_data

__all__ = [
    "ensure_roadmap_seeded",
    "health_check",
    "seed_demo_data",
]
