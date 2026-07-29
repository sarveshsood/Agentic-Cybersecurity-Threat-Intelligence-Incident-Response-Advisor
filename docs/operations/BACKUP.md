# Backup & Recovery Strategy

Version: 2.0

This document defines the backup, recovery, retention, and disaster recovery strategy for the ACTIRA Enterprise SOC Platform.

---

# Objectives

The backup strategy is designed to:

- Protect business-critical data
- Minimize downtime
- Enable rapid recovery
- Support disaster recovery
- Meet audit and compliance requirements
- Preserve AI knowledge assets
- Validate recoverability through regular testing

Backups that have never been restored are considered **unverified**.

---

# Recovery Objectives

| Objective | Target |
|-----------|--------|
| Recovery Point Objective (RPO) | ≤ 24 hours (pilot) |
| Recovery Time Objective (RTO) | ≤ 4 hours (pilot) |
| Critical Configuration Recovery | ≤ 30 minutes |
| Production Recovery Validation | Quarterly |

---

# Backup Scope

| Asset | Backup Method | Frequency |
|--------|---------------|-----------|
| MongoDB (`soc_console`) | `mongodump` or MongoDB Atlas snapshots | Daily + Pre-release |
| Application Configuration | Secure Vault / Secret Manager export | On every change |
| Environment Files | Secure encrypted backup (never Git) | On every change |
| Knowledge Base (`kb_docs`) | Included in Mongo backup | Daily |
| Audit Logs | Mongo backup + legal hold exports | Daily |
| User Settings | Mongo backup | Daily |
| Platform Settings | Mongo backup | Daily |
| Review Queue | Mongo backup | Daily |
| Analytics Data | Mongo backup | Daily |
| Saved Searches | Mongo backup | Daily |
| AI Prompt Templates | Source Control + Config Backup | On change |
| OpenAPI Specification | Source Control | Every release |
| Documentation | Source Control | Continuous |
| LanceDB | Re-index or filesystem snapshot | Weekly / On demand |
| Uploaded Evidence | Object Storage backup | Daily |
| Application Logs (if retained) | Centralized logging platform | Per retention policy |

---

# Backup Frequency

## Daily

- MongoDB
- Audit Logs
- Knowledge Base
- Review Queue
- Platform Settings
- Analytics

---

## Weekly

- LanceDB Snapshot
- Full configuration verification
- Recovery validation

---

## Before Every Release

- Mongo snapshot
- Configuration backup
- Secret validation
- OpenAPI archive
- Deployment artifacts

---

## On Configuration Change

Backup:

- `.env`
- Secret Store
- JWT configuration
- AI Provider configuration
- OAuth configuration

---

# MongoDB Backup

Preferred methods

## MongoDB Atlas

- Automated snapshots
- Point-in-time restore (if available)

---

## Self-Hosted

```bash
mongodump \
  --uri="$MONGO_URL" \
  --db=soc_console \
  --out=/backups/actira-$(date +%F)
```

Recommended compression

```bash
mongodump \
  --gzip \
  --archive=/backups/actira-$(date +%F).archive.gz
```

---

# Secret Management

Never back up secrets into Git.

Use:

- Azure Key Vault
- AWS Secrets Manager
- HashiCorp Vault
- Encrypted password manager
- Enterprise secret management platform

Back up:

- JWT secrets
- API keys
- OAuth credentials
- Database credentials
- Encryption keys

Access should follow the principle of least privilege.

---

# LanceDB

LanceDB may be recovered by:

1. Filesystem snapshot
2. Full rebuild from source documents

Preferred approach

```
Re-index from canonical data
```

Periodic filesystem snapshots reduce recovery time.

---

# Knowledge Base

Knowledge Base content is considered production data.

Backup includes:

- Documents
- Metadata
- Embeddings (if retained)
- Categories
- Tags
- Relationships

---

# Audit Logs

Audit logs are business-critical.

Requirements

- Daily backup
- Tamper protection
- Legal hold support
- Long-term retention
- Immutable storage where possible

Never modify archived audit logs.

---

# Retention Policy

| Backup Type | Retention |
|-------------|-----------|
| Daily | 30 days |
| Weekly | 12 weeks |
| Monthly | 12 months |
| Annual | 7 years (or organizational policy) |
| Legal Hold | Until released |

Adjust retention to meet regulatory requirements.

---

# Encryption

All backups should be encrypted:

- At rest
- In transit

Recommended encryption:

- AES-256 for stored backups
- TLS 1.2+ for transfer

Encryption keys should be managed separately from backup storage.

---

# Backup Storage

Maintain at least three copies of production data.

Recommended strategy (3-2-1 Rule):

- 3 copies of data
- 2 different storage media
- 1 offsite copy

Example:

- Primary MongoDB
- Local encrypted backup
- Cloud object storage backup

---

# Restore Procedure

## MongoDB

Restore

```bash
mongorestore \
  --uri="$MONGO_URL" \
  /backups/actira-YYYY-MM-DD
```

Compressed archive

```bash
mongorestore \
  --gzip \
  --archive=/backups/actira-YYYY-MM-DD.archive.gz
```

Restore to a temporary database for validation before production recovery.

---

# Recovery Validation

Every restore should verify:

- Database integrity
- Collections restored
- User authentication
- RBAC
- Platform settings
- Knowledge Base
- AI functionality
- Analytics
- Audit logs
- Review Queue

---

# Monthly Recovery Test

Restore into a scratch environment.

Minimum validation:

- Login succeeds
- Dashboard loads
- Incidents visible
- Analytics available
- Knowledge Base searchable
- AI Investigator operational
- Review Queue accessible
- Audit logs readable
- Health endpoint reports healthy

Document results.

---

# Disaster Recovery

Recovery sequence:

1. Restore infrastructure
2. Restore MongoDB
3. Restore configuration
4. Restore secrets
5. Restore Knowledge Base
6. Restore LanceDB or rebuild indexes
7. Start backend
8. Start frontend
9. Validate APIs
10. Validate AI providers
11. Validate authentication
12. Run smoke tests

---

# Smoke Test Checklist

After recovery verify:

- [ ] `/api/health`
- [ ] User login
- [ ] Dashboard
- [ ] Incident search
- [ ] AI Investigator
- [ ] Knowledge Base search
- [ ] Review Queue
- [ ] Analytics
- [ ] Settings
- [ ] Audit logs
- [ ] OpenAPI
- [ ] Background jobs

---

# Backup Monitoring

Monitor:

- Backup completion
- Backup duration
- Backup size
- Failed backups
- Restore validation
- Storage utilization
- Snapshot retention

Alert on:

- Failed backup
- Failed restore validation
- Missed backup schedule
- Corrupted archive
- Storage capacity threshold

---

# Operational Best Practices

Always:

- Verify backups complete successfully.
- Test restores regularly.
- Encrypt backups.
- Store copies offsite.
- Monitor backup jobs.
- Document recovery procedures.
- Review retention policies periodically.

Never:

- Store backups with production credentials.
- Commit backups to Git.
- Store plaintext secrets.
- Assume backups are valid without restore testing.
- Skip recovery validation before major releases.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) | Full DR when restore is part of site recovery |
| [ROLLBACK.md](ROLLBACK.md) | App rollback vs database restore |
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | When backup/restore is used in an incident |
| [SECURITY_HARDENING.md](SECURITY_HARDENING.md) | Encrypted backups, secret handling |
| [../../SECURITY.md](../../SECURITY.md) | Security policy |
| [MONITORING.md](MONITORING.md) | Backup job monitoring |
| [HA_VALIDATION.md](HA_VALIDATION.md) | Shared storage expectations in multi-replica |
| [../CONFIGURATION.md](../CONFIGURATION.md) | Env / secret configuration |
| [README.md](README.md) | Operations pack index |

---

# Definition of Done

The backup strategy is considered operational when:

- [ ] Daily backups complete successfully.
- [ ] Secrets are stored outside Git.
- [ ] MongoDB backups are encrypted.
- [ ] LanceDB recovery procedure is documented and tested.
- [ ] Knowledge Base is recoverable.
- [ ] Audit logs are retained according to policy.
- [ ] Recovery tests are performed at least quarterly.
- [ ] Restore validation is documented.
- [ ] Disaster recovery procedure is current.
- [ ] Backup monitoring and alerting are configured.
- [ ] Production recovery can meet the defined RPO and RTO objectives.