# Code Review Checklist

## Correctness

- [ ] Edge cases / empty inputs
- [ ] Error paths tested or reasoned

## Security

- [ ] AuthN/Z on new routes
- [ ] No secret leakage
- [ ] Injection (log → prompt) considered
- [ ] File upload limits respected

## AI / HiTL

- [ ] Does not weaken severity gate
- [ ] Citations still filtered
- [ ] Fallbacks force human review when appropriate

## Performance

- [ ] No unbounded lists without limit
- [ ] Avoid N+1 Mongo patterns

## UX / tooltips (prerequisite)

- [ ] New pages use `PageHeader` with `tip` or `tipTitle`+`tipBody`
- [ ] Panels / KPIs / section labels have HelpTip content (or `PaneLabel` title+body)
- [ ] Interactive controls (buttons, chips, entity rows) use `Tip` / `DsButton tooltip=`
- [ ] No “add tooltips later” — missing tips are a review blocker
- [ ] See [TOOLTIP_PREREQUISITE.md](TOOLTIP_PREREQUISITE.md)

## Maintainability

- [ ] Names clear
- [ ] No unnecessary new dependencies
- [ ] Matches architecture style (modular monolith)

## Ops

- [ ] Config documented if new env var
- [ ] Migrations/notes if data shape changes  
