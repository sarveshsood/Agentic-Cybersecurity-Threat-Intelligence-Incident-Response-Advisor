"""H-08 productivity: saved filters + pins."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from backend.feature_flags import require_feature
from backend.models import SavedFilterCreate, SavedFilterUpdate, UserPinCreate
from backend.security import get_current_user
from backend.services import pin_service, saved_filter_service

router = APIRouter(tags=["productivity"])


@router.get(
    "/saved-filters",
    dependencies=[Depends(require_feature("saved_filters"))],
)
async def list_saved_filters(
    page: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    uid = user.get("sub") or user.get("id")
    items = await saved_filter_service.list_filters(uid, page=page)
    return {"items": items}


@router.post(
    "/saved-filters",
    dependencies=[Depends(require_feature("saved_filters"))],
)
async def create_saved_filter(body: SavedFilterCreate, user=Depends(get_current_user)):
    return await saved_filter_service.create_filter(body, user)


@router.patch(
    "/saved-filters/{filter_id}",
    dependencies=[Depends(require_feature("saved_filters"))],
)
async def update_saved_filter(
    filter_id: str, body: SavedFilterUpdate, user=Depends(get_current_user)
):
    return await saved_filter_service.update_filter(filter_id, body, user)


@router.delete(
    "/saved-filters/{filter_id}",
    dependencies=[Depends(require_feature("saved_filters"))],
)
async def delete_saved_filter(filter_id: str, user=Depends(get_current_user)):
    return await saved_filter_service.delete_filter(filter_id, user)


@router.get(
    "/pins",
    dependencies=[Depends(require_feature("pins"))],
)
async def list_pins(
    target_type: Optional[str] = Query(None),
    user=Depends(get_current_user),
):
    uid = user.get("sub") or user.get("id")
    items = await pin_service.list_pins(uid, target_type=target_type)
    return {"items": items}


@router.post(
    "/pins",
    dependencies=[Depends(require_feature("pins"))],
)
async def create_pin(body: UserPinCreate, user=Depends(get_current_user)):
    return await pin_service.create_pin(body, user)


@router.delete(
    "/pins/{pin_id}",
    dependencies=[Depends(require_feature("pins"))],
)
async def delete_pin(pin_id: str, user=Depends(get_current_user)):
    return await pin_service.delete_pin(pin_id, user)


@router.delete(
    "/pins/by-target/{target_type}/{target_id}",
    dependencies=[Depends(require_feature("pins"))],
)
async def delete_pin_by_target(
    target_type: str, target_id: str, user=Depends(get_current_user)
):
    return await pin_service.delete_pin_by_target(
        user, target_type=target_type, target_id=target_id
    )
