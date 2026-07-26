# ADR 0001 — Modular monolith

## Status

Accepted

## Context

Need shippable SOC IR assistant with one team and demo/pilot ops simplicity.

## Decision

Ship as modular monolith (FastAPI + React + Mongo), not microservices.

## Consequences

+ Simpler deploy, transactions/logic consistency  
  − `server.py` growth — mitigate via router extraction  
