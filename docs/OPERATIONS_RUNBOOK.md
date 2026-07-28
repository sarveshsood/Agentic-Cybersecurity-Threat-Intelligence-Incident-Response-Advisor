# ACTIRA — Operations Runbook

## 1. Service health

| Check        | Command / URL                       |
|--------------|-------------------------------------|
| API health   | `GET /api/health` or `GET /health`  |
| Mongo        | health payload `mongo: up`          |
| UI           | `http://localhost:3000` loads login |
| Vector store | `GET /api/kb/vector-status` (auth)  |

## 2. Common failures

| Symptom                         | Likely cause                                  | Action                                  |
|---------------------------------|-----------------------------------------------|-----------------------------------------|
| UI “Network error”              | Backend down or wrong `REACT_APP_BACKEND_URL` | Start uvicorn on 8001; match host       |
| Login 500 / hang                | Mongo down                                    | Start Mongo; verify `MONGO_URL`         |
| Startup RuntimeError Mongo ping | Bad URL / firewall                            | Fix `.env`; compose override            |
| Playbook empty / error          | Missing LLM key                               | Settings or `.env` keys; check provider |
| Always mock TI scores           | Empty TI keys or `FORCE_MOCK_TI`              | Configure keys                          |
| 409 on review                   | Concurrent reviewer                           | Refresh queue                           |
| 401 ingest                      | Bad `X-Ingest-Key`                            | Rotate/set `INGEST_API_KEY`             |
| JWT errors after deploy         | Secret rotated                                | Users re-login                          |

## 3. Restart procedures

```bash
# Backend only
# Ctrl+C uvicorn, then (from repo root):
export PYTHONPATH=.
python -m uvicorn backend.server:app --host 0.0.0.0 --port 8001

# Compose
docker compose restart backend
docker compose logs -f backend
```

## 4. Secrets rotation

1. Generate new key in provider console
2. Admin → Settings → paste new key → Save (or update Mongo vault entry)
3. Optionally sync `.env` in lab
4. Test with Settings “test Slack/email” or a small upload
5. Revoke old key at provider

For `JWT_SECRET` / `SECRETS_MASTER_KEY`: plan downtime; re-encrypt or re-enter settings secrets if master key changes
(see vault docs in code comments).

## 5. Disk growth

| Path                        | Content         | Action                               |
|-----------------------------|-----------------|--------------------------------------|
| Mongo volume                | Incidents, jobs | Retention settings; TTL jobs         |
| `backend/data/lancedb`      | Vectors         | Reindex; delete & rebuild if corrupt |
| `backend/data/email_outbox` | Dev emails      | Safe to purge in lab                 |
| `backend/data/job_payloads` | Upload bytes    | Clean old jobs                       |

## 6. Incident response (for the platform itself)

1. Disable public register if exposed (or put behind SSO VPN)
2. Rotate `JWT_SECRET`, ingest key, LLM/TI keys
3. Export `audit_log`
4. Rebuild from clean image + restored Mongo backup

## 7. On-call cheat sheet

```text
1. /api/health
2. docker compose ps / process list ports 3000,8001,27017
3. backend logs for "Application startup" or traceback
4. Mongo ping
5. Settings has_anthropic / provider
6. Re-run sample upload as analyst
```
