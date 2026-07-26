# Monitoring

| Asset                                                                          | Purpose                           |
|--------------------------------------------------------------------------------|-----------------------------------|
| [prometheus/actira-rules.example.yml](prometheus/actira-rules.example.yml)     | Example alert rules               |
| [grafana/dashboard-actira.example.json](grafana/dashboard-actira.example.json) | Skeleton dashboard                |
| API                                                                            | `GET /metrics`, `GET /api/health` |

Wire Prometheus to scrape API with `METRICS_TOKEN` or admin auth as configured.
