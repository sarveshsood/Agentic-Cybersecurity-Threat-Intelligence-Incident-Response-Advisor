# Pull Request Guidelines

Version: 2.0

This document defines the standards for creating, reviewing, approving, and merging Pull Requests (PRs) for the ACTIRA Enterprise SOC Platform.

---

# Objectives

Every Pull Request should:

- Deliver one logical change.
- Be easy to review.
- Preserve platform stability.
- Maintain enterprise quality.
- Include adequate testing.
- Maintain security and compliance.
- Keep `main` production-ready.

---

# Before Opening a Pull Request

Verify the following locally:

- Pull latest `main`
- Rebase feature branch
- Resolve conflicts
- Run linting
- Run formatting checks
- Run unit tests
- Run integration tests (if applicable)
- Update documentation
- Remove debug code
- Verify no secrets are committed

---

# Pull Request Scope

Prefer:

- One feature
- One bug fix
- One refactoring
- One documentation update

Avoid combining unrelated changes in a single PR.

---

# Pull Request Size

Ideal

```
< 400 changed lines
```

Acceptable

```
< 800 changed lines
```

Split larger changes into multiple PRs whenever possible.

Small PRs are reviewed faster and reduce merge conflicts.

---

# Pull Request Template

Every PR should complete the repository PR template.

Include:

- Summary
- Business purpose
- Scope
- Screenshots (UI changes)
- Test evidence
- Security impact
- Performance impact
- Breaking changes
- Rollback considerations
- Related issues
- Documentation updates

Do not leave template sections blank.

---

# Required Validation

Run before pushing:

## Backend

```bash
ruff check .

black --check .

isort --check-only .

pytest
```

## Frontend

```bash
npm run lint

npm test
```

## Fast Validation

```bash
make ci-fast
```

---

# Documentation

Documentation must be updated whenever behavior changes.

Examples

- README
- API documentation
- Architecture diagrams
- Design guidelines
- Configuration guide
- Debugging guide
- User guide
- Release notes
- Changelog

---

# OpenAPI

Whenever API behavior changes

Run

```bash
python backend/scripts/export_openapi.py
```

Verify

- Endpoints
- Request models
- Response models
- Authentication
- Examples

---

# UI Requirements

Every new UI must follow the design system.

Verify

- Design-system components used
- Design tokens used
- Responsive layout
- Light mode
- Dark mode
- Accessibility
- Keyboard navigation

No hardcoded colors, spacing, or typography.

---

# Tooltips (Mandatory)

Every new UI surface must include contextual help.

Required on:

- [ ] Page Headers
- [ ] Navigation Tabs
- [ ] Sub-tabs
- [ ] Panels
- [ ] KPI Cards
- [ ] Charts
- [ ] Tables
- [ ] Table Columns
- [ ] Filters
- [ ] Forms
- [ ] Buttons
- [ ] Icons
- [ ] Status Pills
- [ ] Severity Badges
- [ ] Entity Rows
- [ ] Primary Actions
- [ ] Drawers
- [ ] Dialogs
- [ ] Modals

Use

- `HelpTip`
- `Tip`
- `PageHeader`
- `PaneLabel`
- `DsButton tooltip=`
- `tipTitle`
- `tipBody`

Missing tooltips are a review blocker.

Reference

```
TOOLTIP_PREREQUISITE.md
```

---

# Backend Review

Verify

- Type hints
- Async I/O
- Pydantic models
- Validation
- Structured logging
- Error handling
- No blocking operations
- No duplicate logic
- No circular dependencies

---

# Frontend Review

Verify

- Functional components
- Hooks
- Minimal re-renders
- Proper state management
- Design-system usage
- Responsive layout
- Accessibility
- Stable `data-testid` values

---

# Security Review

Review for

- Authentication
- Authorization
- RBAC
- Secure cookies
- CSRF
- CORS
- Input validation
- Output encoding
- Injection risks
- Prompt injection
- Secret leakage
- Audit logging

Security-sensitive PRs require CODEOWNER approval.

---

# AI / Human-in-the-Loop Review

Verify

- Severity gate preserved
- Evidence chain preserved
- Citations filtered
- Confidence displayed
- Hallucination risk minimized
- Human approval enforced where required
- Prompt logging secure
- Response logging secure

Never weaken approval workflows.

---

# Performance Review

Verify

- No N+1 database queries
- Indexed queries
- Pagination for large datasets
- No unnecessary API calls
- No unnecessary React renders
- Memoization where appropriate
- Virtualization for large tables
- Acceptable bundle size

---

# Accessibility Review

Verify

- WCAG AA compliance
- Keyboard navigation
- Focus indicators
- ARIA labels
- Screen reader compatibility
- Color contrast
- No color-only communication

---

# Testing Requirements

Every PR should include appropriate testing.

Examples

- Unit tests
- Integration tests
- API tests
- UI tests
- Accessibility tests
- Regression tests

Include evidence in the PR description.

---

# CI Requirements

The following must pass before merge:

- Linting
- Formatting
- Unit tests
- Integration tests
- Build
- Security scan
- Dependency scan
- Docker build (if applicable)
- OpenAPI generation
- Documentation validation (if configured)

No failing checks may be ignored.

---

# Review Process

Reviewer responsibilities:

- Verify correctness
- Verify architecture
- Verify security
- Verify maintainability
- Verify performance
- Verify accessibility
- Verify documentation
- Verify enterprise design consistency

Address all review comments before requesting approval again.

---

# Merge Strategy

Preferred

```
Squash and Merge
```

Alternative

```
Rebase and Merge
```

Avoid merge commits unless explicitly required.

---

# After Merge

- Delete feature branch
- Verify deployment (if applicable)
- Confirm monitoring and health checks
- Update release notes if required

---

# Definition of Done

A Pull Request is complete only when:

- [ ] Feature or fix implemented
- [ ] Acceptance criteria satisfied
- [ ] CI is green
- [ ] Build succeeds
- [ ] No new critical Bandit findings
- [ ] No new security regressions
- [ ] Tests added or updated
- [ ] Existing tests pass
- [ ] Documentation synchronized
- [ ] OpenAPI updated (if applicable)
- [ ] Architecture diagrams updated (if applicable)
- [ ] Configuration updated (if applicable)
- [ ] Demo workflow verified
- [ ] Existing APIs preserved (unless intentionally changed)
- [ ] Existing workflows preserved
- [ ] Existing `data-testid` values preserved
- [ ] Accessibility verified
- [ ] Light mode verified
- [ ] Dark mode verified
- [ ] Performance reviewed
- [ ] Audit logging preserved
- [ ] Tooltips / HelpTips implemented on all new UI surfaces
- [ ] CODEOWNER approval obtained (for security-sensitive changes)
- [ ] Ready for production deployment