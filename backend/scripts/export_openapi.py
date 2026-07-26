#!/usr/bin/env python3
"""Export FastAPI OpenAPI schema (contract snapshot) for ACTIRA.

Usage (from repo root or backend/):
  python backend/scripts/export_openapi.py              # write docs/openapi.json
  python backend/scripts/export_openapi.py --check      # fail if drift vs committed
  python backend/scripts/export_openapi.py --stdout     # print JSON to stdout

CI and local dev do not need a live Mongo for schema generation — only env vars
so `server` can import (Motor client is lazy for actual I/O).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
DEFAULT_OUT = REPO_ROOT / "docs" / "openapi.json"


def _ensure_import_env() -> None:
    # Dummy values are enough for import + app.openapi(); no server startup / seed.
    os.environ.setdefault("MONGO_URL", "mongodb://127.0.0.1:27017")
    os.environ.setdefault("DB_NAME", "soc_console_openapi_export")
    os.environ.setdefault("JWT_SECRET", "openapi-export-only-not-for-production-use-32")
    # Package imports: repo root must be on sys.path for `backend.*`
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))


def build_schema() -> dict:
    _ensure_import_env()
    from backend.server import app  # noqa: WPS433 — after env + path

    return app.openapi()


def dump_schema(schema: dict) -> str:
    # sort_keys for stable git diffs
    return json.dumps(schema, indent=2, sort_keys=True) + "\n"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Export or check ACTIRA OpenAPI snapshot")
    p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=DEFAULT_OUT,
        help=f"Output path (default: {DEFAULT_OUT})",
    )
    p.add_argument(
        "--check",
        action="store_true",
        help="Exit 1 if live schema differs from committed file (no write)",
    )
    p.add_argument(
        "--stdout",
        action="store_true",
        help="Print schema JSON to stdout instead of writing a file",
    )
    args = p.parse_args(argv)

    schema = build_schema()
    text = dump_schema(schema)
    n_paths = len(schema.get("paths") or {})

    if args.stdout:
        sys.stdout.write(text)
        return 0

    out: Path = args.output
    if args.check:
        if not out.is_file():
            print(f"FAIL: missing committed OpenAPI snapshot: {out}", file=sys.stderr)
            print("Run: python backend/scripts/export_openapi.py", file=sys.stderr)
            return 1
        committed = out.read_text(encoding="utf-8")
        if committed != text:
            print(f"FAIL: OpenAPI drift vs {out}", file=sys.stderr)
            print(
                "Regenerate with: python backend/scripts/export_openapi.py",
                file=sys.stderr,
            )
            print(
                f"Live paths={n_paths}; committed size={len(committed)} live size={len(text)}",
                file=sys.stderr,
            )
            return 1
        print(f"OK: OpenAPI matches {out} ({n_paths} paths)")
        return 0

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    print(f"Wrote {out} ({n_paths} paths, {out.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
