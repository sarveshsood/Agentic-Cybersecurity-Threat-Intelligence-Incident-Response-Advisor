## Summary

<!-- What does this PR change and why? -->

## Type of change

- [ ] Bug fix
- [ ] Feature
- [ ] Security hardening
- [ ] Documentation
- [ ] Tests / CI
- [ ] Refactor (no behavior change)
- [ ] Chore / deps

## Related issues

<!-- Fixes #123 -->

## Architecture impact

- [ ] No architectural change
- [ ] New module / API route
- [ ] Data model / Mongo collection change
- [ ] Auth / RBAC / secrets change
- [ ] Pipeline / HiTL / LLM prompt change

## Security checklist

- [ ] No secrets, keys, or real customer logs committed
- [ ] Settings / API responses do not leak secrets
- [ ] AuthZ checked for new routes (role matrix)
- [ ] User-controlled log text treated as untrusted (prompt injection)

## Test plan

- [ ] `pytest` (relevant suite) passes locally
- [ ] Golden / offline path still green if pipeline touched
- [ ] Manual demo path verified (if UX-visible)

```bash
# commands you ran
```

## Docs / diagrams

- [ ] Updated docs if behavior changed
- [ ] OpenAPI regenerated if routes/models changed (`python backend/scripts/export_openapi.py`)
- [ ] ADR added if decision is long-lived (`docs/adr/`)

## Rollback

<!-- How to undo if this ships broken -->
