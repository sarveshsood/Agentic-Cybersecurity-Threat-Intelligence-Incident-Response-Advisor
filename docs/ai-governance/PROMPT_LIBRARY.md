# Prompt Library

Canonical prompts live in code (single source of truth):

| Prompt           | Location                                    |
|------------------|---------------------------------------------|
| Playbook system  | `backend/playbook_agent.py` `SYSTEM_PROMPT` |
| Investigator     | `backend/ai_investigator.py`                |
| Roadmap task gen | `server.py` / roadmap handlers              |

**Rule:** Do not fork prompts in docs without linking to code. When changing prompts, bump version note in
PROMPT_VERSIONING and add golden cases if behavior shifts.
