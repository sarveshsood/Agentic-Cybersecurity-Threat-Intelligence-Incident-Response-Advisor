# Agent / AI coding notes (ACTIRA)

When implementing **frontend UI**, tooltips are a **system prerequisite** — not a follow-up task.

## Tooltip prerequisite (do this by default)

1. Use design-system surfaces so tips auto-wire:
   - `PageHeader` → `tipTitle` + `tipBody` (or `tip={<HelpTip …/>}`)
   - `Panel` / `KpiCard` / `SectionLabel` → same
   - `PaneLabel title body how` for section titles
   - `DsButton tooltip="…"` or `<Tip content="…">` for actions/chips
2. Never leave entities, KPI scores, filters, or primary buttons without help.
3. Dev console warns: `[ACTIRA tooltip prerequisite] …` when tips are missing.
4. Full policy: `docs/dx/TOOLTIP_PREREQUISITE.md`
5. Code: `frontend/src/lib/tooltipPrerequisite.js`, `frontend/src/components/HelpTip.jsx`

## Other defaults

- Prefer modular backend services/repos over growing `server.py`
- No secrets in logs; HiTL gates stay intact
- Update OpenAPI when API shapes change
- Roadmap seeds live in `backend/roadmap_data.py` + `ROADMAP.md`
