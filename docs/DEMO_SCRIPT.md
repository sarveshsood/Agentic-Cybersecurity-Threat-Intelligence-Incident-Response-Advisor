# ACTIRA — Executive Demo Script (15–20 minutes)

## Setup (before the room)

1. Mongo running; backend on **8001**; frontend on **3000**
2. `GET /api/health` → `ok` / `mongo: up`
3. LLM key configured (Settings or Mongo) for live playbook wow-moment
4. Browser zoom 110%; dark theme

**Demo accounts** (lab seed only):

| Role     | Email                    | Password     |
|----------|--------------------------|--------------|
| Analyst  | analyst@soc.example.com  | Analyst123!  |
| Reviewer | reviewer@soc.example.com | Reviewer123! |
| Admin    | admin@soc.example.com    | Admin123!    |

---

## Script

### 1. Frame the problem (1 min)

> “SOC analysts still paste logs into chatbots. ACTIRA turns multi-source logs into a MITRE-aligned incident, enriches
> IoCs, and drafts a citation-grounded playbook — with a mandatory human gate for critical work.”

### 2. Login as analyst (1 min)

- Open login → click analyst demo card
- Point out RBAC (no admin settings)

### 3. Ingest sample (3 min)

- **Ingest Logs** → **Try sample: SSH brute force + Log4Shell**
- Narrate phases: parsing → extracting → enriching → correlating → generating
- Open the incident

### 4. Incident detail (4 min)

Show:

- Severity + status
- IoCs with threat scores (mock or live TI)
- ATT&CK techniques
- Correlation panel if multi-file
- Playbook phases + **citation chips** (open a chip → KB snippet)
- Grounding score

### 5. AI investigator (2 min)

- Ask: “What should we contain first?”
- Emphasize answers stay incident-scoped

### 6. HiTL as reviewer (3 min)

- Logout → login **reviewer**
- **Review Queue** → open critical → Approve (or Edit-and-approve)
- Mention race-safe 409 and audit trail

### 7. Admin controls (2 min)

- Login **admin**
- Settings: provider switch, HiTL threshold, `has_*` secrets (never raw dump)
- Optional: Knowledge search, vector status, golden benchmark

### 8. Close (1 min)

> “Modular monolith, offline golden CI, secret vault, hybrid RAG — designed for demos and single-tenant pilots, not a
> full SIEM replacement. Roadmap: deeper connectors, SSO, modular API package, production HA.”

---

## 5-minute cut (video)

Use the same flow compressed: problem (0:30) → ingest sample (1:00) → workspace citations/grounding (1:15) → HiTL approve (0:45) → **one honesty surface** (Hunt banner *or* Compliance assumed-vs-verified) (0:40) → close non-claims (0:30).  
Full shot list: keep total ≤ 5:00. **Only remaining submission artifact is this recording** (student-owned). Product honesty: `docs/product/PRODUCT_HONESTY.md`.

---

## Failure fallbacks

| If…             | Do…                                                     |
|-----------------|---------------------------------------------------------|
| LLM key missing | Show fallback/template playbook + Settings empty key UX |
| TI keys empty   | “Mock enrichment for offline demos — same pipeline”     |
| Backend down    | Health check; restart uvicorn (common demo fail)        |

---

## Sample talking points (differentiation)

- **Grounding + HiTL** vs raw ChatGPT paste
- **Multi-format parsers + ZIP packages** vs single syslog toy
- **Open architecture** (MIT license) for capstone/extension
- **Eval harness** (golden) for trustworthy releases  
