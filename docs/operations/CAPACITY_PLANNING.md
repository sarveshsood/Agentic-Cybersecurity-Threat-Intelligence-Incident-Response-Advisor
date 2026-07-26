# Capacity Planning

## Sizing heuristics (single-tenant pilot)

| Users (concurrent analysts) | API replicas  | Mongo     | Notes                    |
|-----------------------------|---------------|-----------|--------------------------|
| 1–10                        | 1             | small     | Default compose          |
| 10–50                       | 2             | medium    | Multi-worker docs        |
| 50–100                      | 2–4 + worker  | managed   | LLM is bottleneck        |
| 500                         | not validated | dedicated | Need load test + caching |

## Dominant costs

- LLM tokens (largest variable cost)
- TI API calls (cache helps)
- Mongo storage for incidents/logs

See `benchmarks/` for methodology and reported lab numbers.
