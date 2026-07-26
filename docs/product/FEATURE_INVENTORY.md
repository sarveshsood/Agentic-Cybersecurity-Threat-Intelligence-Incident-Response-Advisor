# Product Feature Inventory

**Vision:** [VISION.md](VISION.md) — Agentic AI SOC Command Center  
**Last updated:** 2026-07-26

| Feature                      | Status                         |
|------------------------------|--------------------------------|
| Log upload / batch / ZIP     | Yes                            |
| Suricata EVE / Zeek / Defender / Sysmon parsers | Yes (Wave B) |
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
| **Investigation Workspace**  | **In progress (v1.4)** — tabbed case hub |
| AI timeline / RCA narrative  | Yes (workspace timeline + RCA API/UI) |
| IOC entity graph             | Yes (SVG graph + Assets/Users) |
| Case notebook                | Yes (notes CRUD API + UI) |
| NL threat hunting            | Yes (rule-based intents + `/hunt`) |
| Behavioral analytics         | Yes (beaconing, login burst, multi-host, LOLBins, DNS) |
| Compliance live score        | Planned                        |
| SIEM/XDR connectors          | Future                         |
| Multi-tenant                 | Future (v2.0)                  |
