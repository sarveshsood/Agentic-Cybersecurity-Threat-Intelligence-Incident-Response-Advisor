"""In-app notification inbox (H-07). Logger: actira.notif_inbox."""
from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional

from backend.feature_flags import is_feature_enabled
from backend.models import new_id, utc_now
from backend.repositories.app_notifications import app_notifications_repo

logger = logging.getLogger("actira.notif_inbox")

MENTION_RE = re.compile(r"@([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})")


async def emit(
    *,
    user_id: str,
    kind: str,
    title: str,
    body: str = "",
    incident_id: Optional[str] = None,
    actor_id: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Best-effort inbox insert. No-op when notification_center flag is off."""
    if not is_feature_enabled("notification_center"):
        return None
    if not user_id or (actor_id and actor_id == user_id):
        return None  # skip self-notify
    doc = {
        "id": new_id(),
        "user_id": user_id,
        "kind": kind,
        "title": (title or "")[:200],
        "body": (body or "")[:2000],
        "incident_id": incident_id,
        "actor_id": actor_id,
        "meta": meta or {},
        "created_at": utc_now(),
        "read_at": None,
    }
    try:
        await app_notifications_repo.insert(doc)
        return {k: v for k, v in doc.items() if k != "_id"}
    except Exception as e:
        logger.warning("inbox emit failed: %s", e)
        return None


def parse_mention_emails(text: str) -> List[str]:
    return list(dict.fromkeys(MENTION_RE.findall(text or "")))


async def list_inbox(
    user_id: str, *, unread_only: bool = False, before: Optional[str] = None, limit: int = 40
) -> Dict[str, Any]:
    items = await app_notifications_repo.list_for_user(
        user_id, unread_only=unread_only, before=before, limit=limit
    )
    unread = await app_notifications_repo.unread_count(user_id)
    return {"items": items, "unread": unread}


async def unread_count(user_id: str) -> Dict[str, int]:
    return {"unread": await app_notifications_repo.unread_count(user_id)}


async def mark_read(user_id: str, notif_id: str) -> Dict[str, Any]:
    ok = await app_notifications_repo.mark_read(user_id, notif_id, utc_now())
    return {"ok": ok, "id": notif_id}


async def mark_all_read(user_id: str) -> Dict[str, Any]:
    n = await app_notifications_repo.mark_all_read(user_id, utc_now())
    return {"ok": True, "marked": n}
