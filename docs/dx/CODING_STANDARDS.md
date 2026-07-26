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
- **Tooltip prerequisite (mandatory):** every new page, panel, KPI, and primary action
  ships with `HelpTip` / `Tip` (or design-system `tipTitle`/`tipBody` / `tooltip` props).
  Do not merge UI without help. See [TOOLTIP_PREREQUISITE.md](TOOLTIP_PREREQUISITE.md).
  Prefer `PageHeader` / `Panel` / `KpiCard` / `PaneLabel` / `DsButton tooltip=` so tips
  are auto-wired by default.

## API

- Pydantic models for bodies
- Explicit role dependencies
- Stable error messages (no stack traces to clients)

## Commits

Conventional style preferred: `feat:`, `fix:`, `docs:`, `sec:`, `test:`, `chore:`
