# ACTIRA — Project Overview

**Product:** ACTIRA (Agentic Cybersecurity Threat Intelligence & Incident Response Advisor)  
**Maturity (board assessment):** **Production Candidate / Strong MVP** (lab & demo ready; not multi-tenant SIEM-class
production)  
**License:** MIT  
**Primary stack:** React 19 · FastAPI · MongoDB · LanceDB · multi-provider LLM

This document is the “new engineer in 10 minutes” guide. For deep dives
see [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).

---

## Business problem

SOC teams drown in raw logs and alerts. Turning an alert pile into a **MITRE-aligned narrative**, **enriched IoCs**, and
a **defensible response playbook** is slow, inconsistent, and hard to audit. Commercial SOAR/XDR tools are powerful but
heavy, expensive, and often closed.

**ACTIRA** is a focused AI SOC console that:

1. Ingests multi-format security logs (upload, ZIP package, or HTTP push)
2. Extracts and enriches IoCs
3. Correlates events into an attack narrative with ATT&CK techniques
4. Retrieves grounded guidance (hybrid RAG)
5. Generates a citation-backed IR playbook via LLM
6. Forces **Human-in-the-Loop** review for critical / low-grounding outcomes

---

## Solution overview

| Stage     | What happens                                                            |
|-----------|-------------------------------------------------------------------------|
| Ingest    | Multipart upload, batch/ZIP, or `/api/logs/ingest` webhook              |
| Parse     | Format auto-detect → Common Event Schema (`parsers.py`)                 |
| Extract   | Regex IoCs: IP, domain, URL, hashes, CVE, email                         |
| Enrich    | AbuseIPDB / VT / GreyNoise / ThreatFox / OTX / Shodan (mock if no keys) |
| Correlate | Cross-file entity links + attack chain (`correlator.py`)                |
| Map       | Heuristic + catalog MITRE ATT&CK mapping                                |
| Retrieve  | BM25 + LanceDB ANN (RRF) + optional Cohere re-rank                      |
| Generate  | Multi-provider LLM playbook with citation filter + grounding score      |
| Gate      | HiTL policy (`hitl_gate.py`) → `pending_review` / `new` / `approved`    |
| Review    | Senior reviewer approve / reject / edit-and-approve (atomic, race-safe) |
| Ops       | Audit log, Slack/email notifications, retention, job queue worker       |

---

## Target users & personas

| Persona                 | Role in product                                                         | Primary screens                                |
|-------------------------|-------------------------------------------------------------------------|------------------------------------------------|
| **SOC Analyst (L1/L2)** | Upload logs, triage incidents, inspect IoCs/playbooks, ask investigator | Upload, Incidents, Dashboard, Knowledge        |
| **Senior Reviewer**     | Approve/reject/edit AI-drafted playbooks                                | Review Queue, Incident Detail                  |
| **SOC Admin**           | LLM/TI keys, thresholds, KB custom docs, roadmap                        | Settings, Knowledge, Roadmap, Golden Benchmark |
| **Platform engineer**   | Deploy, secrets, Mongo, CI                                              | `.env`, Docker Compose, GitHub Actions         |

---

## Technology stack

**Frontend:** React 19, react-router-dom v7, TanStack Query, Tailwind, shadcn/ui, Playwright e2e

**Backend:** FastAPI, Motor/MongoDB, Pydantic v2, JWT+bcrypt, rank-bm25, LanceDB, anthropic/openai/google-genai/groq

**Data:** MongoDB (users, incidents, jobs, settings, audit, KB custom docs); local LanceDB under `backend/data/lancedb/`

**Quality:** pytest (unit/security/golden), ruff/flake8, OpenAPI drift CI, coverage gate, Playwright, detect-secrets

---

## AI components (agentic surface)

| Component             | Module                                                                    | Role                                            |
|-----------------------|---------------------------------------------------------------------------|-------------------------------------------------|
| Playbook agent        | `playbook_agent.py`                                                       | Citation-grounded IR steps (JSON)               |
| AI investigator       | `ai_investigator.py`                                                      | Q&A on a single incident + sanitization         |
| Pipeline orchestrator | `pipeline.py` + `job_queue.py`                                            | Multi-stage async job worker                    |
| RAG                   | `knowledge_base.py` + `vector_store.py` + `embeddings.py` + `reranker.py` | Hybrid retrieval                                |
| LLM façade            | `llm_provider.py`                                                         | Provider switch, JSON parse, usage/budget hooks |
| Eval                  | `golden_eval.py`                                                          | Offline golden IR metrics                       |

This is a **pipeline-oriented multi-stage agent**, not a general multi-agent swarm (LangGraph-style) — by design for
predictability and HiTL control.

---

## Security capabilities (summary)

- JWT auth + RBAC (`analyst` / `senior_reviewer` / `admin`); public register → analyst only
- Password policy, login lockout, IP throttle
- Settings secrets never returned raw (`has_*` only); Fernet encrypt-at-rest + optional Vault/AWS SM refs
- Constant-time ingest API key; ZIP bomb limits
- HiTL severity + grounding gates; concurrent review → HTTP 409
- Citation allow-list filter on LLM outputs; optional IoC redaction in investigator prompts

See [SECURITY.md](../SECURITY.md) and [THREAT_MODEL.md](THREAT_MODEL.md).

---

## Deployment model

| Mode                      | Description                                                                                                                                        |
|---------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| **Local dev**             | Mongo (compose or native) + uvicorn `:8001` + CRA `:3000`                                                                                          |
| **Docker Compose**        | `mongodb` + `backend` + `frontend` (see `docker-compose.yml`)                                                                                      |
| **Enterprise production** | Not fully productized: needs TLS edge, Mongo auth/HA, explicit `SECRETS_MASTER_KEY`, `ENV=production`, no demo seed, optional multi-worker runbook |

Default ports: UI **3000**, API **8001**, Mongo **27017**.

---

## Repository map (simplified)

```
soc-playbook-ai-v2/
├── backend/           # FastAPI app, agents, pipeline, tests
├── frontend/          # React SOC console
├── docs/              # Architecture, ops, testing, this overview
├── tests/             # Cross-cutting unit/api/security/perf fixtures
├── memory/            # PRD, weekly discussions (product history)
├── .github/workflows/ # CI, security, e2e, golden, openapi, release
├── docker-compose.yml
├── Makefile
├── SECURITY.md
└── README.md
```

---

## External integrations

| Integration                                              | Purpose                      | Default       |
|----------------------------------------------------------|------------------------------|---------------|
| Anthropic / OpenAI / Gemini / Groq                       | LLM playbooks & investigator | Requires keys |
| AbuseIPDB, VirusTotal, GreyNoise, ThreatFox, OTX, Shodan | IoC enrichment               | Mock if empty |
| Cohere                                                   | Re-rank                      | Optional      |
| Slack webhook / SMTP or HTTP email gateway               | Alerts                       | Optional      |
| HashiCorp Vault / AWS Secrets Manager                    | Secret references            | Optional      |

---

## Data & execution flow (one incident)

```
Browser/SIEM → POST upload|ingest → log_jobs(queued)
  → parse/normalize → extract IoCs → enrich → correlate
  → ATT&CK map → hybrid RAG → LLM playbook → grounding score
  → HiTL decide status → Mongo incident + optional LanceDB embed
  → notify (Slack/email) → Reviewer UI (if pending_review)
```

---

## Current maturity (honest)

| Area                                     | Level                                                                                  |
|------------------------------------------|----------------------------------------------------------------------------------------|
| Capstone / interview / portfolio demo    | **Excellent**                                                                          |
| Lab / single-tenant SOC pilot            | **Good**                                                                               |
| Open-source publication                  | **Good** (docs + CI present; polish ongoing)                                           |
| Fortune 100 multi-tenant production SIEM | **Not ready** (no tenancy, no HA story, modular monolith limits, limited SOAR actions) |

**Board verdict:** Strong **production-candidate MVP** for demos and controlled pilots; not a Defender/Sentinel
replacement.
