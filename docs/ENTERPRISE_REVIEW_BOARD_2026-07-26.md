# ACTIRA — 360° Enterprise Review Board Report

**Date:** 2026-07-26  
**Panel (simulated):** CTO, CIO, CISO, CPO, VP Engineering, Principal Architects (Software, Frontend, Backend, AI/ML, Security, Cloud), DevOps/SRE, UX/Product Design, Accessibility, SOC Manager, Senior Analyst, IR Lead, DFIR, Threat Intel Lead, Compliance/Audit, Data/DB/API Architects, Performance, QA/Automation, Release Manager, Enterprise Customer, End User, Platform Admin, Technical Writer  

**Scope:** Full product — frontend, backend, AI, API, data, auth, pipeline, TI, investigation, compliance/audit, settings, CI/CD, deployment, security, UX, docs, roadmap  

**Method:** Code and documentation review of the live repository (modular monolith FastAPI + React + MongoDB + LanceDB). Not a formal pen-test, load cert, or SOC 2 audit.

**Positioning (code-aligned):**  
Single-tenant, human-gated **AI incident-response advisor / SOC investigation copilot** — not a SIEM, XDR, or SOAR of record.

---

## 1. Executive Summary

ACTIRA is a **credible, unusually complete AI SOC assist platform for demos and controlled single-tenant pilots**. The end-to-end narrative is real: multi-format ingest → correlation → IoC/TI → ATT&CK heuristics → hybrid RAG → citation-grounded playbooks → HiTL → investigation workspace → audit/compliance surfaces. Engineering hygiene (RBAC, vault, lockouts, golden offline eval, OpenAPI drift CI, multi-workflow GitHub Actions) is above typical MVP/capstone quality.

It is **not** enterprise multi-tenant production software, not a replacement for Microsoft Sentinel / Splunk ES / Cortex XSIAM / CrowdStrike, and not unsupervised IR automation.

| Dimension | Verdict |
|-----------|---------|
| **Overall enterprise score** | **76 / 100** (honest production-candidate pilot) |
| **Self-assessed board score in ROADMAP** | ~89–90 (documentation/demo packaging heavy) |
| **Maturity label** | **Enterprise Pilot Ready (single-tenant)** — one step above pure MVP, below production multi-org |
| **Ship executive demo?** | **Yes** |
| **Ship single-tenant lab/pilot?** | **Yes**, with hard config gates |
| **Ship multi-tenant SaaS / MSSP?** | **No** |
| **Ship as Sentinel competitor?** | **No** (explicit non-goal) |

### Top 5 strengths

1. End-to-end IR story with HiTL and grounding (explainability > hype).  
2. Modular API post-extraction (`server.py` ~485 LOC; domain routers + services).  
3. Offline golden evaluation + CI culture (rare and valuable).  
4. Investigation Workspace MVP (timeline, RCA, entity graph, notes, assistant).  
5. Security baseline above typical MVP (vault, throttle, ZIP guards, metrics auth).

### Top 5 risks

1. **Identity:** OIDC scaffold without production JWKS verification; no native MFA.  
2. **Trust UX:** Dashboard can fall back to **demo KPIs/incidents** when empty.  
3. **Oversell risk:** Heuristic ATT&CK, mock TI, self-scored “compliance,” speculative LLM model IDs.  
4. **Tenancy:** No `org_id` isolation — hard stop for multi-customer SaaS.  
5. **Scale/HA:** Mongo + in-process job worker + local LanceDB — pilot-class, not certified multi-node SOC scale.

### Final maturity verdict

| Label | Selected? |
|-------|-----------|
| Proof of Concept | No |
| MVP | Surpassed |
| **Enterprise Pilot Ready** | **Yes (primary)** |
| Production Ready (single-tenant lab) | Borderline — only with ops discipline |
| Enterprise Production Ready (multi-tenant / MSSP) | **No** |

---

## 2. Maturity Assessment (0–100)

| Domain | Score | Rationale |
|--------|------:|-----------|
| Architecture | 78 | Modular monolith sound; incomplete repo coverage; dual facades |
| Backend | 77 | Routers/services/jobs solid; residual god-modules and incomplete DI |
| Frontend | 74 | Strong Settings/Compliance/Review; trust/a11y/mobile gaps |
| AI / Agentic | 72 | Grounded pipeline + fallbacks; not multi-agent; hash embed default |
| Security | 71 | Above MVP; SSO/MFA/CSP/global rate-limit gaps |
| Performance | 58 | Fine for pilot; no 100–500 user certification |
| Scalability | 52 | Single-tenant vertical scale only |
| UX | 73 | Cohesive shell/design system; demo fallbacks & login theme hurt trust |
| Documentation | 90 | Exceptional pack (ops, diagrams, governance, API clients) |
| Testing | 76 | Golden + security + e2e; coverage of new surfaces thin; some E2E drift |
| Operations / DevOps | 74 | Compose + Helm + multi-CI; HA/OTEL scaffolds not certified |
| Compliance | 62 | Alignment score + docs ≠ certification; optimistic evidence flags |
| Maintainability | 70 | Better post-modularization; Settings mega-page; incomplete repos |
| Innovation | 81 | Grounded IR + workspace + HiTL + golden eval is differentiated |
| Business value | 78 | Clear SOC pain; honest scope when messaging holds |
| **Enterprise readiness** | **64** | Pilot, not Fortune-100 production |
| **Weighted overall** | **76** | See methodology below |

**Weighting (enterprise production lens):** Security 15%, Architecture 12%, Scalability 10%, Ops 10%, AI honesty 8%, Testing 8%, UX 8%, Compliance 7%, Backend 7%, Frontend 5%, Docs 5%, Performance 5%.

**Note on prior ~89 score:** That figure is defensible as **demonstration + packaging maturity**. This board re-scores under **production deployment readiness**, which correctly lowers scale, tenancy, identity, and compliance claim quality.

---

## 3. Detailed Findings

Severity: **Critical / High / Medium / Low**

### 3.1 Architecture & Backend

| ID | Area | Description | Sev | Business impact | Recommendation | Effort | Risk if ignored |
|----|------|-------------|-----|-----------------|----------------|--------|-----------------|
| A-01 | Tenancy | No `org_id`; global settings `id=global` | Critical | Cannot sell multi-customer SaaS | Design tenancy before commercial multi-org | XL | Customer data crossover |
| A-02 | Identity | OIDC id_token path without JWKS verify; in-memory PKCE state | Critical* | SSO claim unsafe in prod | JWKS verify + shared state store | M | Account takeover via forged tokens |
| A-03 | Secrets | Vault may derive from JWT if master key unset | High | Crypto key ops failure / weak coupling | Mandate `SECRETS_MASTER_KEY` in prod | S | Secret rotation breaks / weak crypto |
| A-04 | Jobs | In-process worker; multi-API-replica risk of double work | High | Duplicate pipeline / cost | Dedicated worker Deployment in Helm | M | Unreliable processing |
| A-05 | Layering | Repos only 4 domains; engines still flat | Medium | Velocity tax as team grows | Extend repos for jobs/KB | M | Inconsistent data access |
| A-06 | API versioning | `/api/v1` is alias of `/api` | Low | Future breaking changes harder | Real version policy | S | Client churn later |

\*Critical only if OIDC is enabled in production without fixes.

**Strengths:** Modular routers; durable Mongo job claim; HiTL pure policy; password policy + lockout; dual `/api` + `/api/v1`; OpenAPI export CI.

### 3.2 Frontend & UX (every major surface)

| Page | Score | Issues (top) | Sev | Priority |
|------|------:|--------------|-----|----------|
| Login | 62 | Hardcoded light theme; static “live status” | High | P0 |
| Dashboard | 68 | **Demo KPI/incident fallback** masks empty/failure | Critical (trust) | P0 |
| Upload / Ingest | 82 | Dense on mobile | Low | P3 |
| Incidents list | 84 | Client-side page size ~200; not server pagination | Medium | P2 |
| Incident Detail / Workspace | 80 | **No load error → infinite loading** | Critical | P0 |
| Hunt | 78 | Toast-only failures; table overflow | Medium | P1 |
| Analytics | 70 | No main-path error state | High | P0 |
| Review Queue | 86 | Dense filters on mobile | Medium | P2 |
| Audit Trail | 80 | Not in command palette; dual filter | Low–Med | P2 |
| Compliance | 83 | Self-score can read as certification | Medium | P1 |
| Knowledge | 79 | Testid drift; toast-heavy errors | Medium | P2 |
| Settings | 88 | Large file; best enterprise admin surface | Low | P3 |
| Ops Health | 80 | Thin metrics story | Medium | P2 |
| Golden Benchmark | 84 | Admin-only eval UX solid | Low | P3 |
| Roadmap | 75 | Product roadmap inside SOC app dilutes ops focus | Low | P3 |
| Forbidden / 404 | 72 | Telemetry path risk; 404 requires auth | Medium | P1 |
| Shell / Nav | 80 | No true mobile drawer | High | P1 |

**Cross-cutting UX**

| ID | Description | Sev |
|----|-------------|-----|
| UX-01 | Dashboard demo data without unmistakable “DEMO” banner | Critical |
| UX-02 | Incident detail stuck loading on API failure | Critical |
| UX-03 | Login ignores dark mode / design tokens | High |
| UX-04 | Mobile sidebar not off-canvas | High |
| UX-05 | Dual empty-state components (`ListState` vs DS) | Medium |
| UX-06 | Command palette missing Audit/Compliance | Medium |
| UX-07 | E2E testid drift (smoke ingest, severity filter, knowledge page) | High (CI truth) |

### 3.3 AI Layer

| ID | Description | Sev | Recommendation |
|----|-------------|-----|----------------|
| AI-01 | “Multi-agent” vision vs fixed pipeline + LLM stages | High (honesty) | Market as pipeline copilot until agent roster ships |
| AI-02 | Default hash embeddings | Medium | Default or document sbert for quality demos |
| AI-03 | Golden eval uses template playbooks offline | Medium | Separate live-LLM eval track for quality claims |
| AI-04 | Speculative model IDs in catalog | Medium | Tag experimental IDs; validate with provider list API where possible |
| AI-05 | Cross-provider fallback + template playbook | Strength | Keep; surface effective provider in UI |
| AI-06 | Prompt injection hygiene (untrusted notes, citation allow-list) | Strength | Keep |

### 3.4 Threat Intelligence & Investigation

| ID | Description | Sev |
|----|-------------|-----|
| TI-01 | Mock TI default — correct for demos, dangerous if oversold | High if oversold |
| TI-02 | ATT&CK heuristic keyword mapping ≠ detection coverage | High if oversold |
| TI-03 | Hunt is rule-based over incidents, not lake-scale hunting | Medium |
| TI-04 | Behavior analytics = deterministic MVP signals | Medium |
| INV-01 | Workspace MVP is real (timeline/RCA/graph/notes) | Strength |
| INV-02 | Missing assign/comments/SLA product collab | Medium (roadmap) |

### 3.5 Digital Forensics

| Capability | Status | Note |
|------------|--------|------|
| Memory / Volatility | Not productized | Out of scope for current wave |
| Disk / MFT / Prefetch | Not productized | Future forensics agent |
| PCAP deep analysis | Not productized | |
| EVTX | Scaffold only | Partial |
| Event logs via parsers | Partial | Sysmon/Defender/Zeek/Suricata present as text/JSON paths |
| YARA / Sigma | Not core product | |
| **Verdict** | **Not a DFIR lab** | Position as IR advisor with limited artifact parsers |

### 3.6 Compliance & Audit

| ID | Description | Sev |
|----|-------------|-----|
| C-01 | Score is product-alignment, not certification | High (messaging) |
| C-02 | Many evidence flags hard-true / optimistic | Medium |
| C-03 | Audit hash chain is best-effort, not WORM | Medium |
| C-04 | Executive export + evidence pack exist | Strength |
| C-05 | Strong docs maps (ISO/NIST/SOC2/CIS) | Strength for demos |

### 3.7 Security

| ID | Description | Sev |
|----|-------------|-----|
| S-01 | Prod misconfig (weak JWT, seed users) | Critical if process fails |
| S-02 | No MFA on password path | High |
| S-03 | No global API rate limit (auth-only throttle) | Medium |
| S-04 | Missing CSP/HSTS at app (rely on edge) | Medium |
| S-05 | JWT still returnable in body by default | Medium |
| S-06 | CORS misconfig risk with credentials | Medium |
| S-07 | RBAC + lockout + vault + ZIP guards | Strength |
| S-08 | No SOAR auto-execution (reduces blast radius) | Strength |

### 3.8 API & Data

| ID | Description | Sev |
|----|-------------|-----|
| API-01 | REST generally clear; dual mount good | Strength |
| API-02 | Incidents list scale: client-side filtering risk | Medium |
| API-03 | OpenAPI drift CI | Strength |
| DB-01 | Indexes for main paths present | Strength |
| DB-02 | LanceDB local files multi-node sticky | High for HA |
| DB-03 | No formal migration framework | Medium |

### 3.9 DevOps / Performance / Testing

| ID | Description | Sev |
|----|-------------|-----|
| OPS-01 | Compose + Helm + cloud runbooks | Strength (scaffold) |
| OPS-02 | OTEL soft-dep; metrics are simple JSON | Medium |
| OPS-03 | Demo seed default in compose | High (process) |
| PERF-01 | No signed 100/500-user load report | High for capacity claims |
| TEST-01 | Golden + security suites strong | Strength |
| TEST-02 | E2E drift / missing Hunt-Compliance-Workspace coverage | High |
| TEST-03 | 95% coverage claim needs CI verification | Medium |

### 3.10 Documentation & Product

| ID | Description | Sev |
|----|-------------|-----|
| DOC-01 | Exceptional docs volume | Strength |
| DOC-02 | FEATURE_INVENTORY vs ROADMAP drift (workspace status) | Medium |
| DOC-03 | ENTERPRISE_REVIEW F-001 partially stale | Low |
| PROD-01 | Strong differentiator: grounded playbooks + HiTL + workspace | Strength |
| PROD-02 | Connectors / multi-tenant / SOAR execution = v2+ | Expected |

---

## 4. Technical Debt Register

| ID | Item | Area | Sev | Effort | Owner suggestion |
|----|------|------|-----|--------|------------------|
| TD-01 | Complete repository layer (jobs, KB, roadmap) | Backend | M | M | Backend |
| TD-02 | Split Settings.jsx | Frontend | M | M | Frontend |
| TD-03 | Remove `frontend/src/pages/bkp` and backend backup dead weight | Repo hygiene | L | S | All |
| TD-04 | Unify empty/loading state components | Frontend | M | S | Frontend |
| TD-05 | Align FEATURE_INVENTORY / ROADMAP / OpenAPI always | Docs | M | S | Product |
| TD-06 | Real API versioning policy | API | L | M | Architect |
| TD-07 | Shared OIDC state store | Auth | H | M | Security |
| TD-08 | Dedicated job-worker process in all deploy paths | Ops | H | M | DevOps |
| TD-09 | Server-side pagination for incidents | Backend/FE | M | M | Full-stack |
| TD-10 | Model catalog validation against live provider APIs | AI | M | M | AI |
| TD-11 | E2E testid and smoke suite repair | QA | H | S | QA |
| TD-12 | Error boundaries beyond chunk load | Frontend | M | S | Frontend |
| TD-13 | Dual import facades (`database` vs `core.database`) | Backend | L | S | Backend |
| TD-14 | Speculative LLM model IDs | AI/UX | M | S | AI |
| TD-15 | Optimistic compliance evidence flags | Compliance | M | S | Backend |

---

## 5. Security Risk Register (prioritized)

| Rank | Risk | Likelihood | Impact | Residual | Mitigation |
|------|------|------------|--------|----------|------------|
| 1 | Weak JWT / demo seed in shared env | M | Critical | High | Prod checklist automation; refuse weak secrets |
| 2 | OIDC without JWKS if enabled | M | Critical | High | Disable OIDC until JWKS + shared state |
| 3 | Vault key = JWT-derived | M | High | Medium | Require SECRETS_MASTER_KEY |
| 4 | Authorized user LLM cost abuse | H | Medium | Medium | Budgets + rate limits + HiTL |
| 5 | XSS + body JWT if stored | L | High | Medium | Cookie-only; CSP |
| 6 | Mongo admin rewrites audit chain | L | High | Medium | DB RBAC + immutability store later |
| 7 | ZIP/path bombs | L | Medium | Low | Existing guards; keep tests |
| 8 | Prompt injection → SOAR | L | High | Low | No auto-execute (by design) |
| 9 | Supply chain deps | M | Medium | Medium | pip-audit/bandit CI |
| 10 | CORS origin wildcards in lab | M | Medium | Medium | Explicit CORS_ORIGINS |

---

## 6. Product Gap Analysis vs Enterprise SOC Platforms

Comparison targets: Microsoft Sentinel, Google SecOps, Splunk ES, IBM QRadar, Palo Alto Cortex XSIAM, CrowdStrike Falcon, Microsoft Defender XDR, Elastic Security, SentinelOne.

| Capability | Enterprise platforms | ACTIRA | Close the gap? |
|------------|---------------------|--------|----------------|
| Petabyte log lake / continuous search | Core | No | **No** (non-goal) |
| Native connectors (M365, AWS, EDR streams) | Core | File + ingest webhook | **Partial** — prioritize 1–2 connectors later |
| Detection rule engines | Core | Batch heuristics | **No** as SIEM rules; optional Sigma later |
| UEBA baselining | Mature | MVP signals | **Partial** — deepen selectively |
| SOAR **execution** | Common | Advisory playbooks only | **No** without dual-control design |
| Case management collaboration | Mature | Notes/RCA/workspace | **Yes (P1)** — assign, comments |
| Investigation copilot / grounded playbooks | Emerging | **Strength** | **Differentiate** |
| Multi-tenant / MSSP | Expected | No | **Yes for v2 commercial** |
| SSO + MFA + SCIM | Expected | OIDC scaffold | **Yes (P0/P1)** |
| Compliance certifications | Sales gate | Alignment score | **Docs only** until real audit |
| Threat hunting language (KQL/SPL) | Core | Intent rules over incidents | **No** lake; optional export |
| DFIR lab (memory/disk) | Niche tools | Not present | **No** (v3 optional) |
| Offline golden IR eval | Rare | **Strength** | Keep as differentiator |

**Recommended competitive narrative:**  
“Human-gated AI IR advisor that sits **beside** your SIEM/XDR — not instead of it.”

---

## 7. UX Audit Summary (by persona)

| Persona | Primary surfaces | Experience today | Gaps |
|---------|------------------|------------------|------|
| L1 Analyst | Upload, Incidents, Workspace, Hunt | Strong IR flow | Hunt depth; mobile |
| L2/L3 / IR Lead | Workspace, Review, ATT&CK | Excellent narrative | Load errors; collab |
| Reviewer | Review Queue, Audit | Strong HiTL UX | Palette/nav completeness |
| Admin | Settings, Ops, KB, Golden | Settings is best-in-class | Ops metrics thin |
| Executive | Compliance, Dashboard | Pretty KPIs | Demo data risk; cert language |
| End user (dark mode) | All | Shell good | Login light-only |

---

## 8. Refactoring & Delivery Plan

### P0 — Critical (next sprint, 1–2 weeks)

| Item | Outcome |
|------|---------|
| Fix IncidentDetail error/404 states | No infinite loading |
| Remove or hard-badge Dashboard DEMO fallbacks | Trust |
| Login tokenized for light/dark | Brand consistency |
| Analytics main-path error state | Ops honesty |
| Prod config gate checklist automated | Security |
| Disable/harden OIDC until JWKS | Identity safety |
| Repair smoke E2E testids | CI truth |

### P1 — High (next release)

| Item | Outcome |
|------|---------|
| Mobile nav drawer | Usable tablet/phone |
| Command palette: Audit + Compliance | Keyboard SOC |
| Dedicated job-worker Helm path | Safe multi-replica |
| Cookie-only JWT for SPA | XSS surface down |
| Global API rate limit for upload/LLM | Abuse resistance |
| CSP at reverse proxy + document | Browser security |
| Soften compliance UI language | No false cert claims |
| FEATURE_INVENTORY / ROADMAP sync | Doc integrity |
| Server-side incident pagination | Scale path |
| Hunt/Compliance/Audit/Workspace thin E2E | Regression safety |

### P2 — Medium

| Item | Outcome |
|------|---------|
| Complete repository layer | Maintainability |
| Split Settings page | FE maintainability |
| sbert default quality profile | RAG quality |
| Live LLM eval track (non-CI default) | Model quality evidence |
| Model catalog hygiene (experimental tags) | Operator trust |
| OTEL productization in compose/Helm | Observability |
| Assign/comments on cases | Collaboration |
| Unify ListState / EmptyState | UX consistency |

### P3 — Low

| Item | Outcome |
|------|---------|
| Dead code purge (`bkp/`) | Hygiene |
| Real API version divergence policy | Long-term API |
| Glassmorphism reduction | Density readability |
| Theme route overrides simplification | Predictable theme |

Each P0/P1 item is designed to be **independently shippable** without breaking the IR pipeline.

---

## 9. Product Roadmap Recommendations

### Next Sprint
P0 trust/security/UX defects; E2E green; messaging pass on compliance & ATT&CK.

### Next Release (v1.6.x / v1.7)
Identity hardening (JWKS OIDC), worker process model, rate limits, collaboration basics, deeper hunt UX, compliance language polish, performance baseline report for pilot N users.

### Version 2.0
`org_id` multi-tenancy, per-tenant secrets, SCIM/SSO polish, 1–2 SIEM/EDR connectors, pen-test package, commercial pilot readiness.

### Version 3.0
Optional forensics agent, SOAR **gated** actions, multi-agent roster UX, executive command center, multi-region HA evidence.

---

## 10. Final Verdict

### Rating: **Enterprise Pilot Ready (single-tenant)**

**Justification**

- Product capability is beyond a toy PoC and beyond a thin MVP: full pipeline, HiTL, workspace, hunt/behavior, compliance/audit, settings, CI, and ops packaging exist in code.  
- Identity, tenancy, scale certification, and compliance claims do **not** meet multi-customer enterprise production bars.  
- Documentation and demo packaging are excellent; raw production SRE evidence is not.

### To reach **Production Ready (single-tenant)**

1. P0 trust/security defects closed.  
2. OIDC JWKS or password-only with MFA IdP path proven.  
3. Worker isolation + backup/DR exercised.  
4. Capacity report for intended pilot size.  
5. Zero demo-seed / demo-data in non-lab builds.

### To reach **Enterprise Production Ready**

1. Multi-tenancy + per-tenant secrets.  
2. SSO/MFA/SCIM complete.  
3. Pen-test + SOC 2-style control evidence (not self-score UI).  
4. HA multi-node data plane (Mongo + vectors + jobs).  
5. Connector strategy and support model.

---

## 11. Scorecard Snapshot (one page)

| | Score |
|--|------:|
| Architecture | 78 |
| Backend | 77 |
| Frontend | 74 |
| AI | 72 |
| Security | 71 |
| Performance | 58 |
| Scalability | 52 |
| UX | 73 |
| Documentation | 90 |
| Testing | 76 |
| Operations | 74 |
| Compliance | 62 |
| Maintainability | 70 |
| Innovation | 81 |
| Enterprise readiness | 64 |
| **Overall** | **76** |

**Recommended external claim:**  
> ACTIRA is a single-tenant, human-gated AI incident-response advisor for demos and controlled pilots — not a SIEM/XDR/SOAR replacement.

---

*End of board report. This supersedes older score interpretations where they conflict with production-readiness criteria; packaging maturity may still be marketed separately as “Enterprise Demonstration Ready.”*
