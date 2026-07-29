# Enterprise Coding Standards

These standards are mandatory for all frontend, backend, AI, infrastructure, and security contributions.

---

# General Principles

- Maintain enterprise-grade code quality.
- Prioritize readability over cleverness.
- Prefer explicit code over implicit behavior.
- Avoid technical debt.
- Follow SOLID principles.
- Follow DRY (Don't Repeat Yourself).
- Follow KISS (Keep It Simple).
- Prefer composition over inheritance.
- Every feature must be production-ready.
- Every change must preserve backward compatibility unless explicitly approved.

---

# Architecture

- UI must never contain business logic.
- Business logic belongs in services/hooks/backend.
- Security decisions belong in policy modules.
- Shared functionality belongs in reusable libraries.
- Avoid duplicate implementations.
- Prefer configuration over hardcoding.
- Every module should have a single responsibility.
- Use dependency injection where appropriate.
- Minimize coupling between modules.

---

# Python

## Style

- Python 3.12+
- Prefer type hints on all public functions.
- Use dataclasses or Pydantic where appropriate.
- Use enums instead of magic strings.
- Use pathlib instead of os.path.
- Prefer f-strings.
- Keep functions small and focused.
- Maximum function length: ~75 lines.
- Maximum file length: ~500 lines (split when appropriate).

## Formatting

- Ruff
- Black
- isort

## Async

- Async Mongo
- Async HTTP
- Never block the event loop.
- Use asyncio.gather where appropriate.

## Security

- Never log secrets.
- Never log access tokens.
- Use redact_for_log().
- Validate all inputs.
- Sanitize user input.
- Never trust client data.

## Error Handling

- Raise meaningful exceptions.
- Never swallow exceptions.
- Never expose stack traces.
- Use structured logging.

---

# React / TypeScript

## Components

- Functional components only.
- Prefer hooks.
- Keep components under ~250 lines.
- Extract reusable components.
- Avoid deeply nested JSX.
- Memoize expensive computations.

## State

- Prefer local state.
- Lift state only when necessary.
- Avoid prop drilling.
- Prefer Context only for shared application state.

## Styling

- Use design-system components.
- Use design-system tokens only.
- Never hardcode colors.
- Never hardcode spacing.
- Never hardcode typography.
- Never hardcode shadows.

## Accessibility

- Keyboard accessible.
- Proper ARIA labels.
- Focus management.
- WCAG AA.

## Testing

- data-testid required.
- Stable selectors.
- No brittle selectors.

## Tooltips

Mandatory.

Every:

- Page
- Panel
- KPI
- Button
- Tab
- Sub-tab
- Icon
- Filter
- Table Column
- Chart
- Badge

must include contextual help.

Never merge without tooltips.

---

# API

- RESTful conventions.
- Pydantic request models.
- Pydantic response models.
- Explicit role dependencies.
- Version APIs.
- Stable error contracts.
- Never expose stack traces.
- Return structured errors.
- Validate every request.

---

# Database

- Indexed queries.
- No N+1 queries.
- Soft delete when appropriate.
- Audit critical changes.
- Schema versioning.
- Backward compatible migrations.

---

# Security

- RBAC everywhere.
- Least privilege.
- Secure cookies.
- CSRF protection.
- Input validation.
- Output encoding.
- Parameterized queries.
- Content Security Policy.
- Secure headers.
- Rate limiting.
- Audit logging.

Never:

- Store JWT in localStorage.
- Hardcode secrets.
- Commit credentials.
- Disable security checks.

---

# AI Standards

- Never hallucinate evidence.
- Always provide citations.
- Show confidence.
- Preserve evidence chain.
- Human approval where required.
- Log prompts securely.
- Log responses securely.
- Redact sensitive data.
- Explain reasoning.
- Never fabricate MITRE mappings.

---

# Charts

- Design-system colors only.
- Interactive.
- Drill-down capable.
- Tooltips mandatory.
- Legends mandatory.
- Accessible colors.
- Export support.

---

# Tables

Every table must support:

- Sorting
- Filtering
- Search
- Pagination
- Sticky headers
- Column visibility
- CSV Export
- Copy values
- Loading state
- Empty state

---

# Performance

- Lazy loading.
- Code splitting.
- Virtualized tables.
- Memoization.
- Debouncing.
- Avoid unnecessary renders.
- Optimize bundle size.

---

# Logging

Use structured logs.

Every important action should log:

- User
- Timestamp
- Action
- Entity
- Outcome
- Correlation ID

Never log secrets.

---

# Observability

- Health endpoints.
- Metrics.
- Distributed tracing.
- Correlation IDs.
- Audit trails.
- Performance metrics.

---

# Testing

Every feature requires:

- Unit tests
- Integration tests
- API tests
- UI tests
- Accessibility tests

Security-critical code requires:

- Negative tests
- Permission tests

---

# Documentation

Update documentation whenever behavior changes.

Required:

- API docs
- Architecture docs
- Design docs
- README
- Changelog

---

# Git

Conventional commits.

Examples:

feat:
fix:
docs:
refactor:
perf:
test:
build:
ci:
sec:
style:
chore:

---

# Pull Requests

Every PR should include:

- Summary
- Screenshots (UI)
- Test evidence
- Accessibility verification
- Performance impact
- Security impact
- Breaking changes
- Documentation updated

---

# Quality Gates

Code cannot be merged unless:

✓ Lint passes

✓ Build passes

✓ Tests pass

✓ No console errors

✓ No accessibility violations

✓ Tooltips implemented

✓ Responsive verified

✓ Dark mode verified

✓ Light mode verified

✓ Performance acceptable

✓ Security reviewed

✓ APIs unchanged (unless approved)

✓ Documentation updated

✓ No duplicated code

✓ No hardcoded values

✓ Design-system tokens used

✓ Business logic preserved

✓ Existing workflows preserved

✓ Existing test IDs preserved

✓ Audit logging preserved

✓ Enterprise UX standards satisfied

---

# Definition of Done

A feature is complete only when:

- Production-ready
- Accessible
- Secure
- Tested
- Documented
- Responsive
- Observable
- Auditable
- Performant
- Consistent with the design system
- Includes contextual help/tooltips
- Approved by quality gates