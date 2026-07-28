# ACTIRA — Final Capstone Project Deliverables

**Generated:** 2026-07-27  
**Product:** ACTIRA (Agentic Cybersecurity Threat Intelligence & Incident Response Advisor)  
**Pack purpose:** Final Capstone Project board / viva / submission bundle

---

## Contents

| Path | Deliverable |
|------|-------------|
| `ACTIRA_PROJECT_REPORT.pdf` | Full project report: chapters, **architecture Figures A–E**, screenshot figures with narration, appendices A–F |
| `ACTIRA_PROJECT_REPORT.md` | Markdown source of the report |
| `ACTIRA_Capstone_Presentation.pptx` | Viva deck (**30 slides**) — architecture posters + full UI surface coverage |
| `video/ACTIRA_Capstone_Demo_5min.mp4` | ≈8 min demo (light UI, mouse cursor, **scene-synced soft Indian English VO**) |
| `video/ACTIRA_Capstone_Demo_5min.webm` | Same recording (Playwright source container) |
| `video/ACTIRA_Capstone_Demo_5min_voice_Indian_Neerja.mp3` | Concatenated standalone VO track (scene clips in order) |
| `video/ACTIRA_Capstone_Demo_5min_voice_pad.wav` | Full-length muxed track (adelay-placed per scene) |
| `video/ACTIRA_Capstone_Demo_5min_timeline.json` | Per-scene `t0` + VO duration (A/V lock evidence) |
| `video/ACTIRA_Capstone_Demo_5min_scenes.txt` | Scene trail (proves navigation left login) |
| `video/ACTIRA_Capstone_Demo_5min.txt` | Recording metadata |
| `video/DEMO_VIDEO_5MIN.md` | Per-scene narration guide |
| `screenshots/` | Live light-theme UI captures (01–18) |
| `architecture/` | Detailed architecture SVG + PNG posters (Figures A–E) |
| `CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md` | Board review checklist (optional context) |

---

## Architecture figures (PDF + PPT)

| Figure | File | Meaning |
|--------|------|---------|
| **A** | `architecture/12_architecture.png` | Overall modular monolith context |
| **B** | `architecture/15_data_flow.png` | Upload → review pipeline |
| **C** | `architecture/16_components.png` | Components / engines / data plane |
| **D** | `architecture/17_rag_pipeline.png` | Hybrid RAG + grounding |
| **E** | `architecture/18_hitl_policy.png` | Human-in-the-loop policy |

Figure narrations for architecture posters and UI screenshots are embedded in the PDF under:

1. **Architecture detail (submission posters)** — Figures A–E  
2. **Figures — Screenshots & architecture** — Figures 1–12 with short narration under each figure  

---

## Demo video (scene-synced voice)

- Recorder always fills credentials and submits **Sign in** (demo chips only autofill).  
- Full product tour: login → auth → dashboard → upload → incidents → workspace → playbook → HiTL review → hunt → compliance → audit → knowledge → analytics → settings → architecture posters → close.  
- Soft Indian English TTS via **edge-tts** `en-IN-NeerjaNeural` (rate/volume reduced).  
- **Each VO clip starts when its UI scene is marked** (`timeline.json` + `adelay` mux) — not a single continuous monologue drifted from the screen.  
- Duration ≈ **8 minutes** for full surface coverage with absorb holds after each line.

---

## How to regenerate (lab)

```bash
# Requires backend :8001 + frontend :3000 + demo users
python docs/capstone/capture_screenshots.py
python docs/capstone/export_report_pdf.py
node docs/capstone/presentation/build_capstone_pptx.js
python docs/capstone/record_demo_video.py
# Scene-synced voice remux only (needs timeline.json):
python docs/capstone/record_demo_video.py --voice-only
# then re-copy into this folder
```

---

## Submission checklist

- [x] Final Capstone Project framing throughout pack  
- [x] Project report PDF with figure narrations (no “Documentary note” labels)  
- [x] Detailed architecture A–E in PDF  
- [x] Detailed architecture A–E in PPT (plus recap gallery)  
- [x] Max surface coverage in PPT (30 slides)  
- [x] Light-theme screenshots (18 surfaces, verified)  
- [x] Demo video leaves login and tours product  
- [x] **Scene-synced** soft Indian-English voiceover  
- [x] Team list without primary-focus ownership columns  
- [x] Dates and board status current (27 July 2026)  
- [x] This final deliverables folder  
