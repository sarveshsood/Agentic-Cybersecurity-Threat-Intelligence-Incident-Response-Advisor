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
| **Investigation Workspace**  | **Yes (v1.4)** — tabbed case hub (timeline, RCA, graph, notes, assistant) |
| AI timeline / RCA narrative  | Yes (workspace timeline + RCA API/UI) |
| IOC entity graph             | Yes (SVG graph + Assets/Users) |
| Case notebook                | Yes (notes CRUD API + UI) |
| NL threat hunting            | Yes (rule-based intents + `/hunt`) |
| Behavioral analytics         | Yes (beaconing, login burst, multi-host, LOLBins, DNS) |
| Compliance live score        | Yes (score/gaps/evidence + executive export; not certification) |
| Audit intelligence           | Yes (summary + integrity chain) |
| LLM multi-provider fallback  | Yes (retries + cross-provider chain + last-effective honesty) |
| Capstone report / screenshots / PPTX | Yes (`docs/capstone/`) |
| Multi-agent roster UX        | Roadmap (v1.7 Wave D) |
| Global API rate limit        | Roadmap (tech enhancement) |
| Server-side incident pagination | Yes (`include_meta` + skip/limit + total) |
| Assign / comments / in-app inbox | **Yes (v2)** — H-07 implemented behind `FEATURE_*` flags (`GET /meta/features`, default off) |
| Saved filters / favorites / pins | **Yes (v2)** — H-08 saved filters + pins behind `FEATURE_SAVED_FILTERS` / `FEATURE_PINS` |
| SIEM/XDR connectors          | Future                         |
| Multi-tenant                 | Future (v2.0)                  |
