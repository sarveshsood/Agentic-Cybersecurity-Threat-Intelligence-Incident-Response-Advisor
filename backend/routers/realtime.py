"""Ops real-time channels: WebSocket primary; SSE fallback.

Sprint 5+: SSE ``GET /sse/ops`` and WebSocket ``/ws/ops`` push KPI + queue snapshots.

Honesty (not claimed):
- In-process interval **pull** of ``kpis`` / ``queue_kpis`` every N seconds.
- Not event-driven from job completion.
- No multi-replica fan-out (needs Redis / Mongo change streams later).
- Each push **bypasses** the in-process analytics KPI cache so wallboards move
  when Mongo changes (unlike silent Dashboard HTTP poll).

Flag: ``FEATURE_REALTIME_OPS``.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from backend.security import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(tags=["realtime"])

COOKIE_NAME = "actira_access_token"


def _realtime_enabled() -> bool:
    raw = (os.environ.get("FEATURE_REALTIME_OPS") or "1").strip().lower()
    return raw not in ("0", "false", "no", "off")


def _evt(etype: str, payload: Dict[str, Any], eid: str | None = None) -> Dict[str, Any]:
    return {
        "v": 1,
        "id": eid or f"evt_{datetime.now(timezone.utc).timestamp()}",
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": etype,
        "payload": payload,
    }


async def _ops_snapshot() -> Dict[str, Any]:
    """Fresh queue + full KPIs for wallboards (cache bypassed on facet).

    ``queue_kpis`` reuses the just-written KPI cache entry so we do not double
    the heavy facet; assigned/SLA counts always hit Mongo.
    """
    from backend.services import analytics_service

    kpis = await analytics_service.kpis(force_refresh=True)
    queue = await analytics_service.queue_kpis(force_refresh=False)
    return {
        "queue": queue,
        "kpis": kpis,
        "pull_mode": "interval",
        "cache_bypassed": True,
        "scope": "in-process",
        "note": (
            "Interval pull of aggregations — not job-completion push; "
            "not multi-replica pub/sub."
        ),
    }


# Back-compat alias used by tests / call sites
async def _queue_payload() -> Dict[str, Any]:
    snap = await _ops_snapshot()
    return snap.get("queue") or {}


def _token_from_ws(websocket: WebSocket, token: Optional[str] = None) -> Optional[str]:
    """Resolve JWT from query token, Authorization header, or session cookie."""
    auth = token or websocket.query_params.get("token")
    if not auth:
        hdr = websocket.headers.get("authorization") or websocket.headers.get("Authorization")
        if hdr:
            auth = hdr
    if auth and auth.lower().startswith("bearer "):
        auth = auth[7:].strip()
    if auth:
        return auth.strip() or None
    # Cookie (A-F1 SPA) — WebSocket does not run HTTP cookie→Bearer middleware
    cookie = websocket.cookies.get(COOKIE_NAME)
    if cookie:
        return cookie.strip() or None
    # Raw Cookie header fallback
    raw = websocket.headers.get("cookie") or ""
    for part in raw.split(";"):
        part = part.strip()
        if part.startswith(f"{COOKIE_NAME}="):
            return part.split("=", 1)[1].strip() or None
    return None


def _decode_user(raw_token: Optional[str]) -> Optional[dict]:
    if not raw_token:
        return None
    try:
        from backend.auth import decode_token

        return decode_token(raw_token)
    except Exception:
        return None


async def _push_loop_body(n: int) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Build ops + legacy queue events for one tick."""
    snap = await _ops_snapshot()
    ops = _evt("kpi.ops_snapshot", snap, eid=f"ops{n}")
    # Legacy event: queue dict only (older FE)
    q_evt = _evt("kpi.queue_snapshot", snap.get("queue") or {}, eid=f"q{n}")
    return ops, q_evt


@router.get("/sse/ops")
async def sse_ops(
    interval_sec: float = Query(10, ge=3, le=60),
    user=Depends(get_current_user),
):
    """Server-Sent Events fallback for ops dashboard (fresh KPIs + queue + heartbeat)."""
    _ = user
    if not _realtime_enabled():
        return StreamingResponse(
            iter(
                [
                    "event: error\ndata: "
                    + json.dumps({"detail": "FEATURE_REALTIME_OPS disabled"})
                    + "\n\n"
                ]
            ),
            media_type="text/event-stream",
        )

    async def gen():
        n = 0
        while True:
            n += 1
            try:
                ops, q_evt = await _push_loop_body(n)
                yield (
                    f"id: {ops['id']}\nevent: kpi.ops_snapshot\n"
                    f"data: {json.dumps(ops, default=str)}\n\n"
                )
                yield (
                    f"id: {q_evt['id']}\nevent: kpi.queue_snapshot\n"
                    f"data: {json.dumps(q_evt, default=str)}\n\n"
                )
            except Exception as e:
                logger.debug("sse ops queue failed: %s", e)
                err = _evt("error", {"message": str(e)[:200]})
                yield f"event: error\ndata: {json.dumps(err)}\n\n"
            hb = _evt("heartbeat", {"n": n, "pull_mode": "interval"})
            yield f"event: heartbeat\ndata: {json.dumps(hb)}\n\n"
            await asyncio.sleep(float(interval_sec))

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws/ops")
async def ws_ops(websocket: WebSocket, token: str | None = None):
    """WebSocket primary channel for ops (subscribe + fresh KPI/queue snapshots).

    Auth: httpOnly cookie ``actira_access_token``, optional ``?token=`` Bearer,
    or lab-env anonymous when ENV is dev/test/local/lab.
    """
    if not _realtime_enabled():
        await websocket.close(code=4403)
        return

    raw = _token_from_ws(websocket, token)
    user = _decode_user(raw)
    if not user:
        env = (os.environ.get("ENV") or "dev").lower()
        if env in ("dev", "test", "local", "lab"):
            user = {"sub": "ws-anon", "role": "analyst"}
        else:
            await websocket.close(code=4401)
            return

    await websocket.accept()
    interval = 10.0
    try:
        qiv = websocket.query_params.get("interval_sec")
        if qiv:
            interval = max(3.0, min(60.0, float(qiv)))
    except (TypeError, ValueError):
        pass

    n = 0

    async def push_once() -> None:
        nonlocal n
        n += 1
        ops, q_evt = await _push_loop_body(n)
        await websocket.send_json(ops)
        await websocket.send_json(q_evt)

    try:
        try:
            await push_once()
        except Exception as e:
            logger.debug("ws ops initial push failed: %s", e)

        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.05)
                try:
                    data = json.loads(msg)
                    if data.get("op") == "ping":
                        await websocket.send_json(
                            {"type": "pong", "ts": datetime.now(timezone.utc).isoformat()}
                        )
                    if data.get("op") == "subscribe" and data.get("interval_sec"):
                        interval = max(3.0, min(60.0, float(data["interval_sec"])))
                except Exception:
                    pass
            except asyncio.TimeoutError:
                pass
            except WebSocketDisconnect:
                return
            try:
                await push_once()
            except WebSocketDisconnect:
                return
            except Exception as e:
                logger.debug("ws ops push failed: %s", e)
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        return
    except Exception as e:
        logger.debug("ws ops ended: %s", e)
        try:
            await websocket.close()
        except Exception:
            pass
