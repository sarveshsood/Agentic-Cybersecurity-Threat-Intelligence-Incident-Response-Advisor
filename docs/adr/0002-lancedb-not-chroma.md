# ADR 0002 — LanceDB for local vectors

## Status

Accepted

## Context

Need local dense retrieval without ops-heavy services.

## Decision

Use LanceDB under `backend/data/lancedb` with hybrid BM25 RRF. Do not add Chroma in parallel.

## Consequences

+ Embedded, file-backed, already integrated  
  − Multi-node sharing needs volume/strategy later  
