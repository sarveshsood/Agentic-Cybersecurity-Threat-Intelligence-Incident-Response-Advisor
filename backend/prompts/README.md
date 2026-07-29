# ACTIRA prompt pack

System prompts for LLM stages, extracted from agent modules for governance review.

| Prompt | Module | Consumer |
|--------|--------|----------|
| Playbook | `playbook.py` | `backend/playbook_agent.py` |
| Investigator | `investigator.py` | `backend/ai_investigator.py` |
| RCA | `rca.py` | `backend/rca.py` |

Versioning policy: `docs/ai-governance/PROMPT_VERSIONING.md`  
Library index: `docs/ai-governance/PROMPT_LIBRARY.md`

```python
from backend.prompts import PLAYBOOK_SYSTEM_PROMPT, PROMPT_CATALOG
```
