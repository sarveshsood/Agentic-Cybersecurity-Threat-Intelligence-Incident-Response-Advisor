# Coding Standards

## Python

- Prefer type hints on public functions
- Ruff / Black / isort (see `ruff.toml`)
- No secrets in logs — use `redact_for_log`
- Pure policy functions for security-critical decisions
- Async I/O for Mongo / HTTP

## JavaScript / React

- Functional components
- Existing design-system tokens
- `data-testid` on interactive controls
- No raw JWT in localStorage (cookie-first)

## API

- Pydantic models for bodies
- Explicit role dependencies
- Stable error messages (no stack traces to clients)

## Commits

Conventional style preferred: `feat:`, `fix:`, `docs:`, `sec:`, `test:`, `chore:`
