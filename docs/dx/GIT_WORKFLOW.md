# Git Workflow Guide

Version: 2.0

This document defines the standard Git workflow for all contributors to the ACTIRA Enterprise SOC Platform.

---

# Workflow Overview

Every code change follows the same lifecycle:

```
Clone Repository
        │
        ▼
Update main
        │
        ▼
Create Feature Branch
        │
        ▼
Implement Changes
        │
        ▼
Run Local Validation
        │
        ▼
Commit Changes
        │
        ▼
Push Branch
        │
        ▼
Open Pull Request
        │
        ▼
Code Review
        │
        ▼
CI Validation
        │
        ▼
Merge to main
        │
        ▼
Delete Feature Branch
```

---

# Step 1 — Sync Main

Always start from the latest main branch.

```bash
git checkout main

git pull origin main
```

Never begin new work from an outdated branch.

---

# Step 2 — Create a Feature Branch

Create a focused branch.

```bash
git checkout -b feat/incident-timeline
```

Examples

```
feat/analytics-dashboard

feat/knowledge-search

fix/login-loop

fix/review-queue

sec/rbac-hardening

perf/table-virtualization

docs/debugging-guide

refactor/backend-services
```

---

# Step 3 — Develop

While implementing changes:

- Keep commits small.
- Keep commits logical.
- Test continuously.
- Update documentation as needed.
- Avoid unrelated changes.

Never mix multiple features in one branch.

---

# Step 4 — Validate Locally

Run local quality checks before committing.

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

If unavailable, run the equivalent commands manually.

---

# Step 5 — Commit Changes

Commit frequently using Conventional Commits.

Examples

```text
feat: add AI investigation timeline

fix: resolve JWT refresh race

docs: update debugging guide

perf: optimize analytics aggregation

sec: enforce RBAC on review queue

refactor: extract search service
```

Each commit should represent one logical change.

---

# Step 6 — Keep Branch Updated

Before opening a Pull Request:

```bash
git fetch origin

git rebase origin/main
```

Resolve conflicts locally.

Avoid unnecessary merge commits.

---

# Step 7 — Push Branch

```bash
git push origin feat/incident-timeline
```

---

# Step 8 — Open Pull Request

Every PR should include:

- Summary
- Purpose
- Screenshots (UI changes)
- Testing evidence
- Security impact
- Performance impact
- Breaking changes
- Rollback considerations
- Documentation updates

Link related issues where applicable.

---

# Step 9 — Code Review

Reviewers should verify:

- Correctness
- Architecture
- Security
- Performance
- Accessibility
- Design-system compliance
- Tooltips
- AI governance
- Testing
- Documentation

Address all review comments before merging.

---

# Step 10 — CI Validation

The following must pass:

- Ruff
- Black
- isort
- ESLint
- Unit Tests
- Integration Tests
- Security Scan
- Dependency Scan
- Build Verification
- Docker Build (if applicable)

No failing checks should be ignored.

---

# Step 11 — Merge

Preferred merge strategy:

```
Squash and Merge
```

Alternative:

```
Rebase and Merge
```

Avoid merge commits unless explicitly required.

---

# Step 12 — Delete Branch

After merge:

```bash
git branch -d feat/incident-timeline

git push origin --delete feat/incident-timeline
```

Delete merged branches promptly to keep the repository clean.

---

# Hotfix Workflow

Critical production issues:

```bash
git checkout main

git pull

git checkout -b hotfix/session-timeout
```

After approval:

- Merge into main
- Merge into active release branch (if applicable)
- Tag new patch release

---

# Release Workflow

Create release branch:

```bash
git checkout -b release/v2.5.0
```

Only allow:

- Bug fixes
- Documentation
- Version updates

No new features.

Tag release:

```bash
git tag -a v2.5.0 -m "Release 2.5.0"

git push origin v2.5.0
```

---

# Conflict Resolution

When conflicts occur:

1. Pull latest main.
2. Rebase locally.
3. Resolve carefully.
4. Re-run all tests.
5. Verify functionality before pushing.

Never resolve conflicts without understanding the affected code.

---

# AI-Generated Code

AI-generated code must:

- Be reviewed by a human.
- Meet coding standards.
- Pass all tests.
- Pass security review.
- Be documented where appropriate.

AI suggestions are starting points, not final implementations.

---

# Sensitive Files

Never commit:

- `.env`
- `.env.local`
- API keys
- JWT secrets
- OAuth credentials
- Certificates
- Private keys
- Production configuration
- Customer data
- Real customer logs
- Database dumps

Use sample or anonymized data for testing.

---

# Branch Protection

Protected branch:

```
main
```

Rules:

- No force pushes
- No direct commits
- Pull Requests required
- Required reviews
- Required status checks
- CI must pass

---

# Rollback

If a deployment fails:

- Revert the merge commit or deploy the previous release tag.
- Investigate root cause.
- Document findings.
- Add regression tests before reattempting deployment.

---

# Best Practices

- Commit early and often.
- Keep PRs focused.
- Rebase frequently.
- Resolve conflicts promptly.
- Update documentation with code changes.
- Verify local tests before pushing.
- Remove debug code before committing.
- Keep `main` deployable at all times.

---

# Never

- Force-push `main`.
- Commit secrets.
- Commit API keys.
- Commit customer data.
- Commit real production logs.
- Disable CI checks.
- Merge failing builds.
- Skip required reviews.

---

# Definition of Done

A change is ready to merge only when:

- Feature is complete.
- Local validation passes.
- CI passes.
- Code review approved.
- Security review complete (when applicable).
- Documentation updated.
- Tests added or updated.
- Design guidelines followed.
- Coding standards followed.
- Debugging guide updated if needed.
- Branch rebased on latest `main`.
- Ready for production deployment.