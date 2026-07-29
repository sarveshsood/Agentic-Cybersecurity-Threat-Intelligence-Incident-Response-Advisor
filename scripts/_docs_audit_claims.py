"""Spot-check high-risk doc claims vs filesystem / simple code facts."""
from __future__ import annotations

import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]

checks = []


def check(name: str, ok: bool, detail: str = "") -> None:
    checks.append((name, ok, detail))
    print(f"{'OK' if ok else 'FAIL'}  {name}" + (f" — {detail}" if detail else ""))


# paths docs claim
paths = [
    "docs/operations/SECURITY_HARDENING.md",
    "docs/dx/ENTERPRISE_REVIEWER_PERSONA.md",
    "docs/CONFIGURATION.md",
    "docs/DEPLOYMENT.md",
    "docs/THREAT_MODEL.md",
    "docs/openapi.json",
    "docs/OPERATIONS_RUNBOOK.md",
    "docs/MULTI_WORKER.md",
    "benchmarks/reports/LOAD_TEST_10_100.md",
    "deployments/helm/actira/values.yaml",
    "deployments/helm/actira/values-prod.yaml",
    "frontend/DESIGN_SYSTEM.md",
    "RELEASE_NOTES.md",
    "SECURITY.md",
    "backend/.env.example",
    "frontend/src/lib/tooltipPrerequisite.js",
    "frontend/src/components/HelpTip.jsx",
]
for p in paths:
    check(f"path:{p}", (root / p).exists())

# JWT enforcement in code
auth = (root / "backend" / "auth.py").read_text(encoding="utf-8", errors="replace")
check("jwt_weak_len_lt_16", "len(s) < 16" in auth, "auth.py weak secret length")
check("jwt_denylist", "dev-secret" in auth)

# cookie knobs
services = (root / "backend" / "core" / "services.py").read_text(encoding="utf-8", errors="replace")
check("cookie_samesite_env", "COOKIE_SAMESITE" in services)
check("cookie_secure_env", "COOKIE_SECURE" in services)

# seed dual gate
check(
    "seed_demo_dual_gate",
    "SEED_DEMO_USERS" in services and "ENV" in services,
)

# public register
cfg = (root / "docs" / "CONFIGURATION.md").read_text(encoding="utf-8", errors="replace")
check("config_allow_public_register", "ALLOW_PUBLIC_REGISTER" in cfg)

# hardening claims present
hard = (root / "docs" / "operations" / "SECURITY_HARDENING.md").read_text(
    encoding="utf-8", errors="replace"
)
for claim in [
    "Version: 2.1",
    "COOKIE_SAMESITE",
    "ALLOW_PUBLIC_REGISTER",
    "Residual risks",
    "policy",
]:
    check(f"hardening_has:{claim}", claim in hard)

# contradictory claims
dep = (root / "docs" / "DEPLOYMENT.md").read_text(encoding="utf-8", errors="replace")
check(
    "deployment_no_longer_says_no_helm",
    "does **not** ship Helm" not in dep and "does not ship Helm" not in dep,
    "DEPLOYMENT.md helm wording",
)
check("deployment_points_to_hardening", "SECURITY_HARDENING" in dep)

# roles
roles = {"admin", "analyst", "senior_reviewer"}
for role in roles:
    check(f"role_in_auth_or_code:{role}", role in auth or role in hard)

# metrics
server_files = list((root / "backend").rglob("*.py"))
metrics_hit = False
for py in server_files:
    if "tests" in py.parts:
        continue
    try:
        t = py.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    if "METRICS_TOKEN" in t and "/metrics" in t:
        metrics_hit = True
        break
check("metrics_token_in_backend", metrics_hit)

# tooltip prerequisite code
check(
    "tooltip_code",
    (root / "frontend" / "src" / "lib" / "tooltipPrerequisite.js").exists(),
)

# OPENAPI
import json

oa = root / "docs" / "openapi.json"
if oa.exists():
    data = json.loads(oa.read_text(encoding="utf-8"))
    check("openapi_has_paths", bool(data.get("paths")), f"paths={len(data.get('paths', {}))}")
else:
    check("openapi_has_paths", False, "missing")

# stale doc names still referenced in body text of ops (not as broken md links only)
stale = [
    "BACKUP_STRATEGY.md",
    "MONITORING_STRATEGY.md",
    "HIGH_AVAILABILITY_RUNBOOK.md",
    "PLATFORM_INCIDENT_RESPONSE.md",
    "`RELEASE.md`",
]
ops = root / "docs" / "operations"
for name in stale:
    hits = []
    for md in ops.glob("*.md"):
        t = md.read_text(encoding="utf-8", errors="replace")
        if name in t:
            hits.append(md.name)
    check(f"stale_name_absent:{name}", len(hits) == 0, ",".join(hits) if hits else "")

failed = [c for c in checks if not c[1]]
print(f"\nsummary: {len(checks)-len(failed)}/{len(checks)} passed, {len(failed)} failed")
for name, ok, detail in failed:
    print(f"  FAIL {name} {detail}")
