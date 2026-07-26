"""Seed roadmap items from memory/WEEKLY_DISCUSSIONS.md (ACTIRA product plan).

Statuses: planned | in_progress | completed | future
Priorities: p0 (critical) | p1 (high) | p2 (medium) | p3 (low)
"""
from __future__ import annotations

from typing import Any, Dict, List

# Canonical seed — also mirrored for UI help text. IDs are stable for upsert.
ROADMAP_SEED: List[Dict[str, Any]] = [
    {
        "id": "rm-w1-embeddings",
        "title": "Security-domain embedding model (Hugging Face)",
        "summary": "Base model + hybrid + LoRA fine-tune/export pipeline (linear_lora offline + optional PEFT).",
        "description": (
            "Done: ACTIRA_EMBEDDING_BACKEND=hash|lora|sbert|none; recommended sbert model "
            "BAAI/bge-small-en-v1.5; golden retrieval pairs + hit@k eval; hybrid RRF; "
            "domain LoRA train from golden Q→doc + approved playbooks (lora_train.py, "
            "POST /kb/lora/train, ACTIRA_LORA_PATH)."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v0.4",
        "week": "Week 1",
        "category": "RAG / Retrieval",
        "modules": [
            "backend/embeddings.py",
            "backend/lora_train.py",
            "backend/knowledge_base.py",
            "backend/vector_store.py",
            "backend/retrieval_eval.py",
            "backend/tests/golden/retrieval_pairs.json",
            "backend/tests/test_lora_train.py",
            "backend/playbook_agent.py",
            "frontend/src/pages/Knowledge.jsx",
        ],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md#week-1", "memory/PRD.md"],
        "architecture_notes": (
            "Hybrid BM25 + ANN; BM25 remains offline fallback. "
            "linear_lora = frozen hash + low-rank residual (numpy CI-safe); "
            "optional peft method needs torch/sentence-transformers."
        ),
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: Model pick + Q→doc pairs + retrieval_eval hit@k; sbert optional. "
            "2026-07-20: Closed deferred t3 — lora_train corpus/train/export, embeddings "
            "backend=lora, admin API + Knowledge UI train, offline tests."
        ),
        "tasks": [
            {"id": "t1", "title": "Select base embedding model + eval set", "status": "done", "done": True},
            {"id": "t2", "title": "Build golden Q→doc pairs from KB IR queries", "status": "done", "done": True},
            {"id": "t3", "title": "Fine-tune / LoRA pipeline + export", "status": "done", "done": True},
            {"id": "t4", "title": "Wire hybrid BM25+dense RRF in kb.search()", "status": "done", "done": True},
            {"id": "t5", "title": "Pluggable hash/sbert/none embedders", "status": "done", "done": True},
            {"id": "t6", "title": "Offline retrieval hit@k harness", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-w1-lancedb",
        "title": "LanceDB vector store for KB + incident embeddings",
        "summary": "Local LanceDB under backend/data/lancedb/ with hybrid ANN+BM25 RRF.",
        "description": (
            "lancedb tables kb_chunks + incidents; schema id/source/title/text/vector/metadata/embedder. "
            "kb.search() hybrid RRF; pipeline upserts incident narratives; GET /kb/vector-status + POST /kb/reindex."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "m",
        "target_release": "v0.3",
        "week": "Week 1",
        "category": "RAG / Retrieval",
        "modules": [
            "backend/vector_store.py",
            "backend/embeddings.py",
            "backend/knowledge_base.py",
            "backend/pipeline.py",
            "backend/server.py",
            "backend/tests/test_vector_rag.py",
            "backend/data/lancedb/",
        ],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md#week-1", "memory/PRD.md"],
        "architecture_notes": "Local-first; ACTIRA_VECTOR_STORE=0 disables dense path.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: LanceDB + hash embedder + RRF hybrid; incident index on create; "
            "offline tests test_vector_rag.py."
        ),
        "tasks": [
            {"id": "t1", "title": "Add lancedb dependency + data dir", "status": "done", "done": True},
            {"id": "t2", "title": "Define table schema + ingest KB chunks", "status": "done", "done": True},
            {"id": "t3", "title": "Implement ANN search + RRF fusion", "status": "done", "done": True},
            {"id": "t4", "title": "Pipeline incident upsert + reindex API", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-w1-cohere-rerank",
        "title": "Cohere re-ranking after hybrid retrieve",
        "summary": "Cohere rerank-english-v3.0 after hybrid pool; skip when no key.",
        "description": (
            "kb.search() re-ranks candidate pool via Cohere when cohere_api_key / COHERE_API_KEY "
            "and cohere_rerank_enabled. Offline: ACTIRA_RERANK_BACKEND=lexical for tests; no-key = identity."
        ),
        "status": "completed",
        "priority": "p2",
        "owner": "",
        "effort": "s",
        "target_release": "v0.3",
        "week": "Week 1",
        "category": "RAG / Retrieval",
        "modules": [
            "backend/reranker.py",
            "backend/knowledge_base.py",
            "backend/models.py",
            "backend/secrets_util.py",
            "backend/server.py",
            "frontend/src/pages/Settings.jsx",
            "backend/tests/test_rerank_and_retrieval.py",
        ],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md#week-1", "memory/PRD.md"],
        "architecture_notes": "Optional live path; mock/skip when no key.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: reranker.maybe_rerank; Settings has_cohere + toggle; offline tests with mock HTTP."
        ),
        "tasks": [
            {"id": "t1", "title": "Add COHERE_API_KEY to Settings + secrets_util", "status": "done", "done": True},
            {"id": "t2", "title": "Implement rerank step + feature flag", "status": "done", "done": True},
            {"id": "t3", "title": "Offline fallback when key missing", "status": "done", "done": True},
            {"id": "t4", "title": "Frontend TI key + Detection toggle", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-w1-spec-tooling",
        "title": "Spec tooling (spec-kit / OpenAPI contracts)",
        "summary": "Committed OpenAPI snapshot + CI drift check; spec-kit workflow documented.",
        "description": (
            "FastAPI is source of truth. docs/openapi.json is regenerated via "
            "backend/scripts/export_openapi.py; CI fails on drift. docs/SPEC_WORKFLOW.md "
            "covers review checklist and optional github/spec-kit / openspec usage for "
            "ingest, HiTL, and RAG feature PRs."
        ),
        "status": "completed",
        "priority": "p3",
        "owner": "",
        "effort": "s",
        "target_release": "v0.4",
        "week": "Week 1",
        "category": "Process / Tooling",
        "modules": [
            "backend/scripts/export_openapi.py",
            "docs/openapi.json",
            "docs/SPEC_WORKFLOW.md",
            ".github/workflows/openapi-ci.yml",
            "backend/server.py",
        ],
        "docs": [
            "docs/SPEC_WORKFLOW.md",
            "https://github.com/github/spec-kit",
            "https://openspec.dev/",
        ],
        "architecture_notes": "Contract-first for /logs/ingest and /settings evolution.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: export_openapi.py (--check), docs/openapi.json (45 paths), "
            "openapi-ci.yml, SPEC_WORKFLOW.md. Optional Spec Kit layout documented only."
        ),
        "tasks": [
            {"id": "t1", "title": "Export OpenAPI snapshot in CI", "status": "done", "done": True},
            {"id": "t2", "title": "Document spec-kit workflow for pipeline PRs", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-w1-benchmark-datasets",
        "title": "Curate benchmark / golden IR datasets",
        "summary": "v2 curated set: 35 synthetic cases, explicit IoC/technique gold, 17 families.",
        "description": (
            "Analyst-curated IR fixtures under backend/tests/golden/: log → expected IoCs, "
            "ATT&CK technique IDs, playbook phases. Labels are explicit in build_dataset.py "
            "(not auto-copied from extractor); each build validates gold vs live extract/infer. "
            "Synthetic only — themes from CISA KEV / ATT&CK; no licensed third-party PCAP."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "m",
        "target_release": "v0.3",
        "week": "Week 1",
        "category": "Evaluation",
        "modules": [
            "backend/tests/golden/dataset.json",
            "backend/tests/golden/build_dataset.py",
            "backend/ioc_extractor.py",
            "backend/golden_eval.py",
        ],
        "docs": [
            "backend/tests/golden/README.md",
            "memory/WEEKLY_DISCUSSIONS.md#week-1",
            "memory/PRD.md",
        ],
        "architecture_notes": (
            "dataset.json version 2 + family metadata. Domain FP filter excludes file basenames "
            "but keeps real FQDNs ending in .com. Feeds offline CI (rm-w2-golden-ci)."
        ),
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: 35 cases / 17 families; curated labels; build --check; domain extractor "
            "fix (no 'com' as file suffix). IoC F1=1.0 technique recall=1.0 offline."
        ),
        "tasks": [
            {"id": "t1", "title": "Define golden incident JSON schema (v2 + family/notes)", "status": "done",
             "done": True},
            {"id": "t2", "title": "Curate N≥30 fixtures with explicit gold (rebalanced families)", "status": "done",
             "done": True},
            {"id": "t3", "title": "Document dataset license / synthetic-source notes", "status": "done", "done": True},
            {"id": "t4", "title": "Build validates gold vs extractor; fix domain FPs", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-w1-code-review",
        "title": "Hardening code review focus areas",
        "summary": "Secrets, HiTL races, LLM JSON parse, RBAC, ingest auth — completed 2026-07-19.",
        "description": (
            "Completed hardening for: secrets never leak in GET /settings; HiTL + auto-approve "
            "policy (hitl_severity_min) + atomic review; parse_llm_json robustness; register "
            "forces analyst; INGEST_API_KEY constant-time compare + JWT fallback. "
            "See memory/WEEKLY_DISCUSSIONS.md §6."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "m",
        "target_release": "v2-hardening",
        "week": "Week 1",
        "category": "Quality / Security",
        "modules": [
            "backend/secrets_util.py",
            "backend/hitl_gate.py",
            "backend/pipeline.py",
            "backend/llm_provider.py",
            "backend/auth.py",
            "backend/server.py",
            "backend/tests/test_hardening.py",
            "backend/tests/test_smoke_all_areas.py",
        ],
        "docs": [
            "memory/WEEKLY_DISCUSSIONS.md",
            "memory/PRD.md",
            "README.md",
        ],
        "architecture_notes": (
            "decide_incident_status is pure policy; review uses find_one_and_update on "
            "status=pending_review (409 on race). GET /settings is an allow-list of non-secrets."
        ),
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: All five focus areas done. Offline suite tests/test_hardening.py (18 passed). "
            "Deferred: JWT role re-bind from DB, password min length, INGEST_REQUIRE_KEY-only mode."
        ),
        "tasks": [
            {"id": "t1", "title": "Audit GET /settings for secret leaks + allow-list strip", "status": "done",
             "done": True},
            {"id": "t2", "title": "HiTL gate (hitl_severity_min) + atomic review (409 race)", "status": "done",
             "done": True},
            {"id": "t3", "title": "Harden parse_llm_json (fences/prose/trailing commas/arrays)", "status": "done",
             "done": True},
            {"id": "t4", "title": "Force register role=analyst; JWT_SECRET weak warning", "status": "done",
             "done": True},
            {"id": "t5", "title": "Ingest key secrets.compare_digest + JWT fallback", "status": "done", "done": True},
            {"id": "t6", "title": "Unit tests test_hardening.py + docs update", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-w2-golden-ci",
        "title": "Benchmark pipeline against golden dataset (CI)",
        "summary": "35+ golden cases; IoC F1, technique recall, grounding, phases, latency — offline CI.",
        "description": (
            "Freeze N≥30 synthetic IR log fixtures with expected IoCs + ATT&CK technique IDs. "
            "Offline runner (no Mongo/LLM) uses mock enrich + template playbook. Metrics: IoC F1, "
            "technique recall, grounding_score, phase coverage, latency. Pytest gates + GitHub Actions."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v0.4",
        "week": "Week 2",
        "category": "Evaluation",
        "modules": [
            "backend/golden_eval.py",
            "backend/tests/golden/",
            "backend/tests/test_golden_benchmark.py",
            ".github/workflows/golden-ci.yml",
        ],
        "docs": [
            "backend/tests/golden/README.md",
            "memory/WEEKLY_DISCUSSIONS.md",
            "README.md",
        ],
        "architecture_notes": (
            "CI path force_template_playbook=True for determinism. Regenerate dataset.json via "
            "tests/golden/build_dataset.py after intentional extractor/keyword changes."
        ),
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: golden_eval + pytest thresholds; workflow golden-ci.yml. "
            "Dataset expanded via rm-w1-benchmark-datasets (35 curated cases). "
            "Default gates: F1≥0.85, tech recall≥0.80, grounding≥0.50, full phases, latency≤5s."
        ),
        "tasks": [
            {"id": "t1", "title": "Define metric harness (IoC F1, tech recall, grounding, phases, latency)",
             "status": "done", "done": True},
            {"id": "t2", "title": "Offline pipeline runner + golden fixtures (N≥30)", "status": "done", "done": True},
            {"id": "t3", "title": "Wire pytest gates + GitHub Actions golden-ci", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-w2-prompt-cache",
        "title": "Anthropic prompt caching for multi-step playbooks",
        "summary": "cache_control on stable SYSTEM_PROMPT — done on Anthropic path.",
        "description": (
            "SYSTEM_PROMPT is byte-identical every call. Anthropic path uses cache_control: ephemeral "
            "when use_prompt_cache=True. Groq has no Anthropic-style cache — prefer Anthropic for "
            "production multi-step runs."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "s",
        "target_release": "v0.2",
        "week": "Week 2",
        "category": "LLM / Cost",
        "modules": ["backend/llm_provider.py", "backend/playbook_agent.py"],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md#week-2"],
        "architecture_notes": "Settings recommended profile prefers Anthropic for this reason.",
        "progress": 100,
        "implementation_notes": "Shipped in llm_provider.call_llm; Settings help documents Groq limitation.",
        "tasks": [
            {"id": "t1", "title": "Add cache_control on Anthropic system block", "status": "done", "done": True},
            {"id": "t2", "title": "Document provider trade-offs in Settings UI", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-w2-streaming",
        "title": "Streaming LLM responses",
        "summary": "SSE token stream for AI Investigator; job-phase SSE for upload jobs. Playbooks stay non-stream.",
        "description": (
            "Playbook generation remains non-streaming (needs full JSON for citations/HiTL). "
            "AI Investigator: POST /incidents/{id}/investigate/stream (SSE tokens + final structured answer). "
            "Jobs: GET /logs/jobs/{id}/events for phase updates. llm_provider.stream_llm supports "
            "Anthropic/OpenAI/Groq/Gemini with non-stream fallback."
        ),
        "status": "completed",
        "priority": "p3",
        "owner": "",
        "effort": "m",
        "target_release": "v0.5+",
        "week": "Week 2",
        "category": "LLM / UX",
        "modules": [
            "backend/llm_provider.py",
            "backend/ai_investigator.py",
            "backend/server.py",
            "frontend/src/components/AIInvestigator.jsx",
        ],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md#week-2", "docs/SPEC_WORKFLOW.md"],
        "architecture_notes": "Do not stream playbook generation; job phases via SSE optional alongside polling.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: stream_llm + investigate_stream SSE; frontend live token bubble; "
            "job phase SSE endpoint. Non-stream investigate POST kept as fallback."
        ),
        "tasks": [
            {"id": "t1", "title": "Spike SSE for Investigator answers", "status": "done", "done": True},
            {"id": "t2", "title": "Optional job-phase SSE (not token stream)", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-done-favicon",
        "title": "Favicon / tab icon",
        "summary": "Brand favicon for the console.",
        "description": "Ship favicon.svg for browser tab recognition.",
        "status": "completed",
        "priority": "p3",
        "owner": "",
        "effort": "xs",
        "target_release": "v0.1",
        "week": "Checklist",
        "category": "UX",
        "modules": ["frontend/public/favicon.svg"],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md"],
        "architecture_notes": "",
        "progress": 100,
        "implementation_notes": "Done.",
        "tasks": [{"id": "t1", "title": "Add favicon.svg", "status": "done", "done": True}],
    },
    {
        "id": "rm-done-settings-reset",
        "title": "Settings factory reset + recommended profiles",
        "summary": "POST /settings/reset and /settings/apply-profile for ops baselines.",
        "description": "Factory and recommended ops profiles without wiping secrets by default.",
        "status": "completed",
        "priority": "p2",
        "owner": "",
        "effort": "s",
        "target_release": "v0.2",
        "week": "Checklist",
        "category": "Ops / Settings",
        "modules": ["backend/server.py", "frontend/src/pages/Settings.jsx"],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md"],
        "architecture_notes": "",
        "progress": 100,
        "implementation_notes": "Also TI clear-secrets and Settings guidance UI.",
        "tasks": [
            {"id": "t1", "title": "POST /settings/reset", "status": "done", "done": True},
            {"id": "t2", "title": "POST /settings/apply-profile", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-done-smoke",
        "title": "Smoke tests across all major areas",
        "summary": "backend/tests/test_smoke_all_areas.py coverage.",
        "description": "Auth, incidents, settings, KB, analytics, review starters.",
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "m",
        "target_release": "v0.2",
        "week": "Checklist",
        "category": "Quality / Security",
        "modules": ["backend/tests/test_smoke_all_areas.py"],
        "docs": ["memory/WEEKLY_DISCUSSIONS.md"],
        "architecture_notes": "",
        "progress": 100,
        "implementation_notes": "Extend when new settings endpoints land.",
        "tasks": [{"id": "t1", "title": "Author smoke suite", "status": "done", "done": True}],
    },
    # ----- Module review / hardening (memory/MODULE_REVIEW_ACTION_ITEMS.md) -----
    {
        "id": "rm-review-wave0-prod-safety",
        "title": "Module review Wave 0 — production safety gates",
        "summary": "Demo seed gate, weak JWT fail, no prod .env secret write, FormSubmit off, compose Mongo URL.",
        "description": (
            "From MODULE_REVIEW_ACTION_ITEMS Wave 0 (P0): seed demo users only in dev; "
            "refuse weak JWT_SECRET outside dev/test; skip SYNC of secrets to .env in prod; "
            "EMAIL_HTTP_GATEWAY default off outside dev; docker-compose MONGO_URL=mongodb://mongodb:27017."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "m",
        "target_release": "v0.4",
        "week": "Hardening",
        "category": "Quality / Security",
        "modules": [
            "backend/auth.py",
            "backend/server.py",
            "backend/secrets_util.py",
            "backend/notifications.py",
            "docker-compose.yml",
            "memory/MODULE_REVIEW_ACTION_ITEMS.md",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md"],
        "architecture_notes": "ENV=dev keeps local DX; production must set strong JWT and explicit opt-ins.",
        "progress": 100,
        "implementation_notes": "2026-07-19: A-S1, A-S2/A-A1, A-S3, A-N1, A-D1 shipped.",
        "tasks": [
            {"id": "t1", "title": "A-S1 demo seed gate", "status": "done", "done": True},
            {"id": "t2", "title": "A-S2 weak JWT hard-fail", "status": "done", "done": True},
            {"id": "t3", "title": "A-S3/A-N3 no prod .env secret write", "status": "done", "done": True},
            {"id": "t4", "title": "A-N1 email HTTP gateway default off", "status": "done", "done": True},
            {"id": "t5", "title": "A-D1 compose MONGO_URL override", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-review-wave1-correctness",
        "title": "Module review Wave 1 — correctness & reliability",
        "summary": "SSE incident_ids, metrics auth, JWT role rebind, password policy, job queue, enrich cache, caps.",
        "description": (
            "Wave 1 from MODULE_REVIEW_ACTION_ITEMS: job SSE incident_ids; /metrics auth; "
            "DB role re-bind; password ≥12; correlation_window wired; IoC enrich cap; llm_temperature; "
            "prod unscored TI; enrichment cache; playbook phase normalize; template HiTL; unit tests; "
            "durable Mongo job queue + disk payloads."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v0.4",
        "week": "Hardening",
        "category": "Quality / Security",
        "modules": [
            "backend/server.py",
            "backend/auth.py",
            "backend/pipeline.py",
            "backend/correlator.py",
            "backend/enrichment.py",
            "backend/enrichment_cache.py",
            "backend/job_queue.py",
            "backend/llm_provider.py",
            "backend/playbook_agent.py",
            "backend/tests/test_p1_cache_throttle_queue.py",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md"],
        "architecture_notes": "Job queue is single-process asyncio worker with Mongo claim — not Celery.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: Wave 1 complete including A-K1 Knowledge page SBERT tip + reindex path."
        ),
        "tasks": [
            {"id": "t1", "title": "A-S4 SSE incident_ids", "status": "done", "done": True},
            {"id": "t2", "title": "A-S5–S7 metrics / role rebind / job queue", "status": "done", "done": True},
            {"id": "t3", "title": "A-E1–E2 enrich unscored + cache", "status": "done", "done": True},
            {"id": "t4", "title": "A-P1–P2 correlator window + IoC caps", "status": "done", "done": True},
            {"id": "t5", "title": "A-L1–L3 temperature / phases / template HiTL", "status": "done", "done": True},
            {"id": "t6", "title": "A-T1–T3 unit tests", "status": "done", "done": True},
            {"id": "t7", "title": "A-K1 SBERT Knowledge guidance", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-attack-drilldown",
        "title": "ATT&CK technique drill-down (sub-techniques + evidence UI)",
        "summary": "Sub-technique inference, CES rules, catalog APIs, TechniquePanel, heatmap filter.",
        "description": (
            "A-K4: attack_catalog + attack_mapping; evidence/mitigations; IncidentDetail drawer; "
            "heatmap → /incidents?technique=; optional llm_technique_refine; golden parent-id recall."
        ),
        "status": "completed",
        "priority": "p2",
        "owner": "",
        "effort": "l",
        "target_release": "v0.4",
        "week": "Hardening",
        "category": "Detection / ATT&CK",
        "modules": [
            "backend/attack_catalog.py",
            "backend/attack_mapping.py",
            "backend/models.py",
            "backend/pipeline.py",
            "backend/server.py",
            "frontend/src/components/TechniquePanel.jsx",
            "frontend/src/components/AttackHeatmap.jsx",
            "frontend/src/pages/IncidentDetail.jsx",
            "frontend/src/pages/Incidents.jsx",
            "backend/tests/test_attack_mapping.py",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md"],
        "architecture_notes": "Curated catalog (not full STIX); extend ATTACK_CATALOG for more techniques.",
        "progress": 100,
        "implementation_notes": "2026-07-19: all drill-down phases shipped; tests green.",
        "tasks": [
            {"id": "t1", "title": "Model + catalog + inference", "status": "done", "done": True},
            {"id": "t2", "title": "UI panel + heatmap filter", "status": "done", "done": True},
            {"id": "t3", "title": "CES rules + optional LLM refine", "status": "done", "done": True},
            {"id": "t4", "title": "Unit tests + golden parent recall", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-review-wave2-quality",
        "title": "Module review Wave 2 — quality & scale",
        "summary": "Sidecar retention, private IPs, parser tests, KB ingest, analytics agg, session/URL guards.",
        "description": (
            "Remaining P2 from MODULE_REVIEW_ACTION_ITEMS: original upload filename; sidecar retention; "
            "private IP expansion; parser unit tests; safer LanceDB delete; prompt redaction; "
            "analytics aggregation; retrieval env isolation; frontend API URL guard; broader tests."
        ),
        "status": "completed",
        "priority": "p2",
        "owner": "",
        "effort": "l",
        "target_release": "v0.5",
        "week": "Hardening",
        "category": "Quality / Security",
        "modules": [
            "backend/pipeline.py",
            "backend/job_status.py",
            "backend/ioc_extractor.py",
            "backend/vector_store.py",
            "backend/analytics.py",
            "backend/parsers.py",
            "frontend/src/lib/api.js",
            "memory/MODULE_REVIEW_ACTION_ITEMS.md",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md"],
        "architecture_notes": "A-H1 Mongo aggregation is default path with legacy scan fallback.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: P3 filename, retention purge, private IPs, parser tests, safe Lance delete, "
            "llm_redact_iocs, api URL guard, retrieval env restore, A-H1 aggregation, A-K2 KB ingest."
        ),
        "tasks": [
            {"id": "t1", "title": "A-P3 original filename on single upload", "status": "done", "done": True},
            {"id": "t2", "title": "A-P4 sidecar/outbox retention job", "status": "done", "done": True},
            {"id": "t3", "title": "A-E3 private IP ranges + extract cap", "status": "done", "done": True},
            {"id": "t4", "title": "A-E5 parser fixture unit tests", "status": "done", "done": True},
            {"id": "t5", "title": "A-K3 safer vector_store delete", "status": "done", "done": True},
            {"id": "t6", "title": "A-L4 investigator prompt redaction option", "status": "done", "done": True},
            {"id": "t7", "title": "A-H1 analytics Mongo aggregation", "status": "done", "done": True},
            {"id": "t8", "title": "A-F2 frontend backend URL guard", "status": "done", "done": True},
            {"id": "t9", "title": "A-G2 retrieval_eval env isolation", "status": "done", "done": True},
            {"id": "t10", "title": "A-K2 admin KB ingest API + UI", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-review-wave3-polish",
        "title": "Module review Wave 3 — polish & ops",
        "summary": "Retention, token budget, schema formalize, empty states, multi-worker notes.",
        "description": (
            "P3 items: throttle purge; golden_runs; correlation/files_meta on Incident; "
            "UserCreatePublic; ListState empty/error UX; multi-worker readiness doc; "
            "incident retention + LLM monthly budget metering; logout cookie clear; register UI."
        ),
        "status": "completed",
        "priority": "p3",
        "owner": "",
        "effort": "m",
        "target_release": "v0.5",
        "week": "Hardening",
        "category": "Ops / Settings",
        "modules": [
            "backend/auth_throttle.py",
            "backend/server.py",
            "backend/golden_eval.py",
            "backend/retention.py",
            "backend/llm_usage.py",
            "backend/models.py",
            "frontend/src/components/ListState.jsx",
            "frontend/src/pages/",
            "docs/MULTI_WORKER.md",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md", "docs/MULTI_WORKER.md"],
        "architecture_notes": (
            "Residuals closed under rm-review-residual-open (A-F5 Playwright, A-T6/T8, "
            "A-F1 sessionStorage dual-auth, A-H2 datetime helpers)."
        ),
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: A-S11, A-A4, A-G3, A-K4, A-L5, A-P5, A-M3, A-F3/F4, A-D3, "
            "incident retention purge, llm_token_budget_monthly meter, A-T4 job_status tests. "
            "2026-07-20: residual card completed (tests + session hardening + A-H2)."
        ),
        "tasks": [
            {"id": "t1", "title": "A-A4 throttle collection purge", "status": "done", "done": True},
            {"id": "t2", "title": "A-G3 persist last golden run", "status": "done", "done": True},
            {"id": "t3", "title": "A-L5 citation quality metric", "status": "done", "done": True},
            {"id": "t4", "title": "A-F3 empty/error states on list pages", "status": "done", "done": True},
            {"id": "t5", "title": "A-D3 multi-worker readiness doc", "status": "done", "done": True},
            {"id": "t6", "title": "A-M1 retention + token budget enforce", "status": "done", "done": True},
            {"id": "t7", "title": "A-P5/A-M3 schema formalize", "status": "done", "done": True},
            {"id": "t8", "title": "A-F4 remove privileged roles from Login signup", "status": "done", "done": True},
            {"id": "t9", "title": "A-S11 logout cookie clear", "status": "done", "done": True},
        ],
    },
    # ----- Residual MODULE_REVIEW + ops enhancements (track remaining work) -----
    {
        "id": "rm-pipeline-hung-resume",
        "title": "Hung pipeline resume (startup reclaim + manual re-queue)",
        "summary": "Worker reclaims in-flight jobs on restart; POST /logs/jobs/{id}/resume; Upload Resume button.",
        "description": (
            "Jobs left queue_state=running after process death no longer wait JOB_STALE_MINUTES. "
            "requeue_on_startup reclaims immediately; requeue_stale also matches missing claimed_at. "
            "Operators can force re-queue when durable job_payloads/{id} still exists."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "s",
        "target_release": "v0.5",
        "week": "Hardening",
        "category": "Ops / Reliability",
        "modules": [
            "backend/job_queue.py",
            "backend/server.py",
            "frontend/src/pages/Upload.jsx",
            "docs/MULTI_WORKER.md",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md", "docs/MULTI_WORKER.md"],
        "architecture_notes": "Single asyncio worker; resume re-runs full pipeline from durable disk payload.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-19: requeue_on_startup + force_requeue + POST /logs/jobs/{id}/resume + UI Resume."
        ),
        "tasks": [
            {"id": "t1", "title": "Startup requeue all running claims", "status": "done", "done": True},
            {"id": "t2", "title": "Manual resume API + payload guard", "status": "done", "done": True},
            {"id": "t3", "title": "Upload page Resume control", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-investigator-llm-fallback",
        "title": "AI Investigator — stream auth + actionable LLM fallback",
        "summary": "SSE fetch sends Bearer; fallback surfaces missing key / LLM error instead of opaque ? message.",
        "description": (
            "Root cause of '? Full LLM analysis not available': raw fetch SSE omitted Authorization so "
            "cross-origin SPA auth failed, or LLM key missing → silent template fallback. "
            "Fix: TOKEN_KEY Bearer on stream; fallback_reason + UI banner; unknowns include Settings hint."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "s",
        "target_release": "v0.5",
        "week": "Hardening",
        "category": "LLM / UX",
        "modules": [
            "frontend/src/components/AIInvestigator.jsx",
            "backend/ai_investigator.py",
            "backend/llm_provider.py",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md"],
        "architecture_notes": "Same dual auth as axios (Bearer + cookie). Configure keys under Admin Settings.",
        "progress": 100,
        "implementation_notes": "2026-07-19: stream Bearer + _fallback_reason + limited-analysis banner.",
        "tasks": [
            {"id": "t1", "title": "SSE Authorization Bearer from localStorage", "status": "done", "done": True},
            {"id": "t2", "title": "Fallback reason + UI banner", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-rbac-golden-roadmap",
        "title": "RBAC alignment — Golden Eval admin-only + Roadmap create/seed",
        "summary": "Nav/route match A-S10; senior_reviewer can edit roadmap tasks but not create/reseed.",
        "description": (
            "Golden Eval: Layout nav was open to analysts while API + App route required admin → 403. "
            "Roadmap: senior_reviewer saw New item / Sync seed but POST /roadmap and /roadmap/seed are admin-only."
        ),
        "status": "completed",
        "priority": "p2",
        "owner": "",
        "effort": "xs",
        "target_release": "v0.5",
        "week": "Hardening",
        "category": "Quality / Security",
        "modules": [
            "frontend/src/components/Layout.jsx",
            "frontend/src/pages/Roadmap.jsx",
            "frontend/src/App.js",
            "backend/server.py",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md"],
        "architecture_notes": "canEdit (admin|senior_reviewer) vs canAdmin (admin) on Roadmap UI.",
        "progress": 100,
        "implementation_notes": "2026-07-19: Layout golden admin-only; Roadmap split canAdmin for create/seed.",
        "tasks": [
            {"id": "t1", "title": "Golden Eval nav roles = admin", "status": "done", "done": True},
            {"id": "t2", "title": "Roadmap canAdmin for create/reseed", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-review-residual-open",
        "title": "Module review residual OPEN items (track)",
        "summary": "A-F5 Playwright, A-T6 pipeline ZIP isolation, A-T8 RBAC matrix, A-F1 session dual-auth, A-H2 datetime.",
        "description": (
            "Closed residuals from MODULE_REVIEW_ACTION_ITEMS after Waves 0–3: "
            "A-F5 Playwright smoke E2E; A-T6 offline pipeline ZIP/per-file isolation tests; "
            "A-T8 RBAC matrix unit tests; A-F1 sessionStorage + migrate-off localStorage JWT "
            "(httpOnly cookie remains dual with Bearer for cross-origin SPA); "
            "A-H2 mongo_util.to_mongo_doc + created_at_match for datetime/ISO dual-read."
        ),
        "status": "completed",
        "priority": "p3",
        "owner": "",
        "effort": "l",
        "target_release": "v0.6",
        "week": "Backlog",
        "category": "Quality / Security",
        "modules": [
            "frontend/e2e/smoke.spec.js",
            "frontend/src/lib/auth.jsx",
            "frontend/src/lib/api.js",
            "backend/tests/test_pipeline_isolation.py",
            "backend/tests/test_rbac_matrix.py",
            "backend/mongo_util.py",
            "backend/analytics.py",
            "memory/MODULE_REVIEW_ACTION_ITEMS.md",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md"],
        "architecture_notes": (
            "A-F1 later upgraded to pure cookie-only SPA under rm-review-deferred-close; "
            "this card closed the dual sessionStorage path first."
        ),
        "progress": 100,
        "implementation_notes": (
            "2026-07-20: verified tests pass (pipeline isolation, RBAC matrix, payload scrub); "
            "Playwright e2e/smoke.spec.js + yarn e2e; A-H2 helpers live; A-F1 sessionStorage dual then cookie-only."
        ),
        "tasks": [
            {"id": "t1", "title": "A-F5 Playwright smoke: login, upload, review, settings", "status": "done",
             "done": True},
            {"id": "t2", "title": "A-T6 pipeline offline ZIP/per-file isolation tests", "status": "done", "done": True},
            {"id": "t3", "title": "A-T8 RBAC matrix tests (all role×route)", "status": "done", "done": True},
            {"id": "t4", "title": "A-F1 sessionStorage + httpOnly dual (SPA); migrate off localStorage",
             "status": "done", "done": True},
            {"id": "t5", "title": "A-H2 consistent datetime created_at storage + dual-match", "status": "done",
             "done": True},
        ],
    },
    {
        "id": "rm-enh-live-llm-golden-ui",
        "title": "Enhancement — live LLM golden sample from UI (A-G1)",
        "summary": "Admin Golden Eval page has Live LLM sample toggle; API live_llm flag + cost confirm.",
        "description": (
            "Backend POST /eval/golden-benchmark?live_llm=true runs first 5 cases with real playbook LLM. "
            "UI: checkbox data-testid=golden-live-llm-toggle, confirm dialog, amber run button, longer timeout."
        ),
        "status": "completed",
        "priority": "p3",
        "owner": "",
        "effort": "xs",
        "target_release": "v0.6",
        "week": "Backlog",
        "category": "Evaluation",
        "modules": [
            "frontend/src/pages/GoldenBenchmark.jsx",
            "backend/server.py",
            "backend/golden_eval.py",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md", "backend/tests/golden/README.md"],
        "architecture_notes": "Never default live_llm in CI; admin opt-in only.",
        "progress": 100,
        "implementation_notes": "2026-07-20: API + UI toggle + cost warning confirmed complete.",
        "tasks": [
            {"id": "t1", "title": "Backend live_llm query flag", "status": "done", "done": True},
            {"id": "t2", "title": "Golden Eval UI toggle + cost warning", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-enh-payload-secret-redact",
        "title": "Enhancement — redact secrets in durable job payloads",
        "summary": "job_payloads meta.json scrubs secret fields; claim re-hydrates from live settings.",
        "description": (
            "A-N2/A-S3 follow-on: durable queue meta no longer embeds API keys/webhooks. "
            "scrub_settings_for_disk on save; merge_settings_with_live at claim from Mongo settings."
        ),
        "status": "completed",
        "priority": "p2",
        "owner": "",
        "effort": "m",
        "target_release": "v0.6",
        "week": "Backlog",
        "category": "Quality / Security",
        "modules": ["backend/job_queue.py", "backend/secrets_util.py", "backend/server.py"],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md"],
        "architecture_notes": "Claim path merges payload settings with live _get_settings() secrets.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-20: scrub_settings_for_disk + merge_settings_with_live + "
            "test_payload_scrubs_secrets / test_merge_settings_with_live_restores_secrets."
        ),
        "tasks": [
            {"id": "t1", "title": "Strip secret fields from saved payload meta", "status": "done", "done": True},
            {"id": "t2", "title": "Re-hydrate secrets from settings at claim", "status": "done", "done": True},
            {"id": "t3", "title": "Unit test: payload meta has no sk- keys", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-review-deferred-close",
        "title": "Module review deferred residuals closed (A-S3 vault, A-A3, A-F1 cookie)",
        "summary": "Encrypt-at-rest secrets vault, multi-worker atomic throttle, cookie-only SPA session.",
        "description": (
            "Final MODULE_REVIEW deferred pointers: A-S3 Fernet encrypt-at-rest for Settings secrets "
            "in Mongo (enc:v1:) + SECRETS_MASTER_KEY ops docs; A-A3 Mongo find_one_and_update rate limit "
            "as sole multi-worker source of truth + tests; A-F1 SPA never stores JWT (httpOnly cookie only, "
            "purge soc_token from web storage). External KMS and multi-node job payload store remain ops stretch."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "m",
        "target_release": "v0.6",
        "week": "Backlog",
        "category": "Quality / Security",
        "modules": [
            "backend/secret_vault.py",
            "backend/secrets_util.py",
            "backend/auth_throttle.py",
            "backend/server.py",
            "frontend/src/lib/api.js",
            "frontend/src/lib/auth.jsx",
            "frontend/src/components/AIInvestigator.jsx",
            "docs/MULTI_WORKER.md",
            "backend/tests/test_secret_vault_auth_residuals.py",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md", "docs/MULTI_WORKER.md", "backend/.env.example"],
        "architecture_notes": (
            "Vault key: SECRETS_MASTER_KEY or JWT_SECRET-derived. Cookie: SameSite auto/none for CORS SPA. "
            "AUTH_RETURN_TOKEN_IN_BODY still for API clients; SPA ignores body token."
        ),
        "progress": 100,
        "implementation_notes": (
            "2026-07-20: vault tests, throttle multi-worker tests, cookie-only frontend, action items closed."
        ),
        "tasks": [
            {"id": "t1", "title": "A-S3 Fernet vault encrypt/decrypt + migrate + settings status", "status": "done",
             "done": True},
            {"id": "t2", "title": "A-A3 atomic multi-worker rate limit tests + MULTI_WORKER.md", "status": "done",
             "done": True},
            {"id": "t3", "title": "A-F1 cookie-only SPA (no JWT in web storage)", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-ops-stretch-close",
        "title": "Ops stretch closed — external vault + multi-node payloads + auto seed merge",
        "summary": "Hashicorp/AWS SM secret backends, Mongo GridFS job payloads, roadmap auto-merge on boot.",
        "description": (
            "Closes remaining MODULE_REVIEW ops-stretch pointers: external_secrets.py "
            "(Hashicorp Transit encrypt, KV refs vault://, AWS SM refs awssm://); "
            "job_queue ACTIRA_JOB_PAYLOAD_BACKEND=mongo|disk|dual with GridFS multi-node "
            "payload store; _ensure_roadmap_seeded auto-inserts missing seed IDs and promotes "
            "seed-completed cards without Admin Sync seed."
        ),
        "status": "completed",
        "priority": "p2",
        "owner": "",
        "effort": "m",
        "target_release": "v0.6",
        "week": "Backlog",
        "category": "Quality / Security",
        "modules": [
            "backend/external_secrets.py",
            "backend/secret_vault.py",
            "backend/job_queue.py",
            "backend/server.py",
            "docs/MULTI_WORKER.md",
            "backend/tests/test_ops_stretch_close.py",
        ],
        "docs": ["memory/MODULE_REVIEW_ACTION_ITEMS.md", "docs/MULTI_WORKER.md", "backend/.env.example"],
        "architecture_notes": (
            "Default payload backend is mongo (shared). Disk remains for tests via "
            "ACTIRA_JOB_PAYLOAD_BACKEND=disk. Vault Transit optional; local Fernet default."
        ),
        "progress": 100,
        "implementation_notes": "2026-07-20: ops stretch closed with unit tests + auto seed merge.",
        "tasks": [
            {"id": "t1", "title": "Hashicorp Transit + KV + AWS SM external secret backends", "status": "done",
             "done": True},
            {"id": "t2", "title": "Mongo GridFS multi-node job payload store", "status": "done", "done": True},
            {"id": "t3", "title": "Roadmap auto-merge completed seed cards on startup", "status": "done", "done": True},
        ],
    },
    # -------------------------------------------------------------------------
    # Capstone / v1.0–v1.1 program (2026-07-23) — tracking for management UI
    # Full checklist: ROADMAP.md (sections A–L)
    # -------------------------------------------------------------------------
    {
        "id": "rm-v1-enterprise-demo-pack",
        "title": "v1.0 Enterprise Demonstration Ready pack",
        "summary": "Board review, docs suite, diagrams, presentations, ops/AI-gov/compliance, packaging.",
        "description": (
            "Enterprise Review Board report (~89/100 maturity). Full documentation index, "
            "threat model, deploy/ops runbooks, AI governance, compliance maps, business pack, "
            "presentation decks, Mermaid diagrams, K8s/Helm, API collections, benchmarks, "
            "samples, repo professionalism (templates, CoC, SUPPORT)."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "l",
        "target_release": "v1.0",
        "week": "Capstone 2026-07",
        "category": "Product / Docs",
        "modules": [
            "docs/",
            "presentation/",
            "diagrams/",
            "deployments/",
            "api/",
            "benchmarks/",
            "samples/",
            "ROADMAP.md",
            "docs/ENTERPRISE_REVIEW.md",
        ],
        "docs": ["ROADMAP.md", "docs/ENTERPRISE_REVIEW.md", "DOCUMENTATION_INDEX.md"],
        "architecture_notes": "Documentation and packaging only; no API break.",
        "progress": 100,
        "implementation_notes": "2026-07-23: Enterprise pack completed for demo/capstone.",
        "tasks": [
            {"id": "t1", "title": "Enterprise board report + scorecard", "status": "done", "done": True},
            {"id": "t2", "title": "Docs: overview, architecture, threat model, ops, AI gov, compliance",
             "status": "done", "done": True},
            {"id": "t3", "title": "presentation/ + diagrams/ Mermaid suite", "status": "done", "done": True},
            {"id": "t4", "title": "deployments/ Helm K8s cloud runbooks + api collections", "status": "done",
             "done": True},
            {"id": "t5", "title": "Repo professionalism + start-demo scripts", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-1-modular-api",
        "title": "v1.1 Modular API — routers + core + /api/v1",
        "summary": "Split server.py into domain routers; dual /api and /api/v1; tests + OpenAPI.",
        "description": (
            "backend/routers/* domain modules; core/database.py + core/services.py; slim server.py; "
            "non-breaking /api/v1 alias; modularization unit tests; OpenAPI refresh; BACKEND_STRUCTURE.md."
        ),
        "status": "completed",
        "priority": "p0",
        "owner": "",
        "effort": "m",
        "target_release": "v1.1",
        "week": "Capstone 2026-07",
        "category": "Architecture",
        "modules": [
            "backend/server.py",
            "backend/core/",
            "backend/routers/",
            "backend/tests/test_modular_api_v1.py",
            "docs/openapi.json",
            "docs/dx/BACKEND_STRUCTURE.md",
        ],
        "docs": ["ROADMAP.md", "docs/dx/BACKEND_STRUCTURE.md", "RELEASE_NOTES.md"],
        "architecture_notes": "uvicorn server:app unchanged; SPA still uses /api.",
        "progress": 100,
        "implementation_notes": "2026-07-23: modularization + offline tests green (142 unit path).",
        "tasks": [
            {"id": "t1", "title": "Extract domain routers", "status": "done", "done": True},
            {"id": "t2", "title": "core database + services", "status": "done", "done": True},
            {"id": "t3", "title": "Mount /api and /api/v1 parity", "status": "done", "done": True},
            {"id": "t4", "title": "Modularization tests + OpenAPI export", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-1-capstone-ux-polish",
        "title": "v1.1 Capstone UX polish — palette, recents, quick actions",
        "summary": "Non-breaking enterprise UX: ⌘K command palette, recent incidents, dashboard CTAs.",
        "description": (
            "CommandPalette Ctrl/Cmd+K; recentActivity localStorage; dashboard quick actions; "
            "ListState skeletons; security response headers; Playwright e2e 6/6; "
            "CAPSTONE_ENHANCEMENT_REVIEW.md."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "s",
        "target_release": "v1.1",
        "week": "Capstone 2026-07",
        "category": "Frontend / UX",
        "modules": [
            "frontend/src/components/CommandPalette.jsx",
            "frontend/src/components/Layout.jsx",
            "frontend/src/lib/recentActivity.js",
            "frontend/src/pages/Dashboard.jsx",
            "frontend/src/pages/IncidentDetail.jsx",
            "frontend/src/components/ListState.jsx",
            "frontend/e2e/smoke.spec.js",
            "backend/server.py",
        ],
        "docs": ["docs/product/CAPSTONE_ENHANCEMENT_REVIEW.md", "ROADMAP.md"],
        "architecture_notes": "No API/schema break; client-only recents.",
        "progress": 100,
        "implementation_notes": "2026-07-23: e2e smoke 6/6 including palette + quick actions.",
        "tasks": [
            {"id": "t1", "title": "Command palette + Layout wire-up", "status": "done", "done": True},
            {"id": "t2", "title": "Recent incidents + dashboard quick actions", "status": "done", "done": True},
            {"id": "t3", "title": "Skeletons + security headers", "status": "done", "done": True},
            {"id": "t4", "title": "Playwright smoke expansion + build lint fix", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v1-2-oidc-sso",
        "title": "v1.2 Enterprise identity — OIDC SSO / MFA / group RBAC",
        "summary": "Entra ID / Okta / Keycloak OIDC; MFA via IdP; map groups to analyst/reviewer/admin.",
        "description": (
            "Scaffold shipped: OIDC authorization-code + PKCE (`oidc_service`), public config + login/callback "
            "routes, Login SSO CTA when enabled. F-05 register policy: auto-disable when OIDC on or "
            "ENV production/staging; `ALLOW_PUBLIC_REGISTER` override; SPA hides Register. "
            "Remaining: live IdP hardening, MFA (IdP), logout federation, full group RBAC validation. "
            "Non-breaking for local JWT demos."
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
            "backend/repositories/users.py",
            "frontend/src/pages/Login.jsx",
        ],
        "docs": ["ROADMAP.md#f-v12-enterprise-identity", "docs/CONFIGURATION.md", "SECURITY.md"],
        "architecture_notes": "Keep demo JWT seed for lab ENV; SSO for staging/production profiles.",
        "progress": 55,
        "implementation_notes": (
            "2026-07-26: Env-gated OIDC (OIDC_ISSUER + OIDC_CLIENT_ID); PKCE state store; "
            "OIDC_ROLE_CLAIM / OIDC_GROUP_ROLE_MAP; session cookie via existing token response. "
            "Public register policy + auth/oidc/config.public_register; CONFIGURATION + .env.example. "
            "Offline unit tests for disabled-by-default + route registration + register policy."
        ),
        "tasks": [
            {
                "id": "t1",
                "title": "OIDC provider integration (authorization code + PKCE)",
                "status": "done",
                "done": True,
            },
            {
                "id": "t2",
                "title": "IdP group → ACTIRA role mapping",
                "status": "in_progress",
                "done": False,
            },
            {
                "id": "t3",
                "title": "MFA via IdP + enterprise register policy",
                "status": "in_progress",
                "done": False,
            },
            {
                "id": "t4",
                "title": "SPA cookie session + logout federation",
                "status": "in_progress",
                "done": False,
            },
        ],
    },
    {
        "id": "rm-v1-3-otel-ha",
        "title": "v1.3 Observability & HA — OTEL, multi-replica, load evidence",
        "summary": "OpenTelemetry traces; multi-replica validation; published load tests; Helm polish.",
        "description": (
            "Planned: OTEL instrumentation, stateless multi-replica API, load tests 10/100+, "
            "Helm prod values, production dashboards beyond skeletons."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v1.3",
        "week": "Done",
        "category": "Platform / SRE",
        "modules": ["backend/", "deployments/helm/", "monitoring/", "benchmarks/"],
        "docs": ["ROADMAP.md#g-planned--v13-observability--ha", "docs/operations/"],
        "architecture_notes": "Build on existing /metrics and job queue multi-worker docs.",
        "progress": 100,
        "implementation_notes": (
            "2026-07-26: Pipeline stage timings (`pipeline_trace.py`, optional OTEL spans). "
            "HA validation runbook + offline tests; load methodology 10/100 users; Helm chart 1.1.0 "
            "with API+worker Deployments, HPA, PDB, values-prod.yaml. "
            "Also: soft-dep OTLP HTTP exporter hook (`backend/otel_setup.py`, ACTIRA_OTEL_ENABLED / "
            "OTEL_EXPORTER_OTLP_ENDPOINT); ops status can surface OTEL config. Deep auto-instrument optional."
        ),
        "tasks": [
            {
                "id": "t1",
                "title": "OpenTelemetry tracing for API + pipeline stages",
                "status": "done",
                "done": True,
            },
            {
                "id": "t2",
                "title": "Multi-replica / HA validation runbook + test",
                "status": "done",
                "done": True,
            },
            {
                "id": "t3",
                "title": "Load test report 10/100 users",
                "status": "done",
                "done": True,
            },
            {
                "id": "t4",
                "title": "Helm prod-like values polish",
                "status": "done",
                "done": True,
            },
        ],
    },
    {
        "id": "rm-v1-4-investigation-workspace",
        "title": "v1.4 Investigation Workspace — AI SOC Command Center (Wave A)",
        "summary": "Case hub, visual timeline, RCA, entity graph, notebook, AI assistant on /incidents/:id.",
        "description": (
            "Design published 2026-07-26 (docs/product/INVESTIGATION_WORKSPACE_DESIGN.md). "
            "Extend IncidentDetail into tabbed workspace; pure timeline/graph builders; atomic notes; "
            "RCA with budget fallback; reuse investigator SSE with prompt-injection controls. "
            "Implement via PR-1…PR-10 in design doc."
        ),
        "status": "in_progress",
        "priority": "p0",
        "owner": "",
        "effort": "l",
        "target_release": "v1.4",
        "week": "Current",
        "category": "Product / Investigation",
        "modules": [
            "backend/investigation_views.py",
            "backend/services/workspace_service.py",
            "backend/routers/workspace.py",
            "backend/rca.py",
            "backend/ai_investigator.py",
            "frontend/src/pages/IncidentDetail.jsx",
            "frontend/src/components/workspace/",
        ],
        "docs": [
            "docs/product/VISION.md",
            "docs/product/INVESTIGATION_WORKSPACE_DESIGN.md",
            "ROADMAP.md#m-vision-waves-agentic-soc-command-center",
        ],
        "architecture_notes": "No pipeline rewrite; dual /api + /api/v1; optional workspace on incident docs.",
        "progress": 90,
        "implementation_notes": (
            "2026-07-26: PR-1…PR-9 on feature branch — builders, notes API, timeline/graph HTTP, RCA, "
            "tabbed UI, visual timeline, entity graph, notebook, assistant starters + untrusted-note framing. "
            "Remaining: PR-10 e2e polish / merge DoD."
        ),
        "tasks": [
            {
                "id": "t1",
                "title": "Design doc + product vision (Wave A)",
                "status": "done",
                "done": True,
            },
            {
                "id": "t2",
                "title": "PR-1…PR-3 pure views + notes + timeline/graph APIs",
                "status": "done",
                "done": True,
            },
            {
                "id": "t3",
                "title": "PR-4…PR-5 workspace RCA + UI shell",
                "status": "done",
                "done": True,
            },
            {
                "id": "t4",
                "title": "PR-6…PR-9 timeline/graph/notes/assistant + prompt safety",
                "status": "done",
                "done": True,
            },
        ],
    },
    {
        "id": "rm-v1-6-compliance-audit-llm",
        "title": "v1.6 Wave C — Compliance, audit intelligence, LLM free/paid catalog + fallback",
        "summary": "Runtime compliance score/gaps/evidence, audit hash chain + summary, executive export, free+paid LLM catalog, multi-provider fallback.",
        "description": (
            "Product-alignment compliance scoring (not certification), GRC evidence pack, board executive snapshot, "
            "audit trail field fixes with SHA-256 integrity chain, rule-based audit intelligence, expanded free and "
            "paid LLM model catalog, cross-provider fallback with retriable error classification, Settings validation "
            "and test-llm probe."
        ),
        "status": "in_progress",
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
            "frontend/src/constants/settingsMeta.js",
        ],
        "docs": [
            "docs/product/VISION.md",
            "ROADMAP.md#m-vision-waves-agentic-soc-command-center",
            "docs/product/FEATURE_INVENTORY.md",
        ],
        "architecture_notes": (
            "Deterministic evidence flags; best-effort audit chain (not WORM); free-tier Groq/Gemini + paid frontier; "
            "template LLM fallbacks remain last resort."
        ),
        "progress": 90,
        "implementation_notes": (
            "2026-07-26: score/gaps/evidence + executive export; audit summary/integrity; free+paid catalog + fallback."
        ),
        "tasks": [
            {"id": "t1", "title": "Compliance score + gaps + evidence pack", "status": "done", "done": True},
            {"id": "t2", "title": "Audit intelligence + integrity + UI mapping", "status": "done", "done": True},
            {"id": "t3", "title": "Executive export + free/paid LLM catalog + fallback", "status": "done", "done": True},
            {"id": "t4", "title": "Merge + OpenAPI + docs DoD", "status": "in_progress", "done": False},
        ],
    },
    {
        "id": "rm-arch-p0-p3-layers-analytics",
        "title": "Architecture layers + analytics performance + cost/stage visibility",
        "summary": "P0 import stabilization; P1 services/repos; P2 KPI facet/cache; P3 LLM budget KPI + stage timings.",
        "description": (
            "Refactor stack merged to main 2026-07-26: package-local backend imports; domain services; "
            "Mongo $facet KPIs + TTL cache + indexes; Dashboard LLM budget meter; pipeline stage_timings."
        ),
        "status": "completed",
        "priority": "p1",
        "owner": "",
        "effort": "l",
        "target_release": "v1.1",
        "week": "Done",
        "category": "Platform / Architecture",
        "modules": [
            "backend/services/",
            "backend/repositories/",
            "backend/analytics.py",
            "backend/pipeline_trace.py",
            "frontend/src/pages/Dashboard.jsx",
            "frontend/src/pages/Upload.jsx",
        ],
        "docs": ["docs/ARCHITECTURE.md", "CHANGELOG.md"],
        "architecture_notes": "Thin routers; analytics cache is per-process (see MULTI_WORKER.md).",
        "progress": 100,
        "implementation_notes": (
            "Merged PRs #1–#3. CI green (unit, golden, openapi, bandit, frontend). "
            "Env: ANALYTICS_KPI_CACHE_TTL_SECONDS, ANALYTICS_DASHBOARD_CACHE_TTL_SECONDS."
        ),
        "tasks": [
            {"id": "t1", "title": "P0 import stabilization + ready/version probes", "status": "done", "done": True},
            {"id": "t2", "title": "P1 services/repos architecture layers", "status": "done", "done": True},
            {"id": "t3", "title": "P2 analytics facet + cache + indexes", "status": "done", "done": True},
            {"id": "t4", "title": "P3 LLM KPI + pipeline stage timings", "status": "done", "done": True},
        ],
    },
    {
        "id": "rm-v2-multi-tenant",
        "title": "v2.0 Multi-tenant + commercial pilot readiness",
        "summary": "org_id isolation, per-tenant secrets, pen-test evidence, optional SOAR actions.",
        "description": (
            "Future: multi-customer isolation, tenant settings, scale/pen-test pack, "
            "optional SOAR with separate approval, optional multi-incident fan-out, SIEM connectors."
        ),
        "status": "future",
        "priority": "p2",
        "owner": "",
        "effort": "xl",
        "target_release": "v2.0",
        "week": "Future",
        "category": "Product",
        "modules": ["backend/", "frontend/"],
        "docs": ["ROADMAP.md#h-future--v20-multi-tenant--commercial"],
        "architecture_notes": "Do not claim multi-tenant until org_id is end-to-end.",
        "progress": 0,
        "implementation_notes": "",
        "tasks": [
            {"id": "t1", "title": "org_id on users/incidents/jobs/settings", "status": "todo", "done": False},
            {"id": "t2", "title": "Per-tenant secrets + settings", "status": "todo", "done": False},
            {"id": "t3", "title": "Pen-test + scale evidence pack", "status": "todo", "done": False},
            {"id": "t4", "title": "Optional SOAR actions with human approval", "status": "todo", "done": False},
        ],
    },
    {
        "id": "rm-optional-release-packaging",
        "title": "Optional — git tags, demo video, hosted demo",
        "summary": "Portfolio packaging: v1.0/v1.1 tags, 5–8 min demo recording, public/private host.",
        "description": (
            "Not required for functional completeness. Improves interview/CXO presentation. "
            "Also: secret history scan before public OSS; live backend_test on :8003."
        ),
        "status": "planned",
        "priority": "p3",
        "owner": "",
        "effort": "s",
        "target_release": "v1.1",
        "week": "Optional",
        "category": "Product / Docs",
        "modules": ["RELEASE_NOTES.md", "docs/DEMO_SCRIPT.md"],
        "docs": ["ROADMAP.md#e-optional-packaging-not-required-to-claim-done"],
        "architecture_notes": "Process only; no code dependency.",
        "progress": 0,
        "implementation_notes": "",
        "tasks": [
            {"id": "t1", "title": "Tag v1.0.0 and/or v1.1.0", "status": "todo", "done": False},
            {"id": "t2", "title": "Record demo video from DEMO_SCRIPT", "status": "todo", "done": False},
            {"id": "t3", "title": "Optional hosted demo environment", "status": "todo", "done": False},
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
        {"id": "t2", "title": f"Implement core path in modules: {', '.join((item.get('modules') or [])[:2]) or 'TBD'}",
         "status": "todo", "done": False},
        {"id": "t3", "title": "Add/adjust tests + docs", "status": "todo", "done": False},
        {"id": "t4", "title": "Update roadmap progress + implementation notes", "status": "todo", "done": False},
    ]
