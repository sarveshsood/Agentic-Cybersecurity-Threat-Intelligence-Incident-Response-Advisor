# Rollback Procedure

Version: 2.0

This document defines the standard rollback procedures for the **ACTIRA Enterprise SOC Platform** following unsuccessful deployments, configuration errors, security incidents, or production regressions.

The objective is to restore a stable production environment as quickly and safely as possible while minimizing downtime and preserving data integrity.

---

# Purpose

Rollback procedures should:

- Restore service availability rapidly.
- Minimize business impact.
- Preserve customer and operational data.
- Maintain auditability.
- Support repeatable recovery during failed releases.
- Reduce Mean Time to Recovery (MTTR).

Rollback is a standard operational process and should be exercised regularly in staging.

---

# Rollback Scenarios

Rollback may be required due to:

- Failed application deployment
- Production outage
- Critical software defect
- Performance regression
- Security vulnerability
- Configuration error
- Database migration failure
- AI provider integration failure
- Infrastructure changes causing instability

---

# Rollback Decision Matrix

| Scenario | Recommended Action |
|----------|--------------------|
| Application bug | Redeploy previous application version |
| Configuration error | Restore previous configuration |
| Feature regression | Disable feature flag if available |
| Performance degradation | Roll back application or configuration after verification |
| Security incident | Isolate, rotate credentials, and restore trusted version if necessary |
| Database corruption | Restore verified MongoDB backup |
| Failed deployment | Roll back to last known good release |

---

# Rollback Workflow

```
Issue Detected
       │
       ▼
Assess Severity
       │
       ▼
Stop Further Deployments
       │
       ▼
Select Rollback Strategy
       │
       ▼
Application / Configuration / Database Rollback
       │
       ▼
Validate Recovery
       │
       ▼
Smoke Testing
       │
       ▼
Monitor Stability
       │
       ▼
Incident Review
```

---

# Pre-Rollback Checklist

Before beginning a rollback:

- [ ] Confirm the issue warrants rollback rather than a hotfix.
- [ ] Notify stakeholders and freeze additional deployments.
- [ ] Capture relevant logs and diagnostics.
- [ ] Preserve audit records and deployment metadata.
- [ ] Verify the availability of the previous release image and configuration.
- [ ] Confirm backup availability if database restoration may be required.

---

# Application Rollback

## Step 1 – Identify Last Known Good Release

Locate the most recent stable image or Git tag.

Examples:

```
v1.1.0

v1.0.5

v1.0.4
```

Verify that the selected version has previously passed production validation.

---

## Step 2 – Redeploy Previous Version

Deploy the earlier container image using the appropriate deployment mechanism (Docker Compose, Kubernetes, Helm, etc.).

Example (Helm):

```bash
helm rollback actira <REVISION_NUMBER>
```

Example (Kubernetes image update):

```bash
kubectl set image deployment/actira-api \
  actira-api=YOUR_REGISTRY/actira-backend:v1.1.0
```

Ensure all API replicas and worker deployments use the same approved version.

---

## Step 3 – Validate Deployment

Confirm:

- Pods are running.
- Readiness probes succeed.
- No CrashLoopBackOff events.
- Background worker starts correctly.
- API is reachable.

---

# Database Rollback

Database restoration should only be performed when:

- Schema incompatibility prevents application operation.
- Data corruption is confirmed.
- Recovery cannot be achieved through forward fixes.

## Restore Procedure

1. Stop application writes.
2. Restore MongoDB from the verified pre-upgrade backup.
3. Restart MongoDB.
4. Redeploy the compatible application version.
5. Validate data integrity before reopening the service.

Refer to:

```
BACKUP.md

DISASTER_RECOVERY.md
```

---

# Configuration Rollback

Configuration issues are often recoverable without redeploying the application.

Restore configuration by:

- Reverting changes through the administrative UI (where supported).
- Restoring the configuration document from backup.
- Reverting environment variables in the secret manager or deployment manifests.
- Restarting affected services if required.

Validate configuration after rollback.

---

# Feature Flag Rollback

Where supported, disable experimental functionality before performing a full application rollback.

Examples:

Disable vector store:

```
ACTIRA_VECTOR_STORE=0
```

Force mock Threat Intelligence:

```
FORCE_MOCK_TI=true
```

Reduce LLM usage:

- Lower LLM budget
- Switch to a smaller model
- Disable optional AI features if appropriate

Feature flags should allow rapid mitigation while preserving core platform functionality.

---

# Smoke Testing

After rollback, verify the following:

## Platform

- `GET /api/health`
- `GET /api/ready`

Both should return healthy responses.

---

## Authentication

Verify:

- User login
- JWT issuance
- Session persistence
- RBAC functionality

---

## Core Workflows

Confirm:

- Dashboard loads
- Incident list displays
- Sample log upload succeeds
- Background worker processes jobs
- AI Investigator functions
- Knowledge Base search works
- Analytics load successfully

---

## Background Processing

Validate:

- Queue processing resumes.
- No duplicate job execution.
- Worker ownership remains correct.

---

# Monitoring After Rollback

Increase monitoring for an appropriate observation period.

Review:

- API error rate
- Health endpoints
- Queue depth
- Authentication failures
- MongoDB health
- AI provider status
- Resource utilization

Investigate any recurring issues before resuming normal deployment activity.

---

# Communication

Document and communicate:

- Rollback reason
- Affected release
- Restored version
- User impact
- Recovery timeline
- Remaining known issues

Update the incident timeline if the rollback is associated with a production incident.

---

# Post-Rollback Activities

After service stabilization:

- Identify the root cause.
- Create corrective actions.
- Add regression tests.
- Update documentation if required.
- Schedule a postmortem for significant incidents.
- Plan a corrected release.

Do not reattempt deployment until the underlying issue has been resolved and validated.

---

# Operational Best Practices

Always:

- Keep previous production images readily available.
- Validate backups before major releases.
- Test rollback procedures in staging.
- Preserve audit evidence before destructive operations.
- Perform smoke testing after every rollback.
- Monitor the platform closely following recovery.

Never:

- Restore production databases without confirming backup integrity.
- Roll back only a subset of application components unless explicitly supported.
- Skip validation after a rollback.
- Delete deployment artifacts needed for recovery.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [BACKUP.md](BACKUP.md) | DB restore when app rollback is insufficient |
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) | Site-level recovery beyond app rollback |
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | Incident process that may trigger rollback |
| [HA_VALIDATION.md](HA_VALIDATION.md) | Multi-replica deploy / rolling update notes |
| [MONITORING.md](MONITORING.md) | Post-rollback stability checks |
| [PATCH_MANAGEMENT.md](PATCH_MANAGEMENT.md) | Bad patch / dependency rollback context |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Re-verify secrets and demo flags after rollback |
| [../OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md) | Daily operational procedures |
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | Deployment models |
| [README.md](README.md) | Operations pack index |

---

# Definition of Done

A rollback is considered successful when:

- [ ] The previous stable application version has been restored.
- [ ] Configuration has been reverted where necessary.
- [ ] Database restoration has been completed and validated (if required).
- [ ] Health and readiness endpoints are healthy.
- [ ] Authentication and authorization function correctly.
- [ ] Core platform workflows pass smoke tests.
- [ ] Background job processing operates normally.
- [ ] Monitoring confirms stable operation.
- [ ] Stakeholders have been informed.
- [ ] The rollback has been documented and the root cause investigation has begun.