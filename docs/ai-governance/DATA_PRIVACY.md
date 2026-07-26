# Data Privacy Controls

## Data classes

| Class              | Examples                   | Handling                               |
|--------------------|----------------------------|----------------------------------------|
| Credentials        | passwords, JWT             | bcrypt / httpOnly; never log           |
| API keys           | LLM/TI                     | vault; has_* only                      |
| Security telemetry | IPs, hosts, emails in logs | treat as sensitive; retention settings |
| Playbooks          | IR text                    | RBAC; audit on review                  |

## GDPR-oriented notes (if EU personal data appears in logs)

- Determine controller/processor roles for your deploy
- Minimize collection; set `INCIDENT_RETENTION_DAYS`
- Support deletion requests by purging incidents/jobs for subject identifiers (operational process — not full automated
  DSR portal in v1.0)
- SCCs/DPA with LLM vendors as required

## Cross-border

LLM providers may process prompts in other regions — document vendor regions in your DPIA.
