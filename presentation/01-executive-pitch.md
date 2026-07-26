# ACTIRA — Executive Pitch

---

## 1. The problem

SOC teams still paste raw logs into general-purpose chatbots.

- Inconsistent playbooks
- No citations / audit trail
- Critical actions lack formal human gate
- Commercial SOAR is heavy and closed

> Note: Open with a pain story, not features.

---

## 2. The solution

**ACTIRA** — Agentic Cybersecurity Threat Intelligence & Incident Response Advisor

Ingest → enrich → MITRE map → grounded AI playbook → **Human-in-the-Loop**

---

## 3. Who it’s for

| Persona         | Value                        |
|-----------------|------------------------------|
| L1/L2 Analyst   | Faster triage, structured IR |
| Senior Reviewer | Controlled approval          |
| SOC Admin       | Keys, thresholds, eval       |
| Platform Eng    | Compose / K8s packaging      |

---

## 4. Product demo in one slide

1. Upload sample SSH + Log4Shell package
2. Watch multi-stage pipeline
3. Open citation-grounded playbook
4. Reviewer approves critical incident

---

## 5. Differentiation

| vs ChatGPT paste    | vs Full SIEM              | vs SOAR                  |
|---------------------|---------------------------|--------------------------|
| Grounding + HiTL    | Complements, not replaces | Advisory playbooks first |
| Offline golden eval | Lighter footprint         | Open MIT license base    |
| Multi-format ingest | Hybrid RAG local          | Secret vault hygiene     |

---

## 6. Architecture (simple)

React console → FastAPI → MongoDB + LanceDB → LLM / TI APIs

Modular monolith optimized for **trust and demos**, not microservices theater.

---

## 7. Security posture (board level)

- RBAC + JWT / httpOnly cookies
- Secrets never returned raw
- Encrypt-at-rest vault
- HiTL for critical severity
- ZIP bomb / ingest key controls

---

## 8. Maturity

| Metric                       | Value                             |
|------------------------------|-----------------------------------|
| Board score (v1.0 pack)      | **88–90 / 100 target trajectory** |
| Level                        | Enterprise Demonstration Ready    |
| Production multi-tenant SIEM | Not the claim                     |

---

## 9. Business outcomes

- Reduce MTTP (mean time to playbook)
- Standardize IR quality with citations
- Trainable / extendable OSS core
- Pilot path without six-figure SOAR

---

## 10. Ask / next step

1. 20-minute live demo
2. 30-day single-tenant pilot
3. Roadmap: SSO → modular API → connectors

---

## 11. Risk honesty

We do **not** claim EDR coverage or multi-tenant MSSP today.  
We **do** claim a production-candidate AI IR advisor with governance hooks.

---

## 12. Close

**ACTIRA: grounded AI for incident response — with humans still in command.**
