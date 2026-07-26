# Scaling Guide

## Vertical

Larger API CPU/RAM for sbert embeddings and concurrent uploads.

## Horizontal

1. Stateless API replicas behind LB
2. Mongo job claim for workers (`docs/MULTI_WORKER.md`)
3. Shared or disabled LanceDB as appropriate
4. Session cookies: sticky not required if JWT self-contained

## What not to scale first

Don't add microservices until LLM queue and Mongo are healthy.
