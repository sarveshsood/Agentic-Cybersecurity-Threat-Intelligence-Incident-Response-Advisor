# ACTIRA — Product honesty & non-claims

**Audience:** Capstone board, evaluators, pilots  
**Last updated:** 2026-07-27  
**Status:** Binding for demos, report, PPT, and UI copy  

This document is the single source of **what ACTIRA claims and does not claim**. UI honesty banners and the board review must stay aligned with this file.

---

## One-line claim (safe)

ACTIRA is a **human-gated, AI-assisted IR advisor** for single-tenant pilots: multi-format log upload → IoC/TI/ATT&CK → hybrid RAG playbooks → investigation workspace → HiTL review → audit & compliance **alignment** scoring.

---

## Explicit non-claims

| Do **not** claim | Reality |
|------------------|---------|
| SIEM / XDR / SOAR replacement | Advisory workflow over uploaded evidence; not a log lake or response orchestrator of record |
| Formal ISO / SOC 2 / NIST / CIS **certification** | Product-**alignment** score only; use evidence packs for pilot GRC conversations |
| Full LangGraph multi-agent swarm product | Modular **pipeline stages** + named LLM agents; not a shipped agent roster product |
| ChromaDB requirement | **LanceDB** hybrid vectors (ADR 0002) — intentional design choice |
| Gradio/Streamlit baseline only | **React** enterprise SOC UI (exceeds baseline) |
| WORM / immutable legal hold audit store | Hash-chained **best-effort** audit trail — not WORM storage |
| Case hunt = SIEM lake search | Hunt scores ≤500 newest Mongo incidents (optional severity/status) — not KQL/SPL |
| Default embeddings = production SBERT quality | Default **hash** embedder (offline/CI); optional `sbert` / `lora` via env + reindex |
| Live SIEM analytics stream | Analytics uses short-lived **in-process cache** (TTL); footer exposes hit/miss |
| Multi-tenant SaaS | Single-tenant pilot packaging |
| Unsupervised execution of playbook actions | **HiTL** for high-risk paths; human authority remains |

---

## Trust UX surfaces (shipped)

| Surface | Honesty signal |
|---------|----------------|
| Hunt | Amber banner + API `honesty` / `pool_limit` / filters |
| Audit | Nav tip “best-effort, not WORM”; server paging + integrity sample |
| Analytics | Cache footer: served from cache vs fresh; TTL / age |
| Knowledge | Hash-embedder banner (or active sbert/lora) |
| Compliance | Disclaimer + assumed / env / live-verified provenance chips |
| Login | Demo metrics honesty (no fake “enterprise certified” claims) |

---

## Framing preferred in viva / video

**Prefer**

- “Human-gated IR advisor for pilots”  
- “Hybrid RAG with citation-grounded playbooks”  
- “Alignment score, not certification”  
- “Case hunt over incidents, not a SIEM”  

**Avoid**

- “Full multi-agent SOC platform in production”  
- “Certified SOC 2 / ISO out of the box”  
- “Replaces Sentinel / Splunk / Falcon”  

---

## Deferred (documented, not demo-blocking)

| Item | Status |
|------|--------|
| Broader KB corpus + default real SBERT | **Non-blocking stretch** — optional `ACTIRA_EMBEDDING_BACKEND=sbert` path exists; hash remains default |
| Continuous compliance automation | **Non-blocking stretch** — live probes for audit integrity + golden last run only |
| Hunt / Lance hybrid lake search | **Non-blocking stretch** — out of scope for pilot; incident-pool hunt is intentional |
| 5-minute demo video | Capstone deliverable — `docs/capstone/DEMO_VIDEO_5MIN.md` + `assets/video/` |

---

## Related

- Board review: `docs/capstone/board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md`  
- Vision non-goals: `docs/product/VISION.md`  
- ADR LanceDB: `docs/adr/0002-lancedb-not-chroma.md`  
- Demo script: `docs/DEMO_SCRIPT.md`  
- Capstone pack: `docs/capstone/README.md`  
