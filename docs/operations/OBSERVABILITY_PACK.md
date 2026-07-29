# ACTIRA Observability Pack

Version: 12.0 (Sprint 12)

Enterprise Observability Guide for the **ACTIRA Enterprise SOC Platform**

> **Design Principle**
>
> ACTIRA is an **enterprise single-tenant AI Incident Response Advisor**, **not** a SIEM platform, **not** a multi-tenant SaaS, and **not** a distributed event mesh.
>
> Observability focuses on platform health, AI operations, job processing, infrastructure, and production readiness while remaining intentionally simple and operationally honest.

---

# Objectives

The observability platform should allow operators to answer:

- Is the platform healthy?
- Can it serve traffic?
- Are jobs progressing?
- Are AI providers healthy?
- Are analysts affected?
- Is infrastructure operating within limits?
- Are deployments safe?
- Is the platform ready for production?

---

# Observability Architecture

```
                    Prometheus
                         │
                         ▼
                   /metrics endpoint
                         │
      ┌──────────────────┼──────────────────┐
      │                  │                  │
 API Health        Queue Metrics      AI Usage
      │                  │                  │
      └──────────────────┼──────────────────┘
                         │
                   ACTIRA Backend
                         │
        ┌────────────────┼────────────────┐
        │                │                │
    MongoDB          Job Worker      LLM Providers
```

Future roadmap:

```
OpenTelemetry
        │
Grafana Tempo
        │
Distributed Traces
```

---

# Observability Surfaces

| Surface | Endpoint / Asset | Authentication |
|----------|------------------|----------------|
| Liveness | `GET /health`, `GET /api/health` | None |
| Readiness | `GET /ready`, `GET /api/ready` | None (returns **503** when critical dependencies are unavailable) |
| JSON Metrics | `GET /metrics?format=json` | Admin JWT or `X-Metrics-Token` |
| Prometheus Metrics | `GET /metrics?format=prometheus` | Admin JWT or `X-Metrics-Token` |
| Operations Status | `GET /api/ops/status` | Admin |
| Queue KPIs | `GET /api/kpis/queue` | Authenticated |
| Realtime Operations (WebSocket) | `WS /api/ws/ops` | Cookie/JWT + `FEATURE_REALTIME_OPS` |
| Realtime Operations (SSE) | `GET /api/sse/ops` | Cookie/JWT + `FEATURE_REALTIME_OPS` |
| Prometheus Rules | `monitoring/prometheus/actira-rules.example.yml` | Repository |
| Prometheus Scrape Config | `monitoring/prometheus/prometheus.example.yml` | Repository |
| Grafana Dashboard | `monitoring/grafana/dashboard-actira.example.json` | Repository |

---

# Health Endpoints

## Liveness

```
GET /health
GET /api/health
```

Purpose

- Process running
- HTTP responding
- Container healthy

Should **not** verify downstream dependencies.

---

## Readiness

```
GET /ready
GET /api/ready
```

Purpose

Verify:

- MongoDB connectivity
- Required configuration
- Essential dependencies

Return

```
HTTP 503
```

when the instance should not receive traffic.

---

# Metrics Endpoint

Supported formats

## JSON

```
GET /metrics?format=json
```

Useful for

- Internal dashboards
- Debugging
- Automation
- API clients

---

## Prometheus

```
GET /metrics?format=prometheus
```

Recommended for

- Prometheus
- Grafana
- Kubernetes monitoring

---

# Security

Metrics should **never** be exposed publicly.

Authentication

- Admin JWT

OR

```
X-Metrics-Token
```

Recommended production configuration

```
METRICS_TOKEN
```

---

# Operations APIs

## HA Status

```
GET /api/ops/status
```

Provides

- Replica health
- Worker ownership
- Queue summary
- Mongo connectivity
- Build information
- Runtime configuration

Admin only.

---

## Queue KPIs

```
GET /api/kpis/queue
```

Provides

- Pending jobs
- Running jobs
- Failed jobs
- Completed jobs
- Queue latency
- Processing rate

Requires authenticated access.

---

# Realtime Operations

Supported transports

## WebSocket

```
WS /api/ws/ops
```

---

## Server-Sent Events

```
GET /api/sse/ops
```

Enabled only when

```
FEATURE_REALTIME_OPS=true
```

Authentication

- Cookie
- JWT

---

## Current Limitation

Realtime updates are **process-local**.

In multi-replica deployments:

- Events are **not** broadcast between API replicas.
- Queue polling via `/api/kpis/queue` remains the authoritative source.

This is an intentional design trade-off to keep the platform lightweight.

---

# Production Readiness Checklist

## Secrets

Use an explicit encryption key.

```
SECRETS_MASTER_KEY
```

Recommended

- Fernet key
- Strong passphrase
- External Secret Manager

Do **not** rely on JWT-derived vault encryption in production.

---

## JWT

```
JWT_SECRET
```

Requirements

- Minimum 32 random characters
- Rotated periodically
- Managed externally

Weak secrets should be rejected when

```
ENV=production

or

ENV=staging
```

---

## Multi-Worker Deployment

Recommended architecture

API replicas

```
ACTIRA_JOB_WORKER=0
```

Dedicated worker

```
ACTIRA_JOB_WORKER=1
```

Payload backend

```
ACTIRA_JOB_PAYLOAD_BACKEND=mongo
```

MongoDB remains the authoritative job state.

---

## Broker Philosophy

Optional

```
job_broker_*
```

is only a wake-up mechanism.

MongoDB remains

- Queue
- Claim
- Lock
- Job state

ACTIRA intentionally does **not** implement:

- Celery
- RabbitMQ job ownership
- Broker-driven scheduling

---

## Metrics Security

Always configure

```
METRICS_TOKEN
```

Never expose

```
/metrics
```

directly on a public ingress without authentication or network controls.

---

## Realtime Operations

Realtime SSE/WebSocket

- Intended for operational visibility
- Not guaranteed to fan out across replicas

For cluster-wide correctness

Use

```
GET /api/kpis/queue
```

---

# Docker Health Check

Recommended Compose configuration

```
GET http://127.0.0.1:8001/api/health
```

Recommended settings

```
start_period: 40s

retries: 5
```

---

# Local Health Scripts

Available

```
scripts/healthcheck.ps1

scripts/healthcheck.sh
```

Deep validation

```
-Deep

or

--deep
```

Checks

```
/api/ready
```

---

# Prometheus Configuration

Example

```yaml
scrape_configs:
  - job_name: actira
    metrics_path: /metrics

    params:
      format: [prometheus]

    authorization:
      type: Bearer
      credentials: "${METRICS_TOKEN}"

    static_configs:
      - targets:
          - actira-backend:8001
```

Alternative

```yaml
headers:
  X-Metrics-Token: "${METRICS_TOKEN}"
```

---

# Recommended Dashboards

## Platform

- Health
- Readiness
- Version
- Build
- Uptime

---

## Queue

- Pending
- Running
- Failed
- Completed
- Processing rate

---

## AI

- Provider latency
- Token usage
- Cost
- Failures
- Retries

---

## MongoDB

- Connections
- Slow queries
- Storage
- Collection growth

---

## Infrastructure

- CPU
- Memory
- Disk
- Network
- Container restarts

---

## Security

- Failed logins
- Lockouts
- JWT failures
- Audit activity

---

# Suggested Alerts

Critical

- Health endpoint unavailable for 2 minutes
- Readiness endpoint failing
- MongoDB unreachable
- Worker unavailable
- Queue stalled
- JWT validation failures above baseline

High

- Job failure rate exceeds threshold
- AI provider unavailable
- Queue latency exceeds SLA
- High API error rate

Medium

- LanceDB disk utilization
- Payload storage growth
- High memory usage
- High CPU utilization
- Backup failure

Thresholds should be tuned using production telemetry rather than fixed defaults.

---

# Non-Goals

ACTIRA intentionally does **not** attempt to provide:

- Multi-tenant SaaS observability
- SIEM connector mesh telemetry
- Distributed agent swarm tracing
- Celery Flower dashboards
- Broker-based job ownership
- Cross-cluster event synchronization

These capabilities are outside the project's architectural goals.

---

# Future Roadmap

Potential enhancements include:

- OpenTelemetry instrumentation
- Distributed tracing
- Grafana Tempo
- OTLP exporters
- Trace correlation
- AI request tracing
- SLO dashboards
- Alert fatigue reduction
- Automated anomaly detection

---

# Operational Best Practices

Always:

- Protect metrics endpoints.
- Monitor health and readiness continuously.
- Use MongoDB as the source of truth for queue state.
- Validate observability after every deployment.
- Keep dashboards version-controlled.
- Review alerts regularly.
- Benchmark before major releases.

Never:

- Expose metrics publicly.
- Depend on in-process SSE/WebSocket for cluster-wide state.
- Treat optional brokers as the authoritative job source.
- Use weak secrets in production.
- Disable readiness probes to mask dependency failures.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [MONITORING.md](MONITORING.md) | **Start here for monitoring strategy & alerting** |
| [HA_VALIDATION.md](HA_VALIDATION.md) | Multi-replica readiness and health probes |
| [CAPACITY_PLANNING.md](CAPACITY_PLANNING.md) | Capacity and growth |
| [SCALING.md](SCALING.md) | Horizontal / vertical scale guidance |
| [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) | Performance optimization |
| [../MULTI_WORKER.md](../MULTI_WORKER.md) | Worker / queue architecture |
| [BACKUP.md](BACKUP.md) | Backup and restore |
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) | DR procedures |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | `/metrics` protection, log hygiene |
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | Platform incident process |
| [README.md](README.md) | Operations pack index |

> **Pack version note:** This file’s version tracks the observability sprint (e.g. 12.x). The broader operations pack version is documented in [README.md](README.md) (e.g. 2.0).

> **Which first?** Use **MONITORING.md** for strategy. Use **this pack** for metrics endpoints, Prometheus, dashboards, and AI/queue KPIs.

---

# Definition of Done

The observability platform is considered production-ready when:

- [ ] Health and readiness endpoints are implemented and tested.
- [ ] Metrics are exposed securely in JSON and Prometheus formats.
- [ ] Metrics authentication is enforced.
- [ ] Queue KPIs are available.
- [ ] Operations status endpoint is functional.
- [ ] Realtime operations are enabled where required.
- [ ] Prometheus scrape configuration is validated.
- [ ] Grafana dashboards are available.
- [ ] Critical alerts are configured and tested.
- [ ] Production secrets meet security requirements.
- [ ] Multi-worker deployments follow the documented architecture.
- [ ] Documentation accurately reflects the platform's intended observability scope and non-goals.