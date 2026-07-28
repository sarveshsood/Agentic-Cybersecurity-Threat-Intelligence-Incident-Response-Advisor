# Final Capstone Project — submission pack

**Everything for report / viva / board lives under this folder** (`docs/capstone/`).

```text
docs/capstone/
├── FINAL_DELIVERABLES/           # ★ submission bundle (PDF + PPT + video + VO + figures)
├── PROJECT_REPORT.md
├── PROJECT_REPORT.pdf            # generated via export_report_pdf.py
├── export_report_pdf.py
├── record_demo_video.py          # 5-min demo + Indian-accent voiceover
├── capture_screenshots.py
├── README.md
├── appendices/                   # A–F complete
├── assets/
│   ├── screenshots/              # 01–18 (UI + architecture posters)
│   ├── figures/                  # SVG + Mermaid architecture (A–E)
│   └── video/                    # demo mp4/webm + Indian VO
├── board/
├── outlines/
└── presentation/
    ├── ACTIRA_Capstone_Presentation.pptx
    ├── PPT_OUTLINE.md
    └── build_capstone_pptx.js
```

## Quick links

| Artifact | Path |
|----------|------|
| **★ Final deliverables folder** | [FINAL_DELIVERABLES/](./FINAL_DELIVERABLES/) — PDF + PPT + video + Indian VO + architecture |
| **Project report (MD)** | [PROJECT_REPORT.md](./PROJECT_REPORT.md) |
| **Project report (PDF)** | [PROJECT_REPORT.pdf](./PROJECT_REPORT.pdf) — chapters + arch A–E + figure narrations + appendices A–F |
| **Appendices A–F** | [appendices/](./appendices/) |
| **Viva PPTX** | [presentation/ACTIRA_Capstone_Presentation.pptx](./presentation/ACTIRA_Capstone_Presentation.pptx) — 25 slides incl. detailed architecture |
| **Demo video** | [assets/video/ACTIRA_Capstone_Demo_5min.mp4](./assets/video/ACTIRA_Capstone_Demo_5min.mp4) |
| **Board review** | [board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md](./board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md) |

**Golden metrics (2026-07-26):** 37 cases · IoC F1 **0.982** · technique recall **0.930** · board **78/100** pilot (trust UX + Wave C).  
**Formal pytest pack:** golden + compliance + audit + hunt + LLM + RBAC + hardening (re-run commands below after trust UX).  
**Product honesty:** [`docs/product/PRODUCT_HONESTY.md`](../product/PRODUCT_HONESTY.md)

## Commands

```bash
# Capture light-theme screenshots (backend :8001, frontend :3000)
python docs/capstone/capture_screenshots.py

# Regenerate PDF (readable layout + figures)
python docs/capstone/export_report_pdf.py

# Regenerate PPTX (light theme + embedded screenshots; requires pptxgenjs)
node docs/capstone/presentation/build_capstone_pptx.js

# Record ~5-min demo with cursor + Indian English voiceover (edge-tts en-IN-NeerjaNeural)
# Requires stack :3000/:8001; pip install edge-tts imageio-ffmpeg
python docs/capstone/record_demo_video.py
# Output: assets/video/ACTIRA_Capstone_Demo_5min.{webm,mp4} + voice mp3

# Re-run formal test pack
python -m pytest backend/tests/test_golden_benchmark.py \
  backend/tests/test_compliance_score.py \
  backend/tests/test_audit_intelligence.py \
  backend/tests/test_llm_fallback_catalog.py \
  backend/tests/test_executive_export.py \
  backend/tests/test_rbac_matrix.py \
  backend/tests/test_hardening.py -q
```

## Checklist

- [x] Full report + appendices pack
- [x] Viva PPTX
- [x] Board review
- [x] Formal automated test summary (66 pass)
- [x] Team names in Appendix E (Group 1)
- [x] Architecture figures A–E (SVG + PNG + Mermaid) in PDF and PPT
- [x] Live light-theme screenshots (01–18: UI + architecture posters)
- [x] Report PDF export (figure narrations + architecture detail section)
- [x] Viva PPTX light theme + detailed architecture slides (25 slides)
- [x] Demo video leaves login (credential submit, not demo-chip autofill) + Indian VO
- [x] FINAL_DELIVERABLES/ submission folder
- [x] Login honesty + Compliance disclaimer (product code)
- [x] Trust UX Tier-1 (Hunt honesty, Audit paging, Analytics cache footer, KB embedder banner, Compliance assumed-vs-verified)
- [x] Trust UX Tier-2 close (Audit dynamic actions, KB custom manager, Hunt/Compliance probes, Analytics drill-through)
- [x] Product honesty doc (`docs/product/PRODUCT_HONESTY.md`)
- [x] Mentor / signature fields documented (Appendix E — wet-ink / portal; blank by design)
- [x] Product honesty + PDF + PPTX linked from ROADMAP §L and board §8–9
- [x] Stretch (SBERT / hybrid hunt / continuous compliance) documented **non-blocking**
- [x] 5-minute demo video pack (`DEMO_VIDEO_5MIN.md` + `record_demo_video.py` + `assets/video/`)
