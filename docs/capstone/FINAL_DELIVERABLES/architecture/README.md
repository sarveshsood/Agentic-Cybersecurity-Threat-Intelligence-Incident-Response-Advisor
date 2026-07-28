# Architecture figures (Final Capstone pack)

Light-enterprise posters for the **PDF**, **PPT**, and **demo video**.

| File | Role | Pack use |
|------|------|----------|
| `12_architecture.png` / `.svg` | **Figure A** overall architecture | Modular monolith context |
| `15_data_flow.png` / `data_flow.svg` | **Figure B** data flow | Upload → job → HiTL → workspace → audit |
| `16_components.png` / `components.svg` | **Figure C** components | SPA · FastAPI · engines · data plane |
| `17_rag_pipeline.png` / `rag_pipeline.svg` | **Figure D** hybrid RAG | Query → BM25 + ANN → RRF → generate → citation allow-list → grounding / HiTL |
| `18_hitl_policy.png` / `hitl_policy.svg` | **Figure E** HiTL policy | Severity & grounding gates · race-safe review · audit |

Source of truth for generation: `docs/capstone/assets/figures/` and `docs/capstone/capture_screenshots.py`.
