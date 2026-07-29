# ACTIRA — Master Roadmap (tracking)

**Last updated:** 2026-07-27 (H-07/H-08 PR plan tracking)  
**Demo packaging maturity:** Enterprise Demonstration Ready · **~89–90/100**  
**Production pilot maturity:** Enterprise Pilot Ready · **~76/100** (see board report)  
**In-app roadmap:** Admin/analyst UI **Roadmap** page (seeded from `backend/roadmap_data.py` — auto-merges new IDs
and promotes seed-`completed` cards on API start)

Use this file for **management tracking**. Status legend:

| Status      | Meaning                                            |
|-------------|----------------------------------------------------|
| ✅ Done     | Shipped and validated                              |
| 🔄 Optional | Done product-wise; optional packaging (tags/video) |
| 📋 Planned  | Committed next versions                            |
| 🔮 Future   | Post-capstone / commercial                         |
| ❌ Non-goal | Explicitly out of scope (v1.x)                     |

---

## Version summary

| Version  | Theme                                                       | Status |
|----------|-------------------------------------------------------------|--------|
| **v0.x** | Core product + weekly engineering (pre-board)               | ✅ Done (in-app seed) |
| **v1.0** | Enterprise Demonstration Ready (docs, ops, governance pack) | ✅ Done |
| **v1.1** | Modular API + `/api/v1` + capstone UX polish + arch layers  | ✅ Done |
| **v1.2** | Enterprise identity (OIDC / SSO / MFA)                      | 🔄 Scaffold (~60%; JWKS/prod hardening open) |
| **v1.3** | Observability, HA evidence, load tests, Helm 1.1            | ✅ Done (dashboards stretch → planned) |
| **v1.4** | Investigation Command Center (Workspace MVP)                | ✅ Done (PR #8) |
| **v1.5** | NL hunting + behavioral analytics + broader parsers         | ✅ Done |
| **v1.6** | Compliance automation + audit intelligence + LLM resilience | ✅ Done |
| **v1.7** | Multi-agent roster UX + executive dashboard + tech polish   | 🔄 ~90% (Settings mega-split stretch) |
| **v2.0** | Multi-tenant + connectors + collab/productivity (H-07/H-08) | 🔮 Future · H-07/H-08 **~9%** (PR-1 ✅) |

**Product vision:** [docs/product/VISION.md](docs/product/VISION.md) — Agentic AI SOC Command Center.

---

## A. Completed — product foundation (historical / v0.x)

Tracked in detail in **Roadmap UI** and `roadmap_data.py` (25+ seed cards). Summary:

| Area                  | Activities                                                                     | Status |
|-----------------------|--------------------------------------------------------------------------------|--------|
| **Ingest & pipeline** | Multi-format parsers, batch/ZIP, job queue, correlation, hung-job resume       | ✅     |
| **IoC & TI**          | Extract + enrich (mock/live), enrichment cache                                 | ✅     |
| **ATT&CK**            | Heuristic mapping, catalog, heatmap + full-catalog coverage matrix             | ✅     |
| **Ingest (stretch)**  | EVTX magic detect + optional `python-evtx` parse scaffold                      | 🔄     |
| **RAG**               | BM25, LanceDB, hybrid RRF, Cohere re-rank, LoRA train path                     | ✅     |
| **LLM**               | Multi-provider playbooks, citations, grounding, prompt cache, investigator SSE | ✅     |
| **HiTL**              | Severity + grounding gates, atomic review (409), RBAC                          | ✅     |
| **Auth**              | JWT, cookie-first SPA, lockout/throttle, password policy, register=analyst     | ✅     |
| **Secrets**           | Settings `has_*`, Fernet vault, optional Vault/AWS refs                        | ✅     |
| **Eval / CI**         | Golden dataset, golden-ci, OpenAPI export, Playwright smoke                    | ✅     |
| **UX**                | Dashboard, analytics, knowledge, settings, review queue                        | ✅     |

---

## B. Completed — this engagement (v1.0 board pack)

| ID   | Activity                                        | Outcome                                        | Status |
|------|-------------------------------------------------|------------------------------------------------|--------|
| B-01 | Project diagnosis (app down / `.env`)           | Backend start; Mongo+API health                | ✅     |
| B-02 | Architecture decision: no ChromaDB              | Keep LanceDB hybrid RAG                        | ✅     |
| B-03 | Enterprise Review Board report                  | Scorecard 72→89; risks; gates                  | ✅     |
| B-04 | Project overview + system/agent design docs     | `docs/PROJECT_OVERVIEW.md`, architecture suite | ✅     |
| B-05 | Threat model + security policy alignment        | `docs/THREAT_MODEL.md`, `SECURITY.md`          | ✅     |
| B-06 | Configuration / install / deploy / ops runbooks | `CONFIGURATION`, `DEPLOYMENT`, `OPERATIONS_*`  | ✅     |
| B-07 | Demo script + FAQ + troubleshooting             | Demo readiness                                 | ✅     |
| B-08 | Executive presentation package                  | `presentation/` (8 decks)                      | ✅     |
| B-09 | Visual architecture (Mermaid)                   | `diagrams/` (16 diagrams)                      | ✅     |
| B-10 | DX pack + ADRs                                  | `docs/dx/`, `docs/adr/`                        | ✅     |
| B-11 | Production ops pack                             | Backup, DR, scaling, hardening, …              | ✅     |
| B-12 | AI governance pack                              | Model/prompt/eval/hallucination/RAI            | ✅     |
| B-13 | Compliance mappings                             | ISO/NIST/CIS/OWASP/ATT&CK/SOC2/GDPR notes      | ✅     |
| B-14 | Business readiness pack                         | Vision, SWOT, ROI, personas, pricing           | ✅     |
| B-15 | Enterprise packaging                            | K8s manifests, Helm, cloud runbooks            | ✅     |
| B-16 | API professionalization                         | Postman, Bruno, Insomnia, SDK examples         | ✅     |
| B-17 | Benchmarks harness                              | `benchmarks/run_benchmarks.py` + baselines     | ✅     |
| B-18 | Demo samples & personas                         | `samples/`                                     | ✅     |
| B-19 | Monitoring skeletons                            | Prometheus/Grafana examples                    | ✅     |
| B-20 | Repo professionalism                            | Issue/PR templates, CODEOWNERS, CoC, SUPPORT   | ✅     |
| B-21 | One-command demo scripts                        | `scripts/start-demo.ps1` / `.sh`               | ✅     |
| B-22 | Documentation index (root + docs)               | Navigation for evaluators                      | ✅     |

---

## C. Completed — v1.1 modularization

| ID   | Activity                      | Outcome                                | Status |
|------|-------------------------------|----------------------------------------|--------|
| C-01 | Extract domain routers        | `backend/routers/*`                    | ✅     |
| C-02 | Core database + services      | `core/database.py`, `core/services.py` | ✅     |
| C-03 | Slim `server.py` app shell    | Lifespan, middleware, CORS             | ✅     |
| C-04 | Dual mount `/api` + `/api/v1` | Parity, non-breaking                   | ✅     |
| C-05 | Import cleanup (ruff F401)    | Maintainability                        | ✅     |
| C-06 | Modularization tests          | `tests/test_modular_api_v1.py`         | ✅     |
| C-07 | OpenAPI regenerate            | `docs/openapi.json` includes v1 paths  | ✅     |
| C-08 | Structure docs                | `docs/dx/BACKEND_STRUCTURE.md`         | ✅     |
| C-09 | E2E capability matrix         | Product truth (1 job → 1 incident)     | ✅     |
| C-10 | Offline unit suite            | 142 passed (ignore live-only suites)   | ✅     |

---

## D. Completed — capstone UX polish (non-breaking)

| ID   | Activity                        | Outcome                                        | Status |
|------|---------------------------------|------------------------------------------------|--------|
| D-01 | Command palette (Ctrl/⌘K)       | Navigate + discover                            | ✅     |
| D-02 | Recent incidents (localStorage) | Resume context                                 | ✅     |
| D-03 | Dashboard quick actions         | Fewer clicks                                   | ✅     |
| D-04 | List loading skeletons          | Better loading UX                              | ✅     |
| D-05 | Security response headers       | nosniff, DENY frame, referrer, permissions     | ✅     |
| D-06 | GoldenBenchmark hooks lint      | Frontend CI/build green                        | ✅     |
| D-07 | Playwright smoke expansion      | Palette + quick actions; **6/6 e2e**           | ✅     |
| D-08 | Capstone enhancement review     | `docs/product/CAPSTONE_ENHANCEMENT_REVIEW.md`  | ✅     |
| D-09 | Hygiene                         | gitignore `.bak`; remove modularization backup | ✅     |

---

## E. Optional packaging (not required to claim “done”)

| ID   | Activity                              | Why                          | Status      |
|------|---------------------------------------|------------------------------|-------------|
| E-01 | Git tag `v1.0.0` / `v1.1.0`           | Portfolio / release artifact | 🔄 Optional |
| E-02 | Demo video (5–8 min)                  | Interview / CXO proof        | 🔄 Optional |
| E-03 | Public or private hosted demo         | Always-on showcase           | 🔄 Optional |
| E-04 | Live `backend_test.py` on :8003       | Full integration suite       | 🔄 Optional |
| E-05 | Secret history scan before public OSS | Safety                       | 🔄 Optional |
| E-06 | Further thin `routers/settings.py`    | Maintainability polish       | 🔄 Optional |

---

## F. v1.2 Enterprise identity

| ID   | Activity                                      | Outcome             | Priority | Status |
|------|-----------------------------------------------|---------------------|----------|--------|
| F-01 | OIDC SSO (Entra ID / Okta / Keycloak)         | Enterprise login    | P0       | 🔄 Scaffold (PKCE + routes + Login CTA; env-gated) |
| F-02 | MFA (IdP-enforced preferred)                  | Auth strength       | P0       | 🔄 Customer IdP + docs; optional local TOTP (`FEATURE_MFA`); `OIDC_REQUIRE_MFA` |
| F-03 | IdP groups → ACTIRA roles                     | RBAC from directory | P1       | 🔄 Partial (`OIDC_GROUP_ROLE_MAP` / role claim) |
| F-04 | Cookie/session integration with SSO           | SPA continuity      | P1       | 🔄 Partial (same cookie as password login) |
| F-05 | Disable public register in enterprise profile | Security default    | P1       | ✅ Auto when OIDC on or ENV=prod/staging; override via `ALLOW_PUBLIC_REGISTER` |

---

## G. v1.3 Observability & HA

| ID   | Activity                                   | Outcome                       | Priority | Status |
|------|--------------------------------------------|-------------------------------|----------|--------|
| G-01 | OpenTelemetry instrumentation              | Stage timings + OTLP soft-dep | P0       | ✅ Core done; deep auto-instrument → **T-05** |
| G-02 | Multi-replica / stateless validation       | HA story                      | P1       | ✅ |
| G-03 | Load tests 10 / 100+ with published report | Performance evidence          | P1       | ✅ |
| G-04 | Helm values for prod-like installs         | Ops packaging                 | P2       | ✅ |
| G-05 | Production dashboards (beyond skeletons)   | SRE visibility                | P2       | 📋 → **T-05** (no duplicate row) |
| G-06 | Global API rate-limit dashboard / metrics  | Abuse resistance              | P2       | 📋 → **T-02** (no duplicate row) |

---

## G2. Completed — v1.4 Investigation Workspace (Wave A)

| ID    | Activity                         | Outcome                                      | Status |
|-------|----------------------------------|----------------------------------------------|--------|
| W4-01 | Workspace design + vision        | `INVESTIGATION_WORKSPACE_DESIGN.md`          | ✅     |
| W4-02 | Timeline / graph / notes APIs    | Pure builders + HTTP surface                 | ✅     |
| W4-03 | RCA narrative                    | Budget-aware RCA with fallback               | ✅     |
| W4-04 | Tabbed case hub UI               | Timeline, graph, notebook, assistant tabs    | ✅     |
| W4-05 | Prompt-injection framing         | Untrusted-note controls on assistant         | ✅     |

In-app seed: `rm-v1-4-investigation-workspace`.

---

## G3. Completed — v1.5 NL hunting & parsers (Wave B)

| ID    | Activity                              | Outcome                                   | Status |
|-------|---------------------------------------|-------------------------------------------|--------|
| W5-01 | NL threat hunting                     | Rule-based intents + Hunt page            | ✅     |
| W5-02 | Behavioral analytics                  | Beacon, login burst, multi-host, LOLBin, DNS | ✅  |
| W5-03 | Broader parsers                       | Suricata EVE / Zeek / Defender / Sysmon   | ✅     |
| W5-04 | Workspace behavior surface            | `BehaviorPanel`                           | ✅     |

In-app seed: `rm-v1-5-hunt-behavior-parsers`.

---

## G4. Completed — v1.6 Compliance & audit intelligence (Wave C)

| ID    | Activity                                      | Outcome                         | Status |
|-------|-----------------------------------------------|---------------------------------|--------|
| W6-01 | Compliance score / gaps / evidence pack       | Runtime product-alignment score | ✅     |
| W6-02 | Audit intelligence + integrity chain          | Summary + SHA-256 chain         | ✅     |
| W6-03 | Executive export + free/paid LLM catalog      | Board export + multi-provider   | ✅     |
| W6-04 | Cross-provider fallback + LLM resilience      | Retries + chain + last-effective| ✅     |
| W6-05 | Merge DoD + OpenAPI + certification messaging | Score ≠ ISO/SOC2 cert (UI+API)  | ✅     |

In-app seed: `rm-v1-6-compliance-audit-llm` (completed). Capstone pack: `rm-capstone-deliverables` ✅.

**W6-04 details:** retriable vs permanent error classification; primary retries; settings-gated
cross-provider fallback order; `record_effective_llm` / Settings “last effective” strip;
offline tests in `test_llm_fallback_catalog.py`.

**W6-05 details:** Compliance API/UI disclaimer (alignment ≠ certification); executive export
carries the same disclaimer; OpenAPI snapshot refreshed; FEATURE_INVENTORY + roadmap seeds
aligned; DoD closed for Wave C merge.

---

## G5. Completed — architecture layers & board (2026-07-26)

| ID    | Activity                                         | Status |
|-------|--------------------------------------------------|--------|
| A-P0  | Import stabilization + ready/version probes      | ✅     |
| A-P1  | Services / repositories layering                 | ✅     |
| A-P2  | Analytics `$facet` KPIs + TTL cache + indexes    | ✅     |
| A-P3  | Dashboard LLM budget KPI + pipeline stage timings| ✅     |
| A-BR  | 360° Enterprise Review Board report (pilot 76)   | ✅     |

In-app seeds: `rm-arch-p0-p3-layers-analytics`, `rm-enterprise-board-2026-07-26`.

---

## H. Future — v2.0 Multi-tenant / commercial

| ID   | Activity                                        | Outcome                                  | Priority | Status |
|------|-------------------------------------------------|------------------------------------------|----------|--------|
| H-01 | `org_id` isolation on all docs                  | Multi-customer                           | P0       | 📋     |
| H-02 | Per-tenant settings & secrets                   | Safe multi-org                           | P0       | 📋     |
| H-03 | Scale + pen-test evidence pack                  | Sales diligence                          | P1       | 📋     |
| H-04 | SOAR actions (separate human approval)          | Close-loop IR                            | P2       | 📋     |
| H-05 | Multi-incident fan-out (1 upload → N incidents) | Optional product; **not** current design — see **N-05** | P3 | ❌ Non-goal v1.x / optional v2 |
| H-06 | Native SIEM stream connectors                   | Ingest breadth                           | P3       | 📋     |
| H-07 | In-app notification center / comments / assign  | Collaboration                            | P2       | ✅ **MVP** (flags on → APIs + UI) |
| H-08 | Saved filters / workspaces / pins               | Analyst productivity                     | P2       | ✅ **MVP** (saved filters + pins) |

**Design (both):** [`docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md`](docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md)  
**In-app seed:** `rm-v2-h07-h08-collab`  
**Flags (default off):** `FEATURE_COLLAB_ASSIGN`, `FEATURE_COLLAB_COMMENTS`, `FEATURE_NOTIFICATION_CENTER`, `FEATURE_SAVED_FILTERS`, `FEATURE_PINS`  
**Snapshot API:** `GET /api/meta/features` (+ `/api/v1`) · SPA `lib/features.js`

### H-07 Collaboration — detailed sub-tasks

| ID | Sub-task | Depends | Status |
|----|----------|---------|--------|
| **H-07-D** | Design doc (KD-1…14, PR plan, security) | — | ✅ |
| **H-07-PR1** | Feature flags: `feature_flags.py`, `GET /meta/features`, `require_feature` → 404, SPA `loadFeatures`, tests, OpenAPI | — | ✅ (PR #13) |
| **H-07-PR1a** | Env docs (CONFIGURATION, `.env.example`) for five `FEATURE_*` vars | H-07-PR1 | ✅ |
| **H-07-PR2** | Users public search: `GET /users?q=`, `UserRepository.search_public`, `UserPicker.jsx` + tooltips | — (// PR-1) | 📋 |
| **H-07-PR2a** | RBAC: authenticated users only; return `{id,email,name,role}` (no secrets) | H-07-PR2 | 📋 |
| **H-07-PR3** | Assignment **backend**: incident fields, `$and` filter composition, `assignee=me` / `unassigned`, PATCH assignment, audit, flag gate | H-07-PR1 | 📋 |
| **H-07-PR3a** | Filter matrix unit tests (technique + unassigned + me do not stomp `$or`) | H-07-PR3 | 📋 |
| **H-07-PR3b** | Clear-primary cascades secondary; secondary-without-primary → 400 | H-07-PR3 | 📋 |
| **H-07-PR4** | Assignment **UI**: `AssignPanel`, Incidents assignee column + filters, HelpTips | H-07-PR2, H-07-PR3 | 📋 |
| **H-07-PR5** | Comments **backend**: `incident_comments`, shallow threads, soft-delete, audit, flag gate | H-07-PR1 | 📋 |
| **H-07-PR5a** | Mentions parse → notify recipients (needs inbox or deferred emit) | H-07-PR5 | 📋 |
| **H-07-PR5b** | Comments **UI**: `CommentsPanel` on workspace, Tip/HelpTip, distinct from notebook notes | H-07-PR5 | 📋 |
| **H-07-PR6** | In-app inbox: collection `app_notifications` (≠ outbound `notifications.py`), service, poll API | H-07-PR3, H-07-PR5 | 📋 |
| **H-07-PR6a** | Emitters: assignment change, mention, comment reply, `job_queue.mark_queue_done` | H-07-PR6 | 📋 |
| **H-07-PR6b** | Layout bell + `NotificationCenter` UI + read/mark-read | H-07-PR6 | 📋 |
| **H-07-PR6c** | Retention cascade: purge comments + inbox with incident delete | H-07-PR5, H-07-PR6 | 📋 |
| **H-07-PR11** | Stretch: SSE inbox + optional email digests (outbound adapter) | H-07-PR6 | 🔮 |

### H-08 Productivity — detailed sub-tasks

| ID | Sub-task | Depends | Status |
|----|----------|---------|--------|
| **H-08-D** | Design (saved filters, favorites, prefs; KD-5/6/12) | — | ✅ |
| **H-08-PR1** | Feature flags shared with H-07 (`saved_filters`, `pins`) | H-07-PR1 | ✅ |
| **H-08-PR7** | Saved filters **backend**: validated server fields + `client_only` blob, `is_default` SOT | H-07-PR1 | 📋 |
| **H-08-PR7a** | Saved filters **UI**: `SavedFiltersBar` on Incidents; pagination warning when `client_only` | H-08-PR7 | 📋 |
| **H-08-PR8** | Favorites/pins **backend**: `user_pins`, allowlist `WORKSPACE_TAB_IDS`, retention | H-07-PR1, H-08-PR7* | 📋 |
| **H-08-PR8a** | Favorites **UI**: incident star, Dashboard strip, command palette | H-08-PR8 | 📋 |
| **H-08-PR9** | `user_prefs` server sync (layout); no default-filter denorm | H-07-PR1 | 📋 |
| **H-08-PR10** | OpenAPI final + inventory honesty when surfaces ship | H-07-PR6…H-08-PR9 | 📋 |

\* H-08-PR8 can ship filter-target pins after PR-7; incident/tab pins only need PR-1.

### Implementation PR map (status)

| PR | Title | Tracks | Status |
|----|-------|--------|--------|
| **PR-1** | Feature flags snapshot | H-07-PR1, H-08-PR1 | ✅ Open/merge — [PR #13](https://github.com/sarveshsood/Agentic-Cybersecurity-Threat-Intelligence-Incident-Response-Advisor/pull/13) |
| **PR-2** | Users public search + UserPicker | H-07-PR2 | 📋 Next |
| **PR-3** | Assignment backend | H-07-PR3 | 📋 |
| **PR-4** | Assignment UI | H-07-PR4 | 📋 |
| **PR-5** | Comments backend + UI | H-07-PR5 | 📋 |
| **PR-6** | App notifications inbox | H-07-PR6 | 📋 |
| **PR-7** | Saved filters | H-08-PR7 | 📋 |
| **PR-8** | Favorites / pins | H-08-PR8 | 📋 |
| **PR-9** | User prefs sync | H-08-PR9 | 📋 |
| **PR-10** | Docs / OpenAPI / inventory close-out | H-08-PR10 | 📋 |
| **PR-11** | Stretch SSE + email | H-07-PR11 | 🔮 |

---

## T. Further technical enhancements (shipped 2026-07-26 — deduped)

Single backlog for post-Wave-C engineering. **Do not re-list** OIDC (see §F) or multi-tenant (see §H).  
In-app seeds: `rm-next-trust-qa`, `rm-next-platform-hardening`, `rm-v1-7-agent-roster-exec`  
(old `rm-tech-*` IDs are retired fragments).

| ID   | Activity | Outcome | Priority | Status |
|------|----------|---------|----------|--------|
| T-01 | **Trust UX** — DEMO banners, hard error states, login tokens, mobile nav, palette Audit/Compliance | Never mask empty/fail as healthy | P0 | ✅ |
| T-01b | **Trust UX surface wins** — Hunt filters/honesty, Audit paging + dynamic actions, Analytics cache footer + drill-through, KB hash banner + custom manager, Compliance assumed-vs-verified + live probes | Capstone honesty | P0 | ✅ (2026-07-27) |
| T-02 | **API scale & edge security** — server-side incident pagination, global rate limit + metrics, CSP/HSTS | Internet-ready pilot | P1 | ✅ |
| T-03 | **QA depth** — repair smoke testids; Playwright for workspace / hunt / compliance / audit | CI truth for new surfaces | P1 | ✅ |
| T-04 | **Wave D product** — multi-agent roster UX + executive risk dashboard | Persona command surfaces | P1 | ✅ |
| T-05 | **Prod observability** — Grafana dashboards, deeper OTEL spans, richer Ops Health | SRE beyond skeletons | P2 | ✅ |
| T-06 | **Backend layering** — repos for jobs/KB/roadmap, Settings split, remove bkp facades | Maintainability | P2 | ✅ (~95%; Settings mega-split stretch) |
| T-07 | **AI catalog honesty** — experimental model tags, effective provider after fallback | No speculative oversell | P2 | ✅ |

---

## H2. Enterprise platform track (2026-07-28)

Highest-priority enterprise hardening (in-app seed `rm-enterprise-platform-track`).

| Pri | Initiative | Status | Notes |
|-----|------------|--------|-------|
| P0 | TI API connectivity (keys, SSL, proxy, timeouts) | ✅ | `ti_http.py` + vault keys; `TI_HTTP_*` env |
| P0 | Parallel IoC enrichment + worker pool | ✅ | `ENRICH_CONCURRENCY` (default 8, max 32) |
| P0 | Structured JSON logging + correlation IDs | ✅ | `LOG_FORMAT=json`; rid/user contextvars |
| P0 | Comprehensive audit trail | ✅ partial→expanded | `auth.login`, `pipeline.completed`, settings versions |
| P1 | Enrichment caching | ✅ prior | Mongo + memory TTL |
| P1 | Retries / backoff / circuit breakers | ✅ | TI circuits + LLM retries |
| P1 | Prometheus / Grafana metrics | ✅ | `GET /metrics?format=prometheus` |
| P1 | Per-job artifacts | ✅ opt-in | `JOB_ARTIFACTS_ENABLED=1` |
| P2 | OpenTelemetry depth | ✅ soft | Optional requests/httpx/FastAPI instrument |
| P2 | RabbitMQ/Kafka workers | ❌ non-goal v1.x | Mongo durable queue remains |
| P2 | Append-only config versioning | ✅ | `settings_versions` + `GET /settings/versions` |
| P2 | Investigation timeline + replay | ✅ | Timeline + `/replay` + `/replay-enrich` + artifacts |
| P3 | LLM $ cost analytics | ✅ | `estimated_usd` + `by_provider` + price table |
| P3 | Long-term log archival | ✅ | `LOG_ARCHIVE_*` dated copies + retain purge |
| P3 | Ops anomaly detection | ✅ | Median/MAD + queue/TI/HTTP alerts on Ops Health |
| P2 | AMQP broker workers | ✅ soft | `JOB_BROKER_URL` + pika; Mongo still claims |
| P0/P1 | Audit WORM + SIEM export | ✅ | JSONL append + webhook + export API |
| UX | Replay SPA | ✅ | Upload Replay/Artifacts; Incident Replay enrich |

---

## I. Explicit non-goals (v1.x)

| ID   | Non-goal                                                                            |
|------|-------------------------------------------------------------------------------------|
| N-01 | Replace Microsoft Sentinel / Splunk ES / QRadar / Cortex XSOAR / CrowdStrike Falcon |
| N-02 | Dual vector DB (Chroma + Lance) without multi-node product need                     |
| N-03 | Unconstrained multi-agent swarms without HiTL                                       |
| N-04 | Expand documentation for its own sake                                               |
| N-05 | Claim multi-incident fan-out while pipeline is single-incident                      |
| N-06 | Full Kafka/Celery replacement of Mongo job state (optional AMQP wake-up is enough for v1.x) |

---

## J. Validation baselines (keep green)

| Gate             | Command / check                                                         | Last known    |
|------------------|-------------------------------------------------------------------------|---------------|
| Offline unit     | `pytest tests --ignore=backend_test --ignore=test_smoke_all_areas -n 0` | 142 passed    |
| Modular API      | `pytest tests/test_modular_api_v1.py`                                   | Pass          |
| Frontend build   | `npm run build` (CI=unset locally)                                      | Compiled      |
| Playwright smoke | `npx playwright test e2e/smoke.spec.js`                                 | **6/6**       |
| Health           | `GET /api/health`                                                       | ok + mongo up |
| Golden offline   | `pytest tests/test_golden_benchmark.py`                                 | Pass          |

---

## K. How to use this for management

1. **Weekly:** move rows from Planned → Done; note PR/commit; keep **one** owner card per initiative in the in-app seed (no parallel “same work” cards).
2. **In-app Roadmap:** restart API after updating `roadmap_data.py` so new seed IDs auto-merge and seed-`completed` items promote (or Admin → **Sync seed** with force).
3. **Capstone / interview:** sections **B–D** (program pack) + **G2–G5** (workspace/hunt/compliance/arch) + **J** (validation) + capstone pack under `docs/capstone/`.
4. **Next product sprint:** H-07 **PR-2** (users public search) then assignment backend (**PR-3**); optional OIDC JWKS (**§F**); Settings mega-split stretch (**§T**).
5. **Parallel tracks:** optional tags/video (**§E**); multi-incident fan-out remains **N-05** non-goal for v1.x.

---

## M. Vision waves (Agentic SOC Command Center)

See full narrative in `docs/product/VISION.md`. Engineering mapping (canonical — version table above mirrors this):

| Wave | Version | Focus | Status |
|------|---------|--------|--------|
| **Foundation** | v0–v1.3 | Pipeline, RAG, HiTL, modular API, OIDC/OTEL scaffolds | ✅ / 🔄 OIDC |
| **A** | **v1.4** | Investigation Workspace MVP (case hub, timeline, RCA, graph, notes, assistant) | ✅ Done |
| **B** | **v1.5** | NL hunting, behavioral analytics, broader parsers | ✅ Done |
| **C** | **v1.6** | Compliance automation, audit intelligence, LLM catalog/fallback | ✅ Done |
| **D** | **v1.7** | Multi-agent roster UX + executive dashboard + tech polish (**§T**) | 🔄 ~90% |
| **E** | **v2.x** | Connectors, multi-tenant, collab (H-07/H-08), commercial scale | 🔮 · H-07/H-08 in progress (PR-1 ✅) |

---

## L. Related artifacts

| Artifact                | Path                                          |
|-------------------------|-----------------------------------------------|
| In-app seed             | `backend/roadmap_data.py`                     |
| H-07/H-08 design        | `docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md` |
| Enterprise board (demo) | `docs/ENTERPRISE_REVIEW.md`                   |
| Enterprise board (pilot lens) | `docs/ENTERPRISE_REVIEW_BOARD_2026-07-26.md` |
| Capstone pack           | `docs/capstone/`                              |
| Capstone board review   | `docs/capstone/board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md` |
| Capstone report + PDF   | `docs/capstone/PROJECT_REPORT.md` · `PROJECT_REPORT.pdf` |
| Capstone PPTX           | `docs/capstone/presentation/ACTIRA_Capstone_Presentation.pptx` |
| Capstone demo video     | `docs/capstone/assets/video/` · script `DEMO_VIDEO_5MIN.md` |
| **Product honesty**     | `docs/product/PRODUCT_HONESTY.md` (**T-01 / T-01b** binding) |
| Capstone UX review      | `docs/product/CAPSTONE_ENHANCEMENT_REVIEW.md` |
| Feature inventory       | `docs/product/FEATURE_INVENTORY.md`           |
| E2E capability truth    | `docs/product/E2E_CAPABILITY_MATRIX.md`       |
| Backend structure       | `docs/dx/BACKEND_STRUCTURE.md`                |
| Release notes           | `RELEASE_NOTES.md`                            |
| Changelog               | `CHANGELOG.md`                                |
| Doc index               | `DOCUMENTATION_INDEX.md`                      |

### Submission close (capstone)

| Item | Status |
|------|--------|
| T-01 / T-01b Trust UX surface wins | ✅ |
| PRODUCT_HONESTY + report PDF + PPTX + screenshots | ✅ |
| Stretch: default SBERT, Hunt/Lance hybrid, continuous compliance | 🔮 **Non-blocking** (documented) |
| 5-minute demo video | ✅ UI track in `docs/capstone/assets/video/` + `DEMO_VIDEO_5MIN.md` (optional VO dub) |
