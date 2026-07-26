# Product Feature Inventory

**Vision:** [VISION.md](VISION.md) — Agentic AI SOC Command Center  
**Last updated:** 2026-07-26

| Feature                      | Status                         |
|------------------------------|--------------------------------|
| Log upload / batch / ZIP     | Yes                            |
| Realtime ingest API          | Yes                            |
| IoC extract + TI enrich      | Yes (mock default)             |
| Correlation panel            | Yes                            |
| ATT&CK mapping + heatmap     | Yes (+ full catalog matrix)    |
| EVTX parse scaffold          | Partial (optional python-evtx) |
| Hybrid RAG + custom KB       | Yes                            |
| LLM playbooks multi-provider | Yes                            |
| AI investigator (SSE)        | Yes                            |
| HiTL review queue            | Yes                            |
| Settings + secret has_*      | Yes                            |
| OIDC SSO scaffold            | Partial (env-gated PKCE)       |
| Public register policy       | Yes (off for OIDC/prod)        |
| OTEL OTLP soft-dep           | Partial                        |
| Admin analytics / KPIs       | Yes                            |
| Ops / health UI              | Yes                            |
| Golden benchmark UI          | Yes                            |
| Roadmap UI                   | Yes                            |
| Audit log API                | Yes                            |
| Feature flags service        | Partial (env/settings toggles) |
| Rate limit dashboard         | Roadmap                        |
| User profile page            | Minimal via /auth/me           |
| Formal API key mgmt UI       | Ingest key + settings keys     |
| Metrics dashboard            | KPIs + /metrics                |
| **Investigation Workspace**  | **Planned (v1.4)**             |
| AI timeline / RCA narrative  | Partial (chain + investigator) |
| IOC entity graph             | Planned                        |
| Case notebook                | Planned                        |
| NL threat hunting            | Planned                        |
| Compliance live score        | Planned                        |
| SIEM/XDR connectors          | Future                         |
| Multi-tenant                 | Future (v2.0)                  |
