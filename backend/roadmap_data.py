"""Canonical product roadmap seed for the in-app Roadmap UI.

One card per theme — no parallel/near-duplicate initiatives.
Statuses: planned | in_progress | completed | future
Priorities: p0 (critical) | p1 (high) | p2 (medium) | p3 (low)

RETIRED_ROADMAP_IDS are removed from Mongo on seed ensure/reseed so old
fragment cards do not reappear after consolidation.
"""
from __future__ import annotations

from typing import Any, Dict, List

# ---------------------------------------------------------------------------
# Retired IDs (pre-consolidation fragments). Deleted on ensure/reseed.
# ---------------------------------------------------------------------------
RETIRED_ROADMAP_IDS: List[str] = [
    # Week-1/2 fragments → foundation cards
    "rm-w1-embeddings",
    "rm-w1-lancedb",
    "rm-w1-cohere-rerank",
    "rm-w1-spec-tooling",
    "rm-w1-benchmark-datasets",
    "rm-w1-code-review",
    "rm-w2-golden-ci",
    "rm-w2-prompt-cache",
    "rm-w2-streaming",
    "rm-done-favicon",
    "rm-done-settings-reset",
    "rm-done-smoke",
    # Module-review wave fragments → rm-foundation-hardening
    "rm-review-wave0-prod-safety",
    "rm-review-wave1-correctness",
    "rm-review-wave2-quality",
    "rm-review-wave3-polish",
    "rm-pipeline-hung-resume",
    "rm-investigator-llm-fallback",
    "rm-rbac-golden-roadmap",
    "rm-review-residual-open",
    "rm-enh-live-llm-golden-ui",
    "rm-enh-payload-secret-redact",
    "rm-review-deferred-close",
    "rm-ops-stretch-close",
    "rm-attack-drilldown",  # folded into foundation-attack
    # Docs pack fragments → rm-v1-docs-pack
    "rm-v1-enterprise-demo-pack",
    "rm-capstone-deliverables",
    "rm-enterprise-board-2026-07-26",
    # Platform fragments → rm-v1-1-platform
    "rm-v1-1-modular-api",
    "rm-v1-1-capstone-ux-polish",
    "rm-arch-p0-p3-layers-analytics",
    # Tech fragment cards → fewer next-sprint cards
    "rm-tech-trust-ux",
    "rm-tech-api-scale-security",
    "rm-tech-backend-layering",
    "rm-tech-e2e-qa-depth",
    "rm-tech-observability-prod",
    "rm-tech-ai-catalog-honesty",
]

# Canonical seed — IDs are stable for upsert.
ROADMAP_SEED: List[Dict[str, Any]] = [
    # =========================================================================
    # Foundation (v0.x) — consolidated historical work
    # =========================================================================
    {
        "id": "rm-foundation-rag",
        "title": "Hybrid RAG stack (embeddings, LanceDB, re-rank, LoRA)",
        "summary": "BM25 + LanceDB ANN + RRF; pluggable embedders; Cohere re-rank; domain LoRA train path.",
        "description": (
            "Single foundation card for retrieval: ACTIRA_EMBEDDING_BACKEND (hash|lora|sbert|none), "
            "BAAI/bge-small-en-v1.5 recommended, hybrid RRF, optional Cohere rerank-english-v3.0, "
            "LoRA train/export (lora_train.py + admin UI), retrieval hit@k eval."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v0.4",
        "week": "Foundation",
        "category": "RAG / Retrieval",
        "modules": [
            "backend/embeddings.py",
            "backend/vector_store.py",
            "backend/knowledge_base.py",
            "backend/reranker.py",
            "backend/lora_train.py",
            "backend/retrieval_eval.py",
        ],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md", "memory/PRD.md"],
        "architecture_notes": "Local-first LanceDB; ACTIRA_VECTOR_STORE=0 disables dense path.",
        "progress": 100,
        "implementation_notes": (
            "Consolidated from: embeddings, LanceDB, Cohere re-rank cards. "
            "2026-07: hybrid RRF + LoRA + optional sbert shipped."
        ),
        "tasks": [
            {"id": "t1", "title": "Pluggable embedders + hybrid BM25/ANN RRF", "status": "done", "done": True},
            {"id": "t2", "title": "LanceDB tables + reindex API", "status": "done", "done": True},
            {"id": "t3", "title": "Cohere re-rank + offline fallback", "status": "done", "done": True},
            {"id": "t4", "title": "LoRA train path + retrieval hit@k", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-foundation-eval",
        "title": "Golden IR evaluation + CI gates",
        "summary": "35 synthetic golden cases; offline IoC F1 / technique recall gates; admin live-LLM sample.",
        "description": (
            "Curated golden dataset (tests/golden/), offline runner (template playbook), pytest + golden-ci "
            "workflow, admin UI live_llm toggle with cost confirm. Spec/OpenAPI drift CI and smoke suites "
            "are part of the same quality foundation."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v0.4",
        "week": "Foundation",
        "category": "Evaluation",
        "modules": [
            "backend/golden_eval.py",
            "backend/tests/golden/",
            "backend/tests/test_golden_benchmark.py",
            "frontend/src/pages/GoldenBenchmark.jsx",
            ".github/workflows/golden-ci.yml",
            "docs/openapi.json",
        ],
        "docs": ["backend/tests/golden/README.md", "docs/TESTING.md"],
        "architecture_notes": "CI path force_template_playbook=True; live_llm never default in CI.",
        "progress": 100,
        "implementation_notes": (
            "Consolidated from: benchmark datasets, golden-ci, live LLM UI, smoke, OpenAPI export."
        ),
        "tasks": [
            {"id": "t1", "title": "Curate golden fixtures (N≥30)", "status": "done", "done": True},
            {"id": "t2", "title": "Offline metrics harness + CI gates", "status": "done", "done": True},
            {"id": "t3", "title": "Admin Golden UI + optional live_llm", "status": "done", "done": True},
            {"id": "t4", "title": "OpenAPI export drift CI", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-foundation-llm",
        "title": "LLM playbooks — multi-provider, cache, streaming investigator",
        "summary": "Multi-provider playbooks, Anthropic prompt cache, SSE investigator, actionable fallbacks.",
        "description": (
            "Playbook generation (non-stream JSON + citations/HiTL), Anthropic cache_control on system prompt, "
            "AI Investigator SSE token stream, job-phase SSE, Bearer-auth fix and fallback_reason UI when LLM missing."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "m",
        "target_release": "v0.5",
        "week": "Foundation",
        "category": "LLM / UX",
        "modules": [
            "backend/llm_provider.py",
            "backend/playbook_agent.py",
            "backend/ai_investigator.py",
            "frontend/src/components/AIInvestigator.jsx",
        ],
        "docs": ["docs/ai-governance/MODEL_SELECTION.md"],
        "architecture_notes": "Do not stream playbook generation; investigator may stream.",
        "progress": 100,
        "implementation_notes": "Consolidated from: prompt-cache, streaming, investigator-fallback cards.",
        "tasks": [
            {"id": "t1", "title": "Multi-provider call_llm + parse_llm_json hardening", "status": "done", "done": True},
            {"id": "t2", "title": "Anthropic prompt cache", "status": "done", "done": True},
            {"id": "t3", "title": "Investigator SSE + fallback UI", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-foundation-attack",
        "title": "ATT&CK mapping — catalog, heatmap, technique drill-down",
        "summary": "Heuristic technique inference, catalog APIs, TechniquePanel, heatmap → incident filter.",
        "description": (
            "Curated ATT&CK catalog (not full STIX), CES/keyword mapping, optional LLM refine, "
            "IncidentDetail drawer, heatmap filter to /incidents?technique=, golden parent-id recall."
        ),
        "status": "completed",
        "priority": "p2",
        "owner": "",
        "effort": "l",
        "target_release": "v0.4",
        "week": "Foundation",
        "category": "Detection / ATT&CK",
        "modules": [
            "backend/attack_catalog.py",
            "backend/attack_mapping.py",
            "frontend/src/components/TechniquePanel.jsx",
            "frontend/src/components/AttackHeatmap.jsx",
        ],
        "docs": ["docs/compliance/MITRE_ATTACK.md"],
        "architecture_notes": "Heuristic mapping — not detection coverage claims.",
        "progress": 100,
        "implementation_notes": "2026-07-19: drill-down phases shipped; tests green.",
        "tasks": [
            {"id": "t1", "title": "Catalog + inference + CES rules", "status": "done", "done": True},
            {"id": "t2", "title": "UI panel + heatmap filter", "status": "done", "done": True},
            {"id": "t3", "title": "Unit tests + golden parent recall", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-foundation-hardening",
        "title": "Production hardening — auth, secrets, jobs, HiTL, retention",
        "summary": "Waves 0–3 hardening closed: demo seed gate, vault, job queue, HiTL races, retention, multi-worker.",
        "description": (
            "Single hardening card covering former module-review waves and ops stretch: "
            "demo seed gated to lab ENV; weak JWT fail; Fernet vault + external Vault/AWS SM refs; "
            "Mongo job queue + GridFS payloads + hung-job resume; secrets scrubbed from disk payloads; "
            "HiTL severity gate + atomic review 409; enrich cache; retention + LLM token budget; "
            "cookie-only SPA session; metrics auth; RBAC matrix; Playwright smoke; settings reset/profiles."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "xl",
        "target_release": "v0.6",
        "week": "Foundation",
        "category": "Quality / Security",
        "modules": [
            "backend/auth.py",
            "backend/secret_vault.py",
            "backend/external_secrets.py",
            "backend/job_queue.py",
            "backend/hitl_gate.py",
            "backend/retention.py",
            "backend/auth_throttle.py",
            "docs/MULTI_WORKER.md",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md", "docs/MULTI_WORKER.md", "SECURITY.md"],
        "architecture_notes": "Single asyncio worker by default; multi-node needs shared Mongo payloads.",
        "progress": 100,
        "implementation_notes": (
            "Consolidated from: wave0–3, residual, deferred vault/cookie, ops stretch, hung-resume, "
            "RBAC golden/roadmap, payload redact, settings reset, favicon, smoke."
        ),
        "tasks": [
            {"id": "t1", "title": "Prod safety gates (seed, JWT, .env write, email gateway)", "status": "done", "done": True},
            {"id": "t2", "title": "Secrets vault + external backends + payload scrub", "status": "done", "done": True},
            {"id": "t3", "title": "Job queue, resume, enrich cache, HiTL atomic review", "status": "done", "done": True},
            {"id": "t4", "title": "Retention, throttle, cookie session, multi-worker docs", "status": "done", "done": True},
            {"id": "t5", "title": "RBAC matrix + Playwright smoke + settings profiles", "status": "done", "done": True},
        ],
    },
    # =========================================================================
    # Capstone / platform versions (v1.x)
    # =========================================================================
    {
        "id": "rm-v1-docs-pack",
        "title": "v1.0 Docs & board pack — enterprise review, capstone, ops/gov",
        "summary": "Enterprise demo pack, 360° board report, capstone report/screenshots/PPTX, ops & AI-gov docs.",
        "description": (
            "One documentation/deliverable card: Enterprise Review + 2026-07-26 pilot board (76/100), "
            "full docs suite (ops, AI governance, compliance maps, business), presentations, diagrams, "
            "K8s/Helm, API collections, benchmarks, samples, and docs/capstone (report, PDF, 14 screenshots, PPTX)."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "l",
        "target_release": "v1.0",
        "week": "Capstone",
        "category": "Product / Docs",
        "modules": [
            "docs/",
            "docs/capstone/",
            "presentation/",
            "diagrams/",
            "deployments/",
            "ROADMAP.md",
        ],
        "docs": [
            "docs/ENTERPRISE_REVIEW.md",
            "docs/ENTERPRISE_REVIEW_BOARD_2026-07-26.md",
            "docs/capstone/README.md",
            "DOCUMENTATION_INDEX.md",
        ],
        "architecture_notes": "Documentation and packaging only; no API break.",
        "progress": 100,
        "implementation_notes": (
            "Consolidated from: enterprise demo pack, capstone deliverables, board 2026-07-26 cards."
        ),
        "tasks": [
            {"id": "t1", "title": "Enterprise board + scorecard docs", "status": "done", "done": True},
            {"id": "t2", "title": "Ops / AI-gov / compliance / business packs", "status": "done", "done": True},
            {"id": "t3", "title": "Capstone report, screenshots, PPTX", "status": "done", "done": True},
            {"id": "t4", "title": "Deployments + API collections + start-demo", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-1-platform",
        "title": "v1.1 Platform — modular API, services/repos, capstone UX",
        "summary": "Domain routers + /api/v1; services/repos; analytics facet/cache; command palette UX.",
        "description": (
            "Modularization: backend/routers/*, core/database + services, dual /api + /api/v1. "
            "Architecture layers: package imports, domain services/repos, Mongo $facet KPIs + TTL cache, "
            "LLM budget KPI, pipeline stage_timings. Capstone UX: ⌘K palette, recents, quick actions, "
            "skeletons, security response headers, Playwright expansion."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "l",
        "target_release": "v1.1",
        "week": "Capstone",
        "category": "Architecture",
        "modules": [
            "backend/server.py",
            "backend/core/",
            "backend/routers/",
            "backend/services/",
            "backend/repositories/",
            "backend/analytics.py",
            "frontend/src/components/CommandPalette.jsx",
            "frontend/src/pages/Dashboard.jsx",
        ],
        "docs": ["docs/dx/BACKEND_STRUCTURE.md", "docs/product/CAPSTONE_ENHANCEMENT_REVIEW.md"],
        "architecture_notes": "uvicorn server:app unchanged; SPA still uses /api.",
        "progress": 100,
        "implementation_notes": (
            "Consolidated from: modular-api, capstone-ux-polish, arch-p0-p3-layers-analytics."
        ),
        "tasks": [
            {"id": "t1", "title": "Domain routers + /api/v1 parity", "status": "done", "done": True},
            {"id": "t2", "title": "Services/repos + analytics performance", "status": "done", "done": True},
            {"id": "t3", "title": "Command palette + recents + quick actions", "status": "done", "done": True},
            {"id": "t4", "title": "Security headers + e2e smoke expansion", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-2-oidc-sso",
        "title": "v1.2 Enterprise identity — OIDC SSO / MFA / group RBAC",
        "summary": "Env-gated OIDC PKCE scaffold; register policy; remaining JWKS + live IdP + federated logout.",
        "description": (
            "Scaffold shipped: authorization-code + PKCE, public config + login/callback, Login SSO CTA, "
            "group/role claim map, session cookie path, public register auto-off for OIDC/prod. "
            "Still open for production: JWKS verification, shared PKCE state store, live IdP hardening, "
            "IdP-enforced MFA, federated logout."
        ),
        "status": "in_progress",
        "priority": "p0",
        "owner": "",
        "effort": "l",
        "target_release": "v1.2",
        "week": "Current",
        "category": "Security / Identity",
        "modules": [
            "backend/services/oidc_service.py",
            "backend/services/auth_service.py",
            "backend/routers/auth.py",
            "frontend/src/pages/Login.jsx",
        ],
        "docs": ["docs/CONFIGURATION.md", "SECURITY.md", "ROADMAP.md"],
        "architecture_notes": "Keep demo JWT for lab ENV; enable OIDC only with JWKS-ready config.",
        "progress": 60,
        "implementation_notes": (
            "2026-07-26: PKCE routes + register policy + role map scaffold. "
            "Do not enable OIDC in prod until JWKS path is complete."
        ),
        "tasks": [
            {"id": "t1", "title": "OIDC authorization code + PKCE scaffold", "status": "done", "done": True},
            {"id": "t2", "title": "Group/role claim map + register policy", "status": "done", "done": True},
            {"id": "t3", "title": "JWKS verify + shared state store", "status": "todo", "done": False},
            {"id": "t4", "title": "Live IdP MFA + federated logout", "status": "todo", "done": False},
        ],
    },
    {
        "id": "rm-v1-3-otel-ha",
        "title": "v1.3 Observability & HA — OTEL hooks, load tests, Helm",
        "summary": "Stage timings + OTLP soft-dep; HA runbook; load 10/100 methodology; Helm 1.1 API+worker.",
        "description": (
            "Shipped core v1.3: pipeline_trace stage timings, optional OTEL OTLP hook, multi-replica HA "
            "validation runbook, load methodology 10/100 users, Helm chart with API + job-worker, HPA, PDB. "
            "Production Grafana dashboards and deeper auto-instrument are tracked only under "
            "rm-next-platform-hardening (not duplicated here)."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v1.3",
        "week": "Done",
        "category": "Platform / SRE",
        "modules": [
            "backend/pipeline_trace.py",
            "backend/otel_setup.py",
            "deployments/helm/",
            "benchmarks/",
            "docs/operations/",
        ],
        "docs": ["docs/operations/HA_VALIDATION.md", "docs/operations/MONITORING.md"],
        "architecture_notes": "Soft-dep OTEL; multi-worker needs shared job payload backend.",
        "progress": 100,
        "implementation_notes": "2026-07-26: core HA/OTEL/load/Helm done. Stretch dashboards → next platform card.",
        "tasks": [
            {"id": "t1", "title": "Stage timings + OTEL soft-dep", "status": "done", "done": True},
            {"id": "t2", "title": "HA validation runbook", "status": "done", "done": True},
            {"id": "t3", "title": "Load methodology 10/100", "status": "done", "done": True},
            {"id": "t4", "title": "Helm API + worker packaging", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-4-investigation-workspace",
        "title": "v1.4 Investigation Workspace (Wave A)",
        "summary": "Tabbed case hub: timeline, RCA, entity graph, notebook, AI assistant.",
        "description": (
            "Investigation Command Center MVP on /incidents/:id — pure timeline/graph builders, "
            "notes CRUD, RCA with budget fallback, investigator SSE with untrusted-note framing."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "l",
        "target_release": "v1.4",
        "week": "Done",
        "category": "Product / Investigation",
        "modules": [
            "backend/investigation_views.py",
            "backend/services/workspace_service.py",
            "backend/routers/workspace.py",
            "backend/rca.py",
            "frontend/src/pages/IncidentDetail.jsx",
            "frontend/src/components/workspace/",
        ],
        "docs": [
            "docs/product/INVESTIGATION_WORKSPACE_DESIGN.md",
            "docs/product/VISION.md",
        ],
        "architecture_notes": "No pipeline rewrite; dual /api + /api/v1.",
        "progress": 100,
        "implementation_notes": "2026-07-26: PR #8 workspace MVP merged.",
        "tasks": [
            {"id": "t1", "title": "Design + pure builders + notes/timeline/graph APIs", "status": "done", "done": True},
            {"id": "t2", "title": "RCA + tabbed UI shell", "status": "done", "done": True},
            {"id": "t3", "title": "Graph/notebook/assistant + prompt safety", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-5-hunt-behavior-parsers",
        "title": "v1.5 NL hunting, behavior, parsers (Wave B)",
        "summary": "Rule-based NL hunt, behavioral signals, Suricata/Zeek/Defender/Sysmon parsers.",
        "description": (
            "Deterministic NL hunt over incidents (no LLM required), behavioral analytics "
            "(beaconing, login burst, multi-host, LOLBins, DNS), broader CES parsers, Hunt page + BehaviorPanel."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "l",
        "target_release": "v1.5",
        "week": "Done",
        "category": "Product / Detection",
        "modules": [
            "backend/hunting.py",
            "backend/behavior.py",
            "backend/parsers.py",
            "frontend/src/pages/Hunt.jsx",
            "frontend/src/components/workspace/BehaviorPanel.jsx",
        ],
        "docs": ["docs/product/FEATURE_INVENTORY.md", "docs/product/VISION.md"],
        "architecture_notes": "Not lake-scale SIEM hunting — rule-based over stored incidents.",
        "progress": 100,
        "implementation_notes": "2026-07-26: Wave B complete.",
        "tasks": [
            {"id": "t1", "title": "NL hunt intents + Hunt page", "status": "done", "done": True},
            {"id": "t2", "title": "Behavioral signals + BehaviorPanel", "status": "done", "done": True},
            {"id": "t3", "title": "Suricata/Zeek/Defender/Sysmon parsers", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-6-compliance-audit-llm",
        "title": "v1.6 Compliance, audit intelligence, LLM catalog (Wave C)",
        "summary": "Compliance score/gaps/evidence, audit chain + summary, executive export, free/paid LLM + fallback.",
        "description": (
            "Product-alignment compliance scoring (not certification), GRC evidence pack, executive export, "
            "audit SHA-256 integrity chain + rule-based intelligence, free+paid model catalog, "
            "cross-provider fallback with retriable error classification, last-effective LLM honesty, "
            "OpenAPI contract refresh, and UI/API disclaimers that score ≠ ISO/SOC2 certification."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "l",
        "target_release": "v1.6",
        "week": "Current",
        "category": "Product / Compliance",
        "modules": [
            "backend/compliance_catalog.py",
            "backend/services/compliance_service.py",
            "backend/services/audit_service.py",
            "backend/llm_provider.py",
            "frontend/src/pages/Compliance.jsx",
            "frontend/src/pages/AuditLogs.jsx",
            "frontend/src/pages/Settings.jsx",
        ],
        "docs": ["docs/product/FEATURE_INVENTORY.md", "docs/product/VISION.md", "docs/openapi.json"],
        "architecture_notes": "Best-effort audit chain (not WORM). Never market as formal certification.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-27: Wave C closed — W6-01..W6-05 done (score/gaps/export, audit intelligence, "
            "LLM catalog+cross-provider resilience, DoD/OpenAPI/cert messaging)."
        ),
        "tasks": [
            {"id": "t1", "title": "Compliance score + gaps + evidence + export", "status": "done", "done": True},
            {"id": "t2", "title": "Audit intelligence + integrity UI", "status": "done", "done": True},
            {"id": "t3", "title": "Free/paid LLM catalog + cross-provider fallback", "status": "done", "done": True},
            {"id": "t4", "title": "Merge DoD + OpenAPI + cert messaging", "status": "done", "done": True},
        ],
    },
    # =========================================================================
    # Next (deduped — one card per track)
    # =========================================================================
    {
        "id": "rm-next-trust-qa",
        "title": "Next — trust UX + QA depth",
        "summary": "DEMO banners, hard error states, a11y shell; fix E2E testids; cover workspace/hunt/compliance.",
        "description": (
            "Single next-sprint polish card (board P0/P1 UX+QA): unmistakable DEMO banners on synthetic data; "
            "no infinite loading on incident/analytics failure; login design tokens; mobile off-canvas nav; "
            "command palette Audit/Compliance; repair smoke testids; Playwright for workspace, hunt, compliance, audit."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "m",
        "target_release": "v1.6",
        "week": "Next",
        "category": "Frontend / QA",
        "modules": [
            "frontend/src/pages/Dashboard.jsx",
            "frontend/src/pages/IncidentDetail.jsx",
            "frontend/src/pages/Login.jsx",
            "frontend/src/components/Layout.jsx",
            "frontend/src/components/CommandPalette.jsx",
            "frontend/e2e/",
        ],
        "docs": ["docs/ENTERPRISE_REVIEW_BOARD_2026-07-26.md", "docs/E2E_TESTING.md"],
        "architecture_notes": "Prefer design-system empty/error primitives; stable data-testid contracts.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-26: DEMO opt-in + banner; hard errors on dashboard/incident/analytics/hunt; "
            "login theme tokens + theme toggle; mobile off-canvas nav; palette Audit/Compliance; "
            "workflow E2E for hunt/compliance/audit/workspace/agent roster."
        ),
        "tasks": [
            {"id": "t1", "title": "DEMO banners + hard error states (no hang)", "status": "done", "done": True},
            {"id": "t2", "title": "Login tokens + mobile nav + palette coverage", "status": "done", "done": True},
            {"id": "t3", "title": "Repair smoke testids", "status": "done", "done": True},
            {"id": "t4", "title": "Playwright workspace / hunt / compliance / audit", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-next-platform-hardening",
        "title": "Next — platform scale, security, observability, layering",
        "summary": "Incident pagination, global rate limit, CSP/HSTS, Grafana/OTEL depth, repos, AI catalog honesty.",
        "description": (
            "Single platform follow-on card (avoids split tech cards): server-side incident pagination; "
            "global API rate limit + metrics; CSP/HSTS (app or edge docs); production Grafana dashboards + "
            "deeper OTEL spans; complete repos (jobs/KB/roadmap); Settings page split; remove bkp facades; "
            "tag experimental LLM model IDs and surface effective provider after fallback."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v1.7",
        "week": "Next",
        "category": "Platform / Security",
        "modules": [
            "backend/routers/incidents.py",
            "backend/server.py",
            "backend/repositories/",
            "backend/llm_provider.py",
            "monitoring/",
            "frontend/src/pages/Settings.jsx",
            "frontend/src/pages/Incidents.jsx",
        ],
        "docs": [
            "docs/operations/SECURITY_HARDENING.md",
            "docs/operations/MONITORING.md",
            "docs/dx/BACKEND_STRUCTURE.md",
        ],
        "architecture_notes": "Does not re-open v1.3 HA/Helm (done). Stretch only.",
        "progress": 95,
        "implementation_notes": (
            "2026-07-26: include_meta pagination + FE server page; GLOBAL_RATE_LIMIT_ENABLED; "
            "CSP + ENABLE_HSTS; Grafana actira_* panels; otel_setup.span + pipeline_trace bridge; "
            "repos jobs/kb/roadmap; experimental catalog tags + last effective LLM; "
            "bkp README (facades retired). Settings mega-page further split remains stretch."
        ),
        "tasks": [
            {"id": "t1", "title": "Server-side incidents pagination + global rate limit", "status": "done", "done": True},
            {"id": "t2", "title": "CSP/HSTS + Grafana dashboards + deeper OTEL", "status": "done", "done": True},
            {"id": "t3", "title": "Repos/Settings split + bkp cleanup", "status": "done", "done": True},
            {"id": "t4", "title": "AI catalog experimental tags + effective provider UI", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-7-agent-roster-exec",
        "title": "v1.7 Wave D — agent roster UX + executive risk dashboard",
        "summary": "Named agents over pipeline stages; executive risk/maturity/cost snapshot (no demo-masking).",
        "description": (
            "Productize pipeline stages as named collaborating agents (Triage, Investigation, TI, "
            "Compliance, Playbook, Reviewer) with roster UX — without unconstrained multi-agent swarms. "
            "Executive dashboard: open criticals, compliance score, MTTD/MTTR proxies, AI cost story. "
            "Market as pipeline copilot until true multi-agent orchestration exists."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v1.7",
        "week": "Next",
        "category": "Product / UX",
        "modules": [
            "frontend/src/pages/Dashboard.jsx",
            "frontend/src/components/AgentRoster.jsx",
            "frontend/src/components/ExecutiveStrip.jsx",
            "backend/pipeline.py",
        ],
        "docs": ["docs/product/VISION.md"],
        "architecture_notes": "Prefer wrapping existing stages over LangGraph rewrite (non-goal v1.x).",
        "progress": 100,
        "implementation_notes": (
            "2026-07-26: AgentRoster + ExecutiveStrip on Dashboard; honesty badge "
            "(pipeline copilot, not swarm); demo/error flags never mask fail as healthy."
        ),
        "tasks": [
            {"id": "t1", "title": "Agent roster model + stage→agent UI", "status": "done", "done": True},
            {"id": "t2", "title": "Executive risk/maturity/cost KPIs", "status": "done", "done": True},
            {"id": "t3", "title": "Honest agentic claims in docs/UI", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v2-h07-h08-collab",
        "title": "v2 H-07/H-08 — Collaboration & saved filters",
        "summary": "Assign, comments, in-app inbox; saved filters, favorites, prefs. Feature flags PR-1 done.",
        "description": (
            "Implementation track for H-07 (assign / comments / notification center) and H-08 "
            "(saved filters / favorites-pins / light prefs). Design: "
            "docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md. "
            "PR-1 shipped: GET /api/meta/features + FEATURE_* env (default off) + SPA loadFeatures. "
            "Next: PR-2 users search, then assignment, comments, inbox, filters, pins."
        ),
        "status": "in_progress",
        "priority": "p2",
        "owner": "",
        "effort": "xl",
        "target_release": "v2.0",
        "week": "Current",
        "category": "Product / Collaboration",
        "modules": [
            "backend/feature_flags.py",
            "backend/routers/meta.py",
            "frontend/src/lib/features.js",
            "frontend/src/components/Layout.jsx",
            "docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md",
        ],
        "docs": [
            "docs/product/COLLABORATION_AND_SAVED_FILTERS_DESIGN.md",
            "docs/CONFIGURATION.md",
            "ROADMAP.md",
        ],
        "architecture_notes": (
            "Comments beside workspace notes (not NoteKind). Inbox collection app_notifications "
            "≠ outbound notifications.py. Flags off → API 404 via require_feature. "
            "N-05 multi-incident fan-out out of scope."
        ),
        "progress": 12,
        "implementation_notes": (
            "2026-07-27: Design rev 2 approved. PR-1 feature flags (PR #13): feature_flags.py, "
            "GET /meta/features, require_feature, SPA features.js, tests, OpenAPI."
        ),
        "tasks": [
            {
                "id": "h07-d",
                "title": "H-07/H-08 design doc (KD + PR plan)",
                "status": "done",
                "done": True,
            },
            {
                "id": "pr1-flags",
                "title": "PR-1: Feature flags snapshot + SPA load + tests",
                "status": "done",
                "done": True,
            },
            {
                "id": "pr1-docs",
                "title": "PR-1: CONFIGURATION + .env.example FEATURE_* docs",
                "status": "done",
                "done": True,
            },
            {
                "id": "pr2-users",
                "title": "PR-2: Users public search API + UserPicker",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr3-assign-api",
                "title": "PR-3: Assignment backend (fields, filters $and, audit, flag)",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr3-filter-tests",
                "title": "PR-3a: Filter matrix tests (me / unassigned / technique)",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr4-assign-ui",
                "title": "PR-4: Assignment UI (AssignPanel, list column, tips)",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr5-comments",
                "title": "PR-5: Comments backend + CommentsPanel (beside notes)",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr6-inbox",
                "title": "PR-6: app_notifications inbox + emitters + Layout bell",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr6-retention",
                "title": "PR-6c: Retention cascade for comments/inbox/pins",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr7-saved-filters",
                "title": "PR-7: Saved filters backend + SavedFiltersBar",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr8-pins",
                "title": "PR-8: Favorites/pins (user_pins + UI)",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr9-prefs",
                "title": "PR-9: user_prefs server sync",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr10-docs",
                "title": "PR-10: OpenAPI + inventory honesty close-out",
                "status": "todo",
                "done": False,
            },
            {
                "id": "pr11-sse",
                "title": "PR-11 stretch: SSE inbox + email digests",
                "status": "todo",
                "done": False,
            },
        ],
    },
    {
        "id": "rm-v2-multi-tenant",
        "title": "v2.0 Multi-tenant + connectors + commercial pilot",
        "summary": "org_id isolation, per-tenant secrets, SIEM connectors, pen-test pack, optional SOAR.",
        "description": (
            "Future Wave E: multi-customer isolation, tenant settings, scale/pen-test evidence, "
            "SIEM/XDR connectors, optional SOAR with separate human approval. "
            "Collab (H-07/H-08) tracked on rm-v2-h07-h08-collab — not duplicated here. "
            "Optional multi-incident fan-out remains N-05 non-goal unless product revisits."
        ),
        "status": "future",
        "priority": "p2",
        "owner": "",
        "effort": "xl",
        "target_release": "v2.0",
        "week": "Future",
        "category": "Product",
        "modules": ["backend/", "frontend/"],
        "docs": ["docs/product/VISION.md", "ROADMAP.md"],
        "architecture_notes": "Do not claim multi-tenant until org_id is end-to-end.",
        "progress": 0,
        "implementation_notes": "Collab split out to rm-v2-h07-h08-collab (2026-07-27).",
        "tasks": [
            {"id": "t1", "title": "org_id isolation on all docs", "status": "todo", "done": False},
            {"id": "t2", "title": "Per-tenant secrets + settings", "status": "todo", "done": False},
            {"id": "t3", "title": "SIEM/XDR connectors", "status": "todo", "done": False},
            {"id": "t4", "title": "Pen-test pack + optional SOAR approve-gate", "status": "todo", "done": False},
        ],
    },
    {
        "id": "rm-optional-release-packaging",
        "title": "Optional — git tags, demo video, hosted demo",
        "summary": "Portfolio packaging only; not required for functional completeness.",
        "description": (
            "Tag releases, record 5–8 min demo from DEMO_SCRIPT, optional hosted demo, "
            "secret history scan before public OSS. Capstone report/screenshots already under rm-v1-docs-pack."
        ),
        "status": "planned",
        "priority": "p3",
        "owner": "",
        "effort": "s",
        "target_release": "v1.6",
        "week": "Optional",
        "category": "Product / Docs",
        "modules": ["RELEASE_NOTES.md", "docs/DEMO_SCRIPT.md"],
        "docs": ["docs/DEMO_SCRIPT.md"],
        "architecture_notes": "Process only — no code dependency.",
        "progress": 0,
        "implementation_notes": "",
        "tasks": [
            {"id": "t1", "title": "Tag releases after merges", "status": "todo", "done": False},
            {"id": "t2", "title": "Record demo video", "status": "todo", "done": False},
            {"id": "t3", "title": "Optional hosted demo", "status": "todo", "done": False},
        ],
    },
]


def default_tasks_for_item(item: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Generate starter implementation tasks if an item has none."""
    existing = item.get("tasks") or []
    if existing:
        return existing
    title = item.get("title") or "item"
    return [
        {"id": "t1", "title": f"Design approach for: {title}", "status": "todo", "done": False},
        {
            "id": "t2",
            "title": f"Implement core path in modules: {', '.join((item.get('modules') or [])[:2]) or 'TBD'}",
            "status": "todo",
            "done": False,
        },
        {"id": "t3", "title": "Add/adjust tests + docs", "status": "todo", "done": False},
        {"id": "t4", "title": "Update roadmap progress + implementation notes", "status": "todo", "done": False},
    ]
