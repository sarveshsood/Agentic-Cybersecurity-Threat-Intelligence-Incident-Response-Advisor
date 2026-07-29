# Capacity Planning Guide

Version: 2.0

This document defines the capacity planning, scaling strategy, performance targets, and infrastructure sizing recommendations for the ACTIRA Enterprise SOC Platform.

---

# Objectives

Capacity planning ensures the platform can:

- Support expected analyst workloads
- Scale predictably
- Meet performance SLAs
- Optimize infrastructure cost
- Maintain availability
- Support AI-intensive workflows
- Provide guidance for future growth

---

# Planning Assumptions

Current recommendations are based on a **single-tenant deployment**.

Capacity planning should be revisited after:

- Major architectural changes
- New AI providers
- Significant UI features
- Large ingestion pipeline changes
- Multi-tenant support
- Production benchmarking

---

# Deployment Tiers

| Deployment | Concurrent Analysts | API Replicas | Background Workers | MongoDB | Notes |
|------------|---------------------|--------------|--------------------|----------|-------|
| Developer | 1 | 1 | 0 | Local Docker | Local development |
| Demo | 1–5 | 1 | 0 | Local Docker | Sales / Demo |
| Pilot | 1–10 | 1 | Optional | Small | Default deployment |
| Small Enterprise | 10–50 | 2 | 1 | Medium Managed | HA recommended |
| Medium Enterprise | 50–100 | 2–4 | 2–4 | Managed Cluster | AI becomes primary bottleneck |
| Large Enterprise | 100–250 | 4–8 | 4–8 | Dedicated Cluster | Requires load balancing |
| Enterprise Scale | 250–500 | 8+ | Dedicated Workers | Dedicated Cluster | Extensive caching required |
| Large Enterprise+ | 500+ | Not yet validated | Distributed | Enterprise MongoDB | Formal performance testing required |

---

# Resource Sizing

## API Servers

| Scale | CPU | Memory |
|--------|-----|---------|
| Development | 2 vCPU | 4 GB |
| Pilot | 2–4 vCPU | 8 GB |
| Medium | 4–8 vCPU | 16 GB |
| Enterprise | 8–16 vCPU | 32 GB+ |

---

## MongoDB

| Scale | Recommendation |
|---------|----------------|
| Development | Docker MongoDB |
| Pilot | Small Managed Instance |
| Medium | Replica Set |
| Enterprise | Dedicated Cluster |
| Large Enterprise | Sharded Cluster (if required) |

Indexes should be reviewed periodically as data volume grows.

---

## Background Workers

Recommended for:

- AI processing
- Threat enrichment
- Report generation
- Knowledge indexing
- Vector indexing
- Bulk imports

Scale workers independently from API servers.

---

# Expected Workload

Typical analyst actions include:

- Incident triage
- Timeline navigation
- AI investigation
- Knowledge Base search
- Analytics dashboards
- Threat intelligence enrichment
- Report generation
- Review queue processing

AI operations should be treated as high-latency workloads.

---

# Dominant Cost Drivers

Primary infrastructure costs:

1. LLM token usage (largest variable cost)
2. Threat Intelligence API requests
3. MongoDB storage
4. Vector index storage
5. Compute for AI inference
6. Network egress (cloud deployments)

---

# Optimization Opportunities

## LLM

Reduce costs by:

- Prompt optimization
- Response caching
- Retrieval optimization
- Model routing
- Smaller models where appropriate
- Human review for expensive workflows

---

## Threat Intelligence

Reduce costs by:

- Provider caching
- Request deduplication
- Batch enrichment
- Configurable TTLs
- Background enrichment

---

## MongoDB

Optimize:

- Indexes
- TTL collections
- Archiving
- Compression
- Pagination
- Query plans

Avoid full collection scans.

---

## Vector Database

Optimize by:

- Incremental indexing
- Scheduled rebuilds
- Embedding deduplication
- Chunk optimization
- Metadata filtering

---

# Horizontal Scaling

Scale independently:

- API replicas
- Background workers
- MongoDB
- AI providers
- Search services

Preferred architecture

```
                    Load Balancer
                          │
          ┌───────────────┼───────────────┐
          │               │               │
      API Replica     API Replica     API Replica
          │               │               │
          └───────────────┼───────────────┘
                          │
                Shared Background Workers
                          │
          ┌───────────────┼────────────────┐
          │               │                │
      MongoDB        LanceDB         AI Providers
```

---

# Performance Targets

| Operation | Target |
|------------|---------|
| Login | < 2 seconds |
| Dashboard Load | < 3 seconds |
| Incident Search | < 2 seconds |
| Analytics Dashboard | < 5 seconds |
| Review Queue | < 2 seconds |
| Knowledge Search | < 3 seconds |
| AI Investigation | < 15 seconds |
| Playbook Generation | < 20 seconds |
| Health Endpoint | < 200 ms |

Targets should be monitored continuously.

---

# Concurrency Targets

| Component | Recommendation |
|------------|----------------|
| API Requests | Async processing |
| Mongo Connections | Connection pooling |
| AI Calls | Parallel where safe |
| Background Jobs | Queue-based |
| Search | Cached where practical |

Avoid blocking API threads with long-running tasks.

---

# Caching Strategy

Recommended cache layers:

- Threat Intelligence responses
- Knowledge Base lookups
- Analytics aggregates
- Platform settings
- User preferences
- Feature flags
- AI prompt templates

Do **not** cache sensitive per-user authorization decisions.

---

# Storage Planning

Primary storage consumers:

- Incidents
- Audit logs
- Knowledge Base
- AI history (if retained)
- Review Queue
- Analytics
- Uploaded evidence

Implement retention and archival policies to control growth.

---

# Monitoring Metrics

Monitor continuously:

## Infrastructure

- CPU utilization
- Memory utilization
- Disk usage
- Network throughput

---

## Application

- API latency
- Request rate
- Error rate
- Queue depth
- Active sessions
- Background job duration

---

## MongoDB

- Query latency
- Collection growth
- Index usage
- Cache hit ratio
- Connection pool utilization

---

## AI

- Token consumption
- Prompt size
- Response latency
- Provider failures
- Retry count
- Cost per request

---

# Load Testing

Before increasing supported capacity, execute load tests covering:

- Concurrent log ingestion
- Dashboard usage
- Search
- Analytics
- AI investigation
- Review Queue
- Authentication
- Large incident datasets

Benchmark results should be documented under:

```
benchmarks/
```

Include:

- Test configuration
- Dataset size
- Concurrent users
- Infrastructure
- Response times
- Resource utilization
- Bottlenecks
- Recommendations

---

# Scaling Triggers

Consider scaling when:

- CPU consistently exceeds 70%
- Memory consistently exceeds 75%
- Mongo query latency increases noticeably
- AI response times exceed SLA
- Queue depth grows continuously
- Dashboard load exceeds target
- Error rate increases

Scaling decisions should be based on sustained trends rather than short-lived spikes.

---

# Future Capacity Roadmap

Potential enhancements:

- Multi-tenant architecture
- Redis caching
- Distributed job queue
- CDN for static assets
- Read replicas
- Autoscaling
- Multi-region deployment
- AI request batching
- Dedicated vector search service

---

# Operational Best Practices

Always:

- Benchmark before major releases.
- Monitor infrastructure continuously.
- Review indexes regularly.
- Cache expensive operations.
- Archive historical data.
- Separate API and worker scaling.
- Validate scaling changes with load testing.

Never:

- Assume linear scaling without testing.
- Increase replicas without monitoring database capacity.
- Ignore AI provider limits.
- Skip benchmarking after major architectural changes.

---

# Reference

Performance methodology and benchmark reports are maintained under:

```
benchmarks/
```

Each benchmark should include:

- Environment details
- Hardware configuration
- Software versions
- Dataset characteristics
- Test scenarios
- Results
- Bottleneck analysis
- Improvement recommendations

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [SCALING.md](SCALING.md) | How to scale once capacity limits are hit |
| [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) | Optimize before buying capacity |
| [MONITORING.md](MONITORING.md) | Capacity signals and trends |
| [OBSERVABILITY_PACK.md](OBSERVABILITY_PACK.md) | Queue / AI / API metrics |
| [HA_VALIDATION.md](HA_VALIDATION.md) | Multi-replica validation at target size |
| [BACKUP.md](BACKUP.md) | Backup sizing and retention at scale |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Security controls that must hold at scale |
| [../../benchmarks/reports/LOAD_TEST_10_100.md](../../benchmarks/reports/LOAD_TEST_10_100.md) | Load-test baselines |
| [../MULTI_WORKER.md](../MULTI_WORKER.md) | Worker model impact on capacity |
| [README.md](README.md) | Operations pack index |

---

# Definition of Done

Capacity planning is considered complete when:

- [ ] Target deployment tier is identified.
- [ ] Infrastructure sizing is documented.
- [ ] Performance targets are defined.
- [ ] Monitoring metrics are configured.
- [ ] Backup and recovery align with expected scale.
- [ ] Load testing has been completed for the target workload.
- [ ] Benchmark results are documented.
- [ ] Scaling triggers are defined.
- [ ] Cost drivers have been reviewed.
- [ ] Future scaling considerations are documented.