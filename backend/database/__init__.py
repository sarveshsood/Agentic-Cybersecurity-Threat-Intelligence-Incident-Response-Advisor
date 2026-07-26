"""Database layer — Motor client + database handle.

Canonical import (P1):
    from backend.database import db, client

Implementation currently lives in ``backend.core.database``; this package is the
stable public surface for repositories and services.
"""
from __future__ import annotations

from backend.core.database import ROOT_DIR, client, db, mongo_url

__all__ = ["ROOT_DIR", "client", "db", "mongo_url"]
