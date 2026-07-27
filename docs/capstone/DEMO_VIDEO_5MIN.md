# ACTIRA — 5-minute demo video (submission)

**Deliverable:** `docs/capstone/assets/video/ACTIRA_Capstone_Demo_5min.webm` (+ `.mp4` if ffmpeg)  
**Record UI:** `python docs/capstone/record_demo_video.py` (stack on :3000 / :8001)  
**Narrate:** this script over the silent recording (or live OBS with the same path)  
**Honesty:** `docs/product/PRODUCT_HONESTY.md`

---

## One-line thesis (say once)

> ACTIRA is a **human-gated AI IR advisor** for single-tenant pilots — not a SIEM, not a formal compliance certification.

---

## Timing + voiceover (≤ 5:00)

| Time | UI on screen | Say |
|------|----------------|-----|
| **0:00–0:30** | Login | “SOC analysts still paste logs into chatbots. ACTIRA turns multi-format evidence into a MITRE-aligned incident, citation-grounded playbook, and mandatory human review for high risk.” Point at RBAC demo cards / honesty status tiles. |
| **0:30–1:15** | Upload / sample | “Analyst stages a sample bundle — parse, IoC extract, TI enrich, ATT&CK map, hybrid RAG playbook — job pipeline, not a chat window.” |
| **1:15–2:30** | Incident workspace | “One case system of record: severity, IoCs, techniques, playbook phases with **citation chips** and **grounding score**. Answers stay incident-scoped.” |
| **2:30–3:15** | Review Queue (reviewer) | “Critical path is HiTL: reviewer approves or edits. Race-safe review and an **audit trail** — hash-chained best-effort, not WORM.” |
| **3:15–4:15** | Hunt → Compliance | “**Trust surfaces:** Hunt is **case hunt over ≤500 incidents**, not a SIEM lake. Compliance is a **product-alignment score** — assumed vs live-verified evidence — **not ISO/SOC 2 certification**.” |
| **4:15–4:45** | Audit / Knowledge / Analytics (glance) | “Audit is server-paged. Knowledge defaults to **hash embeddings** for offline demos — optional SBERT later. Analytics is cached, not a live SIEM stream.” |
| **4:45–5:00** | Dashboard close | “Modular FastAPI + React, Mongo + LanceDB, golden offline eval, pilot-ready. Roadmap stretch is real SBERT and lake-scale hunt — **non-blocking for submission**. Thank you.” |

---

## Non-claims (must appear once)

- Not SIEM / XDR / SOAR replacement  
- Not formal ISO / SOC 2 certification  
- Pipeline agentic stages ≠ full LangGraph swarm product  
- LanceDB (not Chroma); React (not Gradio baseline)  

---

## Recording options

### A. Automated UI track (repo default)

```bash
# Mongo + backend :8001 + frontend :3000
python docs/capstone/record_demo_video.py
```

Then dub voiceover in CapCut / DaVinci / OBS against the webm.

### B. Live OBS (if you want mic in one take)

1. 1080p, 30 fps, browser 110% zoom, light theme  
2. Follow timing table above  
3. Export `ACTIRA_Capstone_Demo_5min.mp4` into `docs/capstone/assets/video/`  

### Fallbacks

| If… | Do… |
|-----|-----|
| No LLM key | “Template / fallback playbook for offline demos.” |
| No TI keys | “Mock enrichment — same pipeline.” |
| Empty review queue | Show queue UI + say approve path is RBAC-gated. |
| Hunt empty | Banner still shows case-hunt honesty. |

---

## Checklist

- [x] Trust UX T-01 / T-01b closed (`ROADMAP.md`)  
- [x] `PRODUCT_HONESTY.md` + report PDF + PPTX  
- [x] Stretch (SBERT / hybrid hunt / continuous compliance) = non-blocking  
- [x] Video files: `assets/video/ACTIRA_Capstone_Demo_5min.webm` + **`.mp4`** (~4.5 min silent UI track)  
- [ ] Optional: dub voiceover from this doc; upload to institute portal  

**Recorded:** ~272 s wall-clock · 1600×900 · light theme · re-run `python docs/capstone/record_demo_video.py` after UI changes.

---

## Related

- Longer script: `docs/DEMO_SCRIPT.md`  
- Board: `docs/capstone/board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md`  
- Pack index: `docs/capstone/README.md`  
