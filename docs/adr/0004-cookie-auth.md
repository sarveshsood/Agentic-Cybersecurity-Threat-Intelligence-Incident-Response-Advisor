# ADR 0004 — Cookie-first SPA auth

## Status

Accepted

## Context

XSS token theft risk with long-lived localStorage JWTs.

## Decision

httpOnly cookie session for SPA; optional Bearer for API clients/tests.

## Consequences

+ Better default XSS posture  
  − Cross-site cookie config (SameSite/Secure) must match deploy  
