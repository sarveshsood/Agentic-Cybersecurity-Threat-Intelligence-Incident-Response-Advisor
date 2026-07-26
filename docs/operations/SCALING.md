# Scaling Guide

## Vertical

Larger API CPU/RAM for sbert embeddings and concurrent uploads.

## Horizontal

1. Stateless API replicas behind LB (`ACTIRA_JOB_WORKER=0` on API pods)
2. Dedicated single job-worker Deployment (`ACTIRA_JOB_WORKER=1`)
3. Mongo job claim for workers (`docs/MULTI_WORKER.md`)
4. Shared job payloads: `ACTIRA_JOB_PAYLOAD_BACKEND=mongo`
5. Shared or PVC LanceDB as appropriate
6. Session cookies: sticky not required if JWT self-contained

**Runbook:** [HA_VALIDATION.md](HA_VALIDATION.md)  
**Helm prod profile:** `deployments/helm/actira/values-prod.yaml`  
**Load envelope:** [LOAD_TEST_10_100.md](../../benchmarks/reports/LOAD_TEST_10_100.md)

## What not to scale first

Don't add microservices until LLM queue and Mongo are healthy.
