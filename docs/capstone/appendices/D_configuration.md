# Appendix D — Configuration (sanitized)

**Location:** `docs/capstone/appendices/D_configuration.md`  
**Do not commit real secrets.** Values below are templates only.

---

## D.1 Config files

| File | Purpose |
|------|---------|
| `backend/.env` | Local secrets & bootstrap (**never commit**) |
| `backend/.env.example` | Documented template in product repo |
| `frontend/.env` | `REACT_APP_BACKEND_URL` |
| Admin → Settings UI | Runtime ops + encrypted vault |

**Secret resolution:** Mongo settings (decrypted) → process environment / `.env`.

---

## D.2 Infrastructure (required)

| Variable | Example | Notes |
|----------|---------|-------|
| `MONGO_URL` | `mongodb://localhost:27017` | Compose: `mongodb://mongodb:27017` |
| `DB_NAME` | `soc_console` | Lab may use test DB names |
| `CORS_ORIGINS` | `http://localhost:3000` | Exact browser origins |
| `JWT_SECRET` | ≥32 random chars | Weak refused when `ENV` not lab |
| `ENV` | `dev` / `test` / `production` | Affects seed, JWT checks |

---

## D.3 Auth & session

| Variable | Notes |
|----------|-------|
| `SESSION_TIMEOUT_HOURS` | JWT lifetime |
| `FAILED_LOGIN_LOCKOUT` | Lock after N failures |
| `SEED_DEMO_USERS` | Lab only dual-gate |
| `ALLOW_PUBLIC_REGISTER` | Lab default; disabled in prod/OIDC |
| `OIDC_*` | Optional SSO scaffold (JWKS hardening still roadmap) |

---

## D.4 LLM (optional for peak quality)

| Variable | Notes |
|----------|-------|
| `LLM_PROVIDER` | `anthropic` \| `openai` \| `gemini` \| `groq` \| … |
| `LLM_MODEL` | Provider model id |
| `LLM_TEMPERATURE` | e.g. `0.35` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` | Or Settings vault |
| Cross-provider fallback | Configured via Settings / catalog |

Without keys, pipeline uses **template** playbooks (golden CI path).

---

## D.5 Threat intelligence

Empty keys → **mock enrichment**.  
`FORCE_MOCK_TI=true` forces mocks (CI).

Optional keys (vault or env): `ABUSEIPDB_API_KEY`, `VIRUSTOTAL_API_KEY`, `GREYNOISE_API_KEY`, `THREATFOX_API_KEY`, `OTX_API_KEY`, `SHODAN_API_KEY`, …

---

## D.6 Pipeline / HiTL

| Variable | Meaning |
|----------|---------|
| `GROUNDING_THRESHOLD` | Below → HiTL |
| `HITL_SEVERITY_MIN` | At/above severity → always HiTL |
| `AUTO_APPROVE_GROUNDING_MIN` | Never bypasses severity gate |
| `CORRELATION_WINDOW_MINUTES` | Correlation window |

---

## D.7 Frontend honesty

| Variable | Meaning |
|----------|---------|
| `REACT_APP_BACKEND_URL` | API base |
| `REACT_APP_DASHBOARD_DEMO_FALLBACK` | **Omit / false** for live KPIs; set `true` only for empty-DB demo fill |

---

## D.8 Minimal lab `.env` skeleton (sanitized)

```env
ENV=dev
MONGO_URL=mongodb://localhost:27017
DB_NAME=soc_console
JWT_SECRET=replace-with-32-plus-char-random-string
CORS_ORIGINS=http://localhost:3000
FORCE_MOCK_TI=true
# LLM_* and TI keys optional
```

```env
# frontend/.env
REACT_APP_BACKEND_URL=http://localhost:8001
# REACT_APP_DASHBOARD_DEMO_FALLBACK not set = live data
```
