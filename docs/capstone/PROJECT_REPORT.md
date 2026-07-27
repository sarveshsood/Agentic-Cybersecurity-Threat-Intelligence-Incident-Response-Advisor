# Agentic Cybersecurity Threat Intelligence & Incident Response Advisor (ACTIRA)

**Capstone Project Report**  
**Program:** Advanced Certification Programme in Agentic and Generative AI  
**Project number:** 4 (TalentSprint Capstone Projects List)  
**Product codename:** ACTIRA  
**Date:** 26 July 2026  
**Maturity label:** Enterprise Pilot Ready (single-tenant)  
**Enterprise board score:** 78 / 100  

> Fill institute/team fields on the title page per program template before PDF export.  
> **Pack root:** `docs/capstone/` (all report materials stay under this folder).  
> PPTX: `presentation/ACTIRA_Capstone_Presentation.pptx` · Appendices: `appendices/` · Assets: `assets/`

---

## Pack layout (this folder only)

```text
docs/capstone/
├── PROJECT_REPORT.md          ← this report
├── README.md
├── appendices/                ← Appendices A–F (full content)
│   ├── A_test_case_catalog.md
│   ├── B_api_surface.md
│   ├── C_sample_outputs.md
│   ├── C_sample_g001.json
│   ├── D_configuration.md
│   ├── E_team_roles.md
│   └── F_glossary.md
├── assets/
│   ├── screenshots/           ← demo figures for PDF
│   └── figures/               ← architecture diagrams
├── board/
│   └── CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md
├── outlines/
│   └── PROJECT_REPORT_OUTLINE.md
└── presentation/
    ├── ACTIRA_Capstone_Presentation.pptx
    ├── PPT_OUTLINE.md
    └── build_capstone_pptx.js
```

---

## Abstract

ACTIRA is an AI-assisted Security Operations platform that automates multi-format log ingestion, Indicator of Compromise (IoC) extraction, threat-intelligence enrichment, MITRE ATT&CK mapping, hybrid Retrieval-Augmented Generation (RAG), and citation-grounded incident response (IR) playbook generation, with mandatory Human-in-the-Loop (HiTL) review for high-risk cases. The system is implemented as a modular FastAPI and React application backed by MongoDB and LanceDB, with multi-provider LLM support, cross-provider fallbacks, offline golden evaluation, and enterprise-oriented controls (RBAC, secrets vault, audit trail with integrity hashing, compliance alignment scoring).

Offline golden IR evaluation on 37 cases yields mean IoC F1 ≈ 0.98, mean technique recall ≈ 0.93, full NIST-style playbook phase coverage, and zero case errors under template playbooks—providing a reproducible CI gate independent of live LLM APIs. The product exceeds a thin Gradio demo: investigation workspace, review queue, hunt, analytics, compliance evidence packs, and Docker/Kubernetes packaging support a single-tenant enterprise pilot narrative. Limitations include single-tenant deployment, heuristic ATT&CK mapping, dependence on external LLM/TI APIs for peak quality, and no claim to replace SIEM/XDR platforms of record (Sentinel, Splunk ES, Falcon, XSIAM).

**Keywords:** Agentic AI, RAG, MITRE ATT&CK, Human-in-the-Loop, SOC, Incident Response, LanceDB, FastAPI

---

## Table of contents

1. Introduction  
2. Literature & related work  
3. System requirements  
4. System architecture  
5. Design & methodology  
6. Implementation  
7. Testing & evaluation  
8. Results & discussion  
9. Challenges & mitigations  
10. Conclusion & future work  
References  

**Appendices** (full text under `appendices/`)

| ID | Title | File |
|----|-------|------|
| A | Test case catalog | [appendices/A_test_case_catalog.md](./appendices/A_test_case_catalog.md) |
| B | API surface | [appendices/B_api_surface.md](./appendices/B_api_surface.md) |
| C | Sample outputs | [appendices/C_sample_outputs.md](./appendices/C_sample_outputs.md) |
| D | Configuration | [appendices/D_configuration.md](./appendices/D_configuration.md) |
| E | Team roles | [appendices/E_team_roles.md](./appendices/E_team_roles.md) |
| F | Glossary | [appendices/F_glossary.md](./appendices/F_glossary.md) |

---

# Chapter 1 — Introduction

## 1.1 Background

Security Operations Centers (SOCs) face sustained growth in alert volume from SIEM, EDR, cloud, and network sensors. Analysts must extract IoCs, enrich them with threat intelligence (TI), map activity to MITRE ATT&CK, and produce actionable IR playbooks—often under time pressure and with inconsistent documentation. General-purpose LLM chatbots reduce typing but introduce hallucination, missing audit trails, and no formal human gate for high-risk actions.

## 1.2 Problem statement

Manual pipelines for parse → IoC → TI → ATT&CK → playbook are slow, non-reproducible, and poorly grounded in organizational knowledge bases. Commercial SOAR platforms are powerful but heavy, closed, and expensive for education and mid-market pilots. Capstone Project 4 asks for an **agentic cybersecurity threat intelligence and IR advisor** that closes this gap with open, explainable AI and human oversight.

## 1.3 Objectives

| ID | Objective |
|----|-----------|
| O1 | Multi-format log ingest and structured event normalization |
| O2 | Automated IoC extraction and TI enrichment (live or mock) |
| O3 | MITRE ATT&CK technique mapping and visualization |
| O4 | Hybrid RAG over IR knowledge with citation-grounded playbooks |
| O5 | HiTL review for critical severity / low-grounding cases |
| O6 | Investigation workspace as system of record for a case |
| O7 | Offline golden evaluation and RBAC-hardened API |
| O8 | Deployable stack (Compose / Kubernetes) with ops docs |

**Non-functional:** pilot-class latency, secret hygiene, auditability, honest data defaults (no silent demo KPI fill).

## 1.4 Scope and non-goals

**In scope:** single-tenant SOC console for upload-driven IR advising, workspace investigation, review, compliance alignment, multi-provider LLM.

**Out of scope (explicit non-goals):**

- Replacement for Microsoft Sentinel, Splunk ES, CrowdStrike Falcon, Cortex XSIAM, or Google SecOps as SIEM/XDR of record  
- Multi-tenant SaaS isolation (v1)  
- Unsupervised SOAR execution / auto-remediation without human gate  
- Formal ISO/SOC2 certification (alignment score only)

## 1.5 Contributions

1. End-to-end modular IR pipeline with job queue and multi-format parsers  
2. Hybrid BM25 + LanceDB vector retrieval with citation allow-listing  
3. Investigation workspace (timeline, graph, notes, RCA, playbooks)  
4. HiTL policy gates + review queue with audit  
5. Offline golden IR suite (CI-gated metrics)  
6. Wave C: compliance alignment score, audit integrity chain, executive export  
7. Multi-provider LLM catalog (free/paid) with cross-provider fallback  
8. React enterprise UI exceeding Gradio/Streamlit baseline of the capstone brief  

## 1.6 Report organization

Chapters 2–3 establish context and requirements; 4–6 describe architecture, design, and implementation; 7–8 present evaluation and results; 9–10 cover challenges and future work. Appendices index tests, APIs, and configuration.

---

# Chapter 2 — Literature & related work

## 2.1 RAG for knowledge-intensive tasks

Lewis et al. (2020) introduced Retrieval-Augmented Generation, combining parametric LLMs with non-parametric memory. ACTIRA applies hybrid lexical + dense retrieval (Reciprocal Rank Fusion) over IR playbook knowledge and enforces citation IDs within a known allow-list to reduce ungrounded advice.

## 2.2 MITRE ATT&CK and IR standards

MITRE ATT&CK provides a shared taxonomy of adversary techniques. NIST SP 800-61 structures incident handling (preparation, detection, containment, eradication, recovery, lessons learned). ACTIRA maps techniques heuristically from evidence and generates playbooks with NIST-style phases; timeline and RCA support kill-chain narrative without claiming full STIX/TAXII enterprise sync.

## 2.3 Agentic systems

Industry frameworks (LangGraph, CrewAI, AutoGen) emphasize multi-agent orchestration. ACTIRA implements a **modular agentic pipeline**—named stages (parse, enrich, map, retrieve, generate, gate)—rather than a full multi-agent swarm product. This choice prioritizes determinism, offline eval, and operational simplicity for pilot demos while remaining honest about “agentic” scope.

## 2.4 Commercial SOC platforms

Enterprise platforms excel at data lakes, connectors, and SOAR execution. ACTIRA does not compete on ingest scale; it competes on **grounded IR narrative, HiTL, investigation workspace, and reproducible offline evaluation**—complementary to SIEM dual-run pilots.

## 2.5 Research / product gap

Open stacks rarely combine (a) multi-format evidence → (b) hybrid RAG playbooks with citations → (c) mandatory HiTL → (d) workspace UX → (e) CI golden gates in one deployable package. ACTIRA targets that gap for education and single-tenant pilots.

---

# Chapter 3 — System requirements

## 3.1 Personas

| Persona | Needs | Primary surfaces |
|---------|-------|------------------|
| SOC Analyst | Fast triage, structured IR | Upload, Incidents, Workspace, Hunt |
| Senior Reviewer | Controlled approval | Review Queue, Audit |
| Admin | Keys, thresholds, health | Settings, Ops, Golden Benchmark |
| Executive (demo) | Risk snapshot | Dashboard, Compliance, Export |

## 3.2 Functional requirements (summary)

| FR | Description | Status |
|----|-------------|--------|
| FR-1 | Parse Apache/Nginx/Syslog/Windows + extended formats | Done |
| FR-2 | Extract IP/domain/URL/hash IoCs | Done |
| FR-3 | Enrich via AbuseIPDB/VT (mock without keys) | Done |
| FR-4 | Map MITRE ATT&CK techniques | Done (heuristic) |
| FR-5 | Hybrid RAG IR playbooks | Done |
| FR-6 | HiTL for critical / low grounding | Done |
| FR-7 | Dashboard KPIs & ATT&CK heatmap | Done (live default) |
| FR-8 | Investigation workspace tabs | Done |
| FR-9 | Auth + RBAC | Done |
| FR-10 | Compliance alignment + audit integrity | Done (Wave C) |

## 3.3 Non-functional requirements

| NFR | Target | Approach |
|-----|--------|----------|
| Security | Role isolation, vault, lockout | Cookie sessions, RBAC matrix tests |
| Auditability | Who/what/when + integrity | SHA-256 audit chain |
| Latency | Pilot-class, demo &lt;10 min golden path | Job queue, KPI cache |
| Honesty | No silent fake dashboard data | Demo fallback opt-in only |
| Deployability | Compose + Helm | `deployments/` |

## 3.4 Success metrics

| Metric | Target | Observed (2026-07-26) |
|--------|--------|------------------------|
| Golden cases | ≥ 30 | 37 |
| Mean IoC F1 | ≥ 0.85 | **0.982** |
| Mean technique recall | ≥ 0.80 | **0.930** |
| Mean grounding | ≥ 0.50 | **1.0** (template path) |
| Full phase coverage | 100% | **1.0** |
| Mean offline latency | ≤ 7 s | **&lt; 0.01 s** |
| CI gate failures | 0 | **0** |
| Enterprise board score | Pilot | **78/100** |

---

# Chapter 4 — System architecture

## 4.1 Architecture style

ACTIRA is a **modular monolith** (ADR 0001): one backend process with clear router/service boundaries, dual API mounts (`/api` and `/api/v1`), and a React SPA. This optimizes demo reliability and single-tenant ops over premature microservices.

## 4.2 High-level context

```text
[Analyst Browser] → React SPA → FastAPI
                         │
           ┌─────────────┼─────────────┐
           ▼             ▼             ▼
        MongoDB       LanceDB      LLM / TI APIs
      (cases,users)  (vectors+BM25)  (optional)
```

## 4.3 Data flow

1. **Upload** multi-file/ZIP evidence → job enqueued  
2. **Pipeline** parse → CES events → IoC extract → enrich → ATT&CK → RAG → playbook  
3. **HiTL gate** may force `pending_review`  
4. **UI** Dashboard/Incidents/Workspace/Review consume REST (+ SSE for investigator)  
5. **Audit/Compliance** record actions; executive export packages evidence  

## 4.4 Component view

| Layer | Responsibilities |
|-------|------------------|
| Frontend | Auth, pages, design system, HelpTips |
| API routers | Auth, incidents, upload, review, hunt, settings, compliance, audit, eval |
| Services | Analytics KPIs, pipeline orchestration, LLM provider, vault |
| Engines | Parsers, IoC, enrichment, attack mapping, hybrid RAG, playbook agent, HiTL |
| Data | MongoDB documents; LanceDB hybrid index; optional file evidence |

## 4.5 AI workflow

Hybrid retrieval (BM25 + dense, RRF, optional re-rank) feeds structured playbook generation. Grounding score and citation IDs constrain outputs. Multi-provider LLM layer selects free/paid models and falls back across providers; template playbooks ensure offline continuity.

## 4.6 Security architecture

- Password login with lockout; JWT session cookies  
- RBAC: analyst / senior_reviewer / admin  
- Secrets vault (encrypt-at-rest; never return raw keys)  
- ZIP bomb / size limits on ingest  
- Audit trail with integrity hashing  
- Compliance **alignment** score (not certification)  

## 4.7 Deployment

Docker Compose for lab; Kubernetes/Helm charts under `deployments/`. Environment via `.env` and Settings UI vault. CI: GitHub Actions for tests and golden gates.

---

# Chapter 5 — Design & methodology

## 5.1 Datasets and knowledge bases

- Synthetic multi-format logs under `samples/`  
- Golden IR dataset (`backend/tests/golden/dataset.json`, 37 cases)  
- MITRE-oriented technique catalog and IR playbook KB in LanceDB  
- Optional CVE/KEV enrichment when configured  

## 5.2 Log analysis pipeline

Parsers normalize heterogeneous sources (Apache, Nginx, Syslog, Windows-oriented formats, Suricata, Zeek, Sysmon, Defender). Correlated events form Common Event Schema (CES) records feeding IoC and technique inference. Pipeline isolation ensures one bad file does not abort the batch.

## 5.3 IoC extraction and TI enrichment

Regex/heuristics extract IPs, domains, URLs, hashes. Private IPs are filtered from public enrichment. Without API keys, enrichment returns **mock** results for offline demos; with keys, AbuseIPDB, VirusTotal, and additional providers apply. `FORCE_MOCK_TI` forces deterministic mock mode for tests.

## 5.4 ATT&CK mapping

Keyword and pattern heuristics map evidence to technique IDs (e.g., brute-force → T1110-class). Optional LLM refine can improve narrative; heatmaps and incident filters expose technique prevalence. Mapping is **not** a full enterprise ATT&CK engine.

## 5.5 Hybrid RAG

Lexical BM25 + LanceDB vectors fused by RRF; optional Cohere re-rank. Design choice of LanceDB over Chroma is documented (ADR 0002) for hybrid search ergonomics. Retrieval pairs support offline Hit@k style checks.

## 5.6 Playbook generation

Prompts request structured JSON with containment, eradication, recovery, and lessons-learned phases. Outputs parse through resilient `parse_llm_json` (fences, trailing commas). Citations must subset the KB allow-list; low grounding triggers HiTL.

## 5.7 HiTL policy

Critical severity and low grounding force review. Reviewers approve/reject with comments; race conditions yield 409. Audit records decisions.

## 5.8 Investigation workspace

Single case screen: Case, Evidence, Timeline, Graph/Assets/Users, TI, MITRE, Notes, Playbooks, RCA, AI investigator stream. URL tab state supports shareable deep links.

## 5.9 LLM multi-provider and fallback

Settings catalog lists free and paid models across providers. Soft-allow unknown model IDs avoids hard 422 on catalog drift. Primary failure triggers cross-provider fallback; template path remains last resort.

## 5.10 Compliance and audit (Wave C)

Compliance module scores control alignment and surfaces gaps/evidence. Audit events form a hash chain; summary/integrity APIs support executive export packages for board-facing narratives.

---

# Chapter 6 — Implementation

## 6.1 Technology stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3, FastAPI, Pydantic, pytest |
| Frontend | React, CRA/Vite-compatible SPA patterns, Recharts |
| Data | MongoDB, LanceDB |
| AI | Multi-provider LLM APIs, hybrid RAG |
| E2E | Playwright |
| Ops | Docker Compose, Kubernetes/Helm, GitHub Actions |

## 6.2 Backend modules (selected)

| Module | Role |
|--------|------|
| `parsers.py` / broader parsers | Multi-format ingest |
| `ioc_extractor.py` | IoC extraction |
| `enrichment.py` | TI live/mock |
| `attack_mapping.py` | ATT&CK heuristics |
| `vector_rag` / KB | Hybrid retrieval |
| `playbook_agent` | Structured IR playbooks |
| `hitl_gate.py` | Review policy |
| `llm_provider` | Catalog + fallback |
| `analytics_service` | KPIs v3 (events, IoCs, techniques) |
| `compliance` / audit | Score, chain, export |
| `golden_eval.py` | Offline IR benchmark |

## 6.3 Frontend routes (selected)

Login · Dashboard · Upload · Incidents · Incident Workspace · Hunt · Analytics · Review · Audit · Compliance · Knowledge · Settings · Ops Health · Golden Benchmark · Roadmap

Dashboard uses `Promise.all` for atomic KPI/incident load, `formatMetricValue` for stable formatting, and **opt-in only** `REACT_APP_DASHBOARD_DEMO_FALLBACK` (unset = live data / honest zeros).

## 6.4 Configuration and secrets

`.env` + Settings vault; secrets never returned in plaintext via API. Weak JWT rejected outside lab modes. OIDC scaffold present but password login is default.

## 6.5 Notable APIs

OpenAPI: `docs/openapi.json`. Dual mount `/api` and `/api/v1`. Key groups: auth, upload/jobs, incidents/workspace, review, hunt, settings/LLM catalog, compliance, audit, eval/golden.

## 6.6 CI/CD

GitHub Actions run unit/integration tests, golden IR gates, and related checks. Playwright smoke covers critical UI paths (maintain testids as UI evolves).

---

# Chapter 7 — Testing & evaluation

## 7.1 Test strategy

| Layer | Scope |
|-------|-------|
| Unit | Parsers, JSON resilience, HiTL, RBAC, audit |
| Integration | Pipeline isolation, enrichment mock, workspace APIs |
| Golden offline | 37-case IR metrics (no Mongo/LLM required) |
| E2E | Playwright smoke / flows |
| Manual | Demo script, screenshot pack, TI live keys |

Master catalog: [`appendices/A_test_case_catalog.md`](./appendices/A_test_case_catalog.md) (TC-AUTH, TC-ING, TC-TI, TC-ATK, TC-AI, TC-RAG, TC-HITL, TC-WS, TC-DASH, TC-CMP, TC-AUD, TC-RES, …).

## 7.2 Golden IR results (2026-07-26)

| Metric | Threshold | Result | Pass |
|--------|-----------|--------|------|
| n_cases | ≥ 30 | 37 | ✓ |
| mean_ioc_f1 | ≥ 0.85 | **0.982** | ✓ |
| mean_technique_recall | ≥ 0.80 | **0.930** | ✓ |
| mean_grounding | ≥ 0.50 | **1.000** | ✓ |
| full_phase_fraction | ≥ 1.0 | **1.000** | ✓ |
| mean_latency_s | ≤ 7.0 | **0.001** | ✓ |
| n_errors | 0 | **0** | ✓ |
| failures | [] | **[]** | ✓ |

Command: `pytest backend/tests/test_golden_benchmark.py -q` (from repo conventions).

## 7.3 Broader automated suite

Representative suites (compliance, audit, LLM provider, RBAC, hunt, golden) were executed in development with **51+ tests passed** on the Wave C resilience branch. Full matrix status should be filled in Appendix A after formal sign-off runs.

## 7.4 RAG / retrieval notes

Hybrid search returns scored hits; BM25 remains available if vectors are disabled. Retrieval pairs support offline checks; full RAGAS board metrics remain optional future work (not required for golden CI).

## 7.5 Security tests

RBAC matrix denies analyst settings mutation and unauthorized review. Hardening tests cover weak secrets, lockout, and session behavior. Prompt-injection notes are delimited without tool execution.

## 7.6 Usability / demo path

`docs/DEMO_SCRIPT.md` targets a **&lt;10 minute** golden path: login → sample upload → workspace → playbook/grounding → HiTL approve → compliance/audit glance. 5-minute video is a student deliverable for viva.

## 7.7 Limitations of evaluation

- Live LLM quality is **not** gated offline (template path dominates CI)  
- Mock TI is default without keys  
- Heuristic ATT&CK can false-positive technique IDs  
- Load/perf is pilot-class, not 500-user certified  
- E2E testid drift may require maintenance  

---

# Chapter 8 — Results & discussion

## 8.1 Product outcomes vs Project 4

| Capstone expectation | ACTIRA outcome |
|---------------------|----------------|
| Log parse + IoC | Multi-format + golden F1 ~0.98 |
| TI enrichment | Multi-vendor + mock default |
| ATT&CK | Heuristic + heatmap + filters |
| RAG playbooks | Hybrid LanceDB + citations |
| HiTL | Severity + grounding gates |
| Dashboard | Live KPIs (demo opt-in) |
| Gradio UI baseline | **React enterprise shell** |
| Chroma baseline | **LanceDB hybrid (ADR)** |
| LangGraph multi-agent | Modular pipeline (honest framing) |

## 8.2 Sample workflow outcomes

Analysts obtain: extracted IoCs, enrichment status (mock/live), technique list, playbook JSON with phases and citations, grounding score, optional RCA, and review state. Executives obtain compliance alignment and export packs without claiming certification.

## 8.3 Error analysis

| Issue | Mitigation |
|-------|------------|
| False ATT&CK hits | HiTL + reviewer expertise |
| LLM JSON noise | `parse_llm_json` + template fallback |
| Empty dashboard misread | Live default; zeros when empty; no silent DEMO |
| Provider/model drift | Expanded catalog + soft-allow + fallback |
| Incident 404 hang | Explicit error/404 UI |

## 8.4 Enterprise readiness

Board score **78/100** — **Enterprise Pilot Ready (single-tenant)**. Strengths: documentation, AI IR narrative, workspace, golden eval, Wave C compliance/audit. Gaps: multi-tenant, full SSO JWKS, scale certification, remaining UX P0/P1 (Login marketing honesty, demo video/screenshots).

## 8.5 Screenshots

Figures live under this pack:

- `assets/screenshots/01_login.png` … `12_architecture.png` — **live light-theme UI captures** (Playwright: `capture_screenshots.py`)  
- `assets/figures/12_architecture.svg` (light enterprise architecture poster), `data_flow.svg`, plus Mermaid sources  

Embedded as Figures 1–12 in `PROJECT_REPORT.pdf` (one figure per page for readability). Regenerate with `python docs/capstone/export_report_pdf.py`.

---

# Chapter 9 — Challenges & mitigations

| # | Challenge | Mitigation in ACTIRA |
|---|-----------|----------------------|
| 1 | Large-scale logs | Job queue, ZIP limits; not real-time SIEM |
| 2 | Correlation accuracy | Heuristic ATT&CK + timeline + HiTL |
| 3 | False positives | Grounding score + review queue |
| 4 | TI integration cost/keys | Multi-vendor + mock default + vault |
| 5 | Contextual IR quality | Hybrid RAG + NIST-style phases + citations |
| 6 | Scalability | Single-tenant pilot packaging |
| 7 | HiTL coordination | Review queue, claim, audit |
| 8 | Privacy / secrets | Vault, RBAC, redaction options |

---

# Chapter 10 — Conclusion & future work

## 10.1 Conclusion

ACTIRA delivers a complete capstone-grade **human-gated AI IR advisor**: multi-format ingest, IoC/TI/ATT&CK, hybrid RAG playbooks, investigation workspace, HiTL, audit integrity, compliance alignment, multi-provider LLM resilience, and offline golden evaluation with strong CI metrics. It **meets and exceeds** TalentSprint Project 4 baseline expectations while remaining honest about non-goals versus hyperscale SIEM/XDR.

## 10.2 Future work

| Horizon | Items |
|---------|--------|
| Submission close | Demo video pack closed in-repo (`assets/video/` + `DEMO_VIDEO_5MIN.md`); optional VO dub / portal upload |
| Documented stretch (not demo-blocking) | Default real SBERT + broader KB corpus; continuous compliance automation; Hunt/Lance hybrid lake search — see `docs/product/PRODUCT_HONESTY.md` |
| Next release | SSO JWKS hardening, rate limits, E2E expansion |
| v2.0 | Multi-tenant, connectors, commercial pilot |
| v3.0 | Gated SOAR, forensics agent, formal multi-agent roster UX, RAGAS board |

### Trust & honesty surfaces (2026-07-27 close)

ACTIRA surfaces **explicit non-claims** in product UI: Hunt is case-pool scoring (not SIEM); Audit is hash-chained best-effort (not WORM); Analytics cache hit/miss/TTL footer; KB default hash embedder banner; Compliance assumed vs live-verified provenance. Dynamic audit actions, custom KB admin manager, Analytics drill-through to Hunt/Incidents, and live-probe unit tests close the remaining trust/UX depth items short of the demo video.

## 10.3 Ethical statement

ACTIRA is **advisory**. High-risk recommendations require human accountability. AI outputs must not be treated as unsupervised execution authority. Evaluators and operators should verify citations and TI freshness before action.

---

# References

1. TalentSprint / IISc track — Capstone Projects List (GenAI C2), Project 4 brief.  
2. Lewis, P. et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.  
3. MITRE ATT&CK Framework — https://attack.mitre.org/  
4. NIST SP 800-61 — Computer Security Incident Handling Guide.  
5. Vendor documentation: AbuseIPDB, VirusTotal (and configured TI providers).  
6. Internal product docs and this pack: `docs/capstone/*` (board, appendices, presentation).  
7. Enterprise board review: [`board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md`](./board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md) (2026-07-26).  

---

# Appendices

All full appendix bodies live under **`appendices/`** in this pack (not external repo paths). Summary index:

| App | File | Contents |
|-----|------|----------|
| **A** | [appendices/A_test_case_catalog.md](./appendices/A_test_case_catalog.md) | Master test catalog (TC-IDs, commands, status table) |
| **B** | [appendices/B_api_surface.md](./appendices/B_api_surface.md) | Dual `/api` + `/api/v1` path surface extract |
| **C** | [appendices/C_sample_outputs.md](./appendices/C_sample_outputs.md) · [C_sample_g001.json](./appendices/C_sample_g001.json) | Golden case g001 log → IoCs, ATT&CK, playbook |
| **D** | [appendices/D_configuration.md](./appendices/D_configuration.md) | Sanitized env/config (no secrets) |
| **E** | [appendices/E_team_roles.md](./appendices/E_team_roles.md) | Team / mentor / declaration (**fill before viva**) |
| **F** | [appendices/F_glossary.md](./appendices/F_glossary.md) | Glossary of terms |

Folder index: [appendices/README.md](./appendices/README.md).

### Appendix A — summary

Formal catalog with priorities and automation map. Mark Pass/Fail after formal runs. Representative automated evidence: golden suite all green (37 cases); Wave C related suites 51+ passed on development branch.

### Appendix B — summary

Cookie-authenticated modular API; capability groups: auth, ingest/jobs, incidents/workspace, review, hunt, analytics, settings/LLM, compliance, audit, KB, eval, ATT&CK, health. See full path table in Appendix B file.

### Appendix C — summary (case g001)

| Item | Result |
|------|--------|
| IoC | `185.220.101.45` (ip) |
| Technique | T1110 Brute Force |
| Phases | containment → eradication → recovery → lessons_learned |
| Grounding | 1.0 (template) |
| Provider | `template` |

### Appendix D — summary

Required: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGINS`, `ENV`. Optional LLM/TI keys; `FORCE_MOCK_TI` for CI; omit `REACT_APP_DASHBOARD_DEMO_FALLBACK` for live dashboard data.

### Appendix E — summary

Fill names, roles, mentor, and signatures in `appendices/E_team_roles.md`.

### Appendix F — summary

Key terms: ACTIRA, HiTL, IoC, RAG, RRF, CES, Grounding, Alignment score (≠ certification). Full table in Appendix F file.

### Assets for figures

| Path | Use |
|------|-----|
| [assets/screenshots/](./assets/screenshots/) | UI screenshots for report figures |
| [assets/figures/](./assets/figures/) | Architecture / flow diagrams |

---

*End of project report draft. Export to institute PDF template; keep claims consistent with board review (78/100 pilot) and golden metrics above. Keep all submission artifacts under `docs/capstone/`.*
