# Prompt Versioning

1. Change prompt text under `backend/prompts/*.py` (not only agent modules)
2. Note in CHANGELOG under `### AI`
3. Add/adjust golden or unit expectations
4. Optional: tag `prompt-playbook-vN` in commit message
5. Re-run golden benchmark before release

No separate prompt CMS in v1.0 — code review is the control. Agents re-export pack constants for compatibility.
