# ACTIRA — User Guide

## Roles

| Role            | Typical work                                      |
|-----------------|---------------------------------------------------|
| Analyst         | Upload logs, triage incidents, use investigator   |
| Senior reviewer | Approve / reject / edit playbooks in Review Queue |
| Admin           | Settings, KB admin, eval, roadmap                 |

## Analyst workflow

1. **Login** (demo cards available in lab).
2. **Ingest Logs** — single file, multi-file, ZIP, or sample button.
3. Watch job phases until `done`.
4. **Incidents** → open detail: summary, IoCs, ATT&CK, correlation, playbook.
5. Click citation chips to see knowledge-base snippets.
6. Optional: **Investigate** with a natural-language question.

## Reviewer workflow

1. Login as reviewer.
2. Open **Review Queue**.
3. Read playbook + grounding score.
4. **Approve**, **Reject**, or **Edit-and-approve**.
5. Concurrent review of the same item yields an error — refresh and continue.

## Knowledge

- Search the built-in MITRE / NIST / KEV / playbook corpus.
- Admins may add custom documents (org SOPs).

## Tips

- Critical severity incidents require human review by default.
- Mock threat-intel scores appear when TI keys are empty — expected in lab.
- If the UI cannot load data, the API may be down (see [TROUBLESHOOTING.md](../TROUBLESHOOTING.md)).
