"""Audit local markdown links across the repo."""
from __future__ import annotations

import json
import os
import re
from collections import defaultdict
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
    "coverage",
}


def should_skip(p: Path) -> bool:
    return any(part in skip_parts for part in p.parts)


link_re = re.compile(r"\[([^\]]*)\]\(([^)]+)\)")

mds = [p for p in root.rglob("*.md") if not should_skip(p)]
broken: list[tuple[str, str]] = []
by_file: dict[str, list[str]] = defaultdict(list)
ok = external = anchors_only = 0

for md in mds:
    try:
        text = md.read_text(encoding="utf-8", errors="replace")
    except OSError as e:
        broken.append((str(md.relative_to(root)), f"(read error: {e})"))
        continue
    for m in link_re.finditer(text):
        url = m.group(2).strip()
        if " " in url and not url.startswith("http"):
            url = url.split()[0]
        url = url.strip("<>\"'")
        if not url or url.startswith("#"):
            anchors_only += 1
            continue
        if url.startswith(("http://", "https://", "mailto:", "tel:")):
            external += 1
            continue
        path_part = url.split("#", 1)[0]
        if not path_part:
            anchors_only += 1
            continue
        if path_part.startswith("/"):
            target = root / path_part.lstrip("/")
        else:
            target = (md.parent / path_part).resolve()
        exists = target.exists()
        if not exists:
            alt = root / path_part
            exists = alt.exists()
        if exists:
            ok += 1
        else:
            rel = str(md.relative_to(root))
            broken.append((rel, url))
            by_file[rel].append(url)

out = Path(os.environ.get("TEMP", str(root / "tmp"))) / "actira_docs_link_audit.json"
out.write_text(
    json.dumps(
        {
            "stats": {
                "md_files": len(mds),
                "ok": ok,
                "broken": len(broken),
                "external": external,
                "anchors_only": anchors_only,
                "files_with_broken": len(by_file),
            },
            "broken": broken,
            "by_file": dict(sorted(by_file.items(), key=lambda kv: -len(kv[1]))),
        },
        indent=2,
    ),
    encoding="utf-8",
)

print(f"md_files={len(mds)}")
print(f"links_ok={ok} links_broken={len(broken)} external={external} anchors_only={anchors_only}")
print(f"files_with_broken_links={len(by_file)}")
print("TOP_FILES:")
for f, urls in sorted(by_file.items(), key=lambda kv: -len(kv[1]))[:25]:
    print(f"  {len(urls):3d}  {f}")
print("SAMPLE_BROKEN:")
for item in broken[:60]:
    print(f"  {item[0]} -> {item[1]}")
print(f"wrote {out}")
