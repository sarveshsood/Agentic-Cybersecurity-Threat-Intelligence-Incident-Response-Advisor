# Platform Incident Response

For **ACTIRA platform** incidents (not customer SOC cases).

1. **Detect** — health checks, error rate, user reports
2. **Contain** — disable public register / ingest key; scale to zero if abuse
3. **Eradicate** — patch, rotate `JWT_SECRET`, ingest key, LLM/TI keys
4. **Recover** — restore backup if data integrity doubted
5. **Lessons** — postmortem; add regression test

Preserve `audit_log` exports before destructive DB ops.
