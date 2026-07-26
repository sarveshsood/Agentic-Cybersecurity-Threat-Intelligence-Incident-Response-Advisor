"""P0 import audit: find bare local imports that should be backend.*."""
from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
SKIP_DIRS = {
    "__pycache__",
    "data",
    "backup",
    "bkp",
    ".venv",
    "node_modules",
    # Historical one-shot modularization helpers — not runtime code.
    "scripts",
}

LOCAL_TOPS = {
    "ai_investigator",
    "analytics",
    "attack_catalog",
    "attack_mapping",
    "auth",
    "auth_throttle",
    "correlator",
    "embeddings",
    "enrichment",
    "enrichment_cache",
    "external_secrets",
    "golden_eval",
    "hitl_gate",
    "ioc_extractor",
    "job_queue",
    "job_status",
    "knowledge_base",
    "llm_provider",
    "llm_usage",
    "lora_train",
    "models",
    "mongo_util",
    "notifications",
    "parsers",
    "pipeline",
    "playbook_agent",
    "reranker",
    "retention",
    "retrieval_eval",
    "roadmap_data",
    "secret_vault",
    "secrets_util",
    "server",
    "vector_store",
    "core",
    "routers",
}


def main() -> int:
    problems: list[tuple[str, int, str]] = []
    for path in BACKEND.rglob("*.py"):
        if any(s in path.parts for s in SKIP_DIRS):
            continue
        try:
            src = path.read_text(encoding="utf-8")
            tree = ast.parse(src, filename=str(path))
        except SyntaxError as e:
            problems.append((str(path.relative_to(ROOT)), 0, f"PARSE:{e}"))
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.level and node.level > 0:
                    # Package-local relatives in routers/__init__.py are required
                    # (absolute `from backend.routers import X` re-enters this module).
                    if (
                        "routers" in path.parts
                        and path.name == "__init__.py"
                        and node.level == 1
                        and (node.module is None or not str(node.module).startswith("backend"))
                    ):
                        continue
                    problems.append(
                        (
                            str(path.relative_to(ROOT)),
                            node.lineno,
                            f"relative:{'.' * node.level}{node.module or ''}",
                        )
                    )
                    continue
                if not node.module:
                    continue
                top = node.module.split(".")[0]
                if top in LOCAL_TOPS and not node.module.startswith("backend"):
                    problems.append(
                        (str(path.relative_to(ROOT)), node.lineno, f"bare:{node.module}")
                    )
            elif isinstance(node, ast.Import):
                for alias in node.names:
                    top = alias.name.split(".")[0]
                    if top in LOCAL_TOPS and not alias.name.startswith("backend"):
                        problems.append(
                            (
                                str(path.relative_to(ROOT)),
                                node.lineno,
                                f"import:{alias.name}",
                            )
                        )

    print(f"Found {len(problems)} non-standard local imports under backend/")
    for file, line, kind in sorted(problems):
        print(f"  {file}:{line}: {kind}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
