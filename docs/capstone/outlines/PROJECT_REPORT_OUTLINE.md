# ACTIRA Capstone Project Report — Outline & Content Guide

**Title:** Agentic Cybersecurity Threat Intelligence & Incident Response Advisor (ACTIRA)  
**Program:** Advanced Certification Programme in Agentic and Generative AI  
**Capstone Project #:** 4 (TalentSprint list)  
**Suggested length:** 25–40 pages (including figures & appendix)

Use this outline to write the final PDF. Each section lists **required content** and **repo sources**.

---

## Front matter

1. Title page (team, mentor, date, institute)  
2. Certificate / declaration (per program template)  
3. Abstract (150–250 words)  
4. Keywords: Agentic AI, RAG, MITRE ATT&CK, HiTL, SOC, Incident Response  
5. Table of contents, list of figures, list of tables  

### Abstract draft (adapt)

> ACTIRA is an AI-assisted Security Operations platform that automates multi-format log ingestion, Indicator of Compromise extraction, threat-intelligence enrichment, MITRE ATT&CK mapping, hybrid Retrieval-Augmented Generation (RAG), and citation-grounded incident response playbook generation, with mandatory Human-in-the-Loop review for high-risk cases. The system is implemented as a modular FastAPI and React application backed by MongoDB and LanceDB, with multi-provider LLM support, offline golden evaluation, and enterprise-oriented controls (RBAC, secrets vault, audit trail, compliance alignment scoring). Evaluation demonstrates reliable offline IR regression gates and a complete analyst workflow from upload through investigation workspace. Limitations include single-tenant deployment, heuristic ATT&CK mapping, and dependence on external LLM/TI APIs for peak quality.

---

## Chapter 1 — Introduction

| Section | Content | Sources |
|---------|---------|---------|
| 1.1 Background | SOC alert volume, analyst fatigue | Capstone brief |
| 1.2 Problem statement | Manual IoC/TI/playbook bottleneck | Capstone list pp.12–14 |
| 1.3 Objectives | Functional + non-functional | VISION.md |
| 1.4 Scope & non-goals | Not SIEM/XDR replacement | VISION, ROADMAP N-01 |
| 1.5 Contributions | Workspace, HiTL, golden eval, multi-format | FEATURE_INVENTORY |
| 1.6 Report organization | Chapter map | — |

---

## Chapter 2 — Literature & Related Work

| Section | Content |
|---------|---------|
| 2.1 RAG for knowledge-intensive tasks | Lewis et al. 2020 |
| 2.2 MITRE ATT&CK & IR standards | NIST SP 800-61, ATT&CK |
| 2.3 Agentic systems | LangGraph/CrewAI landscape vs modular pipeline |
| 2.4 Commercial SOC platforms | Sentinel, Splunk ES, XSIAM, Falcon (positioning) |
| 2.5 Research gap | Grounded IR + HiTL open stack |

---

## Chapter 3 — System Requirements

| Section | Content | Sources |
|---------|---------|---------|
| 3.1 Personas | Analyst, Reviewer, Admin, Executive | samples/demo/PERSONAS.md |
| 3.2 Functional requirements | FR table from Project 4 methodology | Capstone + FEATURE_INVENTORY |
| 3.3 Non-functional | Security, latency pilot, auditability | THREAT_MODEL, CONFIGURATION |
| 3.4 Success metrics | Golden F1/recall, demo <10 min, HiTL coverage | golden README, DEMO_SCRIPT |

---

## Chapter 4 — System Architecture

| Section | Content | Sources |
|---------|---------|---------|
| 4.1 Architecture style | Modular monolith ADR 0001 | docs/adr |
| 4.2 High-level diagram | Context + container | diagrams/01, 02 |
| 4.3 Data flow | Upload → job → pipeline → UI | diagrams/03, 04 |
| 4.4 Component view | Routers, services, engines | BACKEND_STRUCTURE |
| 4.5 AI workflow | RAG + playbook + investigator | diagrams/05, 13; AGENT_ARCHITECTURE |
| 4.6 Security architecture | Auth cookie, RBAC, vault | diagrams/07, 11; SECURITY.md |
| 4.7 Deployment | Compose / K8s | diagrams/08; deployments/ |

**Figure checklist:** at least 4 diagrams exported from `diagrams/*.mmd` or presentation.

---

## Chapter 5 — Design & Methodology

| Section | Content |
|---------|---------|
| 5.1 Dataset & knowledge bases | MITRE catalog, CVE/KEV optional, synthetic logs, playbook KB |
| 5.2 Log analysis pipeline | Parsers, CES, correlator |
| 5.3 IoC extraction & TI enrichment | Mock vs live keys |
| 5.4 ATT&CK mapping | Heuristic rules + optional LLM refine |
| 5.5 Hybrid RAG | BM25 + LanceDB RRF + re-rank |
| 5.6 Playbook generation | Prompts, JSON schema, grounding |
| 5.7 HiTL policy | Severity + grounding gates |
| 5.8 Investigation workspace | Timeline, graph, notes, RCA |
| 5.9 LLM multi-provider & fallback | Catalog free/paid, chain |
| 5.10 Compliance & audit | Score, hash chain, evidence pack |

---

## Chapter 6 — Implementation

| Section | Content |
|---------|---------|
| 6.1 Tech stack table | Python, FastAPI, React, Mongo, LanceDB, pytest, Playwright |
| 6.2 Backend modules | Table of key files |
| 6.3 Frontend pages | Route map |
| 6.4 Configuration & secrets | .env, vault |
| 6.5 Notable APIs | OpenAPI summary |
| 6.6 CI/CD | GitHub Actions list |

---

## Chapter 7 — Testing & Evaluation

| Section | Content | Sources |
|---------|---------|---------|
| 7.1 Test strategy | Unit / integration / e2e / golden | TESTING.md |
| 7.2 Test case catalog | Summary of TC-IDs | `appendices/A_test_case_catalog.md` |
| 7.3 Golden IR results | Table of metrics from last run | golden-ci / local pytest |
| 7.4 RAG / retrieval notes | Hit@k if available | retrieval_pairs |
| 7.5 Security tests | RBAC, hardening | test_rbac, hardening |
| 7.6 Usability / demo path | <10 min golden path | DEMO_SCRIPT |
| 7.7 Limitations of evaluation | No live LLM quality gate in CI | Honesty |

**Paste actual pytest output** in appendix.

---

## Chapter 8 — Results & Discussion

| Section | Content |
|---------|---------|
| 8.1 Screenshots | Dashboard, Upload, Incident workspace, Review, Playbook, Compliance |
| 8.2 Sample outputs | IoCs, ATT&CK, playbook JSON excerpt |
| 8.3 Comparison to Project 4 baseline | Exceeds Gradio; LanceDB vs Chroma |
| 8.4 Error analysis | False ATT&CK, mock TI, template fallbacks |
| 8.5 Enterprise readiness | Score 78/100 pilot |

---

## Chapter 9 — Challenges & Mitigations

Map to capstone “Challenges” list:

1. Large-scale logs → job queue, ZIP limits, not real-time SIEM  
2. Correlation accuracy → heuristic ATT&CK + HiTL  
3. False positives → grounding + review  
4. TI integration → multi-vendor keys + mock default  
5. Contextual IR → RAG + NIST-style KB  
6. Scalability → single-tenant pilot  
7. HiTL coordination → review queue + audit  
8. Privacy → vault, redaction option, RBAC  

---

## Chapter 10 — Conclusion & Future Work

- Summary of objectives met  
- Future: multi-tenant, SSO JWKS, connectors, gated SOAR, formal RAGAS board  
- Ethical statement: advisory AI, human accountability  

---

## References

Include capstone list refs + Lewis RAG + ATT&CK + NIST 800-61 + vendor docs (VT, AbuseIPDB) + internal ADRs.

---

## Appendices

Full bodies under `docs/capstone/appendices/`:

| App | File | Content |
|-----|------|---------|
| A | `appendices/A_test_case_catalog.md` | Full test case catalog |
| B | `appendices/B_api_surface.md` | API path surface |
| C | `appendices/C_sample_outputs.md` | Sample log + playbook output |
| D | `appendices/D_configuration.md` | Configuration template (sanitized) |
| E | `appendices/E_team_roles.md` | Team roles & contributions |
| F | `appendices/F_glossary.md` | Glossary |

---

## Screenshot pack (map to report figures)

See `samples/demo/SCREENSHOT_CHECKLIST.md`. Minimum for report:

1. Login  
2. Dashboard live KPIs  
3. Upload + job complete  
4. Incident list  
5. Workspace timeline  
6. Entity graph  
7. Playbook + citations  
8. Review approve  
9. Hunt query results  
10. Compliance score  
11. Settings LLM  
12. Architecture diagram  

---

*Full prose draft:* see **[../PROJECT_REPORT.md](../PROJECT_REPORT.md)**.  
*Appendices A–F:* **[../appendices/](../appendices/)**.  
Write final PDF in your institute template; keep claims consistent with this outline and the board review.
