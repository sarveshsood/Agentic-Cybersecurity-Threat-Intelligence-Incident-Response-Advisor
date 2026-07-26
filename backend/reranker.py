"""Optional Cohere re-ranking after hybrid BM25+dense retrieve.

Offline / demo safe:
  - No key → identity order (caller keeps hybrid RRF ranking)
  - ``ACTIRA_COHERE_RERANK=0`` → force skip even if key present
  - Network failures → fall back to original order

Env:
  COHERE_API_KEY | settings field ``cohere_api_key``
  ACTIRA_COHERE_MODEL (default rerank-english-v3.0)
  ACTIRA_COHERE_RERANK=1|0 (optional override)
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "rerank-english-v3.0"
COHERE_RERANK_URL = "https://api.cohere.com/v1/rerank"


def rerank_enabled(
        settings: Optional[Dict[str, Any]] = None,
        *,
        explicit: Optional[bool] = None,
) -> bool:
    """Whether re-rank should run (flag only — key checked separately)."""
    if explicit is not None:
        return bool(explicit)
    env = (os.environ.get("ACTIRA_COHERE_RERANK") or "").strip().lower()
    if env in ("0", "false", "off", "no", "disabled"):
        return False
    if env in ("1", "true", "on", "yes", "enabled"):
        return True
    if settings is not None and "cohere_rerank_enabled" in settings:
        return bool(settings.get("cohere_rerank_enabled"))
    # Default: on when a key will be available (resolved by caller)
    return True


def resolve_cohere_key(settings: Optional[Dict[str, Any]] = None) -> str:
    from backend.secrets_util import resolve_secret

    return resolve_secret(settings, "cohere_api_key", "COHERE_API_KEY")


def _doc_text(doc: Dict[str, Any]) -> str:
    title = str(doc.get("title") or "")
    text = str(doc.get("text") or "")
    blob = f"{title}\n{text}".strip()
    return blob[:4000] if blob else title or str(doc.get("id") or "")


def cohere_rerank(
        query: str,
        documents: Sequence[Dict[str, Any]],
        *,
        api_key: str,
        top_n: Optional[int] = None,
        model: Optional[str] = None,
        timeout: float = 12.0,
) -> List[Dict[str, Any]]:
    """Call Cohere Rerank API; return docs reordered with ``rerank_score``.

    On any failure returns the original ``documents`` list unchanged.
    """
    docs = list(documents)
    if not docs or not api_key or not (query or "").strip():
        return docs

    n = int(top_n) if top_n is not None else len(docs)
    n = max(1, min(n, len(docs)))
    model_name = (model or os.environ.get("ACTIRA_COHERE_MODEL") or DEFAULT_MODEL).strip()
    texts = [_doc_text(d) for d in docs]

    try:
        import requests
    except ImportError:
        logger.warning("requests missing; Cohere rerank skipped")
        return docs

    try:
        resp = requests.post(
            COHERE_RERANK_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model_name,
                "query": query,
                "documents": texts,
                "top_n": n,
                "return_documents": False,
            },
            timeout=timeout,
        )
        if resp.status_code >= 400:
            logger.warning("Cohere rerank HTTP %s: %s", resp.status_code, resp.text[:200])
            return docs
        data = resp.json()
        results = data.get("results") or []
        if not results:
            return docs
        out: List[Dict[str, Any]] = []
        for item in results:
            idx = int(item.get("index", -1))
            if idx < 0 or idx >= len(docs):
                continue
            row = dict(docs[idx])
            score = item.get("relevance_score")
            if score is not None:
                row["rerank_score"] = float(score)
            row["retriever"] = f"{row.get('retriever', 'hybrid')}+cohere"
            out.append(row)
        return out if out else docs
    except Exception as e:
        logger.warning("Cohere rerank failed: %s", e)
        return docs


def lexical_rerank(
        query: str,
        documents: Sequence[Dict[str, Any]],
        *,
        top_n: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Lightweight offline re-ranker (token overlap) for tests / no-key demos.

    Not a substitute for Cohere — used when ``ACTIRA_RERANK_BACKEND=lexical``.
    """
    docs = list(documents)
    if not docs:
        return docs
    q_tokens = set(_tokenize(query))
    if not q_tokens:
        return docs

    scored = []
    for d in docs:
        dtoks = set(_tokenize(_doc_text(d)))
        if not dtoks:
            overlap = 0.0
        else:
            overlap = len(q_tokens & dtoks) / max(len(q_tokens), 1)
        row = dict(d)
        row["rerank_score"] = float(overlap)
        row["retriever"] = f"{row.get('retriever', 'hybrid')}+lexical"
        scored.append(row)
    scored.sort(key=lambda x: x.get("rerank_score", 0.0), reverse=True)
    n = int(top_n) if top_n is not None else len(scored)
    return scored[: max(1, min(n, len(scored)))]


def _tokenize(text: str) -> List[str]:
    import re

    return re.findall(r"[a-z0-9]+", (text or "").lower())


def maybe_rerank(
        query: str,
        documents: Sequence[Dict[str, Any]],
        *,
        settings: Optional[Dict[str, Any]] = None,
        top_n: Optional[int] = None,
        api_key: Optional[str] = None,
        enabled: Optional[bool] = None,
) -> List[Dict[str, Any]]:
    """Re-rank if enabled and a backend is available; else return docs as-is."""
    docs = list(documents)
    if not docs:
        return docs
    if not rerank_enabled(settings, explicit=enabled):
        return docs

    backend = (os.environ.get("ACTIRA_RERANK_BACKEND") or "cohere").strip().lower()
    if backend in ("lexical", "local", "mock"):
        return lexical_rerank(query, docs, top_n=top_n)

    key = (api_key or "").strip() or resolve_cohere_key(settings)
    if not key:
        return docs
    return cohere_rerank(query, docs, api_key=key, top_n=top_n)
