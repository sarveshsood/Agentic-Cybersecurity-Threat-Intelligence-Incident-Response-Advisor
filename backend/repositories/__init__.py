"""Data access layer (Mongo collections).

Repositories own queries; services own business rules; routers own HTTP.
"""
from __future__ import annotations

from backend.repositories.audit import AuditRepository
from backend.repositories.incidents import IncidentRepository
from backend.repositories.jobs import JobRepository, jobs_repo
from backend.repositories.kb import KnowledgeRepository, kb_repo
from backend.repositories.roadmap import RoadmapRepository, roadmap_repo
from backend.repositories.settings import SettingsRepository
from backend.repositories.users import UserRepository

__all__ = [
    "AuditRepository",
    "IncidentRepository",
    "JobRepository",
    "KnowledgeRepository",
    "RoadmapRepository",
    "SettingsRepository",
    "UserRepository",
    "jobs_repo",
    "kb_repo",
    "roadmap_repo",
]
