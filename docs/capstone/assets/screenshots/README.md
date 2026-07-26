# Screenshots (report figures)

| File | Figure | Status |
|------|--------|--------|
| `01_login.png` … `12_architecture.png` | Report figures 1–12 | Live UI captures (light theme) |
| `13_audit.png` | Audit trail + inspect drawer | Optional pack — hash chain + action badges |
| `14_golden.png` | Golden benchmark / last-run history | Optional pack — eval gates + trend strip |

## How to capture live UI

1. Start stack (Compose or local API + `npm start`).
2. Prefer the automated path:

   ```bash
   python docs/capstone/capture_screenshots.py
   ```

   Captures `01`–`12` plus **`13_audit.png`** (opens row inspector when rows exist) and **`14_golden.png`** (admin `/benchmark`).
3. Manual fallback: walk `docs/DEMO_SCRIPT.md`, capture at 1280×720+, overwrite the same filenames.
4. Prefer: Login, Dashboard, Workspace, Playbook+citations, Review, Compliance (disclaimer + live signals), **Audit** (action badges + inspector), **Golden Eval** (history/trend if runs exist), Settings LLM.

Product checklist also: `samples/demo/SCREENSHOT_CHECKLIST.md`.
