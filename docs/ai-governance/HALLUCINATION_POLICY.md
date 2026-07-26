# Hallucination Policy

## Definition

Claims unsupported by retrieved sources or fabricated citation IDs.

## Controls

1. Citation allow-list filter
2. Grounding score
3. HiTL on low grounding / high severity
4. Template fallback when LLM fails

## Response

If hallucinated guidance reaches users: reject incident playbook, fix prompt/retrieval, add golden case, notify
reviewers via audit.
