# Figures (architecture / diagrams)

Light-enterprise posters for the capstone **PDF**, **PPT**, and **demo video**.

| File | Role | Pack use |
|------|------|-----------------|
| `12_architecture.svg` / `.png` | **Figure A** overall context | Users, edge (React + FastAPI), data plane (Mongo + LanceDB), external LLM/TI, IR pipeline strip |
| `data_flow.svg` / `.png` | **Figure B** data flow | Upload → job → parse → IoC → TI → ATT&CK → hybrid RAG → HiTL → workspace → audit |
| `components.svg` / `.png` | **Figure C** components | Frontend pages, FastAPI routers, engines, data/external planes (ADR 0001 modular monolith) |
| `rag_pipeline.svg` / `.png` | **Figure D** hybrid RAG | Query → BM25 + ANN → RRF → generate → citation allow-list → grounding / HiTL |
| `hitl_policy.svg` / `.png` | **Figure E** HiTL policy | Severity & grounding gates, race-safe review, audit integrity (not WORM) |

## Editable sources

| File | Description |
|------|-------------|
| `01-overall-architecture.mmd` | Overall architecture (Mermaid) |
| `02-component.mmd` | Component view |
| `03-data-flow.mmd` | Data flow |
| `05-ai-workflow.mmd` | AI workflow |
| `13-rag-pipeline.mmd` | RAG pipeline |
| `14-hitl.mmd` | Human-in-the-loop |

## How PNGs are produced

```bash
# Renders SVG → PNG into assets/screenshots/15–18 + twins under figures/
python docs/capstone/capture_screenshots.py
```

Open SVG in a browser or insert into Word/PDF. Re-render Mermaid via [mermaid.live](https://mermaid.live) if you need alternate PNG exports.

## Inclusion

- **PDF:** Architecture detail section (Figures A–E) + screenshot pack Figure 12  
- **PPT:** Slides 5–9 (detailed architecture) + slide 25 recap gallery  
- **Video:** Architecture posters mid-demo via `record_demo_video.py`
