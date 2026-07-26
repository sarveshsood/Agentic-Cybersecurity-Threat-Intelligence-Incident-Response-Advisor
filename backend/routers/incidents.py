"""ACTIRA API routes — auto-split from server.py (v1.1 modularization)."""
from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, Query,
)

from backend.auth import (
    get_current_user,
)
from backend.core.database import db
from backend.knowledge_base import kb

router = APIRouter(tags=['incidents'])


# ---------- Incidents ----------
@router.get("/incidents")
async def list_incidents(
        status: Optional[str] = None,
        severity: Optional[str] = None,
        technique: Optional[str] = Query(
            None,
            description="Filter by ATT&CK technique or parent (e.g. T1110 or T1110.003)",
        ),
        skip: int = Query(0, ge=0),
        limit: int = Query(50, ge=1, le=200),
        user=Depends(get_current_user),
):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    if severity:
        query["severity"] = severity
    if technique:
        tid = technique.strip().upper()
        # Match exact technique_id or parent_id (sub-technique filter by parent)
        query["$or"] = [
            {"techniques.technique_id": tid},
            {"techniques.parent_id": tid},
            # parent gold often stored only as T1110 while doc has T1110.003
            {"techniques.technique_id": {"$regex": f"^{re.escape(tid)}\\."}},
        ]
    cursor = db.incidents.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit)
    docs = await cursor.to_list(limit)
    return docs


@router.get("/attack/catalog")
async def attack_catalog_list(user=Depends(get_current_user)):
    """List curated ATT&CK techniques + sub-techniques for drill-down UI."""
    from backend.attack_catalog import list_catalog
    return {"techniques": list_catalog()}


@router.get("/attack/catalog/{technique_id}")
async def attack_catalog_get(technique_id: str, user=Depends(get_current_user)):
    from backend.attack_catalog import catalog_entry_for_api, children_of
    entry = catalog_entry_for_api(technique_id)
    if not entry:
        raise HTTPException(404, f"Unknown technique {technique_id}")
    # siblings under same parent for UI tree
    parent = entry.get("parent_id")
    if parent:
        entry["siblings"] = [
            catalog_entry_for_api(c) for c in children_of(parent)
            if catalog_entry_for_api(c)
        ]
    return entry


@router.get("/incidents/{incident_id}")
async def get_incident(incident_id: str, user=Depends(get_current_user)):
    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Incident not found")
    return doc


@router.get("/incidents/{incident_id}/citations")
async def get_citations(incident_id: str, user=Depends(get_current_user)):
    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    ids = set()
    if doc.get("playbook"):
        for step in doc["playbook"].get("steps", []):
            for cid in step.get("citation_ids", []):
                ids.add(cid)
    return [kb.get_by_id(i) for i in ids if kb.get_by_id(i)]


@router.get("/incidents/{incident_id}/similar")
async def similar_incidents(
        incident_id: str,
        top_k: int = Query(5, ge=1, le=20),
        user=Depends(get_current_user),
):
    """LanceDB ANN over incident embeddings — similar past cases (excludes self)."""
    doc = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Incident not found")

    def _search():
        from backend.embeddings import get_embedder
        from backend.vector_store import search_incidents, vector_store_enabled, status as vs_status

        if not vector_store_enabled():
            return {"items": [], "reason": "vector_store_disabled", "vector_store": vs_status()}
        emb = get_embedder()
        if emb.dim <= 0:
            return {"items": [], "reason": "embeddings_disabled", "vector_store": vs_status()}
        blob = " ".join(
            filter(
                None,
                [
                    doc.get("title") or "",
                    doc.get("summary") or "",
                    " ".join(
                        (t.get("technique_id") or "")
                        for t in (doc.get("techniques") or [])[:8]
                    ),
                ],
            )
        )
        if not blob.strip():
            return {"items": [], "reason": "empty_narrative", "vector_store": vs_status()}
        qv = emb.embed_query(blob)
        # fetch extra so we can drop self
        hits = search_incidents(qv, top_k=int(top_k) + 3)
        items = []
        for h in hits:
            hid = str(h.get("id") or "")
            if not hid or hid == incident_id:
                continue
            dist = h.get("_distance")
            score = 1.0 / (1.0 + float(dist)) if dist is not None else None
            items.append(
                {
                    "id": hid,
                    "title": h.get("title"),
                    "text_preview": (h.get("text") or "")[:280],
                    "distance": dist,
                    "score": round(score, 4) if score is not None else None,
                    "metadata": h.get("metadata"),
                }
            )
            if len(items) >= top_k:
                break
        return {
            "items": items,
            "reason": None if items else "no_neighbors",
            "vector_store": vs_status(),
            "query_embedder": emb.name,
            "top_k": top_k,
        }

    return await asyncio.to_thread(_search)
