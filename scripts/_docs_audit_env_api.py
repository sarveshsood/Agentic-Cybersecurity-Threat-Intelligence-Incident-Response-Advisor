"""Compare env vars and API paths in docs vs code / OpenAPI / .env.example."""
from __future__ import annotations

import json
import os
import re
from collections import Counter, defaultdict
from pathlib import Path

root = Path(__file__).resolve().parents[1]
skip_parts = {
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "dist",
    "build",
    "__pycache__",
    ".pytest_cache",
}


def should_skip(p: Path) -> bool:
    return any(part in skip_parts for part in p.parts)


env_re = re.compile(r"\b([A-Z][A-Z0-9]{2,}(?:_[A-Z0-9]+)+)\b")
env_get = re.compile(r"""os\.environ(?:\.get)?\(\s*['\"]([A-Z0-9_]+)['\"]""")
env_bracket = re.compile(r"""os\.environ\[\s*['\"]([A-Z0-9_]+)['\"]\s*\]""")
route_re = re.compile(
    r"""@\w+\.(get|post|put|patch|delete|websocket)\(\s*['\"]([^'\"]+)['\"]""",
    re.I,
)
api_doc_re = re.compile(r"(/api(?:/v1)?/[a-zA-Z0-9_\-/{}.]+)")

# ---- envs from code + example ----
code_envs: set[str] = set()
for py in (root / "backend").rglob("*.py"):
    if should_skip(py) or "tests" in py.parts:
        continue
    try:
        t = py.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    code_envs.update(env_get.findall(t))
    code_envs.update(env_bracket.findall(t))

example_envs: set[str] = set()
ex = root / "backend" / ".env.example"
if ex.exists():
    for line in ex.read_text(encoding="utf-8", errors="replace").splitlines():
        s = line.strip()
        m = re.match(r"#\s*([A-Z][A-Z0-9_]+)=", s) or re.match(r"([A-Z][A-Z0-9_]+)=", s)
        if m:
            example_envs.add(m.group(1))

truth = code_envs | example_envs

# doc env-like tokens
doc_envs: Counter[str] = Counter()
doc_loc: dict[str, list[str]] = defaultdict(list)
for md in root.rglob("*.md"):
    if should_skip(md):
        continue
    try:
        t = md.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    for m in env_re.finditer(t):
        tok = m.group(1)
        if tok.count("_") < 1 or len(tok) < 6:
            continue
        doc_envs[tok] += 1
        if len(doc_loc[tok]) < 3:
            doc_loc[tok].append(str(md.relative_to(root)))

# filter file/doc name noise
docname_noise = {
    "SECURITY_HARDENING",
    "CODE_REVIEW_CHECKLIST",
    "PR_GUIDELINES",
    "TOOLTIP_PREREQUISITE",
    "BACKEND_STRUCTURE",
    "LOCAL_DEVELOPMENT",
    "ENVIRONMENT_SETUP",
    "GIT_WORKFLOW",
    "CODING_STANDARDS",
    "OPERATIONS_RUNBOOK",
    "MULTI_WORKER",
    "DISASTER_RECOVERY",
    "INCIDENT_RESPONSE",
    "PATCH_MANAGEMENT",
    "PERFORMANCE_TUNING",
    "CAPACITY_PLANNING",
    "HA_VALIDATION",
    "OBSERVABILITY_PACK",
    "ENTERPRISE_REVIEW",
    "ENTERPRISE_REVIEWER_PERSONA",
    "PRODUCT_HONESTY",
    "FEATURE_INVENTORY",
    "PROJECT_OVERVIEW",
    "SYSTEM_DESIGN",
    "AGENT_ARCHITECTURE",
    "API_REFERENCE",
    "USER_GUIDE",
    "ADMIN_GUIDE",
    "DEVELOPER_GUIDE",
    "THREAT_MODEL",
    "DEMO_SCRIPT",
    "E2E_TESTING",
    "DOCUMENTATION_INDEX",
    "RELEASE_NOTES",
    "DESIGN_SYSTEM",
    "LOAD_TEST",
    "MONITORING_STRATEGY",
    "BACKUP_STRATEGY",
    "HIGH_AVAILABILITY_RUNBOOK",
    "PLATFORM_INCIDENT_RESPONSE",
}


def looks_like_doc_name(tok: str) -> bool:
    if tok in docname_noise:
        return True
    if tok.endswith(("_MD", "_PNG", "_SVG", "_JS", "_PY", "_JSON", "_YAML", "_YML")):
        return True
    keys = (
        "GUIDELINE",
        "CHECKLIST",
        "RUNBOOK",
        "STRATEGY",
        "VALIDATION",
        "MANAGEMENT",
        "PLANNING",
        "HARDENING",
        "OBSERVABILITY",
        "ARCHITECTURE",
        "WORKFLOW",
        "PREREQUISITE",
        "GUIDELINES",
        "README",
        "CHANGELOG",
        "ROADMAP",
    )
    return any(k in tok for k in keys)


unknown = []
for tok, n in doc_envs.most_common():
    if tok in truth or looks_like_doc_name(tok):
        continue
    unknown.append((n, tok, doc_loc[tok][:2]))

# example envs not in CONFIGURATION / HARDENING / SECURITY
cfg = (root / "docs" / "CONFIGURATION.md").read_text(encoding="utf-8", errors="replace")
hard = (root / "docs" / "operations" / "SECURITY_HARDENING.md").read_text(
    encoding="utf-8", errors="replace"
)
sec = (root / "SECURITY.md").read_text(encoding="utf-8", errors="replace")
key_docs = cfg + "\n" + hard + "\n" + sec
missing_from_key = sorted(e for e in example_envs if e not in key_docs and not e.startswith("REACT_"))

# ---- API ----
api_routes: set[str] = set()
for py in (root / "backend").rglob("*.py"):
    if should_skip(py) or "tests" in py.parts:
        continue
    try:
        t = py.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    for m in route_re.finditer(t):
        api_routes.add(m.group(2))

paths_openapi: set[str] = set()
oa = root / "docs" / "openapi.json"
if oa.exists():
    data = json.loads(oa.read_text(encoding="utf-8"))
    paths_openapi = set(data.get("paths", {}).keys())

doc_api: Counter[str] = Counter()
for md in root.rglob("*.md"):
    if should_skip(md):
        continue
    try:
        t = md.read_text(encoding="utf-8", errors="replace")
    except OSError:
        continue
    for m in api_doc_re.finditer(t):
        doc_api[m.group(1)] += 1


def in_solution(path: str) -> bool:
    cands = {path, path.rstrip("/")}
    if path.startswith("/api/v1/"):
        cands.add(path.replace("/api/v1/", "/api/", 1))
    elif path.startswith("/api/") and not path.startswith("/api/v1/"):
        cands.add(path.replace("/api/", "/api/v1/", 1))
    if cands & paths_openapi:
        return True
    for c in cands:
        for r in api_routes:
            if c == r or c.rstrip("/") == r.rstrip("/"):
                return True
            if c.endswith(r) or r.endswith(c.split("/")[-1]):
                # weak match on leaf only if leaf long enough
                leaf = c.rstrip("/").split("/")[-1]
                if len(leaf) >= 4 and leaf in r:
                    return True
    # openapi path param patterns
    for p in paths_openapi:
        # simple: same segment count with {} params
        if re.sub(r"\{[^}]+\}", "X", p) == re.sub(r"\{[^}]+\}", "X", path):
            return True
    return False


api_missing = [(n, p) for p, n in doc_api.most_common() if not in_solution(p)]

# CI workflows
ci_dir = root / ".github" / "workflows"
ci_files = [p.name for p in ci_dir.glob("*.yml")] + [p.name for p in ci_dir.glob("*.yaml")] if ci_dir.exists() else []
ci_text = ""
for p in ci_dir.glob("*") if ci_dir.exists() else []:
    if p.suffix in {".yml", ".yaml"}:
        ci_text += p.read_text(encoding="utf-8", errors="replace") + "\n"

supply_claims = {
    "pip-audit": "pip-audit" in ci_text or "pip_audit" in ci_text,
    "npm audit": "npm audit" in ci_text or "npm-audit" in ci_text,
    "dependabot": (root / ".github" / "dependabot.yml").exists()
    or (root / ".github" / "dependabot.yaml").exists(),
    "sbom": "sbom" in ci_text.lower() or "cyclonedx" in ci_text.lower(),
    "trivy/image scan": "trivy" in ci_text.lower() or "image-scan" in ci_text.lower(),
    "secret scan": "gitleaks" in ci_text.lower()
    or "trufflehog" in ci_text.lower()
    or "secret" in ci_text.lower(),
}

out = {
    "env": {
        "code_envs": len(code_envs),
        "example_envs": len(example_envs),
        "truth": len(truth),
        "doc_env_not_in_code_top": [
            {"count": n, "name": t, "files": locs} for n, t, locs in sorted(unknown, reverse=True)[:50]
        ],
        "example_env_missing_from_config_hardening_security": missing_from_key[:80],
        "example_env_missing_count": len(missing_from_key),
    },
    "api": {
        "routes_decorators": len(api_routes),
        "openapi_paths": len(paths_openapi),
        "doc_api_unique": len(doc_api),
        "doc_api_not_found_top": [{"count": n, "path": p} for n, p in api_missing[:50]],
        "doc_api_not_found_count": len(api_missing),
    },
    "ci": {"workflows": ci_files, "supply_chain_claim_evidence": supply_claims},
}

out_path = Path(os.environ.get("TEMP", str(root / "tmp"))) / "actira_docs_env_api_audit.json"
out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")

print(f"code_envs={len(code_envs)} example_envs={len(example_envs)} truth={len(truth)}")
print(f"doc_env_not_in_code_count={len(unknown)}")
print("TOP_DOC_ENV_NOT_IN_CODE:")
for n, t, locs in sorted(unknown, reverse=True)[:30]:
    print(f"  {n:4d}  {t}  ({', '.join(locs)})")
print(f"example_missing_from_key_docs={len(missing_from_key)}")
for e in missing_from_key[:40]:
    print(f"  {e}")
print(f"openapi_paths={len(paths_openapi)} decorator_routes={len(api_routes)}")
print(f"doc_api_not_found={len(api_missing)}")
for n, p in api_missing[:30]:
    print(f"  {n:4d}  {p}")
print("CI_WORKFLOWS:", ci_files)
print("SUPPLY_CHAIN:", supply_claims)
print(f"wrote {out_path}")
