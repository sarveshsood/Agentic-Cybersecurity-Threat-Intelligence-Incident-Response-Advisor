"""Knowledge base search, ingest, LoRA, vector status."""
from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from backend.core import services as svc
from backend.database import db
from backend.knowledge_base import kb
from backend.models import new_id

logger = logging.getLogger("actira")


class LoraTrainRequest(BaseModel):
    method: str = Field("linear_lora")
    epochs: int = Field(8, ge=1, le=50)
    rank: int = Field(16, ge=1, le=128)
    lr: float = Field(0.05, gt=0, le=1.0)
    include_approved_incidents: bool = Field(True)
    activate: bool = Field(False)
    reindex: bool = Field(False)


async def search(q: str, mode: Optional[str] = None) -> Any:
    settings = await svc.get_settings()
    return kb.search(q, top_k=8, mode=mode, settings=settings)


async def retrieval_eval(top_k: int = 5) -> Any:
    from backend.retrieval_eval import run_retrieval_eval

    return await asyncio.to_thread(run_retrieval_eval, top_k=top_k)


def vector_status() -> Dict[str, Any]:
    st = kb.vector_status()
    try:
        from backend.lora_train import adapter_status

        st["lora"] = adapter_status()
    except Exception as e:
        st["lora"] = {"ok": False, "error": str(e)}
    return st


async def reindex() -> Any:
    return await asyncio.to_thread(kb.reindex_vectors)


def lora_status() -> Any:
    from backend.lora_train import adapter_status

    return adapter_status()


async def lora_train(body: LoraTrainRequest, user: dict) -> Dict[str, Any]:
    from backend.lora_train import DEFAULT_OUT, run_train
    import backend.embeddings as emb_mod

    incidents = None
    if body.include_approved_incidents:
        try:
            cur = db.incidents.find(
                {"status": {"$in": ["approved", "closed"]}},
                {
                    "title": 1,
                    "summary": 1,
                    "description": 1,
                    "techniques": 1,
                    "attack_techniques": 1,
                    "playbook": 1,
                    "playbook_steps": 1,
                    "status": 1,
                    "id": 1,
                },
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


def list_custom() -> Dict[str, Any]:
    return {"docs": kb.list_custom_docs()}


async def ingest(
    user: dict,
    *,
    file: Optional[UploadFile] = None,
    title: Optional[str] = None,
    doc_id: Optional[str] = None,
    source: Optional[str] = "Custom",
    text: Optional[str] = None,
) -> Dict[str, Any]:
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
    store = {
        **doc,
        "ingested_by": user.get("sub"),
        "ingested_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.kb_docs.update_one({"id": doc["id"]}, {"$set": store}, upsert=True)
    await svc.audit(
        user, "kb.ingest", "kb_doc", doc["id"], {"title": doc.get("title"), "chars": len(body)}
    )
    return {"ok": True, "doc": doc}


async def delete_custom(doc_id: str, user: dict) -> Dict[str, Any]:
    ok = kb.remove_custom_doc(doc_id)
    if not ok:
        raise HTTPException(404, "Custom document not found")
    await db.kb_docs.delete_one({"id": doc_id})
    await svc.audit(user, "kb.delete", "kb_doc", doc_id, {})
    return {"ok": True}


def get_doc(doc_id: str) -> Any:
    d = kb.get_by_id(doc_id)
    if not d:
        raise HTTPException(404, "Not found")
    return d
