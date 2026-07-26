#!/usr/bin/env python3
"""ACTIRA lightweight concurrency benchmark (stdlib + urllib).

Does not require locust. Measures health/login/incidents latency under
thread-pool concurrency. LLM paths skipped by default.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

PROFILES = {
    "smoke": {"users": 1, "iterations": 5},
    "light": {"users": 10, "iterations": 3},
    "medium": {"users": 100, "iterations": 1},
    "stress": {"users": 500, "iterations": 1},
}


def _req(method: str, url: str, data: bytes | None = None, headers: dict | None = None, timeout: float = 30.0):
    h = dict(headers or {})
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            body = resp.read()
            status = resp.status
    except urllib.error.HTTPError as e:
        body = e.read()
        status = e.code
    except Exception as e:
        return {"ok": False, "error": str(e), "ms": (time.perf_counter() - t0) * 1000}
    ms = (time.perf_counter() - t0) * 1000
    return {"ok": 200 <= status < 300, "status": status, "ms": ms, "bytes": len(body)}


def _stats(samples: list[float]) -> dict:
    if not samples:
        return {"n": 0}
    samples = sorted(samples)

    def pct(p):
        i = min(len(samples) - 1, max(0, int(round((p / 100) * (len(samples) - 1)))))
        return samples[i]

    return {
        "n": len(samples),
        "p50_ms": round(statistics.median(samples), 2),
        "p95_ms": round(pct(95), 2),
        "mean_ms": round(statistics.fmean(samples), 2),
        "max_ms": round(max(samples), 2),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--profile", choices=sorted(PROFILES), default="smoke")
    ap.add_argument("--base-url", default=os.environ.get("ACTIRA_BASE", "http://127.0.0.1:8001"))
    ap.add_argument("--email", default=os.environ.get("ACTIRA_EMAIL", "analyst@soc.example.com"))
    ap.add_argument("--password", default=os.environ.get("ACTIRA_PASSWORD", "Analyst123!"))
    ap.add_argument("--skip-auth", action="store_true")
    ap.add_argument(
        "--write-md",
        action="store_true",
        help="Also write a Markdown summary next to the JSON report",
    )
    args = ap.parse_args()
    base = args.base_url.rstrip("/")
    cfg = PROFILES[args.profile]
    users = cfg["users"]
    iters = cfg["iterations"]

    # Cap stress on accidental local run
    if args.profile == "stress" and os.environ.get("ACTIRA_ALLOW_STRESS") != "1":
        print("Refusing stress profile without ACTIRA_ALLOW_STRESS=1", file=sys.stderr)
        return 2

    health = _req("GET", f"{base}/api/health")
    if not health.get("ok"):
        print("API health failed:", health, file=sys.stderr)
        return 1

    token = None
    if not args.skip_auth:
        payload = json.dumps({"email": args.email, "password": args.password}).encode()
        login = _req(
            "POST",
            f"{base}/api/auth/login",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        if not login.get("ok"):
            print("Login failed — use lab seed user or --skip-auth for health-only", login, file=sys.stderr)
            return 1
        # re-login once to parse token
        import urllib.request as u

        req = u.Request(
            f"{base}/api/auth/login",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with u.urlopen(req, timeout=30) as resp:
            token = json.loads(resp.read().decode()).get("access_token")

    results: dict[str, list[float]] = {
        "health": [],
        "incidents": [],
        "kb": [],
        "kpis": [],
    }
    errors = {"health": 0, "incidents": 0, "kb": 0, "kpis": 0}
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    def one_round(_i: int):
        h = _req("GET", f"{base}/api/health")
        out: dict = {"health": h}
        if token:
            out["incidents"] = _req("GET", f"{base}/api/incidents", headers=headers)
            out["kb"] = _req(
                "GET", f"{base}/api/kb/search?q=phishing&top_k=3", headers=headers
            )
            out["kpis"] = _req("GET", f"{base}/api/kpis", headers=headers)
        return out

    total_tasks = users * iters
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=min(users, 64)) as ex:
        futs = [ex.submit(one_round, i) for i in range(total_tasks)]
        for f in as_completed(futs):
            row = f.result()
            for key in ("health", "incidents", "kb", "kpis"):
                sample = row.get(key)
                if not sample:
                    continue
                if sample.get("ok") and sample.get("ms") is not None:
                    results[key].append(sample["ms"])
                else:
                    errors[key] += 1
    wall = time.perf_counter() - t0

    report = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "profile": args.profile,
        "base_url": base,
        "users": users,
        "iterations": iters,
        "total_tasks": total_tasks,
        "wall_seconds": round(wall, 3),
        "throughput_tasks_per_s": round(total_tasks / wall, 2) if wall else None,
        "errors": errors,
        "latency": {
            "health": _stats(results["health"]),
            "incidents": _stats(results["incidents"]),
            "kb_search": _stats(results["kb"]),
            "kpis": _stats(results["kpis"]),
        },
        "notes": (
            "Lab microbenchmark; not multi-region SLA. LLM excluded. "
            "See benchmarks/reports/LOAD_TEST_10_100.md"
        ),
    }

    out_dir = Path(__file__).resolve().parent / "reports"
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = int(time.time())
    out_path = out_dir / f"bench_{args.profile}_{stamp}.json"
    out_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Wrote {out_path}")

    if args.write_md:
        md_path = out_dir / f"bench_{args.profile}_{stamp}.md"
        lat = report["latency"]

        def line(name: str, block: dict) -> str:
            if not block or not block.get("n"):
                return f"| {name} | — | — | — | 0 |"
            return (
                f"| {name} | {block.get('p50_ms')} | {block.get('p95_ms')} | "
                f"{block.get('mean_ms')} | {block.get('n')} |"
            )

        md = "\n".join(
            [
                f"# Bench report — `{args.profile}`",
                "",
                f"- **When:** {report['ts']}",
                f"- **Base URL:** `{base}`",
                f"- **Users × iterations:** {users} × {iters} = {total_tasks} tasks",
                f"- **Wall:** {report['wall_seconds']}s · "
                f"**Throughput:** {report['throughput_tasks_per_s']} tasks/s",
                f"- **Errors:** `{json.dumps(errors)}`",
                "",
                "| Endpoint | p50 ms | p95 ms | mean ms | n |",
                "|----------|--------|--------|---------|---|",
                line("health", lat.get("health") or {}),
                line("incidents", lat.get("incidents") or {}),
                line("kb_search", lat.get("kb_search") or {}),
                line("kpis", lat.get("kpis") or {}),
                "",
                report["notes"],
                "",
            ]
        )
        md_path.write_text(md, encoding="utf-8")
        print(f"Wrote {md_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
