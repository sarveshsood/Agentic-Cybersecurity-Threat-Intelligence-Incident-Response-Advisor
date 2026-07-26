# ACTIRA — Threat Model

**Method:** STRIDE-inspired asset-centric model for a single-tenant SOC console.  
**Scope:** Default docker/local deploy with Mongo + API + SPA.  
**Out of scope:** Customer endpoint agents, cloud control plane of third-party LLM/TI vendors.

---

## 1. Assets

| Asset                                                   | Sensitivity      |
|---------------------------------------------------------|------------------|
| User credentials / JWT                                  | High             |
| LLM & TI API keys                                       | Critical         |
| Ingest API key                                          | High             |
| Security logs & IoCs (may include PII / customer infra) | High             |
| Playbooks & audit trail                                 | High (integrity) |
| Custom KB / org SOPs                                    | Medium–High      |
| Mongo data at rest                                      | High             |

---

## 2. Trust boundaries

1. Browser ↔ API (CORS + cookies/Bearer)
2. SIEM forwarder ↔ ingest endpoints (`X-Ingest-Key`)
3. API ↔ Mongo
4. API ↔ external LLM/TI/Slack
5. Admin operator ↔ host filesystem (`.env`, LanceDB, outbox)

---

## 3. STRIDE summary

| Threat              | Examples                            | Mitigations present                                                          | Residual risk                                                       |
|---------------------|-------------------------------------|------------------------------------------------------------------------------|---------------------------------------------------------------------|
| **Spoofing**        | Stolen JWT, forged ingest           | JWT secret strength gate (non-dev), bcrypt, ingest `compare_digest`, lockout | No MFA; no step-up for admin                                        |
| **Tampering**       | Alter playbook status, poison KB    | RBAC, atomic review, audit log                                               | Admin compromised = full settings                                   |
| **Repudiation**     | Deny approval                       | `audit_log`                                                                  | Retention/export for legal hold limited                             |
| **Info disclosure** | Settings GET leak keys, log secrets | `has_*` redaction, vault encrypt, gitignore `.env`                           | Encrypted secrets still in Mongo; backup exposure                   |
| **DoS**             | Huge upload, ZIP bomb, LLM cost     | ZIP limits, timeouts, token budget                                           | No global WAF/rate limit product; LLM cost abuse by authorized user |
| **Elevation**       | Self-register as admin              | Register forced `analyst`                                                    | Role change path must stay admin-only                               |

---

## 4. OWASP API / web (selected)

| Risk               | Status                                                                                   |
|--------------------|------------------------------------------------------------------------------------------|
| Broken auth        | Hardened baseline; cookie + optional Bearer                                              |
| BOLA               | Incident IDs are not strongly tenant-scoped (single tenant assumed)                      |
| Mass assignment    | Pydantic models; register ignores elevated roles                                         |
| SSRF via user URLs | TI/LLM URLs are code-defined; user-supplied webhook should be validated (Slack diagnose) |
| File upload        | ZIP bomb guards; further content-type scanning limited                                   |

---

## 5. OWASP LLM Top 10 (selected)

| #                        | Risk                                                                             | ACTIRA treatment |
|--------------------------|----------------------------------------------------------------------------------|------------------|
| LLM01 Prompt injection   | Logs/questions in user channel; no tool-exec of free text; investigator sanitize |
| LLM02 Insecure output    | JSON parse + citation allow-list; HiTL for critical                              |
| LLM06 Excessive agency   | **No** SOAR destructive tools auto-run                                           |
| LLM07 System prompt leak | Not a hard control; treat as low impact                                          |
| LLM09 Overreliance       | Product narrative emphasizes HiTL for critical                                   |
| LLM10 Model theft        | N/A (hosted APIs)                                                                |

---

## 6. MITRE ATT&CK alignment (product use of framework)

ACTIRA **maps incidents to ATT&CK** for analyst UX; it is not itself an EDR coverage product. Detection coverage claims
must not overstate heuristic mapping quality.

---

## 7. NIST CSF mapping (high level)

| Function | ACTIRA contribution                         |
|----------|---------------------------------------------|
| Identify | KB + ATT&CK catalog                         |
| Protect  | AuthN/Z, secrets vault                      |
| Detect   | Log ingest + IoC/TI (assistive)             |
| Respond  | Playbooks + HiTL review                     |
| Recover  | Playbook recovery phase guidance (advisory) |

---

## 8. Abuse cases

1. Analyst uploads malicious prompt-as-log to skew playbook → HiTL + citation filter limit blast radius.
2. Attacker with ingest key floods jobs → needs rate limits / key rotation (ops).
3. Admin credential theft → full key access; require strong JWT secret, short sessions, SSO (future).
4. Dependency compromise → Dependabot/CI security workflow; pin major deps.

---

## 9. Production must-haves (security)

See [SECURITY.md](../SECURITY.md). Absolute:

- `ENV=production`, strong `JWT_SECRET`, explicit `SECRETS_MASTER_KEY`
- `SEED_DEMO_USERS=false`
- Mongo auth + network policy
- TLS termination
- No committed secrets; rotate any key ever pasted into chat/logs  
