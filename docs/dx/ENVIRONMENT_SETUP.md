# Development Environment Setup

## Required

| Tool    | Version                  |
|---------|--------------------------|
| Python  | 3.12 recommended (3.11+) |
| Node.js | 18+                      |
| Git     | 2.40+                    |
| MongoDB | 7 (Docker OK)            |

## Recommended

- Docker Desktop / Compose
- VS Code or PyCharm
- Make (or run Makefile targets manually on Windows)
- `ruff`, `mypy`, `pytest` via `requirements-test.txt`

## One-time setup

```bash
git clone <repo> && cd soc-playbook-ai-v2
python -m venv .venv
# Windows: .\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt -r requirements-test.txt
cd frontend && npm install && cd ..
cp backend/.env.example backend/.env   # Windows: Copy-Item
# Set JWT_SECRET to a long random string
```

## IDE

- Open repo root
- Python interpreter → `.venv`
- Frontend ESLint via `frontend/package.json`

## Verify (30 minutes to productive)

```bash
./scripts/start-demo.sh          # or start-demo.ps1
curl http://127.0.0.1:8001/api/health
# open http://localhost:3000 — login analyst demo
cd backend && pytest tests/test_hardening.py -q -n 0
```
