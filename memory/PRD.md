# SOC Console — Product Requirements Doc

## Original Problem Statement

Agentic Cybersecurity Threat Intelligence & Incident Response Advisor — a multi-agent AI web app that ingests raw
security logs, extracts and enriches IoCs, correlates them into attack narratives mapped to MITRE ATT&CK, and generates
citation-grounded incident response playbooks with a mandatory Human-in-the-Loop (HiTL) approval gate for critical
incidents.

## User Choices (locked)

- LLM: Anthropic **claude-sonnet-4-6** (swappable to gpt-5.x / gemini-3-flash-preview via Settings)
- Threat Intel: **Mock mode** by default; real keys pluggable via Settings
- RAG: **BM25 in-memory** (rank-bm25) over a curated KB
- Auth: Custom JWT + role-based (analyst / senior_reviewer / admin), seeded demo accounts
- Frontend: React + Tailwind + shadcn/ui, dark-mode-first SOC console aesthetic

## Personas

- **SOC Analyst (L1/L2)** — uploads logs, triages incidents, inspects IoCs & playbooks
- **Senior Reviewer** — approves / rejects / edits HiTL-gated incidents
- **Admin** — manages API keys, LLM provider, thresholds

## Architecture

- **Backend**: FastAPI + Motor (MongoDB), BackgroundTasks pipeline (parse → extract → enrich → correlate → RAG → LLM
  playbook → HiTL gate)
- **Frontend**: React 19, react-router-dom v7, TanStack Query, Tailwind, shadcn/ui, sonner, phosphor icons, IBM Plex
  Mono for IoCs/hashes, Outfit for headings
- **DB collections**: `users`, `incidents`, `log_jobs`, `settings`, `audit_log`
- **KB**: Static in-code corpus (MITRE ATT&CK subset + NIST SP 800-61 + CISA KEV + internal playbooks), BM25 retriever
- **Testids**: All interactive elements tagged with `data-testid`

## What's Been Implemented (2026-02-01)

- Custom JWT auth + role RBAC (`analyst`, `senior_reviewer`, `admin`) with seeded demo accounts
- Full ingestion pipeline: multipart upload → BackgroundTask → phased job status
  (`queued/parsing/extracting/enriching/correlating/generating/done`)
- Regex-based IoC extraction (IP, domain, URL, MD5/SHA1/SHA256, CVE, email) with private-IP filtering & dedup
- Mock threat-intel enrichment (AbuseIPDB / VT / GreyNoise / ThreatFox) with weighted-mean scoring (0.3·Abuse + 0.4·VT +
  0.3·ThreatFox; GreyNoise override)
- MITRE ATT&CK inference via keyword heuristics → technique mapping
- BM25 RAG over 20+ curated KB docs (MITRE, NIST, KEV, SOC playbooks)
- LLM playbook generation via your own Anthropic API key (Claude Sonnet 4.6) with citation-grounded prompt + JSON
  parsing; fallback template guarantees non-zero grounding
- HiTL auto-gate via `hitl_gate.decide_incident_status` (severity ≥ `hitl_severity_min` OR low grounding →
  `pending_review`; auto-approve never bypasses severity gate)
- Reviewer queue with Approve / Reject / Edit-and-approve actions + audit log (atomic conditional update; 409 on
  concurrent review race)
- Analyst dashboard with KPI cards, incident table, tactic-grouped ATT&CK heatmap
- Incident detail with severity/HiTL badges, playbook grouped by phase, inline citation chips (Popover showing KB
  snippet), IoC list with enrichment mini-scores, timeline
- Settings page for LLM provider/model, grounding threshold, HiTL severity minimum, and threat-intel API keys
- Knowledge Base search UI

## Phase 1 Enhancement (2026-02-01) — Multi-log + CES + Correlation

- Parser registry with format auto-detection: Apache/Nginx · Syslog · JSON-lines · CSV · CEF · LEEF · CloudTrail-JSON ·
  plaintext fallback (`backend/parsers.py`)
- Common Event Schema normalization (18 fields) per event
- Cross-log correlator: indexes IP/user/host/domain/hash; entities appearing in ≥2 files or ≥3 events become
  cross-links; produces unified attack chain (`backend/correlator.py`)
- New `POST /api/logs/upload-batch` endpoint accepting multi-file or ZIP incident packages
- ZIP-bomb protection: MAX_ZIP_MEMBERS=50, MAX_UNCOMPRESSED_BYTES=50MB, per-file 25MB cap
- Frontend: multi-file staging + Run pipeline UX, per-file format/event badges in job cards, batch/zip/single mode
  indicators, CorrelationPanel on IncidentDetail with cross-file link chips + attack-chain timeline
- Legacy `POST /api/logs/upload` preserved (delegates internally to batch pipeline)

## Tests (2026-02-01)

- Backend: 28/28 pytest cases passed (auth, RBAC, upload pipeline, incidents/IoCs/techniques/playbook citations, HiTL
  flow, KPIs, Settings, KB)
- Frontend: All Playwright flows passed for analyst / senior_reviewer / admin

## Phase — Code-review hardening (2026-07-19) — **COMPLETED**

Five weekly focus areas closed. Full write-up: `memory/WEEKLY_DISCUSSIONS.md` §6.

| Focus area                    | What shipped                                                                                                                                                    |
|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Secret handling**           | `GET /api/settings` allow-list + strip of `SECRET_SETTINGS_FIELDS`; only `has_*` for keys/webhooks; resolve via `secrets_util` (DB → env, placeholders ignored) |
| **HiTL + auto-approve races** | `backend/hitl_gate.py` honours `hitl_severity_min`; pipeline wires it; `POST /review/{id}` atomic `find_one_and_update` → **409** if already reviewed           |
| **LLM JSON robustness**       | `parse_llm_json` handles fences, prose wrappers, trailing commas, bare step arrays                                                                              |
| **Auth / RBAC**               | Public register always `role=analyst` (no self-admin); weak `JWT_SECRET` warning; review/settings/audit gates verified                                          |
| **Ingest auth**               | `X-Ingest-Key` vs `INGEST_API_KEY` via `secrets.compare_digest`; JWT Bearer fallback                                                                            |

**New / updated modules:** `hitl_gate.py`, `llm_provider.parse_llm_json`, `pipeline.py`, `server.py` (register, review,
ingest, settings), `auth.py`, `tests/test_hardening.py` (18 offline tests).

**Roadmap seed:** `rm-w1-code-review` marked `completed` / progress 100 in `backend/roadmap_data.py`.

**Explicitly deferred (not blockers):** JWT role re-bind from DB each request; password complexity on register;
ingest-key-only mode (`INGEST_REQUIRE_KEY`).

## Phase — Golden dataset CI (2026-07-19) — **COMPLETED**

Offline evaluation harness for pipeline regressions (no Mongo / no LLM):

- **~35 golden cases / ~17 families** in `backend/tests/golden/dataset.json` (SSH brute, Log4Shell, phishing,
  ransomware, C2, etc.)
- **Metrics:** IoC F1, technique recall, playbook grounding, phase coverage, latency (`backend/golden_eval.py`)
- **CI:** `pytest tests/test_golden_benchmark.py` + `.github/workflows/golden-ci.yml`
- **Roadmap:** `rm-w2-golden-ci` completed

## Phase — Curate golden IR datasets (2026-07-19) — **COMPLETED**

Data/curation work behind evaluation (`rm-w1-benchmark-datasets`):

- **Explicit gold labels** in `build_dataset.py` (not auto-copied from extractor); build validates match
- **Rebalanced families** (fewer SSH clones; exploit, phishing, C2, ransomware, noise filter, …)
- **Domain FP fix** in `ioc_extractor.py`: keep real FQDNs ending in `.com`; drop file basenames
- **Docs:** `backend/tests/golden/README.md` schema + license (synthetic only)

## Backlog

## Phase — LanceDB hybrid RAG (2026-07-19) — **COMPLETED** (scaffold)

Local vector store + hybrid retrieval (BM25 + ANN RRF):

- `backend/embeddings.py` — hash (default) / sbert / none; recommended `BAAI/bge-small-en-v1.5`
- `backend/vector_store.py` — LanceDB `kb_chunks` + `incidents`
- `knowledge_base.search` hybrid RRF; pipeline incident upsert; `/kb/vector-status`, `/kb/reindex`
- Offline: `tests/test_vector_rag.py`
- Roadmap: `rm-w1-lancedb` completed

## Phase — Cohere re-rank + retrieval eval (2026-07-19) — **COMPLETED**

- `backend/reranker.py` — Cohere `rerank-english-v3.0` + lexical offline backend
- Settings: `cohere_api_key` / `has_cohere` / `cohere_rerank_enabled`
- Golden Q→doc pairs + hit@k: `tests/golden/retrieval_pairs.json`, `retrieval_eval.py`
- Roadmap: `rm-w1-cohere-rerank` + `rm-w1-embeddings` completed (incl. LoRA train/export 2026-07-20)

### P1 — Enhancements

- Real integrations for AbuseIPDB, VirusTotal, GreyNoise, ThreatFox when user provides keys
- ~~Optional LoRA fine-tune on production-accepted playbooks~~ **DONE** (`lora_train.py`, `/kb/lora/train`)
- Streaming SSE for playbook generation (currently blocking send_message)
- Pagination on `/incidents`, `/logs/jobs`, `/audit`
- File-size cap on `/logs/upload`
- Optional: JWT role re-bind from DB; register password policy; strict ingest-key-only mode
- Expand golden set toward human-approved production playbooks (beyond synthetic offline labels; base set curated
  2026-07-19)

### P2 — Nice to have

- LangGraph orchestration for the multi-agent pipeline
- LangSmith observability wiring
- EVTX (Windows Event Log) binary parser
- ATT&CK matrix full grid (not just tactic-grouped heatmap)
- Notifications (Slack / email) for HiTL queue

### P3 — Future

- SIEM connectors (Splunk / Elastic live streaming)
- Multi-tenant (MSSPs)
- SOAR automated response actions post-approval
- Fine-tune embeddings on user feedback

## Deployment Notes

- Backend binds to `0.0.0.0:8001` under supervisor; routes all prefixed with `/api`
- Frontend reads `REACT_APP_BACKEND_URL` from `.env`
- Mongo URL & DB name pulled from backend `.env` (protected)
- `ANTHROPIC_API_KEY` seeded in backend `.env`
