# Capstone submission pack (Project 4)

**Everything for report / viva / board lives under this folder** (`docs/capstone/`).

```text
docs/capstone/
├── PROJECT_REPORT.md
├── PROJECT_REPORT.pdf            # generated via export_report_pdf.py
├── export_report_pdf.py
├── README.md
├── appendices/                   # A–F complete
├── assets/
│   ├── screenshots/              # 01–12 core + 13 audit + 14 golden
│   └── figures/                  # SVG + Mermaid architecture
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
| **Project report (MD)** | [PROJECT_REPORT.md](./PROJECT_REPORT.md) |
| **Project report (PDF)** | [PROJECT_REPORT.pdf](./PROJECT_REPORT.pdf) — detailed (~60 pp: chapters + architecture + figures + appendices A–F) |
| **Appendices A–F** | [appendices/](./appendices/) |
| **Viva PPTX** | [presentation/ACTIRA_Capstone_Presentation.pptx](./presentation/ACTIRA_Capstone_Presentation.pptx) |
| **Board review** | [board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md](./board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md) |

**Golden metrics (2026-07-26):** 37 cases · IoC F1 **0.982** · technique recall **0.930** · board **78/100** pilot.  
**Formal pytest pack:** **66 passed** (golden + compliance + audit + LLM + RBAC + hardening).

## Commands

```bash
# Capture light-theme screenshots (backend :8001, frontend :3000)
python docs/capstone/capture_screenshots.py

# Regenerate PDF (readable layout + figures)
python docs/capstone/export_report_pdf.py

# Regenerate PPTX (light theme + embedded screenshots; requires pptxgenjs)
node docs/capstone/presentation/build_capstone_pptx.js

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
- [x] Architecture figures (SVG + Mermaid)
- [x] Live light-theme screenshots (01–14: core + audit inspect + golden eval)
- [x] Report PDF export (readable typography, one figure/page)
- [x] Viva PPTX light theme + embedded captures
- [x] Login honesty + Compliance disclaimer (product code)
- [ ] 5-minute demo video (student-owned)
- [ ] Mentor name / signatures if institute requires
