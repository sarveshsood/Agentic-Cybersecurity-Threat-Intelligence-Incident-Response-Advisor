# Retired backup facades

These files (`serverbkp.py`, `golden_evalbkp.py`) are **historical snapshots** kept only for emergency comparison during modularization. They are **not** imported by the running app.

Canonical entrypoints:
- API: `backend.server:app`
- Golden eval: `backend.golden_eval`

Safe to delete after the next release tag if no engineers need the diff.
