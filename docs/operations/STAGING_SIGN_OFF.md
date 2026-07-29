# Staging / Production Security Sign-off

**Template for go-live.** Complete against a real environment.  
Authoritative checklist: [SECURITY_HARDENING.md](SECURITY_HARDENING.md).

| Field | Value |
|-------|--------|
| Environment | staging / production (circle one) |
| Cluster / host | |
| Release / git SHA | |
| Date | |
| Security reviewer | |
| Platform / SRE reviewer | |

## Gate checks (minimum)

- [ ] `ENV=production` or `staging` (non-lab)
- [ ] `JWT_SECRET` policy ≥32; runtime gate verified
- [ ] `SEED_DEMO_USERS=false`
- [ ] `CORS_ORIGINS` exact; cookies Secure/SameSite reviewed
- [ ] `METRICS_TOKEN` or admin-only metrics
- [ ] Public registration off (`ALLOW_PUBLIC_REGISTER` / auto policy)
- [ ] HiTL path exercised end-to-end
- [ ] Backup restore tested (date: ______)
- [ ] Residual risks table accepted (MFA IdP / single-tenant / edge WAF)

## Optional residual features (this release)

- [ ] `FEATURE_MFA=1` + `pyotp` if password MFA required (else IdP MFA)
- [ ] `ACTIRA_EMBEDDING_PROFILE=quality` only if sbert deps installed + reindex done
- [ ] Multi-replica: workers + shared Mongo; ops_bus invalidates confirmed

## Sign-off

| Role | Name | Signature / date |
|------|------|------------------|
| Security | | |
| Platform | | |

**Verdict:** Production Ready / Ready with Conditions / Not Ready  
**Conditions / notes:**
