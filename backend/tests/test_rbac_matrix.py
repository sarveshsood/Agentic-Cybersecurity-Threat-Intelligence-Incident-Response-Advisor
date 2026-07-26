"""A-T8: RBAC matrix unit tests (role × capability).

Documents expected gates without a live server.
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
from backend.auth import require_roles  # noqa: E402


def _user(role: str) -> dict:
    return {"sub": f"u-{role}", "email": f"{role}@x.test", "role": role}


async def _check(roles: tuple[str, ...], user: dict):
    checker = require_roles(*roles)
    return await checker(user=user)


class TestRequireRoles:
    def test_admin_is_superuser(self):
        async def run():
            # Admin passes even if not listed
            out = await _check(("senior_reviewer",), _user("admin"))
            assert out["role"] == "admin"

        asyncio.run(run())

    def test_matching_role_allowed(self):
        async def run():
            out = await _check(("analyst", "admin"), _user("analyst"))
            assert out["role"] == "analyst"

        asyncio.run(run())

    def test_wrong_role_forbidden(self):
        async def run():
            with pytest.raises(HTTPException) as ei:
                await _check(("admin",), _user("analyst"))
            assert ei.value.status_code == 403

        asyncio.run(run())

    def test_senior_reviewer_not_admin(self):
        async def run():
            with pytest.raises(HTTPException) as ei:
                await _check(("admin",), _user("senior_reviewer"))
            assert ei.value.status_code == 403
            # But listed gates work
            out = await _check(("admin", "senior_reviewer"), _user("senior_reviewer"))
            assert out["role"] == "senior_reviewer"

        asyncio.run(run())


# Capability matrix — keep in sync with server.py Depends(...)
# Format: (capability, allowed_roles)  — admin always allowed via superuser
RBAC_MATRIX = [
    ("upload / incidents / investigate", ("any_auth",)),
    ("review queue / review action", ("senior_reviewer", "admin")),
    ("settings GET", ("any_auth",)),
    ("settings PUT / reset / clear / test notify", ("admin",)),
    ("audit list", ("admin", "senior_reviewer")),
    ("golden benchmark GET/POST", ("admin",)),
    ("roadmap list", ("any_auth",)),
    ("roadmap create / seed", ("admin",)),
    ("roadmap patch / tasks", ("admin", "senior_reviewer")),
    ("kb reindex / ingest", ("admin",)),
    ("metrics", ("jwt_or_metrics_token",)),
]


class TestRbacMatrixDocumented:
    def test_matrix_non_empty(self):
        assert len(RBAC_MATRIX) >= 8

    def test_golden_admin_only(self):
        row = next(r for r in RBAC_MATRIX if "golden" in r[0])
        assert row[1] == ("admin",)

    def test_review_needs_senior_or_admin(self):
        row = next(r for r in RBAC_MATRIX if "review queue" in r[0])
        assert "senior_reviewer" in row[1]
        assert "admin" in row[1]
        assert "analyst" not in row[1]

    def test_roadmap_create_admin_only(self):
        row = next(r for r in RBAC_MATRIX if "create" in r[0])
        assert row[1] == ("admin",)

    def test_roadmap_tasks_include_senior(self):
        row = next(r for r in RBAC_MATRIX if "tasks" in r[0])
        assert "senior_reviewer" in row[1]


class TestRoleGatesSimulation:
    """Simulate common forbidden paths with require_roles."""

    @pytest.mark.parametrize(
        "role,allowed",
        [
            ("analyst", False),
            ("senior_reviewer", False),
            ("admin", True),
        ],
    )
    def test_settings_admin_only(self, role, allowed):
        async def run():
            if allowed:
                out = await _check(("admin",), _user(role))
                assert out["role"] == role
            else:
                with pytest.raises(HTTPException) as ei:
                    await _check(("admin",), _user(role))
                assert ei.value.status_code == 403

        asyncio.run(run())

    @pytest.mark.parametrize(
        "role,allowed",
        [
            ("analyst", False),
            ("senior_reviewer", True),
            ("admin", True),
        ],
    )
    def test_review_roles(self, role, allowed):
        async def run():
            if allowed:
                await _check(("senior_reviewer",), _user(role))
            else:
                with pytest.raises(HTTPException):
                    await _check(("senior_reviewer",), _user(role))

        asyncio.run(run())

    @pytest.mark.parametrize(
        "role,allowed",
        [
            ("analyst", False),
            ("senior_reviewer", False),
            ("admin", True),
        ],
    )
    def test_golden_roles(self, role, allowed):
        async def run():
            if allowed:
                await _check(("admin",), _user(role))
            else:
                with pytest.raises(HTTPException):
                    await _check(("admin",), _user(role))

        asyncio.run(run())
