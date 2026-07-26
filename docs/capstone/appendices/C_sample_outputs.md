# Appendix C — Sample outputs

**Location:** `docs/capstone/appendices/C_sample_outputs.md`  
**Machine-readable twin:** [`C_sample_g001.json`](./C_sample_g001.json)

Offline template-playbook run for golden case **g001** (brute-force SSH). No live LLM or TI keys required.

---

## C.1 Input log (excerpt)

```text
Jan 12 10:00:01 web01 sshd[1023]: Failed password for root from 185.220.101.45 port 45322 ssh2
Jan 12 10:00:02 web01 sshd[1024]: Failed password for admin from 185.220.101.45 port 45325 ssh2
Jan 12 10:00:03 web01 sshd[1025]: authentication failure for invalid user oracle from 185.220.101.45
```

---

## C.2 Expected labels (golden)

| Field | Value |
|-------|--------|
| IoCs | `ip:185.220.101.45` |
| Techniques | `T1110` (Brute Force) |
| Playbook phases | containment, eradication, recovery, lessons_learned |
| Min grounding | 0.5 |

---

## C.3 Offline prediction (template path)

| Field | Value |
|-------|--------|
| IoCs | `ip:185.220.101.45` |
| Techniques | `T1110` |
| Phases | containment, eradication, recovery, lessons_learned |
| Grounding score | **1.0** |
| Severity | medium |
| HiTL required | false (example; critical/low-grounding cases force review) |
| LLM provider | `template` |

### Playbook steps (excerpt)

| # | Phase | Action (summary) | Citations |
|---|-------|------------------|-----------|
| 1 | containment | Isolate hosts; preserve volatile evidence | NIST-800-61-4.3 |
| 2 | containment | Block malicious IoCs at perimeter/endpoint | T1110, PB-BRUTEFORCE |
| 3 | eradication | Remove artifacts; disable compromised accounts | T1110 |
| 4 | recovery | Restore, rotate credentials, validate integrity | T1110 |

---

## C.4 How to reproduce

```bash
# From repository root (lab)
python -c "from pathlib import Path; from backend.golden_eval import run_offline_case, load_golden_dataset; c=load_golden_dataset(Path('backend/tests/golden/dataset.json'))[0]; print(run_offline_case(c['log'], force_template_playbook=True))"

# Full golden CI gate
python -m pytest backend/tests/test_golden_benchmark.py -q
```

---

## C.5 Screenshots / figures

Place demo screenshots in:

- `docs/capstone/assets/screenshots/`
- Architecture exports in `docs/capstone/assets/figures/`

See `docs/capstone/assets/screenshots/README.md`.
