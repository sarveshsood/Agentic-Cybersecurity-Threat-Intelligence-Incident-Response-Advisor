# ACTIRA observability pack (Sprint 12)

Honest single-tenant IR advisor telemetry — not a SIEM mesh, not multi-tenant SaaS.

## Surfaces

| Surface | Path / asset | Auth |
|---------|--------------|------|
| Liveness | `GET /health`, `GET /api/health` | none |
| Readiness | `GET /ready`, `GET /api/ready` | none (503 if Mongo down) |
| JSON gauges | `GET /metrics?format=json` | admin JWT or `X-Metrics-Token` |
| Prometheus text | `GET /metrics?format=prometheus` | same |
| Ops HA snapshot | `GET /api/ops/status` | admin |
| Queue KPIs | `GET /api/kpis/queue` | authenticated |
| Realtime queue | `WS /api/ws/ops`, `SSE GET /api/sse/ops` | cookie/JWT; flag `FEATURE_REALTIME_OPS` |
| Example rules | [monitoring/prometheus/actira-rules.example.yml](../../monitoring/prometheus/actira-rules.example.yml) |
| Example scrape | [monitoring/prometheus/prometheus.example.yml](../../monitoring/prometheus/prometheus.example.yml) |
| Grafana skeleton | [monitoring/grafana/dashboard-actira.example.json](../../monitoring/grafana/dashboard-actira.example.json) |

## Prod checklist

1. **`SECRETS_MASTER_KEY`** — explicit Fernet key or long passphrase (do not rely on JWT-derived vault in prod).
2. **`JWT_SECRET`** — ≥32 random chars; weak secrets refused when `ENV=production|staging`.
3. **Multi-worker** — API replicas: `ACTIRA_JOB_WORKER=0`; one worker Deployment: `ACTIRA_JOB_WORKER=1`. Payloads: `ACTIRA_JOB_PAYLOAD_BACKEND=mongo`. See [MULTI_WORKER.md](../MULTI_WORKER.md).
4. **Broker honesty** — optional `job_broker_*` is wake-up only; Mongo remains claim source of truth. Not Celery.
5. **Metrics** — set `METRICS_TOKEN` for scrape; never expose unauthenticated metrics on public edges.
6. **Realtime** — SSE/WS are **in-process**; multi-replica does not fan-out events (poll `/kpis/queue` remains correct).

## Docker healthcheck

Compose backend probe:

```text
GET http://127.0.0.1:8001/api/health
start_period: 40s · retries: 5
```

Local scripts: `scripts/healthcheck.ps1` / `.sh` (+ `-Deep` / `--deep` for `/api/ready`).

## Minimal scrape (Prometheus)

```yaml
scrape_configs:
  - job_name: actira
    metrics_path: /metrics
    params:
      format: [prometheus]
    authorization:
      type: Bearer
      credentials: "${METRICS_TOKEN}"
    # or: headers: { X-Metrics-Token: "${METRICS_TOKEN}" }
    static_configs:
      - targets: ["actira-backend:8001"]
```

## Non-goals

- Multi-tenant SaaS isolation metrics
- Live SIEM connector mesh
- Free-form agent-to-agent swarm traces
- Celery Flower / broker as job source of truth
