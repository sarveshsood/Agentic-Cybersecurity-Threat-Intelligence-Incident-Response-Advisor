"""Optional multi-tenant helpers (FEATURE_MULTI_TENANT).

Default ACTIRA is **single-tenant**: all helpers are no-ops / return None.
When enabled, callers can stamp and filter ``org_id`` on documents.

This is scaffolding for H-01 — not a full multi-tenant product (no org admin UI,
no billing, no cross-tenant isolation guarantees until end-to-end adoption).
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional


def multi_tenant_enabled() -> bool:
    raw = (os.environ.get("FEATURE_MULTI_TENANT") or "0").strip().lower()
    return raw in ("1", "true", "yes", "on")


def default_org_id() -> Optional[str]:
    """Default org for the process when multi-tenant is on (single-org deploy)."""
    if not multi_tenant_enabled():
        return None
    oid = (os.environ.get("ACTIRA_DEFAULT_ORG_ID") or "default").strip()
    return oid or "default"


def stamp_org(doc: Dict[str, Any], org_id: Optional[str] = None) -> Dict[str, Any]:
    """Add org_id to a document when multi-tenant is enabled."""
    if not multi_tenant_enabled():
        return doc
    oid = org_id if org_id is not None else default_org_id()
    if oid and "org_id" not in doc:
        doc = {**doc, "org_id": oid}
    return doc


def org_filter(org_id: Optional[str] = None) -> Dict[str, Any]:
    """Mongo filter fragment for org isolation (empty when single-tenant)."""
    if not multi_tenant_enabled():
        return {}
    oid = org_id if org_id is not None else default_org_id()
    if not oid:
        return {}
    return {"org_id": oid}


def merge_org_query(query: Optional[Dict[str, Any]] = None, org_id: Optional[str] = None) -> Dict[str, Any]:
    q = dict(query or {})
    of = org_filter(org_id)
    if of:
        q.update(of)
    return q


def status_public() -> Dict[str, Any]:
    return {
        "feature_enabled": multi_tenant_enabled(),
        "default_org_id": default_org_id() if multi_tenant_enabled() else None,
        "mode": "multi_tenant_scaffold" if multi_tenant_enabled() else "single_tenant",
        "note": (
            "When enabled, stamp/filter org_id on writes/reads. "
            "Not a full multi-tenant SaaS — no org admin UI."
        ),
    }
