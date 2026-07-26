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

## Maintainability

- [ ] Names clear
- [ ] No unnecessary new dependencies
- [ ] Matches architecture style (modular monolith)

## Ops

- [ ] Config documented if new env var
- [ ] Migrations/notes if data shape changes  
