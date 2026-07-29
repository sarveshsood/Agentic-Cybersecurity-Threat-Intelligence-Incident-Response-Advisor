# ACTIRA

**Agentic Cybersecurity Threat Intelligence & Incident Response Advisor**

Single-tenant AI IR command center: ingest security logs → extract & enrich IoCs → correlate → map MITRE ATT&CK →
hybrid RAG → LLM playbook → **Human-in-the-Loop**. Investigation uses a **controlled multi-stage pipeline**
(named stage agents), not unconstrained multi-agent A2A.

| Layer | Technology |
|-------|------------|
| UI | React 19 · Tailwind · design system (`design_guidelines.json`) |
| API | FastAPI · entry **`backend.server:app`** (repo root) |
| Data | MongoDB · LanceDB (local vectors) |
| Jobs | Durable queue (`job_queue`) · optional multi-worker |
| LLM | Anthropic · OpenAI · Gemini · Groq — **automatic + manual fallback** |

> **Not** a SIEM/XDR replacement. Demo / education / controlled pilot.

![Stack](https://img.shields.io/badge/stack-React%2019%20%2B%20FastAPI%20%2B%20MongoDB-0B0F19)
![Entry](https://img.shields.io/badge/API-backend.server%3Aapp-6366f1)
![License](https://img.shields.io/badge/license-MIT-green)

---

## One-command demo

```powershell
.\scripts\bootstrap-env.ps1
.\scripts\start-demo.ps1
.\scripts\start-demo.ps1 -SkipDocker
.\scripts\diagnose.ps1
.\scripts\healthcheck.ps1
.\scripts\healthcheck.ps1 -Deep
.\scripts\cleanup-runtime.ps1 -WhatIf
```

```bash
./scripts/bootstrap-env.sh
./scripts/start-demo.sh
./scripts/start-demo.sh --skip-docker
./scripts/diagnose.sh
./scripts/healthcheck.sh
./scripts/healthcheck.sh --deep
./scripts/cleanup-runtime.sh
```

| Surface | URL |
|---------|-----|
| UI | http://localhost:3000 |
| API docs | http://localhost:8001/docs |
| Health | http://localhost:8001/api/health |

Lab users: [samples/demo/PERSONAS.md](samples/demo/PERSONAS.md)  
(`analyst@` / `reviewer@` / `admin@` · `…@soc.example.com`)

---

## Installation (canonical)

### Prerequisites

Python 3.11+ · Node 18+ · MongoDB 7 · (optional) Docker

### Backend (from **repository root**)

```bash
python -m venv .venv
# Windows: .\.venv\Scripts\Activate.ps1
# Unix:    source .venv/bin/activate
pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # set JWT_SECRET

export PYTHONPATH=.                    # Windows: $env:PYTHONPATH = (Get-Location).Path
python -m uvicorn backend.server:app --reload --host 0.0.0.0 --port 8001
```

**Do not** run `cd backend && uvicorn server:app` — package imports will fail.

### Frontend

```bash
cd frontend
npm install
echo REACT_APP_BACKEND_URL=http://127.0.0.1:8001 > .env
npm start
```

---

## Architecture (actual paths)

```
soc-playbook-ai-v2/
├── backend/                 # API + pipeline + agents
│   ├── server.py            # FastAPI app — uvicorn backend.server:app
│   ├── pipeline.py          # IR orchestration
│   ├── pipeline_parallel.py # parse/enrich pool resolution
│   ├── job_queue.py         # durable jobs / worker loop
│   ├── llm_provider.py      # multi-provider + dual fallback
│   ├── routers/             # HTTP (incl. collab, productivity, realtime)
│   ├── services/            # business logic
│   └── repositories/        # Mongo access
├── frontend/src/            # SPA pages + collab components
├── scripts/                 # bootstrap-env, start-demo, diagnose, healthcheck, cleanup-runtime
├── docs/                    # architecture, ops, product
├── deployments/             # Helm / K8s
├── monitoring/              # Prometheus / Grafana examples
└── api/                     # Postman / Bruno / Insomnia clients (not the server)
```

There is **no** separate `workers/` or `pipelines/` top-level package — jobs and pipeline live under `backend/`.

### Pipeline: sequential vs parallel

| Stage | Parallel? | Config |
|-------|-----------|--------|
| Multi-file parse | **Yes** | Settings → Platform · `parse_concurrency` / `PARSE_CONCURRENCY` (1–16) |
| IoC enrich | **Yes** | `enrich_concurrency` / `ENRICH_CONCURRENCY` (1–32) |
| Correlate · ATT&CK · RAG · Playbook · HiTL | **No** | Sequential for auditability |

### LLM routing (automatic + manual)

| Mode | Behavior |
|------|----------|
| **Automatic** | Primary fails → preferred fallback provider/model → chain Anthropic→OpenAI→Gemini→Groq (keys required) |
| **Manual** | Settings → **Manual routing = backup** forces preferred fallback stack for all calls |
| **Test** | Settings → **Test primary** / **Test backup** (`POST /settings/test-llm` with `route`) |

Routes snapshot: `GET /api/settings/llm-routes` (admin).  
Groq free-tier default model: `openai/gpt-oss-120b`.

### Real-time ops (WS primary + SSE fallback)

| Channel | Path | Role |
|---------|------|------|
| Poll | `GET /api/kpis` · `GET /api/kpis/queue` | Always available |
| WebSocket | `WS /api/ws/ops` | **Primary** push (cookie / token; lab anon in dev) |
| SSE | `GET /api/sse/ops` | Fallback stream (queue snapshots + heartbeat) |

Dashboard hook: `frontend/src/hooks/useOpsRealtime.js` — WS → SSE → poll.  
Flag: `FEATURE_REALTIME_OPS` (default on; set `0` to disable). Client: `REACT_APP_REALTIME_OPS=0`.

### Dual fallback UX

| Surface | Behavior |
|---------|----------|
| Settings → LLM | Preferred fallback model, manual routing, Test primary / Test backup, latency chips |
| Top bar | Route chip + **Use backup** one-click (admin) |
| Left sidebar | Route health + one-click primary/backup |
| API | `GET /settings/llm-routes`, `POST /settings/test-llm` `{route}` |

### Quality gates

```bash
make smoke            # fast offline
make quality-gate     # smoke → functional → security
# or: ./scripts/quality-gate.sh  |  .\scripts\quality-gate.ps1
```

### Prod path (honest)

| Concern | Guidance |
|---------|----------|
| Secrets | Set `SECRETS_MASTER_KEY` (do not rely on JWT-derived vault alone) |
| Multi-worker | `ACTIRA_JOB_WORKER=0` on API replicas; worker Deployment = `1`; payloads `mongo` |
| Broker | Optional AMQP wake-up only — **not** Celery; Mongo remains claim SoT |
| Observability | [docs/operations/OBSERVABILITY_PACK.md](docs/operations/OBSERVABILITY_PACK.md) + `monitoring/` |

### Collaboration (H-07 / H-08) — feature flags

Default **off**. Enable in `backend/.env`:

```env
FEATURE_COLLAB_ASSIGN=1
FEATURE_COLLAB_COMMENTS=1
FEATURE_NOTIFICATION_CENTER=1
FEATURE_SAVED_FILTERS=1
FEATURE_PINS=1
```

Snapshot: `GET /api/meta/features`.

---

## Auth & roles

| Role | Access |
|------|--------|
| `analyst` | Ingest, incidents, hunt, self-assign, comments |
| `senior_reviewer` | + Review queue, reassign, elevated comments |
| `admin` | + Settings, Ops, Benchmark, full assign |

JWT cookie + Bearer. Public register is analyst-only when enabled.

---

## Knowledge Base

Hybrid **BM25 + LanceDB** (RRF) + optional Cohere re-rank.  
Knowledge page left pane: mode, top_k, corpus, min confidence, sort, vector status.

---

## Environment (bootstrap)

See `backend/.env.example` and [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

Minimum:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=soc_console
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
JWT_SECRET=<32+ random chars>
```

Runtime secrets also live in Admin → Settings (Mongo + vault).

---

## Documentation map

| Doc | Topic |
|-----|--------|
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Install |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Env + Settings |
| [docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md) | Agents + A2A honesty |
| [docs/MULTI_WORKER.md](docs/MULTI_WORKER.md) | HA jobs |
| [docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md](docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md) | H-07/H-08 |
| [docs/product/ACTIRA_12_SPRINT_HARDENING_PROGRAM.md](docs/product/ACTIRA_12_SPRINT_HARDENING_PROGRAM.md) | 12-sprint program |
| [docs/E2E_TESTING.md](docs/E2E_TESTING.md) | Playwright |
| [docs/openapi.json](docs/openapi.json) | OpenAPI |

### Screenshot checklist (capture for decks)

1. Login + demo personas  
2. Dashboard — queue KPIs + lifecycle chart  
3. Ingest + job progress  
4. Incident workspace (tabs, playbook citations)  
5. Review queue approve/reject  
6. Knowledge search left pane  
7. Settings LLM dual fallback  
8. Ops Health  
9. Audit trail  
10. Notification inbox (flags on)  

---

## Limitations

- Mock TI without keys  
- Single-tenant  
- Not legal WORM unless storage is immutable  
- Not A2A multi-agent mesh  
- Live TI may fail SSL/rate limits in restricted networks  

## License

MIT — see [LICENSE](LICENSE).
