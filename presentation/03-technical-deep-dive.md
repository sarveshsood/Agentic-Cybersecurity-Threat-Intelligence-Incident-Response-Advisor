# ACTIRA — Technical Deep Dive

---

## 1. Request path

SPA cookie auth → FastAPI dependency `get_current_user` → role re-bind from Mongo → handler

---

## 2. Pipeline stages

`queued → parsing → extracting → enriching → correlating → generating → done|failed`

ZIP limits: members + uncompressed bytes.

---

## 3. CES & correlation

Parsers normalize to common fields; correlator links entities across files into attack chain.

---

## 4. RAG implementation

- BM25 in-process
- LanceDB ANN
- RRF fusion
- Cohere re-rank optional
- Embedders: hash (CI) / sbert / lora

---

## 5. LLM façade

`llm_provider.py`: Anthropic / OpenAI / Gemini / Groq, JSON parse resilience, usage budget hooks.

---

## 6. HiTL pure policy

`decide_incident_status(severity, grounding, …)` — unit-tested; review uses conditional update → 409.

---

## 7. Secrets

DB → env resolve; Fernet `enc:v1:…`; optional `vault://` / `awssm://`.

---

## 8. Extension points

New parser · TI source · embedder · settings field · golden case · custom KB doc

---

## 9. Known debt

`server.py` size; unversioned API; hash default embedder; no SSO yet.
