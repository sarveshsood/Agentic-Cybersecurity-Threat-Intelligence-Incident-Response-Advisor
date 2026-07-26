# ACTIRA — Detailed Module Review & Action Items

**Date:** 2026-07-19  
**Scope:** Full backend modules, tests, docker-compose, frontend auth/API surface  
**Method:** Static code review + prior hardening/exception work

---

## Executive summary

ACTIRA is a capable multi-agent SOC console: JWT RBAC, multi-format log ingest, IoC enrichment, hybrid RAG,
multi-provider LLM playbooks/investigator, HiTL review, offline golden CI, and ops settings.

Hardening already shipped (register role force, ingest constant-time key, settings secret redaction, HiTL race-safe
review, ZIP guards, job failure sidecars, mock-only golden, auth throttle durability).

**Biggest remaining themes (all closed as of 2026-07-20):**

1. ~~Production security gates~~ **DONE** (demo seeds, weak JWT, vault encrypt-at-rest, FormSubmit off)
2. ~~Settings knobs that don’t do anything~~ **DONE** (temp, retention, window, cache, budget)
3. ~~Correctness bugs~~ **DONE** (SSE incident_ids, email normalize)
4. ~~Scale/reliability~~ **DONE** (durable job queue, mock TI policy, IoC caps, multi-worker throttle)
5. ~~Test gaps~~ **DONE** (+ vault / multi-worker residual suite)

**Optional ops stretch (out of review scope):** external KMS/Hashicorp vault product; multi-node shared job payload
store.

---

## Priority legend

| Priority | Meaning                                            |
|----------|----------------------------------------------------|
| **P0**   | Do before any real/prod deployment                 |
| **P1**   | High — correctness, security, or major UX breakage |
| **P2**   | Medium — quality, scale, maintainability           |
| **P3**   | Nice-to-have / polish                              |

---

# Module-by-module review

---

## 1. `backend/server.py` — API surface

### Purpose

FastAPI app: lifespan/Mongo, CORS, middleware, auth, upload/ingest, incidents, review, settings, roadmap, investigate
SSE, golden, KPIs, audit.

### Strengths

- Env loaded before auth import; hard fail on missing `MONGO_URL` / `DB_NAME`
- Startup Mongo ping + indexes; Mongo errors → 503
- Auth rate limit only on login/register
- Register always forces `role=analyst`
- Ingest key via `compare_digest`
- Settings GET never returns raw secrets
- Review atomic `find_one_and_update` → 409 on race
- Upload size limits (25MB/file, 20 files)

### Issues

| ID  | Issue                                                                    | Sev |
|-----|--------------------------------------------------------------------------|-----|
| S1  | Demo users seeded with known passwords on empty DB                       | P0  |
| S2  | Weak `JWT_SECRET` still allows boot                                      | P0  |
| S3  | Secrets stored plaintext in Mongo; may sync into `.env`                  | P0  |
| S4  | Job SSE reads `incident_id` but pipeline writes `incident_ids` (`~2121`) | P1  |
| S5  | Unauthenticated `GET /metrics` exposes counts                            | P1  |
| S6  | JWT role not re-bound from DB each request                               | P1  |
| S7  | Jobs only via `BackgroundTasks` (not durable)                            | P1  |
| S8  | Login email lookup not lowercased (lockout key is)                       | P2  |
| S9  | No unique index on `users.email`                                         | P2  |
| S10 | Golden benchmark open to any authenticated user                          | P2  |
| S11 | No logout route to clear httpOnly cookie                                 | P3  |

### Action items

| ID        | Priority | Action                                                                                                | Owner hint        | Done when                                                                                                                         |
|-----------|----------|-------------------------------------------------------------------------------------------------------|-------------------|-----------------------------------------------------------------------------------------------------------------------------------|
| **A-S1**  | P0       | Gate `seed_demo_data` with `ENV=dev` (or `SEED_DEMO_USERS=true`). Never seed known passwords in prod. | backend           | Prod boot with empty DB has zero demo users                                                                                       |
| **A-S2**  | P0       | Fail startup if `ENV` ∉ {dev,test} and `JWT_SECRET` weak/short                                        | auth/server       | Staging boot rejects `dev-secret`                                                                                                 |
| **A-S3**  | P0       | Secret storage plan: encrypt-at-rest or external vault; disable `.env` write of secrets in non-dev    | secrets_util      | **DONE** — Fernet `secret_vault` (`enc:v1:` in Mongo); no prod `.env` secret write; external Hashicorp vault optional ops stretch |
| **A-S4**  | P1       | Fix job SSE: emit `incident_ids` + `incident_id=ids[0]`                                               | server            | Upload UI can open incident from SSE                                                                                              |
| **A-S5**  | P1       | Require auth or scrape token on `/metrics`; or disable in prod                                        | server            | Unauthenticated GET returns 401                                                                                                   |
| **A-S6**  | P1       | On each request, load user role from Mongo by `sub` (or short TTL + refresh)                          | auth              | Demoting admin takes effect without waiting token expiry                                                                          |
| **A-S7**  | P1       | Introduce durable queue (Arq/RQ/Celery) for pipeline jobs                                             | pipeline          | Job survives process restart                                                                                                      |
| **A-S8**  | P2       | Normalize email to lowercase on register + login query                                                | server            | `Admin@…` and `admin@…` same account                                                                                              |
| **A-S9**  | P2       | Unique index `users.email`                                                                            | lifespan          | Concurrent register cannot double-create                                                                                          |
| **A-S10** | P2       | Restrict `POST /eval/golden-benchmark` to admin                                                       | server            | Analyst gets 403                                                                                                                  |
| **A-S11** | P3       | `POST /auth/logout` clears cookie                                                                     | server + frontend | Cookie gone after logout                                                                                                          |

---

## 2. `backend/auth.py` + `auth_throttle.py`

### Purpose

JWT HS256, bcrypt, role gates; Mongo-backed login lockouts + IP rate limits with memory hot path.

### Strengths

- Weak-secret warning; sanitized token errors; admin superuser in `require_roles`
- Lockouts survive restart; clear on successful login

### Issues

| ID | Issue                                                     | Sev |
|----|-----------------------------------------------------------|-----|
| A1 | Default `JWT_SECRET=dev-secret` boots                     | P0  |
| A2 | No password complexity policy                             | P1  |
| A3 | Multi-worker rate limit can drift (memory before durable) | P2  |
| A4 | No TTL cleanup for throttle collections                   | P3  |

### Action items

| ID       | Priority | Action                                                   | Done when                                                                            |
|----------|----------|----------------------------------------------------------|--------------------------------------------------------------------------------------|
| **A-A1** | P0       | Same as A-S2 — hard fail weak secret outside dev         | Prod cannot start without 32+ char secret                                            |
| **A-A2** | P1       | `UserCreate.password` min_length ≥ 12 + basic complexity | Register rejects `password`                                                          |
| **A-A3** | P2       | Atomic Mongo ops as source of truth for rate limit       | **DONE** — `find_one_and_update` + `$inc` lockouts; multi-worker share Mongo counter |
| **A-A4** | P3       | Cron/TTL purge expired lockouts/rate docs                | Collections stay bounded                                                             |

---

## 3. `backend/pipeline.py` + `job_status.py`

### Purpose

ZIP/batch parse → correlate → IoC → enrich → ATT&CK → playbook → HiTL → Mongo + LanceDB + notify. Failures: Mongo
retry + filesystem sidecar.

### Strengths

- ZIP bomb guards; per-file parse isolation; enrich `return_exceptions=True`
- HiTL pure function; notify best-effort; job failure sidecars for UI

### Issues

| ID | Issue                                               | Sev |
|----|-----------------------------------------------------|-----|
| P1 | `correlation_window_minutes` never used             | P1  |
| P2 | No IoC count / concurrency cap on enrichment        | P1  |
| P3 | Single-file path hardcodes `upload.log`             | P2  |
| P4 | `correlation` / `files_meta` outside Incident model | P3  |
| P5 | Sidecar files may hold sensitive error text         | P2  |

### Action items

| ID       | Priority | Action                                                             | Done when                                            |
|----------|----------|--------------------------------------------------------------------|------------------------------------------------------|
| **A-P1** | P1       | Wire time window into correlator **or** remove setting from UI/API | Settings change affects correlation or field removed |
| **A-P2** | P1       | Cap enriched IoCs (e.g. 50) + semaphore for live TI HTTP           | 10k-IoC log does not hang server                     |
| **A-P3** | P2       | Pass original filename into `run_pipeline`                         | CES `source_file` correct for single upload          |
| **A-P4** | P2       | Sidecar retention + gitignore `data/job_failures/`                 | No secrets/PII lingering forever                     |
| **A-P5** | P3       | Extend `Incident` model with optional correlation/files_meta       | **DONE**                                             |

---

## 4. `backend/models.py`

### Purpose

Pydantic domain models (users, IoCs, incidents, jobs, settings, review).

### Strengths

- Clear enums; secret field registry; forward-compatible `extra=ignore`

### Issues — **dead Settings knobs** (stored but not enforced)

| Field                        | Expected behavior            | Actual  |
|------------------------------|------------------------------|---------|
| `llm_temperature`            | Passed to LLM                | Ignored |
| `llm_token_budget_monthly`   | Metering / block over budget | None    |
| `correlation_window_minutes` | Correlator time window       | Unused  |
| `incident_retention_days`    | Auto-purge old incidents     | None    |
| `enrichment_cache_ttl_hours` | Cache TI results             | None    |

### Action items

| ID       | Priority | Action                                                                           | Done when                                                           |
|----------|----------|----------------------------------------------------------------------------------|---------------------------------------------------------------------|
| **A-M1** | P1       | For each dead field: **implement** or **remove/hide** from Settings UI + OpenAPI | **DONE** (temp, window, cache, retention purge, token budget meter) |
| **A-M2** | P2       | Password Field constraints on `UserCreate`                                       | Aligns with A-A2 — **DONE**                                         |
| **A-M3** | P3       | `UserCreatePublic` without privileged role options                               | **DONE** (`UserCreatePublic` + register)                            |

---

## 5. `backend/llm_provider.py` + `playbook_agent.py` + `ai_investigator.py`

### Purpose

Multi-provider LLM; citation-grounded playbooks; investigator Q&A with RAG + sanitization.

### Strengths

- Retries, stream fallback, robust `parse_llm_json`, citation ID filtering, template fallback
- Investigator sanitizes MITRE/KB refs to provided sets

### Issues

| ID | Issue                                                          | Sev |
|----|----------------------------------------------------------------|-----|
| L1 | `llm_temperature` not applied                                  | P1  |
| L2 | Invalid LLM `phase` can discard whole playbook → fallback      | P1  |
| L3 | Fallback playbook can score high grounding → auto-approve risk | P2  |
| L4 | Full IoC context sent to third-party LLM (privacy)             | P2  |
| L5 | Grounding = “has citation”, not “citation is correct”          | P3  |

### Action items

| ID       | Priority | Action                                                               | Done when                                                   |
|----------|----------|----------------------------------------------------------------------|-------------------------------------------------------------|
| **A-L1** | P1       | Pass temperature from settings into all providers                    | Setting changes completion randomness                       |
| **A-L2** | P1       | Normalize phase to allowed set before `PlaybookStep`                 | Bad phase doesn’t wipe LLM steps                            |
| **A-L3** | P2       | If playbook is pure fallback, force `hitl_required` or low grounding | Auto-approve never on template-only                         |
| **A-L4** | P2       | Optional redaction mode for investigator prompts                     | Toggle in Settings                                          |
| **A-L5** | P3       | Citation-quality metric (optional nightly)                           | **DONE** (`playbook.citation_quality` unique cites / steps) |

---

## 6. `backend/enrichment.py` + `ioc_extractor.py` + `parsers.py` + `correlator.py`

### Purpose

IoC extract; live/mock TI; multi-format CES parse; cross-log entity correlation.

### Strengths

- Private IP filter; file-suffix domain filter; `force_mock` for CI
- Parser registry + confidence scoring; short TI timeouts

### Issues

| ID | Issue                                                                     | Sev |
|----|---------------------------------------------------------------------------|-----|
| E1 | Mock scores used when keys missing → false severity in “prod half-config” | P1  |
| E2 | No enrichment cache despite setting                                       | P1  |
| E3 | Private IP gaps (link-local, CGNAT, IPv6)                                 | P2  |
| E4 | Correlator ignores time proximity                                         | P2  |
| E5 | No dedicated parser unit suite                                            | P2  |

### Action items

| ID       | Priority | Action                                                                           | Done when                                |
|----------|----------|----------------------------------------------------------------------------------|------------------------------------------|
| **A-E1** | P1       | Prod mode: unscored/0 when no key (mock only if `FORCE_MOCK_TI=true` or ENV=dev) | Live severity not inflated by mocks      |
| **A-E2** | P1       | Mongo/Redis enrichment cache keyed by type+value+source, TTL from settings       | Repeat IoC doesn’t re-hit API within TTL |
| **A-E3** | P2       | Expand private/reserved ranges; optional extract cap                             | Fewer noise IoCs                         |
| **A-E4** | P2       | Time-windowed correlation (with A-P1)                                            | Window setting meaningful                |
| **A-E5** | P2       | Fixture tests for Apache/Syslog/CEF/JSON/CSV                                     | Parser regressions caught offline        |

---

## 7. `backend/knowledge_base.py` + `embeddings.py` + `vector_store.py` + `reranker.py`

### Purpose

Static KB + BM25/hybrid dense RRF; hash/sbert embedders; optional Cohere rerank; keyword ATT&CK map.

### Strengths

- Graceful BM25 fallback; offline hash embedder; RRF + re-rank; LanceDB reindex on dim change

### Issues

| ID | Issue                                               | Sev               |
|----|-----------------------------------------------------|-------------------|
| K1 | Default hash embeddings weak for semantic retrieval | P1 (prod quality) |
| K2 | KB static — no admin ingest                         | P2                |
| K3 | ATT&CK inference keyword-only                       | P2                |
| K4 | LanceDB delete uses string filter                   | P2                |

### Action items

| ID       | Priority | Action                                                                     | Done when                                                                                                                                                                                                                            |
|----------|----------|----------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **A-K1** | P1       | Document + default-recommend SBERT for prod; one-click reindex in Settings | Hybrid retrieval meaningful                                                                                                                                                                                                          |
| **A-K2** | P2       | Admin API: upload doc → chunk → reindex                                    | **DONE** (`POST /kb/ingest`, Mongo `kb_docs`, Knowledge UI)                                                                                                                                                                          |
| **A-K3** | P2       | Safer parameterized delete for incident vectors                            | **DONE**                                                                                                                                                                                                                             |
| **A-K4** | P3       | Expand ATT&CK rules / optional LLM-assisted map with validation            | **DONE 2026-07-19** — `attack_catalog.py` + `attack_mapping.py` (sub-techniques, CES rules, evidence); TechniquePanel UI; heatmap/incidents filter; optional `llm_technique_refine` settings flag; tests in `test_attack_mapping.py` |

---

## 8. `backend/notifications.py` + `secrets_util.py`

### Purpose

Slack + email (SMTP or FormSubmit HTTP) + outbox; secret resolve/placeholder checks.

### Strengths

- Slack diagnostics; outbox for operator visibility; placeholder detection

### Issues

| ID | Issue                                                                           | Sev            |
|----|---------------------------------------------------------------------------------|----------------|
| N1 | `EMAIL_HTTP_GATEWAY` defaults **true** → FormSubmit third party gets alert text | P0             |
| N2 | Outbox/sidecars on disk may contain IoCs/PII; may not be gitignored fully       | P1             |
| N3 | Secrets synced into `.env` on settings save                                     | P0 (with A-S3) |

### Action items

| ID       | Priority | Action                                                                               | Done when                                          |
|----------|----------|--------------------------------------------------------------------------------------|----------------------------------------------------|
| **A-N1** | P0       | Default HTTP gateway **off** unless `ENV=dev`; require explicit opt-in               | Real alerts never leave via FormSubmit by accident |
| **A-N2** | P1       | Gitignore `backend/data/email_outbox/`, `job_failures/`; retention job (e.g. 7 days) | No long-term PII on disk                           |
| **A-N3** | P1       | Unit tests: webhook diagnose, FormSubmit response parse, SMTP skip                   | Notifications don’t regress silently               |

---

## 9. `backend/hitl_gate.py` + `analytics.py`

### Purpose

Pure HiTL/auto-approve policy; analytics aggregates for UI.

### Strengths

- Severity gate never bypassed by auto-approve; well unit-tested
- Analytics: severity/status/IoC/ATT&CK/timeline

### Issues

| ID | Issue                                                    | Sev |
|----|----------------------------------------------------------|-----|
| H1 | Analytics loads ≤1000 docs into process memory           | P2  |
| H2 | ISO string `created_at` windowing fragile if formats mix | P2  |

### Action items

| ID       | Priority | Action                                      | Done when                                                                   |
|----------|----------|---------------------------------------------|-----------------------------------------------------------------------------|
| **A-H1** | P2       | Mongo aggregation for KPI/analytics counts  | **DONE** (`analytics.compute_analytics` mongo path)                         |
| **A-H2** | P2       | Store `created_at` as datetime consistently | **DONE** (`mongo_util.to_mongo_doc` + `created_at_match` dual datetime/ISO) |

---

## 10. `backend/golden_eval.py` + `retrieval_eval.py` + `roadmap_data.py`

### Purpose

Offline pipeline regression; retrieval hit@k; product roadmap seed.

### Strengths

- True offline golden (force_mock + template + BM25); CI thresholds; fast

### Issues

| ID | Issue                                      | Sev                 |
|----|--------------------------------------------|---------------------|
| G1 | Does not measure live LLM playbook quality | By design; document | P2 |
| G2 | `retrieval_eval` mutates process env       | P2                  |
| G3 | Last golden run only in-process memory     | P3                  |

### Action items

| ID       | Priority | Action                                                | Done when                                                    |
|----------|----------|-------------------------------------------------------|--------------------------------------------------------------|
| **A-G1** | P2       | Optional nightly “live LLM golden” (not default CI)   | **DONE** (`live_llm` flag on golden endpoint; mock TI still) |
| **A-G2** | P2       | Isolate env mutations with contextmanager/monkeypatch | **DONE**                                                     |
| **A-G3** | P3       | Persist last golden run to Mongo                      | **DONE** (`golden_runs`)                                     |

---

## 11. Frontend (`src/lib/*`, pages)

### Strengths

- Bearer + withCredentials; throttled network toasts; role-gated routes; Upload job fail toasts; Settings validation
  rich

### Issues

| ID | Issue                                                                        | Sev |
|----|------------------------------------------------------------------------------|-----|
| F1 | JWT in `localStorage` → XSS token theft risk                                 | P2  |
| F2 | Missing `REACT_APP_BACKEND_URL` → broken `undefined/api`                     | P2  |
| F3 | Some pages still silent empty on error (Dashboard)                           | P3  |
| F4 | Login still shows Admin/Reviewer in register UI though server forces analyst | P3  |
| F5 | No frontend automated tests in-repo currently emphasized                     | P3  |

### Action items

| ID       | Priority | Action                                                                    | Done when                                                                                             |
|----------|----------|---------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| **A-F1** | P2       | Prefer httpOnly cookie session or BFF; minimize localStorage JWT lifetime | **DONE** (cookie-only SPA: JWT only in httpOnly cookie; purge web-storage tokens; user snapshot only) |
| **A-F2** | P2       | Fail loud in `api.js` if backend URL missing                              | **DONE**                                                                                              |
| **A-F3** | P3       | Shared empty/error state component on list pages                          | **DONE** (`ListState.jsx` on Dashboard/Incidents/Review)                                              |
| **A-F4** | P3       | Remove privileged roles from Login signup select                          | **DONE** (analyst-only hint)                                                                          |
| **A-F5** | P3       | Playwright smoke: login, upload, review, settings                         | **DONE** (`frontend/e2e/smoke.spec.js`, `yarn e2e`)                                                   |

---

## 12. Docker / deploy

### Issues

| ID | Issue                                                                     | Sev |
|----|---------------------------------------------------------------------------|-----|
| D1 | Compose backend often uses `MONGO_URL=localhost` → wrong inside container | P0  |
| D2 | Frontend `REACT_APP_BACKEND_URL` baked at build — bad for remote hosts    | P1  |
| D3 | Single uvicorn worker                                                     | P3  |

### Action items

| ID       | Priority | Action                                                                    | Done when                                                   |
|----------|----------|---------------------------------------------------------------------------|-------------------------------------------------------------|
| **A-D1** | P0       | Compose: `MONGO_URL=mongodb://mongodb:27017` override for backend service | `docker compose up` works OOTB                              |
| **A-D2** | P1       | Build-arg / runtime config for API URL                                    | **DONE** (Dockerfile ARG + compose)                         |
| **A-D3** | P3       | Multi-worker only after sticky sessions + shared rate limit (A-A3)        | **DONE** (doc `docs/MULTI_WORKER.md` + `ACTIRA_JOB_WORKER`) |

---

## 13. Tests — coverage gaps

| Area                     | Gap                         | Priority | Action                                                         |
|--------------------------|-----------------------------|----------|----------------------------------------------------------------|
| `auth_throttle`          | No unit tests               | P1       | **A-T1** **DONE** (`test_p1_cache_throttle_queue.py`)          |
| Job SSE                  | `incident_ids` bug untested | P1       | **A-T2** **DONE**                                              |
| `notifications`          | No unit tests               | P1       | **A-T3** **DONE**                                              |
| `job_status`             | Sidecar merge untested      | P2       | **A-T4** **DONE** (`test_wave3_retention_budget_jobstatus.py`) |
| `parsers` / `correlator` | No fixture suite            | P2       | **A-T5** **DONE** (parser suite)                               |
| `pipeline` offline       | ZIP/per-file isolation      | P2       | **A-T6** **DONE** (`test_pipeline_isolation.py`)               |
| Settings merge           | Clear sentinel              | P2       | **A-T7** covered in smoke/hardening                            |
| RBAC matrix              | Incomplete                  | P2       | **A-T8** **DONE** (`test_rbac_matrix.py`)                      |
| Frontend E2E             | Thin                        | P3       | **A-F5** **DONE** (`frontend/e2e/smoke.spec.js`)               |

Existing solid suites: `test_hardening`, `test_golden_benchmark`, `test_vector_rag`, live `backend_test` / smoke.

---

# Consolidated action backlog (ordered)

## Wave 0 — Production safety (P0) — before real data

| ID          | Action                                              | Status                                                                      |
|-------------|-----------------------------------------------------|-----------------------------------------------------------------------------|
| A-S1        | Gate demo user seed to dev only                     | **DONE** (`ENV` + `SEED_DEMO_USERS`)                                        |
| A-S2 / A-A1 | Fail boot on weak JWT in non-dev                    | **DONE** (`auth.py`)                                                        |
| A-S3 / A-N3 | Encrypt-at-rest vault + no prod `.env` secret write | **DONE** (`secret_vault` Fernet + skip `.env` unless `SYNC_SECRETS_TO_ENV`) |
| A-N1        | Default email HTTP gateway **off** outside dev      | **DONE**                                                                    |
| A-D1        | Compose `MONGO_URL=mongodb://mongodb:27017`         | **DONE**                                                                    |

## Wave 1 — Correctness & security (P1)

| ID          | Action                                                    | Status                                                                 |
|-------------|-----------------------------------------------------------|------------------------------------------------------------------------|
| A-S4        | Fix job SSE `incident_ids`                                | **DONE**                                                               |
| A-S5        | Protect `/metrics`                                        | **DONE** (JWT or `X-Metrics-Token`)                                    |
| A-S6        | JWT role re-bind from DB                                  | **DONE** (`set_user_loader`)                                           |
| A-S7        | Durable job queue                                         | **DONE** (`job_queue.py` Mongo claim + disk payloads + startup worker) |
| A-A2        | Password policy                                           | **DONE** (12+ letter+number)                                           |
| A-P1 / A-E4 | Wire correlation window                                   | **DONE** (`correlate_events(window_minutes=…)`)                        |
| A-P2        | IoC enrich caps                                           | **DONE** (default 50)                                                  |
| A-M1 / A-L1 | Settings honesty (temp, budget, retention, cache, window) | **DONE**                                                               |
| A-E1        | Prod unscored TI without keys                             | **DONE**                                                               |
| A-E2        | Enrichment cache + TTL                                    | **DONE** (memory + Mongo `enrichment_cache`)                           |
| A-L2        | Normalize playbook phases                                 | **DONE**                                                               |
| A-L3        | Fallback HiTL force                                       | **DONE**                                                               |
| A-K1        | SBERT prod guidance                                       | **DONE** (Knowledge page tip + reindex)                                |
| A-N2        | Gitignore outbox/sidecars                                 | **DONE**                                                               |
| A-T1–T3     | Unit tests throttle/SSE/notifications                     | **DONE** (`tests/test_p1_cache_throttle_queue.py`)                     |

## Wave 2 — Quality & scale (P2)

| ID       | Action                                           | Status                                                 |
|----------|--------------------------------------------------|--------------------------------------------------------|
| A-S8–S10 | Email normalize, unique index, golden admin-only | **DONE**                                               |
| A-P3–P4  | Filename + sidecar retention                     | **DONE**                                               |
| A-L3–L4  | Fallback HiTL / prompt redaction                 | **DONE** (`llm_redact_iocs` setting)                   |
| A-E3–E5  | Private IPs; parser tests                        | **DONE**                                               |
| A-K2–K3  | KB admin ingest / safe vector delete             | **DONE**                                               |
| A-H1–H2  | Analytics aggregation                            | **DONE** (H2: `mongo_util` datetime dump + dual match) |
| A-G1–G2  | Live LLM golden; env isolation                   | **DONE** (API + Golden Eval UI toggle)                 |
| A-F1–F2  | Session hardening; backend URL guard             | **DONE** (F1: cookie-only SPA; F2: URL guard)          |
| A-D2     | Frontend API URL for deploys                     | **DONE**                                               |
| A-T4–T8  | Broader unit/RBAC tests                          | **DONE** (T4–T8)                                       |

## Wave 3 — Polish (P3)

| ID                 | Action                                | Status                                                       |
|--------------------|---------------------------------------|--------------------------------------------------------------|
| A-S11              | Logout cookie clear                   | **DONE**                                                     |
| A-A4               | Throttle collection purge             | **DONE** (startup purge)                                     |
| A-P5 / A-M3        | Schema formalize                      | **DONE** (Incident correlation/files_meta; UserCreatePublic) |
| A-L5 / A-K4 / A-G3 | All **DONE**                          | **DONE**                                                     |
| A-F3–F5            | Empty states; register UI; Playwright | **DONE** (F5: `frontend/e2e/smoke.spec.js` + `yarn e2e`)     |
| A-D3               | Multi-worker carefully                | **DONE** (docs + env flag)                                   |

## Roadmap coverage map (seed ↔ backlog)

Items are **batched by wave** in `backend/roadmap_data.py` (not one card per A-* ID). Status after **2026-07-20**
residual close-out:

| Seed ID                        | Status             | Covers                                                                       |
|--------------------------------|--------------------|------------------------------------------------------------------------------|
| `rm-review-wave0-prod-safety`  | **completed** 100% | A-S1, A-S2/A-A1, A-S3 (.env gate), A-N1, A-D1                                |
| `rm-review-wave1-correctness`  | **completed** 100% | A-S4–S7, A-A2, A-P1–P2, A-E1–E2, A-L1–L3, A-K1, A-N2, A-T1–T3                |
| `rm-attack-drilldown`          | **completed** 100% | A-K4                                                                         |
| `rm-review-wave2-quality`      | **completed** 100% | A-S8–S10, A-P3–P4, A-L4, A-E3–E5, A-K2–K3, A-H1, A-G2, A-F2, A-D2, A-T4–T5   |
| `rm-review-wave3-polish`       | **completed** 100% | A-S11, A-A4, A-P5, A-M3, A-L5, A-G3, A-F3–F4, A-D3, retention/budget         |
| `rm-pipeline-hung-resume`      | **completed** 100% | Job startup reclaim + resume API/UI                                          |
| `rm-investigator-llm-fallback` | **completed** 100% | Investigator SSE Bearer + fallback UX                                        |
| `rm-rbac-golden-roadmap`       | **completed** 100% | Golden admin nav; Roadmap canAdmin                                           |
| `rm-review-residual-open`      | **completed** 100% | A-F5, A-T6, A-T8, A-F1 (sessionStorage dual), A-H2                           |
| `rm-enh-live-llm-golden-ui`    | **completed** 100% | A-G1 API + UI toggle + cost confirm                                          |
| `rm-enh-payload-secret-redact` | **completed** 100% | Scrub meta secrets; re-hydrate at claim                                      |
| `rm-review-deferred-close`     | **completed** 100% | A-S3 vault encrypt-at-rest, A-A3 multi-worker throttle, A-F1 cookie-only SPA |
| `rm-ops-stretch-close`         | **completed** 100% | External KMS/Vault, multi-node Mongo payloads, auto seed merge               |

**Previously deferred residuals — closed 2026-07-20:**

- **A-S3 full vault** — **DONE**: Fernet encrypt-at-rest + **external backends** (`external_secrets.py`: Hashicorp
  Transit, KV `vault://`, AWS SM `awssm://`); no prod `.env` secret write; job payload scrub.
- **A-A3 multi-worker atomic rate limit** — **DONE**: Mongo atomic rate limit + multi-worker tests.
- **A-F1 pure cookie-only SPA** — **DONE**: JWT only in httpOnly cookie.
- **Multi-node job payloads** — **DONE**: `ACTIRA_JOB_PAYLOAD_BACKEND=mongo` (GridFS + `job_payload_meta`); disk/dual
  still available.
- **Roadmap seed merge** — **DONE**: startup + list auto-insert missing seed IDs and promote seed-completed cards (Admin
  Sync seed still optional for full force).

Weekly-discussion product work (embeddings, LanceDB, Cohere, golden CI, streaming, etc.) remains under `rm-w1-*` /
`rm-w2-*` / `rm-done-*` cards — all **completed**.

### 2026-07-20 product stretch close-out (LoRA fine-tune)

| Item                                   | Resolution                                                                                                                                                                                                                                  |
|----------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `rm-w1-embeddings` t3 Fine-tune / LoRA | **DONE** — `backend/lora_train.py` (corpus from golden pairs + approved playbooks; `linear_lora` numpy adapter; optional `peft` ST path); `ACTIRA_EMBEDDING_BACKEND=lora`; `POST /kb/lora/train` + Knowledge UI; `tests/test_lora_train.py` |

### 2026-07-19 hotfix notes

| Issue                                               | Fix                                                                                              |
|-----------------------------------------------------|--------------------------------------------------------------------------------------------------|
| Hung pipeline after restart                         | `requeue_on_startup` immediately reclaims `queue_state=running`; manual resume API               |
| AI Investigator `? Full LLM analysis not available` | Stream `fetch` now sends `Authorization: Bearer`; fallback shows real reason (missing key, etc.) |
| Golden Eval 403 for analysts                        | Nav restricted to `admin` (API was already A-S10 admin-only)                                     |
| Roadmap senior_reviewer 403 on create/seed          | UI gates create/reseed to admin; task/status edit still senior_reviewer+admin                    |

### 2026-07-20 residual close-out

| Item                  | Resolution                                                                                                                |
|-----------------------|---------------------------------------------------------------------------------------------------------------------------|
| A-T6 / A-T8           | `test_pipeline_isolation.py`, `test_rbac_matrix.py` — fixed PlaybookStep `order`; throttle mock for Mongo source-of-truth |
| A-F5                  | Playwright smoke in `frontend/e2e/`                                                                                       |
| A-F1 / A-H2           | sessionStorage dual-auth; `mongo_util` datetime helpers                                                                   |
| A-G1 UI               | Golden Eval “Live LLM sample” toggle + confirm                                                                            |
| Payload secret redact | `scrub_settings_for_disk` + claim re-hydrate; unit tests                                                                  |
| Roadmap seed          | `rm-review-residual-open`, `rm-enh-live-llm-golden-ui`, `rm-enh-payload-secret-redact` → **completed**                    |

### 2026-07-20 deferred residual close-out (final)

| Item                       | Resolution                                                                                                                                                                              |
|----------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| A-S3 encrypt-at-rest       | `secret_vault.py` Fernet; encrypt on persist / migrate on load; `secrets_vault` on GET settings; tests in `test_secret_vault_auth_residuals.py`; `SECRETS_MASTER_KEY` in `.env.example` |
| A-A3 multi-worker throttle | Atomic `find_one_and_update` tests (shared store, two “workers”); MULTI_WORKER.md A-A3 section                                                                                          |
| A-F1 cookie-only SPA       | Frontend never stores JWT; purge legacy tokens; cookie + `withCredentials` / `credentials:include` only                                                                                 |
| Roadmap seed               | `rm-review-deferred-close` → **completed**                                                                                                                                              |

### 2026-07-20 ops stretch close-out (absolute final)

| Item                     | Resolution                                                                                 |
|--------------------------|--------------------------------------------------------------------------------------------|
| External KMS / Hashicorp | `external_secrets.py` — Transit encrypt, KV refs, AWS SM refs; wired into `secret_vault`   |
| Multi-node job payloads  | `ACTIRA_JOB_PAYLOAD_BACKEND=mongo` (default) GridFS + meta collection; disk/dual supported |
| Roadmap Sync seed        | Auto-merge on startup + first list; force reseed still available for full refresh          |
| Roadmap seed             | `rm-ops-stretch-close` → **completed**                                                     |

**Bottom line:** All MODULE_REVIEW action IDs **and** former ops-stretch pointers are **DONE**. Nothing remains open in
this review document.

---

# Suggested 2-week sprint plan

### Sprint A (prod-ready baseline)

1. A-S1, A-S2, A-N1, A-D1
2. A-S4 (SSE bug — small, high impact)
3. A-S5, A-A2, A-S8, A-S9
4. A-N2 gitignore + docs for secrets

### Sprint B (settings honesty + pipeline)

1. A-M1 triage: implement temperature (A-L1) + enrich cache (A-E2) OR hide unused fields
2. A-P1/A-P2 correlator window + IoC caps
3. A-E1 prod mock policy
4. A-L2 / A-L3 playbook phase + fallback HiTL

### Sprint C (tests + ops)

1. A-T1–T5 offline unit tests
2. A-S6 role re-bind
3. A-S7 job queue spike (design + minimal Arq)
4. A-K1 SBERT path documented in Settings UI

---

# What is already in good shape (do not rework first)

- HiTL race-safe review + pure `hitl_gate` policy
- Register privilege escalation blocked
- Settings secret redaction on GET
- Ingest key constant-time compare
- Offline golden suite (real metrics, mock TI/template playbook — intentional)
- `parse_llm_json` robustness
- Hybrid RAG with BM25 fallback
- Exception/job failure hardening (sidecars, enrich isolation, API error toasts)

---

# Cross-reference: intentional product limits

| Behavior                        | Status                                                   |
|---------------------------------|----------------------------------------------------------|
| Golden all 1.000 scores         | Expected offline regression; not live LLM quality        |
| Demo accounts on login page     | OK for dev; must not seed in prod (A-S1)                 |
| Mock TI by default historically | OK for demos; dangerous if mistaken for live risk (A-E1) |

---

*End of review. Track completion by checking off IDs (A-S1, A-P2, …) in PRs.*
