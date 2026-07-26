"""Rewrite bare local imports in tests to backend.* and fix sys.path inserts."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# Order matters: longer names first to avoid partial replacements
MODULES = [
    "ai_investigator",
    "attack_catalog",
    "attack_mapping",
    "auth_throttle",
    "enrichment_cache",
    "external_secrets",
    "golden_eval",
    "knowledge_base",
    "llm_provider",
    "llm_usage",
    "lora_train",
    "mongo_util",
    "notifications",
    "playbook_agent",
    "retrieval_eval",
    "roadmap_data",
    "secret_vault",
    "secrets_util",
    "vector_store",
    "job_queue",
    "job_status",
    "embeddings",
    "enrichment",
    "retention",
    "correlator",
    "reranker",
    "pipeline",
    "parsers",
    "analytics",
    "models",
    "server",
    "auth",
    "core",
    "routers",
]


def fix_sys_path_block(text: str, *, backend_tests: bool) -> str:
    """Replace BACKEND-on-path with REPO_ROOT-on-path."""
    # Common pattern in backend/tests
    patterns = [
        (
            r"BACKEND\s*=\s*Path\(__file__\)\.resolve\(\)\.parents\[1\]\s*\n"
            r"if str\(BACKEND\) not in sys\.path:\s*\n"
            r"\s*sys\.path\.insert\(0,\s*str\(BACKEND\)\)\s*\n",
            (
                "REPO_ROOT = Path(__file__).resolve().parents[2]\n"
                "if str(REPO_ROOT) not in sys.path:\n"
                "    sys.path.insert(0, str(REPO_ROOT))\n"
            )
            if backend_tests
            else (
                "REPO_ROOT = Path(__file__).resolve().parents[1]\n"
                "if str(REPO_ROOT) not in sys.path:\n"
                "    sys.path.insert(0, str(REPO_ROOT))\n"
            ),
        ),
        (
            r"BACKEND\s*=\s*Path\(__file__\)\.resolve\(\)\.parents\[1\]\s*\n"
            r"if str\(BACKEND\) not in sys\.path:\s*\n"
            r"\s*sys\.path\.insert\(0,\s*str\(BACKEND\)\)\s*\n",
            "REPO_ROOT = Path(__file__).resolve().parents[1]\n"
            "if str(REPO_ROOT) not in sys.path:\n"
            "    sys.path.insert(0, str(REPO_ROOT))\n",
        ),
    ]
    for pat, repl in patterns:
        text2 = re.sub(pat, repl, text)
        if text2 != text:
            text = text2
            break

    # tests/conftest and tests/* use parents[1] for repo root already sometimes
    text = re.sub(
        r"BACKEND\s*=\s*Path\(__file__\)\.resolve\(\)\.parents\[1\]\s*/\s*\"backend\"|"
        r"BACKEND\s*=\s*Path\(__file__\)\.resolve\(\)\.parents\[1\]\s*/\s*'backend'",
        'REPO_ROOT = Path(__file__).resolve().parents[1]\nBACKEND = REPO_ROOT / "backend"',
        text,
    )
    return text


def fix_imports(text: str) -> str:
    for mod in MODULES:
        # from X import ...
        text = re.sub(
            rf"(?m)^(\s*)from {re.escape(mod)}(\.[\w.]+)? import ",
            rf"\1from backend.{mod}\2 import ",
            text,
        )
        # import X
        text = re.sub(
            rf"(?m)^(\s*)import {re.escape(mod)}(\s|$|,)",
            rf"\1import backend.{mod}\2",
            text,
        )
        # avoid double backend.backend
    text = text.replace("backend.backend.", "backend.")
    # core.database already handled as from backend.core.database if mod core matched core.database via core
    # from backend.core import is fine; from backend.core.database is fine
    return text


def process(path: Path, *, backend_tests: bool) -> bool:
    orig = path.read_text(encoding="utf-8")
    text = fix_sys_path_block(orig, backend_tests=backend_tests)
    text = fix_imports(text)
    if text != orig:
        path.write_text(text, encoding="utf-8")
        return True
    return False


def main() -> None:
    changed = []
    for path in (ROOT / "backend" / "tests").rglob("*.py"):
        if process(path, backend_tests=True):
            changed.append(path)
    for path in (ROOT / "tests").rglob("*.py"):
        if process(path, backend_tests=False):
            changed.append(path)
    print(f"Updated {len(changed)} files")
    for p in changed:
        print(" ", p.relative_to(ROOT))


if __name__ == "__main__":
    main()
