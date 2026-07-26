# ACTIRA — Configuration Reference

## Files

| File                   | Purpose                                      |
|------------------------|----------------------------------------------|
| `backend/.env`         | **Local secrets & bootstrap** (never commit) |
| `backend/.env.example` | Documented template                          |
| `frontend/.env`        | `REACT_APP_BACKEND_URL`                      |
| Admin → Settings       | Runtime ops + secrets (Mongo)                |

**Resolution order for secrets:** Mongo settings (decrypted) → process environment / `.env`.

---

## Infrastructure (required)

| Variable       | Example                                       | Notes                                                    |
|----------------|-----------------------------------------------|----------------------------------------------------------|
| `MONGO_URL`    | `mongodb://localhost:27017`                   | In Compose service network use `mongodb://mongodb:27017` |
| `DB_NAME`      | `soc_console`                                 |                                                          |
| `CORS_ORIGINS` | `http://localhost:3000,http://127.0.0.1:3000` | Exact browser origins                                    |
| `JWT_SECRET`   | ≥32 random chars                              | Weak refused when `ENV` not lab                          |
| `ENV`          | `dev` / `test` / `production`                 | Affects seed, secret sync, JWT checks                    |

## Auth & session

| Variable                            | Default         | Notes                     |
|-------------------------------------|-----------------|---------------------------|
| `SESSION_TIMEOUT_HOURS`             | `12`–`24`       | JWT lifetime              |
| `FAILED_LOGIN_LOCKOUT`              | `7`             |                           |
| `SEED_DEMO_USERS`                   | `true` lab only | Dual-gate with lab `ENV`  |
| `AUTH_RETURN_TOKEN_IN_BODY`         | `1`             | Cookie is primary for SPA |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` | auto            | Cross-origin SPA care     |

## LLM

| Variable                                                                   | Notes                                         |
|----------------------------------------------------------------------------|-----------------------------------------------|
| `LLM_PROVIDER`                                                             | `anthropic` \| `openai` \| `gemini` \| `groq` |
| `LLM_MODEL`                                                                | e.g. `claude-sonnet-4-6`                      |
| `LLM_TEMPERATURE`                                                          | e.g. `0.35`                                   |
| `LLM_TOKEN_BUDGET_MONTHLY`                                                 | Soft budget                                   |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | Or set via Settings                           |

## Pipeline / HiTL

| Variable                     | Default      | Meaning                      |
|------------------------------|--------------|------------------------------|
| `GROUNDING_THRESHOLD`        | `0.7`        | Below → HiTL                 |
| `HITL_SEVERITY_MIN`          | `critical`   | At/above → always HiTL       |
| `AUTO_APPROVE_GROUNDING_MIN` | `0.88`–`0.9` | Never bypasses severity gate |
| `CORRELATION_WINDOW_MINUTES` | `45`         |                              |

## Threat intel

Empty keys → **mock enrichment** for that source.  
`FORCE_MOCK_TI=true` forces mocks (CI).

`ABUSEIPDB_API_KEY`, `VIRUSTOTAL_API_KEY`, `GREYNOISE_API_KEY`, `THREATFOX_API_KEY`, `OTX_API_KEY`, `SHODAN_API_KEY`,
`COHERE_API_KEY`

## RAG / vectors

| Variable                   | Notes                                      |
|----------------------------|--------------------------------------------|
| `ACTIRA_VECTOR_STORE`      | `1` default on                             |
| `ACTIRA_RETRIEVAL_MODE`    | `hybrid` \| `bm25` \| `dense`              |
| `ACTIRA_EMBEDDING_BACKEND` | `hash` (CI) \| `sbert` \| `lora` \| `none` |
| `ACTIRA_EMBEDDING_MODEL`   | e.g. `BAAI/bge-small-en-v1.5`              |
| `ACTIRA_LANCEDB_PATH`      | Override DB dir                            |
| `ACTIRA_COHERE_RERANK`     | Enable re-rank when key present            |

## Notifications

| Variable             | Notes                                  |
|----------------------|----------------------------------------|
| `SLACK_WEBHOOK_URL`  | Incoming webhook only (not bot tokens) |
| `EMAIL_ALERTS_TO`    | Comma-separated                        |
| `EMAIL_HTTP_GATEWAY` | Dev-friendly outbox without SMTP       |
| `SMTP_*`             | Optional real mail                     |

## Ingest

| Variable         | Notes                 |
|------------------|-----------------------|
| `INGEST_API_KEY` | Header `X-Ingest-Key` |

## Secrets vault

| Variable                 | Notes                                     |
|--------------------------|-------------------------------------------|
| `SECRETS_MASTER_KEY`     | **Strongly recommended** outside pure lab |
| `VAULT_*` / `AWS_REGION` | Optional external secret refs             |

## Jobs / multi-worker

See [MULTI_WORKER.md](MULTI_WORKER.md): `ACTIRA_JOB_WORKER`, `ACTIRA_JOB_PAYLOAD_BACKEND`, `JOB_STALE_MINUTES`, …

## Frontend

```env
REACT_APP_BACKEND_URL=http://localhost:8001
# Prefer matching hostname you type in the browser (localhost vs 127.0.0.1)
```

---

## Profiles

Admin Settings supports **apply profile** for lab vs stricter ops presets (see API `/api/settings/profiles`). Prefer UI
for day-2 changes; restart only needed for pure env-only vars read at import time.
