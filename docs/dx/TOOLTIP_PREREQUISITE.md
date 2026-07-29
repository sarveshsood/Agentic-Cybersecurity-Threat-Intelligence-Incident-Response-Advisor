# Tooltip Prerequisite

Version: 2.0

## Status

**Mandatory Engineering Standard**

This document defines the mandatory tooltip and contextual help requirements for every user interface within the ACTIRA Enterprise SOC Platform.

Tooltips are **not optional UX enhancements**.

They are considered a **core product requirement** and are part of the Definition of Done (DoD).

A Pull Request introducing new UI without the required contextual help **must not be approved**.

---

# Why This Exists

ACTIRA is an enterprise Security Operations Center (SOC) platform used by analysts working with:

- Security Incidents
- Alerts
- MITRE ATT&CK
- Threat Intelligence
- AI Investigations
- Risk Scores
- Analytics
- Compliance
- Human Review

These workflows are information-dense.

Users should never have to leave the page to understand:

- What a metric means
- How a score is calculated
- Why an action exists
- What a filter does
- What a status means
- What AI produced
- Why a recommendation was generated

Every major UI element should provide discoverable contextual guidance.

---

# Product Principles

Tooltips should:

- Reduce analyst training time
- Improve discoverability
- Explain business terminology
- Explain calculations
- Explain AI reasoning
- Explain security concepts
- Reduce documentation lookups
- Improve accessibility
- Improve first-time user experience

---

# Engineering Rule

Every new UI surface must include contextual help.

No exceptions unless explicitly marked decorative.

---

# Mandatory Coverage

| Surface | Required Help | Implementation |
|----------|---------------|----------------|
| Page Header | HelpTip | `tip=` or `tipTitle` + `tipBody` |
| Dashboard Header | HelpTip | `PageHeader` |
| Panel | HelpTip | `Panel tip=` or `tipTitle` |
| Card | HelpTip | `tipTitle` + `tipBody` |
| KPI Card | HelpTip | `tipTitle`, `tipBody`, optional `how` |
| Chart | HelpTip | Explain chart, calculation, interaction |
| Table | HelpTip | Purpose and usage |
| Table Header | Tip | Meaning of the column |
| Entity Chip | Tip | Entity description |
| Status Badge | Tip | Meaning of status |
| Severity Badge | Tip | Severity explanation |
| Filters | Tip | Filtering behavior |
| Search Box | Tip | Search scope |
| Tabs | HelpTip | Purpose of each tab |
| Sub-tabs | HelpTip | Purpose |
| Timeline | HelpTip | Timeline explanation |
| Investigation Graph | HelpTip | Node relationships |
| AI Output | HelpTip | Confidence, grounding, citations |
| Drawer | HelpTip | Usage |
| Modal | HelpTip | Purpose |
| Form | HelpTip | Field guidance where needed |
| Primary Button | Tip | Action description |
| Icon Button | Tip | Required |
| Chips | Tip | Meaning |
| Menu Actions | Tip | Verb phrase |
| SVG Graph Nodes | Native `<title>` | Required |

---

# Definition of Done

A UI feature is **not complete** unless:

- Every page includes contextual help.
- Every KPI explains itself.
- Every score explains how it is calculated.
- Every major panel explains its purpose.
- Every important action explains what it does.
- Every chart explains what it represents.
- Every filter explains its effect.
- Every AI output explains why it exists.
- Every status badge explains its meaning.

Reviewers must reject PRs that postpone tooltip implementation.

---

# Design System Components

Preferred imports

```jsx
import {
    PageHeader,
    Panel,
    KpiCard,
    DsButton,
    SectionLabel,
    PaneLabel,
    HelpTip,
    Tip,
    ActionTip,
} from "../design-system";
```

Alternative

```jsx
import {
    HelpTip,
    Tip,
    PaneLabel,
} from "../components/HelpTip";
```

---

# Preferred Implementation

## Page Header

```jsx
<PageHeader
    title="Incidents"
    tipTitle="Incidents"
    tipBody="Displays incidents produced by the correlation pipeline. Use filters to narrow results."
    how="Retrieved from GET /incidents using server-side pagination."
/>
```

---

## Panel

```jsx
<Panel
    title="Threat Intelligence"
    tipTitle="Threat Intelligence"
    tipBody="Shows external enrichment from supported intelligence providers."
>
```

---

## KPI

```jsx
<KpiCard
    label="Threat Score"
    value={score}
    tipTitle="Threat Score"
    tipBody="Composite score derived from severity, confidence, IoCs, MITRE ATT&CK techniques, and enrichment."
    how="Calculated during pipeline analysis."
/>
```

---

## Section Label

```jsx
<PaneLabel
    title="Entities"
    body="Hosts, users, IPs, processes, and domains correlated to the incident."
>
    Entities
</PaneLabel>
```

---

## Explicit HelpTip

```jsx
<PageHeader
    title="Compliance"
    tip={
        <HelpTip
            title="Compliance"
            body="Compliance reporting across supported frameworks."
            how="Generated from audit evidence."
            testid="tip-compliance"
        />
    }
/>
```

---

## Buttons

```jsx
<DsButton
    tooltip="Refresh incidents from the server"
    onClick={refresh}
>
    Refresh
</DsButton>
```

---

## Action Buttons

```jsx
<ActionTip content="Copy Incident ID">
    <button>Copy</button>
</ActionTip>
```

---

## Status Badge

```jsx
<Tip content="Critical severity — immediate analyst response required">
    <SeverityBadge severity="critical" />
</Tip>
```

---

## Table Header

```jsx
<Tip content="Overall calculated threat score">
    <TableHeader>Threat</TableHeader>
</Tip>
```

---

## Entity Chip

```jsx
<Tip content="Observed IP address">
    <EntityChip />
</Tip>
```

---

## SVG Graph Nodes

React tooltips cannot reliably wrap SVG groups.

Every graph node should include:

```jsx
<title>
Host: WEB-01
</title>
```

---

# AI-Specific Requirements

Every AI-generated surface should explain:

- Confidence
- Evidence
- Grounding
- Citations
- Recommendation
- Human review requirements

Example

```jsx
<HelpTip
    title="AI Recommendation"
    body="Generated using retrieved evidence and MITRE ATT&CK mappings."
    how="Confidence reflects evidence quality rather than model certainty."
/>
```

---

# Score Requirements

Every calculated score should explain:

- Scale
- Range
- Inputs
- Formula (high level)
- Interpretation

Examples

- Threat Score
- Confidence
- Risk
- Analyst Load
- Incident Priority
- Health Score

---

# Charts

Every chart requires:

- Purpose
- Metric definition
- Time window
- Aggregation
- Drill-down guidance

---

# Tables

Every table requires help describing:

- Contents
- Sorting
- Filtering
- Search
- Pagination
- Export behavior

---

# Forms

Help should explain:

- Required fields
- Optional fields
- Validation
- Impact of submission

---

# Empty States

Every empty state should explain:

- Why there is no data
- Common causes
- Recommended next steps

---

# Error States

Every major error should provide guidance such as:

- Retry
- Refresh
- Check permissions
- Contact administrator

---

# Accessibility

Tooltips must:

- Be keyboard accessible
- Support screen readers
- Be reachable by focus
- Meet WCAG AA
- Never rely solely on hover

---

# Development Warnings

During development, missing tooltips should emit a warning once per surface.

Example

```text
[ACTIRA tooltip prerequisite]

PageHeader "Incidents" is missing help.

Add:

tip=

or

tipTitle + tipBody
```

Policy implementation

```
frontend/src/lib/tooltipPrerequisite.js
```

---

# Optional Opt-Out

Decorative components may disable enforcement.

Examples

```jsx
requireTip={false}

requireTooltip={false}
```

Use sparingly.

---

# Anti-Patterns

Do **NOT**

- Use native HTML `title=` for interactive controls
- Add multiple tooltip providers
- Wrap the same control with multiple tooltip systems
- Duplicate HelpTip and Tip on the same hover target
- Hide action tooltips behind user preferences
- Skip explanations for AI-generated content
- Leave placeholder tooltip text

---

# UI Review Checklist

Before merging a UI change verify:

- [ ] Every page has a PageHeader HelpTip
- [ ] Every dashboard section has contextual help
- [ ] Every panel explains its purpose
- [ ] Every KPI includes `tipTitle` and `tipBody`
- [ ] Every calculated score includes `how`
- [ ] Every chart explains itself
- [ ] Every table includes contextual help
- [ ] Every table column has a tooltip
- [ ] Every button includes a tooltip
- [ ] Every icon button includes a tooltip
- [ ] Every filter explains its behavior
- [ ] Every status badge explains its meaning
- [ ] Every entity chip explains its meaning
- [ ] AI recommendations explain confidence and grounding
- [ ] Manual keyboard navigation verified
- [ ] Manual hover verification completed
- [ ] Light mode verified
- [ ] Dark mode verified

---

# Related Documentation

- `DESIGN_GUIDELINES.md`
- `CODING_STANDARDS.md`
- `CODE_REVIEW_CHECKLIST.md`
- `PR_GUIDELINES.md`
- `LOCAL_DEVELOPMENT.md`
- `DEBUGGING.md`

---

# Definition of Done

A UI Pull Request is complete only when:

- Contextual help is implemented for every required surface.
- Tooltip content is accurate and meaningful.
- AI outputs explain confidence and evidence.
- Calculated metrics explain their methodology.
- Keyboard accessibility is verified.
- Screen reader compatibility is verified.
- No development tooltip warnings remain.
- Manual hover testing has been completed.
- The reviewer confirms compliance with this document.

**No new page, panel, KPI, chart, table, filter, or primary action may be merged without the required contextual help.**