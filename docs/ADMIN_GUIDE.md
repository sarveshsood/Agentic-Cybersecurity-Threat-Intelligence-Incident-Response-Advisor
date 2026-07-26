# ACTIRA — Admin Guide

## First-time setup

1. Install per [INSTALLATION.md](INSTALLATION.md).
2. Set strong `JWT_SECRET` (and `SECRETS_MASTER_KEY` outside pure lab).
3. Login as **admin@soc.example.com** (lab seed) or promote a user offline.
4. **Settings** → configure LLM provider + API key → Save.
5. Optional: TI keys, Slack webhook, email targets, HiTL thresholds.

## Settings semantics

- Secret fields always render blank after load; look for **✓ configured** / `has_*`.
- Runtime truth is Mongo; lab may sync back to `backend/.env` on save.
- `hitl_severity_min` + grounding thresholds control auto-approve **without ever bypassing severity**.

## Knowledge admin

- Custom KB ingest via UI/API.
- `POST /api/kb/reindex` after embedding backend changes.
- Vector status: `GET /api/kb/vector-status`.

## Evaluation

- **Golden Benchmark** page / `POST /api/eval/golden-benchmark` (admin).
- Use before releases when changing parsers, mapping, or playbook prompts.

## Production hard rules

| Never                          | Always                        |
|--------------------------------|-------------------------------|
| `SEED_DEMO_USERS=true` in prod | `ENV=production`              |
| Weak JWT                       | Explicit `SECRETS_MASTER_KEY` |
| Wildcard CORS with credentials | Mongo auth + backups          |
| Commit `.env`                  | TLS at edge                   |

See [SECURITY.md](../SECURITY.md) and [DEPLOYMENT.md](DEPLOYMENT.md).
