# Security Policy

## Supported versions

| Version                        | Supported               |
|--------------------------------|-------------------------|
| `main` / latest                | Yes                     |
| Older snapshots / zip archives | No — treat as untrusted |

## Reporting a vulnerability

**Do not** open a public GitHub issue for security vulnerabilities.

Please report privately:

1. Email the maintainers using the contact listed in your deployment runbook / organization security channel, **or**
2. If this repository is hosted on GitHub with private vulnerability reporting enabled, use **Security → Report a
   vulnerability**.

Include:

- Affected component (API route, UI page, pipeline stage)
- Reproduction steps / PoC (non-destructive preferred)
- Impact assessment (auth bypass, secret exposure, data exfil, RCE, etc.)
- Environment (`ENV`, deployment model) if known

You should receive an acknowledgment within **5 business days**. Coordinated disclosure is preferred; please allow a
reasonable window before public write-ups.

## Production hardening checklist

> **Full go-live checklist (authoritative):**  
> [`docs/operations/SECURITY_HARDENING.md`](docs/operations/SECURITY_HARDENING.md)  
> Use that document for deployment reviews, sign-off, HiTL integrity, OIDC/cookies, supply chain, and ops cross-links.  
> Full-system board reviews: [`docs/dx/ENTERPRISE_REVIEWER_PERSONA.md`](docs/dx/ENTERPRISE_REVIEWER_PERSONA.md).

Before processing real SOC data (summary only — complete the full checklist above):

| Control              | Requirement                                             |
|----------------------|---------------------------------------------------------|
| `ENV`                | Set to `production` or `staging` (not `dev`)            |
| `JWT_SECRET`         | **Policy ≥32** random chars; runtime refuses weak/default or **&lt;16** outside lab |
| `SECRETS_MASTER_KEY` | Explicit Fernet/master key for settings encrypt-at-rest |
| Demo users           | **Never** enable `SEED_DEMO_USERS` outside trusted labs |
| Mongo                | Network-restricted; auth enabled in real deploys        |
| LLM / TI keys        | Prefer vault/Settings; never commit `.env`              |
| CORS                 | Explicit `CORS_ORIGINS` (no wildcards with credentials) |
| Metrics              | `METRICS_TOKEN` for scrapers, or admin JWT only         |
| HTTPS                | Terminate TLS in front of the API/UI in production      |
| Cookies              | `SameSite`/`Secure` appropriate for your host topology  |
| HiTL                 | Review gates intact; no silent auto-apply of high risk  |

## Known security features (for reviewers)

- Public registration always creates `analyst` (no self-service admin)
- Password policy (length + letter + digit)
- Login lockouts + IP rate limits (Mongo-backed for multi-worker)
- Settings secrets redacted on GET; optional Fernet encrypt-at-rest
- Ingest API key compared with constant-time digest
- JWT errors sanitized (no library error leakage)
- Optional role re-bind from Mongo on each request
- Template/fallback playbooks force Human-in-the-Loop review
- ZIP bomb guards on multi-file upload

## Out of scope for default CI

Live LLM keys, live threat-intel keys, and production secrets must **never** be required for default unit/golden CI.
Offline mock paths are intentional.

## Safe Harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations and service disruption
- Report findings promptly and privately
- Do not exploit issues beyond what is needed to demonstrate impact
