# ACTIRA — 12-Sprint Board Package (Analysis, Design & Implementation Status)

| Field | Value |
|-------|--------|
| **Date** | 2026-07-29 |
| **Audience** | CXO / Engineering / Ops |
| **Companion** | [ACTIRA_12_SPRINT_HARDENING_PROGRAM.md](ACTIRA_12_SPRINT_HARDENING_PROGRAM.md) |
| **Code entry** | `backend.server:app` · SPA `frontend/` |
| **Honesty** | Single-tenant IR advisor — not SIEM/XDR; dual fallback is automatic **and** manual |

---

# 1. Executive Summary (CXO view)

ACTIRA is a **single-tenant AI IR command center**: log ingest → enrich → ATT&CK → hybrid RAG → LLM playbook → **Human-in-the-Loop**. The requested 12-sprint program is **largely implemented** in-tree (model dual-fallback, parallel parse/enrich, WS+SSE ops push, ops pack, CI gates). Remaining work is **hardening honesty**, residual product gaps (MFA, multi-tenant, edge WAF), and continuous cleanup—not greenfield rebuilds.

| Decision | Recommendation |
|----------|----------------|
| Ship demo / pilot | **Yes** with `SECURITY_HARDENING` + residual risks signed |
| Rebuild microservices | **No** — modular monolith is intentional |
| Dual fallback | **Shipped** — auto chain + manual `llm_manual_route=backup` |
| Realtime queue | **Shipped** — WS primary, SSE fallback, HTTP poll last |

**Overall program maturity:** ~**85/100** for stated single-tenant scope.

---

# 2. Current State Findings (Sprint 1 audit)

## 2.1 Repo map (requested dirs → actual)

| Requested | Actual ACTIRA path | Notes |
|-----------|-------------------|--------|
| `frontend/` | `frontend/src` (~119 files) | React 19 SPA |
| `api/` | `api/` = Postman/Bruno clients | **Not** the FastAPI server |
| `workers/` | **Missing** | Worker loop in `backend/job_queue.py` + `ACTIRA_JOB_WORKER` |
| `pipelines/` | **Missing** | `backend/pipeline.py` + `pipeline_parallel.py` |
| `prompts/` | **Missing** | Embedded in `playbook_agent.py`, `ai_investigator.py`, `rca.py` |
| `scripts/` | `scripts/` | Dual `.ps1`/`.sh` |
| `docs/` | `docs/` + root README | Large ops/dx packs |
| `tests/` | `backend/tests` + root `tests/` | Unit + framework |
| `docker/` | Root compose + `backend/Dockerfile` + `frontend/Dockerfile` | |
| `config/` | `backend/config/`, `.env`, Mongo Settings | |
| `migrations/` | **None** | Schema-on-read Mongo |
| `tools/` | `scripts/`, `benchmarks/`, `backend/scripts/` | |
| `assets/` | Capstone screenshots under `docs/capstone/` | |

## 2.2 Findings by class

| Class | Evidence | Severity | Action |
|-------|----------|----------|--------|
| Dead / backup code | `backend/backup/serverbkp.py`, `golden_evalbkp.py` | Low | Keep quarantined; do not import |
| Dual path docs | Capstone FINAL_DELIVERABLES (links fixed) | Low | Done |
| Env pollution in tests | Platform settings left `PARSE_CONCURRENCY` / `LOG_FORMAT` | Medium | **Fixed** (monkeypatch isolation) |
| FE CI eslint | Hunt/OpsHealth/Golden hooks | Medium | **Fixed** (build green) |
| OpenAPI lag vs WS | WS not in OpenAPI | Low | Documented |
| Supply chain CI | No Dependabot / npm audit / Trivy by default | Medium | Documented as optional |
| Security residuals | No MFA, single-tenant BOLA | High (product) | Residual risk table |
| Performance | Hash embeddings default; optional sbert | Medium | Profile-based |
| Technical debt | `server.py` still thick vs routers | Medium | Continue modularization |
| Circular deps | Routers → services → repos (clean) | — | Prefer not to reverse |

## 2.3 Cleanup plan (ordered)

1. Never revive `serverbkp` into import path.  
2. Keep audit scripts under `scripts/_docs_audit_*.py` or move to `tools/` later.  
3. ~~Continue extracting from `server.py` into `routers/`~~ — **done:** `routers/system.py` (health/ready/version/metrics).  
4. ~~Dependabot + `npm audit` CI~~ — **done.**  
5. MFA via OIDC IdP — **customer action** (documented residual).  

---

# 3. WebSocket + SSE Real-time Design

## 3.1 Why charts looked “static”

| Cause | Reality in ACTIRA |
|-------|-------------------|
| Demo fallback | `REACT_APP_DASHBOARD_DEMO_FALLBACK` fills fixed KPIs on empty DB |
| Analytics cache | `/kpis` TTL; silent poll must `force_refresh` when poll-only |
| Recharts | `isAnimationActive={false}` on some pies; live series need data/key change |
| WS auth | Cookie `actira_access_token` or `?token=`; cross-origin needs Secure/SameSite |

**Mitigations shipped:** `useOpsRealtime` (WS → SSE → poll), Dashboard uses push for KPIs; **increment:** `updateSeq` chart keys + Avg resolution card (2026-07-29).

## 3.2 Topology

```
Browser Dashboard
    │
    ├─1─ WS  /api/ws/ops?interval_sec=10   (primary)
    ├─2─ SSE /api/sse/ops?interval_sec=10  (fallback)
    └─3─ HTTP GET /api/kpis + /api/kpis/queue (poll)
              │
         backend/routers/realtime.py
         analytics_service.queue_kpis / kpis
```

## 3.3 Event formats

```json
{
  "type": "kpi.ops_snapshot",
  "payload": {
    "queue": {
      "assigned": 12,
      "open": 8,
      "waiting_review": 5,
      "escalated": 9,
      "completed_today": 3,
      "sla_risk": 2,
      "avg_resolution_hours": 10.5,
      "trend_7d": [{"date": "2026-07-28", "opened": 4, "completed": 2}]
    },
    "kpis": { "total_incidents": 65, "severity_distribution": [] },
    "pull_mode": false
  }
}
```

Legacy: `{ "type": "kpi.queue_snapshot", "payload": { ...queue fields } }`  
Control: client `{ "op": "subscribe", "interval_sec": 10 }` · `{ "op": "ping" }` → `{ "type": "pong" }`

## 3.4 Config

```env
FEATURE_REALTIME_OPS=1
# frontend/.env
REACT_APP_REALTIME_OPS=1
```

---

# 4. Configurable Parallel Pipeline Design

| Stage | Parallel? | Knob | Clamp |
|-------|-----------|------|-------|
| Multi-file parse | Yes | `parse_concurrency` / `PARSE_CONCURRENCY` | 1–16 |
| IoC enrich | Yes | `enrich_concurrency` / `ENRICH_CONCURRENCY` | 1–32 |
| Correlate · ATT&CK · RAG · Playbook · HiTL | **No** | — | Sequential (audit) |

**Code:** `backend/pipeline_parallel.py` · wired in `pipeline.py` · honesty on `GET /api/ops/status` → `pipeline_parallel`.

**Do not** parallelize playbook LLM or HiTL per job.

---

# 5. Model Selector & Fallback UI Design

## 5.1 Dual fallback (required)

| Mode | Settings fields | Behavior |
|------|-----------------|----------|
| **Automatic** | `llm_fallback_enabled`, `llm_fallback_provider`, `llm_fallback_model` | On primary failure, walk preferred then `FALLBACK_PROVIDER_ORDER` with keys |
| **Manual** | `llm_manual_route` = `primary` \| `backup` | Force preferred backup stack without waiting for error |

## 5.2 Surfaces

| Surface | Path |
|---------|------|
| Service | `backend/services/model_management_service.py` |
| LLM core | `backend/llm_provider.py` (`call_llm(..., route=)`) |
| API | `GET /api/settings/llm-routes`, `POST /api/settings/test-llm` `{ "route": "primary"\|"backup"\|"auto" }` |
| Settings UI | Settings → LLM: fallback model, manual route, Test primary/backup, latency |
| Shell | `Layout.jsx` left rail + top: health chips, **Use backup** (admin) |

## 5.3 Config example

```json
{
  "llm_provider": "anthropic",
  "llm_model": "claude-sonnet-4-6",
  "llm_fallback_enabled": true,
  "llm_fallback_provider": "groq",
  "llm_fallback_model": "openai/gpt-oss-120b",
  "llm_manual_route": "primary"
}
```

---

# 6. Detailed Sprint-by-Sprint Implementation Plan

| Sprint | Status | Concrete paths / changes |
|--------|--------|---------------------------|
| **1 Audit** | Done (this package) | Map dirs; cleanup plan §2.3 |
| **2 Docs** | Done | README, `docs/operations/*`, `CONFIGURATION.md`, `SECURITY_HARDENING` v2.1 |
| **3 Model mgmt** | Done | `model_management_service.py`, Settings + Layout dual fallback |
| **4 Parallel** | Done | `pipeline_parallel.py`, Platform settings |
| **5 Realtime** | Done + increment | `realtime.py`, `useOpsRealtime.js` (+ `updateSeq`), `queue_kpis`, Dashboard cards + chart keys |
| **6 Scripts** | Done | `bootstrap-env`, `start-demo`, `diagnose`, `healthcheck`, `cleanup-runtime`, `quality-gate` |
| **7 Tests** | Done | smoke / functional / security via make + CI; unit suite 312 pass |
| **8 Frontend** | **Done** (core) | Tooltips, live Dashboard, ListState on Roadmap/KB, ESLint CI green |
| **9 Backend** | **Done** (core) | Routers + `system.py` shell; OpenAPI; metrics auth |
| **10 AI** | **Done** (core) | Dual route probes; hybrid RAG; HiTL; **prompt pack** `backend/prompts/` |
| **11 Cleanup** | **Done** (core) | Backup quarantine; board closeout |
| **12 Prod** | Done pack | SECURITY_HARDENING, ops pack, Helm, Dependabot, npm audit, Trivy, gitleaks |

### Implementation order (remaining — strategic only)

1. OIDC MFA at customer IdP (not built-in TOTP)  
2. Multi-replica pub/sub for ops events (only if multi-node required)  
3. Multi-tenant org isolation (explicit non-goal for MVP)

---

# 7. Updated README.md

**Do not replace blindly** — root [README.md](../../README.md) already matches architecture (dual fallback, parallel stages, scripts, honesty). Treat that file as canonical; update only when behavior changes. Snapshot themes:

- Entry: `uvicorn backend.server:app`
- Dual fallback + realtime ops
- Scripts table
- Not SIEM / single-tenant

---

# 8. Scripts Fix Plan

| Script | OS | Role | Status |
|--------|-----|------|--------|
| `bootstrap-env.ps1/.sh` | Win/Unix | Seed `.env` files | OK |
| `start-demo.ps1/.sh` | Win/Unix | Docker or local | OK |
| `diagnose.ps1/.sh` | Win/Unix | Local self-check | OK |
| `healthcheck.ps1/.sh` | Win/Unix | `/health` + `/ready` · `-Deep` | OK |
| `cleanup-runtime.ps1/.sh` | Win/Unix | Wipe artifacts (not Mongo) | OK |
| `quality-gate.ps1/.sh` | Win/Unix | Test ladder | OK |
| `generate-sbom.sh` | Unix | SBOM | OK |

**Gaps:** no `migrate` (Mongo schema-on-read); seed via `SEED_DEMO_USERS` dual-gate.

---

# 9. Complete Test Plan

| Suite | How | Scope |
|-------|-----|--------|
| Smoke | `make smoke` / quality-gate | Health, model routes, ops |
| Functional | `make functional` · backend unit CI markers | 300+ tests offline |
| Regression | Root `tests/` + golden benchmark | IR determinism |
| Performance | `benchmarks/run_benchmarks.py` | Lab profiles |
| Stress | Load docs `LOAD_TEST_10_100` | Manual / gated |
| Security | `make security` · `security.yml` pip-audit | Auth, secrets, markers |
| E2E | Playwright `frontend/e2e` | Gated workflow |
| Docs | `scripts/_docs_audit_*.py` | Links / env / claims |

---

# 10. Code Cleanup Checklist

- [x] Quarantine `backend/backup/*`  
- [x] Fix test env pollution  
- [x] FE CI eslint blockers  
- [x] OpenAPI regenerate when routes change  
- [x] Dependabot  
- [x] Extract prompts pack (`backend/prompts/`)  
- [x] Shrink `server.py` further (`routers/system.py` for health/metrics)  
- [x] Never commit `backend/.env` / LanceDB blobs (gitignore + policy)  

---

# 11. Prioritized Roadmap

### Quick wins — **complete**

- Dual fallback UI/API  
- WS/SSE ops  
- Parallel parse/enrich knobs  
- Docs/hardening honesty  
- Avg resolution KPI + live chart `updateSeq`  
- Dependabot + npm audit + Trivy + gitleaks  
- Prompt pack + system router extraction  

### Medium — **complete for this program**

- Roadmap/Knowledge loading states  
- Supply-chain CI wiring  
- MFA residual documented (IdP)  

### Strategic (future programs)

- MFA / step-up (IdP configuration in customer env)  
- Multi-tenant org isolation  
- Multi-replica realtime bus  
- sbert default quality profile  
- Dedicated playbook “judge” model productization  

---

# 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Connection storms WS/SSE | M | M | Interval clamp 3–60s; feature flag off |
| Manual backup without keys | M | H | `probe_route` + key_ready chips |
| Over-parallel LLM | L | H | Playbook/HiTL sequential |
| Doc drift | H | M | This package + SECURITY_HARDENING + README |
| Multi-replica stale push | M | M | Document in-process; poll remains correct |
| Demo fallback trust damage | M | H | Default off `REACT_APP_DASHBOARD_DEMO_FALLBACK` |
| Secret leakage logs | L | H | `redact_for_log` + audit |
| Hallucination overtrust | H | H | HiTL + citations + golden eval |

---

# Implementation log

| Change | Files |
|--------|--------|
| Live update sequence for charts | `frontend/src/hooks/useOpsRealtime.js` |
| Avg resolution KPI + live chart key + channel badge | `frontend/src/pages/Dashboard.jsx` |
| Board package (this file) | `docs/product/ACTIRA_12_SPRINT_BOARD_PACKAGE.md` |
| Dependabot + npm audit + gitleaks + Trivy | `.github/dependabot.yml`, `security.yml` |
| Prompt pack extraction | `backend/prompts/*` wired to agents |
| Roadmap / Knowledge loading UX | `Roadmap.jsx`, `Knowledge.jsx` |
| MFA residual clarity | `CONFIGURATION.md` |
| System router extraction | `backend/routers/system.py` (health/ready/version/metrics); `server.py` ~546 lines |
| Gitleaks allowlist | `.gitleaks.toml` |
| Board checklists closed | this file §10–§11 |
| OpenAPI snapshot refreshed | `docs/openapi.json` (post–system router) |

## Open issues status (post-closeout)

| Item | Priority | Status |
|------|----------|--------|
| Dependabot | Med | **Closed** |
| npm audit CI | Med | **Closed** |
| Image scan (Trivy) | Med | **Closed** (best-effort) |
| Gitleaks | Med | **Closed** (continue-on-error) |
| Prompt pack | Med | **Closed** |
| FE empty/loading (Roadmap/KB) | Low | **Closed** |
| MFA product TOTP | High residual | **Accepted** — IdP MFA only (documented) |
| Multi-tenant | Strategic | **Out of scope** (single-tenant by design) |
| Multi-replica realtime bus | Strategic | **Out of scope** this program |
| Built-in TOTP MFA | Strategic | **IdP MFA only** — documented residual |
| Shrink `server.py` | Med | **Closed** — `routers/system.py` |
| Dependabot / npm / Trivy / gitleaks | Med | **Closed** |
| Prompt pack | Med | **Closed** |
