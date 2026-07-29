"""Saved filters (H-08)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.core import services as svc
from backend.models import SavedFilterCreate, SavedFilterUpdate, new_id, utc_now
from backend.repositories.saved_filters import saved_filters_repo

# Server-queryable keys (KD-5)
SERVER_FILTER_KEYS = frozenset(
    {"status", "severity", "technique", "assignee", "unassigned"}
)


def _normalize_filter(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    raw = dict(raw or {})
    server: Dict[str, Any] = {}
    client_only = dict(raw.get("client_only") or {})
    for k, v in raw.items():
        if k == "client_only":
            continue
        if k in SERVER_FILTER_KEYS:
            if v is None or v == "":
                continue
            if k == "unassigned":
                server[k] = bool(v) if not isinstance(v, str) else v in (
                    "1",
                    "true",
                    "yes",
                    "on",
                )
            else:
                server[k] = v
        else:
            # stash unknown under client_only
            client_only[k] = v
    # allow explicit client_only from body
    for ck in ("q", "min_threat", "hitl"):
        if ck in raw and ck not in SERVER_FILTER_KEYS:
            client_only[ck] = raw[ck]
    out = dict(server)
    if client_only:
        out["client_only"] = client_only
    return out


async def list_filters(owner_id: str, *, page: Optional[str] = None) -> List[Dict[str, Any]]:
    return await saved_filters_repo.list_for_user(owner_id, page=page)


async def create_filter(body: SavedFilterCreate, actor: dict) -> Dict[str, Any]:
    owner = actor.get("sub") or actor.get("id")
    filt = _normalize_filter(body.filter)
    if body.is_default:
        await saved_filters_repo.clear_defaults(owner, body.page)
    doc = {
        "id": new_id(),
        "owner_id": owner,
        "name": body.name.strip(),
        "page": body.page,
        "filter": filt,
        "is_default": bool(body.is_default),
        "created_at": utc_now(),
        "updated_at": utc_now(),
    }
    await saved_filters_repo.insert(doc)
    await svc.audit(
        actor,
        "saved_filter.create",
        "saved_filter",
        doc["id"],
        {"page": body.page, "name": doc["name"]},
    )
    return {k: v for k, v in doc.items() if k != "_id"}


async def update_filter(
    filter_id: str, body: SavedFilterUpdate, actor: dict
) -> Dict[str, Any]:
    owner = actor.get("sub") or actor.get("id")
    existing = await saved_filters_repo.find_by_id(filter_id)
    if not existing or existing.get("owner_id") != owner:
        raise HTTPException(404, "Saved filter not found")
    patch = body.model_dump(exclude_unset=True)
    fields: Dict[str, Any] = {"updated_at": utc_now()}
    if "name" in patch and patch["name"]:
        fields["name"] = str(patch["name"]).strip()
    if "filter" in patch and patch["filter"] is not None:
        fields["filter"] = _normalize_filter(patch["filter"])
    if "is_default" in patch:
        if patch["is_default"]:
            await saved_filters_repo.clear_defaults(owner, existing.get("page") or "incidents")
        fields["is_default"] = bool(patch["is_default"])
    updated = await saved_filters_repo.update_fields(filter_id, owner, fields)
    await svc.audit(actor, "saved_filter.update", "saved_filter", filter_id, {})
    return updated or existing


async def delete_filter(filter_id: str, actor: dict) -> Dict[str, Any]:
    owner = actor.get("sub") or actor.get("id")
    ok = await saved_filters_repo.delete(filter_id, owner)
    if not ok:
        raise HTTPException(404, "Saved filter not found")
    await svc.audit(actor, "saved_filter.delete", "saved_filter", filter_id, {})
    return {"ok": True, "id": filter_id}
