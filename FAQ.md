# ACTIRA — FAQ

### What is ACTIRA?

An AI-assisted SOC console that turns logs into MITRE-aligned incidents and citation-grounded response playbooks with
human review for critical cases.

### Is this a SIEM or EDR?

No. It **assists** investigation and IR. Detection coverage remains with your SIEM/EDR/XDR.

### Do I need live API keys?

No for pipeline structure and mock TI. **Yes** for high-quality live LLM playbooks. TI keys optional (mock otherwise).

### Why is there no ChromaDB?

Hybrid RAG already uses **LanceDB + BM25**. A second vector DB would add ops cost without clear benefit at current
scale. See `docs/ARCHITECTURE.md`.

### Where are secrets stored?

Runtime: Mongo settings (optionally Fernet-encrypted) and/or `backend/.env`. GET `/api/settings` returns only `has_*`
booleans for secrets.

### Why did the UI break with “network error”?

Usually the **backend is not running** on port 8001. Check `GET /api/health`.

### Can I use this in production?

**Single-tenant pilot:** possible with hardening in `SECURITY.md` and `docs/DEPLOYMENT.md`.  
**Multi-tenant enterprise SOC:** not ready (no SSO/tenancy/HA packaging).

### Which LLM is default?

Configurable; bootstrap often `anthropic` / `claude-sonnet-4-6`. Switch in Admin → Settings.

### How do I run tests?

```bash
cd backend && pytest tests -n 0 -m "not integration and not e2e"
# or from root: make unit
```

### Who can approve playbooks?

Role `senior_reviewer` or `admin` (see RBAC matrix tests).
