# ACTIRA — Final Capstone demo video (≈8 min full surface tour)

**Deliverable:** `docs/capstone/assets/video/ACTIRA_Capstone_Demo_5min.webm` (+ `.mp4` with **scene-synced** soft Indian-English voiceover)  
**Record UI:** `python docs/capstone/record_demo_video.py` (stack on :3000 / :8001)  
**Voice remux only:** `python docs/capstone/record_demo_video.py --voice-only` (needs existing `*_timeline.json`)  
**Honesty:** `docs/product/PRODUCT_HONESTY.md`  
**Latest record:** ≈480 s video · 16 scene marks · soft `en-IN-NeerjaNeural`

---

## One-line thesis (say once — login scene)

> ACTIRA is a **human-gated AI IR advisor** for single-tenant pilots — not a SIEM, not a formal compliance certification.

---

## Scene-synced voiceover (source of truth)

Narration is **not** one continuous monologue. Each UI scene has its own soft VO clip
(`en-IN-NeerjaNeural`, reduced rate/volume). The recorder:

1. Pre-synthesizes one clip per scene id (`_vo_seg_<id>.mp3`)
2. Marks `t0` when that UI appears (timeline JSON)
3. Holds on-screen for **VO duration + ~1.2 s absorb buffer**
4. Muxes clips with `adelay` so speech starts when that surface is visible

**Script source:** `SCENE_SCRIPT` in `docs/capstone/record_demo_video.py`  
**Artifacts:** `ACTIRA_Capstone_Demo_5min_timeline.json`, `_vo_seg_*.mp3`, `*_voice_pad.wav`

| Scene id | UI on screen | Narration focus (aligned to UI) |
|----------|----------------|----------------------------------|
| `login` | Login shell | Thesis; honest health probe; capability tiles; non-SIEM |
| `auth` | Sign-in form → session | Real credentials; chips autofill only; role session |
| `dashboard` | Dashboard | Live KPIs, severity, ATT&CK heatmap, cache honesty |
| `upload` | Upload / ingest | Job pipeline; multi-format; not a chat window |
| `incidents` | Incidents list | Case inventory, filters, deep links |
| `workspace` | Investigation workspace | Overview + Evidence / Timeline / MITRE / Graph / Playbooks |
| `playbook` | Playbook tab | Hybrid RAG phases, citations, grounding, force-pending |
| `review` | Review Queue (reviewer) | Race-safe HiTL; audit hash chain (not WORM) |
| `hunt` | Threat Hunt | NL case hunt ≤500; honesty banner (not SIEM lake) |
| `compliance` | Compliance | Alignment score ≠ ISO / SOC 2 |
| `audit` | Audit | Server-paged trail; inspect; integrity export |
| `knowledge` | Knowledge | Embedder banner (hash default for offline demos) |
| `analytics` | Analytics | Cache footer; drill-through (not live SIEM stream) |
| `settings` | Settings → LLM | Multi-provider catalog; vaulted secrets; fallback |
| `architecture` | Posters A–E | Modular monolith, data-flow, components, RAG, HiTL |
| `close` | Dashboard close | Golden metrics, 66 tests, 78/100 pilot ready; thank you |

Approximate dwell per scene ≈ speech length + 1.2 s. Full tour with role switches (analyst → reviewer → admin) and architecture posters typically lands near **~8 minutes**.

---

## Non-claims (must appear once in VO)

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

# Rebuild scene-synced audio onto existing webm (requires timeline.json)
python docs/capstone/record_demo_video.py --voice-only
```

### B. Live OBS (optional mic)

1. 1080p / 1920×1200, 30 fps, browser **light** theme  
2. Follow scene table above; keep speech on the matching surface  
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
- [x] Video files: `assets/video/ACTIRA_Capstone_Demo_5min.webm` + **`.mp4`** with scene-synced soft VO  
- [x] Timeline proves login → product surfaces; VO starts per scene mark  
- [x] Light theme · 1920×1200 · mouse cursor · Indian-English soft VO  

**Recorded:** light theme · 1920×1200 · mouse cursor · **per-scene soft Indian-English VO** · re-run after UI changes.

---

## Related

- Board: `docs/capstone/board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md`  
- Pack index: `docs/capstone/README.md`  
- Final bundle: `docs/capstone/FINAL_DELIVERABLES/`  
