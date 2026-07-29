# Platform Incident Response Runbook

Version: 2.0

This document defines the incident response process for **ACTIRA platform incidents**.

It does **not** cover customer Security Operations Center (SOC) investigations or security incidents within customer environments.

The purpose of this runbook is to ensure rapid detection, containment, recovery, communication, and continuous improvement for incidents affecting the ACTIRA platform itself.

---

# Scope

This runbook applies to incidents involving:

- Platform availability
- API failures
- Authentication failures
- Database outages
- AI provider failures
- Queue failures
- Infrastructure failures
- Security incidents affecting ACTIRA
- Production deployment failures
- Data corruption
- Performance degradation

This document does **not** apply to:

- Customer SOC investigations
- Customer incident triage
- Customer security alerts
- Customer playbook execution

---

# Incident Severity

| Severity | Description | Target Response |
|----------|-------------|----------------|
| **SEV-1** | Complete platform outage, data loss, active security breach | Immediate (24×7) |
| **SEV-2** | Major feature unavailable, degraded service, AI or database failure | Within 30 minutes |
| **SEV-3** | Partial degradation, isolated functionality affected | Within 4 hours |
| **SEV-4** | Cosmetic issues, documentation, non-production defects | Next planned release |

---

# Incident Response Lifecycle

```
Detect
    │
    ▼
Assess
    │
    ▼
Contain
    │
    ▼
Eradicate
    │
    ▼
Recover
    │
    ▼
Validate
    │
    ▼
Communicate
    │
    ▼
Postmortem
    │
    ▼
Continuous Improvement
```

---

# Phase 1 — Detect

Incident detection may originate from:

- Health checks
- Readiness probe failures
- Monitoring alerts
- Elevated error rates
- User reports
- Failed deployments
- Security alerts
- Authentication anomalies
- Queue failures
- AI provider outages

Immediately gather:

- Time detected
- Impacted services
- Affected users
- Error messages
- Recent deployments
- Monitoring dashboards

---

# Phase 2 — Assess

Determine:

- Incident severity
- Business impact
- Number of affected users
- Data integrity concerns
- Security implications
- Recovery options

Questions:

- Is production affected?
- Is customer data at risk?
- Is the issue ongoing?
- Can service continue in a degraded state?

---

# Phase 3 — Contain

Immediate containment actions may include:

## Authentication

- Disable public registration
- Lock compromised accounts
- Revoke active sessions
- Increase authentication logging

---

## Ingestion

- Disable ingest API keys
- Pause scheduled imports
- Stop background processing if corruption is suspected

---

## Infrastructure

- Scale affected deployments to zero if abuse or compromise is confirmed
- Remove unhealthy replicas
- Redirect traffic to healthy instances
- Isolate compromised hosts

---

## AI

- Disable affected AI provider
- Switch to configured fallback provider
- Enable offline or mock mode for internal testing if appropriate

---

## Security

- Preserve evidence
- Prevent further compromise
- Avoid destructive actions before evidence collection

---

# Phase 4 — Eradicate

Remove the root cause.

Examples:

- Apply software patch
- Deploy hotfix
- Remove malicious artifacts
- Correct configuration
- Repair database
- Replace compromised infrastructure

Rotate credentials as required:

- JWT secret
- Ingest keys
- AI provider keys
- Threat intelligence provider keys
- OAuth credentials
- Database credentials
- Service account credentials

Document all rotated credentials.

---

# Phase 5 — Recover

Restore normal operations.

Recovery may include:

- Restore database backups
- Restore Knowledge Base
- Restore LanceDB or rebuild vector indexes
- Redeploy backend
- Redeploy frontend
- Restart background workers
- Re-enable integrations

If data integrity is uncertain:

- Restore from a verified backup
- Validate restored data before reopening access

---

# Phase 6 — Validate

Confirm:

- Health endpoint returns success
- Readiness probe succeeds
- Authentication works
- Dashboard loads
- Incident processing resumes
- AI Investigator functions
- Knowledge Base search works
- Analytics dashboards load
- Audit logging is operational
- Background workers process jobs correctly

Execute the standard smoke test before declaring recovery complete.

---

# Evidence Preservation

Before any destructive database operation:

Export and preserve:

- `audit_log`
- Incident records
- Authentication logs
- Platform logs
- Deployment logs
- Kubernetes events
- MongoDB diagnostic information
- Queue state
- Configuration snapshots

Evidence should be retained in accordance with organizational retention and legal requirements.

---

# Communication

Maintain an incident timeline including:

- Detection time
- Severity assignment
- Containment actions
- Recovery progress
- User impact
- Resolution time

Notify appropriate stakeholders based on severity.

---

# Post-Incident Review

Conduct a structured postmortem covering:

- Timeline
- Root cause
- Detection effectiveness
- Recovery effectiveness
- Communication
- Customer impact
- Preventive actions

Avoid assigning individual blame. Focus on improving systems and processes.

---

# Required Follow-Up Actions

Every platform incident should result in one or more of:

- Regression tests
- Monitoring improvements
- Alert tuning
- Documentation updates
- Runbook improvements
- Security enhancements
- Capacity planning updates
- Architecture improvements

Issues identified during the review should be tracked to completion.

---

# Common Incident Scenarios

## API Failure

Verify:

- Application logs
- Health endpoint
- Recent deployments
- Configuration changes

Recovery:

- Roll back deployment if required
- Restart service
- Validate APIs

---

## MongoDB Failure

Verify:

- Connectivity
- Replica status
- Storage
- Backup availability

Recovery:

- Restore from backup or fail over
- Validate collections
- Verify application health

---

## AI Provider Failure

Verify:

- Provider status
- Authentication
- Quotas
- Network connectivity

Recovery:

- Switch to fallback provider
- Retry requests
- Notify users if functionality is degraded

---

## Authentication Failure

Verify:

- JWT configuration
- Secret validity
- OAuth providers
- User store
- Rate limiting

Recovery:

- Restore authentication services
- Rotate credentials if compromise is suspected
- Invalidate affected sessions

---

## Security Incident

Immediate actions:

- Isolate affected systems
- Preserve evidence
- Rotate credentials
- Review audit logs
- Restore from a trusted backup if required
- Conduct forensic investigation before returning systems to normal operation

---

# Operational Checklist

- [ ] Incident severity assigned
- [ ] Stakeholders notified
- [ ] Containment completed
- [ ] Evidence preserved
- [ ] Root cause identified
- [ ] Required credentials rotated
- [ ] Recovery completed
- [ ] Smoke tests passed
- [ ] Monitoring verified
- [ ] Postmortem scheduled
- [ ] Regression tests created
- [ ] Documentation updated

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [BACKUP.md](BACKUP.md) | Backup and restore during recovery |
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) | DR when incidents escalate to site failure |
| [HA_VALIDATION.md](HA_VALIDATION.md) | Multi-replica / HA expectations |
| [CAPACITY_PLANNING.md](CAPACITY_PLANNING.md) | Capacity-related incident context |
| [ROLLBACK.md](ROLLBACK.md) | Release rollback procedures |
| [MONITORING.md](MONITORING.md) | Detection and alerting |
| [OBSERVABILITY_PACK.md](OBSERVABILITY_PACK.md) | Metrics, health, queue observability |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Security baseline; credential rotation expectations |
| [../../SECURITY.md](../../SECURITY.md) | Security policy and vulnerability reporting |
| [../OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md) | Day-to-day operational procedures |
| [../dx/DEBUGGING.md](../dx/DEBUGGING.md) | Engineering troubleshooting guide |

---

# Definition of Done

A platform incident is considered fully resolved only when:

- [ ] Service has been restored.
- [ ] Data integrity has been verified.
- [ ] Security risks have been mitigated.
- [ ] Required credentials have been rotated where applicable.
- [ ] Audit evidence has been preserved.
- [ ] Smoke tests have passed.
- [ ] Monitoring confirms stable operation.
- [ ] Stakeholders have been informed.
- [ ] A postmortem has been completed.
- [ ] Regression tests have been added.
- [ ] Preventive improvements have been planned or implemented.