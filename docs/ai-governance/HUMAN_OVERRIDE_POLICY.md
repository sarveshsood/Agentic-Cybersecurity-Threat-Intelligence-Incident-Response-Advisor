# Human Override Policy

- Humans always win: reviewer approve/reject/edit
- Critical severity cannot auto-approve past `hitl_severity_min`
- Concurrent reviews: first writer wins; second gets 409
- Admins may tune thresholds but should not disable review for production critical without risk acceptance

**No automated containment actions** in v1.0 (no SOAR fire-and-forget).
