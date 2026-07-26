"""Incident listing / detail / related-resource business logic."""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Optional

from fastapi import HTTPException

from backend.repositories.incidents import incidents_repo


async def list_incidents(
    *,
    status: Optional[str] = None,
    severity: Optional[str] = None,
    technique: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    include_meta: bool = False,
) -> Any:
    """List incidents. When include_meta=True return {items,total,skip,limit} for pagination."""
    items = await incidents_repo.list_filtered(
        status=status,
        severity=severity,
        technique=technique,
        skip=skip,
        limit=limit,
    )
    if not include_meta:
        return items
    total = await incidents_repo.count_filtered(
        status=status,
        severity=severity,
        technique=technique,
    )
    return {
        "items": items,
        "total": total,
        "skip": skip,
        "limit": limit,
    }


async def get_incident(incident_id: str) -> Dict[str, Any]:
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")
    return doc


async def get_citations(incident_id: str) -> List[Any]:
    from backend.knowledge_base import kb

    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Not found")
    ids = set()
    if doc.get("playbook"):
        for step in doc["playbook"].get("steps", []) or []:
            for cid in step.get("citation_ids", []) or []:
                ids.add(cid)
    return [kb.get_by_id(i) for i in ids if kb.get_by_id(i)]


async def similar_incidents(incident_id: str, *, top_k: int = 5) -> Dict[str, Any]:
    """LanceDB ANN over incident embeddings — similar past cases (excludes self)."""
    doc = await incidents_repo.find_by_id(incident_id)
    if not doc:
        raise HTTPException(404, "Incident not found")

    def _search():
        from backend.embeddings import get_embedder
        from backend.vector_store import search_incidents, status as vs_status, vector_store_enabled

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


def list_attack_catalog() -> Dict[str, Any]:
    from backend.attack_catalog import list_catalog

    return {"techniques": list_catalog()}


def attack_matrix() -> dict:
    from backend.attack_catalog import matrix_layout

    return matrix_layout()


def get_attack_catalog_entry(technique_id: str) -> Dict[str, Any]:
    from backend.attack_catalog import catalog_entry_for_api, children_of

    entry = catalog_entry_for_api(technique_id)
    if not entry:
        raise HTTPException(404, f"Unknown technique {technique_id}")
    parent = entry.get("parent_id")
    if parent:
        entry["siblings"] = [
            catalog_entry_for_api(c)
            for c in children_of(parent)
            if catalog_entry_for_api(c)
        ]
    return entry
