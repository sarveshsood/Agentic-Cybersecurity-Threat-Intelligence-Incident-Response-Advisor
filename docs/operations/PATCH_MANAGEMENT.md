# Patch & Vulnerability Management Policy

Version: 2.0

This document defines the patch management, dependency management, vulnerability remediation, and Software Bill of Materials (SBOM) strategy for the ACTIRA Enterprise SOC Platform.

The objective is to maintain a secure, stable, and supportable software supply chain while minimizing operational risk.

---

# Objectives

The patch management process should:

- Reduce exposure to known vulnerabilities
- Maintain supported software versions
- Ensure repeatable updates
- Prevent regressions
- Maintain deployment stability
- Provide traceability for security audits
- Generate reproducible Software Bills of Materials (SBOMs)

---

# Scope

This policy applies to:

- Python dependencies
- Node.js dependencies
- Docker base images
- Operating system packages
- GitHub Actions
- Build tools
- AI provider SDKs
- Infrastructure components
- Third-party libraries

---

# Patch Cadence

| Component | Cadence | Priority |
|-----------|----------|----------|
| Critical security vulnerabilities | 48–72 hours | Critical |
| High severity vulnerabilities | Within 7 days | High |
| Medium severity vulnerabilities | Monthly | Medium |
| Low severity vulnerabilities | Quarterly | Low |
| Python dependencies | Monthly | Standard |
| Node.js dependencies | Monthly | Standard |
| Docker base images | Monthly | Standard |
| GitHub Actions | Quarterly or as required | Standard |
| Operating System packages | Monthly | Standard |
| Application releases | Semantic Versioning (SemVer) | Planned |

Emergency patches may be deployed outside the normal release cycle.

---

# Vulnerability Sources

Regularly review findings from:

| Source | In-repo default |
|--------|-----------------|
| `pip-audit` | **Yes** — `.github/workflows/security.yml` |
| Release SBOM | **Yes** — `.github/workflows/release.yml` |
| `npm audit` | **Yes** — `security.yml` job `npm-audit` |
| Dependabot | **Yes** — `.github/dependabot.yml` (pip / npm / actions) |
| Gitleaks | **Yes** — `security.yml` (best-effort on PRs) |
| Container image scanners (Trivy) | **Yes** — `security.yml` `image-scan` (schedule/push; PR with `docker` label) |
| GitHub Security Advisories | Monitor |
| OS package advisories | Host/cluster responsibility |
| Vendor security bulletins | Monitor |

Critical findings should trigger expedited review. See also [SECURITY_HARDENING.md](SECURITY_HARDENING.md) supply-chain section.

---

# Patch Management Workflow

```
Security Advisory
        │
        ▼
Vulnerability Assessment
        │
        ▼
Create Patch Branch
        │
        ▼
Upgrade Dependency
        │
        ▼
Run Security Scans
        │
        ▼
Execute Tests
        │
        ▼
Deploy to Staging
        │
        ▼
Validate & Smoke Test
        │
        ▼
Production Deployment
        │
        ▼
Update CHANGELOG
        │
        ▼
Generate Release SBOM
```

---

# Standard Patch Process

1. Review vulnerability reports (`pip-audit` CI, optional `npm audit` / Dependabot, advisories).
2. Create a dedicated patch branch.
3. Upgrade affected dependency or component.
4. Run linting, unit tests, integration tests, and security scans.
5. Deploy to the staging environment.
6. Perform functional and smoke testing.
7. Deploy to production following the approved release process.
8. Update the `CHANGELOG.md`.
9. Generate and archive the release SBOM.

---

# Dependency Management

## Python

Recommended tools:

- pip
- pip-tools (if adopted)
- `pip-audit`

Review:

- Unsupported packages
- Deprecated packages
- License compatibility
- Security advisories

---

## Node.js

Recommended tools:

- npm
- `npm audit`

Review:

- Vulnerabilities
- Deprecated packages
- Breaking changes
- Transitive dependencies

---

## Docker Images

Use:

- Supported base images
- Minimal images where practical
- Pinned image tags

Avoid floating tags such as:

```
latest
```

Rebuild images monthly or immediately following critical upstream security releases.

---

# Security Validation

Every patch should pass:

- Static analysis
- Dependency scanning
- Secret scanning
- Unit tests
- Integration tests
- Build validation
- Container build verification

Critical security fixes should receive an expedited code review.

---

# Staging Validation

Before production deployment verify:

- API health
- User authentication
- Dashboard
- Incident processing
- AI providers
- Knowledge Base
- Analytics
- Review Queue
- Background jobs

Document any observed regressions.

---

# Production Deployment

Recommended sequence:

1. Backup production.
2. Deploy updated application.
3. Monitor health and readiness.
4. Execute smoke tests.
5. Monitor logs and metrics.
6. Validate security controls.
7. Announce successful deployment.

Rollback if critical regressions are detected.

---

# Software Bill of Materials (SBOM)

Generate an SBOM for every production release.

Example using Syft:

```bash
syft dir:backend \
  -o spdx-json \
  > reports/sbom-backend.json
```

Alternative tools (where available):

- CycloneDX
- Syft
- SPDX-compatible generators

Store SBOM artifacts with the release for audit and compliance purposes.

---

# CI/CD Integration

The security pipeline should include:

- Dependency scanning
- Vulnerability assessment
- Secret scanning
- License validation
- Container scanning
- SBOM generation
- Artifact retention

Security-related artifacts should be retained according to organizational policy.

---

# Release Documentation

Every release should record:

- Updated dependencies
- Security fixes
- Breaking changes
- Known issues
- Mitigations
- SBOM location
- Related advisories
- Release version

Document changes in:

- `CHANGELOG.md`
- Release notes
- Security advisories (when applicable)

---

# Monitoring After Deployment

Monitor:

- API error rates
- Authentication
- Job processing
- AI provider health
- Performance
- Resource utilization
- Security alerts

Increase monitoring frequency immediately following critical security updates.

---

# Rollback Strategy

Rollback if:

- Critical functionality fails
- Severe performance degradation occurs
- Security controls regress
- Production smoke tests fail

Rollback steps:

1. Restore previous application version.
2. Validate health endpoints.
3. Verify database compatibility.
4. Execute smoke tests.
5. Investigate and remediate before redeployment.

---

# Compliance & Audit

Maintain records of:

- Vulnerability reports
- Patch approvals
- Test evidence
- Deployment history
- SBOM artifacts
- Security scan results
- Release notes

These records support internal governance and external audits.

---

# Operational Best Practices

Always:

- Patch critical vulnerabilities promptly.
- Keep dependencies within supported versions.
- Test patches in staging before production.
- Generate an SBOM for every release.
- Retain security scan artifacts.
- Review dependency health regularly.

Never:

- Ignore critical security advisories.
- Deploy untested dependency upgrades to production.
- Use unsupported or end-of-life dependencies.
- Depend on floating container image tags.
- Release without documenting security-related changes.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [../../SECURITY.md](../../SECURITY.md) | Security policy and vulnerability reporting |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Production security go-live checklist |
| [../../CHANGELOG.md](../../CHANGELOG.md) | Release history |
| [../../RELEASE_NOTES.md](../../RELEASE_NOTES.md) | Release readiness notes |
| [../dx/PR_GUIDELINES.md](../dx/PR_GUIDELINES.md) | PR / release documentation expectations |
| [../dx/CODE_REVIEW_CHECKLIST.md](../dx/CODE_REVIEW_CHECKLIST.md) | PR security and quality gate |
| [BACKUP.md](BACKUP.md) | Backup and restore after patch deploys |
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) | Recovery if a patch causes outage |
| [ROLLBACK.md](ROLLBACK.md) | Application rollback after bad release |
| [MONITORING.md](MONITORING.md) | Post-patch monitoring |
| [../dx/ENTERPRISE_REVIEWER_PERSONA.md](../dx/ENTERPRISE_REVIEWER_PERSONA.md) | Board / production-readiness review |

---

# Definition of Done

Patch management is considered complete when:

- [ ] Vulnerabilities have been assessed and prioritized.
- [ ] Required dependency updates are implemented.
- [ ] Security scans pass.
- [ ] Unit and integration tests pass.
- [ ] Staging validation is successful.
- [ ] Production deployment completes successfully.
- [ ] Smoke tests pass.
- [ ] Release notes and `CHANGELOG.md` are updated.
- [ ] SBOM is generated and archived.
- [ ] CI retains security audit artifacts.
- [ ] Post-deployment monitoring confirms stable operation.