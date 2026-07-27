# ACTIRA Capstone — Enterprise Board Review + Submission Pack

**Program:** Advanced Certification Programme in Agentic and Generative AI (TalentSprint / IISc track)  
**Capstone Project:** **#4 — Agentic Cybersecurity Threat Intelligence & Incident Response Advisor**  
**Product codename:** ACTIRA  
**Date:** 2026-07-27 (trust UX surface wins + pack regen)  
**Repo maturity label:** **Enterprise Pilot Ready (single-tenant)**  
**Honest enterprise score:** **78 / 100** (Wave C + dashboard trust/KPI; honesty surfaces closed 2026-07-27 — score held; video still open)

This document is the **single submission-facing board review**, mapped to TalentSprint Phase 1–5 guidelines and Project 4 requirements. Use it for:

- Viva / evaluation board  
- Project report backbone  
- PPT narrative  
- Test evidence index  

Detailed technical debt and prior board notes also live in `docs/ENTERPRISE_REVIEW_BOARD_2026-07-26.md`.

---

## 1. Executive Summary

ACTIRA implements an **end-to-end AI-assisted SOC investigation and IR playbook platform**:

**Upload logs → parse multi-format evidence → extract IoCs → enrich TI → map MITRE ATT&CK → hybrid RAG → LLM playbook → HiTL review → investigation workspace → audit/compliance.**

It exceeds a thin demo: modular FastAPI, React SOC UI, MongoDB, LanceDB hybrid RAG, multi-provider LLM with fallbacks, golden offline eval, Docker/K8s packaging, and extensive documentation.

| Dimension | Verdict |
|-----------|---------|
| **Overall score** | **78 / 100** |
| **Maturity** | **Enterprise Pilot Ready** (single-tenant) |
| **Capstone Project 4 fit** | **Strong / exceeds baseline** (React vs Gradio; workspace; compliance; golden CI) |
| **TalentSprint Phases 1–5** | **Covered** (see §3) |
| **Not claimed** | Multi-tenant SIEM/XDR/SOAR replacement |

### Score delta vs prior board (76 → 78)

Recent remediation improved trust and ops UX:

| Fix | Impact |
|-----|--------|
| Dashboard demo data opt-in only | Trust / honesty |
| Live KPI field completeness + atomic load | Data consistency / performance feel |
| HelpTips on pages/tabs | UX completeness |
| Incident detail load error handling | Analyst UX critical fix |
| LLM free/paid catalog + fallback | Resilience |
| Audit intelligence + executive export | Wave C compliance |

---

## 2. Maturity Assessment (0–100)

| Domain | Score | Notes for evaluators |
|--------|------:|----------------------|
| Architecture | 79 | Modular monolith; dual `/api` + `/api/v1` |
| Backend | 78 | Routers/services/jobs; incomplete full DI |
| Frontend | 76 | Full SOC shell; mobile drawer still weak |
| AI / RAG | 74 | Grounded playbooks + hybrid RAG; pipeline not LangGraph swarm |
| Security | 72 | RBAC, vault, lockout; OIDC scaffold |
| Performance | 62 | Pilot-class; KPI cache; not 500-user cert |
| Scalability | 54 | Single-tenant vertical |
| UX | 76 | Design system; live data default; tooltips |
| Documentation | 92 | Exceptional for capstone |
| Testing | 78 | Golden + unit matrix + Playwright |
| Operations | 75 | Compose, Helm, multi-CI |
| Compliance | 65 | Alignment score ≠ formal cert |
| Maintainability | 72 | Post-modularization |
| Innovation | 83 | HiTL + grounding + workspace |
| Enterprise readiness | 66 | Pilot, not multi-org prod |
| **Weighted overall** | **78** | |

### Final verdict

| Level | Status |
|-------|--------|
| Proof of Concept | No |
| MVP | Surpassed |
| **Enterprise Pilot Ready** | **Yes** |
| Production Ready (single-tenant lab) | Approaching (ops discipline + remaining P0/P1) |
| Enterprise Production Ready | No (tenancy, SSO hardening, scale cert) |

---

## 3. TalentSprint Phase Mapping (Implementation Guidelines)

| Phase | Guideline requirement | ACTIRA evidence | Status |
|-------|----------------------|-----------------|--------|
| **1 Foundation** | Scope, personas, architecture, metrics | `docs/product/VISION.md`, `docs/PROJECT_OVERVIEW.md`, personas, diagrams/ | Done |
| **1** | Dev env | Docker Compose, Makefile, `.env` | Done |
| **1** | Datasets / synthetic logs | `samples/`, golden `dataset.json`, parsers tests | Done |
| **1** | Vector KB | LanceDB + BM25 hybrid (LanceDB not Chroma — ADR 0002) | Done (equiv.) |
| **1** | Secure API keys | Settings vault + env | Done |
| **2 Core** | Ingestion pipelines | Multi-format parsers + ZIP + job queue | Done |
| **2** | RAG | Hybrid RRF + optional Cohere re-rank | Done |
| **2** | Agentic workflows | **Pipeline stages + LLM agents** (not full LangGraph product) | Partial / documented alternative |
| **2** | Structured outputs | Pydantic models + `parse_llm_json` | Done |
| **2** | FastAPI backend | Full modular API | Done |
| **3 Integration** | External tools | AbuseIPDB, VT, etc.; Slack/email | Done |
| **3** | Dashboard UI | React SPA (beyond Gradio/Streamlit baseline) | Done (exceeds) |
| **3** | Jobs / automation | Async job queue + pipeline | Done |
| **3** | Storage | MongoDB (+ LanceDB) | Done (Mongo vs SQLite — stronger) |
| **3** | Logging, retries, fallbacks | LLM fallback, template playbooks, request_id | Done |
| **4 Testing** | Unit / pipeline tests | `backend/tests/*` extensive | Done |
| **4** | RAG eval | Golden + retrieval pairs / optional RAGAS path | Partial (golden primary) |
| **4** | Prompt / structured validation | HiTL + parse resilience | Done |
| **5 Deploy** | Docker / cloud | Compose + K8s/Helm | Done |
| **5** | Architecture & API docs | `docs/*`, OpenAPI, presentations | Done |
| **5** | Evaluation report + screenshots | This pack + `samples/demo/` + trust UX surfaces | Done (regen screenshots after merge if UI drifts) |
| **5** | 5-min demo video | `docs/capstone/DEMO_VIDEO_5MIN.md` + `assets/video/` + `record_demo_video.py` | Deliverable pack (record/narrate) |

---

## 4. Project 4 Requirements Traceability

| Capstone requirement | Implementation | Gap / note |
|---------------------|----------------|------------|
| Parse Apache/Nginx/Syslog/Windows logs | `backend/parsers.py` + Suricata/Zeek/Defender/Sysmon | EVTX optional scaffold |
| Extract IoCs | `ioc_extractor.py` | — |
| Enrich AbuseIPDB / VirusTotal | `enrichment.py` (+ GreyNoise, ThreatFox, OTX, Shodan) | Mock without keys |
| Map MITRE ATT&CK | `attack_mapping.py` + catalog/heatmap | Heuristic, not full STIX taxii sync |
| Kill-chain / progression | Techniques + timeline + RCA narrative | Not full kill-chain product object |
| RAG IR playbooks (NIST-style) | Hybrid RAG + `playbook_agent` | — |
| LLM playbooks | Multi-provider + fallback | — |
| HiTL for critical | `hitl_gate.py` + Review Queue | — |
| Dashboard IoC / ATT&CK / summaries | Dashboard, Analytics, Heatmap | — |
| Multi-agent LangGraph | **Pipeline + named stages** (Triage-like flow) | Frame honestly as modular agentic pipeline |
| ChromaDB | **LanceDB** (ADR) | Document as design choice |
| Gradio/Streamlit | **React enterprise UI** | Exceeds |

---

## 5. UX Audit (every primary screen)

| Page | Score | Issues | Priority |
|------|------:|--------|----------|
| Login | 64 | Marketing static metrics; light-only skin | P1 |
| Dashboard | 80 | Improved KPIs/load; mobile density | P2 |
| Upload / Ingest | 84 | — | P3 |
| Incidents | 84 | Client-side large lists | P2 |
| Incident Workspace | 82 | Load error fixed; mobile tab wrap | P2 |
| Hunt | 79 | Rule-based not lake-scale | P2 |
| Analytics | 74 | Main-path error polish | P1 |
| Review Queue | 86 | — | P3 |
| Audit | 82 | — | P3 |
| Compliance | 84 | Messaging: alignment ≠ cert | P1 |
| Knowledge | 80 | — | P3 |
| Settings | 88 | Large file | P3 |
| Ops Health | 80 | Thin SRE metrics | P2 |
| Golden Benchmark | 84 | — | P3 |
| Roadmap | 76 | Product meta in SOC app | P3 |
| Forbidden / 404 | 74 | — | P2 |

---

## 6. Security / Debt / Competitive (summary)

**Security residual risks:** OIDC JWKS incomplete; no multi-tenant isolation; demo seed if misconfigured; mock TI default; no global API rate limit; CSP via edge.

**Technical debt:** Incomplete repositories; Settings mega-file; E2E testid drift; speculative LLM model IDs; optimistic compliance flags.

**vs Sentinel/Splunk/XSIAM/Falcon:** Do **not** compete on lake/connectors/SOAR execution. Compete on **grounded IR narrative + HiTL + investigation workspace + offline eval**.

---

## 7. Refactoring Plan (submission-safe)

### P0 (pre-demo / viva)
- [x] Live dashboard data default  
- [x] KPI field completeness  
- [x] Incident load errors  
- [x] Soften Login marketing “Connected” rows — probe `/health`; capability tiles (not fake KPIs)  
- [x] Compliance alignment disclaimer banner (always visible)  
- [x] Capstone report PDF + appendices pack + formal test summary  
- [x] Live light-theme screenshots under `assets/screenshots/` (01–14; re-run `capture_screenshots.py` after trust UX merge)  
- [x] Trust UX honesty surfaces (Hunt / Audit / Analytics / KB / Compliance) — see `docs/product/PRODUCT_HONESTY.md`  
- [x] 5-minute demo pack — `DEMO_VIDEO_5MIN.md`, `record_demo_video.py`, output under `assets/video/`  


### P1 (closed for submission scope or documented)
- [x] Analytics main-path error + cache honesty footer + drill-through  
- Mobile nav drawer — residual polish (non-blocking)  
- E2E testid alignment — residual  
- Cookie-only JWT for SPA — largely landed  

### P2–P3 (explicitly deferred / stretch)
- Server-side pagination remaining lists  
- OIDC JWKS hardening  
- Multi-tenant (v2)  
- Default SBERT + larger KB corpus; Hunt/Lance hybrid; continuous compliance automation — **documented stretch**, not demo-blocking  


---

## 8. Product Roadmap (for report/PPT)

Aligned with root `ROADMAP.md` §T (Trust) — **T-01 / T-01b ✅**.

| Horizon | Items |
|---------|--------|
| **Submission close** | **5-min demo video only** (student-owned). Screenshots, report PDF, PPTX, trust UX honesty surfaces **done** |
| **Documented stretch (non-blocking)** | Default SBERT + broader KB; continuous compliance automation; Hunt/Lance hybrid lake search — see `docs/product/PRODUCT_HONESTY.md` |
| **Next release** | SSO JWKS harden, rate limits, E2E expansion |
| **v2.0** | Multi-tenant, connectors, commercial pilot (H-07/H-08 collab designs) |
| **v3.0** | Gated SOAR, forensics agent, multi-agent roster UX |

| Roadmap ID | Status | Notes |
|------------|--------|--------|
| T-01 Trust UX baseline | ✅ | DEMO banners, live data default, palette |
| **T-01b surface wins** | ✅ (2026-07-27) | Hunt honesty/filters, Audit paging + dynamic actions, Analytics cache + drill-through, KB hash banner + custom manager, Compliance assumed-vs-verified + live probes |
| T-02 … T-07 | ✅ / ~95% | See `ROADMAP.md` §T |

---

## 9. Submission Artifacts Index

| Artifact | Path (all under `docs/capstone/` unless noted) |
|----------|------|
| This board + mapping | `board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md` |
| **Full project report** | `PROJECT_REPORT.md` |
| **Detailed PDF** | `PROJECT_REPORT.pdf` |
| **Appendices A–F** | `appendices/` |
| **Viva PPTX** | `presentation/ACTIRA_Capstone_Presentation.pptx` |
| Master test cases | `appendices/A_test_case_catalog.md` |
| Project report outline | `outlines/PROJECT_REPORT_OUTLINE.md` |
| PPT outline + builder | `presentation/PPT_OUTLINE.md`, `presentation/build_capstone_pptx.js` |
| Screenshots / figures | `assets/screenshots/` (01–14 live), `assets/figures/` |
| **Product honesty (binding)** | `docs/product/PRODUCT_HONESTY.md` |
| Product roadmap | `ROADMAP.md` (root) |
| Demo script (product) | `docs/DEMO_SCRIPT.md` (5-min cut section) |
| Pack index | `README.md` |

---

## 10. Top Priorities to Next Maturity Level

**Submission:** trust UX, honesty docs, PDF/PPTX, and demo **video pack** are closed in-repo. Narrate or re-record with `record_demo_video.py` if the institute requires a fresh take.

To reach **Production Ready (single-tenant lab)** after submission:

1. Identity: finish OIDC JWKS / disable unsafe OIDC path.  
2. Keep honesty defaults (no silent demo data as live).  
3. E2E green on critical paths.  
4. Capacity note for expected concurrent users (even small pilot).  
5. Optional stretch: real SBERT default, continuous compliance probes, lake-scale hunt — **not** required for capstone close.

---

*End of board + submission index.*
