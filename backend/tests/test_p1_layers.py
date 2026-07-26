"""P1 architecture layers — import graph and thin-router smoke (offline)."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytestmark = [pytest.mark.unit]


def test_layer_packages_import():
    import backend.agents
    import backend.config
    import backend.database
    import backend.repositories
    import backend.schemas
    import backend.security
    import backend.services

    assert backend.config.app_env() in ("dev", "test", "local", "prod", "staging", "")
    assert backend.database.db is not None
    assert backend.security.get_current_user is not None
    assert backend.repositories.IncidentRepository is not None
    assert backend.services.review_service is not None
    assert backend.services.incident_service is not None


def test_compat_core_services_still_exports():
    from backend.core import services as svc

    assert callable(svc.audit)
    assert callable(svc.get_settings)
    assert callable(svc.health_check)
    assert callable(svc.seed_demo_data)


def test_domain_routers_are_thin():
    """P1 routers should not open Mongo collections or embed business rules."""
    from pathlib import Path

    routers_dir = Path(__file__).resolve().parents[1] / "routers"
    names = (
        "review.py",
        "incidents.py",
        "auth.py",
        "settings.py",
        "logs.py",
        "analytics.py",
        "roadmap.py",
        "investigate.py",
        "kb.py",
        "audit.py",
        "compliance.py",
        "eval_routes.py",
        "meta.py",
    )
    for name in names:
        text = (routers_dir / name).read_text(encoding="utf-8")
        assert "db.incidents" not in text, name
        assert "db.users" not in text, name
        assert "db.settings" not in text, name
        assert "db.roadmap" not in text, name
        assert "db.log_jobs" not in text, name
        assert "find_one_and_update" not in text, name
        assert "from backend.services" in text or "from backend.core" in text, name


def test_auth_and_settings_services_import():
    from backend.services import auth_service, settings_service

    assert callable(auth_service.login)
    assert callable(auth_service.register)
    assert callable(settings_service.public_settings_payload)
    assert callable(settings_service.update_settings)


def test_server_still_mounts_review_and_incidents():
    import backend.server as server

    paths = {getattr(r, "path", None) for r in server.app.routes}
    assert "/api/review/queue" in paths or any(
        p and p.endswith("/review/queue") for p in paths
    )
    assert any(p and "/incidents" in p for p in paths)
