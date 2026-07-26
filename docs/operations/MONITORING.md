# Monitoring Strategy

## Signals

| Signal   | Source                          |
|----------|---------------------------------|
| Liveness | `GET /health` / `/api/health`   |
| Metrics  | `GET /metrics` (token or admin) |
| Logs     | structured `actira` logger      |
| Jobs     | `log_jobs` status distribution  |
| LLM      | `llm_usage` / budget settings   |

## Suggested alerts (pilot)

- Health failing 2m
- Mongo ping fail
- Job failed rate > threshold
- Disk for LanceDB / payloads

## Stack options

Prometheus scrape `/metrics` · Grafana dashboards (see `monitoring/`) · cloud APM later (OTEL roadmap)
