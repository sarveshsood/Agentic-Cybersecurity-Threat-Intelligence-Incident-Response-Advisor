# Rollback Procedure

## Application rollback

1. Identify last good image tag / git tag (`vX.Y.Z`)
2. Redeploy previous image (compose/k8s)
3. If schema-incompatible (rare): restore Mongo from pre-upgrade dump
4. Smoke: `/api/health`, login, sample upload

## Config rollback

- Revert Settings via admin UI or restore settings document
- Revert env in secret manager

## Feature flag style toggles

Disable experimental paths: `ACTIRA_VECTOR_STORE=0`, `FORCE_MOCK_TI=true`, lower LLM budget.
