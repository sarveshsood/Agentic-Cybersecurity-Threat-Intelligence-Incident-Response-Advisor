# ACTIRA — Quickstart (30 minutes)

1. Start Mongo: `docker compose up -d mongodb`
2. Backend: `cd backend && pip install -r requirements.txt && copy .env.example .env` → set `JWT_SECRET` →  
   `python -m uvicorn server:app --host 0.0.0.0 --port 8001`
3. Frontend: `cd frontend && npm install && npm start`
4. Open http://localhost:3000 → login **analyst@soc.example.com** / **Analyst123!**
5. **Ingest Logs** → sample SSH + Log4Shell → open incident
6. Logout → **reviewer@soc.example.com** / **Reviewer123!** → Review Queue → Approve

Full narrative: [DEMO_SCRIPT.md](DEMO_SCRIPT.md).  
Config keys: [CONFIGURATION.md](CONFIGURATION.md).
