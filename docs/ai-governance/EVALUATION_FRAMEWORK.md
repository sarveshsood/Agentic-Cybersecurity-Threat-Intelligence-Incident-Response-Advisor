# Formal AI Evaluation Framework

## Artifacts

| Artifact            | Path                                           |
|---------------------|------------------------------------------------|
| Golden IR dataset   | `backend/tests/golden/dataset.json`            |
| Retrieval pairs     | `backend/tests/golden/retrieval_pairs.json`    |
| Runner              | `backend/golden_eval.py`                       |
| Retrieval eval      | `backend/retrieval_eval.py`                    |
| CI                  | `.github/workflows/golden-ci.yml`              |
| Metrics definitions | [EVALUATION_METRICS.md](EVALUATION_METRICS.md) |

## Suite matrix

| Suite               | Measures                                             | Live LLM?            |
|---------------------|------------------------------------------------------|----------------------|
| Golden IR           | IoC F1, technique recall, grounding, phases, latency | No (offline path)    |
| Retrieval           | hit@k                                                | No                   |
| Hardening unit      | HiTL, secrets, JSON parse                            | No                   |
| Prompt regression   | Prompt change impact via golden                      | No                   |
| Live provider smoke | Optional manual                                      | Yes (`requires_llm`) |

## Hallucination rate (operational definition)

Fraction of playbook steps with **zero valid citations** after allow-list filter, aggregated over golden set
(`1 - mean_grounding` when steps require citations).

## Citation accuracy

Share of citation_ids that exist in retrieved source set (enforced to 100% post-filter; pre-filter logged in eval when
available).

## Cost per request

Track via `llm_usage` + provider invoices; not asserted in offline CI.

## Release gate

```bash
cd backend && pytest tests/test_golden_benchmark.py -n 0
```
