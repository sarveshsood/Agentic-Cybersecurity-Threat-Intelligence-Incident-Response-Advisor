# Tooltip prerequisite (mandatory UX baseline)

Tooltips and HelpTips are a **product prerequisite** in ACTIRA — not optional polish.
Every new surface must ship with help so analysts understand metrics, filters, and actions
without leaving the page.

## Why

- Dense SOC UI is unusable without “what is this / how calculated”
- Entities, KPIs, and gates (HiTL, grounding) need discoverable explanations
- AI agents and humans both skip tips unless the **design system requires them**

## Rule (DoD)

| Surface | Required help | How |
|---------|---------------|-----|
| **Page** (`PageHeader`) | HelpTip | `tip=` **or** `tipTitle` + `tipBody` |
| **Panel / card title** | HelpTip | `tip=` **or** `tipTitle` + `tipBody` |
| **KPI / metric** (`KpiCard`) | HelpTip | `tip=` **or** `tipTitle` + `tipBody` (+ `how` when scored) |
| **Section / pane label** | HelpTip via `PaneLabel` / `SectionLabel` | `title` + `body` |
| **Interactive control** (button, chip, icon) | `Tip` | short verb phrase |
| **Table headers / entity chips** | `Tip` or dotted header + tip | value meaning |
| **SVG graph nodes** | native `<title>` | portals cannot wrap `<g>` |

**Definition of done for UI PRs:** no new pane, KPI, or primary action without tip content.
Reviewers reject “I’ll add tooltips later.”

## Default implementation (design system)

Imports:

```jsx
import {
  PageHeader, Panel, KpiCard, DsButton, SectionLabel,
  HelpTip, Tip, PaneLabel, ActionTip,
} from "../design-system";
// or: import { HelpTip, Tip, PaneLabel } from "../components/HelpTip";
```

### Auto-wired HelpTip (preferred)

```jsx
<PageHeader
  title="Incidents"
  tipTitle="Incidents"
  tipBody="Triage queue for pipeline cases. Filter by status, severity, technique, threat."
  how="GET /incidents · server pagination when no free-text search."
/>

<KpiCard
  label="Threat"
  value={score}
  tipTitle="Threat score"
  tipBody="Composite risk 0–100 from severity, IoCs, and techniques."
  how="Pipeline threat_score field."
/>

<PaneLabel title="Entities" body="Correlated hosts, users, IPs… Click to filter timeline.">
  Entities
</PaneLabel>
```

### Explicit tip node (still valid)

```jsx
<PageHeader
  title="Compliance"
  tip={<HelpTip title="…" body="…" how="…" testid="tip-compliance-page" />}
/>
```

### Actions

```jsx
<DsButton tooltip="Reload incident from server" onClick={load}>Refresh</DsButton>

<ActionTip content="Copy full incident ID">
  <button type="button" onClick={…}>…</button>
</ActionTip>

<Tip content="Critical severity — page immediately">
  <span className="…">critical</span>
</Tip>
```

## Dev warnings

In development, missing tips log once per surface:

```text
[ACTIRA tooltip prerequisite] PageHeader "Incidents" is missing help. …
```

Policy module: `frontend/src/lib/tooltipPrerequisite.js`  
Opt out only when decorative: `requireTip={false}` / `requireTooltip={false}`.

## What not to do

- Do **not** rely only on native `title=` for HTML controls (inconsistent; use `Tip`)
- Do **not** nest extra `TooltipProvider` (root provider is in `App.js`)
- Do **not** wrap dense cards in both `Tip` and `HelpTip` on the same hover target
- Do **not** gate **action** tips on `show_help_tips` (only rich HelpTip honors that pref)

## Checklist for new UI

- [ ] Page has `PageHeader` tipTitle/tipBody or `tip=`
- [ ] Each major pane uses `PaneLabel` / `SectionLabel` / `Panel` tip props
- [ ] KPIs pass tip + optional `how` for scores
- [ ] Buttons / chips / entity rows use `Tip` or `DsButton tooltip=`
- [ ] Workspace tabs already ship with tips via `WorkspaceTabs`
- [ ] Manual hover pass on the page before merge

## Related

- Components: `frontend/src/components/HelpTip.jsx`
- Design system: `frontend/src/design-system/components.jsx`
- Coding standards: [CODING_STANDARDS.md](CODING_STANDARDS.md)
- Review: [CODE_REVIEW_CHECKLIST.md](CODE_REVIEW_CHECKLIST.md)
