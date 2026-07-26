# ADR 0003 — Pure HiTL policy module

## Status

Accepted

## Context

Auto-approve must never bypass severity gates; needs unit tests.

## Decision

`hitl_gate.decide_incident_status` pure function; review uses atomic conditional updates.

## Consequences

+ Testable, race-safe  
  − All call sites must use the module (no ad-hoc status)  
