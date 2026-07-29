# Developer Experience Pack

Version: 2.0

The Developer Experience (DX) Pack is the single entry point for engineers contributing to the ACTIRA Enterprise SOC Platform.

These documents define the engineering standards, architecture, workflows, development practices, and quality expectations for the project.

---

# Getting Started

New contributors should read the documents in the following order:

1. Environment Setup
2. Local Development
3. Coding Standards
4. Backend Structure
5. Git Workflow
6. Pull Request Guidelines
7. Code Review Checklist
8. Debugging Guide
9. Enterprise Reviewer Persona (release / board reviews only)

---

# Documentation Index

| Category | Document | Purpose |
|-----------|----------|---------|
| Environment Setup | [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) | Install prerequisites, configure the development environment, and verify a successful setup. |
| Local Development | [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md) | Daily development workflow, running services locally, hot reload, feature flags, and common development tasks. |
| Debugging Guide | [DEBUGGING.md](DEBUGGING.md) | Backend, frontend, AI, database, performance, Docker, and production troubleshooting. |
| Coding Standards | [CODING_STANDARDS.md](CODING_STANDARDS.md) | Enterprise coding conventions, architecture principles, security practices, AI guidelines, and quality expectations. |
| Tooltip Prerequisite | [TOOLTIP_PREREQUISITE.md](TOOLTIP_PREREQUISITE.md) | Mandatory contextual help requirements for every page, panel, KPI, table, chart, and primary user action. |
| Branching Strategy | [BRANCHING.md](BRANCHING.md) | Git branching model, branch naming conventions, release strategy, and protected branch policies. |
| Git Workflow | [GIT_WORKFLOW.md](GIT_WORKFLOW.md) | Standard developer workflow from feature creation through code review, CI, merge, and cleanup. |
| Pull Request Guidelines | [PR_GUIDELINES.md](PR_GUIDELINES.md) | Pull request preparation, review expectations, documentation requirements, testing, and Definition of Done. |
| Code Review Checklist | [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md) | Comprehensive PR checklist covering correctness, architecture, UX, security, AI, testing, accessibility, and operations. |
| Enterprise Reviewer Persona | [ENTERPRISE_REVIEWER_PERSONA.md](ENTERPRISE_REVIEWER_PERSONA.md) | Principal / board production-readiness review standard (not for every PR). |
| Backend Structure | [BACKEND_STRUCTURE.md](BACKEND_STRUCTURE.md) | Modular monolith architecture, routing conventions, dependency rules, and backend organization. |
| Architecture Decision Records | [../adr/](../adr/) | Historical architecture decisions, rationale, trade-offs, and implementation guidance. |

---

# Recommended Reading Path

## New Developers

Read in order:

1. ENVIRONMENT_SETUP.md
2. LOCAL_DEVELOPMENT.md
3. CODING_STANDARDS.md
4. BACKEND_STRUCTURE.md
5. GIT_WORKFLOW.md
6. PR_GUIDELINES.md

---

## Frontend Developers

Recommended documents:

- ENVIRONMENT_SETUP.md
- LOCAL_DEVELOPMENT.md
- CODING_STANDARDS.md
- TOOLTIP_PREREQUISITE.md
- PR_GUIDELINES.md
- CODE_REVIEW_CHECKLIST.md

---

## Backend Developers

Recommended documents:

- ENVIRONMENT_SETUP.md
- LOCAL_DEVELOPMENT.md
- BACKEND_STRUCTURE.md
- CODING_STANDARDS.md
- DEBUGGING.md
- GIT_WORKFLOW.md

---

## AI / LLM Engineers

Recommended documents:

- CODING_STANDARDS.md
- DEBUGGING.md
- BACKEND_STRUCTURE.md
- CODE_REVIEW_CHECKLIST.md
- ADRs

---

## Security Engineers

Recommended documents:

- CODING_STANDARDS.md
- DEBUGGING.md
- PR_GUIDELINES.md
- CODE_REVIEW_CHECKLIST.md
- ENTERPRISE_REVIEWER_PERSONA.md (full release / board)
- [../operations/SECURITY_HARDENING.md](../operations/SECURITY_HARDENING.md)
- ADRs

---

## Reviewers

### Pull Request reviewers

Before approving a PR:

- PR_GUIDELINES.md
- CODE_REVIEW_CHECKLIST.md
- TOOLTIP_PREREQUISITE.md

### Release / board reviewers

For production readiness, pilot go-live, or executive board review:

- ENTERPRISE_REVIEWER_PERSONA.md
- [../operations/README.md](../operations/README.md)
- [../operations/SECURITY_HARDENING.md](../operations/SECURITY_HARDENING.md)
- [../ENTERPRISE_REVIEW.md](../ENTERPRISE_REVIEW.md)

---

# Engineering Standards

Every contribution should comply with:

- Enterprise Coding Standards
- Design Guidelines
- Backend Architecture
- Git Workflow
- Pull Request Guidelines
- Code Review Checklist

No code should bypass these standards.

---

# Development Workflow

```
Clone Repository
        │
        ▼
Environment Setup
        │
        ▼
Local Development
        │
        ▼
Create Feature Branch
        │
        ▼
Implement Feature
        │
        ▼
Run Local Validation
        │
        ▼
Update Documentation
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
Merge
        │
        ▼
Production Ready
```

---

# Mandatory Quality Gates

Every contribution should satisfy:

- Coding Standards
- Architecture Guidelines
- Security Requirements
- Accessibility Requirements
- Enterprise Design Guidelines
- Tooltip Prerequisite
- Unit Tests
- Integration Tests
- Documentation Updates
- CI Validation

---

# Documentation Maintenance

Documentation must be updated whenever:

- New features are introduced
- APIs change
- Configuration changes
- Environment variables are added
- Architecture changes
- Build or deployment changes
- Security behavior changes
- AI workflows change
- User workflows change

Documentation is considered part of the feature.

---

# Living Documentation

All documents in this pack are living documents and should evolve alongside the codebase.

When introducing new capabilities, contributors should update the relevant documentation as part of the same Pull Request.

---

# Related Documentation

The Developer Experience Pack complements the following repository documentation:

| Document | Purpose |
|----------|---------|
| [../../README.md](../../README.md) | Product overview and quick start |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution norms |
| [../ARCHITECTURE.md](../ARCHITECTURE.md) | System architecture |
| [../CONFIGURATION.md](../CONFIGURATION.md) | Environment variables |
| [../../SECURITY.md](../../SECURITY.md) | Security policy |
| [../../frontend/DESIGN_SYSTEM.md](../../frontend/DESIGN_SYSTEM.md) | UI design system |
| [../../CHANGELOG.md](../../CHANGELOG.md) | Release history |
| [../../RELEASE_NOTES.md](../../RELEASE_NOTES.md) | Release readiness notes |
| [../../ROADMAP.md](../../ROADMAP.md) | Near-term plan |
| [../operations/README.md](../operations/README.md) | Production operations pack |
| [../adr/](../adr/) | Architecture Decision Records |

---

# Definition of Done

A contribution is considered complete only when:

- Development environment is reproducible.
- Local development workflow is verified.
- Coding standards are followed.
- Backend architecture guidelines are respected.
- Git workflow is followed.
- Pull request requirements are satisfied.
- Code review checklist passes.
- Debugging guidance is updated where applicable.
- Documentation is synchronized.
- CI passes successfully.
- Enterprise design standards are maintained.
- Tooltip requirements are satisfied for all new UI.
- The feature is ready for production deployment.