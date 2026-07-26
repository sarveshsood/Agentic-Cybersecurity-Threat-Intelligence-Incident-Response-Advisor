# OWASP Top 10 (Web) — Alignment

| Risk                       | Status                                          |
|----------------------------|-------------------------------------------------|
| A01 Broken Access Control  | RBAC tested; single-tenant assumption           |
| A02 Cryptographic failures | bcrypt, vault; TLS at edge required             |
| A03 Injection              | Pydantic; no raw SQL; prompt-injection residual |
| A04 Insecure design        | HiTL threat modeled                             |
| A05 Misconfiguration       | Security checklist                              |
| A06 Vulnerable components  | pip-audit / CI                                  |
| A07 Auth failures          | lockout, weak JWT refused in prod               |
| A08 Integrity              | review audit                                    |
| A09 Logging failures       | structured logs + audit                         |
| A10 SSRF                   | limited user-controlled URLs (Slack validated)  |
