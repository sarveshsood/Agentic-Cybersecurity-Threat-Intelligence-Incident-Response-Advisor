"""Executive compliance export (Wave C)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


@pytest.mark.asyncio
async def test_executive_export_shape(monkeypatch):
    from backend.services import compliance_service as cs

    monkeypatch.setenv("ENV", "dev")
    pack = await cs.executive_export({})
    assert pack["score"] is not None
    assert pack["readiness"]
    assert pack["markdown"]
    assert "# ACTIRA Executive" in pack["markdown"]
    assert "top_gaps" in pack
    assert pack["disclaimer"]
    assert "frameworks" in pack


def test_executive_route_registered():
    from backend.routers import compliance as cr

    paths = {getattr(r, "path", None) for r in cr.router.routes}
    assert "/compliance/executive-export" in paths


def test_settings_llm_catalog_route():
    from backend.routers import settings as sr

    paths = {getattr(r, "path", None) for r in sr.router.routes}
    assert "/settings/llm-catalog" in paths
    assert "/settings/test-llm" in paths
