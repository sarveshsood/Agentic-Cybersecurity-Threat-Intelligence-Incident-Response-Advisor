# Enterprise Git Branching Strategy

This document defines the Git workflow, branch naming, release process, and merge requirements for the ACTIRA Enterprise SOC Platform.

---

# Objectives

- Keep `main` production-ready.
- Encourage small, reviewable changes.
- Minimize merge conflicts.
- Support rapid releases.
- Preserve auditability.
- Enable secure software delivery.

---

# Branch Model

## Default Branch

```
main
```

Rules

- Protected branch
- Direct commits prohibited
- Pull Requests required
- CI must pass
- Code review required
- Security checks required
- Merge queue preferred (if available)

---

# Branch Naming

| Prefix | Purpose |
|----------|--------------------------|
| feat/ | New feature |
| fix/ | Bug fix |
| hotfix/ | Production hotfix |
| sec/ | Security improvements |
| docs/ | Documentation |
| refactor/ | Refactoring |
| perf/ | Performance improvements |
| test/ | Tests |
| ci/ | CI/CD |
| build/ | Build tooling |
| release/ | Release preparation |
| chore/ | Maintenance |
| spike/ | Research / Prototype |
| experiment/ | Temporary experiments |

Examples

```
feat/incident-timeline

feat/analytics-dashboard

feat/ai-investigator

fix/login-loop

fix/theme-switch

hotfix/auth-cookie

sec/rbac-hardening

perf/table-virtualization

docs/api-guide

docs/debugging-guide

refactor/design-system

test/auth-api

build/docker-update

ci/github-actions

release/v2.3.0

chore/dependency-update
```

---

# Branch Lifetime

Prefer

- Small
- Focused
- Short-lived

Target

1–5 days

Avoid

- Month-long branches
- Large feature branches
- Massive PRs

---

# Pull Request Size

Preferred

```
< 500 changed lines
```

Acceptable

```
< 1,000 lines
```

Split larger changes.

---

# Commit Messages

Use Conventional Commits.

Examples

```
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

revert:
```

Examples

```
feat: add IOC relationship graph

fix: resolve JWT refresh race

sec: enforce RBAC on analytics

docs: update debugging guide

perf: virtualize incident table
```

---

# Pull Request Requirements

Every PR must include

- Summary
- Motivation
- Screenshots (UI)
- Testing evidence
- Security impact
- Performance impact
- Breaking changes
- Rollback plan
- Documentation updates

---

# Required Reviews

Minimum

```
1 reviewer
```

Security changes

```
2 reviewers
```

Architecture

```
2 reviewers
```

Authentication

```
Security approval required
```

AI

```
AI reviewer required
```

---

# Merge Requirements

Before merge

- CI passes
- Build passes
- Unit tests pass
- Integration tests pass
- Lint passes
- Formatting passes
- Security scan passes
- Dependency scan passes
- Accessibility verified
- Tooltips verified
- Documentation updated
- No unresolved review comments

---

# Protected Branches

Protect

```
main
```

Optional

```
release/*
```

Restrictions

- No force push
- No direct commits
- Signed commits preferred
- Status checks required
- Reviews required

---

# Release Branches

Create only when preparing releases.

Example

```
release/v2.5.0
```

Allowed

- Bug fixes
- Documentation
- Version updates

No new features.

---

# Hotfix Branches

Created from

```
main
```

Naming

```
hotfix/session-timeout

hotfix/login-cookie

hotfix/rbac
```

Merge back into

- main
- active release branch

---

# Versioning

Semantic Versioning

```
MAJOR.MINOR.PATCH
```

Examples

```
v1.0.0

v1.2.0

v1.2.4

v2.0.0
```

Increment

MAJOR

Breaking changes

MINOR

Backward-compatible features

PATCH

Bug fixes

---

# Release Tags

Examples

```
v2.3.1

v2.4.0

v3.0.0
```

Annotated tags preferred.

---

# Feature Flags

Large features should be hidden behind feature flags.

Examples

```
AI Investigator

Knowledge Graph

Threat Hunting

SOAR

Compliance Dashboard
```

Merge early.

Enable later.

---

# Cherry Picking

Allowed only for

- Production fixes
- Critical security fixes
- Release branches

Avoid routine cherry-picking.

---

# Rebase Policy

Before opening PR

```
git fetch origin

git rebase origin/main
```

Resolve conflicts locally.

Avoid merge commits in feature branches.

---

# Git Ignore

Never commit

- .env
- Secrets
- API Keys
- JWT
- Local databases
- IDE files
- Build artifacts
- Node modules
- Python virtual environments

---

# Binary Files

Avoid committing

- Videos
- Large PDFs
- Large datasets
- Logs
- Generated reports

Use external storage where appropriate.

---

# AI Generated Code

Every AI-generated commit must be

- Reviewed
- Tested
- Documented
- Security checked
- Performance reviewed

Never merge AI output without human review.

---

# Rollback Strategy

Every release should support

- Rollback
- Database compatibility
- Feature flag disablement

---

# Branch Cleanup

Delete merged branches automatically.

Delete stale branches after

```
30 days
```

---

# CI Pipeline

Every PR should run

- Ruff
- Black
- isort
- ESLint
- Unit Tests
- Integration Tests
- UI Tests
- Accessibility Tests
- Security Scan
- Dependency Scan
- Docker Build

---

# Release Checklist

Before release

- Version updated
- Changelog updated
- Documentation updated
- Migration scripts verified
- Security review complete
- Performance verified
- Accessibility verified
- Production configuration verified
- Rollback tested

---

# Definition of Done

A branch is complete only when

- Code reviewed
- Tests passing
- CI passing
- Security approved
- Documentation updated
- Tooltips implemented
- Accessibility verified
- Performance verified
- Design guidelines followed
- Coding standards followed
- Ready for production deployment