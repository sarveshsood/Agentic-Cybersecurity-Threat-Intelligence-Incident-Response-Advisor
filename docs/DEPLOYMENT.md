# ACTIRA — Deployment Guide

## 1. Local development (recommended for demos)

### Prerequisites

- Python 3.11+ (3.12 tested in CI)
- Node.js 18+
- MongoDB 7 (native or Docker)

### Steps

```bash
# Infra
docker compose up -d mongodb
# or: mongod with local data path

# Backend (from repository root)
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then edit JWT_SECRET, optional keys
cd ..
export PYTHONPATH=.
python -m uvicorn backend.server:app --reload --host 0.0.0.0 --port 8001
# Windows: $env:PYTHONPATH=(Get-Location).Path; python -m uvicorn backend.server:app --reload --host 0.0.0.0 --port 8001
# Or: .\scripts\start-demo.ps1 -SkipDocker

# Frontend (second terminal)
cd frontend
npm install   # or yarn
# ensure frontend/.env has REACT_APP_BACKEND_URL=http://localhost:8001
npm start
```

Health: `GET http://127.0.0.1:8001/api/health` → `"status":"ok","mongo":"up"`.

---

## 2. Full Docker Compose

```bash
# From repo root; backend/.env must exist
docker compose up -d --build
```

Services:

| Service  | Port  |
|----------|-------|
| frontend | 3000  |
| backend  | 8001  |
| mongodb  | 27017 |

Compose **overrides** `MONGO_URL` inside the backend container to `mongodb://mongodb:27017`.

Disable demo seed for prod-like:

```bash
# environment or .env
SEED_DEMO_USERS=false
ENV=production
```

---

## 3. Production checklist

> **Authoritative full checklist:** [operations/SECURITY_HARDENING.md](operations/SECURITY_HARDENING.md)  
> Complete and sign off that document before processing real SOC data. The table below is a **summary only**.

| Control              | Action                                                                      |
|----------------------|-----------------------------------------------------------------------------|
| TLS                  | Terminate at reverse proxy (nginx, Caddy, ALB, App Gateway)                 |
| `ENV`                | `production` (or approved non-lab)                                          |
| `JWT_SECRET`         | **Policy ≥32** random chars; **runtime** refuses weak/default or **&lt;16** outside lab |
| `SECRETS_MASTER_KEY` | Explicit Fernet key (not only JWT-derived)                                  |
| Cookies              | Review `COOKIE_SAMESITE` / `COOKIE_SECURE` for SPA topology                 |
| Registration         | Off via prod/OIDC auto-policy; never force `ALLOW_PUBLIC_REGISTER=true`     |
| Demo users           | **Off** (`SEED_DEMO_USERS=false`; dual-gate with lab `ENV`)                 |
| Mongo                | Auth, TLS, backups, private network                                         |
| CORS                 | Exact production UI origins only                                            |
| Secrets              | Vault/KMS or orchestrator secrets; never bake into images                   |
| Workers              | Start with 1 uvicorn worker; scale using [MULTI_WORKER.md](MULTI_WORKER.md) |
| Observability        | Scrape `/metrics` with token; ship logs                                     |
| Backups              | Mongo volume + document restore drill                                       |
| HiTL                 | Review gates intact                                                         |

Also see root [SECURITY.md](../SECURITY.md) for reporting policy and a short control summary.

---

## 4. Kubernetes readiness

ACTIRA is **container-ready**. Packaging aids in-repo:

| Path | Status |
|------|--------|
| [deployments/helm/actira/](../deployments/helm/actira/) | **Helm chart scaffold** (`values.yaml`, `values-prod.yaml`, templates) — starting point, not a fully certified multi-cloud product |
| [deployments/kubernetes/](../deployments/kubernetes/) | Manifest helpers (if present) |
| [deployments/azure/](../deployments/azure/), [aws/](../deployments/aws/), [gcp/](../deployments/gcp/) | Cloud notes |
| Terraform | **Not** shipped as a full product module |

Minimum production packaging still needs:

- Deployments: api, (optional) worker
- Managed Mongo or equivalent with auth/TLS
- Secrets as K8s secrets / External Secrets Operator (never bake into images)
- Ingress with TLS
- PVC for LanceDB **or** disable dense store / use shared FS
- Security hardening items in [operations/SECURITY_HARDENING.md](operations/SECURITY_HARDENING.md) (non-root, probes, pinned tags, `SEED_DEMO_USERS=false`)

Treat full multi-replica certification as a customer packaging + [operations/HA_VALIDATION.md](operations/HA_VALIDATION.md) exercise.

---

## 5. Environment matrix

| Env        | Mongo                     | Seed     | Mock TI  | JWT weak        |
|------------|---------------------------|----------|----------|-----------------|
| dev/local  | local                     | optional | optional | warning         |
| test/CI    | ephemeral / none for unit | no       | forced   | fixed CI secret |
| staging    | managed                   | no       | no       | refused if weak (&lt;16 / denylist) |
| production | managed HA                | **no**   | no       | refused if weak (&lt;16 / denylist); **policy ≥32** |

---

## 6. Upgrade notes

1. Backup Mongo
2. Pull new image/tag
3. Run migrations if introduced (currently schema is flexible documents)
4. `POST /api/kb/reindex` after embedder dim changes
5. Invalidate sessions if `JWT_SECRET` rotated  
