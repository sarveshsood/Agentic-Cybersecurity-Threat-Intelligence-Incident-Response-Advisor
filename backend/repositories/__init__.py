"""Data access layer (Mongo collections).

Repositories own queries; services own business rules; routers own HTTP.
"""
from __future__ import annotations

from backend.repositories.audit import AuditRepository
from backend.repositories.incidents import IncidentRepository
from backend.repositories.settings import SettingsRepository
from backend.repositories.users import UserRepository

__all__ = [
    "AuditRepository",
    "IncidentRepository",
    "SettingsRepository",
    "UserRepository",
]
