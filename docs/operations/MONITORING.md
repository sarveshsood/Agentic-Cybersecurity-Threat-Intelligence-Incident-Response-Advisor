# Monitoring & Observability Strategy

Version: 2.0

This document defines the monitoring, observability, alerting, and operational visibility strategy for the ACTIRA Enterprise SOC Platform.

The objective is to provide comprehensive insight into platform health, performance, security, AI usage, and operational stability across all environments.

---

# Objectives

The monitoring strategy should enable teams to:

- Detect failures quickly
- Measure system health
- Identify performance bottlenecks
- Track AI usage and cost
- Monitor infrastructure capacity
- Detect security anomalies
- Support troubleshooting and root cause analysis
- Improve reliability through proactive alerting

Monitoring should answer four key questions:

1. **Is the platform healthy?**
2. **Is it performing within expectations?**
3. **Are users successfully completing workflows?**
4. **Can problems be diagnosed quickly?**

---

# Observability Pillars

ACTIRA monitoring is built on four pillars:

- **Metrics** – Quantitative measurements (latency, throughput, resource usage)
- **Logs** – Structured application and infrastructure logs
- **Traces** – End-to-end request visibility (future OpenTelemetry roadmap)
- **Health Checks** – Liveness and readiness endpoints

---

# Monitoring Signals

| Signal | Source | Purpose |
|----------|--------|---------|
| Liveness | `GET /health` or `/api/health` | Verify the application process is running |
| Readiness | `GET /ready` or `/api/ready` | Verify dependencies are available |
| Metrics | `GET /metrics` (admin or token-protected) | Export Prometheus metrics |
| Logs | Structured `actira` logger | Application diagnostics and auditing |
| Job Queue | `log_jobs` collection | Queue depth, status, failures |
| AI Usage | `llm_usage` | Token consumption, latency, provider health |
| Audit Logs | `audit_log` | Security and compliance monitoring |
| MongoDB | Driver metrics / database monitoring | Database health and performance |

---

# Health Endpoints

## Liveness

```
GET /health
GET /api/health
```

Purpose:

- Process alive
- Container healthy
- Kubernetes liveness probe

---

## Readiness

```
GET /ready
GET /api/ready
```

Purpose:

- MongoDB reachable
- Required dependencies available
- Ready to receive traffic

Readiness should fail if critical dependencies are unavailable.

---

## Metrics

```
GET /metrics
```

Protected by:

- Admin role
- API token
- Internal network (recommended)

Metrics should be exposed in Prometheus format.

---

# Infrastructure Monitoring

Monitor:

- CPU utilization
- Memory utilization
- Disk usage
- Network throughput
- Container restarts
- Pod availability
- Load balancer health
- TLS certificate expiration

---

# Application Monitoring

Track:

- API request rate
- API latency (P50, P95, P99)
- Error rate
- HTTP status distribution
- Active users
- Authentication success/failure
- Request duration
- Background job throughput

---

# Database Monitoring

Monitor MongoDB for:

- Availability
- Query latency
- Slow queries
- Connection pool usage
- Index utilization
- Collection growth
- Replication lag (if applicable)
- Storage utilization

Alert on sustained degradation rather than isolated spikes.

---

# Background Job Monitoring

Track:

- Queue depth
- Running jobs
- Completed jobs
- Failed jobs
- Retry count
- Processing duration
- Stale jobs
- Orphaned jobs

Visualize the distribution of `log_jobs` states over time.

---

# AI & LLM Monitoring

Monitor:

- Provider availability
- Token consumption
- Cost by provider
- Request latency
- Error rate
- Timeout rate
- Retry count
- Budget utilization
- Model usage distribution

Where applicable, compare token usage against configured budget thresholds (`llm_usage` and related budget settings).

---

# Knowledge Base & Vector Search

Track:

- Index size
- Embedding generation time
- Search latency
- Retrieval accuracy indicators
- Re-index duration
- Storage growth

---

# Security Monitoring

Monitor:

- Failed logins
- Account lockouts
- Privilege escalation attempts
- API authentication failures
- JWT validation failures
- Suspicious request rates
- Secret rotation events
- Audit log volume

Security events should be retained according to organizational policy.

---

# Suggested Alerts (Pilot)

| Alert | Condition | Priority |
|--------|-----------|----------|
| Health Check Failure | `/health` fails for 2 minutes | Critical |
| Readiness Failure | `/ready` fails | Critical |
| MongoDB Unreachable | Connection or ping failure | Critical |
| API Error Rate | Sustained increase above defined threshold | High |
| Job Failure Rate | Failed jobs exceed configured threshold | High |
| Worker Queue Growth | Queue depth grows continuously | High |
| LLM Provider Failure | Consecutive provider failures | High |
| Disk Usage | LanceDB or payload storage exceeds threshold | Medium |
| Memory Usage | Sustained high memory utilization | Medium |
| CPU Usage | Sustained high CPU utilization | Medium |
| Certificate Expiry | Within 30 days | Medium |
| Backup Failure | Scheduled backup does not complete | High |

Thresholds should be tuned using production baseline data rather than fixed assumptions.

---

# Dashboards

Recommended dashboards include:

## Platform Overview

- Overall health
- Active users
- API latency
- Error rate
- Queue depth
- AI provider status

---

## Infrastructure

- CPU
- Memory
- Disk
- Network
- Pod health
- Restart count

---

## API

- Requests per second
- Response time
- Status codes
- Slow endpoints

---

## MongoDB

- Connections
- Query latency
- Slow operations
- Collection growth
- Index efficiency

---

## AI Usage

- Provider usage
- Token consumption
- Estimated cost
- Response latency
- Failure rate

---

## Queue Processing

- Queue depth
- Running jobs
- Failed jobs
- Average processing time
- Retry trends

---

## Security

- Authentication failures
- Lockouts
- Audit activity
- Privileged operations

---

# Logging Strategy

Use structured JSON logging.

Include:

- Timestamp
- Request ID
- User ID (where appropriate)
- Correlation ID
- Component
- Log level
- Message
- Exception details
- Job ID (if applicable)

Avoid logging:

- Passwords
- Secrets
- API keys
- Access tokens
- Sensitive customer data

---

# Tracing (Roadmap)

Future enhancements:

- OpenTelemetry instrumentation
- Distributed tracing
- Cross-service correlation
- AI request tracing
- Database query tracing

Tracing should complement—not replace—metrics and logs.

---

# Monitoring Stack

Recommended tooling:

| Component | Recommendation |
|-----------|----------------|
| Metrics | Prometheus |
| Dashboards | Grafana |
| Logs | Structured `actira` logger (forwarded to a centralized log platform where available) |
| Health Checks | Kubernetes / Load Balancer probes |
| Tracing | OpenTelemetry (roadmap) |
| Cloud APM | Optional future integration |

Repository resources:

```
monitoring/
```

should contain dashboards, alert definitions, and scrape configurations.

---

# Capacity & Trend Analysis

Review regularly:

- API growth
- Token usage
- Database growth
- Queue growth
- Storage utilization
- User concurrency
- Cost trends

Use these metrics to inform future capacity planning.

---

# Operational Best Practices

Always:

- Monitor health continuously.
- Alert on sustained failures.
- Review dashboards after each release.
- Validate alerts during staging.
- Protect the `/metrics` endpoint.
- Correlate metrics with logs during incident response.
- Periodically review alert thresholds as usage evolves.

Never:

- Expose metrics publicly without authentication or network controls.
- Log secrets or sensitive customer data.
- Ignore persistent warning-level alerts.
- Disable health or readiness probes in production.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [OBSERVABILITY_PACK.md](OBSERVABILITY_PACK.md) | **Start here for metrics/health/AI/queue pack** (Sprint observability detail) |
| [CAPACITY_PLANNING.md](CAPACITY_PLANNING.md) | Capacity signals and growth planning |
| [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) | Performance baselines and tuning |
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) | Recovery when monitoring detects site failure |
| [BACKUP.md](BACKUP.md) | Backup health and restore validation |
| [HA_VALIDATION.md](HA_VALIDATION.md) | Multi-replica health expectations |
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | Platform incident response |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Metrics auth (`METRICS_TOKEN`), log redaction |
| [../dx/DEBUGGING.md](../dx/DEBUGGING.md) | Engineering troubleshooting |
| [../OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md) | Daily operational checks |

> **Which first?** Use **MONITORING.md** for strategy and alerting design. Use **OBSERVABILITY_PACK.md** for endpoint/metric/dashboard implementation detail.

---

# Definition of Done

The monitoring strategy is considered operational when:

- [ ] Health and readiness endpoints are implemented.
- [ ] Prometheus metrics are exposed and protected.
- [ ] Structured logging is enabled.
- [ ] Core dashboards are available.
- [ ] Critical alerts are configured and tested.
- [ ] MongoDB health is monitored.
- [ ] Job queue metrics are monitored.
- [ ] AI usage and budget metrics are monitored.
- [ ] Capacity trends are reviewed regularly.
- [ ] Monitoring documentation is current.
- [ ] The platform provides sufficient visibility to detect, diagnose, and recover from operational issues.