# ACTIRA — Agent & AI Architecture

## 1. Design philosophy

ACTIRA uses a **controlled pipeline of specialized stages** with a single LLM “authoring” step for playbooks (and a
separate investigator Q&A). This is closer to **SOAR playbook generation + RAG** than to unconstrained multi-agent
debate.

Goals:

1. **Predictable** stage order for demos and audit
2. **Grounded** outputs via retrieval + citation allow-list
3. **Human authority** via HiTL (severity and grounding)
4. **Offline-testable** stages (golden dataset without live LLM)

---

## 2. Agent / stage map

```
┌─────────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐
│ Ingest/Parse│──►│ IoC + TI │──►│Correlate │──►│ ATT&CK map │
└─────────────┘   └──────────┘   └──────────┘   └─────┬──────┘
                                                      │
┌─────────────┐   ┌──────────┐   ┌──────────┐   ┌─────▼──────┐
│ HiTL gate   │◄──│ Grounding│◄──│ Playbook │◄──│ Hybrid RAG │
│ (policy)    │   │ score    │   │ LLM      │   │            │
└─────────────┘   └──────────┘   └──────────┘   └────────────┘
```

| Stage        | “Agent” type  | Tools                    | LLM?                 |
|--------------|---------------|--------------------------|----------------------|
| Parse        | Deterministic | parsers                  | No                   |
| IoC extract  | Deterministic | regex                    | No                   |
| Enrich       | Tool-using    | HTTP TI APIs / mock      | No                   |
| Correlate    | Deterministic | entity graph             | No                   |
| ATT&CK       | Heuristic     | keyword/catalog          | Optional refine flag |
| RAG          | Retriever     | BM25 + LanceDB + re-rank | No                   |
| Playbook     | Generator     | LLM + sources            | **Yes**              |
| Investigator | Q&A agent     | LLM + incident context   | **Yes**              |
| HiTL         | Policy        | pure function            | No                   |

---

## 3. Playbook agent (`playbook_agent.py`)

### Inputs

- Incident summary, IoCs, techniques
- Settings (provider, model, temperature, keys)
- Retrieved KB sources (`kb.search`)

### Controls

| Control         | Mechanism                                                                               |
|-----------------|-----------------------------------------------------------------------------------------|
| System prompt   | Fixed SOC IR expert + JSON schema                                                       |
| Grounding       | Only `citation_ids` present in retrieved `valid_ids` kept                               |
| Phase normalize | Map aliases → containment / eradication / recovery / lessons_learned                    |
| Failure mode    | Template/fallback playbook; forces human review path via low grounding / pipeline rules |
| Caching         | Anthropic prompt-cache friendly stable system prefix                                    |

### Outputs

`Playbook` with steps, `grounding_score` (fraction of steps with valid citations), model metadata.

---

## 4. Investigator agent (`ai_investigator.py`)

- Scoped to **one incident**
- Optional **IoC redaction** in prompts (`llm_redact_iocs`)
- Answer sanitization against valid KB/MITRE IDs
- Streaming endpoint for UX
- Starter questions for guided demo

---

## 5. RAG readiness

| Capability                 | Status                                   |
|----------------------------|------------------------------------------|
| Hybrid BM25 + dense RRF    | Implemented                              |
| Local vectors (LanceDB)    | Implemented                              |
| Custom KB ingest           | API + Mongo merge                        |
| Re-rank (Cohere / lexical) | Implemented                              |
| Embedder pluggability      | hash / sbert / lora / none               |
| Chunking for large docs    | Basic (doc-level); improve for long SOPs |
| Multi-tenant KB isolation  | Not present                              |
| Citation UX                | Frontend chips + snippet popover         |

**ChromaDB:** not recommended as an add-on; see architecture decision in [ARCHITECTURE.md](ARCHITECTURE.md). Quality
gains come from **sbert embeddings + content + re-rank**, not a second vector product.

---

## 6. Hallucination & abuse mitigation

| Risk                              | Mitigation                                                             |
|-----------------------------------|------------------------------------------------------------------------|
| Invented citations                | Allow-list filter to retrieved IDs                                     |
| Free-form prose JSON              | `parse_llm_json` robustness + json_mode where supported                |
| Low-quality playbook auto-go-live | Grounding threshold + severity HiTL                                    |
| Prompt injection via logs         | Logs treated as data in user message; no `eval`; investigator sanitize |
| Secret leakage in answers         | Settings never expose raw keys; optional IoC redact; vault at rest     |
| Cost blow-ups                     | Token budget monthly setting + usage tracking hooks                    |

**Gaps (roadmap):** adversarial red-team suite for prompt injection; systematic LLM-as-judge eval; content safety
classifier; per-tenant budgets.

---

## 7. Evaluation framework

| Artifact                                     | Purpose                                     |
|----------------------------------------------|---------------------------------------------|
| `backend/tests/golden/dataset.json`          | Offline IR pipeline metrics                 |
| `golden_eval.py`                             | IoC F1, technique recall, grounding, phases |
| `retrieval_pairs.json` + `retrieval_eval.py` | hit@k for RAG                               |
| UI Golden Benchmark                          | Admin-triggered run + last result cache     |
| CI `golden-ci.yml`                           | Regression gate without live LLM            |

---

## 8. Cost & latency

| Lever             | Guidance                                                                   |
|-------------------|----------------------------------------------------------------------------|
| Model             | Sonnet-class for quality demos; smaller models for bulk triage experiments |
| Retrieval `top_k` | Default 8; raise only with re-rank                                         |
| Embedder          | `hash` = free/fast/weak; `sbert` = better semantic / more RAM              |
| Prompt cache      | Keep system prompt stable (already)                                        |
| Streaming         | Investigator stream; playbook is full JSON (latency felt in UI)            |

---

## 9. Observability (AI)

- Structured request logs (`actira` logger)
- LLM usage module for budget awareness
- Job phases for pipeline timing
- Grounding score on every playbook

**Gap:** OpenTelemetry spans per stage; LangSmith/Helicone optional wiring (P2 in PRD).

---

## 10. Recommendations (prioritized)

1. **P0** Keep HiTL non-bypassable (already); add e2e test “critical never auto-approves”.
2. **P1** Default quality profile: `sbert` + hybrid + re-rank for demos with GPU/CPU budget.
3. **P1** Expand golden set with human-approved playbooks.
4. **P2** Stage-level tracing + cost dashboards in Analytics.
5. **P3** Optional LangGraph only if multi-tool SOAR actions are productized.
