# ACTIRA — Solution Architecture

## 1. Architectural style

ACTIRA is a **modular monolith**:

- **Single deployable API** (`backend/server.py` + domain modules)
- **Single-page React client**
- **Document store** (MongoDB) for system of record
- **Local vector store** (LanceDB) for dense retrieval
- **Async job worker** in-process (claim/poll via Mongo; multi-worker optional)

### Why modular monolith (not microservices)

| Factor                    | Decision                                                        |
|---------------------------|-----------------------------------------------------------------|
| Team size / product stage | MVP → production candidate; one domain (SOC IR assist)          |
| Consistency               | Incident + job + audit need transactional *logical* consistency |
| Ops cost                  | Compose + single API simpler than 6 services for demos/pilots   |
| Latency                   | Pipeline stages share memory/process without mesh hops          |

**When to split:** multi-tenant MSSP, independent scale of ingest vs LLM, or separate compliance boundary for secrets
vault.

### Patterns in use

| Pattern              | Where                                                  |
|----------------------|--------------------------------------------------------|
| Layered API          | Routes → services/modules → Mongo / LLM / LanceDB      |
| Pipeline / saga-lite | `pipeline.py` + job status phases                      |
| Strategy             | LLM providers, embedders, TI sources, re-rank backends |
| Policy object        | `hitl_gate.decide_incident_status` (pure function)     |
| Repository-ish       | Motor collections via `server` / `mongo_util`          |
| Hexagonal edges      | LLM, TI HTTP, Slack/SMTP, Vault/AWS SM behind helpers  |

**Not used (and not required yet):** full CQRS/event sourcing, service mesh, multi-region active-active.

---

## 2. Context diagram

```
                    ┌──────────────────┐
   Analyst/Reviewer │  React SPA :3000 │
                    └────────┬─────────┘
                             │ HTTPS / cookie JWT
                    ┌────────▼─────────┐
   SIEM / FluentBit │  FastAPI :8001   │◄── Admin Settings
                    │  /api/*          │
                    └───┬─────┬────┬───┘
           MongoDB      │     │    │   LLM providers
           :27017  ◄────┘     │    └──► Anthropic/OpenAI/Gemini/Groq
                              │
                    LanceDB (local files)   TI APIs (optional)
                    backend/data/lancedb    AbuseIPDB, VT, …
```

---

## 3. Logical components

| Component   | Path                                                                   | Responsibility                                   |
|-------------|------------------------------------------------------------------------|--------------------------------------------------|
| API surface | `server.py` + `routers/*`                                              | HTTP app + domain routers (`/api` and `/api/v1`) |
| Auth        | `auth.py`, `auth_throttle.py`                                          | JWT, bcrypt, lockout, role gates                 |
| Models      | `models.py`                                                            | Pydantic contracts                               |
| Pipeline    | `pipeline.py`, `job_queue.py`, `job_status.py`                         | Orchestration & durability                       |
| Parse / CES | `parsers.py`                                                           | Multi-format normalization                       |
| IoC         | `ioc_extractor.py`                                                     | Extraction & dedup                               |
| Enrichment  | `enrichment.py`, `enrichment_cache.py`                                 | TI scoring + cache                               |
| Correlate   | `correlator.py`                                                        | Cross-file attack chain                          |
| ATT&CK      | `attack_mapping.py`, `attack_catalog.py`                               | Technique inference                              |
| RAG         | `knowledge_base.py`, `vector_store.py`, `embeddings.py`, `reranker.py` | Hybrid search                                    |
| Agents      | `playbook_agent.py`, `ai_investigator.py`                              | LLM generation / Q&A                             |
| LLM         | `llm_provider.py`, `llm_usage.py`                                      | Providers, parse, budget                         |
| HiTL        | `hitl_gate.py`                                                         | Status policy                                    |
| Secrets     | `secrets_util.py`, `secret_vault.py`, `external_secrets.py`            | Resolve & encrypt                                |
| Notify      | `notifications.py`                                                     | Slack / email                                    |
| Retention   | `retention.py`                                                         | Incident TTL jobs                                |
| Eval        | `golden_eval.py`, `retrieval_eval.py`                                  | Offline quality                                  |

---

## 4. Data model (Mongo collections)

| Collection                   | Purpose                                         |
|------------------------------|-------------------------------------------------|
| `users`                      | Accounts, roles, password hashes                |
| `incidents`                  | Narrative, IoCs, techniques, playbook, status   |
| `log_jobs`                   | Pipeline progress, payloads refs                |
| `settings`                   | Global ops + encrypted secrets (`id=global`)    |
| `audit_log`                  | Security-relevant actions                       |
| `kb_docs`                    | Custom KB documents                             |
| `roadmap`                    | Product roadmap items (in-app)                  |
| throttle / cache collections | Login limits, enrichment cache (as implemented) |

LanceDB tables: `kb_chunks`, `incidents`.

---

## 5. Runtime topology

### Single worker (default lab)

```
uvicorn (1 process) ──► in-process job worker loop
                     ──► Motor → Mongo
                     ──► LanceDB files
```

### Multi-worker (ops stretch)

See [MULTI_WORKER.md](MULTI_WORKER.md): job claim via Mongo, payload backend `mongo|disk|dual`, one logical worker
leader caution for in-process side effects.

---

## 6. Scalability & resilience

| Concern        | Current                                       | Gap for enterprise                            |
|----------------|-----------------------------------------------|-----------------------------------------------|
| Horizontal API | Possible with sticky care / multi-worker docs | No K8s Helm chart                             |
| Job durability | Mongo job + payload options                   | No DLQ UI productization                      |
| Mongo HA       | Operator-provided                             | Compose is single node                        |
| LLM outage     | Template/fallback playbooks → force HiTL      | No circuit breaker dashboard                  |
| Vector HA      | Local disk                                    | Not shared across nodes without shared volume |
| DR             | Backup Mongo volume + reindex vectors         | No formal RPO/RTO runbook SLA                 |

---

## 7. Architectural smells & recommendations

| Smell                                | Severity              | Recommendation                                                                                     |
|--------------------------------------|-----------------------|----------------------------------------------------------------------------------------------------|
| ~~`server.py` ~2.6k LOC god module~~ | **Mitigated (v1.1)**  | Domain routers in `backend/routers/`; `server.py` is app shell. Next: thin fat routers (settings). |
| In-process agent + API coupling      | Medium                | Keep; extract `services/` package for pure domain logic                                            |
| Dual config (.env + Mongo settings)  | Medium (by design)    | Document clearly; prefer Mongo runtime, .env bootstrap only                                        |
| Hash embedder default                | Medium (quality)      | Default to sbert in “quality” profile; keep hash for CI                                            |
| No API versioning (`/api/v1`)        | Medium                | Introduce `/api/v1` alias before external consumers                                                |
| Single global settings               | High for multi-tenant | Tenant isolation is a product boundary change                                                      |

### Target modular layout (recommended)

```
backend/
  app/
    main.py              # FastAPI factory + lifespan
    api/
      auth.py
      incidents.py
      logs.py
      review.py
      settings.py
      kb.py
      eval.py
    domain/
      pipeline/
      hitl/
      ioc/
    infrastructure/
      mongo.py
      vector/
      llm/
      secrets/
  tests/
```

Migration can be incremental (router extract first) without changing external URLs.

---

## 8. Multi-cloud readiness

| Cloud concern            | Status                                             |
|--------------------------|----------------------------------------------------|
| Portable containers      | Yes (Dockerfile + compose)                         |
| Managed Mongo            | Atlas-compatible `MONGO_URL`                       |
| Secret stores            | Vault + AWS SM references implemented              |
| Azure Key Vault / GCP SM | Not first-class                                    |
| IaC (Terraform/Bicep)    | Not present                                        |
| Observability exporters  | `/metrics` + structured logs; no OTEL exporter yet |

**Positioning:** cloud-portable **application**, not a multi-cloud **platform product**.

---

## 9. Decision log (selected)

1. **LanceDB over Chroma** — embedded, zero-ops local ANN; hybrid already implemented; dual vector DBs add drift without
   quality gain at current corpus size.
2. **HiTL pure policy** — testable, race-safe with conditional Mongo updates.
3. **Mock TI by default** — CI and demos never require live keys.
4. **Cookie-first SPA auth** — reduces XSS token theft vs long-lived localStorage (Bearer optional for API clients).
