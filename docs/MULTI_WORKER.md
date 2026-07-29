# Multi-worker readiness (A-D3 / A-A3)

ACTIRA’s default local/dev mode runs a **single** uvicorn worker plus an in-process asyncio job worker
(`job_queue.start_worker`).

## What is process-local today

| Component                  | Scope       | Multi-worker risk                                                                               |
|----------------------------|-------------|-------------------------------------------------------------------------------------------------|
| `job_queue` asyncio worker | One process | Multiple workers each run a worker → **duplicate job claims** unless only one process starts it |
| Enrichment memory cache    | Process     | Cold cache per process (Mongo tier still shared)                                                |
| Auth throttle memory path  | Process     | **Reject-only** hot path; allow decisions use Mongo                                             |
| `_last_golden_run`         | Process     | Mongo `golden_runs` is durable                                                                  |
| In-memory rate limit list  | Process     | Mirror only; not source of truth when Mongo is up                                               |

## Auth rate limits (A-A3 — complete)

`auth_throttle.rate_limit_allow` uses a single atomic Mongo
`find_one_and_update` (`$push` hit, return AFTER) as the **sole allow/deny source of truth** when Mongo is available.
Concurrent uvicorn workers (or multiple hosts sharing one Mongo) share accurate counters.

Login lockouts use atomic `$inc` on `login_lockouts` plus `locked_until`. Memory dicts are:

- Reject-only for rate limits when the local cache already shows over-limit
- Fallback only if Mongo is briefly unavailable

Do not disable Mongo for multi-worker deploys.

## Safe patterns

1. **Local / small deploy (recommended)**
   ```bash
   # From repository root
   export PYTHONPATH=.
   python -m uvicorn backend.server:app --host 0.0.0.0 --port 8001 --workers 1
   ```

2. **Multiple API workers**
    - Set `ACTIRA_JOB_WORKER=0` on all but **one** process (leader), **or**
    - Run multiple leaders only if job claims stay single-owner (Mongo claim is atomic).
    - Payloads default to **Mongo GridFS** (`ACTIRA_JOB_PAYLOAD_BACKEND=mongo`) so any host can load an upload claimed
      from the queue.

3. **Auth / rate limits**  
   Mongo is source of truth (`auth_throttle`). Shared `MONGO_URL` required across workers.

4. **Sessions (A-F1)**  
   SPA uses httpOnly cookie + CORS credentials; JWT is still stateless for API clients that send
   `Authorization: Bearer`. Role is re-bound from Mongo (A-S6). Sticky sessions not required for API.

## Shared job payloads (multi-node — complete)

| Backend             | Env                                | When                                                                                       |
|---------------------|------------------------------------|--------------------------------------------------------------------------------------------|
| **mongo** (default) | `ACTIRA_JOB_PAYLOAD_BACKEND=mongo` | Multi-node / multi-host; meta in `job_payload_meta`, bytes in GridFS bucket `job_payloads` |
| **disk**            | `…=disk`                           | Single-node local tests; `ACTIRA_JOB_PAYLOAD_DIR`                                          |
| **dual**            | `…=dual`                           | Write both; load prefers mongo then disk                                                   |

Upload → `enqueue` → `save_payload_async` → worker `load_payload_async` after claim. Secrets never stored in payload
meta (scrub + re-hydrate from settings).

## External secrets vault (optional)

| Backend             | Wire format                                       | Env                                              |
|---------------------|---------------------------------------------------|--------------------------------------------------|
| Local Fernet        | `enc:v1:…`                                        | `SECRETS_MASTER_KEY`                             |
| Hashicorp Transit   | `enc:hvt:v1:…`                                    | `VAULT_ADDR`, `VAULT_TOKEN`, `VAULT_TRANSIT_KEY` |
| Hashicorp KV ref    | `ref:hvk:v1:path#key` or paste `vault://path#key` | same + `VAULT_KV_MOUNT`                          |
| AWS Secrets Manager | `ref:awssm:v1:id#key` or `awssm://id#key`         | AWS credentials + region                         |

## Env flags

| Variable                     | Default | Meaning                                                              |
|------------------------------|---------|----------------------------------------------------------------------|
| `ACTIRA_JOB_WORKER`          | `1`     | Set `0` to disable in-process job worker (for secondary API workers) |
| `ACTIRA_JOB_PAYLOAD_BACKEND` | `mongo` | `mongo` \| `disk` \| `dual`                                          |
| `JOB_STALE_MINUTES`          | `30`    | Re-queue stuck `running` jobs still claimed after this many minutes  |
| `JOB_WORKER_POLL_SECONDS`    | `1.5`   | Queue poll interval                                                  |
| `SECRETS_MASTER_KEY`         | (none)  | **Prod required** — explicit vault key; avoid JWT-derived only       |
| `FEATURE_REALTIME_OPS`       | `1`     | SSE/WS queue push (in-process; not multi-replica pub/sub)            |

## Optional job broker (honesty)

Settings may enable `job_broker_enabled` + `job_broker_url` (AMQP). That path is a **wake-up / optional signal** only:

- Durable job state and claim ownership remain in **Mongo** (`job_queue`).
- This is **not** Celery, RQ, or a free-form worker rewrite.
- Multi-replica still needs exactly the `ACTIRA_JOB_WORKER` leader pattern (or atomic multi-claim).
- Ops UI exposes `broker_honesty` on `GET /api/ops/status`.

## Hung job resume

On worker **startup**, `requeue_on_startup` immediately reclaims every non-terminal
`queue_state=running` job (process death does **not** wait for `JOB_STALE_MINUTES`).

Operators can also force a re-queue when the durable payload still exists:

```http
POST /api/logs/jobs/{job_id}/resume
Authorization: Bearer <jwt>
```

UI: **Ingest Logs → Recent Jobs → Resume**. Fails with 400 if shared payload (mongo/disk) was already cleared (job
finished or cleaned up).

## Checklist before scaling out

- [x] Exactly one job worker claims Mongo `queue_state=queued` (or multiple with atomic claim)
- [x] Shared Mongo for jobs, users, settings, throttle, enrichment_cache
- [x] Shared job payloads via Mongo GridFS (`ACTIRA_JOB_PAYLOAD_BACKEND=mongo`)
- [x] Helm multi-replica pattern (`values-prod.yaml`: API `ACTIRA_JOB_WORKER=0` + worker Deployment)
- [x] HA validation runbook (`docs/operations/HA_VALIDATION.md`)
- [x] Load methodology for 10 / 100 users (`benchmarks/reports/LOAD_TEST_10_100.md`)
- [ ] Strong `JWT_SECRET`, `ENV!=dev` (environment-specific)
- [ ] Frontend built with correct `REACT_APP_BACKEND_URL` (A-D2)
- [ ] Optional: `SECRETS_MASTER_KEY` or Hashicorp/AWS SM for secrets

## Analytics cache note (P2)

In-process KPI/dashboard cache is **per process**. Multi-replica deploys see independent TTLs unless
you set short `ANALYTICS_*_CACHE_TTL_SECONDS` or call `?force_refresh=true`.
