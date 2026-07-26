# Evaluation Metrics

| Metric                  | Source                       |
|-------------------------|------------------------------|
| IoC precision/recall/F1 | `golden_eval.py`             |
| Technique recall        | golden                       |
| Mean grounding          | playbook citations / steps   |
| Citation accuracy       | allow-list residual + golden |
| Phase coverage          | containment…lessons          |
| Retrieval hit@k         | `retrieval_eval.py`          |
| Latency                 | golden + benchmarks          |
| Cost / request          | llm_usage + provider billing |

Gates: `backend/tests/test_golden_benchmark.py` thresholds.
