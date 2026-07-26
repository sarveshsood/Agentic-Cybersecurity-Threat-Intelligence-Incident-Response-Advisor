# ACTIRA — Master Roadmap (tracking)

**Last updated:** 2026-07-26  
**Board maturity:** Enterprise Demonstration Ready · **~89–90/100**  
**In-app roadmap:** Admin/analyst UI **Roadmap** page (seeded from `backend/roadmap_data.py` — auto-merges new IDs on
API start)

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

| Version  | Theme                                                       | Status                    |
|----------|-------------------------------------------------------------|---------------------------|
| **v0.x** | Core product + weekly engineering (pre-board)               | ✅ Done (see in-app seed) |
| **v1.0** | Enterprise Demonstration Ready (docs, ops, governance pack) | ✅ Done                   |
| **v1.1** | Modular API + `/api/v1` + capstone UX polish                | ✅ Done                   |
| **v1.2** | Enterprise identity (OIDC / SSO / MFA)                      | 🔄 Scaffold (OIDC in)     |
| **v1.3** | Observability, HA evidence, load tests                      | ✅ Mostly done (+ OTLP)   |
| **v1.4** | Investigation Command Center (Workspace MVP)                | 🔄 In progress (PR #8)            |
| **v2.0** | Multi-tenant + commercial pilot readiness                   | 🔮 Future                 |

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
| F-02 | MFA (IdP-enforced preferred)                  | Auth strength       | P0       | 📋 Planned (via IdP) |
| F-03 | IdP groups → ACTIRA roles                     | RBAC from directory | P1       | 🔄 Partial (`OIDC_GROUP_ROLE_MAP` / role claim) |
| F-04 | Cookie/session integration with SSO           | SPA continuity      | P1       | 🔄 Partial (same cookie as password login) |
| F-05 | Disable public register in enterprise profile | Security default    | P1       | ✅ Auto when OIDC on or ENV=prod/staging; override via `ALLOW_PUBLIC_REGISTER` |

---

## G. v1.3 Observability & HA

| ID   | Activity                                   | Outcome                       | Priority | Status |
|------|--------------------------------------------|-------------------------------|----------|--------|
| G-01 | OpenTelemetry instrumentation              | Traces (API + pipeline + LLM) | P0       | 🔄 Stage timings + optional OTLP hook (`otel_setup.py`); deep auto-instrument later |
| G-02 | Multi-replica / stateless validation       | HA story                      | P1       | ✅ |
| G-03 | Load tests 10 / 100+ with published report | Performance evidence          | P1       | ✅ |
| G-04 | Helm values for prod-like installs         | Ops packaging                 | P2       | ✅ |
| G-05 | Production dashboards (beyond skeletons)   | SRE visibility                | P2       | 📋 Planned |
| G-06 | Global API rate-limit dashboard / metrics  | Abuse resistance              | P2       | 📋 Planned |

---

## H. Future — v2.0 Multi-tenant / commercial

| ID   | Activity                                        | Outcome                                  | Priority |
|------|-------------------------------------------------|------------------------------------------|----------|
| H-01 | `org_id` isolation on all docs                  | Multi-customer                           | P0       |
| H-02 | Per-tenant settings & secrets                   | Safe multi-org                           | P0       |
| H-03 | Scale + pen-test evidence pack                  | Sales diligence                          | P1       |
| H-04 | SOAR actions (separate human approval)          | Close-loop IR                            | P2       |
| H-05 | Multi-incident fan-out (1 upload → N incidents) | Optional product; **not** current design | P3       |
| H-06 | Native SIEM stream connectors                   | Ingest breadth                           | P3       |
| H-07 | In-app notification center / comments / assign  | Collaboration                            | P2       |
| H-08 | Saved filters / workspaces / pins               | Analyst productivity                     | P2       |

---

## I. Explicit non-goals (v1.x)

| ID   | Non-goal                                                                            |
|------|-------------------------------------------------------------------------------------|
| N-01 | Replace Microsoft Sentinel / Splunk ES / QRadar / Cortex XSOAR / CrowdStrike Falcon |
| N-02 | Dual vector DB (Chroma + Lance) without multi-node product need                     |
| N-03 | Unconstrained multi-agent swarms without HiTL                                       |
| N-04 | Expand documentation for its own sake                                               |
| N-05 | Claim multi-incident fan-out while pipeline is single-incident                      |

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

1. **Weekly:** move rows from Planned → Done; note PR/commit.
2. **In-app Roadmap:** restart API after updating `roadmap_data.py` so new seed IDs auto-merge (or Admin → Sync seed).
3. **Capstone / interview:** point to sections **B–D** (completed this program) + **J** (validation).
4. **Next sprint (product):** **v1.4 Investigation Workspace** (Wave A — timeline, RCA, entity graph, notebook, assistant).  
5. **Parallel hardening:** live IdP for OIDC, deeper OTEL spans, optional demo tags/video (**E-01/E-02**).

---

## M. Vision waves (Agentic SOC Command Center)

See full narrative in `docs/product/VISION.md`. Engineering mapping:

| Wave | Version | Focus | Status |
|------|---------|--------|--------|
| **Foundation** | v0–v1.3 | Pipeline, RAG, HiTL, modular API, OIDC/OTEL scaffolds | ✅ / 🔄 |
| **A** | **v1.4** | Investigation Workspace MVP (case hub, timeline, RCA, graph, notes, assistant) | 🔄 Implementing — see design + PR #8 |
| **B** | v1.5 | Advanced analytics & NL hunting; broader evidence formats | 📋 Planned |
| **C** | v1.6 | Compliance automation + audit intelligence | 📋 Planned |
| **D** | v1.7 | Multi-agent roster UX + executive dashboard | 📋 Planned |
| **E** | v2.x | Connectors, multi-tenant, commercial scale | 🔮 Future |

---

## L. Related artifacts

| Artifact                | Path                                          |
|-------------------------|-----------------------------------------------|
| In-app seed             | `backend/roadmap_data.py`                     |
| Enterprise board report | `docs/ENTERPRISE_REVIEW.md`                   |
| Capstone UX review      | `docs/product/CAPSTONE_ENHANCEMENT_REVIEW.md` |
| E2E capability truth    | `docs/product/E2E_CAPABILITY_MATRIX.md`       |
| Backend structure       | `docs/dx/BACKEND_STRUCTURE.md`                |
| Release notes           | `RELEASE_NOTES.md`                            |
| Changelog               | `CHANGELOG.md`                                |
| Doc index               | `DOCUMENTATION_INDEX.md`                      |
