# ACTIRA API contract & spec-driven workflow

This doc covers how we keep the HTTP contract honest and how to use spec-first tooling when changing ingest, HiTL,
settings, or RAG routes.

## Source of truth

| Artifact                                         | Role                                                             |
|--------------------------------------------------|------------------------------------------------------------------|
| FastAPI routes in `backend/server.py` (+ models) | **Authoritative** runtime contract                               |
| Live schema                                      | `GET /openapi.json` when the API is running (`/docs` Swagger UI) |
| Committed snapshot                               | `docs/openapi.json` — checked into git for review & CI drift     |

Regenerate the snapshot after any route/request/response model change:

```bash
# from repo root (needs backend deps installed)
python backend/scripts/export_openapi.py
```

CI fails if the live schema drifts from the committed file:

```bash
python backend/scripts/export_openapi.py --check
```

Workflow: `.github/workflows/openapi-ci.yml`.

## When to update the snapshot

- New/removed `/api/*` path or method
- Change to path/query/body parameters (Pydantic models, `Query`, etc.)
- Change to response shapes that appear in OpenAPI (response_model, status codes you document)
- Auth dependency changes that alter security schemes if we add them later

Do **not** commit hand-edited `docs/openapi.json` — always re-export.

## Review checklist (API PRs)

1. Diff `docs/openapi.json` in the PR (should be intentional).
2. Breaking changes to `/api/logs/ingest`, `/api/review/*`, `/api/settings`, `/api/kb/*` need a short note in the PR
   description (clients / forwarders).
3. Secrets must never appear in the schema or in `GET /settings` payloads (allow-list only).

## Optional: GitHub Spec Kit

For multi-agent or large feature PRs (ingest, HiTL gate, RAG pipeline),
[github/spec-kit](https://github.com/github/spec-kit) can hold a short feature spec before code:

Suggested layout (optional, not required in-repo today):

```text
specs/
  2026-07-ingest-auth.md      # problem, API deltas, acceptance tests
  2026-07-hitl-auto-approve.md
```

Minimal spec template:

```markdown
# <feature>

## Goal
One paragraph.

## API contract delta
- Paths touched (link to OpenAPI operationIds after export)
- Request/response fields added/removed

## Acceptance
- [ ] Unit/API tests
- [ ] OpenAPI snapshot updated
- [ ] No secret leakage on GET /settings

## Out of scope
...
```

Wire Spec Kit’s agent instructions to:

1. Read `docs/openapi.json` + this file.
2. Prefer additive OpenAPI changes.
3. Run `python backend/scripts/export_openapi.py --check` before merge.

## Optional: OpenSpec / contract-first

[openspec.dev](https://openspec.dev/) is useful when external consumers (SIEMs, forwarders) depend on stable
`/api/logs/ingest` or settings. For ACTIRA today:

1. Design the JSON body against the existing FastAPI models.
2. Implement routes / Pydantic models.
3. Re-export OpenAPI and attach the path diff to the PR.

## Related routes (high churn)

| Area      | Paths (prefix `/api`)                                              |
|-----------|--------------------------------------------------------------------|
| Auth      | `/auth/login`, `/auth/register`, `/auth/me`                        |
| Ingest    | `/logs/upload`, `/logs/upload-batch`, `/logs/ingest`, `/logs/jobs` |
| Incidents | `/incidents`, `/incidents/{id}`, `/incidents/{id}/similar`         |
| HiTL      | `/review/queue`, `/review/{id}`                                    |
| RAG / KB  | `/kb/search`, `/kb/vector-status`, `/kb/reindex`                   |
| Analytics | `/analytics`, `/analytics/retrieval-compare`                       |
| Settings  | `/settings`, `/settings/reset`, profiles                           |
| Eval      | golden benchmark endpoints                                         |

## Local smoke

```bash
# backend running on 8001
curl -s http://127.0.0.1:8001/openapi.json | python -m json.tool | head
python backend/scripts/export_openapi.py --check
```
