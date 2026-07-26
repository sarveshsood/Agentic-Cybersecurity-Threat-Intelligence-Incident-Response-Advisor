# ACTIRA Enterprise Design System

Professional SOC / cybersecurity UI — comparable to Defender, Sentinel, Falcon, Kibana — **not** consumer AI chat UIs.

## Principles

- Professional, minimal, data-first, high readability
- One accent: enterprise blue `#2563EB` (no purple/pink/neon AI gradients)
- Severity colors reserved for risk; never decorative rainbow charts
- Light + dark + system themes via CSS variables
- WCAG AA focus rings, contrast, reduced-motion respect

## Architecture

| Layer            | Location                           | Role                                                    |
|------------------|------------------------------------|---------------------------------------------------------|
| JS tokens        | `src/design-system/tokens.js`      | Hex for charts/canvas; spacing, type, radius, elevation |
| Chart theme      | `src/design-system/chartTheme.js`  | `useChartTheme()` → Recharts palette                    |
| React primitives | `src/design-system/components.jsx` | PageHeader, Panel, KpiCard, Alert, states, forms        |
| Threat kit       | `src/design-system/threat.jsx`     | IoC, MITRE, CVE, Timeline, reputation                   |
| CSS variables    | `src/index.css`                    | Semantic shell + severity + buttons + tables            |
| Theme provider   | `src/lib/theme.jsx`                | light / dark / system                                   |
| Tailwind bridge  | `tailwind.config.js`               | Maps tokens → utility classes                           |
| shadcn UI        | `src/components/ui/*`              | Button, Badge, Dialog, Table, etc.                      |

```
ThemeProvider
  └─ data-theme + .dark | .light on <html>
       └─ CSS vars (--shell-*, --primary, --sev-*, …)
            └─ Tailwind (bg-primary, text-muted-foreground, …)
            └─ Component classes (.soc-card, .nav-item, .sev-critical, …)
```

## Color tokens

### Brand / neutrals (light)

| Token          | Hex       | Use                        |
|----------------|-----------|----------------------------|
| Primary        | `#2563EB` | Actions, links, active nav |
| Primary hover  | `#1D4ED8` | Pressed primary            |
| Navy / sidebar | `#0F172A` | Shell sidebar              |
| Background     | `#F8FAFC` | App canvas                 |
| Surface        | `#FFFFFF` | Cards                      |
| Border         | `#E2E8F0` | Dividers                   |
| Text primary   | `#0F172A` | Headings, body             |
| Text secondary | `#64748B` | Muted labels               |
| Muted          | `#94A3B8` | Captions                   |

### Semantic

| Token    | Hex       |
|----------|-----------|
| Success  | `#16A34A` |
| Warning  | `#D97706` |
| Error    | `#DC2626` |
| Critical | `#991B1B` |
| Info     | `#2563EB` |

### Severity (tables, badges, charts)

| Level         | Light     | Dark      |
|---------------|-----------|-----------|
| Critical      | `#991B1B` | `#F87171` |
| High          | `#EA580C` | `#FB923C` |
| Medium        | `#D97706` | `#FBBF24` |
| Low           | `#2563EB` | `#60A5FA` |
| Informational | `#64748B` | `#94A3B8` |

## Typography

- **Sans:** Inter / Segoe UI
- **Mono:** IBM Plex Mono (IoCs, scores, IDs)
- Scale: display 36 · heading 30 · h1 24 · h2 20 · h3 18 · body 16 · small 14 · caption 12
- Weights: 500 / 600 / 700 only

## Spacing & radius

- 8-point grid: 4, 8, 12, 16, 24, 32, 40, 48, 64
- Buttons / inputs: 8px
- Cards / dialogs: 12px
- No pill-shaped primary controls

## Components (design-system)

| Component                                    | Purpose                                    |
|----------------------------------------------|--------------------------------------------|
| `PageHeader`                                 | Page title, subtitle, actions, breadcrumb  |
| `Panel`                                      | Card with title / actions / body           |
| `KpiCard` / `MetricCard`                     | Dashboard KPI                              |
| `AlertBanner`                                | Info / success / warning / error           |
| `EmptyState` / `LoadingState` / `ErrorState` | List chrome                                |
| `RecommendationPanel`                        | AI output as SOC recommendation (not chat) |
| `DsButton`                                   | primary / secondary / ghost / danger       |
| `FormField`                                  | Label + control + error/hint               |
| `StatusDot`                                  | Live pipeline / health                     |
| `SkeletonBlock`                              | Loading skeleton                           |
| `SectionLabel`                               | Uppercase section label                    |
| `DataTable`                                  | Enterprise table shell                     |
| `IocCard`, `MitreChip`, `CveCard`            | Threat intel                               |
| `Timeline`, `TimelineEvent`                  | Incident timeline                          |
| `ReputationStrip`                            | Multi-source scores                        |
| `SeverityBadge`, `StatusPill`                | Lifecycle + severity                       |

shadcn: `Button`, `Badge`, `Input`, `Dialog`, `Tabs`, `Table`, …

## Theme usage

```jsx
import { useTheme } from "../lib/theme";
import { useChartTheme, KpiCard, colors } from "../design-system";

const { theme, resolvedTheme, setTheme, toggle } = useTheme();
const chart = useChartTheme(); // contentStyle, grid, severity, chart.blue, …
```

Prefer:

- `text-foreground` / `text-muted-foreground` over `text-slate-*`
- `bg-card` / `bg-muted` / `border-border` over hardcoded slate
- `var(--sev-*)` for severity
- `useChartTheme()` for Recharts fills/strokes

## Accessibility

- `:focus-visible` ring on interactive controls
- Semantic `role="alert"` / `status` on banners
- Sidebar `aria-label`, expanded/collapsed `aria-expanded`
- `prefers-reduced-motion` disables non-essential animation
- Icon-only buttons require `aria-label`

## Do / don’t

| Do                     | Don’t                           |
|------------------------|---------------------------------|
| One blue accent        | Purple / pink / cyan neon brand |
| Subtle elevation       | Glow shadows, scanlines         |
| Severity for risk only | Rainbow pie charts              |
| Tokenized colors       | Magic hex in JSX                |
| Professional AI panels | ChatGPT-style chat chrome       |

## Chart pages (token usage)

Prefer `const chart = useChartTheme()` then:

- `chart.grid` / `chart.tick` / `chart.contentStyle` for axes & tooltips
- `chart.severity` / `chart.status` for risk & lifecycle series
- `chart.chart.blue|green|amber|red|gray` for non-severity series

Hardcoded Recharts hex on Analytics / Knowledge / AttackTechniqueChart was removed in residual polish (2026-07-20).
Legacy accent names (`cyan`, `violet`) still map to primary for back-compat but new code should use `primary` / `info` /
`warning` / `error` / `success`.
