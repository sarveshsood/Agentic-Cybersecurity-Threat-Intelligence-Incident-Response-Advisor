# End-to-end capability matrix (product truth)

What ACTIRA delivers today vs optional future work. Use this for demos and scoping.

| Capability                                                       | Status                 | Notes                                            |
|------------------------------------------------------------------|------------------------|--------------------------------------------------|
| Log ingest (upload / batch / ZIP / webhook)                      | **Required · shipped** | `routers/logs.py`, pipeline                      |
| **One job → one correlated incident** (multi-file attack chain)  | **Required · shipped** | Design choice — not multi-incident fan-out       |
| One job → **N** separate incidents each with playbook            | Optional future        | Not implemented; do not claim in demos           |
| Live job phase progress (SSE/events)                             | **Required · shipped** | `GET /logs/jobs/{id}/events`                     |
| IoC extract + TI enrich (AbuseIPDB, VT, GreyNoise, ThreatFox, …) | **Required · shipped** | Mock if keys empty                               |
| MITRE ATT&CK mapping + catalog                                   | **Required · shipped** | Heuristic + catalog; not full detection coverage |
| Citation-grounded playbooks (4 NIST phases + grounding)          | **Required · shipped** | `playbook_agent.py`                              |
| HiTL review + RBAC                                               | **Required · shipped** | Severity + grounding gates                       |
| Analytics + audit + ATT&CK heatmap                               | **Required · shipped** | KPIs / analytics / audit APIs + UI               |
| `/api` + `/api/v1` API mounts                                    | **Shipped (v1.1)**     | Identical handlers                               |

## Demo talking points (correct)

> Multi-source package → **one** correlated incident with IoCs, ATT&CK, grounded playbook, HiTL when critical.

## Demo talking points (incorrect unless built)

> One upload becomes **many** independent incidents each with its own playbook.
