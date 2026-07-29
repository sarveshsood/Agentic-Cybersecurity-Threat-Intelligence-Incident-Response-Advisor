# Production Security Hardening Checklist

Version: 2.1

This document is the **authoritative production security go-live checklist** for the **ACTIRA Enterprise SOC Platform**.

It is intended for Platform Engineers, DevOps, Security Engineers, and Operations teams.

> **Objective**
>
> Every production (or shared staging with real data) deployment must satisfy this checklist before release approval. Items should be validated during deployment reviews and re-verified as part of operational governance.
>
> Shorter summaries in [SECURITY.md](../../SECURITY.md) and [DEPLOYMENT.md](../DEPLOYMENT.md) point **here** for the full list.

### Scope (product honesty)

- **In scope:** single-tenant enterprise deploy (API + SPA + Mongo + workers).
- **Out of scope unless customer-provided:** multi-tenant isolation, MFA/step-up, WAF/edge rate limiting, full legal-hold retention.
- Residual product risks are listed in [Residual risks](#residual-risks-document-acceptance) and [THREAT_MODEL.md](../THREAT_MODEL.md).

### What changed in 2.1

- JWT policy vs runtime enforcement clarified (≥32 recommended; ≥16 enforced outside lab).
- Cookie env knobs (`COOKIE_SAMESITE`, `COOKIE_SECURE`) and registration auto-policy (`ALLOW_PUBLIC_REGISTER`) documented.
- Residual risks + verification hints added; sign-off required for production.
- K8s section aligned with shipped Helm scaffold under `deployments/helm/`.
- Supply-chain checklist maps to **real** CI (`pip-audit`, release SBOM) vs optional add-ons (`npm audit`, Dependabot, image scan).

---

# Security Principles

ACTIRA production deployments should adhere to the following principles:

- Secure by default
- Least privilege
- Defense in depth
- Zero trust for external access
- Encryption in transit and at rest
- Secret management outside source control
- Continuous monitoring
- Continuous vulnerability management
- HiTL / human override preserved for high-risk AI outputs

---

# Production Security Checklist

## Environment

- [ ] `ENV=production` (or approved non-lab value such as `staging` for shared pre-prod)
- [ ] Production configuration validated against [CONFIGURATION.md](../CONFIGURATION.md)
- [ ] Lab-only behaviors disabled (demo seed dual-gate, mock TI where inappropriate)
- [ ] Development / debug surface reviewed (OpenAPI at edge, unused admin tools)
- [ ] Production logging configuration enabled (structured logs; no debug secret dumps)

**Verify:** `ENV` is not `dev` / `test` / `local` on shared hosts; restart after env changes.

---

## Authentication & Secrets

| Policy (recommended) | Runtime enforcement (`backend/auth.py`) |
|----------------------|----------------------------------------|
| `JWT_SECRET` **≥32** cryptographically random characters | Refused outside lab if missing, in weak denylist, or **length &lt; 16** |
| Prefer rotation without re-keying vault | Use explicit `SECRETS_MASTER_KEY` (not only JWT-derived) |

- [ ] `JWT_SECRET` meets **policy ≥32** random characters (not a default like `dev-secret` / `changeme`)
- [ ] Confirm non-lab `ENV`: weak secrets cause **startup failure** (enforcement ≥16 + denylist)
- [ ] `SECRETS_MASTER_KEY` configured using an explicit Fernet key or strong passphrase
- [ ] Secrets stored in a secure secret manager (e.g., Kubernetes Secrets, Vault, or cloud secret service)
- [ ] Secrets are **not** committed to source control (including `backend/.env`)
- [ ] Secret rotation procedure documented and tested (JWT rotate → sessions invalidated; see [DEPLOYMENT.md](../DEPLOYMENT.md) upgrade notes)
- [ ] Default credentials removed
- [ ] Settings secrets redacted on API GET; encrypt-at-rest enabled where configured

**Verify:** Process refuses to start with weak JWT when `ENV=production|staging`; Settings GET returns `has_*` flags, not raw keys.

---

## Session & Cookie Security

ACTIRA issues an `actira_access_token` **httpOnly** cookie for browser sessions (see [ADR 0004](../adr/0004-cookie-auth.md)). Cross-origin SPA topology is controlled by env (see `backend/.env.example`).

| Env var | Purpose |
|---------|---------|
| `COOKIE_SAMESITE` | `auto` (default), `lax`, `strict`, or `none`. `auto` → `none` when `CORS_ORIGINS` implies cross-site SPA |
| `COOKIE_SECURE` | Force `1`/`0`; when unset, Secure is applied when SameSite=`none` (required by browsers) |
| `SESSION_TIMEOUT_HOURS` | JWT lifetime (also Admin → Settings → Security), typically 12–24 |

- [ ] `COOKIE_SAMESITE` reviewed for topology (`lax`/`strict` for same-site BFF; `none` only with HTTPS + Secure for split UI/API origins)
- [ ] `COOKIE_SECURE` correct for production HTTPS (`1` / true, or auto Secure with SameSite=none)
- [ ] Cookie is **HttpOnly** (access token not readable by JavaScript)
- [ ] `SESSION_TIMEOUT_HOURS` reviewed for operational risk
- [ ] CSRF posture reviewed: exact `CORS_ORIGINS`, no wildcard + credentials; document whether additional CSRF tokens are required for your edge
- [ ] Optional OIDC SSO configured when enterprise IdP is required (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_REDIRECT_URI`, role claims / group map)

**Verify:** Browser DevTools → cookie `actira_access_token` flags; login works only on approved origins.

---

## Demo & Development Features

Demo seed is **dual-gated**: lab-like `ENV` **and** `SEED_DEMO_USERS=true` (empty DB only).

- [ ] `ENV=production` (or staging) so seed cannot run under dual-gate
- [ ] `SEED_DEMO_USERS=false` (or unset)
- [ ] Demo accounts disabled / removed if ever created
- [ ] Sample datasets removed (unless explicitly required for a controlled lab)
- [ ] Development feature flags reviewed
- [ ] Public OpenAPI / docs exposure reviewed for production edge

**Verify:** Fresh boot does not create demo users; known demo passwords fail if still present.

---

## MongoDB Security

- [ ] Authentication enabled
- [ ] TLS enabled for client connections
- [ ] Network policies or firewall rules restrict access
- [ ] Database exposed only to trusted workloads
- [ ] Least-privilege database users configured
- [ ] Automated backups enabled
- [ ] Backup restoration tested ([BACKUP.md](BACKUP.md))

---

## Network Security

- [ ] TLS terminates at a trusted reverse proxy or ingress controller
- [ ] HTTPS enforced
- [ ] HTTP redirected to HTTPS
- [ ] HSTS enabled (where appropriate)
- [ ] Internal services isolated from public networks
- [ ] Required ports only are exposed
- [ ] Edge WAF / global rate limit considered (customer-provided; not a built-in product WAF)

---

## Cross-Origin Resource Sharing (CORS)

- [ ] `CORS_ORIGINS` explicitly configured (exact origins)
- [ ] Wildcard (`*`) origins are **not** used in production
- [ ] Only approved frontend domains are allowed
- [ ] Credentials/cookies not combined with wildcard origins

**Verify:** Unlisted origin browser call fails CORS preflight / response.

---

## API Security

- [ ] Authentication required for protected endpoints
- [ ] RBAC enforced (`analyst` / `senior_reviewer` / `admin`)
- [ ] Admin endpoints restricted
- [ ] Rate limiting enabled (login lockouts + IP limits; multi-worker safe via Mongo)
- [ ] Request validation enabled (Pydantic / schema)
- [ ] Input sanitization verified
- [ ] JWT validation errors sanitized (no library detail leakage)
- [ ] Optional role re-bind from Mongo on each request enabled where required

---

## Ingestion Security

- [ ] Ingest API key rotated periodically
- [ ] Old ingest keys revoked
- [ ] Key usage monitored
- [ ] Ingest key compared with constant-time digest
- [ ] File upload limits configured
- [ ] Unsupported file types rejected
- [ ] ZIP bomb / archive guards validated on multi-file upload

---

## User Access

Public registration is controlled by **`ALLOW_PUBLIC_REGISTER`** and auto-policy ([CONFIGURATION.md](../CONFIGURATION.md#public-registration)):

1. Explicit `ALLOW_PUBLIC_REGISTER=true|false` wins if set  
2. Else if OIDC enabled → **disabled**  
3. Else if `ENV` is `production` / `prod` / `staging` → **disabled**  
4. Else → allowed (lab)

- [ ] Confirm registration is **disabled** in production (`ALLOW_PUBLIC_REGISTER` not forced `true`; or OIDC / prod `ENV` auto-off)
- [ ] If registration must stay on: protect with SSO, VPN, or approved IdP — **and** document residual risk
- [ ] Self-registration cannot create admin (public registration creates **`analyst` only**)
- [ ] Password policy enforced (length + letter + digit minimum)
- [ ] Administrative accounts reviewed
- [ ] Least-privilege access enforced
- [ ] Dormant accounts reviewed and removed where appropriate
- [ ] MFA / step-up for admin treated as residual risk if not provided by IdP (see [Residual risks](#residual-risks-document-acceptance))

**Verify:** `GET /api/auth/oidc/config` → `public_register: false` in production; register UI/API rejected.

---

## Human-in-the-Loop (HiTL) Integrity

Security and product trust depend on review gates remaining intact.

- [ ] Template / fallback playbooks still force human review
- [ ] Severity gates preserved (no silent auto-apply of high-risk actions)
- [ ] HiTL approve / reject / edit paths audited
- [ ] No feature bypasses RBAC for review queue or admin actions

**Verify:** Critical playbook path lands in Review Queue; audit log entries present.

---

## Metrics & Observability

- [ ] `METRICS_TOKEN` configured **or** admin JWT-only scrape path documented
- [ ] `/metrics` endpoint protected (`X-Metrics-Token` or admin JWT)
- [ ] Metrics unavailable from public internet without authentication or network controls
- [ ] Health endpoints reviewed for sensitive information leakage
- [ ] Customer alert rules configured where the product only **exposes** metrics (failed logins, scrape failures) — see [MONITORING.md](MONITORING.md) / [OBSERVABILITY_PACK.md](OBSERVABILITY_PACK.md)

**Verify:** Unauthenticated public `GET /metrics` fails; scrape with token succeeds.

---

## Encryption

- [ ] TLS enabled for all external traffic
- [ ] Secrets encrypted at rest
- [ ] Backups encrypted
- [ ] Sensitive configuration encrypted
- [ ] Database connections encrypted

---

## Logging & Auditing

- [ ] Structured logging enabled
- [ ] Audit logging enabled
- [ ] Authentication events logged
- [ ] Administrative actions logged
- [ ] Secrets and tokens excluded from logs (`redact_for_log` / equivalent)
- [ ] Prompt / response logging reviewed for sensitive content
- [ ] Log retention policy defined (legal hold may be limited — residual)

---

## Dependency & Supply Chain Security

Prefer linking evidence to actual CI (e.g. `.github/workflows/`) or customer pipeline config.

**In-repo CI today** (see [CI_CD.md](../CI_CD.md) and `.github/workflows/`):

| Control | Repo status |
|---------|-------------|
| `pip-audit` | **Shipped** — `security.yml` |
| SBOM (pip freeze / release job) | **Shipped** — `release.yml` (`sbom` job) |
| Bandit SAST | **Shipped** — `security.yml` |
| `npm audit` | **Shipped** — `security.yml` job `npm-audit` (high+) |
| Dependabot | **Shipped** — `.github/dependabot.yml` (pip, npm, actions) |
| Secret scan (gitleaks) | **Shipped** — `security.yml` (continue-on-error for fork PRs) |
| Container image scan (Trivy) | **Shipped** — `security.yml` job `image-scan` (non-PR or `docker` label) |

Checklist:

- [ ] Python dependency scanning passes (`pip-audit` in CI or equivalent)
- [ ] Node dependency audit run (`npm audit` or equivalent) before release — **customer/CI add-on if not in default workflows**
- [ ] Secret scanning enabled in CI (repo partial; add gitleaks/trufflehog if policy requires)
- [ ] Container image scanning enabled **if** containers are published (customer add-on)
- [ ] SBOM generated for releases (repo release job or equivalent)
- [ ] Security artifacts retained by CI/CD

---

## Kubernetes / Container Security (If Applicable)

A **Helm chart scaffold** exists at `deployments/helm/actira/` (including `values.yaml` / `values-prod.yaml`). It is a packaging starting point — still validate security context, secrets, and probes for your cluster. Cloud notes under `deployments/azure|aws|gcp/`. Terraform is **not** shipped as a full product module.

- [ ] Chart/values reviewed (`SEED_DEMO_USERS=false`, secrets from Secret objects / External Secrets)
- [ ] Containers run as non-root
- [ ] Read-only root filesystem where practical
- [ ] Resource requests and limits configured
- [ ] Security context configured
- [ ] Image tags pinned
- [ ] Health and readiness probes enabled
- [ ] Unnecessary Linux capabilities removed

---

## AI & External Integrations

- [ ] AI provider API keys stored securely (vault / Settings, not committed env)
- [ ] Threat Intelligence API keys stored securely
- [ ] External service timeouts configured
- [ ] Retry policies validated
- [ ] Budget limits configured for AI usage
- [ ] Prompt-injection risk considered for untrusted incident content
- [ ] AI governance docs reviewed ([ai-governance/](../ai-governance/))

---

## Backup & Recovery

- [ ] Encrypted backups configured
- [ ] Backup retention policy defined
- [ ] Restore procedures validated
- [ ] Disaster recovery documentation reviewed ([DISASTER_RECOVERY.md](DISASTER_RECOVERY.md))
- [ ] Recovery tests performed
- [ ] Access to backup media restricted (encrypted secrets may still reside in Mongo dumps)

---

## Monitoring & Alerting

Platform **exposes** metrics and logs; **alert rules** are typically configured in the customer observability stack.

- [ ] Security-relevant **metrics scrape** secured (see Metrics section)
- [ ] Alert rules defined for failed logins / auth abuse (if metrics or logs support it)
- [ ] JWT / auth failure signals reviewed in logs or metrics
- [ ] Audit logs reviewed on a defined cadence
- [ ] On-call knows [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) for platform incidents

---

# Residual risks (document acceptance)

These are **known product/design residuals** (see [THREAT_MODEL.md](../THREAT_MODEL.md)). They do not block a controlled single-tenant pilot if accepted in writing.

| Residual risk | Typical mitigation | Accepted? |
|---------------|--------------------|-----------|
| No built-in MFA / admin step-up | Enforce MFA at IdP (OIDC); restrict admin network path | [ ] |
| Single-tenant (no org isolation / BOLA across tenants) | Deploy per customer; do not multi-tenant the DB | [ ] |
| No product WAF / global edge rate limit | Place WAF / API gateway in front; keep login lockouts | [ ] |
| CSRF relies on cookie SameSite + CORS (no separate CSRF token product) | Exact origins; prefer same-site BFF where possible | [ ] |
| Encrypted secrets still in Mongo / backups | Protect backup access; rotate vault keys; least-privilege DB | [ ] |
| Authorized-user LLM cost abuse | Budgets, HiTL, monitoring | [ ] |
| Legal-hold / long retention limited | Export + external retention if required | [ ] |

---

# Validation Before Go-Live

Verify:

- [ ] Authentication works correctly (local JWT and/or OIDC path)
- [ ] RBAC functions as expected for analyst / senior_reviewer / admin
- [ ] HTTPS enforced
- [ ] Cookie session attributes correct under the production domain (`COOKIE_*`)
- [ ] Public registration disabled (`public_register: false`)
- [ ] Metrics endpoint protected
- [ ] Admin endpoints secured
- [ ] Health endpoints operational
- [ ] Backup and restore validated
- [ ] Vulnerability scans completed (or residual dated)
- [ ] Smoke tests passed
- [ ] HiTL review path exercised end-to-end
- [ ] Residual risks table completed for this environment

---

# Periodic Security Reviews

The production environment should be reviewed:

- After every major release
- After significant infrastructure changes
- Following security incidents
- Quarterly (minimum)
- Before external audits or compliance assessments

For **full-system** production readiness (architecture, UX, AI, ops — not security alone), use the principal reviewer persona:

- [ENTERPRISE_REVIEWER_PERSONA.md](../dx/ENTERPRISE_REVIEWER_PERSONA.md)

---

# Operational Best Practices

Always:

- Use strong, unique secrets (policy ≥32 for JWT).
- Rotate credentials regularly (including ingest keys and JWT).
- Restrict network access.
- Patch dependencies promptly.
- Review audit logs.
- Encrypt sensitive data and backups.
- Keep security documentation current.
- Preserve HiTL and audit integrity.

Never:

- Deploy with default credentials.
- Expose metrics or admin endpoints publicly without protection.
- Commit secrets to source control.
- Use wildcard CORS in production.
- Enable demo users or development features in production.
- Force `ALLOW_PUBLIC_REGISTER=true` on shared production without compensating controls.
- Disable authentication on protected APIs.
- Bypass human review for high-risk AI outputs.

---

# Related Documentation

| Document | Purpose |
|----------|---------|
| [../../SECURITY.md](../../SECURITY.md) | Security policy, reporting, baseline summary |
| [../THREAT_MODEL.md](../THREAT_MODEL.md) | STRIDE / OWASP LLM threat model |
| [../CONFIGURATION.md](../CONFIGURATION.md) | Environment variables and auth configuration |
| [../DEPLOYMENT.md](../DEPLOYMENT.md) | Deployment models; short checklist points here |
| [PATCH_MANAGEMENT.md](PATCH_MANAGEMENT.md) | Vulnerabilities, SBOM, dependency cadence |
| [BACKUP.md](BACKUP.md) | Backup and restore |
| [DISASTER_RECOVERY.md](DISASTER_RECOVERY.md) | DR objectives and procedures |
| [MONITORING.md](MONITORING.md) | Monitoring strategy |
| [OBSERVABILITY_PACK.md](OBSERVABILITY_PACK.md) | Metrics, health, AI observability |
| [INCIDENT_RESPONSE.md](INCIDENT_RESPONSE.md) | Platform incident response |
| [../ai-governance/README.md](../ai-governance/README.md) | Responsible AI, prompts, eval |
| [../compliance/README.md](../compliance/README.md) | ISO / NIST / OWASP mappings |
| [../dx/ENTERPRISE_REVIEWER_PERSONA.md](../dx/ENTERPRISE_REVIEWER_PERSONA.md) | Full production-readiness review persona |
| [../adr/0004-cookie-auth.md](../adr/0004-cookie-auth.md) | Cookie authentication decision |
| [../../backend/.env.example](../../backend/.env.example) | Env template (COOKIE_*, JWT, seed, OIDC) |
| [../../deployments/helm/actira/](../../deployments/helm/actira/) | Helm chart scaffold |

---

# Sign-off

**Required for production** (and for staging that holds real SOC data). Optional for local lab only.

| Field | Value |
|-------|-------|
| Environment / cluster | |
| Release / version | |
| Reviewed by (Security) | |
| Reviewed by (Platform / SRE) | |
| Date | |
| Residual risks accepted (list or “see table”) | |
| Next review due | |

---

# Definition of Done

The platform is considered production-hardened when:

- [ ] All checklist items have been validated (or explicitly waived with residual risk).
- [ ] JWT and master secrets meet **policy** (and pass **runtime** enforcement).
- [ ] Network, database, API, cookie/session, registration, and metrics controls are in place.
- [ ] Demo and development features are disabled.
- [ ] HiTL and audit logging are operational.
- [ ] Dependency and secret scans pass in CI (or residual dated).
- [ ] Encrypted backups and recovery procedures are verified.
- [ ] Residual risks table completed and accepted.
- [ ] Security sign-off completed.
- [ ] The deployment complies with the organization's production security standards.