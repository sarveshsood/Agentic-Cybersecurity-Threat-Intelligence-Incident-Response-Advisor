# Monitoring

| Asset | Purpose |
|-------|---------|
| [prometheus/actira-rules.example.yml](prometheus/actira-rules.example.yml) | Example alert rules |
| [prometheus/prometheus.example.yml](prometheus/prometheus.example.yml) | Example scrape config |
| [grafana/dashboard-actira.example.json](grafana/dashboard-actira.example.json) | Skeleton dashboard |
| [docs/operations/OBSERVABILITY_PACK.md](../docs/operations/OBSERVABILITY_PACK.md) | Prod checklist + honesty notes |
| API | `GET /metrics`, `GET /api/health`, `GET /api/ops/status` |

## Wire-up (lab)

1. Set `METRICS_TOKEN` in `backend/.env`.
2. Point Prometheus at `http://<api-host>:8001/metrics?format=prometheus` with `X-Metrics-Token` or Bearer.
3. Import the Grafana JSON skeleton and replace panel queries with your metric names from `/metrics`.

## Honesty

- Realtime ops (WS/SSE) is **in-process** — not a multi-replica event bus.
- Optional AMQP broker is **not** Celery and **not** the durable job store.
- Prefer Mongo-backed job claims + `ACTIRA_JOB_WORKER` leader pattern for HA.
