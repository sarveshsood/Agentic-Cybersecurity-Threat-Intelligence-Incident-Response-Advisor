# Enterprise Code Review Checklist

This checklist is mandatory for all Pull Requests.

A PR should not be approved until every applicable item has been reviewed.

---

# 1. Functional Correctness

## Requirements

- [ ] Requirement fully implemented
- [ ] Acceptance criteria satisfied
- [ ] No regression introduced
- [ ] Feature works end-to-end
- [ ] Business logic preserved
- [ ] Existing workflows preserved

## Edge Cases

- [ ] Empty inputs
- [ ] Null values
- [ ] Invalid values
- [ ] Large datasets
- [ ] Duplicate requests
- [ ] Concurrent operations
- [ ] Timeout scenarios
- [ ] Retry scenarios

## Error Handling

- [ ] Meaningful error messages
- [ ] No swallowed exceptions
- [ ] Graceful failure
- [ ] Recovery path available
- [ ] No stack traces exposed

---

# 2. Architecture

- [ ] Matches modular monolith architecture
- [ ] Business logic not implemented in UI
- [ ] No duplicate code
- [ ] Reusable components used
- [ ] Configuration over hardcoding
- [ ] Proper separation of concerns
- [ ] No circular dependencies
- [ ] Single Responsibility Principle followed

---

# 3. Backend

- [ ] Type hints added
- [ ] Pydantic models used
- [ ] Validation implemented
- [ ] Async I/O where appropriate
- [ ] Database queries optimized
- [ ] No N+1 queries
- [ ] Indexes considered
- [ ] Structured logging
- [ ] No blocking operations

---

# 4. Frontend

## Components

- [ ] Functional components
- [ ] Design-system components used
- [ ] No duplicated UI
- [ ] Proper hooks usage
- [ ] Minimal re-renders

## Styling

- [ ] Design tokens only
- [ ] No hardcoded colors
- [ ] No hardcoded spacing
- [ ] No hardcoded typography
- [ ] Responsive layout
- [ ] Dark mode verified
- [ ] Light mode verified

---

# 5. UX

- [ ] Workflow intuitive
- [ ] Navigation consistent
- [ ] Appropriate defaults
- [ ] Loading state
- [ ] Empty state
- [ ] Error state
- [ ] Success feedback
- [ ] Keyboard accessible

---

# 6. Tooltips (Mandatory)

## Every new UI must include contextual help.

### Verify

- [ ] Page Header
- [ ] Tabs
- [ ] Sub-tabs
- [ ] Panels
- [ ] KPI Cards
- [ ] Buttons
- [ ] Icons
- [ ] Charts
- [ ] Table Columns
- [ ] Filters
- [ ] Forms
- [ ] Status Pills
- [ ] Severity Badges
- [ ] Entity Chips
- [ ] Action Chips
- [ ] Drawers
- [ ] Dialogs
- [ ] Modals

No feature may be merged with

> "We'll add tooltips later."

Missing tooltips are a review blocker.

Reference

```
TOOLTIP_PREREQUISITE.md
```

---

# 7. Tables

Every table should support

- [ ] Sorting
- [ ] Filtering
- [ ] Search
- [ ] Pagination
- [ ] Sticky Headers
- [ ] Column Resize
- [ ] Column Visibility
- [ ] Loading State
- [ ] Empty State
- [ ] CSV Export
- [ ] Copy Values

---

# 8. Charts

- [ ] Token colors
- [ ] Tooltips
- [ ] Legends
- [ ] Drilldown
- [ ] Responsive
- [ ] Accessible colors
- [ ] Export

---

# 9. Accessibility

- [ ] WCAG AA
- [ ] Keyboard navigation
- [ ] Screen reader labels
- [ ] Focus indicators
- [ ] Contrast verified
- [ ] Never rely on color alone

---

# 10. Security

## Authentication

- [ ] AuthN enforced
- [ ] AuthZ enforced
- [ ] RBAC validated

## Secure Coding

- [ ] No secret leakage
- [ ] Input validation
- [ ] Output encoding
- [ ] Injection considered
- [ ] Prompt injection considered
- [ ] File upload limits
- [ ] Secure cookies
- [ ] CSRF considered
- [ ] CORS reviewed
- [ ] Audit logging preserved

---

# 11. AI / HITL

- [ ] Severity gate preserved
- [ ] Citations filtered
- [ ] Evidence preserved
- [ ] Confidence displayed
- [ ] Sources visible
- [ ] Hallucination risk considered
- [ ] Human review enforced where required
- [ ] Prompt logging secure
- [ ] Response logging secure

---

# 12. Performance

- [ ] No unnecessary API calls
- [ ] No unnecessary renders
- [ ] Bundle size acceptable
- [ ] Lazy loading where appropriate
- [ ] Memoization where appropriate
- [ ] Pagination implemented
- [ ] Virtualization for large datasets
- [ ] Database queries optimized

---

# 13. Observability

- [ ] Structured logging
- [ ] Correlation IDs
- [ ] Metrics preserved
- [ ] Health checks preserved
- [ ] Audit logging preserved

---

# 14. Testing

- [ ] Unit tests
- [ ] Integration tests
- [ ] API tests
- [ ] UI tests
- [ ] Accessibility tests
- [ ] Regression tests
- [ ] Existing tests pass

---

# 15. Operations

- [ ] New environment variables documented
- [ ] Feature flags documented
- [ ] Database migrations included
- [ ] Deployment notes updated
- [ ] Rollback plan available

---

# 16. Documentation

- [ ] README updated
- [ ] API documentation updated
- [ ] Architecture documentation updated
- [ ] User documentation updated
- [ ] Changelog updated

---

# 17. Enterprise UX Review

Review as:

- [ ] SOC Analyst
- [ ] Incident Responder
- [ ] Threat Hunter
- [ ] Security Engineer
- [ ] Frontend Architect
- [ ] Backend Architect
- [ ] Product Owner
- [ ] Accessibility Expert
- [ ] Performance Engineer
- [ ] CISO

---

# 18. Final Quality Gate

## This PR is merge-ready only if

- [ ] Lint passes
- [ ] Build passes
- [ ] Tests pass
- [ ] No console errors
- [ ] No React warnings
- [ ] No accessibility violations
- [ ] No performance regression
- [ ] No security regression
- [ ] No API regression
- [ ] Existing workflows preserved
- [ ] Existing test IDs preserved
- [ ] Documentation updated
- [ ] Tooltips implemented
- [ ] Dark mode verified
- [ ] Light mode verified
- [ ] Enterprise design guidelines followed
- [ ] Coding standards followed
- [ ] Debugging guide updated if required

---

# Related Documentation

| Document | When to use |
|----------|-------------|
| [PR_GUIDELINES.md](PR_GUIDELINES.md) | Opening and merging PRs |
| [TOOLTIP_PREREQUISITE.md](TOOLTIP_PREREQUISITE.md) | Any UI change |
| [CODING_STANDARDS.md](CODING_STANDARDS.md) | Style and architecture rules |
| [ENTERPRISE_REVIEWER_PERSONA.md](ENTERPRISE_REVIEWER_PERSONA.md) | **Not for every PR** — major release / board / production readiness |
| [../operations/SECURITY_HARDENING.md](../operations/SECURITY_HARDENING.md) | Production security go-live |