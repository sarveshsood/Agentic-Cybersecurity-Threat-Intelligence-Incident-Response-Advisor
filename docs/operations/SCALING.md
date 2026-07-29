# Scaling Guide

Version: 2.0

This document defines the recommended scaling strategy for the **ACTIRA Enterprise SOC Platform**, covering vertical scaling, horizontal scaling, worker architecture, storage considerations, and production deployment best practices.

> **Architecture Principle**
>
> ACTIRA is a **single-tenant Enterprise AI Incident Response Advisor**, not a distributed microservices platform or multi-tenant SaaS. Scaling focuses on maximizing reliability, simplicity, and operational efficiency before increasing architectural complexity.

---

# Objectives

The scaling strategy aims to:

- Support increasing analyst workloads.
- Improve API responsiveness under load.
- Increase incident processing throughput.
- Maintain predictable latency.
- Preserve data consistency.
- Enable high availability.
- Minimize operational complexity.
- Scale incrementally based on measured demand.

---

# Scaling Philosophy

ACTIRA follows the principle:

> **Scale up before scaling out, and optimize before decomposing.**

Scaling priorities:

1. Optimize application performance.
2. Tune MongoDB.
3. Improve AI and queue efficiency.
4. Scale API replicas.
5. Scale infrastructure.
6. Consider architectural decomposition only when justified by sustained operational data.

---

# Scaling Model

```
                 Load Balancer / Ingress
                          │
         ┌────────────────┼────────────────┐
         │                │                │
      API Pod         API Pod         API Pod
  Worker = 0      Worker = 0      Worker = 0
         │                │                │
         └────────────────┼────────────────┘
                          │
                    Shared MongoDB
                          │
              Dedicated Job Worker
            ACTIRA_JOB_WORKER = 1
                          │
             Shared Payload Storage (Mongo)
                          │
         Shared / Persistent LanceDB Storage
```

---

# Vertical Scaling

Vertical scaling is the preferred first step for many deployments.

Increase:

- CPU
- Memory
- Container resource limits

Primary workloads that benefit include:

- Sentence-BERT (SBERT) embeddings
- AI inference orchestration
- Concurrent uploads
- Vector search
- Large incident analysis
- Dashboard rendering

Recommended when:

- CPU utilization is consistently high.
- Memory pressure causes swapping or OOM events.
- Queue latency remains low but API latency increases.

---

# Horizontal Scaling

Horizontal scaling improves availability and request throughput.

## API Layer

Deploy multiple stateless API replicas behind a load balancer.

Configuration:

```
ACTIRA_JOB_WORKER=0
```

Responsibilities:

- Authentication
- Dashboard
- REST APIs
- WebSocket/SSE (process-local)
- Knowledge Base APIs
- AI orchestration
- File uploads

API replicas should **not** process background jobs.

---

## Background Worker

Deploy a dedicated worker service.

Configuration:

```
ACTIRA_JOB_WORKER=1
```

Responsibilities:

- Queue consumption
- Log processing
- AI pipeline execution
- Incident generation
- Background enrichment

The worker should be independently scalable only after validating multi-worker coordination.

---

# Job Ownership

MongoDB remains the authoritative job queue.

Worker responsibilities include:

- Atomic job claims
- Job locking
- Status transitions
- Retry management

Reference:

```
docs/MULTI_WORKER.md
```

Optional broker components may wake workers but must not become the source of truth for job ownership.

---

# Shared Job Payloads

Recommended configuration:

```
ACTIRA_JOB_PAYLOAD_BACKEND=mongo
```

Benefits:

- Payload accessibility from any API replica.
- Simplified failover.
- Stateless application servers.
- Consistent processing across deployments.

Avoid local filesystem payload storage in multi-replica environments.

---

# LanceDB Scaling

Supported deployment models:

## Shared Persistent Volume

Recommended for:

- Single Kubernetes cluster
- Small to medium deployments

Benefits:

- Simple management
- Consistent index availability

---

## Dedicated Shared Storage

Recommended for larger deployments where supported.

Requirements:

- Consistent embedding dimensions
- Scheduled off-peak re-indexing
- Regular integrity validation

---

# Session Management

Authentication uses self-contained JWTs.

Benefits:

- Stateless authentication
- No server-side session replication
- No sticky sessions required

Sticky sessions may be used for operational convenience but are not required for authentication correctness.

---

# Infrastructure Scaling

Scale independently based on observed bottlenecks:

| Component | Scale Trigger | Typical Action |
|-----------|---------------|----------------|
| API | High request rate or API latency | Increase replicas or CPU/RAM |
| Worker | Sustained queue growth | Increase worker capacity after validating queue coordination |
| MongoDB | Slow queries, storage growth, high connection counts | Optimize indexes, scale database resources, or move to a managed cluster |
| LanceDB | Search latency or index growth | Expand storage, optimize indexing, or migrate to shared storage |
| AI Providers | Increased token demand or latency | Adjust model selection, caching, or provider configuration |

Use monitoring and benchmarks to determine scaling needs rather than fixed thresholds.

---

# High Availability

For production deployments:

- Deploy at least two API replicas.
- Use a dedicated worker deployment.
- Configure readiness and liveness probes.
- Use shared MongoDB.
- Store payloads in MongoDB.
- Use persistent storage for LanceDB when required.

Validate every HA deployment using:

```
HA_VALIDATION.md
```

---

# Helm Production Profile

Reference production configuration:

```
deployments/helm/actira/values-prod.yaml
```

Ensure:

- Appropriate replica counts
- Resource requests and limits
- Worker separation
- Secure secret management
- Health probes
- Autoscaling (if enabled)

---

# Performance Envelope

Use benchmark reports to validate scaling decisions.

Reference:

```
benchmarks/reports/LOAD_TEST_10_100.md
```

Benchmark profiles:

```bash
python benchmarks/run_benchmarks.py --profile smoke

python benchmarks/run_benchmarks.py --profile light

python benchmarks/run_benchmarks.py --profile medium
```

Compare results before and after scaling changes to verify improvement.

---

# Scaling Decision Framework

Consider scaling when:

- API latency increases under normal load.
- Queue depth grows continuously.
- Worker processing cannot keep pace with uploads.
- MongoDB query performance degrades.
- Resource utilization remains consistently high.
- User experience is impacted.

Prefer addressing software bottlenecks before adding infrastructure.

---

# What **Not** to Scale First

Avoid introducing additional architectural complexity prematurely.

Do **not**:

- Split the application into microservices before identifying clear operational bottlenecks.
- Introduce distributed job brokers as the authoritative queue.
- Add multiple background workers without validated coordination.
- Scale infrastructure without reviewing application performance and database health.

Focus first on:

- LLM queue efficiency
- MongoDB performance
- Query optimization
- Caching
- Resource tuning
- Background processing efficiency

Only consider architectural decomposition when sustained measurements demonstrate that the existing design is no longer sufficient.

---

# Operational Best Practices

Always:

- Benchmark before and after scaling.
- Keep API services stateless.
- Separate API and worker responsibilities.
- Use MongoDB as the source of truth for queue state.
- Monitor queue depth, latency, and resource utilization.
- Validate HA deployments in staging before production.

Never:

- Allow API replicas to consume background jobs.
- Store shared payloads on local disks in multi-replica deployments.
- Assume sticky sessions are required for JWT-based authentication.
- Introduce microservices solely to address performance concerns without evidence.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [../MULTI_WORKER.md](../MULTI_WORKER.md) | Worker / queue model |
| [HA_VALIDATION.md](HA_VALIDATION.md) | Multi-replica validation |
| [CAPACITY_PLANNING.md](CAPACITY_PLANNING.md) | Sizing before scale-out |
| [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) | Optimize before scale |
| [MONITORING.md](MONITORING.md) | Scale triggers from metrics |
| [OBSERVABILITY_PACK.md](OBSERVABILITY_PACK.md) | Queue / API / AI metrics |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Network and secrets at scale |
| [../../benchmarks/reports/LOAD_TEST_10_100.md](../../benchmarks/reports/LOAD_TEST_10_100.md) | Load-test baselines |
| [../../deployments/helm/actira/values-prod.yaml](../../deployments/helm/actira/values-prod.yaml) | Production Helm values (if present) |
| [README.md](README.md) | Operations pack index |

---

# Definition of Done

The scaling strategy is considered production-ready when:

- [ ] Vertical scaling guidance is documented and validated.
- [ ] Stateless API replicas are deployed behind a load balancer.
- [ ] Background workers are isolated from API replicas.
- [ ] MongoDB is the authoritative job queue.
- [ ] Shared job payload storage is configured.
- [ ] LanceDB storage strategy is documented.
- [ ] JWT authentication functions correctly without sticky sessions.
- [ ] HA validation has been successfully completed.
- [ ] Benchmark results meet target performance.
- [ ] Scaling decisions are driven by monitoring and measured operational data rather than assumptions.