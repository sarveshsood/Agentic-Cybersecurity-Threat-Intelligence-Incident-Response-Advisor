"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File, Form,
    Body, Query,
)
from pydantic import BaseModel, Field

from backend.auth import (
    get_current_user, require_roles,
)
from backend.core import services as svc
from backend.core.database import db
from backend.knowledge_base import kb
from backend.models import (
    new_id,
)

logger = logging.getLogger("actira")

router = APIRouter(tags=['kb'])


# ---------- Knowledge Base ----------
@router.get("/kb/search")
async def kb_search(
        q: str,
        mode: Optional[str] = Query(
            None,
            description="bm25 | hybrid | dense (default: ACTIRA_RETRIEVAL_MODE or hybrid)",
        ),
        user=Depends(get_current_user),
):
    settings = await svc.get_settings()
    return kb.search(q, top_k=8, mode=mode, settings=settings)


@router.get("/kb/retrieval-eval")
async def kb_retrieval_eval(
        user=Depends(require_roles("admin")),
        top_k: int = Query(5, ge=1, le=20),
):
    """Offline hit@k on golden Q→doc pairs (admin). No external APIs required."""
    from backend.retrieval_eval import run_retrieval_eval

    return await asyncio.to_thread(run_retrieval_eval, top_k=top_k)


@router.get("/kb/vector-status")
async def kb_vector_status(user=Depends(get_current_user)):
    """LanceDB + embedder runtime status (no secrets)."""
    st = kb.vector_status()
    try:
        from backend.lora_train import adapter_status

        st["lora"] = adapter_status()
    except Exception as e:
        st["lora"] = {"ok": False, "error": str(e)}
    return st


@router.post("/kb/reindex")
async def kb_reindex(user=Depends(require_roles("admin"))):
    """Force rebuild of local LanceDB KB chunks (admin)."""
    result = await asyncio.to_thread(kb.reindex_vectors)
    return result


class LoraTrainRequest(BaseModel):
    """Admin domain embedding fine-tune (rm-w1-embeddings LoRA)."""

    method: str = Field(
        "linear_lora",
        description="linear_lora (offline numpy) | peft (requires torch/sentence-transformers)",
    )
    epochs: int = Field(8, ge=1, le=50)
    rank: int = Field(16, ge=1, le=128)
    lr: float = Field(0.05, gt=0, le=1.0)
    include_approved_incidents: bool = Field(
        True,
        description="Merge approved/closed incident playbooks into the training corpus",
    )
    activate: bool = Field(
        False,
        description="If true, set process env to lora backend and reset embedder cache (this worker)",
    )
    reindex: bool = Field(
        False,
        description="If true (and activate), rebuild LanceDB KB vectors after train",
    )


@router.get("/kb/lora/status")
async def kb_lora_status(user=Depends(get_current_user)):
    """Domain adapter status (path, rank, last train meta)."""
    from backend.lora_train import adapter_status

    return adapter_status()


@router.post("/kb/lora/train")
async def kb_lora_train(
        body: LoraTrainRequest = Body(default=LoraTrainRequest()),
        user=Depends(require_roles("admin")),
):
    """Train/export domain embedding adapter from golden pairs (+ optional approved incidents).

    Offline default: linear_lora (numpy, no HF download). After train, set
    ACTIRA_EMBEDDING_BACKEND=lora and reindex, or pass activate=true on this worker.
    """
    from backend.lora_train import DEFAULT_OUT, run_train
    import backend.embeddings as emb_mod

    incidents = None
    if body.include_approved_incidents:
        try:
            cur = db.incidents.find(
                {"status": {"$in": ["approved", "closed"]}},
                {"title": 1, "summary": 1, "description": 1, "techniques": 1,
                 "attack_techniques": 1, "playbook": 1, "playbook_steps": 1,
                 "status": 1, "id": 1},
            ).limit(200)
            incidents = await cur.to_list(200)
        except Exception as e:
            logger.warning("lora train: could not load approved incidents: %s", e)
            incidents = []

    def _train():
        return run_train(
            method=body.method,
            out_dir=DEFAULT_OUT,
            incidents=incidents,
            rank=body.rank,
            epochs=body.epochs,
            lr=body.lr,
            evaluate=True,
        )

    try:
        result = await asyncio.to_thread(_train)
    except Exception as e:
        logger.exception("lora train failed")
        raise HTTPException(400, f"LoRA train failed: {e}") from e

    if body.activate and result.get("ok"):
        os.environ["ACTIRA_EMBEDDING_BACKEND"] = "lora"
        os.environ["ACTIRA_LORA_PATH"] = str(result.get("out_dir") or DEFAULT_OUT)
        emb_mod.reset_embedder_cache()
        result["activated"] = True
        result["embedder"] = emb_mod.get_embedder().name
        if body.reindex:
            result["reindex"] = await asyncio.to_thread(kb.reindex_vectors)

    result["trained_by"] = user.get("sub")
    return result


@router.get("/kb/custom")
async def kb_list_custom(user=Depends(require_roles("admin"))):
    """List admin-ingested custom KB documents (A-K2)."""
    return {"docs": kb.list_custom_docs()}


@router.post("/kb/ingest")
async def kb_ingest(
        user=Depends(require_roles("admin")),
        file: Optional[UploadFile] = File(None),
        title: Optional[str] = Form(None),
        doc_id: Optional[str] = Form(None),
        source: Optional[str] = Form("Custom"),
        text: Optional[str] = Form(None),
):
    """A-K2: ingest a custom KB document (text body or uploaded .txt/.md)."""
    body = (text or "").strip()
    fname = None
    if file is not None:
        fname = file.filename or "upload.txt"
        raw = await file.read()
        if len(raw) > 512 * 1024:
            raise HTTPException(413, "KB upload max 512KB")
        body = raw.decode("utf-8", errors="ignore").strip()
        if not title:
            title = Path(fname).stem.replace("_", " ").replace("-", " ")
        if not doc_id:
            stem = Path(fname).stem.upper()
            doc_id = re.sub(r"[^A-Z0-9._-]", "-", stem)[:40] or "CUSTOM"
            if not doc_id.startswith("CUSTOM"):
                doc_id = f"CUSTOM-{doc_id}"
    if not body:
        raise HTTPException(400, "Provide text or a file")
    try:
        doc = kb.add_custom_doc(
            doc_id=doc_id or f"CUSTOM-{new_id()[:8].upper()}",
            title=title or "Custom document",
            text=body,
            source=source or "Custom",
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    # Durable store
    store = {**doc, "ingested_by": user.get("sub"), "ingested_at": datetime.now(timezone.utc).isoformat()}
    await db.kb_docs.update_one({"id": doc["id"]}, {"$set": store}, upsert=True)
    await svc.audit(user, "kb.ingest", "kb_doc", doc["id"], {"title": doc.get("title"), "chars": len(body)})
    return {"ok": True, "doc": doc}


@router.delete("/kb/custom/{doc_id}")
async def kb_delete_custom(doc_id: str, user=Depends(require_roles("admin"))):
    ok = kb.remove_custom_doc(doc_id)
    if not ok:
        raise HTTPException(404, "Custom document not found")
    await db.kb_docs.delete_one({"id": doc_id})
    await svc.audit(user, "kb.delete", "kb_doc", doc_id, {})
    return {"ok": True}


@router.get("/kb/{doc_id}")
async def kb_doc(doc_id: str, user=Depends(get_current_user)):
    d = kb.get_by_id(doc_id)
    if not d:
        raise HTTPException(404, "Not found")
    return d
