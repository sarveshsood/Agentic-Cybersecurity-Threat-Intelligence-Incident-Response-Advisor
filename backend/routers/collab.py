"""H-07 collaboration routes: users search, assignment, comments, inbox."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query

from backend.feature_flags import require_feature
from backend.models import AssignmentUpdate, IncidentCommentCreate, IncidentCommentUpdate
from backend.security import get_current_user
from backend.repositories.users import users_repo
from backend.services import assignment_service, comment_service
from backend.services import notification_inbox_service as inbox

router = APIRouter(tags=["collab"])


@router.get(
    "/users",
    summary="Public user search for assignee pickers",
    dependencies=[Depends(require_feature("collab_assign"))],
)
async def search_users(
    q: str = Query("", max_length=120),
    limit: int = Query(20, ge=1, le=50),
    user=Depends(get_current_user),
):
    items = await users_repo.search_public(q, limit=limit)
    return {"items": items}


@router.patch(
    "/incidents/{incident_id}/assignment",
    dependencies=[Depends(require_feature("collab_assign"))],
)
async def patch_assignment(
    incident_id: str,
    body: AssignmentUpdate,
    user=Depends(get_current_user),
):
    return await assignment_service.set_assignment(incident_id, body, user)


@router.get(
    "/incidents/{incident_id}/comments",
    dependencies=[Depends(require_feature("collab_comments"))],
)
async def list_comments(incident_id: str, user=Depends(get_current_user)):
    return await comment_service.list_comments(incident_id, user)


@router.post(
    "/incidents/{incident_id}/comments",
    dependencies=[Depends(require_feature("collab_comments"))],
)
async def create_comment(
    incident_id: str,
    body: IncidentCommentCreate,
    user=Depends(get_current_user),
):
    return await comment_service.create_comment(incident_id, body, user)


@router.patch(
    "/incidents/{incident_id}/comments/{comment_id}",
    dependencies=[Depends(require_feature("collab_comments"))],
)
async def update_comment(
    incident_id: str,
    comment_id: str,
    body: IncidentCommentUpdate,
    user=Depends(get_current_user),
):
    return await comment_service.update_comment(incident_id, comment_id, body, user)


@router.delete(
    "/incidents/{incident_id}/comments/{comment_id}",
    dependencies=[Depends(require_feature("collab_comments"))],
)
async def delete_comment(
    incident_id: str,
    comment_id: str,
    user=Depends(get_current_user),
):
    return await comment_service.delete_comment(incident_id, comment_id, user)


@router.get(
    "/notifications",
    summary="In-app notification inbox (not outbound Slack/email)",
    dependencies=[Depends(require_feature("notification_center"))],
)
async def list_notifications(
    unread_only: bool = Query(False),
    before: Optional[str] = Query(None),
    limit: int = Query(40, ge=1, le=100),
    user=Depends(get_current_user),
):
    uid = user.get("sub") or user.get("id")
    return await inbox.list_inbox(
        uid, unread_only=unread_only, before=before, limit=limit
    )


@router.get(
    "/notifications/unread-count",
    dependencies=[Depends(require_feature("notification_center"))],
)
async def notifications_unread(user=Depends(get_current_user)):
    uid = user.get("sub") or user.get("id")
    return await inbox.unread_count(uid)


@router.post(
    "/notifications/{notif_id}/read",
    dependencies=[Depends(require_feature("notification_center"))],
)
async def mark_notification_read(notif_id: str, user=Depends(get_current_user)):
    uid = user.get("sub") or user.get("id")
    return await inbox.mark_read(uid, notif_id)


@router.post(
    "/notifications/read-all",
    dependencies=[Depends(require_feature("notification_center"))],
)
async def mark_all_notifications_read(user=Depends(get_current_user)):
    uid = user.get("sub") or user.get("id")
    return await inbox.mark_all_read(uid)
