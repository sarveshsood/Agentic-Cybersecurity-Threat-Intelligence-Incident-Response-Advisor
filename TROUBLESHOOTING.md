# ACTIRA — Troubleshooting

## Self-diagnostic (first step)

```powershell
# Windows
.\scripts\diagnose.ps1
.\scripts\diagnose.ps1 -Fix
.\scripts\diagnose.ps1 -Fix -StartMongo
.\scripts\diagnose.ps1 -Fix -Deep
```

```bash
# Unix / Git Bash / WSL
./scripts/diagnose.sh
./scripts/diagnose.sh --fix
./scripts/diagnose.sh --fix --start-mongo
./scripts/diagnose.sh --fix --deep
```

Exit `0` = ready; `1` = remaining failures (see `[FAIL]` + Fix hints).

## Backend will not start

| Error                                      | Fix                                                                            |
|--------------------------------------------|--------------------------------------------------------------------------------|
| `MONGO_URL is not set`                     | Copy `backend/.env.example` → `backend/.env`                                   |
| `Cannot reach MongoDB`                     | Start Mongo; check URL/port; Compose uses hostname `mongodb` inside containers |
| `JWT_SECRET is weak` with `ENV=production` | Set long random `JWT_SECRET`                                                   |
| Import / dependency errors                 | `pip install -r backend/requirements.txt` on Python 3.12                       |

## Frontend cannot reach API

1. Confirm `REACT_APP_BACKEND_URL` (e.g. `http://localhost:8001`)
2. Restart `npm start` after changing frontend `.env`
3. Use the **same hostname** in browser and config (`localhost` vs `127.0.0.1`)
4. `curl http://127.0.0.1:8001/api/health`

## Login fails

- Demo seed only when `ENV` is lab-like **and** `SEED_DEMO_USERS=true` on empty DB
- Lockout after repeated failures — wait or clear throttle collection
- Password policy on register: ≥12 chars, letter + number

## Playbook generation fails

- Check Settings `has_anthropic` / provider keys
- Inspect job status on upload card
- Review backend logs for LLM HTTP errors / budget

## Vector / KB search weak

- Ensure `ACTIRA_VECTOR_STORE=1`
- `GET /api/kb/vector-status`
- Admin reindex; consider `ACTIRA_EMBEDDING_BACKEND=sbert`

## Slack / email not firing

- Slack must be **Incoming Webhook** URL (`hooks.slack.com/services/...`) not bot token
- Email: enable gateway or configure SMTP; check `backend/data/email_outbox` in dev

## Docker Compose backend healthy but browser fails

- Frontend build arg `REACT_APP_BACKEND_URL` must be **host-reachable** (e.g. `http://localhost:8001`), not Docker DNS
  name `backend`

## Still stuck

1. `docs/OPERATIONS_RUNBOOK.md`
2. Backend logs around startup
3. `docs/ENTERPRISE_REVIEW.md` known limitations  
