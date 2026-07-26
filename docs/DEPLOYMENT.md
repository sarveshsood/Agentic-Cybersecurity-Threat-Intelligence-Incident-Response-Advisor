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

# Backend
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env   # then edit JWT_SECRET, optional keys
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8001

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

| Control              | Action                                                                      |
|----------------------|-----------------------------------------------------------------------------|
| TLS                  | Terminate at reverse proxy (nginx, Caddy, ALB, App Gateway)                 |
| `ENV`                | `production`                                                                |
| `JWT_SECRET`         | Cryptographically strong, rotated, ≥32 chars                                |
| `SECRETS_MASTER_KEY` | Explicit Fernet key (not only JWT-derived)                                  |
| Demo users           | **Off**                                                                     |
| Mongo                | Auth, TLS, backups, private network                                         |
| CORS                 | Exact production UI origins only                                            |
| Secrets              | Vault/KMS or orchestrator secrets; never bake into images                   |
| Workers              | Start with 1 uvicorn worker; scale using [MULTI_WORKER.md](MULTI_WORKER.md) |
| Observability        | Scrape `/metrics` with token; ship logs                                     |
| Backups              | Mongo volume + document restore drill                                       |

---

## 4. Kubernetes readiness (not shipped)

ACTIRA is **container-ready** but does **not** ship Helm/Terraform. Minimal future chart would need:

- Deployments: api, (optional) worker
- StatefulSet/managed Mongo or Atlas connection
- Secrets as K8s secrets / External Secrets Operator
- Ingress with TLS
- PVC for LanceDB **or** disable dense store / use shared FS

Until then, treat K8s as a customer packaging exercise.

---

## 5. Environment matrix

| Env        | Mongo                     | Seed     | Mock TI  | JWT weak        |
|------------|---------------------------|----------|----------|-----------------|
| dev/local  | local                     | optional | optional | warning         |
| test/CI    | ephemeral / none for unit | no       | forced   | fixed CI secret |
| staging    | managed                   | no       | no       | refused if weak |
| production | managed HA                | **no**   | no       | refused if weak |

---

## 6. Upgrade notes

1. Backup Mongo
2. Pull new image/tag
3. Run migrations if introduced (currently schema is flexible documents)
4. `POST /api/kb/reindex` after embedder dim changes
5. Invalidate sessions if `JWT_SECRET` rotated  
