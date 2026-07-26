# Appendix B — API surface (capstone extract)

**Location:** docs/capstone/appendices/B_api_surface.md

**Source snapshot:** curated from repository OpenAPI for submission (dual mount /api and /api/v1).

**Total documented paths in source OpenAPI:** 178

## Mounts

| Mount | Purpose |
|-------|---------|
| /api | Primary SPA and integrations |
| /api/v1 | Versioned parity for modular clients |

## Selected endpoints (submission-facing)

| Path | Methods |
|------|---------|
| /api/analytics | GET |
| /api/analytics/retrieval-compare | GET |
| /api/attack/catalog | GET |
| /api/attack/catalog/{technique_id} | GET |
| /api/attack/matrix | GET |
| /api/audit | GET |
| /api/audit/integrity | GET |
| /api/audit/logs | GET |
| /api/audit/summary | GET |
| /api/audit/telemetry | POST |
| /api/auth/login | POST |
| /api/auth/logout | POST |
| /api/auth/me | GET |
| /api/auth/oidc/callback | GET |
| /api/auth/oidc/config | GET |
| /api/auth/oidc/login | GET |
| /api/auth/register | POST |
| /api/compliance/evidence-pack | GET |
| /api/compliance/executive-export | GET |
| /api/compliance/gaps | GET |
| /api/compliance/score | GET |
| /api/compliance/status | GET |
| /api/eval/golden-benchmark | GET POST |
| /api/health | GET |
| /api/hunt | GET |
| /api/hunt/behavior | GET |
| /api/hunt/suggestions | GET |
| /api/incidents | GET |
| /api/incidents/{incident_id} | GET |
| /api/incidents/{incident_id}/behavior | GET |
| /api/incidents/{incident_id}/citations | GET |
| /api/incidents/{incident_id}/investigate | POST |
| /api/incidents/{incident_id}/investigate/stream | POST |
| /api/incidents/{incident_id}/investigations | GET |
| /api/incidents/{incident_id}/similar | GET |
| /api/incidents/{incident_id}/workspace | GET |
| /api/incidents/{incident_id}/workspace/entity-graph | GET |
| /api/incidents/{incident_id}/workspace/notes | GET POST |
| /api/incidents/{incident_id}/workspace/notes/{note_id} | DELETE PATCH |
| /api/incidents/{incident_id}/workspace/rca | GET POST |
| /api/incidents/{incident_id}/workspace/timeline | GET |
| /api/kb/custom | GET |
| /api/kb/custom/{doc_id} | DELETE |
| /api/kb/ingest | POST |
| /api/kb/lora/status | GET |
| /api/kb/lora/train | POST |
| /api/kb/reindex | POST |
| /api/kb/retrieval-eval | GET |
| /api/kb/search | GET |
| /api/kb/vector-status | GET |
| /api/kb/{doc_id} | GET |
| /api/kpis | GET |
| /api/logs/ingest | POST |
| /api/logs/ingest/raw | POST |
| /api/logs/jobs | GET |
| /api/logs/jobs/{job_id} | GET |
| /api/logs/jobs/{job_id}/events | GET |
| /api/logs/jobs/{job_id}/resume | POST |
| /api/logs/upload | POST |
| /api/logs/upload-batch | POST |
| /api/ready | GET |
| /api/review/queue | GET |
| /api/review/{incident_id} | POST |
| /api/settings | GET POST PUT |
| /api/settings/apply-profile | POST |
| /api/settings/clear-secrets | POST |
| /api/settings/email-outbox | GET |
| /api/settings/email-status | GET |
| /api/settings/llm-catalog | GET |
| /api/settings/profiles | GET |
| /api/settings/reset | POST |
| /api/settings/slack-status | GET |
| /api/settings/test-email | POST |
| /api/settings/test-llm | POST |
| /api/settings/test-slack | POST |
| /api/v1/analytics | GET |
| /api/v1/analytics/retrieval-compare | GET |
| /api/v1/attack/catalog | GET |
| /api/v1/attack/catalog/{technique_id} | GET |
| /api/v1/attack/matrix | GET |
| /api/v1/audit | GET |
| /api/v1/audit/integrity | GET |
| /api/v1/audit/logs | GET |
| /api/v1/audit/summary | GET |
| /api/v1/audit/telemetry | POST |
| /api/v1/auth/login | POST |
| /api/v1/auth/logout | POST |
| /api/v1/auth/me | GET |
| /api/v1/auth/oidc/callback | GET |
| /api/v1/auth/oidc/config | GET |
| /api/v1/auth/oidc/login | GET |
| /api/v1/auth/register | POST |
| /api/v1/compliance/evidence-pack | GET |
| /api/v1/compliance/executive-export | GET |
| /api/v1/compliance/gaps | GET |
| /api/v1/compliance/score | GET |
| /api/v1/compliance/status | GET |
| /api/v1/eval/golden-benchmark | GET POST |
| /api/v1/health | GET |
| /api/v1/hunt | GET |
| … | (+54 more matching paths in full OpenAPI) |

## Capability groups

| Group | Examples |
|-------|----------|
| Auth | login, logout, me, register, OIDC scaffold |
| Ingest | logs/upload, jobs, batch |
| Incidents | list, detail, investigate stream |
| Workspace | timeline, graph, notes, RCA |
| Review / HiTL | queue, approve/reject |
| Hunt | NL hunt, behavior |
| Analytics / KPIs | dashboard metrics |
| Settings / LLM | catalog, vault, test-llm |
| Compliance | score, gaps, evidence, executive-export |
| Audit | list, integrity, summary |
| KB / RAG | search, ingest, vector-status |
| Eval | golden-benchmark |
| ATT&CK | catalog, matrix |
| Ops | health, ready |

## Notes for evaluators

- Cookie session auth applies to most routes; RBAC enforced on mutate/admin paths.
- This appendix is the submission-facing surface list kept inside the capstone pack.
- Dual /api and /api/v1 prefixes share handlers for modular clients.
