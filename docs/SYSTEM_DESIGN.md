# ACTIRA — System Design

## 1. Design goals

| Goal              | Approach                                                  |
|-------------------|-----------------------------------------------------------|
| Fast time-to-demo | Seed users, sample logs, mock TI, one-command-ish compose |
| Defensible AI     | Citations + grounding score + HiTL                        |
| Secret hygiene    | Redacted GET settings, vault at rest, .env gitignored     |
| Offline CI        | Golden + mock TI; no live keys required                   |
| Extensibility     | Provider maps, parser registry, settings profiles         |

## 2. Non-goals (current release)

- Multi-tenant MSSP isolation
- Full SOAR action execution (block IP, isolate host)
- Real-time SIEM streaming connectors (beyond HTTP ingest)
- Global ATT&CK matrix product parity
- Guaranteed sub-second LLM playbooks

## 3. Key use cases

1. **Analyst uploads** SSH brute-force + exploit logs → incident + playbook
2. **Reviewer** approves critical playbook with audit trail
3. **Admin** rotates LLM/TI keys without code deploy
4. **Forwarder** pushes syslog lines via ingest key
5. **Admin** runs golden benchmark before release

## 4. Sequence — upload to review

```
Analyst                 API                  Worker/Pipeline           Mongo
   |--POST /logs/upload-->|                        |                     |
   |                      |--create log_job------->|                     |
   |                      |--enqueue/claim-------->|                     |
   |                      |                        |--parse/extract/...->|
   |                      |                        |--generate_playbook  |
   |                      |                        |--decide HiTL------->|
   |                      |                        |--insert incident--->|
   |--GET /incidents-----|<-read------------------|---------------------|
Reviewer                |                        |                     |
   |--POST /review/id---->|--atomic update status----------------------->|
   |                      |--audit_log---------------------------------->|
```

## 5. Consistency & concurrency

- Review actions use **conditional update** (only `pending_review` → terminal); second writer gets **409**.
- Job worker uses claim semantics (see `job_queue.py`) to reduce double-processing.
- Settings are single document `id=global` — last writer wins (admin only).

## 6. Configuration layers

| Layer                        | Source                             | Precedence                   |
|------------------------------|------------------------------------|------------------------------|
| Process env / `backend/.env` | Bootstrap infra + optional secrets | Boot + fallback              |
| Mongo `settings`             | Admin UI runtime                   | Runtime truth for ops/LLM/TI |
| Vault/AWS SM refs            | `vault://` / `awssm://` values     | Resolved at use              |

## 7. Error handling philosophy

- Pipeline failures → job `failed` + optional filesystem sidecar (`job_status`)
- LLM failures → fallback playbook / error surfaced in job
- Auth failures → sanitized 401 (no JWT library leakage)
- Validation → FastAPI 422 with field errors

## 8. Frontend design system

- Dark-mode-first SOC aesthetic (`design_guidelines.json`, tokens)
- Role-gated routes in `App.js`
- TanStack Query for server state
- Cookie session + axios `withCredentials`

## 9. Quality gates

See `Makefile` and `.github/workflows/*`: unit, lint, openapi drift, golden, security scan, e2e, release.
