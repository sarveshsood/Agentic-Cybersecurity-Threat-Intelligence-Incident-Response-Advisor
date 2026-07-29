"""Testing Health Center parsers and module mapping (PR-2+).

Ingest-first QA surface — see ``docs/product/TESTING_HEALTH_CENTER_DESIGN.md``.
"""
from __future__ import annotations

from backend.qa.module_map import (
    HEALTH_MODULES,
    MODULE_MAP_VERSION,
    map_catalog_module_raw,
    map_junit_nodeid,
    map_tc_id,
)

__all__ = [
    "HEALTH_MODULES",
    "MODULE_MAP_VERSION",
    "map_catalog_module_raw",
    "map_junit_nodeid",
    "map_tc_id",
]
