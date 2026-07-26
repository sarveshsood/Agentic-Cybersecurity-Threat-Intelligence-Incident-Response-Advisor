# Security Hardening Checklist

- [ ] `ENV=production`
- [ ] Strong `JWT_SECRET` + `SECRETS_MASTER_KEY`
- [ ] `SEED_DEMO_USERS=false`
- [ ] Mongo auth + TLS + network policy
- [ ] TLS terminate at reverse proxy
- [ ] Tight `CORS_ORIGINS`
- [ ] Rotate ingest key
- [ ] Disable public register or put behind SSO/VPN
- [ ] Metrics token set
- [ ] Backups encrypted
- [ ] Dependency / secret scans in CI

See [SECURITY.md](../../SECURITY.md).
