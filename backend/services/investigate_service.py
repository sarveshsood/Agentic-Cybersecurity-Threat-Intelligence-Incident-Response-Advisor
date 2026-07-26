"""AI investigation + job phase SSE helpers."""
from __future__ import annotations

import asyncio
import json as _json
import logging
from datetime import datetime, timezone
from typing import Any, AsyncIterator, Dict, Optional

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.core import services as svc
from backend.database import db
from backend.models import new_id

logger = logging.getLogger("actira")


class InvestigateRequest(BaseModel):
    question: str


def sse_pack(payload: Dict[str, Any], event: Optional[str] = None) -> str:
    data = _json.dumps(payload, default=str)
    if event:
        return f"event: {event}\ndata: {data}\n\n"
    return f"data: {data}\n\n"


async def investigate(incident_id: str, body: InvestigateRequest, user: dict) -> Any:
    from backend.ai_investigator import investigate as _investigate

    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Incident not found")
    settings = await svc.get_settings()
    result = await _investigate(
        doc,
        body.question,
        provider=settings.get("llm_provider", "anthropic"),
        model=settings.get("llm_model", "claude-sonnet-4-6"),
        settings=settings,
    )
    await db.investigations.insert_one(
        {
            "id": new_id(),
            "incident_id": incident_id,
            "user_id": user["sub"],
            "question": body.question,
            "answer": result,
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    return result


async def investigate_stream_response(
    incident_id: str, body: InvestigateRequest, user: dict
) -> StreamingResponse:
    from backend.ai_investigator import investigate_stream

    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Incident not found")
    if not (body.question or "").strip():
        raise HTTPException(400, "question is required")

    settings = await svc.get_settings()
    provider = settings.get("llm_provider", "anthropic")
    model = settings.get("llm_model", "claude-sonnet-4-6")
    user_id = user["sub"]
    q = body.question.strip()

    async def event_gen():
        yield sse_pack(
            {"type": "status", "phase": "started", "message": "Investigation started"},
            event="status",
        )
        try:
            async for ev in investigate_stream(
                doc, q, provider=provider, model=model, settings=settings
            ):
                et = ev.get("type") or "message"
                if et == "done":
                    answer = ev.get("answer") or {}
                    inv_id = new_id()
                    try:
                        await db.investigations.insert_one(
                            {
                                "id": inv_id,
                                "incident_id": incident_id,
                                "user_id": user_id,
                                "question": q,
                                "answer": answer,
                                "ts": datetime.now(timezone.utc).isoformat(),
                                "streamed": True,
                            }
                        )
                    except Exception as persist_err:
                        logger.exception(
                            "investigate stream: failed to persist investigation %s: %s",
                            inv_id,
                            persist_err,
                        )
                    yield sse_pack(
                        {
                            "type": "done",
                            "id": inv_id,
                            "answer": answer,
                            "question": q,
                        },
                        event="done",
                    )
                elif et == "error":
                    yield sse_pack(ev, event="error")
                elif et == "token":
                    yield sse_pack(ev, event="token")
                elif et == "meta":
                    yield sse_pack(ev, event="meta")
                else:
                    yield sse_pack(ev, event=et)
        except Exception as e:
            logger.exception("investigate stream failed for incident %s", incident_id)
            yield sse_pack(
                {"type": "error", "message": str(e) or type(e).__name__},
                event="error",
            )

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


async def list_investigations(incident_id: str) -> list:
    return (
        await db.investigations.find({"incident_id": incident_id}, {"_id": 0})
        .sort("ts", -1)
        .to_list(50)
    )


def starter_questions() -> list:
    from backend.ai_investigator import STARTER_QUESTIONS

    return STARTER_QUESTIONS


async def job_phase_events_response(job_id: str) -> StreamingResponse:
    terminal = {"done", "failed", "error", "completed"}

    async def event_gen():
        last_status = None
        last_phase = None
        for _ in range(120):
            doc = await db.log_jobs.find_one({"id": job_id}, {"_id": 0})
            if not doc:
                yield sse_pack({"type": "error", "message": "Job not found"}, event="error")
                return
            status = doc.get("status")
            phase = doc.get("phase") or doc.get("current_phase")
            progress = doc.get("progress")
            ids = doc.get("incident_ids") or []
            if not isinstance(ids, list):
                ids = []
            first_id = ids[0] if ids else doc.get("incident_id")
            payload = {
                "type": "phase",
                "job_id": job_id,
                "status": status,
                "phase": phase,
                "progress": progress,
                "message": doc.get("message") or doc.get("error"),
                "incident_ids": ids,
                "incident_id": first_id,
            }
            if status != last_status or phase != last_phase:
                yield sse_pack(payload, event="phase")
                last_status, last_phase = status, phase
            if str(status or "").lower() in terminal:
                yield sse_pack({**payload, "type": "done"}, event="done")
                return
            await asyncio.sleep(1.0)
        yield sse_pack(
            {"type": "error", "message": "Job phase stream timed out"},
            event="error",
        )

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
