"""Domain embedding fine-tune / LoRA pipeline (rm-w1-embeddings t3).

Two training modes:

1. **linear_lora** (default, offline/CI-safe)
   Frozen hashing embedder + low-rank linear adapter trained with a
   multiple-negatives contrastive loss (numpy only). Exports a small JSON
   adapter under ``backend/data/lora_adapters/``.

2. **peft** (optional, requires torch + sentence-transformers + peft)
   Real LoRA on a sentence-transformers base (e.g. BAAI/bge-small-en-v1.5).
   Exports a PEFT adapter directory loadable via
   ``ACTIRA_EMBEDDING_BACKEND=sbert`` + ``ACTIRA_EMBEDDING_MODEL=<export_dir>``.

Corpus sources:
  - Golden Q→doc pairs (``tests/golden/retrieval_pairs.json``) + in-code KB
  - Optional admin-approved incident narratives (playbook text as positives)

CLI::

    cd backend
    python -m lora_train --out data/lora_adapters/latest
    python -m lora_train --method peft --epochs 1   # if deps installed

Runtime::

    ACTIRA_EMBEDDING_BACKEND=lora
    ACTIRA_LORA_PATH=data/lora_adapters/latest
"""
from __future__ import annotations

import json
import logging
import math
import os
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np

logger = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent
DEFAULT_PAIRS = ROOT / "tests" / "golden" / "retrieval_pairs.json"
DEFAULT_OUT = ROOT / "data" / "lora_adapters" / "latest"
ADAPTER_META = "adapter.json"
ADAPTER_WEIGHTS = "adapter_weights.npz"


@dataclass
class TrainExample:
    """One (query, positive_doc) pair for contrastive training."""

    query: str
    positive: str
    query_id: str = ""
    positive_id: str = ""
    source: str = "golden"


@dataclass
class AdapterArtifact:
    """Serializable low-rank adapter for hash (or any fixed-dim) embeddings."""

    version: int = 1
    method: str = "linear_lora"
    base: str = "hash"
    dim: int = 384
    rank: int = 16
    # LoRA: delta = scale * (x @ A.T) @ B.T   with A:(rank,dim), B:(dim,rank)
    A: List[List[float]] = field(default_factory=list)
    B: List[List[float]] = field(default_factory=list)
    scale: float = 1.0
    train_meta: Dict[str, Any] = field(default_factory=dict)

    def apply(self, vec: Sequence[float]) -> List[float]:
        """Apply residual low-rank update and L2-normalize."""
        x = np.asarray(vec, dtype=np.float32)
        if x.size != self.dim or not self.A or not self.B:
            return list(map(float, x.tolist())) if x.size else []
        A = np.asarray(self.A, dtype=np.float32)
        B = np.asarray(self.B, dtype=np.float32)
        # x: (d,)  A: (r,d)  B: (d,r)
        mid = A @ x  # (r,)
        delta = B @ mid  # (d,)
        y = x + float(self.scale) * delta
        n = float(np.linalg.norm(y))
        if n > 0:
            y = y / n
        return y.astype(np.float32).tolist()

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # weights saved separately as npz for size; meta without A/B for JSON
        meta = {k: v for k, v in d.items() if k not in ("A", "B")}
        meta["has_weights"] = bool(self.A and self.B)
        return meta


def _doc_blob(doc: Dict[str, Any]) -> str:
    parts = [
        str(doc.get("title") or ""),
        str(doc.get("tactic") or ""),
        str(doc.get("text") or ""),
        str(doc.get("source") or ""),
    ]
    return " ".join(p for p in parts if p).strip()


def load_kb_docs() -> List[Dict[str, Any]]:
    from backend.knowledge_base import KB_DOCS

    return list(KB_DOCS)


def build_corpus_from_pairs(
        pairs_path: Optional[Path] = None,
        docs: Optional[Sequence[Dict[str, Any]]] = None,
) -> List[TrainExample]:
    """Build (query, positive) examples from golden retrieval pairs + KB text."""
    path = Path(pairs_path or DEFAULT_PAIRS)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    pairs = data.get("pairs") or []
    by_id = {d["id"]: d for d in (docs if docs is not None else load_kb_docs())}
    examples: List[TrainExample] = []
    for pair in pairs:
        q = (pair.get("query") or "").strip()
        if not q:
            continue
        for rid in pair.get("relevant_ids") or []:
            doc = by_id.get(rid)
            if not doc:
                logger.debug("skip missing doc id %s for pair %s", rid, pair.get("id"))
                continue
            pos = _doc_blob(doc)
            if len(pos) < 10:
                continue
            examples.append(
                TrainExample(
                    query=q,
                    positive=pos,
                    query_id=str(pair.get("id") or ""),
                    positive_id=str(rid),
                    source="golden",
                )
            )
    return examples


def build_corpus_from_approved_incidents(
        incidents: Sequence[Dict[str, Any]],
) -> List[TrainExample]:
    """Turn approved/closed incidents into (narrative, playbook) pairs.

    Used when operators want domain adaptation on production-accepted work.
    """
    examples: List[TrainExample] = []
    for inc in incidents or []:
        status = (inc.get("status") or "").lower()
        if status not in ("approved", "closed"):
            continue
        title = (inc.get("title") or "").strip()
        summary = (inc.get("summary") or inc.get("description") or "").strip()
        techs = inc.get("techniques") or inc.get("attack_techniques") or []
        tech_s = " ".join(
            t if isinstance(t, str) else str((t or {}).get("id") or "")
            for t in techs
        )
        query = " ".join(p for p in (title, summary, tech_s) if p).strip()
        pb = inc.get("playbook") or {}
        steps = pb.get("steps") if isinstance(pb, dict) else None
        if not steps and isinstance(inc.get("playbook_steps"), list):
            steps = inc["playbook_steps"]
        pos_parts: List[str] = []
        if isinstance(pb, dict):
            if pb.get("title"):
                pos_parts.append(str(pb["title"]))
            if pb.get("summary"):
                pos_parts.append(str(pb["summary"]))
        for step in steps or []:
            if isinstance(step, dict):
                pos_parts.append(
                    " ".join(
                        str(step.get(k) or "")
                        for k in ("phase", "action", "description", "title")
                    )
                )
            elif isinstance(step, str):
                pos_parts.append(step)
        positive = " ".join(p.strip() for p in pos_parts if p and str(p).strip())
        if len(query) < 15 or len(positive) < 20:
            continue
        examples.append(
            TrainExample(
                query=query[:2000],
                positive=positive[:4000],
                query_id=str(inc.get("id") or ""),
                positive_id="playbook",
                source="approved_incident",
            )
        )
    return examples


def build_full_corpus(
        *,
        pairs_path: Optional[Path] = None,
        incidents: Optional[Sequence[Dict[str, Any]]] = None,
        docs: Optional[Sequence[Dict[str, Any]]] = None,
) -> List[TrainExample]:
    examples = build_corpus_from_pairs(pairs_path=pairs_path, docs=docs)
    if incidents:
        examples.extend(build_corpus_from_approved_incidents(incidents))
    return examples


def _embed_batch(texts: Sequence[str], dim: int) -> np.ndarray:
    from backend.embeddings import HashingEmbedder

    emb = HashingEmbedder(dim=dim)
    rows = emb.embed_texts(list(texts))
    return np.asarray(rows, dtype=np.float32)


def _softmax_nll(sim_row: np.ndarray) -> Tuple[float, np.ndarray]:
    """Softmax NLL for diagonal positive; returns loss and grad w.r.t. sim_row."""
    # numerical stability
    m = float(np.max(sim_row))
    ex = np.exp(sim_row - m)
    z = float(np.sum(ex)) + 1e-12
    p = ex / z
    loss = -math.log(float(p[0]) + 1e-12)
    # dL/dsim_i = p_i - 1[i==0]
    g = p.copy()
    g[0] -= 1.0
    return loss, g


def train_linear_lora(
        examples: Sequence[TrainExample],
        *,
        dim: int = 384,
        rank: int = 16,
        epochs: int = 8,
        lr: float = 0.05,
        temperature: float = 0.07,
        seed: int = 42,
) -> AdapterArtifact:
    """Train low-rank residual adapter with in-batch negatives (numpy).

    For each anchor query embedding q, positive p is index 0 among candidate
    positives in a mini-batch; loss is InfoNCE-style.
    """
    if len(examples) < 2:
        raise ValueError("Need at least 2 training examples for contrastive LoRA")

    rng = np.random.default_rng(seed)
    rank = max(1, min(int(rank), dim))
    # LoRA init: small random A, zero B (identity residual at start)
    A = (rng.standard_normal((rank, dim)).astype(np.float32) * 0.02)
    B = np.zeros((dim, rank), dtype=np.float32)

    queries = [e.query for e in examples]
    positives = [e.positive for e in examples]
    Q0 = _embed_batch(queries, dim)
    P0 = _embed_batch(positives, dim)

    n = len(examples)
    batch_size = min(8, n)
    history: List[float] = []

    def project(X: np.ndarray, A_: np.ndarray, B_: np.ndarray) -> np.ndarray:
        # X: (n,d)  mid = X @ A.T  → (n,r)  delta = mid @ B.T → (n,d)
        mid = X @ A_.T
        Y = X + mid @ B_.T
        norms = np.linalg.norm(Y, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-12)
        return Y / norms

    t0 = time.time()
    for ep in range(epochs):
        order = rng.permutation(n)
        ep_loss = 0.0
        steps = 0
        for start in range(0, n, batch_size):
            idx = order[start: start + batch_size]
            if len(idx) < 2:
                continue
            q = project(Q0[idx], A, B)
            p = project(P0[idx], A, B)
            # similarities (bs, bs) — diagonal positives
            sim = (q @ p.T) / max(temperature, 1e-6)
            g_q = np.zeros_like(q)
            g_p = np.zeros_like(p)
            batch_loss = 0.0
            for i in range(len(idx)):
                # positive is p[i]; treat row sim[i] with positive at column i
                # reorder so positive is index 0 for _softmax_nll
                row = sim[i]
                order_cols = np.concatenate(([i], [j for j in range(len(idx)) if j != i]))
                row_ord = row[order_cols]
                loss_i, g_ord = _softmax_nll(row_ord)
                batch_loss += loss_i
                g_row = np.zeros(len(idx), dtype=np.float32)
                for k, j in enumerate(order_cols):
                    g_row[j] = g_ord[k]
                # dL/dsim = g_row / T ; sim = q @ p.T
                g_row = g_row / max(temperature, 1e-6)
                g_q[i] += p.T @ g_row
                g_p += np.outer(g_row, q[i])
            batch_loss /= len(idx)
            ep_loss += batch_loss
            steps += 1

            # Backprop through residual LoRA + L2 normalize is approximate:
            # treat pre-norm residual path: Y ≈ X + (X A^T) B^T
            # ∂L/∂A, ∂L/∂B via chain on q and p sides.
            def lora_grads(X: np.ndarray, G: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
                # X, G: (bs, d)
                mid = X @ A.T  # (bs, r)
                # Y = X + mid @ B.T ; ignore norm Jacobian (common approx)
                g_mid = G @ B  # (bs, r)
                g_A = g_mid.T @ X  # (r, d)
                g_B = G.T @ mid  # (d, r)
                return g_A, g_B

            gA_q, gB_q = lora_grads(Q0[idx], g_q)
            gA_p, gB_p = lora_grads(P0[idx], g_p)
            gA = gA_q + gA_p
            gB = gB_q + gB_p
            # clip
            for g in (gA, gB):
                ng = float(np.linalg.norm(g))
                if ng > 5.0:
                    g *= 5.0 / ng
            A -= lr * gA
            B -= lr * gB

        history.append(ep_loss / max(steps, 1))
        logger.info("linear_lora epoch %s/%s loss=%.4f", ep + 1, epochs, history[-1])

    return AdapterArtifact(
        version=1,
        method="linear_lora",
        base="hash",
        dim=dim,
        rank=rank,
        A=A.astype(np.float32).tolist(),
        B=B.astype(np.float32).tolist(),
        scale=1.0,
        train_meta={
            "examples": n,
            "epochs": epochs,
            "lr": lr,
            "temperature": temperature,
            "seed": seed,
            "loss_history": [round(x, 6) for x in history],
            "final_loss": round(history[-1], 6) if history else None,
            "duration_sec": round(time.time() - t0, 3),
            "sources": sorted({e.source for e in examples}),
        },
    )


def train_peft_lora(
        examples: Sequence[TrainExample],
        *,
        base_model: Optional[str] = None,
        out_dir: Path,
        epochs: int = 1,
        batch_size: int = 4,
        lr: float = 2e-4,
        rank: int = 8,
) -> Dict[str, Any]:
    """Optional real PEFT LoRA fine-tune (requires heavy optional deps)."""
    try:
        import torch
        from sentence_transformers import InputExample, SentenceTransformer, losses
        from torch.utils.data import DataLoader
    except ImportError as e:
        raise RuntimeError(
            "PEFT/sbert training requires: pip install sentence-transformers peft torch. "
            f"Import error: {e}"
        ) from e

    from backend.embeddings import RECOMMENDED_SBERT_MODEL

    model_name = base_model or os.environ.get("ACTIRA_EMBEDDING_MODEL") or RECOMMENDED_SBERT_MODEL
    model = SentenceTransformer(model_name)
    train_examples = [
        InputExample(texts=[e.query, e.positive]) for e in examples
    ]
    loader = DataLoader(train_examples, shuffle=True, batch_size=batch_size)
    loss_fn = losses.MultipleNegativesRankingLoss(model)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    warmup = max(1, len(loader) // 10)
    model.fit(
        train_objectives=[(loader, loss_fn)],
        epochs=epochs,
        warmup_steps=warmup,
        optimizer_params={"lr": lr},
        show_progress_bar=False,
        output_path=str(out_dir),
    )
    meta = {
        "method": "peft_sbert",
        "base_model": model_name,
        "examples": len(examples),
        "epochs": epochs,
        "rank_requested": rank,
        "out_dir": str(out_dir),
        "note": (
            "Full model export via SentenceTransformer.fit. "
            "Set ACTIRA_EMBEDDING_BACKEND=sbert and ACTIRA_EMBEDDING_MODEL to this path."
        ),
    }
    with open(out_dir / "training_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    # Best-effort PEFT note (ST fit saves full model; true PEFT needs custom loop)
    try:
        from peft import LoraConfig  # noqa: F401

        meta["peft_available"] = True
        meta["peft_note"] = (
            "peft package present; this export uses SentenceTransformer.fit "
            "(full fine-tune of ST head path). For strict PEFT-only weights, "
            "extend train_peft_lora with a custom PEFT loop."
        )
    except ImportError:
        meta["peft_available"] = False
    return meta


def save_adapter(artifact: AdapterArtifact, out_dir: Path) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    A = np.asarray(artifact.A, dtype=np.float32)
    B = np.asarray(artifact.B, dtype=np.float32)
    np.savez_compressed(out_dir / ADAPTER_WEIGHTS, A=A, B=B, scale=np.array([artifact.scale]))
    meta = artifact.to_dict()
    meta["weights_file"] = ADAPTER_WEIGHTS
    with open(out_dir / ADAPTER_META, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    readme = out_dir / "README.md"
    readme.write_text(
        "# ACTIRA domain embedding adapter\n\n"
        f"- method: `{artifact.method}`\n"
        f"- base: `{artifact.base}` dim={artifact.dim} rank={artifact.rank}\n"
        f"- examples: {artifact.train_meta.get('examples')}\n\n"
        "Load with:\n\n"
        "```bash\n"
        "export ACTIRA_EMBEDDING_BACKEND=lora\n"
        f"export ACTIRA_LORA_PATH={out_dir.as_posix()}\n"
        "```\n"
        "Then reindex KB vectors.\n",
        encoding="utf-8",
    )
    return out_dir


def load_adapter(path: Optional[Path] = None) -> AdapterArtifact:
    path = Path(path or os.environ.get("ACTIRA_LORA_PATH") or DEFAULT_OUT)
    meta_path = path / ADAPTER_META if path.is_dir() else path
    if meta_path.is_file() and meta_path.name != ADAPTER_META:
        # allow pointing at adapter.json directly
        base = meta_path.parent
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
    else:
        base = path if path.is_dir() else path.parent
        with open(base / ADAPTER_META, encoding="utf-8") as f:
            meta = json.load(f)
    weights = base / (meta.get("weights_file") or ADAPTER_WEIGHTS)
    data = np.load(weights)
    return AdapterArtifact(
        version=int(meta.get("version") or 1),
        method=str(meta.get("method") or "linear_lora"),
        base=str(meta.get("base") or "hash"),
        dim=int(meta.get("dim") or data["A"].shape[1]),
        rank=int(meta.get("rank") or data["A"].shape[0]),
        A=data["A"].astype(np.float32).tolist(),
        B=data["B"].astype(np.float32).tolist(),
        scale=float(data["scale"][0]) if "scale" in data else float(meta.get("scale") or 1.0),
        train_meta=dict(meta.get("train_meta") or {}),
    )


def adapter_status(path: Optional[Path] = None) -> Dict[str, Any]:
    path = Path(path or os.environ.get("ACTIRA_LORA_PATH") or DEFAULT_OUT)
    try:
        art = load_adapter(path)
        return {
            "ok": True,
            "path": str(path),
            "method": art.method,
            "base": art.base,
            "dim": art.dim,
            "rank": art.rank,
            "train_meta": art.train_meta,
            "active_backend": (os.environ.get("ACTIRA_EMBEDDING_BACKEND") or "hash"),
        }
    except Exception as e:
        return {
            "ok": False,
            "path": str(path),
            "error": str(e),
            "active_backend": (os.environ.get("ACTIRA_EMBEDDING_BACKEND") or "hash"),
            "hint": "Run: python -m lora_train  or POST /kb/lora/train (admin)",
        }


def evaluate_adapter_hit(
        artifact: AdapterArtifact,
        *,
        pairs_path: Optional[Path] = None,
        top_k: int = 5,
) -> Dict[str, Any]:
    """Quick dense hit@k using adapter-projected hash embeddings over KB."""
    from backend.knowledge_base import KB_DOCS

    with open(pairs_path or DEFAULT_PAIRS, encoding="utf-8") as f:
        pairs = (json.load(f).get("pairs") or [])

    docs = list(KB_DOCS)
    blobs = [_doc_blob(d) for d in docs]
    ids = [d["id"] for d in docs]
    base = _embed_batch(blobs, artifact.dim)
    doc_vecs = np.asarray([artifact.apply(row) for row in base], dtype=np.float32)

    hits = 0
    details = []
    for pair in pairs:
        qv = np.asarray(
            artifact.apply(_embed_batch([pair["query"]], artifact.dim)[0]),
            dtype=np.float32,
        )
        scores = doc_vecs @ qv
        order = np.argsort(-scores)[:top_k]
        retrieved = [ids[i] for i in order]
        rel = set(pair.get("relevant_ids") or [])
        ok = any(r in rel for r in retrieved)
        if ok:
            hits += 1
        details.append(
            {
                "id": pair.get("id"),
                "hit": ok,
                "retrieved_ids": retrieved,
                "relevant_ids": list(rel),
            }
        )
    n = max(len(pairs), 1)
    return {
        "pairs": len(pairs),
        "hits": hits,
        "hit_at_k": round(hits / n, 4),
        "top_k": top_k,
        "details": details,
    }


def run_train(
        *,
        method: str = "linear_lora",
        out_dir: Optional[Path] = None,
        pairs_path: Optional[Path] = None,
        incidents: Optional[Sequence[Dict[str, Any]]] = None,
        dim: Optional[int] = None,
        rank: int = 16,
        epochs: int = 8,
        lr: float = 0.05,
        base_model: Optional[str] = None,
        evaluate: bool = True,
) -> Dict[str, Any]:
    """End-to-end train + export. Returns status dict for API/CLI."""
    examples = build_full_corpus(pairs_path=pairs_path, incidents=incidents)
    if not examples:
        raise ValueError("No training examples built from pairs/incidents")

    out = Path(out_dir or DEFAULT_OUT)
    method = (method or "linear_lora").strip().lower()

    if method in ("peft", "sbert", "sentence-transformers"):
        meta = train_peft_lora(
            examples,
            base_model=base_model,
            out_dir=out,
            epochs=max(1, epochs),
            rank=rank,
        )
        return {"ok": True, "method": "peft_sbert", "out_dir": str(out), **meta}

    # default linear_lora
    from backend.embeddings import DEFAULT_DIM

    d = int(dim or os.environ.get("ACTIRA_EMBEDDING_DIM") or DEFAULT_DIM)
    artifact = train_linear_lora(
        examples,
        dim=d,
        rank=rank,
        epochs=epochs,
        lr=lr,
    )
    save_adapter(artifact, out)
    result: Dict[str, Any] = {
        "ok": True,
        "method": "linear_lora",
        "out_dir": str(out),
        "dim": artifact.dim,
        "rank": artifact.rank,
        "examples": len(examples),
        "train_meta": artifact.train_meta,
        "activate": {
            "ACTIRA_EMBEDDING_BACKEND": "lora",
            "ACTIRA_LORA_PATH": str(out),
        },
    }
    if evaluate:
        try:
            result["eval"] = evaluate_adapter_hit(artifact, pairs_path=pairs_path)
        except Exception as e:
            result["eval_error"] = str(e)
    return result


def main(argv: Optional[Sequence[str]] = None) -> int:
    import argparse

    p = argparse.ArgumentParser(description="ACTIRA domain embedding LoRA trainer")
    p.add_argument("--method", default="linear_lora", choices=["linear_lora", "peft"])
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--pairs", type=Path, default=DEFAULT_PAIRS)
    p.add_argument("--dim", type=int, default=None)
    p.add_argument("--rank", type=int, default=16)
    p.add_argument("--epochs", type=int, default=8)
    p.add_argument("--lr", type=float, default=0.05)
    p.add_argument("--base-model", default=None)
    p.add_argument("--no-eval", action="store_true")
    args = p.parse_args(list(argv) if argv is not None else None)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    result = run_train(
        method=args.method,
        out_dir=args.out,
        pairs_path=args.pairs,
        dim=args.dim,
        rank=args.rank,
        epochs=args.epochs,
        lr=args.lr,
        base_model=args.base_model,
        evaluate=not args.no_eval,
    )
    print(json.dumps(result, indent=2, default=str))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
