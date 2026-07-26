# Load test report — 10 and 100 concurrent users

**Status:** Methodology + lab envelope published (v1.3 HA close-out).  
**Harness:** `python benchmarks/run_benchmarks.py`  
**Date of pack:** 2026-07-26  

This is a **capacity conversation artifact**, not a contractual SLA or multi-region certification.

## Profiles

| Profile | Concurrent users | Iterations | Total tasks | When to run |
|---------|------------------|------------|-------------|-------------|
| `light` | **10** | 3 | 30 | Laptop / single replica lab |
| `medium` | **100** | 1 | 100 | Multi-replica staging or beefy lab |

```bash
# API running (lab)
python benchmarks/run_benchmarks.py --profile light --base-url http://127.0.0.1:8001
python benchmarks/run_benchmarks.py --profile medium --base-url http://127.0.0.1:8001

# Multi-replica staging
python benchmarks/run_benchmarks.py --profile light --base-url https://actira-staging.example.com
python benchmarks/run_benchmarks.py --profile medium --base-url https://actira-staging.example.com
```

JSON reports land in `benchmarks/reports/bench_{profile}_{unix}.json`.  
Use `--write-md` to also emit a sibling Markdown summary.

## What is measured

| Endpoint | Auth | Notes |
|----------|------|--------|
| `GET /api/health` | No | Always |
| `GET /api/incidents` | Yes | List path |
| `GET /api/kb/search?q=phishing` | Yes | Hybrid/BM25 path |
| `GET /api/kpis` | Yes | Cached facet path (P2) |

LLM playbook generation is **excluded** (would dominate cost and latency).

## Lab envelope (order-of-magnitude)

Captured on a **single workstation, 1 uvicorn worker, local Mongo, hash embedder, no live LLM** (illustrative).

| Profile | Health p50 / p95 | Incidents p50 / p95 | KPI p50 / p95 | Notes |
|---------|------------------|---------------------|---------------|--------|
| 10 users (`light`) | < 30 / < 150 ms | < 100 / < 800 ms | < 80 / < 400 ms | Warm process |
| 100 users (`medium`) | < 80 / < 500 ms | varies / often 1–3 s | < 200 / < 1.5 s | Expect queueing on 1 replica |

**Multi-replica target (staging):** with 2+ API pods + shared Mongo, medium health p95 should stay under ~300 ms if LB is healthy and pods are not CPU-starved.

## Pass criteria (lab regression)

| Profile | Fail if |
|---------|---------|
| light | > 5% non-2xx on health, or health p95 > 1s |
| medium | > 10% non-2xx on health, or harness cannot finish |

Tune thresholds in CI only if a live staging target is wired; default CI does **not** run medium against production.

## Related

- [BASELINE_LAB.md](BASELINE_LAB.md) — earlier smoke/light methodology  
- [HA_VALIDATION.md](../../docs/operations/HA_VALIDATION.md) — multi-replica checklist  
- [MULTI_WORKER.md](../../docs/MULTI_WORKER.md) — process-local vs shared state  
