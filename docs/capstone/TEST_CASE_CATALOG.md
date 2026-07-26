# ACTIRA — Master Test Case Catalog (Capstone Submission)

**Product:** ACTIRA — Agentic Cybersecurity Threat Intelligence & Incident Response Advisor  
**Purpose:** Formal test catalog for evaluation report, viva, and regression evidence  
**Last updated:** 2026-07-26  
**Automation map:** pytest (`backend/tests/`), Playwright (`frontend/e2e/`), manual (M)

**Legend**

| Field | Values |
|-------|--------|
| **Priority** | P0 Critical · P1 High · P2 Medium · P3 Low |
| **Type** | Functional · Security · API · UI · Performance · AI/RAG · Integration |
| **Automation** | Auto (pytest/Playwright) · Semi · Manual |
| **Status** | Pass / Fail / Blocked / Not run |

---

## 1. Traceability to Capstone Project 4

| Capstone capability | Test IDs |
|--------------------|----------|
| Log parse & IoC extract | TC-ING-001…, TC-PAR-001… |
| TI enrichment | TC-TI-001… |
| ATT&CK mapping | TC-ATK-001… |
| RAG + playbook | TC-AI-001…, TC-RAG-001… |
| HiTL | TC-HITL-001… |
| Dashboard | TC-DASH-001… |
| Investigation workspace | TC-WS-001… |
| Auth / RBAC | TC-AUTH-001… |
| Compliance / audit | TC-CMP-001…, TC-AUD-001… |
| Fallbacks / resilience | TC-RES-001… |

---

## 2. Authentication & Authorization

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-AUTH-001 | Login valid analyst | POST `/auth/login` with seeded analyst | 200, cookie session, role analyst | P0 | Security | Auto | `test_hardening`, e2e smoke |
| TC-AUTH-002 | Login invalid password | Wrong password | 401, lockout counter increments | P0 | Security | Auto | hardening |
| TC-AUTH-003 | Lockout after N failures | Fail login ≥ threshold | Locked until window | P0 | Security | Auto | auth_throttle |
| TC-AUTH-004 | RBAC: settings mutate admin only | Analyst PUT `/settings` | 403 | P0 | Security | Auto | `test_rbac_matrix` |
| TC-AUTH-005 | RBAC: review senior/admin | Analyst POST review | 403 | P0 | Security | Auto | rbac |
| TC-AUTH-006 | Cookie session revalidate | Login → GET `/auth/me` after 5m path | Role refreshed | P1 | Security | Manual/Semi | auth.jsx |
| TC-AUTH-007 | Logout clears cookie | POST `/auth/logout` | Subsequent API 401 | P0 | Security | Auto/e2e | smoke |
| TC-AUTH-008 | Weak JWT rejected outside lab | Start API with weak secret ENV=prod | Fail start / refuse | P0 | Security | Auto | hardening |
| TC-AUTH-009 | Register creates analyst only | Public register | Role always analyst | P1 | Security | Auto | auth |
| TC-AUTH-010 | OIDC scaffold off by default | No OIDC env | Password login only | P1 | Security | Manual | oidc |

---

## 3. Ingest & Parsing

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-ING-001 | Single log upload | Upload apache/syslog sample | Job queued → completed, incident created | P0 | Integration | Auto/Manual | pipeline, smoke |
| TC-ING-002 | Multi-file ZIP | Upload ZIP package | One correlated incident, multi_file flag | P0 | Integration | Manual/Auto | pipeline |
| TC-ING-003 | ZIP bomb protection | Oversized nested ZIP | Rejected / safe fail | P0 | Security | Auto | pipeline isolation |
| TC-ING-004 | Suricata EVE parse | Upload Suricata JSON sample | Events parsed to CES | P1 | Functional | Auto | broader_parsers |
| TC-ING-005 | Zeek parse | Zeek log sample | Parsed fields present | P1 | Functional | Auto | broader_parsers |
| TC-ING-006 | Sysmon JSON | Sysmon sample | Process fields extracted | P1 | Functional | Auto | broader_parsers |
| TC-ING-007 | Defender parse | Defender sample | Parsed | P1 | Functional | Auto | broader_parsers |
| TC-ING-008 | Job status polling | After upload poll jobs | status transitions visible | P0 | UI/API | Manual/e2e | Upload page |
| TC-ING-009 | Sample bundle button | Click Stage 3-File Bundle | Files staged in queue | P1 | UI | Manual | Upload |
| TC-PAR-001 | IoC IP extraction | Log with IPs | IoCs type=ip | P0 | Functional | Auto | golden |
| TC-PAR-002 | IoC domain/url/hash | Mixed log | Correct types | P0 | Functional | Auto | golden |
| TC-PAR-003 | Parser isolation failure | One bad file in batch | Other files still process | P1 | Functional | Auto | pipeline_isolation |

---

## 4. Threat Intelligence & ATT&CK

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-TI-001 | Mock enrichment without keys | Clear TI keys, ingest | IoC enrichment mock=true | P0 | Functional | Auto | enrichment |
| TC-TI-002 | Live AbuseIPDB when keyed | Set key, ingest IP | mock=false when API ok | P1 | Integration | Manual | enrichment |
| TC-TI-003 | FORCE_MOCK_TI | Set env true | Always mock | P1 | Functional | Auto | tests |
| TC-ATK-001 | Keyword ATT&CK map | Brute force log | Techniques include T1110-class | P0 | AI | Auto | attack_mapping, golden |
| TC-ATK-002 | Heatmap counts | Open Dashboard heatmap | Counts match incidents | P1 | UI | Manual | Dashboard |
| TC-ATK-003 | Technique filter | Incidents `?technique=T1110` | Filtered list | P1 | Functional | Manual | Incidents |
| TC-ATK-004 | Catalog matrix API | GET `/attack/matrix` | Columns/techniques | P2 | API | Auto | attack_matrix |

---

## 5. AI / RAG / Playbooks / Investigator

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-AI-001 | Playbook structured JSON | Pipeline with LLM key | playbook.steps phases present | P0 | AI | Semi | playbook_agent |
| TC-AI-002 | Template fallback no key | Clear LLM keys, run pipeline | llm_provider=template, hitl likely | P0 | AI | Auto | golden offline |
| TC-AI-003 | Citation allow-list | Generated playbook | citation_ids ⊆ KB | P0 | AI | Auto | playbook |
| TC-AI-004 | Grounding score range | Any playbook | 0–1 float | P0 | AI | Auto | golden |
| TC-AI-005 | Cross-provider fallback | Primary fails, secondary key set | eff provider changes, log fallback | P1 | AI | Semi | llm_provider |
| TC-AI-006 | JSON parse resilience | Fenced/trailing comma LLM output | parse_llm_json succeeds | P0 | AI | Auto | unit parse |
| TC-AI-007 | Investigator SSE | Stream investigate | tokens + done | P1 | AI | Semi | ai_investigator |
| TC-AI-008 | Prompt injection note | Note with “ignore system” | Delimiters / no tool exec | P0 | Security | Auto | investigate_prompt_safety |
| TC-AI-009 | RCA fallback | No LLM budget/key | fallback RCA + reason | P1 | AI | Auto | test_rca |
| TC-RAG-001 | Hybrid search | KB search hybrid | Results with scores | P0 | AI | Auto | vector_rag |
| TC-RAG-002 | BM25 fallback | Vector disabled path | BM25 still works | P1 | AI | Auto | vector |
| TC-RAG-003 | Golden retrieval pairs | Offline retrieval eval | Hit@k thresholds | P1 | AI | Auto | retrieval |
| TC-GOLD-001 | Golden IR offline suite | `pytest test_golden_benchmark` | Pass CI gates | P0 | AI | Auto | golden-ci |
| TC-GOLD-002 | Golden UI run | Admin Golden page Run | Metrics render | P1 | UI | Manual | GoldenBenchmark |

---

## 6. HiTL / Review

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-HITL-001 | Critical forces review | Critical incident | hitl_required true | P0 | Functional | Auto | hitl_gate |
| TC-HITL-002 | Low grounding forces review | Low ground playbook | pending_review | P0 | Functional | Auto | hitl |
| TC-HITL-003 | Approve with comment | Reviewer approve + notes | status approved, audit entry | P0 | Functional | Auto/e2e | review |
| TC-HITL-004 | Reject without comment | Empty comment | Client/server validation error | P0 | Functional | Manual | Review UI |
| TC-HITL-005 | Double approve race | Concurrent approve | One 409, one success | P1 | Functional | Auto | review claim |
| TC-HITL-006 | Review queue filters | Filter severity/threat | List updates | P2 | UI | Manual | ReviewQueue |

---

## 7. Investigation Workspace

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-WS-001 | Load incident | Open `/incidents/:id` | Case loads | P0 | UI | Auto | workspace tests |
| TC-WS-002 | 404 incident | Bad id | Error state not infinite load | P0 | UI | Manual | IncidentDetail |
| TC-WS-003 | Timeline API | GET timeline | Events ordered | P0 | API | Auto | workspace_views |
| TC-WS-004 | Entity graph | Assets/Users tabs | Graph/entities | P1 | UI | Auto | workspace |
| TC-WS-005 | Notes CRUD | Create note | Persists, audit | P0 | API | Auto | workspace_api |
| TC-WS-006 | RCA generate | POST rca | Narrative or fallback | P1 | AI | Auto | rca |
| TC-WS-007 | Tab URL state | Change tab | `?tab=` updates | P2 | UI | Manual | WorkspaceTabs |
| TC-WS-008 | Similar cases | GET similar | List or disabled reason | P2 | API | Auto | similar |

---

## 8. Dashboard / Analytics / Hunt

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-DASH-001 | Live KPIs without demo flag | Open Dashboard, flag unset | Real Mongo counts; no DEMO banner | P0 | UI | Manual | Dashboard |
| TC-DASH-002 | Empty tenant zeros | Fresh DB | Zeros/empty charts, not fake 65 incidents | P0 | UI | Manual | Dashboard |
| TC-DASH-003 | Atomic load | Network throttle | KPIs+table paint together | P1 | Performance | Manual | Dashboard |
| TC-DASH-004 | KPI fields complete | GET `/kpis` | high/medium/events/iocs/top_techniques present | P0 | API | Auto | analytics_service |
| TC-DASH-005 | Demo flag banner | Set REACT_APP_DASHBOARD_DEMO_FALLBACK=true empty DB | DEMO DATA banner | P1 | UI | Manual | Dashboard |
| TC-AN-001 | Analytics window | Change 7/30 days | Charts refresh | P1 | UI | Manual/e2e | Analytics |
| TC-AN-002 | Analytics API error | Stop backend mid-page | Error message (not infinite load) | P1 | UI | Manual | Analytics |
| TC-HUNT-001 | NL hunt PowerShell | Query “suspicious PowerShell” | Results scored | P0 | Functional | Auto | hunting |
| TC-HUNT-002 | Behavior hotspots | Open Hunt | Hotspot cards if signals | P1 | Functional | Auto | behavior |

---

## 9. Compliance / Audit / Settings

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-CMP-001 | Compliance status | GET `/compliance/status` | score, frameworks, domains | P0 | API | Auto | compliance_score |
| TC-CMP-002 | OIDC gap production | ENV=prod no OIDC | IAM-03 in gaps | P1 | Functional | Auto | compliance_score |
| TC-CMP-003 | Evidence pack download | UI button | JSON file | P1 | UI | Manual | Compliance |
| TC-CMP-004 | Executive export | GET executive-export | markdown + score | P1 | API | Auto | executive_export |
| TC-AUD-001 | Audit list normalize | Approve incident → Audit page | analyst, incident_id, comment mapped | P0 | Functional | Manual/Auto | audit |
| TC-AUD-002 | Hash integrity | GET `/audit/integrity` | status ok/partial/legacy | P1 | Security | Auto | audit_intelligence |
| TC-AUD-003 | Summary narrative | GET `/audit/summary` | bullets + counts | P1 | Functional | Auto | audit |
| TC-SET-001 | Save LLM provider | Change provider+model, Save | Persists; toast shows pair | P0 | UI | Manual | Settings |
| TC-SET-002 | Invalid model soft warn | Custom model id | Warning not hard block | P1 | UI | Manual | Settings |
| TC-SET-003 | LLM catalog API | GET `/settings/llm-catalog` | free/paid lists | P1 | API | Auto | executive_export routes |
| TC-SET-004 | Test LLM | Admin test connection | ok or structured error | P2 | Integration | Manual | Settings |
| TC-SET-005 | Clear TI secrets | Confirm clear | has_* false, mock TI | P1 | Security | Manual | Settings |

---

## 10. API / Modular / Ops

| ID | Title | Steps | Expected | Priority | Type | Automation | Module |
|----|-------|-------|----------|----------|------|------------|--------|
| TC-API-001 | `/api` vs `/api/v1` parity | Same path both prefixes | Same shape | P0 | API | Auto | modular_api_v1 |
| TC-API-002 | OpenAPI drift | export --check | Match docs/openapi.json | P0 | API | Auto | openapi-ci |
| TC-API-003 | Health / ready | GET health/ready | mongo status | P0 | Ops | Auto | smoke |
| TC-API-004 | Metrics auth | GET metrics without admin | 401/403 | P1 | Security | Auto | ops |
| TC-OPS-001 | Multi-replica worker flag | ACTIRA_JOB_WORKER=0 | No double process | P1 | Ops | Auto | ha_multi_replica |
| TC-OPS-002 | Retention purge dry | Ops retention path | Policy applied | P2 | Ops | Auto | wave3 |

---

## 11. Security Suite

| ID | Title | Expected | Priority | Automation |
|----|-------|----------|----------|------------|
| TC-SEC-001 | No secrets in public settings | has_* only | P0 | Auto |
| TC-SEC-002 | Path traversal upload | Rejected | P0 | Auto |
| TC-SEC-003 | XSS in note title | Escaped in UI | P1 | Manual |
| TC-SEC-004 | CSRF cookie SameSite | Configured per CORS | P1 | Manual |
| TC-SEC-005 | Bandit / pip-audit CI | Green | P1 | Auto CI |
| TC-SEC-006 | Password policy | <12 rejected | P0 | Auto |

---

## 12. UI / E2E Smoke Matrix

| ID | Flow | Expected | Automation |
|----|------|----------|------------|
| TC-E2E-001 | Login → Dashboard | KPIs load | Playwright smoke |
| TC-E2E-002 | Upload sample → job | Completes | workflow |
| TC-E2E-003 | Open incident → workspace tabs | Tabs switch | Manual (expand e2e) |
| TC-E2E-004 | Review approve | Queue updates | smoke/workflow |
| TC-E2E-005 | Theme toggle | Dark/light | theme-visual |
| TC-E2E-006 | Logout | Login page | smoke |
| TC-E2E-007 | Settings admin only | Analyst 403/redirect | smoke |

**Known gap:** Align testids (`dash-ingest-cta`, `incidents-filter-severity`, `kb-page`) — track as P1.

---

## 13. Performance (manual / harness)

| ID | Title | Expected | Priority |
|----|-------|----------|----------|
| TC-PERF-001 | Dashboard first paint | KPIs+table atomic; <3s lab | P1 |
| TC-PERF-002 | KPI cache | Second `/kpis` faster (cache hit) | P2 |
| TC-PERF-003 | Benchmarks smoke | `benchmarks/run_benchmarks.py` | P2 |
| TC-PERF-004 | 10 concurrent uploads | No crash; jobs complete | P2 |

---

## 14. Execution Commands (for report appendix)

```bash
# Unit / backend (lab)
cd backend
python -m pytest tests -q --tb=line

# Golden offline
python -m pytest tests/test_golden_benchmark.py -q

# Wave C / resilience
python -m pytest tests/test_compliance_score.py tests/test_audit_intelligence.py tests/test_llm_fallback_catalog.py tests/test_executive_export.py -q

# Frontend e2e (stack up)
cd frontend
npx playwright test e2e/smoke.spec.js
```

---

## 15. Suggested test summary table (fill after run)

| Suite | Total | Pass | Fail | Blocked | Date |
|-------|------:|-----:|-----:|--------:|------|
| Golden IR | | | | | |
| Backend unit | | | | | |
| Security | | | | | |
| Playwright smoke | | | | | |
| Manual P0 | | | | | |

---

*Use this catalog as the Test Plan appendix in the project report. Mark Status after each formal run.*
