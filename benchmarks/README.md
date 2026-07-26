# Performance Benchmarks

## Profiles

| Profile | Concurrent users (simulated) | Notes                                 |
|---------|------------------------------|---------------------------------------|
| smoke   | 1                            | Default local                         |
| light   | 10                           | Lab laptop                            |
| medium  | 100                          | Needs warm API; may queue             |
| stress  | 500                          | Methodology only unless dedicated env |

## Metrics

- API latency (p50/p95) for `/api/health`, `/api/auth/login`, `/api/incidents`
- Optional KB search latency
- Process CPU/memory snapshot (best-effort)
- LLM latency: **not** included in default offline profile (`--skip-llm`)

## Run

```bash
# API must be running
python benchmarks/run_benchmarks.py --profile smoke --base-url http://127.0.0.1:8001
python benchmarks/run_benchmarks.py --profile light --email analyst@soc.example.com --password 'Analyst123!'
```

Reports write to `benchmarks/reports/`.

## Published lab baselines

See [reports/BASELINE_LAB.md](reports/BASELINE_LAB.md) — numbers from a single workstation; not a contractual SLA.
