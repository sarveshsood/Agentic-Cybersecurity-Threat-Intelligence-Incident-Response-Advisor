# ACTIRA — 12-Sprint Hardening & Evolution Program

| Field | Value |
|-------|--------|
| **Date** | 2026-07-29 |
| **Status** | Implementation landed (Sprints 2–12 core outcomes) |
| **Scope** | Architecture audit, real-time queue, parallel pipeline, dual fallback, docs, scripts, tests, production |
| **Honesty** | Single-tenant IR advisor — not SIEM/XDR; not A2A multi-agent mesh |
| **Board package** | [ACTIRA_12_SPRINT_BOARD_PACKAGE.md](ACTIRA_12_SPRINT_BOARD_PACKAGE.md) — CXO sections 1–12 + residual roadmap |

This document is the durable source for the sprint program. Product code remains package-rooted at `backend.server:app` and SPA under `frontend/`.

---

## 0. Repo map vs assumed layout

| Assumed path | Actual ACTIRA path |
|--------------|-------------------|
| `api/` | API **clients** (Bruno/Insomnia/Postman) — not the server |
| `workers/` | **No dedicated folder** — `job_queue.py` worker loop inside API process (or multi-replica with `ACTIRA_JOB_WORKER`) |
| `pipelines/` | `backend/pipeline.py` (+ `pipeline_parallel`, `pipeline_trace`, `pipeline_replay`) |
| `prompts/` | Embedded in `playbook_agent.py`, `ai_investigator.py`, `rca.py` (no free-standing prompt pack) |
| `docker/` | Root `docker-compose.yml` + `backend/Dockerfile` + `frontend/Dockerfile` + `deployments/helm` |
| `migrations/` | **None** — Mongo schema-on-read; settings/roadmap seed on boot |
| `config/` | `backend/config/env.py`, `backend/.env`, Settings Mongo + `platform_settings.py` |
| `tools/` | Scattered (`scripts/`, `benchmarks/`, `backend/scripts/`) |

---

### Implementation principles

1. **Incremental** — each sprint ships behind flags / defaults that preserve demo path.
2. **Do not break HiTL** — severity + grounding gates stay non-bypassable.
3. **Pipeline-first agents** — no A2A claim; named stages only.
4. **Dual fallback** — automatic chain + **manual** operator override (provider/model pin).
5. **Windows + Unix first** — scripts dual `.ps1` / `.sh`.

### Dual fallback (requirement)

| Mode | Behavior |
|------|----------|
| **Automatic** | On primary failure, try preferred fallback then `FALLBACK_PROVIDER_ORDER` with keys present (`llm_provider.py`) |
| **Manual** | Operator sets **Manual routing = backup** (`llm_manual_route`) and pins **preferred fallback** (`llm_fallback_provider` + `llm_fallback_model`); **Test primary** / **Test backup** probes each path |

---

## Sprint summary table

| Sprint | Outcome | Status | Primary risk |
|--------|---------|--------|--------------|
| 1 | Audit + cleanup plan | Outline | Scope creep |
| 2 | Docs match code | **Done** — README rewrite | Doc drift again |
| 3 | Dual fallback + model mgmt | **Done** | Catalog vs live providers |
| 4 | Parallel knobs + honesty | **Done** | Over-parallelizing RAG/LLM |
| 5 | Rich queue KPIs + SSE/WS | **Done** + FE consumer | Connection storms |
| 6 | Scripts reliable | **Done** | Docker-only assumptions |
| 7 | Test matrix | **Done** — smoke→functional→security | Flaky live tests |
| 8 | FE quality | **Done** — realtime + dual fallback UX | Time |
| 9 | BE quality | **Done** — WS cookie auth, ops honesty | OpenAPI lag |
| 10 | AI layer | **Done** — dual route probes + `backend/prompts/` pack | Cost / hallucination residual |
| 11 | Cleanup | **Done** — runtime scripts | Accidental delete |
| 12 | Prod readiness | **Done** — secrets, multi-worker, observability pack | Ops complexity |

---

## Sprint 2 — README / docs honesty (**landed**)

- Root [README.md](../../README.md) rewritten to actual layout: `backend.server:app`, no fake `workers/` / `pipelines/` packages.
- Documents dual fallback, parallel parse/enrich pools, realtime ops paths, collab feature flags, healthcheck/bootstrap/cleanup scripts.
- Points to this program doc and collab design.

---

## Sprint 3 — Dual fallback + model management (**landed**)

| Piece | Location |
|-------|----------|
| Preferred fallback model | `Settings.llm_fallback_model` (`backend/models.py`) |
| Manual route pin | `Settings.llm_manual_route` = `primary` \| `backup` |
| Auto chain + route param | `backend/llm_provider.py` → `call_llm(..., route=)` |
| Service | `backend/services/model_management_service.py` — `resolve_routes`, `probe_route`, last probe cache |
| API | `GET /api/settings/llm-routes`, `POST /api/settings/test-llm` body `{route}` |
| UI | Settings → LLM: fallback model, manual routing, Test primary / Test backup, latency chips, one-click save route |
| Shell | Top bar + left sidebar: route health, latency chips, **Use backup** (admin) |
| Versions | `llm_fallback_model`, `llm_manual_route` in `settings_versions` safe snapshot |

---

## Sprint 4 — Parallel pipeline clarity (**landed**)

| Piece | Location |
|-------|----------|
| Helper | `backend/pipeline_parallel.py` — clamp parse 1–16, enrich 1–32 |
| Wiring | `pipeline.py` uses `resolve_parse_concurrency` / `resolve_enrich_concurrency` |
| Honesty | Sequential: correlate · ATT&CK · RAG · playbook · HiTL; parallel: parse_files · enrich_iocs |
| Ops | `GET /ops/status` → `pipeline_parallel` snapshot |
| Docs | README architecture table |

---

## Sprint 5 — Queue KPIs + realtime ops (**landed**)

| Piece | Location |
|-------|----------|
| Rich KPIs | `GET /api/kpis/queue` → `analytics_service.queue_kpis` |
| Dashboard | Layer 1b cards + **LIVE · WS/SSE** channel badge |
| Live charts | Queue trend (7d) + workload bars prefer live `queueKpis` / `status_distribution` |
| SSE | `GET /api/sse/ops` — queue snapshot + heartbeat |
| WebSocket | `WS /api/ws/ops` — cookie/token auth; subscribe / ping |
| FE hook | `frontend/src/hooks/useOpsRealtime.js` — WS → SSE → poll |
| Flag | `FEATURE_REALTIME_OPS` (default on; `0` disables) |

**Still not claimed:** multi-replica pub/sub, durable event log.

---

## Sprint 6 — Scripts (**landed**)

| Script | Role |
|--------|------|
| `scripts/bootstrap-env.ps1` / `.sh` | Create `backend/.env` + `frontend/.env` if missing |
| `scripts/start-demo.ps1` / `.sh` | Full demo bring-up (Docker or local) |
| `scripts/diagnose.ps1` / `.sh` | Local self-check |
| `scripts/healthcheck.ps1` / `.sh` | `/api/health` + `/api/ready` (+ optional `-Deep` / `--deep`) |
| `scripts/cleanup-runtime.ps1` / `.sh` | Wipe job artifacts / payloads / email outbox / log archive (not Mongo) |
| `scripts/quality-gate.ps1` / `.sh` | smoke → functional → security |

---

## Sprint 7 — Quality gates (**landed**)

```text
make smoke          # model mgmt, ops status, vault residuals
make functional     # broader unit (no live LLM)
make security       # tests/security (+ backend security markers)
make quality-gate   # full ladder
```

Docker healthcheck: compose + `backend/Dockerfile` probe `GET /api/health` with `start_period=40s`.

---

## Sprint 12 — Prod path (**landed**)

| Piece | Location |
|-------|----------|
| Secrets master key | `SECRETS_MASTER_KEY` · `secret_vault.vault_status` · ops `secrets_vault` |
| Multi-worker honesty | `docs/MULTI_WORKER.md` · ops `replica_layout` · `broker_honesty` |
| Observability pack | `docs/operations/OBSERVABILITY_PACK.md` · `monitoring/` scrape + rules |

### Non-goals this program does not claim

- Multi-tenant SaaS
- Live SIEM connectors mesh
- Free-form agent-to-agent swarms
- Celery rewrite

---

## Tests

- `backend/tests/test_model_management_queue.py` — fallback chain, routes, parallel clamps, WS cookie helper, probe cache, router registration.

---

## API quick reference (this program)

```
GET  /api/kpis
GET  /api/kpis/queue
GET  /api/settings/llm-routes          # admin
POST /api/settings/test-llm            # admin, body: {"route":"primary"|"backup"|"auto"}
GET  /api/sse/ops                      # auth
WS   /api/ws/ops                       # cookie / token / lab
GET  /api/ops/status                   # admin — HA, vault, parallel, broker honesty
```

---

## Risk register (active)

| Risk | Mitigation |
|------|------------|
| Connection storms on SSE/WS | Interval clamp 3–60s; feature flag off-switch; FE slows poll when live |
| Manual backup without keys | `probe_route` + Settings key readiness in `llm-routes` |
| Over-parallel LLM | Playbook/HiTL stay sequential per job |
| Doc drift | README + this program as dual source; update on each sprint land |
| Multi-replica realtime | Document in-process scope; poll remains correct |
