# Changelog

All notable changes to ACTIRA are documented in this file.  
Format inspired by [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **2026-07-26 architecture + analytics close-out (PRs #1–#3 merged to main)**
    - P0 import stabilization; P1 services/repos layering
    - P2 analytics: Mongo `$facet` KPIs, TTL cache, concurrent aggregations, startup indexes
    - P3: Dashboard LLM monthly budget KPI; pipeline stage timings (`stage_timings` / `pipeline_total_ms`)
    - CI fixes: golden dataset shape, OpenAPI, flake8, bandit URL scheme, frontend peer deps
- **Master roadmap tracking** — comprehensive completed + planned work in `ROADMAP.md`; new in-app seed cards in
  `roadmap_data.py` (v1.0 pack, v1.1 modular, UX polish, v1.2/v1.3/v2.0, optional packaging)
- **Capstone UX polish (non-breaking)**
    - Global command palette (Ctrl/⌘K) + recent incidents
    - Dashboard quick-action strip
    - List loading skeletons
    - Baseline security response headers
    - Product review: `docs/product/CAPSTONE_ENHANCEMENT_REVIEW.md`
    - Playwright: palette + quick actions smoke
- **v1.1 backend modularization**
    - Domain routers under `backend/routers/` (auth, logs, incidents, review, analytics, settings, roadmap, investigate,
      audit, kb, eval, meta)
    - Shared `core/database.py` + `core/services.py`
    - Dual mount **`/api`** and **`/api/v1`** (parity)
    - Slim `server.py` app shell (lifespan, middleware, CORS)
    - Tests: `backend/tests/test_modular_api_v1.py`
    - Docs: `docs/dx/BACKEND_STRUCTURE.md`, `docs/product/E2E_CAPABILITY_MATRIX.md`
- **v1.0 Enterprise Demonstration Ready pack**
    - `presentation/` — 8 CXO/technical decks
    - `diagrams/` — 16 Mermaid architecture diagrams
    - `docs/dx/`, `docs/operations/`, `docs/ai-governance/`, `docs/compliance/`, `docs/business/`, `docs/adr/`
    - `deployments/` — Kubernetes manifests, Helm chart, Azure/AWS/GCP runbooks
    - `api/` — Postman, Bruno, Insomnia collections
    - `examples/` — Python & JavaScript clients
    - `benchmarks/` — concurrency harness + lab baseline notes
    - `samples/` — demo personas, logs, speaker notes
    - `monitoring/` — Prometheus/Grafana skeletons
    - `scripts/start-demo.ps1` / `start-demo.sh` — one-command demo
    - Repo professionalism: issue/PR templates, CODEOWNERS, CODE_OF_CONDUCT, SUPPORT, FUNDING
    - Root `DOCUMENTATION_INDEX.md`, `ENTERPRISE_REVIEW.md` pointers
- Prior enterprise documentation suite (overview, architecture, threat model, etc.)
- Root `ROADMAP.md`, `FAQ.md`, `TROUBLESHOOTING.md`

### Changed

- Board score **72 → ~89**; maturity **Enterprise Demonstration Ready (v1.0)**
- README: one-command start, maturity badges, pack links

### Security

- Compliance mapping pack (ISO/NIST/CIS/OWASP/ATT&CK/D3FEND/SOC2/GDPR notes); no crypto primitive change

## [0.9.0] — 2026-07 (approximate product train)

### Added (historical highlights)

- Hybrid RAG (BM25 + LanceDB), Cohere re-rank, LoRA train hooks.
- Secret vault encrypt-at-rest; external Vault/AWS SM references.
- HiTL gate module; atomic review 409.
- Golden offline IR benchmark + CI workflows.
- Job queue worker; retention; analytics; AI investigator.
- Multi-format parsers, batch/ZIP upload, correlation panel.
- GitHub Actions: CI, lint, security, e2e, golden, openapi, release.

## [0.1.0] — initial MVP

- JWT RBAC, pipeline, mock TI, BM25 KB, Claude playbooks, React SOC UI.
