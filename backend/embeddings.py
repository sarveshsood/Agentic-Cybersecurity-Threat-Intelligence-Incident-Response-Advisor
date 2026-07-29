"""Pluggable text embedders for LanceDB ANN (offline-safe by default).

Backends (env ``ACTIRA_EMBEDDING_BACKEND``):
  - ``hash`` (default) — deterministic character n-gram hashing, no model download.
  - ``lora`` — hash + trained low-rank adapter (``ACTIRA_LORA_PATH``; see ``lora_train``).
  - ``sbert`` — optional ``sentence-transformers`` model (``ACTIRA_EMBEDDING_MODEL``).
  - ``none`` — dense path disabled (BM25-only).

Domain fine-tune: ``python -m lora_train`` exports an adapter; set backend to ``lora``
and reindex. Optional PEFT/sbert path documented in ``lora_train.train_peft_lora``.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Sequence

import numpy as np

logger = logging.getLogger(__name__)

DEFAULT_DIM = 384
_TOKEN_RE = re.compile(r"[a-z0-9]+", re.I)

# Selected base models (roadmap rm-w1-embeddings).
# Default offline path stays ``hash``; sbert uses RECOMMENDED_SBERT_MODEL.
RECOMMENDED_SBERT_MODEL = "BAAI/bge-small-en-v1.5"
FALLBACK_SBERT_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
# Larger option when GPU/RAM allow (set ACTIRA_EMBEDDING_MODEL explicitly)
DOMAIN_CANDIDATE_MODELS = (
    "BAAI/bge-small-en-v1.5",
    "BAAI/bge-base-en-v1.5",
    "intfloat/e5-base-v2",
    "sentence-transformers/all-MiniLM-L6-v2",
)

DEFAULT_LORA_PATH = Path(__file__).resolve().parent / "data" / "lora_adapters" / "latest"


def _env_backend() -> str:
    """Resolve backend from explicit ACTIRA_EMBEDDING_BACKEND or profile.

    Profiles (ACTIRA_EMBEDDING_PROFILE):
      - ``offline`` / default — hash
      - ``quality`` / ``sbert`` — try sentence-transformers (falls back to hash)
    """
    explicit = (os.environ.get("ACTIRA_EMBEDDING_BACKEND") or "").strip().lower()
    if explicit:
        return explicit
    profile = (os.environ.get("ACTIRA_EMBEDDING_PROFILE") or "offline").strip().lower()
    if profile in ("quality", "sbert", "semantic", "prod", "production"):
        return "sbert"
    return "hash"


def _env_model() -> str:
    return (
            os.environ.get("ACTIRA_EMBEDDING_MODEL")
            or RECOMMENDED_SBERT_MODEL
            or FALLBACK_SBERT_MODEL
    ).strip()


def _env_dim() -> int:
    raw = os.environ.get("ACTIRA_EMBEDDING_DIM", str(DEFAULT_DIM))
    try:
        d = int(raw)
        return d if d >= 32 else DEFAULT_DIM
    except ValueError:
        return DEFAULT_DIM


class Embedder(ABC):
    name: str
    dim: int

    @abstractmethod
    def embed_texts(self, texts: Sequence[str]) -> List[List[float]]:
        ...

    def embed_query(self, text: str) -> List[float]:
        return self.embed_texts([text or ""])[0]


class NoneEmbedder(Embedder):
    """Dense path off — callers should skip ANN."""

    name = "none"
    dim = 0

    def embed_texts(self, texts: Sequence[str]) -> List[List[float]]:
        return [[] for _ in texts]


class HashingEmbedder(Embedder):
    """Signed character n-gram hashing into a fixed L2-normalized vector.

    Stable across processes; good enough for hybrid RRF scaffolding without
    downloading Hugging Face weights.
    """

    name = "hash"

    def __init__(self, dim: int = DEFAULT_DIM, ngram_min: int = 3, ngram_max: int = 5):
        self.dim = int(dim)
        self.ngram_min = ngram_min
        self.ngram_max = ngram_max

    def _ngrams(self, text: str) -> List[str]:
        t = re.sub(r"\s+", " ", (text or "").lower()).strip()
        if not t:
            return []
        grams: List[str] = []
        # word tokens help security terms (cve, log4j, brute)
        for tok in _TOKEN_RE.findall(t):
            grams.append(f"w:{tok}")
        compact = t.replace(" ", "")
        for n in range(self.ngram_min, self.ngram_max + 1):
            if len(compact) < n:
                continue
            for i in range(len(compact) - n + 1):
                grams.append(compact[i: i + n])
        return grams

    def embed_texts(self, texts: Sequence[str]) -> List[List[float]]:
        out: List[List[float]] = []
        for text in texts:
            vec = np.zeros(self.dim, dtype=np.float32)
            grams = self._ngrams(text)
            if not grams:
                out.append(vec.tolist())
                continue
            for g in grams:
                h = hashlib.blake2b(g.encode("utf-8"), digest_size=8).digest()
                idx = int.from_bytes(h[:4], "little") % self.dim
                sign = 1.0 if (h[4] & 1) == 0 else -1.0
                vec[idx] += sign
            norm = float(np.linalg.norm(vec))
            if norm > 0:
                vec /= norm
            out.append(vec.tolist())
        return out


class SentenceTransformersEmbedder(Embedder):
    """Optional dense model via sentence-transformers (heavier install)."""

    name = "sbert"

    def __init__(self, model_name: Optional[str] = None):
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "sentence-transformers not installed; pip install sentence-transformers "
                "or set ACTIRA_EMBEDDING_BACKEND=hash"
            ) from e
        self.model_name = model_name or _env_model()
        self._model = SentenceTransformer(self.model_name)
        # Infer dim from a tiny encode
        probe = self._model.encode(["probe"], normalize_embeddings=True)
        self.dim = int(probe.shape[1])
        self.name = f"sbert:{self.model_name}"

    def embed_texts(self, texts: Sequence[str]) -> List[List[float]]:
        if not texts:
            return []
        arr = self._model.encode(
            list(texts),
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return [row.astype(np.float32).tolist() for row in np.asarray(arr)]


class LoraAdapterEmbedder(Embedder):
    """Hashing embedder + residual low-rank domain adapter (``lora_train`` export)."""

    name = "lora"

    def __init__(self, adapter_path: Optional[str] = None, dim: Optional[int] = None):
        from backend.lora_train import load_adapter

        path = Path(
            adapter_path
            or os.environ.get("ACTIRA_LORA_PATH")
            or DEFAULT_LORA_PATH
        )
        self.adapter_path = str(path)
        self._adapter = load_adapter(path)
        self.dim = int(self._adapter.dim or dim or _env_dim())
        self._base = HashingEmbedder(dim=self.dim)
        self.name = f"lora:{self._adapter.method}:r{self._adapter.rank}"

    def embed_texts(self, texts: Sequence[str]) -> List[List[float]]:
        base_vecs = self._base.embed_texts(texts)
        return [self._adapter.apply(v) for v in base_vecs]


def _env_lora_path() -> str:
    return (os.environ.get("ACTIRA_LORA_PATH") or str(DEFAULT_LORA_PATH)).strip()


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    """Process-wide embedder singleton (cached)."""
    backend = _env_backend()
    if backend in ("none", "off", "disabled", "0", "false"):
        logger.info("Embedding backend=none (BM25-only retrieval)")
        return NoneEmbedder()
    if backend in ("lora", "adapter", "hash_lora", "linear_lora"):
        try:
            emb = LoraAdapterEmbedder(adapter_path=_env_lora_path())
            logger.info("Embedding backend=%s dim=%s path=%s", emb.name, emb.dim, emb.adapter_path)
            return emb
        except Exception as e:
            logger.warning("lora embedder failed (%s); falling back to hash", e)
    if backend in ("sbert", "sentence", "sentence-transformers", "st"):
        try:
            emb = SentenceTransformersEmbedder()
            logger.info("Embedding backend=%s dim=%s", emb.name, emb.dim)
            return emb
        except Exception as e:
            logger.warning("sbert embedder failed (%s); falling back to hash", e)
    # default hash
    emb = HashingEmbedder(dim=_env_dim())
    logger.info("Embedding backend=hash dim=%s", emb.dim)
    return emb


def reset_embedder_cache() -> None:
    """Test helper — clear singleton after env changes."""
    get_embedder.cache_clear()


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = float(np.linalg.norm(va))
    nb = float(np.linalg.norm(vb))
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))
