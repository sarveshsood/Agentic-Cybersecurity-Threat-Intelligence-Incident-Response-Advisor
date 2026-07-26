# ACTIRA — Architecture Deck

---

## 1. Style

**Modular monolith** + async pipeline worker + local vector store.

Why: one domain (IR assist), strong consistency needs, demo/pilot ops simplicity.

---

## 2. Context

Users & SIEM → SPA / ingest → API → Mongo + LanceDB → LLM/TI/Slack

See `diagrams/01-overall-architecture.mmd`.

---

## 3. Components

Auth · Pipeline · Parsers · IoC · Enrichment · Correlator · ATT&CK · RAG · Playbook · Investigator · HiTL · Vault ·
Notify

---

## 4. Data stores

| Store   | Role                                         |
|---------|----------------------------------------------|
| MongoDB | SoR: users, incidents, jobs, settings, audit |
| LanceDB | Dense vectors kb_chunks + incidents          |
| FS      | Optional payloads / email outbox (lab)       |

---

## 5. AI path

Hybrid RRF → optional re-rank → LLM JSON → citation allow-list → grounding score → HiTL

---

## 6. Deploy topologies

Local · Docker Compose · Kubernetes (Helm chart scaffold) · Cloud runbooks (ACA/AKS/EKS/GKE)

---

## 7. Quality architecture

Golden offline eval · OpenAPI contract CI · Security workflows · Multi-suite pytest

---

## 8. Evolution

Router split → `/api/v1` → optional worker deploy → tenancy only when productized
