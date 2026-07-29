# ACTIRA — Release Notes

## Capstone final polish (non-breaking UX)

### Highlights

- **Command palette** (Ctrl/⌘K): jump to pages + recent incidents
- **Dashboard quick actions** strip
- **Recent activity** local history on incident open
- **Skeleton loading** states
- **Security headers** (`X-Content-Type-Options`, `X-Frame-Options`, …)
- GoldenBenchmark hooks lint fix (CI build green)
- Playwright smoke: **6/6 passed** including palette + quick actions
- Review: `docs/product/CAPSTONE_ENHANCEMENT_REVIEW.md`

### Breaking changes

None.

---

## v1.1 Modular API (engineering)

### Highlights

- Domain **routers** (`backend/routers/*`) + **core** database/services
- Dual API mounts: **`/api`** and **`/api/v1`** (identical handlers)
- Slim `server.py` entrypoint (`python -m uvicorn backend.server:app` from repo root)
- Tests: `backend/tests/test_modular_api_v1.py`
- Docs: `docs/dx/BACKEND_STRUCTURE.md`, `docs/product/E2E_CAPABILITY_MATRIX.md`
- OpenAPI snapshot regenerated (`docs/openapi.json`)

### Breaking changes

None for existing `/api/*` clients.

### Upgrade

Pull code; restart uvicorn. No Mongo migration.

---

## v1.0 Enterprise Demonstration Ready Pack (2026-07-23)

### Highlights

- Board maturity: **Enterprise Demonstration Ready (v1.0)** · estimated score **89/100** (from 72).
- **CXO presentation package** + **16 architecture diagrams**.
- **DX / ops / AI governance / compliance / business** documentation packs.
- **K8s + Helm + multi-cloud runbooks**, API collections, SDK examples.
- **Benchmark harness**, demo samples, one-command `scripts/start-demo.*`.
- Repository professionalism (templates, CoC, SUPPORT, CODEOWNERS).

### For evaluators (30–60 minutes)

1. `.\scripts\start-demo.ps1` (or manual quickstart)
2. [presentation/01-executive-pitch.md](presentation/01-executive-pitch.md)
3. [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) live path
4. [docs/ENTERPRISE_REVIEW.md](docs/ENTERPRISE_REVIEW.md) scorecard
5. Optional: `python benchmarks/run_benchmarks.py --profile smoke`

### Breaking changes

None.

### Still out of scope for “enterprise production SIEM”

SSO/MFA, multi-tenancy, certified 500-user SLA, full SOAR actions.

See also [CHANGELOG.md](CHANGELOG.md).
