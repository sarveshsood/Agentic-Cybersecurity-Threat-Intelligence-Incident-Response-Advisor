# ACTIRA — Installation

## Prerequisites

| Tool        | Version                           |
|-------------|-----------------------------------|
| Python      | 3.11+ (3.12 recommended)          |
| Node.js     | 18+                               |
| npm or yarn | current                           |
| MongoDB     | 7.x (Docker image `mongo:7` fine) |
| Git         | any recent                        |

Optional: Docker Desktop / Compose for one-shot infra.

## 1. Clone

```bash
git clone <your-fork-or-url> soc-playbook-ai-v2
cd soc-playbook-ai-v2
```

## 2. MongoDB

```bash
docker compose up -d mongodb
# verify port 27017 listening
```

## 3. Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env: set JWT_SECRET (long random), optional LLM keys
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

## 4. Frontend

```bash
cd frontend
npm install
# Create frontend/.env if missing:
# REACT_APP_BACKEND_URL=http://localhost:8001
npm start
```

## 5. Verify

```bash
curl http://127.0.0.1:8001/api/health
# open http://localhost:3000
```

## Full stack via Compose

```bash
# Requires backend/.env
docker compose up -d --build
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for production hardening.
