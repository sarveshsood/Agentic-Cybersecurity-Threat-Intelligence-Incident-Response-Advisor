# Disaster Recovery Plan

Version: 2.0

This document defines the Disaster Recovery (DR) strategy for the ACTIRA Enterprise SOC Platform, including recovery objectives, recovery procedures, validation, and operational responsibilities.

---

# Purpose

The Disaster Recovery Plan ensures the platform can recover from infrastructure failures, security incidents, data corruption, or regional outages while minimizing business disruption.

This plan should be reviewed after every major release and validated through scheduled recovery exercises.

---

# Recovery Objectives

## Pilot Targets

| Metric | Target |
|---------|---------|
| Recovery Time Objective (RTO) | ≤ 4 Hours |
| Recovery Point Objective (RPO) | ≤ 24 Hours |
| Health Verification | ≤ 30 Minutes |
| Full Functional Validation | ≤ 2 Hours |

> These targets apply to pilot deployments. Production environments should establish service-level objectives (SLOs) and disaster recovery service-level agreements (SLAs) appropriate to business requirements.

---

# Disaster Scenarios

| Scenario | Target RTO | Target RPO | Recovery Action |
|-----------|------------|------------|-----------------|
| API container failure | Minutes | 0 | Restart service or deployment |
| Frontend service failure | Minutes | 0 | Redeploy frontend |
| MongoDB primary failure | Hours | Last successful backup or PITR | Restore backup or fail over |
| LanceDB corruption | Hours | Weekly snapshot / source documents | Restore snapshot or rebuild embeddings |
| Knowledge Base corruption | Hours | Daily backup | Restore MongoDB backup and reindex |
| Secret compromise | Hours | 0 | Rotate all credentials and invalidate sessions |
| AI provider outage | Minutes | N/A | Fail over to alternate provider or mock mode |
| Region-wide outage | Days | Last replicated backup | Redeploy infrastructure and restore data |
| Accidental data deletion | Hours | Last backup / PITR | Restore affected collections |
| Ransomware or security breach | Variable | Last clean backup | Isolate, investigate, restore, rotate secrets |

---

# Recovery Responsibilities

| Role | Responsibility |
|------|----------------|
| Platform Owner | Declare disaster and coordinate recovery |
| Infrastructure Team | Restore infrastructure and networking |
| Database Administrator | Restore MongoDB and validate integrity |
| Security Team | Investigate incidents and rotate credentials |
| Development Team | Validate application functionality |
| Product Owner | Approve production restoration |

---

# Recovery Workflow

```
Incident Declared
        │
        ▼
Assess Impact
        │
        ▼
Restore Infrastructure
        │
        ▼
Restore Database
        │
        ▼
Restore Configuration
        │
        ▼
Restore Secrets
        │
        ▼
Restore Knowledge Base
        │
        ▼
Restore LanceDB / Rebuild Index
        │
        ▼
Deploy Backend
        │
        ▼
Deploy Frontend
        │
        ▼
Validate Platform
        │
        ▼
Resume Operations
```

---

# MongoDB Recovery

## Step 1 — Provision MongoDB

Deploy:

- MongoDB Atlas
- Self-managed MongoDB
- Replica Set
- Replacement VM or Kubernetes deployment

Verify connectivity before restoring data.

---

## Step 2 — Restore Database

```bash
mongorestore \
  --uri="$MONGO_URL" \
  /backups/actira-YYYY-MM-DD
```

For compressed archives:

```bash
mongorestore \
  --gzip \
  --archive=/backups/actira-YYYY-MM-DD.archive.gz
```

If using MongoDB Atlas, prefer Point-in-Time Recovery (PITR) when available.

---

## Step 3 — Deploy Backend

Deploy the API with the correct environment configuration.

Verify:

```
MONGO_URL

JWT_SECRET

Provider Keys

Environment Variables
```

---

## Step 4 — Restore Vector Index

If LanceDB is unavailable:

- Restore filesystem snapshot

or

- Rebuild embeddings from the Knowledge Base

Verify:

- Vector search
- Semantic search
- AI retrieval

---

## Step 5 — Validate Platform

Verify:

- Backend health endpoint
- Frontend availability
- User authentication
- RBAC
- Incident retrieval
- Analytics
- Review Queue
- Knowledge Base
- AI Investigator
- Audit logging

---

## Step 6 — Rotate Secrets (If Required)

For security-related incidents, rotate:

- JWT Secret
- API Keys
- OAuth Credentials
- Database Passwords
- Service Account Credentials
- Encryption Keys

Invalidate existing sessions where appropriate.

---

# AI Recovery

Validate:

- AI providers
- Embedding generation
- Knowledge retrieval
- Citation grounding
- Prompt templates
- Confidence scoring
- Human-in-the-loop workflow

If providers are unavailable, enable configured fallback or offline/mock mode where supported.

---

# Configuration Recovery

Restore:

- Application configuration
- Feature flags
- Environment variables
- Deployment manifests
- Reverse proxy configuration

Do not restore obsolete or compromised secrets.

---

# Health Validation

Required endpoints:

```text
GET /api/health
GET /api/ready
GET /api/version
```

Expected:

```
HTTP 200
```

---

# Functional Smoke Tests

Verify:

- [ ] Administrator login
- [ ] Analyst login
- [ ] Dashboard loads
- [ ] Incident list loads
- [ ] Incident details open
- [ ] AI Investigator responds
- [ ] Knowledge Base search works
- [ ] Analytics dashboards load
- [ ] Review Queue functions
- [ ] Settings accessible
- [ ] Audit logs available
- [ ] OpenAPI endpoint accessible

---

# Data Validation

Confirm:

- Incident counts
- Knowledge Base documents
- User accounts
- Roles and permissions
- Review Queue entries
- Audit records
- Saved searches
- Platform configuration

Compare against backup metadata where available.

---

# Regional Disaster Recovery

Recovery sequence:

1. Provision replacement infrastructure.
2. Restore networking and DNS.
3. Deploy MongoDB.
4. Restore database.
5. Restore secrets.
6. Deploy backend.
7. Deploy frontend.
8. Restore vector indexes.
9. Validate AI providers.
10. Execute smoke tests.
11. Re-enable user access.

---

# Security Incident Recovery

For suspected compromise:

1. Isolate affected systems.
2. Preserve forensic evidence.
3. Notify stakeholders according to incident response procedures.
4. Restore from a known-good backup.
5. Rotate all credentials.
6. Review audit logs.
7. Validate application integrity.
8. Conduct a post-incident review before returning to normal operations.

---

# Disaster Recovery Testing

Conduct recovery exercises at least quarterly.

Each exercise should include:

- Infrastructure restoration
- Database restoration
- Application deployment
- User authentication
- Knowledge Base recovery
- AI validation
- Functional smoke testing
- Documentation review

Document:

- Recovery duration
- Issues encountered
- Root causes
- Improvement actions

---

# Monitoring During Recovery

Monitor:

- API health
- MongoDB availability
- Error rates
- Authentication
- Queue processing
- AI provider connectivity
- Resource utilization

Do not declare recovery complete until monitoring indicates stable operation.

---

# Communication Plan

During a recovery event:

- Notify internal stakeholders.
- Provide periodic recovery status updates.
- Record timelines and major decisions.
- Communicate expected restoration times.
- Publish a post-incident summary after resolution.

---

# Post-Recovery Review

After restoration:

- Verify RTO and RPO objectives.
- Review recovery logs.
- Confirm backup integrity.
- Update runbooks and documentation.
- Capture lessons learned.
- Schedule remediation for identified gaps.

---

# Operational Best Practices

Always:

- Maintain tested backups.
- Validate restore procedures regularly.
- Encrypt backups.
- Store offsite copies.
- Monitor recovery metrics.
- Keep runbooks current.
- Test disaster recovery before major releases.

Never:

- Assume backups are usable without restore testing.
- Restore directly into production without validation when an isolated environment is available.
- Reuse compromised credentials.
- Skip post-recovery verification.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [BACKUP.md](BACKUP.md) | Backup strategy, retention, restore steps |
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | Platform incident process leading into DR |
| [ROLLBACK.md](ROLLBACK.md) | Application-level rollback (non-DR) |
| [HA_VALIDATION.md](HA_VALIDATION.md) | Multi-replica readiness before DR scenarios |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Secrets, encryption, post-recovery hardening |
| [../../SECURITY.md](../../SECURITY.md) | Security policy |
| [MONITORING.md](MONITORING.md) | Health and post-recovery monitoring |
| [../OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md) | Daily operational procedures |
| [../CONFIGURATION.md](../CONFIGURATION.md) | Environment variables and secrets layout |
| [../dx/DEBUGGING.md](../dx/DEBUGGING.md) | Troubleshooting during recovery |

---

# Definition of Done

The Disaster Recovery Plan is considered operational when:

- [ ] Recovery objectives (RTO/RPO) are defined.
- [ ] Disaster scenarios are documented.
- [ ] Recovery procedures are tested.
- [ ] Backup and restore processes are validated.
- [ ] Secrets can be rotated quickly.
- [ ] Vector index recovery is documented.
- [ ] Functional smoke tests are defined.
- [ ] Quarterly recovery exercises are scheduled.
- [ ] Recovery documentation is current.
- [ ] Post-recovery review procedures are established.
- [ ] Production recovery can be completed within agreed service objectives.