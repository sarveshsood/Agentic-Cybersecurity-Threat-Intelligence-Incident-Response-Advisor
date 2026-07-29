# Development Environment Guide

Version: 2.0

This document describes the supported development environment, installation, verification, troubleshooting, and recommended tooling for the ACTIRA Enterprise SOC Platform.

---

# Supported Platforms

| Platform | Status |
|-----------|--------|
| Windows 11 | ✅ Recommended |
| macOS | ✅ Supported |
| Ubuntu 22.04+ | ✅ Recommended |
| WSL2 | ✅ Supported |
| Docker Desktop | ✅ Recommended |

---

# System Requirements

## Required

| Tool | Version |
|------|---------|
| Python | 3.12.x Recommended (3.11+) |
| Node.js | 20 LTS Recommended (18+) |
| npm | 10+ |
| Git | 2.40+ |
| MongoDB | 7.x |
| Docker Desktop | Latest Stable |
| Docker Compose | v2 |

---

# Recommended Tools

## IDE

- Visual Studio Code
- PyCharm Professional

## Python

- Ruff
- Black
- isort
- mypy
- pytest

## JavaScript

- ESLint
- Prettier
- React Developer Tools

## Database

- MongoDB Compass

## API

- Postman
- Bruno
- Swagger UI

---

# Clone Repository

```bash
git clone <repository-url>

cd soc-playbook-ai-v2
```

---

# Create Virtual Environment

## Windows

```powershell
python -m venv .venv

.\.venv\Scripts\Activate.ps1
```

## Linux / macOS

```bash
python3 -m venv .venv

source .venv/bin/activate
```

---

# Install Python Dependencies

```bash
pip install --upgrade pip

pip install \
-r backend/requirements.txt \
-r requirements-test.txt
```

---

# Install Frontend

```bash
cd frontend

npm install

cd ..
```

---

# Configure Environment

Copy

```text
backend/.env.example
```

to

```text
backend/.env
```

Minimum configuration

```
JWT_SECRET=<LongRandomSecret>

MONGO_URL=<MongoConnection>

LLM Provider Keys

Environment Variables
```

Never commit

```
.env
```

---

# Database

## Local Mongo

```
mongodb://localhost:27017
```

Recommended database

```
actira
```

---

## Docker Mongo

```bash
docker compose up -d mongo
```

Verify

```bash
docker ps
```

---

# Docker Setup

Start all services

```bash
docker compose up -d
```

View logs

```bash
docker compose logs
```

Backend

```bash
docker compose logs backend
```

Frontend

```bash
docker compose logs frontend
```

Mongo

```bash
docker compose logs mongo
```

---

# IDE Configuration

## Visual Studio Code

Open

```
Repository Root
```

Python Interpreter

```
.venv
```

Recommended Extensions

- Python
- Pylance
- Ruff
- ESLint
- Docker
- GitLens
- Thunder Client
- Error Lens

---

## PyCharm

Project

```
Repository Root
```

Interpreter

```
.venv
```

Working Directory

```
Repository Root
```

Run Configuration

Module

```
uvicorn
```

Arguments

```
backend.server:app

--reload

--host 0.0.0.0

--port 8001
```

Environment

```
PYTHONPATH=<Repository Root>
```

---

# Start Backend

```bash
python -m uvicorn backend.server:app \
--reload \
--host 0.0.0.0 \
--port 8001
```

---

# Start Frontend

```bash
cd frontend

npm start
```

---

# Verify Installation

Backend

```bash
curl http://127.0.0.1:8001/api/health
```

Expected

```
Healthy
```

Frontend

```
http://localhost:3000
```

Login

```
Analyst Demo Account
```

---

# Run Tests

Backend

```bash
cd backend

pytest tests -q
```

Security

```bash
pytest tests/test_hardening.py -q -n 0
```

Frontend

```bash
npm test
```

---

# Linting

Python

```bash
ruff check .

black --check .

isort --check-only .
```

Type Checking

```bash
mypy backend
```

Frontend

```bash
npm run lint
```

---

# OpenAPI

After changing APIs

```bash
python backend/scripts/export_openapi.py
```

Verify

```
openapi.json
```

updated successfully.

---

# Development Workflow

1. Create feature branch
2. Implement changes
3. Run linting
4. Run tests
5. Update documentation
6. Verify UI
7. Submit Pull Request

---

# Recommended VS Code Extensions

- Python
- Pylance
- Ruff
- ESLint
- Docker
- GitLens
- Thunder Client
- MongoDB
- Markdown All in One

---

# Recommended Browser Extensions

- React Developer Tools
- Redux DevTools (if applicable)

---

# Troubleshooting

## Backend Fails to Start

Verify

- Python version
- Virtual environment
- MongoDB
- .env
- Dependencies

---

## Import Errors

Ensure

```
Repository Root
```

is the working directory.

Never launch

```
backend/server.py
```

directly.

Always use

```bash
python -m uvicorn backend.server:app
```

---

## Frontend Cannot Reach Backend

Check

```
REACT_APP_BACKEND_URL
```

Verify

```
http://localhost:8001
```

Confirm

```
/api/health
```

returns HTTP 200.

---

## Mongo Errors

Verify

- Mongo running
- Connection string
- Firewall
- Credentials
- Database permissions

---

## AI Provider Errors

Verify

- API key
- Model name
- Quota
- Network access

---

## Docker Issues

```bash
docker compose ps

docker compose logs

docker system prune
```

---

# Performance Tips

- Use Python 3.12
- Enable Ruff
- Enable ESLint
- Keep Docker images updated
- Restart Mongo periodically during heavy development
- Use React DevTools Profiler for UI performance

---

# Security Checklist

Never commit

- .env
- Secrets
- API keys
- JWTs
- Tokens
- Production credentials

Always

- Use strong JWT secrets
- Rotate development secrets periodically
- Keep dependencies updated

---

# First-Day Verification Checklist

A new developer should be productive within 30 minutes.

Verify:

- [ ] Repository cloned
- [ ] Virtual environment created
- [ ] Dependencies installed
- [ ] Frontend dependencies installed
- [ ] `.env` configured
- [ ] MongoDB running
- [ ] Backend starts successfully
- [ ] Frontend starts successfully
- [ ] Login works
- [ ] `/api/health` returns HTTP 200
- [ ] Unit tests pass
- [ ] Security tests pass
- [ ] Linting passes
- [ ] OpenAPI generation succeeds
- [ ] IDE configured
- [ ] Git hooks (if configured) installed

---

# Definition of Ready

A development environment is considered ready when:

- Backend starts without errors
- Frontend connects to backend
- MongoDB is reachable
- Health endpoint reports healthy
- AI providers (or mock providers) are configured
- Tests pass
- Linting passes
- OpenAPI can be generated
- No startup warnings remain
- Developer can complete the sample workflow end-to-end