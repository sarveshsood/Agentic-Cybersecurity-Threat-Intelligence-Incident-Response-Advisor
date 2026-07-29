# Local Development Guide

Version: 2.0

This guide describes the recommended local development workflow for the ACTIRA Enterprise SOC Platform.

---

# Objectives

The local development environment should:

- Start within a few minutes
- Support rapid iteration
- Provide hot reload
- Be identical across developers
- Minimize setup friction
- Mirror production architecture where practical
- Support Windows, macOS, Linux, and WSL2

---

# Recommended Workflow

## One Command Startup (Preferred)

### Windows

```powershell
.\scripts\start-demo.ps1 -SkipDocker
```

### Linux / macOS

```bash
./scripts/start-demo.sh --skip-docker
```

This command should:

- Validate prerequisites
- Activate the virtual environment
- Start the backend
- Start the frontend
- Verify MongoDB connectivity
- Seed demo data (if enabled)
- Display health status
- Print useful URLs

---

# Manual Development

## Terminal A — Backend API

Always start from the **repository root**.

### Linux / macOS

```bash
export PYTHONPATH=.

python -m uvicorn backend.server:app \
    --reload \
    --host 0.0.0.0 \
    --port 8001
```

### Windows PowerShell

```powershell
$env:PYTHONPATH = (Get-Location).Path

python -m uvicorn backend.server:app `
    --reload `
    --host 0.0.0.0 `
    --port 8001
```

---

## IMPORTANT

Do **NOT** run

```bash
cd backend

uvicorn server:app
```

Application modules use

```python
from backend.*
```

absolute imports.

Launching from `backend/` will break imports.

Always launch from

```
Repository Root
```

---

## Terminal B — Frontend

```bash
cd frontend

npm start
```

Development server

```
http://localhost:3000
```

Backend

```
http://localhost:8001
```

---

# MongoDB

## Docker (Recommended)

```bash
docker compose up -d mongodb
```

Verify

```bash
docker compose ps
```

Expected

```
mongodb
```

should be running.

---

# Hot Reload

## Backend

Uses

```
uvicorn --reload
```

Changes are automatically reloaded.

---

## Frontend

Uses

- React Fast Refresh
- Webpack Hot Module Replacement

Most UI changes refresh automatically.

---

# Environment Configuration

## Backend

```
backend/.env
```

Never commit.

Required

```
JWT_SECRET

MONGO_URL

LLM Provider Keys

Application Settings
```

---

## Frontend

```
frontend/.env
```

Typical configuration

```text
REACT_APP_BACKEND_URL=http://localhost:8001
```

Never commit production URLs.

---

# Development Profiles

Recommended profiles

## Local

- Local Mongo
- Local Backend
- Local Frontend

---

## Docker

Everything inside Docker.

Useful for

- Integration testing
- Deployment verification

---

## Hybrid

- Local Backend
- Local Frontend
- Docker Mongo

Recommended for everyday development.

---

# Useful Commands

## Backend

Run tests

```bash
pytest
```

Run specific tests

```bash
pytest backend/tests/test_hardening.py
```

Export OpenAPI

```bash
python backend/scripts/export_openapi.py
```

---

## Frontend

Lint

```bash
npm run lint
```

Tests

```bash
npm test
```

Production build

```bash
npm run build
```

---

# Make Targets

```bash
make unit

make lint

make golden

make openapi

make ci-fast
```

Recommended development sequence

```bash
make lint

make unit

make ci-fast
```

before opening a Pull Request.

---

# Feature Flags

Current feature toggles

```
FORCE_MOCK_TI

ACTIRA_VECTOR_STORE

ACTIRA_EMBEDDING_BACKEND

SEED_DEMO_USERS
```

Use

- Settings Profiles
- Environment Variables

Document every new toggle in

```
CONFIGURATION.md
```

Future roadmap

- Central Feature Flag Service
- Runtime Feature Management

---

# Recommended Development Workflow

1. Update main

```bash
git checkout main

git pull
```

2. Create feature branch

```bash
git checkout -b feat/my-feature
```

3. Start development environment

4. Implement feature

5. Run local validation

```bash
make ci-fast
```

6. Run targeted tests

7. Update documentation

8. Commit changes

9. Push branch

10. Open Pull Request

---

# Health Verification

Backend

```bash
curl http://localhost:8001/api/health
```

Expected

```
HTTP 200
```

Frontend

```
http://localhost:3000
```

Verify

- Login
- Dashboard
- API communication
- Theme loading
- Tooltips
- Analytics
- AI Investigator

---

# Debugging Tips

Backend logs

```bash
python -m uvicorn backend.server:app --reload --log-level debug
```

Frontend

- Browser Console
- Network Tab
- React Developer Tools

Mongo

```bash
docker compose logs mongodb
```

---

# Performance Tips

- Keep Mongo running in Docker.
- Use backend hot reload instead of restarting manually.
- Restart the frontend only when dependencies change.
- Avoid rebuilding Docker images during normal development.
- Use React Profiler for UI performance analysis.

---

# Common Issues

## Import Errors

Cause

Running from

```
backend/
```

Solution

Launch from

```
Repository Root
```

using

```bash
python -m uvicorn backend.server:app
```

---

## Backend Cannot Reach Mongo

Verify

- Mongo container running
- `MONGO_URL`
- Network connectivity

---

## Frontend Cannot Reach Backend

Verify

```
REACT_APP_BACKEND_URL
```

Verify backend health

```bash
curl http://localhost:8001/api/health
```

---

## AI Provider Errors

Verify

- API keys
- Model configuration
- Network access
- Provider quotas

Use

```
FORCE_MOCK_TI=true
```

for offline development where appropriate.

---

# Best Practices

Always

- Work from the repository root.
- Use the virtual environment.
- Keep dependencies updated.
- Run linting before committing.
- Run tests before pushing.
- Update documentation when behavior changes.
- Use feature flags for experimental functionality.

Never

- Commit `.env`
- Commit secrets
- Commit customer data
- Commit real production logs
- Disable authentication for convenience
- Hardcode local paths

---

# Definition of Ready

A local environment is considered ready when:

- [ ] Backend starts successfully
- [ ] Frontend starts successfully
- [ ] MongoDB is running
- [ ] `/api/health` returns HTTP 200
- [ ] Login succeeds
- [ ] Dashboard loads
- [ ] Analytics load correctly
- [ ] AI Investigator is accessible
- [ ] Tests pass
- [ ] Linting passes
- [ ] OpenAPI exports successfully
- [ ] Hot reload works
- [ ] Feature flags behave as expected
- [ ] No startup errors or warnings remain