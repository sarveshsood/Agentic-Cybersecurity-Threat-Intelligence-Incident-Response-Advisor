# High Availability (HA) Validation Runbook

Version: 2.0

This runbook validates the ACTIRA Enterprise SOC Platform in a multi-replica deployment to ensure the application behaves correctly under horizontal scaling, rolling updates, and high availability (HA) conditions.

This document complements:

- `MULTI_WORKER.md`
- `SCALING.md`
- `CAPACITY_PLANNING.md`
- `DISASTER_RECOVERY.md`

---

# Purpose

The objectives of this validation are to verify that:

- Multiple API replicas can safely share a common MongoDB instance.
- Background processing executes exactly once.
- Authentication and security controls remain consistent across replicas.
- Job payloads are available from every API instance.
- Rolling deployments complete without service interruption.
- Health and readiness probes behave correctly.
- The platform is production-ready for multi-node deployments.

---

# Target Architecture

```
                    Load Balancer / Ingress
                             │
          ┌──────────────────┼──────────────────┐
          │                  │                  │
      API Replica        API Replica        API Replica
      Worker = 0         Worker = 0         Worker = 0
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                      Shared MongoDB
                             │
                 Job Worker (Worker = 1)
                             │
                   Optional Shared LanceDB
```

---

# Recommended Deployment

| Component | Replicas | Configuration | Notes |
|-----------|----------|---------------|-------|
| API | 2+ | `ACTIRA_JOB_WORKER=0` | Stateless HTTP service |
| Background Worker | 1 | `ACTIRA_JOB_WORKER=1` | Sole queue consumer |
| MongoDB | 1 or Atlas Cluster | Shared | System of record |
| LanceDB | Shared (optional) | Shared storage | Vector search |
| Frontend | 1+ | Static deployment | Behind Load Balancer |

Only one worker should actively consume jobs unless queue claiming has been proven safe for multiple workers.

---

# Deployment Requirements

Before validation verify:

- [ ] Production or staging environment
- [ ] `ENV=production` (or staging)
- [ ] `SEED_DEMO_USERS=false`
- [ ] Strong `JWT_SECRET` (**policy ≥32** random chars; runtime refuses weak/default or &lt;16 outside lab)
- [ ] Shared MongoDB connection
- [ ] Shared database name
- [ ] `ACTIRA_JOB_PAYLOAD_BACKEND=mongo`
- [ ] API replicas have `ACTIRA_JOB_WORKER=0`
- [ ] Exactly one worker has `ACTIRA_JOB_WORKER=1`
- [ ] Ingress idle timeout ≥ 60 seconds
- [ ] Shared object storage (if applicable)
- [ ] Frontend configured for public API endpoint

---

# Helm Configuration

Typical production deployment:

```bash
helm upgrade --install actira ./deployments/helm/actira \
    -f ./deployments/helm/actira/values-prod.yaml \
    --set existingSecret=actira-secrets \
    --set image.repository=YOUR_REGISTRY/actira-backend \
    --set image.tag=1.1.0
```

Recommended values:

```
replicaCount = 2+

jobWorker.enabled = true

API:
ACTIRA_JOB_WORKER=0

Worker:
ACTIRA_JOB_WORKER=1
```

---

# Validation Procedure

## Step 1 – Verify Deployment

Confirm all deployments are healthy.

```bash
kubectl get deploy \
    -l app.kubernetes.io/name=actira
```

Verify pods:

```bash
kubectl get pods \
    -l app.kubernetes.io/name=actira \
    -o wide
```

Expected:

- Multiple API pods
- One worker pod
- All Ready
- No CrashLoopBackOff

---

## Step 2 – Verify Health Endpoints

Check every API pod.

```bash
for p in $(kubectl get pods \
-l app.kubernetes.io/component=api \
-o name); do

kubectl exec ${p#pod/} \
-- wget -qO- \
http://127.0.0.1:8001/ready || exit 1

done
```

Expected:

```
HTTP 200
```

Readiness should fail if MongoDB is unavailable.

---

## Step 3 – Authentication Consistency

Authenticate through the Service endpoint.

Verify:

- Login succeeds
- Session works
- JWT accepted across replicas
- Refresh tokens remain valid
- RBAC identical

Negative test:

Generate repeated failed logins.

Expected:

- Shared rate limiting
- Shared lockout
- Consistent HTTP responses
- No pod-specific behavior

---

## Step 4 – Session Affinity

If sticky sessions are disabled:

Verify:

- Login on Replica A
- Subsequent requests handled by Replica B
- Authentication remains valid

Expected:

Stateless authentication.

---

## Step 5 – Job Execution

Upload one log.

Examples:

```
POST /api/logs/upload
```

or

UI upload.

Expected:

- Single job created
- Single pipeline execution
- Job completes successfully
- No duplicate incidents

---

## Step 6 – Verify Worker Ownership

Worker logs:

```bash
kubectl logs \
-l app.kubernetes.io/component=worker \
--tail=100
```

Expected:

```
[job ...]
batch pipeline
```

API logs:

```bash
kubectl logs \
-l app.kubernetes.io/component=api \
--tail=50 | grep pipeline
```

Expected:

No pipeline execution.

API replicas should never process queue jobs.

---

## Step 7 – Database Consistency

Verify:

- One job record
- One incident
- One audit entry
- No duplicate queue records

---

## Step 8 – Rolling Update

Restart deployment.

```bash
kubectl rollout restart deploy/actira-api
```

Monitor rollout.

```bash
kubectl rollout status deploy/actira-api
```

Expected:

- No outage
- Minimal request interruption
- No sustained 5xx responses
- Existing sessions continue functioning

---

## Step 9 – Load Validation

Optional benchmark.

Light profile

```bash
python benchmarks/run_benchmarks.py \
    --profile light \
    --base-url https://actira.example.com
```

Medium profile

```bash
python benchmarks/run_benchmarks.py \
    --profile medium \
    --base-url https://actira.example.com
```

Store reports:

```
benchmarks/reports/
```

Update (when present):

```
benchmarks/reports/LOAD_TEST_10_100.md
```

---

## Step 10 – Failover Validation

Restart one API pod.

Expected:

- Requests continue
- No authentication failures
- No duplicated jobs

Restart worker.

Expected:

- Queue resumes
- No duplicate processing
- No orphaned jobs

---

## Step 11 – MongoDB Failure Validation (Staging Only)

Temporarily stop MongoDB.

Expected:

```
/ready
```

returns failure.

API should:

- Stop accepting traffic
- Return readiness failure
- Recover automatically after MongoDB restoration

---

## Step 12 – Optional LanceDB Validation

If using shared LanceDB:

Verify:

- Semantic search
- KB search
- AI retrieval
- Embeddings

If LanceDB unavailable:

Verify rebuild procedure.

---

# Security Validation

Verify:

- Shared JWT validation
- Shared lockouts
- Shared rate limiting
- RBAC consistency
- Audit logging consistency

---

# Observability Validation

Verify:

- Structured logs
- Metrics
- Health endpoints
- Readiness
- Liveness
- Request tracing (if enabled)

---

# Performance Validation

Verify:

- API latency
- Upload latency
- Job completion time
- Dashboard responsiveness
- Search latency

Compare with performance targets.

---

# Pass Criteria

| Validation | Expected |
|------------|----------|
| API replicas Ready | Yes |
| Worker Ready | Yes |
| Mongo reachable | Yes |
| Authentication shared | Yes |
| JWT valid across replicas | Yes |
| Upload processed once | Yes |
| No duplicate incidents | Yes |
| Pipeline runs only on worker | Yes |
| Rolling deployment succeeds | Yes |
| Readiness fails when Mongo unavailable | Yes |
| Light benchmark <1% 5xx | Yes |
| Medium benchmark within SLA | Yes |

---

# Failure Indicators

Validation fails if:

- Duplicate job execution
- Duplicate incidents
- Authentication differs across replicas
- Worker runs on API pod
- Readiness remains healthy after Mongo failure
- Rolling deployment causes extended outage
- Upload processed multiple times
- Queue corruption
- Persistent HTTP 5xx responses

---

# Rollback

If validation fails:

1. Scale API to one replica.
2. Enable:

```
ACTIRA_JOB_WORKER=1
```

on the remaining instance.

3. Disable extra worker deployments.
4. Restore previous Helm release.
5. Verify health.
6. Re-run smoke tests.

Reference:

```
ROLLBACK.md
```

---

# Automation

The following should execute automatically within CI/CD where practical:

- Health validation
- Readiness validation
- Authentication validation
- Helm lint
- Kubernetes manifest validation
- Worker configuration verification

---

# Related Tests

Offline validation:

```
backend/tests/test_ha_multi_replica.py
```

Recommended coverage:

- Worker role matrix
- Queue ownership
- Payload backend
- Authentication consistency
- Helm template validation
- Deployment configuration

---

# Operational Best Practices

Always:

- Deploy multiple API replicas.
- Maintain exactly one active worker unless multi-worker coordination has been validated.
- Use shared MongoDB.
- Use readiness probes.
- Test rolling updates before production.
- Benchmark every major release.
- Monitor queue ownership and job execution.

Never:

- Allow API replicas to consume queue jobs.
- Deploy without readiness probes.
- Use local payload storage in HA deployments.
- Skip rollback validation after configuration changes.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [SCALING.md](SCALING.md) | Horizontal scale design |
| [../MULTI_WORKER.md](../MULTI_WORKER.md) | Single active worker / queue ownership |
| [MONITORING.md](MONITORING.md) | Health probes and alerts |
| [OBSERVABILITY_PACK.md](OBSERVABILITY_PACK.md) | Metrics during HA tests |
| [ROLLBACK.md](ROLLBACK.md) | Rollback after failed rolling update |
| [CAPACITY_PLANNING.md](CAPACITY_PLANNING.md) | Replica sizing |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Auth consistency, metrics protection |
| [PERFORMANCE_TUNING.md](PERFORMANCE_TUNING.md) | Performance under multi-replica load |
| [../../benchmarks/reports/LOAD_TEST_10_100.md](../../benchmarks/reports/LOAD_TEST_10_100.md) | Load-test baselines |
| [README.md](README.md) | Operations pack index |

---

# Definition of Done

High Availability validation is complete when:

- [ ] Multiple API replicas are healthy.
- [ ] Exactly one worker processes background jobs.
- [ ] MongoDB is shared across all replicas.
- [ ] Authentication is consistent across replicas.
- [ ] Queue ownership is correct.
- [ ] No duplicate job execution occurs.
- [ ] Rolling updates complete without significant downtime.
- [ ] Readiness probes respond correctly.
- [ ] Benchmark results meet performance targets.
- [ ] Rollback procedure has been validated.
- [ ] CI tests cover HA deployment scenarios.
- [ ] The deployment is approved for production-scale operation.