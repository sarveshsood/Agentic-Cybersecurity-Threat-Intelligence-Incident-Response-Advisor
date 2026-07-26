# Golden IR dataset (CI)

Frozen **synthetic** log snippets with **analyst-curated** expected IoCs and MITRE techniques for offline pipeline
benchmarks.

## Layout

| Path                          | Role                                                       |
|-------------------------------|------------------------------------------------------------|
| `dataset.json`                | v2 payload: metadata + N≥30 cases                          |
| `build_dataset.py`            | Regenerates `dataset.json` from curated scenario templates |
| `../../golden_eval.py`        | Offline runner + metrics + CI thresholds                   |
| `../test_golden_benchmark.py` | Pytest gates                                               |

## Case schema

```json
{
  "id": "g001",
  "name": "ssh_bruteforce_01",
  "family": "ssh_bruteforce",
  "log": "...",
  "label_source": "curated_v1",
  "notes": "optional analyst note",
  "expected": {
    "iocs": [{"type": "ip", "value": "185.220.101.45"}],
    "technique_ids": ["T1110"],
    "playbook_phases": ["containment", "eradication", "recovery", "lessons_learned"],
    "min_grounding": 0.5
  }
}
```

**Label policy:** `expected.iocs` / `technique_ids` are explicit in `build_dataset.py` (not silently copied from the
live extractor). Each build **validates** gold against `extract_iocs` + `infer_techniques` so CI fails on drift.

## Scenario families (rebalanced)

Fewer near-duplicate SSH clones; coverage across auth, exploit, phishing, execution/transfer, C2, persistence, lateral,
ransomware, discovery, supply-chain, and noise-filter cases.

Rebuild prints family counts. Typical size: **~35 cases / ~17 families**.

## Metrics

| Metric               | Definition                                                                          |
|----------------------|-------------------------------------------------------------------------------------|
| **IoC F1**           | Multiset F1 on `(type, value)` vs gold (case-insensitive values)                    |
| **Technique recall** | \|pred ∩ gold\| / \|gold\| over ATT&CK technique IDs                                |
| **Grounding**        | Playbook cited-steps / total steps (template path)                                  |
| **Phase coverage**   | Required phases: containment, eradication, recovery, lessons_learned                |
| **Latency**          | Wall time of offline slice (extract → mock enrich → techniques → template playbook) |

## Offline path

No MongoDB and no LLM API keys. Playbook generation uses `_fallback_playbook` (`llm_provider=template`).

## Run

```bash
cd backend

# Regenerate + validate (exits 1 on gold/extractor mismatch)
python tests/golden/build_dataset.py

# Validate only (no write)
python tests/golden/build_dataset.py --check

# CLI summary
python -m golden_eval

# CI gates
pytest tests/test_golden_benchmark.py -v -n 0
```

## Thresholds (`golden_eval.DEFAULT_THRESHOLDS`)

| Gate                             | Default |
|----------------------------------|---------|
| min_cases                        | 30      |
| min_ioc_f1                       | 0.85    |
| min_technique_recall             | 0.80    |
| min_mean_grounding               | 0.50    |
| min_phase_coverage (full phases) | 1.0     |
| max_mean_latency_s               | 5.0     |

## UI

**Golden Benchmark** page in the console re-runs the same offline harness via the API (admin). Use it to interpret
pass/fail and per-metric scores without shell access.

## License / sources

Synthetic SOC-style log lines for evaluation only (**not** production telemetry, **not** licensed third-party PCAP/EVTX
dumps).

Themes loosely inspired by public IR narratives (CISA KEV, MITRE ATT&CK technique IDs already in the in-app KB).
Technique labels follow ATT&CK IDs the keyword inferencer can hit today.

### What this is *not*

- A substitute for reviewing live incidents or full LLM-generated playbooks
- A claim of production model accuracy on real customer logs
