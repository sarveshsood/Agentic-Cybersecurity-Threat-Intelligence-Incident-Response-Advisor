"""Knowledge base API — thin adapters over kb_service."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Body, Depends, File, Form, Query, UploadFile

from backend.security import get_current_user, require_roles
from backend.services import kb_service
from backend.services.kb_service import LoraTrainRequest

router = APIRouter(tags=["kb"])


@router.get("/kb/search")
async def kb_search(
    q: str,
    mode: Optional[str] = Query(
        None,
        description="bm25 | hybrid | dense (default: ACTIRA_RETRIEVAL_MODE or hybrid)",
    ),
    top_k: int = Query(8, ge=1, le=30, description="Max ranked chunks to return"),
    user=Depends(get_current_user),
):
    return await kb_service.search(q, mode=mode, top_k=top_k)


@router.get("/kb/retrieval-eval")
async def kb_retrieval_eval(
    user=Depends(require_roles("admin")),
    top_k: int = Query(5, ge=1, le=20),
):
    return await kb_service.retrieval_eval(top_k=top_k)


@router.get("/kb/vector-status")
async def kb_vector_status(user=Depends(get_current_user)):
    return kb_service.vector_status()


@router.post("/kb/reindex")
async def kb_reindex(user=Depends(require_roles("admin"))):
    return await kb_service.reindex()


@router.get("/kb/lora/status")
async def kb_lora_status(user=Depends(get_current_user)):
    return kb_service.lora_status()


@router.post("/kb/lora/train")
async def kb_lora_train(
    body: LoraTrainRequest = Body(default=LoraTrainRequest()),
    user=Depends(require_roles("admin")),
):
    return await kb_service.lora_train(body, user)


@router.get("/kb/custom")
async def kb_list_custom(user=Depends(require_roles("admin"))):
    return kb_service.list_custom()


@router.post("/kb/ingest")
async def kb_ingest(
    user=Depends(require_roles("admin")),
    file: Optional[UploadFile] = File(None),
    title: Optional[str] = Form(None),
    doc_id: Optional[str] = Form(None),
    source: Optional[str] = Form("Custom"),
    text: Optional[str] = Form(None),
):
    return await kb_service.ingest(
        user, file=file, title=title, doc_id=doc_id, source=source, text=text
    )


@router.delete("/kb/custom/{doc_id}")
async def kb_delete_custom(doc_id: str, user=Depends(require_roles("admin"))):
    return await kb_service.delete_custom(doc_id, user)


@router.get("/kb/{doc_id}")
async def kb_doc(doc_id: str, user=Depends(get_current_user)):
    return kb_service.get_doc(doc_id)
