"""Local LanceDB vector store for KB chunks + incident embeddings.

Tables under ``backend/data/lancedb/`` (override with ``ACTIRA_LANCEDB_PATH``):

  - ``kb_chunks``: id, source, title, text, vector, metadata, embedder
  - ``incidents``: id, source, title, text, vector, metadata, embedder

Dense search is optional; when LanceDB or embeddings are unavailable, callers
fall back to BM25-only (see ``knowledge_base.KnowledgeBase.search``).
"""
from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

KB_TABLE = "kb_chunks"
INCIDENT_TABLE = "incidents"

_lock = threading.RLock()
_db = None
_path: Optional[Path] = None


def _default_path() -> Path:
    env = (os.environ.get("ACTIRA_LANCEDB_PATH") or "").strip()
    if env:
        return Path(env)
    return Path(__file__).resolve().parent / "data" / "lancedb"


def vector_store_enabled() -> bool:
    flag = (os.environ.get("ACTIRA_VECTOR_STORE") or "1").strip().lower()
    return flag not in ("0", "false", "off", "no", "disabled")


def get_db_path() -> Path:
    return _path or _default_path()


def connect(path: Optional[Path] = None):
    """Connect (or reconnect) to LanceDB at path."""
    global _db, _path
    if not vector_store_enabled():
        return None
    try:
        import lancedb  # noqa: F401
    except ImportError:
        logger.warning("lancedb not installed; vector store disabled")
        return None

    p = Path(path) if path else _default_path()
    p.mkdir(parents=True, exist_ok=True)
    with _lock:
        _path = p
        import lancedb

        _db = lancedb.connect(str(p))
        return _db


def _table_names(db) -> set:
    """Compatible table listing across lancedb versions."""
    if hasattr(db, "list_tables"):
        try:
            listed = db.list_tables()
            # newer APIs may return an object with .tables
            if hasattr(listed, "tables"):
                return set(listed.tables)
            if isinstance(listed, (list, tuple, set)):
                return set(listed)
        except Exception:
            pass
    if hasattr(db, "table_names"):
        try:
            return set(db.table_names())
        except Exception:
            pass
    return set()


def _db_or_connect():
    if not vector_store_enabled():
        return None
    if _db is None:
        return connect()
    return _db


def status() -> Dict[str, Any]:
    """Runtime status for Settings / health UI."""
    from backend.embeddings import get_embedder

    emb = get_embedder()
    info: Dict[str, Any] = {
        "enabled": vector_store_enabled(),
        "path": str(get_db_path()),
        "embedder": getattr(emb, "name", "unknown"),
        "dim": int(getattr(emb, "dim", 0) or 0),
        "lancedb_importable": False,
        "kb_rows": 0,
        "incident_rows": 0,
        "ok": False,
        "error": None,
    }
    try:
        import lancedb  # noqa: F401

        info["lancedb_importable"] = True
    except ImportError as e:
        info["error"] = f"lancedb missing: {e}"
        return info

    if not vector_store_enabled() or emb.dim <= 0:
        info["ok"] = vector_store_enabled() is False or emb.dim <= 0
        info["error"] = None if not vector_store_enabled() else "dense embeddings disabled"
        return info

    try:
        db = _db_or_connect()
        if db is None:
            info["error"] = "connect failed"
            return info
        names = _table_names(db)
        if KB_TABLE in names:
            info["kb_rows"] = db.open_table(KB_TABLE).count_rows()
        if INCIDENT_TABLE in names:
            info["incident_rows"] = db.open_table(INCIDENT_TABLE).count_rows()
        info["ok"] = True
    except Exception as e:
        info["error"] = str(e)
        logger.warning("vector_store status failed: %s", e)
    return info


def _meta_str(metadata: Optional[Dict[str, Any]]) -> str:
    try:
        return json.dumps(metadata or {}, ensure_ascii=False, default=str)
    except Exception:
        return "{}"


def _rows_from_docs(
        docs: Sequence[Dict[str, Any]],
        vectors: Sequence[Sequence[float]],
        embedder_name: str,
        *,
        source_override: Optional[str] = None,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for doc, vec in zip(docs, vectors):
        if not vec:
            continue
        rows.append(
            {
                "id": str(doc.get("id") or ""),
                "source": source_override or str(doc.get("source") or ""),
                "title": str(doc.get("title") or ""),
                "text": str(doc.get("text") or ""),
                "vector": list(vec),
                "metadata": _meta_str(
                    {
                        "tactic": doc.get("tactic"),
                        **(doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}),
                    }
                ),
                "embedder": embedder_name,
            }
        )
    return rows


def reindex_kb(docs: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Full rebuild of ``kb_chunks`` from in-code KB docs."""
    from backend.embeddings import get_embedder

    emb = get_embedder()
    if emb.dim <= 0:
        return {"ok": False, "reason": "embeddings_disabled", "rows": 0}

    db = _db_or_connect()
    if db is None:
        return {"ok": False, "reason": "lancedb_unavailable", "rows": 0}

    texts = [f"{d.get('title', '')} {d.get('text', '')}" for d in docs]
    vectors = emb.embed_texts(texts)
    rows = _rows_from_docs(docs, vectors, emb.name)
    if not rows:
        return {"ok": False, "reason": "no_rows", "rows": 0}

    with _lock:
        # mode=overwrite for clean rebuild when embedder/dim changes
        db.create_table(KB_TABLE, data=rows, mode="overwrite")
    logger.info("Reindexed %s KB chunks into LanceDB (%s)", len(rows), emb.name)
    return {"ok": True, "rows": len(rows), "embedder": emb.name, "dim": emb.dim}


def ensure_kb_indexed(docs: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    """Index KB if empty or embedder name mismatch."""
    from backend.embeddings import get_embedder

    emb = get_embedder()
    if emb.dim <= 0 or not vector_store_enabled():
        return {"ok": False, "reason": "disabled", "rows": 0}

    db = _db_or_connect()
    if db is None:
        return {"ok": False, "reason": "lancedb_unavailable", "rows": 0}

    try:
        names = _table_names(db)
        if KB_TABLE not in names:
            return reindex_kb(docs)
        tbl = db.open_table(KB_TABLE)
        n = tbl.count_rows()
        if n == 0:
            return reindex_kb(docs)
        # Sample first row for embedder mismatch
        sample = tbl.search().limit(1).to_list() if hasattr(tbl, "search") else []
        # Prefer take/head APIs
        try:
            sample = tbl.head(1).to_pylist() if hasattr(tbl, "head") else tbl.to_pandas().head(1).to_dict("records")
        except Exception:
            try:
                sample = tbl.to_pandas().head(1).to_dict("records")
            except Exception:
                sample = []
        if sample:
            prev = (sample[0] or {}).get("embedder")
            if prev and prev != emb.name:
                logger.info("Embedder changed %s → %s; reindexing KB", prev, emb.name)
                return reindex_kb(docs)
            vec = (sample[0] or {}).get("vector") or []
            if len(vec) != emb.dim:
                logger.info("Embedding dim changed %s → %s; reindexing KB", len(vec), emb.dim)
                return reindex_kb(docs)
        return {"ok": True, "rows": n, "embedder": emb.name, "dim": emb.dim, "cached": True}
    except Exception as e:
        logger.warning("ensure_kb_indexed failed, rebuilding: %s", e)
        return reindex_kb(docs)


def search_kb(query_vector: Sequence[float], top_k: int = 8) -> List[Dict[str, Any]]:
    """ANN search over KB chunks. Returns rows with ``_distance`` when available."""
    if not query_vector:
        return []
    db = _db_or_connect()
    if db is None:
        return []
    try:
        if KB_TABLE not in _table_names(db):
            return []
        tbl = db.open_table(KB_TABLE)
        hits = tbl.search(list(query_vector)).limit(int(top_k)).to_list()
        out: List[Dict[str, Any]] = []
        for h in hits:
            out.append(
                {
                    "id": h.get("id"),
                    "source": h.get("source"),
                    "title": h.get("title"),
                    "text": h.get("text"),
                    "metadata": h.get("metadata"),
                    "embedder": h.get("embedder"),
                    "_distance": h.get("_distance"),
                }
            )
        return out
    except Exception as e:
        logger.warning("search_kb failed: %s", e)
        return []


def upsert_incident(
        incident_id: str,
        title: str,
        text: str,
        *,
        metadata: Optional[Dict[str, Any]] = None,
) -> bool:
    """Embed and upsert one incident narrative for similar-case search."""
    from backend.embeddings import get_embedder

    emb = get_embedder()
    if emb.dim <= 0 or not vector_store_enabled():
        return False
    db = _db_or_connect()
    if db is None:
        return False

    blob = f"{title or ''}\n{text or ''}".strip()
    if not blob:
        return False
    vec = emb.embed_query(blob)
    row = {
        "id": str(incident_id),
        "source": "incident",
        "title": str(title or "")[:500],
        "text": str(text or "")[:8000],
        "vector": list(vec),
        "metadata": _meta_str(metadata or {}),
        "embedder": emb.name,
    }
    try:
        with _lock:
            names = _table_names(db)
            if INCIDENT_TABLE not in names:
                db.create_table(INCIDENT_TABLE, data=[row], mode="overwrite")
            else:
                tbl = db.open_table(INCIDENT_TABLE)
                # A-K3: safe delete — only allow alnum/hyphen/underscore ids
                safe_id = "".join(
                    ch for ch in str(incident_id) if ch.isalnum() or ch in "-_"
                )
                if safe_id and safe_id == str(incident_id):
                    try:
                        tbl.delete(f"id = '{safe_id}'")
                    except Exception:
                        pass
                elif safe_id:
                    try:
                        tbl.delete(f"id = '{safe_id}'")
                    except Exception:
                        pass
                tbl.add([row])
        return True
    except Exception as e:
        logger.warning("upsert_incident failed: %s", e)
        return False


def search_incidents(query_vector: Sequence[float], top_k: int = 5) -> List[Dict[str, Any]]:
    if not query_vector:
        return []
    db = _db_or_connect()
    if db is None:
        return []
    try:
        if INCIDENT_TABLE not in _table_names(db):
            return []
        tbl = db.open_table(INCIDENT_TABLE)
        hits = tbl.search(list(query_vector)).limit(int(top_k)).to_list()
        return [
            {
                "id": h.get("id"),
                "title": h.get("title"),
                "text": h.get("text"),
                "metadata": h.get("metadata"),
                "_distance": h.get("_distance"),
            }
            for h in hits
        ]
    except Exception as e:
        logger.warning("search_incidents failed: %s", e)
        return []


def rrf_fuse(
        ranked_lists: Sequence[Sequence[str]],
        *,
        k: int = 60,
        top_k: int = 8,
) -> List[str]:
    """Reciprocal Rank Fusion over ranked id lists.

    score(d) = Σ 1 / (k + rank_i(d))  with rank starting at 1.
    """
    scores: Dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked, start=1):
            if not doc_id:
                continue
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
    ordered = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [doc_id for doc_id, _ in ordered[:top_k]]


def rrf_scores(
        ranked_lists: Sequence[Sequence[str]],
        *,
        k: int = 60,
) -> Dict[str, float]:
    scores: Dict[str, float] = {}
    for ranked in ranked_lists:
        for rank, doc_id in enumerate(ranked, start=1):
            if not doc_id:
                continue
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (k + rank)
    return scores
