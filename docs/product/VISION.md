# ACTIRA — Product Vision

**Codename / product:** ACTIRA (Agentic Cybersecurity Threat Intelligence & Incident Response Advisor)  
**Current category:** AI Threat Intelligence + Playbook Generator  
**Target category:** **Agentic AI SOC Command Center**  
**Last updated:** 2026-07-26  
**Audience:** Capstone board, portfolio reviewers, future enterprise pilots  

---

## One-line vision

An **AI-powered SOC operations platform** that runs the full incident lifecycle—with multi-agent investigation, explainable evidence, HiTL governance, and compliance-aware response—without claiming to replace Microsoft Sentinel, Splunk ES, QRadar, Cortex XSIAM, Google SecOps, or CrowdStrike Falcon as a SIEM/XDR of record.

---

## Positioning

| Dimension | Today | Target |
|-----------|--------|--------|
| **Job to be done** | Upload logs → IoCs + playbook | Run **detect → investigate → respond → audit** with AI co-pilots |
| **Competitive set** | Generic IR chatbots / demos | Capability *parity in narrative and workflow* with enterprise SOC platforms |
| **Unfair advantage** | Citation-grounded playbooks + HiTL | **End-to-end AI-assisted investigation that explains *why*, *how events connect*, *what evidence supports*, and *what next*** |
| **Non-goal** | Replace SIEM/XDR | Dual-run / upload / connector-assisted IR command center |

**Claim carefully:** workflow and investigation parity for capstone and pilot demos—not feature-for-feature parity with hyperscale SIEMs.

**Binding non-claims catalog:** [`docs/product/PRODUCT_HONESTY.md`](./PRODUCT_HONESTY.md) (Hunt ≠ SIEM, compliance ≠ certification, hash embedder default, audit ≠ WORM, pipeline ≠ LangGraph swarm product).

---

## Personas

| Persona | Primary surfaces | Success looks like |
|---------|------------------|--------------------|
| **SOC Analyst (L1/L2/L3)** | Investigation Workspace, upload, hunting, playbooks | Closes a case with timeline, RCA, evidence, and actions in one screen |
| **Reviewer / Manager / Incident Commander** | Review queue, case briefs, SLA/risk | Approves with confidence; sees gaps, not 400-page dumps |
| **Administrator / Platform Owner** | Health, identity, AI usage, integrations, settings | Safe config, observable AI cost, enterprise identity |
| **Executive (demo)** | Risk / maturity dashboard | 5-minute board story: risk, open criticals, compliance, MTTD/MTTR |

---

## Incident lifecycle (north-star flow)

```text
Collect → Detect → Investigate → Correlate → Enrich
    → Respond → Recover → Audit → Compliance
    → Lessons Learned → Continuous Improvement
```

| Stage | Platform intent |
|-------|-----------------|
| **Collect** | Multi-format evidence + optional SIEM/XDR connectors |
| **Detect** | Pipeline heuristics → UEBA / NL hunting over time |
| **Investigate** | **Investigation Workspace** (system of record for a case) |
| **Correlate** | Cross-log / cross-entity attack chains |
| **Enrich** | TI + graph of IoCs, hosts, users, processes |
| **Respond** | Environment- and compliance-aware playbooks + HiTL |
| **Recover** | Track recovery steps from playbooks / tasks |
| **Audit** | Who/what/when with risk and integrity signals |
| **Compliance** | Live score, gaps, evidence packs |
| **Lessons / CI** | Golden eval, feedback into prompts/playbooks |

---

## Product pillars (investment order)

### 1. AI Investigation & Digital Forensics (highest ROI)

- Evidence collection with auto format recognition  
- AI timeline builder (narrative, not raw rows)  
- AI attack chain (ATT&CK-mapped)  
- Root cause analysis (phish → macro → PS → persist → creds)  
- Interactive IOC / entity graph  

### 2. Investigation Workspace (system of record)

Single case screen:

`Case | Evidence | Timeline | Assets | Users | Threat Intel | MITRE | Notes | Recommendations | Playbooks`

Plus:

- DFIR-style investigation notebook  
- AI investigation assistant (why suspicious, missing logs, next checks)  

### 3. Advanced Log Analytics & Hunting

- Broader parsers (cloud / EDR / IDS) into CES  
- Cross-source correlation  
- Behavioral analytics (beaconing, LOLBins, impossible travel, …)  
- Natural-language threat hunting  

### 4. Compliance & Audit intelligence

- AI compliance advisor + continuous score  
- Auto evidence packs  
- AI audit review, tamper signals, executive export  

### 5. Persona command surfaces

- Reviewer: pending / risk / SLA / AI case brief  
- Admin: health, AI usage/cost, integration manager  
- Executive: risk, impact, maturity, cost avoidance  

### 6. Agentic orchestration (differentiation)

Named collaborating agents (productize existing pipeline stages first):

| Agent | Responsibility |
|-------|----------------|
| Triage | Classify / prioritize / SLA class |
| Investigation | Timeline, correlation, root cause |
| Threat Intel | IoC enrich, actor, ATT&CK |
| Compliance | Framework map, gaps, evidence |
| Playbook | Generate / tailor response |
| Forensics | Artifact-focused analysis (later) |
| Executive | Board-ready summaries |
| Reviewer | Gap validation, next-step critique |
| Admin | Health, integrations, AI cost |

---

## Roadmap waves

Aligned with engineering phases (see root `ROADMAP.md` § Vision waves):

| Wave | Focus | Priority | Status |
|------|--------|----------|--------|
| **A (v1.4)** | Investigation Workspace MVP: shell, timeline, RCA, entity graph, notebook, assistant | **P0 product** | ✅ Done |
| **B (v1.5)** | Broader evidence formats, hunting, behavioral analytics slices | High | ✅ Done |
| **C (v1.6)** | Compliance automation, audit intelligence, executive export, LLM fallback | High | ✅ Done |
| **D (v1.7)** | Multi-agent roster UX + executive dashboard + trust/QA polish | Medium | 📋 Planned |
| **E (v2.x)** | Enterprise connectors, multi-tenant, collab H-07/H-08 (PR-1 flags ✅) | Medium | 🔮 · collab started |

**Already complete (engineering foundation):** modular API, hybrid RAG, HiTL, golden eval, OTEL/HA scaffolding, OIDC scaffold, ATT&CK matrix, EVTX scaffold, architecture services/repos + analytics performance.

---

## What makes ACTIRA stand out

Not more KPI cards. The differentiator is:

1. **Explainability** — every conclusion tied to events, IoCs, and KB citations  
2. **Lifecycle cohesion** — one case from evidence to HiTL to audit  
3. **Persona completeness** — analyst → reviewer → admin in one demo path  
4. **Measurable IR quality** — golden benchmarks and grounding, not vibes  
5. **Honest scope** — command center + agentic IR, not “we replaced Sentinel”  

---

## Golden demo path (portfolio / capstone)

1. Multi-log package upload (Windows + proxy + firewall)  
2. Pipeline produces incident with IoCs + ATT&CK  
3. Open **Investigation Workspace** → visual timeline + attack chain  
4. Ask assistant: “Why is this suspicious?” / “What next?”  
5. Root-cause narrative + entity graph  
6. Generate / review playbook with citations  
7. Senior reviewer HiTL approve  
8. Audit entry + KPI / executive snapshot  

Target wall-clock: **&lt; 10 minutes**.

---

## Related artifacts

| Artifact | Path |
|----------|------|
| Master roadmap | `ROADMAP.md` |
| PRD | `memory/PRD.md` |
| Feature inventory | `docs/product/FEATURE_INVENTORY.md` |
| E2E capability matrix | `docs/product/E2E_CAPABILITY_MATRIX.md` |
| Investigation Workspace design | [`docs/product/INVESTIGATION_WORKSPACE_DESIGN.md`](INVESTIGATION_WORKSPACE_DESIGN.md) |
| Configuration | `docs/CONFIGURATION.md` |
