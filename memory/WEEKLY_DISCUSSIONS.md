# Weekly Discussions — ACTIRA mapping

Project: **ACTIRA** (Agentic Cybersecurity Threat Intelligence & Incident Response Advisor)

This note maps team weekly topics to the current codebase (`soc-playbook-ai-v2`)
and recommended next steps.

---

## Week 1

### 1. Embedding model fine-tuned on our data (Hugging Face) — **COMPLETED** (2026-07-20)

**Shipped:**

- Pluggable embedders (`hash` default / `lora` / `sbert` / `none`) in `backend/embeddings.py`
- **Base model pick:** `BAAI/bge-small-en-v1.5` (recommended for `ACTIRA_EMBEDDING_BACKEND=sbert`)
- Golden Q→doc pairs: `backend/tests/golden/retrieval_pairs.json` (10 IR queries)
- Offline hit@k: `backend/retrieval_eval.py` + `GET /kb/retrieval-eval` (admin)
- Hybrid BM25 + dense RRF (see §2)
- **Domain LoRA pipeline** (`backend/lora_train.py`):
    - Corpus from golden pairs + optional approved/closed incident playbooks
    - `linear_lora` (numpy, CI-safe) low-rank residual on hash embeddings
    - Optional `peft` method via sentence-transformers when torch is installed
    - Export under `backend/data/lora_adapters/`; activate with `ACTIRA_EMBEDDING_BACKEND=lora`
    - Admin API: `GET /kb/lora/status`, `POST /kb/lora/train`; Knowledge UI “Train domain LoRA”
    - Tests: `backend/tests/test_lora_train.py`

```bash
cd backend
python -m lora_train --out data/lora_adapters/latest
# then: ACTIRA_EMBEDDING_BACKEND=lora ACTIRA_LORA_PATH=data/lora_adapters/latest
# reindex KB for dense path
pytest tests/test_lora_train.py -v
```

### 2. LanceDB for Vector Database — **COMPLETED** (2026-07-19)

| Piece          | Location                                                                    |
|----------------|-----------------------------------------------------------------------------|
| Vector store   | `backend/vector_store.py` → `backend/data/lancedb/`                         |
| Embedders      | `backend/embeddings.py`                                                     |
| Hybrid search  | `knowledge_base.KnowledgeBase.search` (RRF)                                 |
| Incident index | `pipeline.run_batch_pipeline` → `upsert_incident`                           |
| APIs           | `GET /kb/vector-status`, `POST /kb/reindex` (admin), `GET /kb/search?mode=` |
| Tests          | `backend/tests/test_vector_rag.py`                                          |

**Env flags:** `ACTIRA_VECTOR_STORE`, `ACTIRA_LANCEDB_PATH`, `ACTIRA_RETRIEVAL_MODE` (`bm25`\|`hybrid`\|`dense`),
`ACTIRA_EMBEDDING_*`.

### 3. Cohere Re-Ranking — **COMPLETED** (2026-07-19)

| Piece    | Location                                                           |
|----------|--------------------------------------------------------------------|
| Reranker | `backend/reranker.py` (`maybe_rerank`, Cohere API + lexical mock)  |
| Wired    | `knowledge_base.KnowledgeBase.search` after hybrid pool            |
| Settings | `cohere_api_key` (secret) + `cohere_rerank_enabled` + `has_cohere` |
| UI       | Settings → Threat intel (key) + Detection (toggle)                 |
| Tests    | `tests/test_rerank_and_retrieval.py` (mock HTTP)                   |

**Flags:** `COHERE_API_KEY`, `ACTIRA_COHERE_RERANK`, `ACTIRA_RERANK_BACKEND=cohere|lexical`. No key → original hybrid
order.

### 4. Spec tooling review — **COMPLETED** (2026-07-19)

| Resource                                              | Use for ACTIRA                                                       |
|-------------------------------------------------------|----------------------------------------------------------------------|
| [github/spec-kit](https://github.com/github/spec-kit) | Spec-driven feature PRs (ingest, HiTL, RAG) — optional               |
| [openspec.dev](https://openspec.dev/)                 | OpenAPI / contract-first API evolution (`/logs/ingest`, `/settings`) |
| `docs/openapi.json`                                   | Committed FastAPI snapshot (source of truth export)                  |
| `backend/scripts/export_openapi.py`                   | Regenerate / `--check` drift                                         |
| `.github/workflows/openapi-ci.yml`                    | CI fails if schema drifts                                            |
| `docs/SPEC_WORKFLOW.md`                               | Review checklist + Spec Kit template                                 |

**Shipped:** OpenAPI export + CI drift gate. Live `/docs` remains the runtime browser UI.

### 5. Benchmark datasets (search list) — **COMPLETED** (2026-07-19)

**Shipped as curated synthetic golden set** (not third-party PCAP dumps):

| Piece                                | Location                                |
|--------------------------------------|-----------------------------------------|
| Dataset v2 (~35 cases, ~17 families) | `backend/tests/golden/dataset.json`     |
| Curated templates + gold validation  | `backend/tests/golden/build_dataset.py` |
| Schema / license notes               | `backend/tests/golden/README.md`        |

**Label policy:** expected IoCs + technique IDs are **explicit** in templates; rebuild fails if `extract_iocs` /
`infer_techniques` drift.

**Families (rebalanced):** SSH/brute, cloud auth, Log4Shell/exploit, phishing, execution/transfer, C2, persistence,
lateral, ransomware, discovery, supply-chain, private-IP noise filter.

**Extractor fix:** domain FP filter drops file basenames (`cmd.exe`, `payload.sh`, `invoice.pdf.exe`) but keeps real
FQDNs (`evil-mail.example.com`) — do not treat TLD `com` as a file suffix.

**Future expansion (optional):** human-approved production playbooks, OTX/abuse.ch samples under license review, EVTX
binary fixtures.

Store under `backend/tests/golden/` — done.

### 6. Code review hardening — **COMPLETED** (2026-07-19)

Status: **Done.** All five focus areas are implemented in code, covered by offline unit tests
(`backend/tests/test_hardening.py` — 18 passed), and smoke-tested where a live API is required
(`backend/tests/test_smoke_all_areas.py`).

---

#### 6.1 Secret handling (`secrets_util`, never leak in `GET /settings`)

| Item                | Detail                                                                                                                                                                                                                          |
|---------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Problem**         | API keys / webhooks must never appear in browser-visible responses.                                                                                                                                                             |
| **Implementation**  | `SECRET_SETTINGS_FIELDS` in `models.py` lists all secret keys. `GET /api/settings` returns an **explicit allow-list** of ops fields + `has_*` booleans only; then strips any `SECRET_SETTINGS_FIELDS` keys as defense-in-depth. |
| **Runtime resolve** | `secrets_util.resolve_secret` / `resolve_llm_keys` / `has_secret` prefer Mongo → env; placeholders (`sk-...`, `changeme`) are not treated as real.                                                                              |
| **Write path**      | Blank secret on PUT keeps previous value; `__CLEAR__` / `clear_fields` / `POST /settings/clear-secrets` wipe secrets and blank matching `.env` keys. Slack validated as Incoming Webhook URL only.                              |
| **Logging**         | `redact_for_log()` never emits full secrets.                                                                                                                                                                                    |
| **Primary files**   | `secrets_util.py`, `server.py` (`get_settings`, `_merge_settings_update`), `models.py`                                                                                                                                          |

---

#### 6.2 HiTL gate + auto-approve race conditions

| Item               | Detail                                                                                                                                                                        |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Problem (gate)** | Pipeline used to hardcode `severity == "critical"` and **ignored** Settings `hitl_severity_min`. Auto-approve comments claimed HiTL override incorrectly.                     |
| **Problem (race)** | Review did `find` then `update` without a status predicate — two reviewers could both “win”.                                                                                  |
| **Gate policy**    | Pure function `hitl_gate.decide_incident_status(severity, grounding_score, …)`:                                                                                               |
|                    | 1. Severity ≥ `hitl_severity_min` → always `pending_review`                                                                                                                   |
|                    | 2. Grounding &lt; `grounding_threshold` → `pending_review`                                                                                                                    |
|                    | 3. Auto-approve only if severity **below** HiTL min **and** grounding ≥ `auto_approve_grounding_min` → `approved` (never bypasses severity gate)                              |
|                    | 4. Else → `new`                                                                                                                                                               |
| **Pipeline**       | `pipeline.run_batch_pipeline` calls `decide_incident_status`; audit detail records `hitl_required`, `auto_approved`, `hitl_severity_min`.                                     |
| **Review race**    | `POST /review/{id}` uses `find_one_and_update({id, status: pending_review}, …)`. Success → audit + 200. No match → 404 if missing, else **409** conflict. Sets `reviewed_at`. |
| **Primary files**  | `hitl_gate.py`, `pipeline.py`, `server.py` (`review_incident`)                                                                                                                |

---

#### 6.3 LLM JSON parse robustness (`parse_llm_json`)

| Item               | Detail                                                                                                                                                                                                    |
|--------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Problem**        | LLM often returns fenced markdown, prose wrappers, trailing commas, or a bare steps array — simple `json.loads` failed and fell through to template playbooks.                                            |
| **Implementation** | `llm_provider.parse_llm_json`: strip ```/```json fences; brace-match extract first object/array; strip trailing commas; normalize bare arrays to `{"steps": [...]}`; raise `ValueError` on empty/garbage. |
| **Callers**        | `playbook_agent.generate_playbook`, `ai_investigator` (both already catch and degrade safely).                                                                                                            |
| **Primary files**  | `llm_provider.py`                                                                                                                                                                                         |

---

#### 6.4 Auth / RBAC (review + settings + audit)

| Item                                 | Detail                                                                                                                                                                                      |
|--------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Problem**                          | Public `POST /auth/register` accepted client `role` (including `admin` / `senior_reviewer`) → privilege escalation.                                                                         |
| **Register**                         | Role always forced to **`analyst`**; privileged attempts logged and ignored. Seeded demo users remain the only bootstrap privileged accounts.                                               |
| **JWT**                              | Weak/default `JWT_SECRET` (`dev-secret`, short secrets) logs a startup **warning** (`auth.py`).                                                                                             |
| **Role gates (unchanged, verified)** | Review queue/action: `senior_reviewer` (+ admin superuser). Settings PUT/reset/clear/test: `admin`. Audit list: `admin` / `senior_reviewer`. Upload/incidents/KPIs: any authenticated user. |
| **Primary files**                    | `auth.py` (`require_roles`, `PRIVILEGED_ROLES`, JWT warn), `server.py` (`register` + Depends on routes)                                                                                     |

---

#### 6.5 Ingest auth (`INGEST_API_KEY` vs JWT)

| Item               | Detail                                                                                                                                                                                                                                                |
|--------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Problem**        | Ingest key compared with `==` (timing side-channel). Auth path needed clear dual-mode rules.                                                                                                                                                          |
| **Implementation** | `_ingest_keys_match` uses `secrets.compare_digest` (unequal lengths → False). `X-Ingest-Key` matches `INGEST_API_KEY` when key is real; else / also accept `Authorization: Bearer` JWT. Missing both when no key configured → 401 with setup message. |
| **Endpoints**      | `POST /logs/ingest`, `POST /logs/ingest/raw`                                                                                                                                                                                                          |
| **Primary files**  | `server.py` (`_resolve_ingest_actor`, `_ingest_keys_match`)                                                                                                                                                                                           |

---

#### 6.6 Verification

```bash
cd backend
pytest tests/test_hardening.py -v    # offline — secrets, HiTL policy, parse_llm_json, ingest compare, register contract
# optional live:
set REACT_APP_BACKEND_URL=http://127.0.0.1:8001
pytest tests/test_smoke_all_areas.py -v
```

| Check                          | Result                                      |
|--------------------------------|---------------------------------------------|
| Unit suite `test_hardening.py` | 18 passed (2026-07-19)                      |
| Register with `role=admin`     | Response role = `analyst`; review queue 403 |
| `GET /settings`                | No raw secret field names                   |
| Bad `X-Ingest-Key`             | 401                                         |

#### 6.7 Deferred (out of scope for this hardening pass)

- Re-bind JWT role from DB on every request (role revocation mid-session)
- Password minimum length / complexity on register
- `INGEST_REQUIRE_KEY=true` to disable JWT on stream ingest
- Rotate demo passwords in non-dev environments

These can be future roadmap items; they are **not** blockers for declaring §6 complete.

---

## Week 2

### 1. Benchmark against Golden Dataset — **COMPLETED** (2026-07-19)

| Piece                           | Location                                 |
|---------------------------------|------------------------------------------|
| Dataset (~35 cases, v2 curated) | `backend/tests/golden/dataset.json`      |
| Rebuild helper                  | `backend/tests/golden/build_dataset.py`  |
| Offline runner + metrics        | `backend/golden_eval.py`                 |
| Pytest gates                    | `backend/tests/test_golden_benchmark.py` |
| GitHub Actions                  | `.github/workflows/golden-ci.yml`        |

**Offline path:** extract IoCs → mock enrich → ATT&CK keywords → `_fallback_playbook` (no Mongo / no LLM).

**Default CI thresholds:** cases ≥30 · IoC F1 ≥0.85 · technique recall ≥0.80 · mean grounding ≥0.50 · full phase
coverage · mean latency ≤5s.

```bash
cd backend
pytest tests/test_golden_benchmark.py -v -n 0
python -m golden_eval
```

### 2. Prompt caching

**Observation (applies here):**

- `SYSTEM_PROMPT` in `playbook_agent.py` is **byte-identical** on every playbook call.
- Investigator system text is also stable across questions on the same code path.
- Multi-incident / multi-bucket loops would re-send the same system prefix.

**Implementation status:**

- Anthropic path uses `cache_control: ephemeral` on the system block when
  `use_prompt_cache=True` (default) in `llm_provider.call_llm`.
- **Groq does not expose Anthropic-style `cache_control`** — caching is a no-op on Groq. Prefer Anthropic/OpenAI for
  production multi-step runs if token cost matters.

### 3. Streaming responses — **COMPLETED for Investigator** (2026-07-19)

**Question:** Stream tokens to reduce latency?

**Answer for playbook generation:** still **little benefit** (needs full structured JSON for citations / HiTL).

**Shipped for AI Investigator chat UX:**
| Piece | Detail | |-------|--------| | `llm_provider.stream_llm` | Token stream Anthropic / OpenAI / Groq / Gemini (+
non-stream fallback) | | `POST /api/incidents/{id}/investigate/stream` | SSE: `status` → `meta` → `token*` → `done`
(structured answer persisted) | | `GET /api/logs/jobs/{id}/events` | SSE job phase updates (not LLM tokens) | | Frontend
`AIInvestigator.jsx` | Live token bubble; falls back to non-stream POST |

Non-streaming `POST .../investigate` remains for simple clients / fallback.

---

## Implementation checklist (tracked)

| Item                                                                              | Status                                                                                                     |
|-----------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| Favicon / tab icon                                                                | Done (`frontend/public/favicon.svg`)                                                                       |
| Settings reset to defaults                                                        | Done `POST /api/settings/reset`                                                                            |
| Smoke tests all areas                                                             | Done `tests/test_smoke_all_areas.py`                                                                       |
| Anthropic prompt cache                                                            | Done in `llm_provider.py`                                                                                  |
| Code-review hardening (secrets / HiTL / parse / RBAC / ingest)                    | Done — see §6 + `tests/test_hardening.py`                                                                  |
| Golden dataset CI                                                                 | Done — `golden_eval.py` + `tests/golden/` + `test_golden_benchmark.py` + `.github/workflows/golden-ci.yml` |
| Curate golden IR datasets (labels + families)                                     | Done — v2 curated set (~35 cases / 17 families); explicit gold + build validate                            |
| Streaming LLM for playbooks                                                       | Deferred (documented) — Investigator SSE + job-phase SSE shipped                                           |
| LanceDB vector store + hybrid RRF                                                 | Done — `vector_store.py` + `embeddings.py` + pipeline/API                                                  |
| Pluggable hash/sbert/lora embedders + base model + Q→doc eval + LoRA train/export | Done — `lora_train.py` + `/kb/lora/*`                                                                      |
| Cohere rerank                                                                     | Done — `reranker.py` + Settings `has_cohere`                                                               |
