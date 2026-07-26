"""Compliance status (static mapping payload for now)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict


def status() -> Dict[str, Any]:
    return {
        "score": 89,
        "frameworks": [
            {"name": "ISO 27001", "status": "Passing", "controls": "42/45"},
            {"name": "SOC 2 Type II", "status": "Compliant", "controls": "61/61"},
            {"name": "NIST SP 800-61", "status": "Review", "controls": "18/22"},
        ],
        "last_audit": datetime.now(timezone.utc).isoformat(),
    }
