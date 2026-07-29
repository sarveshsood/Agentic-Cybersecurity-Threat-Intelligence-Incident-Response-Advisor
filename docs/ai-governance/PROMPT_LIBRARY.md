# Prompt Library

Canonical prompts live in the **prompt pack** (single source of truth):

| Prompt           | Location                                      | Consumer |
|------------------|-----------------------------------------------|----------|
| Playbook system  | `backend/prompts/playbook.py`                 | `playbook_agent.py` (re-exports `SYSTEM_PROMPT`) |
| Investigator     | `backend/prompts/investigator.py`             | `ai_investigator.py` |
| RCA              | `backend/prompts/rca.py`                      | `rca.py` |
| Catalog          | `backend/prompts/__init__.py` → `PROMPT_CATALOG` | Ops / governance |
| Pack README      | `backend/prompts/README.md`                   | |

**Rule:** Do not fork prompts in docs without linking to code. When changing prompts, bump version note in
PROMPT_VERSIONING and add golden cases if behavior shifts.
