# ACTIRA — Configuration Reference

## Files

| File                   | Purpose                                      |
|------------------------|----------------------------------------------|
| `backend/.env`         | **Local secrets & bootstrap** (never commit) |
| `backend/.env.example` | Documented template                          |
| `frontend/.env`        | `REACT_APP_BACKEND_URL`                      |
| Admin → Settings       | Runtime ops + secrets (Mongo)                |

**Resolution order for secrets:** Mongo settings (decrypted) → process environment / `.env`.

---

## Infrastructure (required)

| Variable       | Example                                       | Notes                                                    |
|----------------|-----------------------------------------------|----------------------------------------------------------|
| `MONGO_URL`    | `mongodb://localhost:27017`                   | In Compose service network use `mongodb://mongodb:27017` |
| `DB_NAME`      | `soc_console`                                 |                                                          |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Exact browser origins                                    |
| `JWT_SECRET`   | **Policy ≥32** random chars                   | Runtime refuses weak/default or **&lt;16** outside lab (`auth.py`) |
| `ENV`          | `dev` / `test` / `production`                 | Affects seed, secret sync, JWT checks                    |
| `METRICS_TOKEN`| (optional)                                    | Scrape token for `GET /metrics` (or admin JWT)           |
| `SECRETS_MASTER_KEY` | explicit Fernet / passphrase            | Prefer over JWT-derived key in staging/prod              |

## Logging (console + physical file)

Yes — application logs are routed to a **physical rotating file** by default, in addition to the console. Every line includes **request id**, **user** (email), **user id**, and **role** for tracking and audit greps.

| Variable           | Default           | Notes |
|--------------------|-------------------|-------|
| `LOG_TO_FILE`      | `1` (on)          | Set `0`/`false` to console-only |
| `LOG_DIR`          | `backend/logs`    | Absolute path (e.g. `D:\actira-logs`) or relative to **repo root** |
| `LOG_FILE`         | `actira.log`      | Filename only (no `../`) |
| `LOG_LEVEL`        | `INFO`            | `DEBUG` / `INFO` / `WARNING` / `ERROR` |
| `LOG_MAX_BYTES`    | `10485760` (10 MiB) | Rotating file size |
| `LOG_BACKUP_COUNT` | `10`              | Kept rotated files |

Example (Windows absolute path):

```env
LOG_TO_FILE=1
LOG_DIR=C:\actira\logs
LOG_FILE=actira.log
LOG_LEVEL=INFO
# Optional: JSON lines for SIEM shipping
# LOG_FILE_FORMAT=json
```

Example line:

```text
2026-07-28 22:10:01,234 INFO [rid=a1b2…] [user=analyst@soc.example.com] [uid=fa1f…] [role=admin] actira: http_request method=POST path=/api/logs/upload-batch status=200 …
```

Pipeline jobs use `[rid=job:<job_id>] [user=<uploader_email>] [uid=…] [role=…]`.  
Admin → **Ops & Health** (`GET /api/ops/status`) reports the active log file path under `logging.path`.  
Restart uvicorn after changing log env vars.

| Variable | Default | Notes |
|----------|---------|-------|
| `LOG_FORMAT` | `text` | `json` for structured one-line JSON (ELK/Datadog) |
| `LOG_FILE_FORMAT` | same as `LOG_FORMAT` | e.g. text console + JSON file |

### Threat intel HTTP + enrichment pool

| Variable | Default | Notes |
|----------|---------|-------|
| `TI_HTTP_TIMEOUT` | `8` | Seconds per TI call |
| `TI_HTTP_RETRIES` | `2` | Retries after first attempt (backoff) |
| `TI_HTTP_BACKOFF_BASE` | `0.4` | Exponential base seconds |
| `TI_HTTP_PROXY` | — | Or `HTTPS_PROXY` / `HTTP_PROXY` |
| `TI_HTTP_CA_BUNDLE` | — | Corporate CA path |
| `TI_HTTP_VERIFY_SSL` | on | `0` only in lab |
| `TI_CIRCUIT_FAILURES` | `5` | Open circuit after N consecutive failures |
| `TI_CIRCUIT_COOLDOWN_SECONDS` | `60` | Open duration |
| `ENRICH_CONCURRENCY` | `8` | Parallel IoC enrich workers (1–32) |
| `PARSE_CONCURRENCY` | `4` | Parallel multi-file log parse workers (1–16) |

### Pipeline parallelization (summary)

| Stage | Parallel? | Config | Notes |
|-------|-----------|--------|-------|
| ZIP expand | No | — | Sequential with ZIP-bomb guards |
| Multi-file parse | **Yes** | `PARSE_CONCURRENCY` / Settings `parse_concurrency` | `asyncio.to_thread` + semaphore |
| Correlate | No | `correlation_window_minutes` | Single entity graph |
| IoC extract | No | `max_enrich_iocs` cap | Regex over combined blob |
| Enrich | **Yes** | `ENRICH_CONCURRENCY` / Settings `enrich_concurrency` | TI HTTP pool + cache |
| ATT&CK map | No | optional LLM refine | Catalog heuristics |
| RAG + playbook | No | LLM provider | Single authoring call |
| HiTL gate | No | severity + grounding | Pure policy |

Admin → **Settings → Platform** exposes enrich + parse concurrency (synced to env on save).

### Metrics

`GET /metrics` (admin JWT or `X-Metrics-Token`):

- JSON gauges (default)
- Prometheus text: `?format=prometheus` or `Accept: text/plain`

### Realtime ops (SSE / WebSocket)

| Variable | Default | Notes |
|----------|---------|-------|
| `FEATURE_REALTIME_OPS` | on | Set `0`/`false` to disable. Enables `GET /api/sse/ops` and **WebSocket** `WS /api/ws/ops` |
| `REACT_APP_REALTIME_OPS` | on (frontend) | SPA opt-out: set `0` in `frontend/.env` |

> **OpenAPI note:** SSE paths appear in [openapi.json](openapi.json). **WebSocket** `/api/ws/ops` is implemented in `backend/routers/realtime.py` but is **not** fully represented in OpenAPI (common for WS). See [API_REFERENCE.md](API_REFERENCE.md).

### Job artifacts (optional)

| Variable | Default | Notes |
|----------|---------|-------|
| `JOB_ARTIFACTS_ENABLED` | off | Store parse/enrich/playbook summaries under `JOB_ARTIFACTS_DIR` |
| `JOB_ARTIFACTS_DIR` | `backend/data/job_artifacts` | Artifact root |
| `JOB_ARTIFACTS_MAX_BYTES` | `5000000` | Max size per artifact write |
| `JOB_ARTIFACTS_RETAIN_HOURS` | `168` | Auto-purge older artifact dirs |

### Multi-worker job payloads

| Variable | Default | Notes |
|----------|---------|-------|
| `ACTIRA_JOB_PAYLOAD_BACKEND` | `mongo` | `mongo` \| `disk` \| `dual` — shared payloads for multi-replica workers |
| `ACTIRA_JOB_PAYLOAD_DIR` | — | Required for `disk`/`dual` local path |
| `ACTIRA_JOB_WORKER` | `1` | Set `0` on secondary API replicas; `1` on worker pod ([MULTI_WORKER.md](MULTI_WORKER.md)) |
| `JOB_WORKER_POLL_SECONDS` | `1.5` | Worker poll interval |
| `JOB_STALE_MINUTES` | `30` | Stale job reclaim window |

### Settings versioning

Each admin settings save appends an ops snapshot to Mongo `settings_versions` (secrets never stored).  
API: `GET /api/settings/versions` (admin).

### Pipeline replay

| API | Purpose |
|-----|---------|
| `POST /api/logs/jobs/{id}/replay` | Re-queue when payload retained (`JOB_PAYLOAD_RETAIN=1`) |
| `GET /api/logs/jobs/{id}/artifacts` | List stage snapshots |
| `POST /api/incidents/{id}/replay-enrich` | Re-run TI on stored IoCs |

### Log archival

| Variable | Default | Notes |
|----------|---------|-------|
| `LOG_ARCHIVE_ENABLED` | follows `LOG_TO_FILE` | Copy logs into dated archive dirs |
| `LOG_ARCHIVE_DIR` | `backend/logs/archive` | |
| `LOG_ARCHIVE_RETAIN_DAYS` | `30` | Purge older day folders |

### LLM cost estimates

`usage_snapshot` / ops surfaces include `estimated_usd` and `by_provider` from token counts × list rates.  
Override rates with `LLM_PRICE_TABLE_JSON`. **Not a billing invoice.**

### Admin → Settings → Platform

Enterprise knobs that used to be env-only are now **first-class Settings fields** (Mongo + UI), with factory/recommended defaults. On **API start** and **Save settings**, values are pushed into process env so logging/TI/jobs pick them up.

| Area | Fields |
|------|--------|
| Enrichment / TI | `max_enrich_iocs`, `enrich_concurrency`, `parse_concurrency`, `ti_http_*`, `ti_circuit_*` |
| Logging | `log_format`, `log_file_format`, `log_level`, `log_to_file`, `log_archive_*` |
| Jobs / replay | `job_artifacts_enabled`, `job_payload_retain`, `job_artifacts_retain_hours` |
| Audit | `audit_worm_enabled`, `audit_siem_webhook_url` (secret) |
| Broker | `job_broker_enabled`, `job_broker_url` (secret), `job_broker_queue` |

**Still env-only (infrastructure):** `MONGO_URL`, `JWT_SECRET`, `CORS_ORIGINS`, `DB_NAME`, `ENV`, vault/OIDC — not product Settings.

### Ops anomaly detection

`GET /api/ops/status` → `anomaly` block: median/MAD z-scores on job timings, failure rate, backlog, TI circuits, HTTP latency. Deterministic (not ML). Shown on **Ops Health**.

### Audit WORM + SIEM

| Variable | Notes |
|----------|-------|
| `AUDIT_WORM_ENABLED` | Append-only JSONL under `AUDIT_WORM_DIR` on every audit insert |
| `AUDIT_SIEM_WEBHOOK_URL` | Optional POST of each audit event |
| `GET /api/audit/export` | Admin bulk export + JSONL write |
| `GET /api/audit/worm-status` | Path + recent files |
| `POST /api/audit/siem-test` | Synthetic webhook probe |

### Optional AMQP job broker

| Variable | Notes |
|----------|-------|
| `JOB_BROKER_ENABLED` | `0` off (default); `1` publish wake-ups |
| `JOB_BROKER_URL` | e.g. `amqp://guest:guest@localhost:5672/` |
| `JOB_BROKER_QUEUE` | default `actira.jobs` |

Publishes wake-ups on enqueue; **Mongo remains the claim source of truth**. Soft-dep: `pip install pika`.

### Optional HashiCorp Vault / external secrets

Local Fernet (`SECRETS_MASTER_KEY`) is enough for most single-tenant deploys. Optional Vault:

| Variable | Notes |
|----------|-------|
| `VAULT_ADDR` | e.g. `https://vault.example.com:8200` |
| `VAULT_TOKEN` | Token with transit/KV access |
| `VAULT_TRANSIT_KEY` | Transit key name (default `actira`) |
| `VAULT_TRANSIT_ENABLED` | `auto` \| `1` \| `0` — `auto` enables when addr+token set |
| `VAULT_KV_MOUNT` | KV mount (default `secret`) |

Settings may also reference `vault://path#field` or `awssm://secret-id#json_key` (AWS uses default boto3 chain + `AWS_REGION`).

### Outbound email (SMTP)

Used for optional email notifications (not the in-app inbox).

| Variable | Default | Notes |
|----------|---------|-------|
| `SMTP_HOST` | empty | Empty → email send disabled |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` / `SMTP_PASSWORD` | — | Auth |
| `SMTP_FROM` | — | From address |
| `SMTP_USE_TLS` | `true` | STARTTLS |

### Retention & enrichment cache

| Variable | Default | Notes |
|----------|---------|-------|
| `INCIDENT_RETENTION_DAYS` | `90` | Incident purge window (see retention job) |
| `ENRICHMENT_CACHE_TTL_HOURS` | `24` | TI enrichment cache TTL |
| `AUDIT_SIEM_TIMEOUT` | `5` | Seconds for audit SIEM webhook POST |

### Cohere re-rank (optional RAG)

| Variable | Notes |
|----------|-------|
| `ACTIRA_COHERE_RERANK` | `1` to enable re-ranker when Cohere key present |
| `ACTIRA_COHERE_MODEL` | e.g. `rerank-english-v3.0` |
| `COHERE_API_KEY` | Or Settings |

### SPA replay

- **Ingest Logs**: Replay + Artifacts buttons per job  
- **Incident → TI**: “Replay enrich” re-runs TI on stored IoCs  

## Auth & session

| Variable                            | Default         | Notes                     |
|-------------------------------------|-----------------|---------------------------|
| `SESSION_TIMEOUT_HOURS`             | `12`–`24`       | JWT lifetime              |
| `FAILED_LOGIN_LOCKOUT`              | `7`             |                           |
| `SEED_DEMO_USERS`                   | `true` lab only | Dual-gate with lab `ENV`  |
| `AUTH_RETURN_TOKEN_IN_BODY`         | `1`             | Cookie is primary for SPA |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | auto            | Cross-origin SPA care     |
| `ALLOW_PUBLIC_REGISTER`             | auto            | See [Public registration](#public-registration) |

### Public registration

`POST /auth/register` and the Login “Register” UI are controlled by:

1. **`ALLOW_PUBLIC_REGISTER=true|false`** — explicit override (wins over everything below)
2. Else if **OIDC is enabled** (`OIDC_ISSUER` + `OIDC_CLIENT_ID`) → **disabled**
3. Else if **`ENV`** is `production` / `prod` / `staging` → **disabled**
4. Else → **allowed** (lab / local demos)

Public bootstrap: `GET /api/auth/oidc/config` returns `{ enabled, public_register, ... }` (no secrets).

### OIDC / SSO (optional)

When both issuer and client id are set, password login remains available but SSO appears on Login.

**MFA / step-up:** ACTIRA does not ship built-in TOTP. For production, enable **MFA at the IdP** (Entra / Okta / Keycloak Conditional Access) and map groups via `OIDC_GROUP_ROLE_MAP`. Treat missing MFA as an accepted residual risk in [SECURITY_HARDENING.md](operations/SECURITY_HARDENING.md).

| Variable               | Required | Notes |
|------------------------|----------|-------|
| `OIDC_ISSUER`          | yes*     | Issuer URL (discovery: `/.well-known/openid-configuration`) |
| `OIDC_CLIENT_ID`       | yes*     | SPA/public or confidential client id |
| `OIDC_CLIENT_SECRET`   | no       | Confidential clients only |
| `OIDC_REDIRECT_URI`    | yes*     | Must match IdP app registration (e.g. `http://localhost:8001/api/auth/oidc/callback`) |
| `OIDC_SCOPES`          | no       | Default `openid email profile` |
| `OIDC_ROLE_CLAIM`      | no       | Claim name mapping to `admin` / `senior_reviewer` / `analyst` |
| `OIDC_GROUP_ROLE_MAP`  | no       | JSON e.g. `{"soc-admins":"admin","soc-reviewers":"senior_reviewer"}` |

\* Required only when enabling SSO.

Routes: `GET /api/auth/oidc/login` (redirect), `GET /api/auth/oidc/callback` (sets `actira_access_token` cookie).

### Collaboration & productivity feature flags (H-07 / H-08)

All default **off**. SPA reads `GET /api/meta/features` (also under `/api/v1`). When a flag is
off, future collab APIs return **404** via `require_feature` — not only hide UI.

| Variable | Default | Enables |
|----------|---------|---------|
| `FEATURE_COLLAB_ASSIGN` | off | Incident assignment API/UI |
| `FEATURE_COLLAB_COMMENTS` | off | Incident comments |
| `FEATURE_NOTIFICATION_CENTER` | off | In-app notification inbox |
| `FEATURE_SAVED_FILTERS` | off | Named saved incident filters |
| `FEATURE_PINS` | off | User favorites / pins |

Truth values: `1` / `true` / `yes` / `on`. See `docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md` (PR-1).

### OpenTelemetry (optional)

Soft dependency — install exporters only if you enable export:

```text
pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
```

| Variable                       | Notes |
|--------------------------------|-------|
| `ACTIRA_OTEL_ENABLED`          | `1` / `true` to enable setup |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  | e.g. `http://localhost:4318` (HTTP OTLP) |
| `OTEL_SERVICE_NAME`            | Default `actira` |

If packages or env are missing, startup is a no-op. Pipeline stage timings remain available without a collector.

### EVTX ingest (optional)

`.evtx` files are detected by magic (`ElfFile`) / extension. Full record parse requires optional:

```text
pip install python-evtx
```

Without it, upload still yields a single informational CES event rather than failing hard.

## LLM

| Variable                                                                   | Notes                                         |
|----------------------------------------------------------------------------|-----------------------------------------------|
| `LLM_PROVIDER`                                                             | `anthropic` \| `openai` \| `gemini` \| `groq` |
| `LLM_MODEL`                                                                | e.g. `claude-sonnet-4-6`                      |
| `LLM_TEMPERATURE`                                                          | e.g. `0.35`                                   |
| `LLM_TOKEN_BUDGET_MONTHLY`                                                 | Soft budget                                   |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | Or set via Settings                           |

## Pipeline / HiTL

| Variable                     | Default      | Meaning                      |
|------------------------------|--------------|------------------------------|
| `GROUNDING_THRESHOLD`        | `0.7`        | Below → HiTL                 |
| `HITL_SEVERITY_MIN`          | `critical`   | At/above → always HiTL       |
| `AUTO_APPROVE_GROUNDING_MIN` | `0.88`–`0.9` | Never bypasses severity gate |
| `CORRELATION_WINDOW_MINUTES` | `45`         |                              |

## Threat intel

Empty keys → **mock enrichment** for that source.  
`FORCE_MOCK_TI=true` forces mocks (CI).

`ABUSEIPDB_API_KEY`, `VIRUSTOTAL_API_KEY`, `GREYNOISE_API_KEY`, `THREATFOX_API_KEY`, `OTX_API_KEY`, `SHODAN_API_KEY`,
`COHERE_API_KEY`

## RAG / vectors

| Variable                   | Notes                                      |
|----------------------------|--------------------------------------------|
| `ACTIRA_VECTOR_STORE`      | `1` default on                             |
| `ACTIRA_RETRIEVAL_MODE`    | `hybrid` \| `bm25` \| `dense`              |
| `ACTIRA_EMBEDDING_BACKEND` | `hash` (CI) \| `sbert` \| `lora` \| `none` |
| `ACTIRA_EMBEDDING_MODEL`   | e.g. `BAAI/bge-small-en-v1.5`              |
| `ACTIRA_LANCEDB_PATH`      | Override DB dir                            |
| `ACTIRA_COHERE_RERANK`     | Enable re-rank when key present            |

## Notifications

| Variable             | Notes                                  |
|----------------------|----------------------------------------|
| `SLACK_WEBHOOK_URL`  | Incoming webhook only (not bot tokens) |
| `EMAIL_ALERTS_TO`    | Comma-separated                        |
| `EMAIL_HTTP_GATEWAY` | Dev-friendly outbox without SMTP       |
| `SMTP_*`             | Optional real mail                     |

## Ingest

| Variable         | Notes                 |
|------------------|-----------------------|
| `INGEST_API_KEY` | Header `X-Ingest-Key` |

## Secrets vault

| Variable                 | Notes                                     |
|--------------------------|-------------------------------------------|
| `SECRETS_MASTER_KEY`     | **Strongly recommended** outside pure lab |
| `VAULT_*` / `AWS_REGION` | Optional external secret refs             |

## Jobs / multi-worker

See [MULTI_WORKER.md](MULTI_WORKER.md): `ACTIRA_JOB_WORKER`, `ACTIRA_JOB_PAYLOAD_BACKEND`, `JOB_STALE_MINUTES`, …

## Frontend

```env
REACT_APP_BACKEND_URL=http://localhost:8001
# Prefer matching hostname you type in the browser (localhost vs 127.0.0.1)
```

---

## Profiles

Admin Settings supports **apply profile** for lab vs stricter ops presets (see API `/api/settings/profiles`). Prefer UI
for day-2 changes; restart only needed for pure env-only vars read at import time.
