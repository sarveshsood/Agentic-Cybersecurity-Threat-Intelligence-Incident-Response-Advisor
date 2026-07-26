# ADR 0005 — Mock threat intel by default

## Status

Accepted

## Context

CI and demos must not require paid TI keys.

## Decision

Empty keys → mock enrichment; `FORCE_MOCK_TI` for CI.

## Consequences

+ Offline reproducible  
  − Live scoring quality requires keys (documented)  
