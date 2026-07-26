# ACTIRA Capstone Presentation Outline (PPT)

**Recommended length:** 12–18 slides + optional backup  
**Time:** 8–12 minutes + Q&A (record 5-minute version from slides 3–11)

Existing long-form decks: `presentation/01-*.md` … `08-*.md` — this outline is the **submission viva deck**.

---

## Slide 1 — Title

- Project title (full Capstone #4 name)  
- Product name: **ACTIRA**  
- Team members  
- Program / mentor / date  

## Slide 2 — Problem

- Alert overload in SOC  
- Manual IoC, TI, ATT&CK, playbook steps  
- Cost of delay & inconsistency  
- **Visual:** SOC pain funnel (alerts → backlog → fatigue)

## Slide 3 — Objectives & Non-Goals

**Objectives**

- Automate parse → IoC → TI → ATT&CK → RAG playbook  
- Human-in-the-loop for high risk  
- Investigation workspace for one case  

**Non-goals**

- Not replacing Sentinel / Splunk / Falcon  
- Not multi-tenant SaaS (v1)  
- Not unsupervised SOAR execution  

## Slide 4 — Solution Overview

- One-liner: *Human-gated AI IR advisor*  
- End-to-end flow diagram (upload → workspace → review)  
- Personas: Analyst, Reviewer, Admin  

## Slide 5 — Architecture

- Modular monolith: React + FastAPI + MongoDB + LanceDB  
- Dual API `/api` + `/api/v1`  
- Job queue + pipeline stages  
- **Figure:** `diagrams/01-overall-architecture` or `02-component`

## Slide 6 — AI / RAG Design

- Hybrid BM25 + vectors (RRF)  
- Citation-grounded playbooks  
- Grounding score + HiTL gates  
- Multi-provider LLM + fallbacks  
- Honest note: pipeline agentic stages (not full LangGraph swarm product)

## Slide 7 — Threat Intelligence & ATT&CK

- IoC extract + enrichment (live/mock)  
- Heuristic ATT&CK mapping + heatmap  
- Kill-chain narrative via timeline/RCA  

## Slide 8 — Investigation Workspace

- Tabs: Case, Evidence, Timeline, Graph, TI, MITRE, Notes, Playbooks  
- RCA + AI investigator  
- Screenshot  

## Slide 9 — Security & Governance

- RBAC (analyst / senior_reviewer / admin)  
- Cookie sessions, vault, lockout  
- Audit trail + integrity hashing  
- Compliance **alignment** score (not certification)  

## Slide 10 — Testing & Evaluation

- Golden offline IR suite (CI)  
- Unit / RBAC / pipeline isolation  
- Playwright smoke  
- Table: metric → result (fill after run)  
- Limitations: live LLM quality not gated offline  

## Slide 11 — Demo Path (5 minutes)

1. Login  
2. Ingest sample logs  
3. Open incident  
4. Timeline / graph  
5. Playbook + grounding  
6. HiTL approve  
7. Compliance / audit glance  

## Slide 12 — Results & Impact

- Time-to-first playbook reduced vs manual  
- Traceable citations  
- Reproducible golden eval  
- Enterprise pilot readiness score **78/100**  

## Slide 13 — Challenges & Mitigations

- Log volume → jobs + limits  
- False positives → HiTL  
- Hallucination → grounding + templates  
- TI cost → mock default + keys  

## Slide 14 — Future Work

- SSO JWKS, multi-tenant, connectors  
- RAGAS board metrics  
- Optional gated SOAR  

## Slide 15 — Conclusion & Q&A

- Objectives met vs Project 4  
- Thank you / contacts  

### Backup slides

- Competitive comparison table  
- Full tech stack  
- API surface  
- Team roles  
- Detailed test ID matrix  

---

## Design tips

- Dark enterprise theme (consistent with app)  
- Prefer architecture + screenshots over walls of text  
- Never claim “we replace SIEM”  
- Label mock TI / template playbook if shown  

## Export

Build slides in PowerPoint/Google Slides from this outline; optional source material in `presentation/*.md`.
