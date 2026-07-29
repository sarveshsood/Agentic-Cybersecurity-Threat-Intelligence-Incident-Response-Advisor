"""Optional multi-tenant helpers (FEATURE_MULTI_TENANT).

Default ACTIRA is **single-tenant**: all helpers are no-ops / return None.

When ``FEATURE_MULTI_TENANT=1``:

- Writes (incidents, users) stamp ``org_id`` (default ``ACTIRA_DEFAULT_ORG_ID``)
- Incident list/count/get queries filter by ``org_id``
- Users get ``org_id`` on register/OIDC provision

Not a full multi-tenant SaaS product (no org admin UI, no billing, no per-tenant
secrets vault). Isolation is **document-level** for the primary incident + user
paths — suitable for single-org-per-deploy or pilot multi-org on one DB.
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


def resolve_org_id(
    org_id: Optional[str] = None,
    *,
    user: Optional[Dict[str, Any]] = None,
    doc: Optional[Dict[str, Any]] = None,
) -> Optional[str]:
    """Pick org id: explicit → user → document → process default."""
    if not multi_tenant_enabled():
        return None
    if org_id:
        return str(org_id).strip() or default_org_id()
    if user and user.get("org_id"):
        return str(user["org_id"]).strip() or default_org_id()
    if doc and doc.get("org_id"):
        return str(doc["org_id"]).strip() or default_org_id()
    return default_org_id()


def stamp_org(doc: Dict[str, Any], org_id: Optional[str] = None) -> Dict[str, Any]:
    """Add org_id to a document when multi-tenant is enabled."""
    if not multi_tenant_enabled():
        return doc
    oid = resolve_org_id(org_id, doc=doc)
    if oid and "org_id" not in doc:
        doc = {**doc, "org_id": oid}
    return doc


def org_filter(org_id: Optional[str] = None) -> Dict[str, Any]:
    """Mongo filter fragment for org isolation (empty when single-tenant)."""
    if not multi_tenant_enabled():
        return {}
    oid = resolve_org_id(org_id)
    if not oid:
        return {}
    return {"org_id": oid}


def merge_org_query(query: Optional[Dict[str, Any]] = None, org_id: Optional[str] = None) -> Dict[str, Any]:
    """Merge org isolation into an existing Mongo query.

    Handles empty query, single-key, and ``$and`` composition so technique/assignee
    ``$or`` terms are never stomped.
    """
    q = dict(query or {})
    of = org_filter(org_id)
    if not of:
        return q
    if not q:
        return dict(of)
    # If query already has org_id, respect it
    if "org_id" in q:
        return q
    if "$and" in q and isinstance(q["$and"], list):
        return {**q, "$and": list(q["$and"]) + [of]}
    # Wrap existing keys with $and when needed to avoid clobbering $or siblings
    if any(k.startswith("$") for k in q):
        return {"$and": [q, of]}
    return {**q, **of}


def status_public() -> Dict[str, Any]:
    enabled = multi_tenant_enabled()
    return {
        "feature_enabled": enabled,
        "default_org_id": default_org_id() if enabled else None,
        "mode": "multi_tenant_scaffold" if enabled else "single_tenant",
        "paths": {
            "incident_list_filter": enabled,
            "incident_get_filter": enabled,
            "incident_write_stamp": enabled,
            "user_write_stamp": enabled,
        },
        "note": (
            "Scaffold only: org_id stamped/filtered on primary incident + user paths — "
            "not end-to-end on every query/collection. No org admin UI; use "
            "ACTIRA_DEFAULT_ORG_ID or user.org_id for assignment."
        ),
    }
