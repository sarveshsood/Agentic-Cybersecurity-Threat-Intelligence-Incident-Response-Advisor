# ACTIRA — Agentic Cybersecurity Threat Intelligence & Incident Response Advisor

A multi-agent AI SOC platform that ingests raw security logs, extracts and enriches IoCs, correlates them into attack
narratives mapped to MITRE ATT&CK, and generates citation-grounded incident response playbooks — with a mandatory
Human-in-the-Loop (HiTL) approval gate for critical incidents.

**Product mark:** ACTIRA (short UI name). Full project name appears on the login screen, browser title, and API docs.

![Stack](https://img.shields.io/badge/stack-React%2019%20%2B%20FastAPI%20%2B%20MongoDB-0B0F19)
![LLM](https://img.shields.io/badge/LLM-Claude%20Sonnet%204.6-8b5cf6)
![Maturity](https://img.shields.io/badge/maturity-Enterprise%20Demo%20Ready%20v1.0-0ea5e9)
![Score](https://img.shields.io/badge/board%20score-89%2F100-14b8a6)
![License](https://img.shields.io/badge/license-MIT-green)

> **Positioning:** Single-tenant AI IR advisor for demos, education, and controlled pilots — **not** a full SIEM/XDR
> replacement.  
> **v1.0
pack:** [presentation/](presentation/) · [diagrams/](diagrams/) · [deployments/](deployments/) · [ENTERPRISE_REVIEW.md](ENTERPRISE_REVIEW.md) · [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md)

### One-command demo (Docker)

```powershell
# Windows
.\scripts\start-demo.ps1
# Unix
# ./scripts/start-demo.sh
```

Then open http://localhost:3000 — lab users in [samples/demo/PERSONAS.md](samples/demo/PERSONAS.md).

---

## Features

- **Log ingestion** — drag-and-drop upload (Apache / Syslog / plain text)
- **IoC extraction** — regex-based extraction of IPs, domains, URLs, MD5/SHA1/SHA256, CVEs, emails
- **Threat intel enrichment** — AbuseIPDB · VirusTotal · GreyNoise · ThreatFox with weighted-mean scoring (mock mode by
  default, real keys pluggable via Settings)
- **MITRE ATT&CK mapping** — keyword-heuristic technique inference
- **Hybrid RAG** — BM25 + local LanceDB ANN (RRF) + optional Cohere re-rank; hash embedder default; optional sbert
  (`BAAI/bge-small-en-v1.5`)
- **LLM playbook generation** — your own Anthropic/OpenAI/Gemini API key (defaults to Claude Sonnet 4.6, swappable) with
  citation-grounded prompting and grounding-score validation
- **HiTL gate** — routes incidents at/above Settings `hitl_severity_min` (default `critical`) or low grounding to the
  reviewer queue; auto-approve never bypasses the severity gate; concurrent reviews are race-safe (HTTP 409)
- **RBAC** — `analyst` / `senior_reviewer` / `admin` with JWT auth (public register always creates `analyst` only)
- **Hardened settings secrets** — `GET /settings` never returns raw API keys (only `has_*` booleans)
- **Analyst dashboard** — KPI cards, incident timeline, ATT&CK heatmap, playbook viewer with inline citation chips
  (Popover shows KB source snippet)

---

## Tech Stack

**Frontend**

- React 19 · react-router-dom v7 · TanStack Query
- Tailwind CSS + shadcn/ui · sonner · @phosphor-icons/react
- IBM Plex Sans / Mono + Outfit (Google Fonts)

**Backend**

- FastAPI · Motor (async MongoDB) · Pydantic v2
- `rank-bm25` for retrieval
- Official `anthropic` / `openai` / `google-genai` SDKs for LLM calls (Claude / GPT / Gemini)
- JWT auth (`pyjwt` + `bcrypt`)

---

## Quick Start (Local)

### Prerequisites

- Python 3.11+
- Node.js 18+ / Yarn
- MongoDB running locally (or Atlas connection string)

### 1. Clone & configure

```bash
git clone https://github.com/<your-username>/soc-console.git
cd soc-console
```

### 2. Backend

```bash
cd backend
pip install -r requirements.txt
```

Create `backend/.env` from the full template (recommended):

```bash
cd backend
Copy-Item .env.example .env   # Windows PowerShell
# cp .env.example .env        # Unix
```

`backend/.env.example` documents every bootstrap key: LLM, HiTL/pipeline, threat intel, Slack/email, security, data
retention, and realtime ingest (`INGEST_API_KEY`). Minimum viable `.env`:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=soc_console
CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
JWT_SECRET=<generate-a-32+char-random-string>
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-6
ANTHROPIC_API_KEY=sk-ant-...

# Optional bootstrap (also editable in Admin → Settings; synced back to .env on save)
# GROUNDING_THRESHOLD=0.7
# HITL_SEVERITY_MIN=critical
# SLACK_WEBHOOK_URL=
# EMAIL_ALERTS_TO=
# SESSION_TIMEOUT_HOURS=24
# INCIDENT_RETENTION_DAYS=90
# INGEST_API_KEY=   # for SIEM/webhook push — see Realtime ingest below
```

**Two-layer config:** MongoDB (Admin → Settings) is source of truth at runtime; values also sync to `backend/.env` so a
wiped DB can re-seed. Secret fields in the UI always show blank after load — look for “✓ configured”, not the raw key.

Run (in its own terminal window — keep it open):

```powershell
# Windows PowerShell
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

Verify backend is reachable (in another shell or browser):

```powershell
Invoke-WebRequest http://127.0.0.1:8001/api/health -UseBasicParsing
# Should return JSON with "status": "ok" (and mongo: "up")
```

**Time display standard:** ACTIRA stores backend timestamps in timezone-aware UTC. The frontend displays timestamps
using the browser UI preference configured under **Admin → Settings → UI prefs → Time display standard**. The default is
**UTC**, which is recommended for SOC workflows, incident correlation, audit review, and cross-log analysis. Operators
can switch display to browser-local time or a fixed IANA timezone such as `Asia/Kolkata`, `Europe/London`, or
`America/New_York`.

### 3. Frontend

```bash
cd ../frontend
yarn install   # or npm install
```

Create `frontend/.env` (if not present):

```env
REACT_APP_BACKEND_URL=http://127.0.0.1:8001
```

Run (in a **second separate terminal window** — keep both open):

```powershell
cd frontend
yarn start     # or npm start
```

Once you see "webpack compiled successfully", open:

- **Main app**: http://localhost:3000  (or http://127.0.0.1:3000)
- **Backend API docs** (for debugging): http://127.0.0.1:8001/docs
- **Health check**: http://127.0.0.1:8001/api/health

**Important**: Start backend first. The frontend makes API calls immediately. If you see connection errors, check that
port 8001 is listening and the backend terminal shows "Application startup complete".

Quick port check (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 8001,3000 -State Listen
```

### 4. Demo accounts (auto-seeded on first backend boot)

| Role            | Email                    | Password     |
|-----------------|--------------------------|--------------|
| analyst         | analyst@soc.example.com  | Analyst123!  |
| senior_reviewer | reviewer@soc.example.com | Reviewer123! |
| admin           | admin@soc.example.com    | Admin123!    |

Click any demo card on the login screen to auto-fill.

---

## Try It in 30 seconds

1. Log in as **analyst**
2. Go to **Ingest Logs** → click **"Try sample: SSH brute force + Log4Shell"**
3. Watch the pipeline animate through `parsing → extracting → enriching → correlating → generating`
4. Click **Open incident →** to see the drafted playbook with inline citation chips
5. Log out, log back in as **senior_reviewer** → visit **Review Queue** → **Approve** the critical incident

---

## Project Structure

```
soc-playbook-ai-v2/
├── backend/                   # FastAPI API + pipeline + agents
│   ├── server.py              # App shell (lifespan, middleware) — uvicorn server:app
│   ├── core/                  # database + shared services
│   ├── routers/               # Domain routes (/api + /api/v1)
│   ├── pipeline.py            # Multi-file / ZIP orchestration
│   ├── job_queue.py           # Durable job worker
│   ├── hitl_gate.py           # Pure HiTL policy
│   ├── playbook_agent.py      # Citation-grounded LLM playbooks
│   ├── ai_investigator.py     # Incident Q&A agent
│   ├── knowledge_base.py      # BM25 + hybrid RAG
│   ├── vector_store.py        # LanceDB
│   ├── secrets_util.py        # Secret resolve / .env sync
│   ├── secret_vault.py        # Encrypt-at-rest
│   └── tests/                 # Offline unit + golden + modularization suites
├── frontend/src/              # React SOC console
│   ├── App.js                 # Router + role gating
│   ├── lib/api.js             # Axios (cookie credentials)
│   ├── lib/auth.jsx           # Auth context (httpOnly cookie first)
│   ├── pages/                 # Login, Dashboard, Upload, Incidents, …
│   └── components/            # Layout, heatmaps, shadcn UI
├── docs/                      # Architecture, ops, enterprise review
├── tests/                     # Cross-cutting api/security/perf
├── .github/workflows/         # CI, security, e2e, golden, openapi
├── docker-compose.yml
└── Makefile
```

---

## Documentation

| Doc                                                         | Purpose                             |
|-------------------------------------------------------------|-------------------------------------|
| [docs/QUICKSTART.md](docs/QUICKSTART.md)                    | 30-minute path                      |
| [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)        | Product & maturity                  |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                | System architecture                 |
| [docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md)    | AI / RAG / HiTL                     |
| [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md)                | Security threat model               |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)                    | Install & production checklist      |
| [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)                  | Executive demo script               |
| [docs/ENTERPRISE_REVIEW.md](docs/ENTERPRISE_REVIEW.md)      | Board scorecard                     |
| [FAQ.md](FAQ.md) · [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Support                             |
| [SECURITY.md](SECURITY.md)                                  | Vulnerability reporting & hardening |

Full index: [docs/DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md).

---

## API Overview

All routes are prefixed with `/api`. The SPA uses **httpOnly cookie** auth (`withCredentials`); API clients may use
`Authorization: Bearer <jwt>` from login when enabled.

| Method | Route                      | Role required     | Purpose                                                    |
|--------|----------------------------|-------------------|------------------------------------------------------------|
| POST   | `/auth/register`           | –                 | Create account                                             |
| POST   | `/auth/login`              | –                 | Get JWT                                                    |
| GET    | `/auth/me`                 | any               | Current user                                               |
| POST   | `/logs/upload`             | any               | Multipart upload; runs pipeline                            |
| POST   | `/logs/ingest`             | ingest key or JWT | Realtime JSON push (SIEM / forwarder)                      |
| POST   | `/logs/ingest/raw`         | ingest key or JWT | Realtime raw body (syslog-ng / fluent-bit)                 |
| GET    | `/logs/jobs`               | any               | List ingestion jobs                                        |
| GET    | `/incidents`               | any               | Filter by severity/status                                  |
| GET    | `/incidents/:id`           | any               | Detail + IoCs + playbook                                   |
| GET    | `/incidents/:id/citations` | any               | Resolve playbook citations                                 |
| GET    | `/review/queue`            | senior_reviewer   | HiTL-pending incidents                                     |
| POST   | `/review/:id`              | senior_reviewer   | approve / reject / edit_and_approve                        |
| GET    | `/kpis`                    | any               | Dashboard metrics + heatmap counts                         |
| GET    | `/kb/search?q=`            | any               | Hybrid BM25+dense search (`mode=`)                         |
| GET    | `/kb/vector-status`        | any               | LanceDB / embedder status                                  |
| POST   | `/kb/reindex`              | admin             | Rebuild KB vector index                                    |
| GET    | `/kb/retrieval-eval`       | admin             | Offline hit@k on golden Q→doc pairs                        |
| GET    | `/settings`                | any               | Config only — secrets as `has_*` booleans (never raw keys) |
| PUT    | `/settings`                | admin             | Update LLM/thresholds/keys                                 |
| GET    | `/audit`                   | admin / reviewer  | Audit log                                                  |
| POST   | `/auth/register`           | public            | Creates **analyst** only (role ignored)                    |

---

## Testing & CI/CD

**Full quality gate (recommended):**

```bash
pip install -r backend/requirements.txt -r requirements-test.txt
make ci          # lint + unit + framework + openapi + frontend build
make coverage    # coverage HTML under reports/ (fails if < 95%)
make e2e         # Playwright (stack must be running)
make docker-test # Mongo + backend + pytest in compose
```

**Backend offline suites:**

```bash
cd backend
pytest tests/test_hardening.py -v -n 0
pytest tests/test_golden_benchmark.py -v -n 0
python -m golden_eval
pytest tests/ -v -n 0
```

**Docs:** [docs/TESTING.md](docs/TESTING.md) · [docs/CI_CD.md](docs/CI_CD.md) · [docs/E2E_TESTING.md](docs/E2E_TESTING.md) · [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

Code-review hardening: `memory/WEEKLY_DISCUSSIONS.md` §6.  
Golden dataset: `backend/tests/golden/README.md` · workflows under `.github/workflows/`.

**OpenAPI contract** (snapshot + CI drift check):

```bash
# from repo root — regenerate after route/model changes
python backend/scripts/export_openapi.py
python backend/scripts/export_openapi.py --check
```

Committed schema: `docs/openapi.json` · workflow `.github/workflows/openapi-ci.yml` · guide `docs/SPEC_WORKFLOW.md`.

---

## Realtime log ingest

Upload in the UI is one path. You can also **push logs as they arrive** via HTTP webhooks (no browser session required).

1. Set `INGEST_API_KEY` in `backend/.env` (generated if you expanded the full template).
2. Restart uvicorn.
3. POST events from a SIEM, rsyslog/syslog-ng HTTP output, Fluent Bit, Vector, or a simple cron/tail script.

Ingest keys are compared with constant-time equality (`secrets.compare_digest`).

**JSON body** (good for custom forwarders):

```bash
curl -X POST http://127.0.0.1:8001/api/logs/ingest ^
  -H "Content-Type: application/json" ^
  -H "X-Ingest-Key: YOUR_INGEST_API_KEY" ^
  -d "{\"text\":\"Failed password for root from 1.2.3.4 port 22\",\"source\":\"rsyslog\"}"
```

**Raw body** (good for syslog-ng / Fluent Bit `http` output):

```bash
curl -X POST http://127.0.0.1:8001/api/logs/ingest/raw ^
  -H "Content-Type: text/plain" ^
  -H "X-Ingest-Key: YOUR_INGEST_API_KEY" ^
  -H "X-Log-Source: firewall" ^
  --data-binary @events.log
```

Auth alternatives: header `X-Ingest-Key` **or** `Authorization: Bearer <user JWT>`. Invalid/missing credentials return
**401**. Each push creates a log job and runs the same pipeline as file upload (parse → IoC → enrich → playbook → HiTL
gate).

**Fluent Bit example** (`out_http`):

```ini
[OUTPUT]
    Name        http
    Match       *
    Host        127.0.0.1
    Port        8001
    URI         /api/logs/ingest/raw
    Format      json_lines
    Header      X-Ingest-Key YOUR_INGEST_API_KEY
    Header      X-Log-Source fluent-bit
```

True continuous tailing (file watch / Splunk HEC / Elastic) can sit in front of these endpoints; the API is
pull-agnostic — anything that can HTTP POST works today.

---

## Branding

UI short name and full project name live in one place:

```js
// frontend/src/constants/branding.js
export const BRAND = {
  shortName: "ACTIRA",  // sidebar + login mark
  fullName: "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor",
  tagline: "Agentic TI & IR Advisor",
};
```

Also mirrored in `frontend/public/index.html` (`<title>` / meta) and FastAPI `title`/`description`
in `backend/server.py`. Prefer **ACTIRA** in the chrome (sidebar); the full proposal name is too long for navigation —
it shows as tooltip + login subtitle.

---

## Deployment Notes

- Backend binds to `0.0.0.0:8001` and must be reachable at `/api/*`
- All frontend calls use `REACT_APP_BACKEND_URL` — no hardcoded URLs
- MongoDB connection lives entirely in `MONGO_URL` env var — use a **persistent volume**
  (not an ephemeral container) or Settings / incidents disappear on restart
- **Do not commit `.env` files** — they contain your provider API key (s) and `JWT_SECRET`

---

## Roadmap

- Streaming SSE playbook generation
- ~~HF domain embedding fine-tune~~ **DONE** — `python -m lora_train` / admin Knowledge → Train domain LoRA
  (`ACTIRA_EMBEDDING_BACKEND=lora`)
- Pagination on list endpoints & file-size cap on upload
- WebSocket-based HiTL notifications
- EVTX (Windows Event Log) binary parser
- LangGraph orchestration + LangSmith observability
- Native SIEM connectors (Splunk HEC / Elastic Agent) on top of `/logs/ingest`

---

## License

MIT — see [LICENSE](LICENSE).

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and the production hardening checklist.

### Production checklist (Phase 1)

| Control     | Setting                                         |
|-------------|-------------------------------------------------|
| Environment | `ENV=production` (or `staging`)                 |
| JWT         | Strong `JWT_SECRET` (≥32 random chars)          |
| Vault       | Prefer explicit `SECRETS_MASTER_KEY`            |
| Demo users  | Never set `SEED_DEMO_USERS` outside labs        |
| Metrics     | `METRICS_TOKEN` for scrapers, or admin JWT only |
| CORS        | Explicit `CORS_ORIGINS`                         |

Local empty-DB demos require **both** `ENV=dev` (or `test`/`local`) **and** `SEED_DEMO_USERS=true`.
