"""Offline retrieval evaluation on golden Q→doc pairs.

Measures hit@k for BM25 / hybrid / dense (+ optional lexical re-rank).
Does not call Cohere or download models by default.

  cd backend
  python -m retrieval_eval
  pytest tests/test_retrieval_eval.py -v
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

PAIRS_PATH = Path(__file__).resolve().parent / "tests" / "golden" / "retrieval_pairs.json"


def load_pairs(path: Optional[Path] = None) -> Dict[str, Any]:
    p = path or PAIRS_PATH
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def hit_at_k(retrieved_ids: Sequence[str], relevant_ids: Sequence[str], k: int) -> bool:
    top = list(retrieved_ids)[:k]
    rel = set(relevant_ids)
    return any(rid in rel for rid in top)


def run_retrieval_eval(
        *,
        top_k: int = 5,
        modes: Optional[Sequence[str]] = None,
        pairs_path: Optional[Path] = None,
        use_lexical_rerank: bool = True,
) -> Dict[str, Any]:
    """Run hit@k across modes. Returns summary + per-query detail.

    A-G2: env mutations are scoped and restored so parallel tests/workers
    do not leak ACTIRA_* settings.
    """
    env_keys = (
        "ACTIRA_EMBEDDING_BACKEND",
        "ACTIRA_RERANK_BACKEND",
        "ACTIRA_COHERE_RERANK",
    )
    prev_env = {k: os.environ.get(k) for k in env_keys}
    try:
        os.environ["ACTIRA_EMBEDDING_BACKEND"] = prev_env["ACTIRA_EMBEDDING_BACKEND"] or "hash"
        if use_lexical_rerank:
            os.environ["ACTIRA_RERANK_BACKEND"] = "lexical"
            os.environ["ACTIRA_COHERE_RERANK"] = "1"
        else:
            os.environ["ACTIRA_COHERE_RERANK"] = "0"

        from backend.knowledge_base import KnowledgeBase, KB_DOCS

        data = load_pairs(pairs_path)
        pairs = data.get("pairs") or []
        modes_list = list(modes or ("bm25", "hybrid"))
        kb = KnowledgeBase(KB_DOCS)

        per_mode: Dict[str, Any] = {}
        details: List[Dict[str, Any]] = []

        for mode in modes_list:
            hits = 0
            for pair in pairs:
                q = pair["query"]
                rel = pair.get("relevant_ids") or []
                results = kb.search(
                    q,
                    top_k=top_k,
                    mode=mode,
                    settings={"cohere_rerank_enabled": use_lexical_rerank},
                )
                ids = [r.get("id") for r in results if r.get("id")]
                ok = hit_at_k(ids, rel, top_k)
                if ok:
                    hits += 1
                details.append(
                    {
                        "id": pair.get("id"),
                        "mode": mode,
                        "query": q,
                        "relevant_ids": rel,
                        "retrieved_ids": ids,
                        "hit": ok,
                    }
                )
            n = max(len(pairs), 1)
            per_mode[mode] = {
                "pairs": len(pairs),
                "hits": hits,
                "hit_at_k": round(hits / n, 4),
                "k": top_k,
            }

        summary = {
            "version": data.get("version"),
            "base_model_recommendation": data.get("base_model_recommendation"),
            "top_k": top_k,
            "modes": per_mode,
            "lexical_rerank": use_lexical_rerank,
            "passed": all(m.get("hit_at_k", 0) >= 0.7 for m in per_mode.values()),
        }
        return {"summary": summary, "details": details}
    finally:
        for k, v in prev_env.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


def run_retrieval_compare(
        *,
        top_k: int = 5,
        pairs_path: Optional[Path] = None,
        use_lexical_rerank: bool = True,
) -> Dict[str, Any]:
    """Side-by-side BM25 vs dense (LanceDB) vs hybrid for identification.

    Returns hit@k per mode, vector-store snapshot, and per-query rows showing
    which mode found which relevant docs (exclusive hits help spot gaps).
    """
    os.environ.setdefault("ACTIRA_EMBEDDING_BACKEND", "hash")
    # Do not force global rerank env — we pass enabled= per call
    if use_lexical_rerank:
        os.environ.setdefault("ACTIRA_RERANK_BACKEND", "lexical")

    from backend.knowledge_base import KnowledgeBase, KB_DOCS

    data = load_pairs(pairs_path)
    pairs = data.get("pairs") or []
    kb = KnowledgeBase(KB_DOCS)

    # label, search mode, apply rerank
    mode_specs = [
        ("bm25", "bm25", False),
        ("dense", "dense", False),  # LanceDB ANN only (falls back to BM25 if empty)
        ("hybrid", "hybrid", False),  # BM25 + LanceDB RRF
        ("hybrid_rerank", "hybrid", True),  # + optional lexical/Cohere re-rank
    ]

    # Collect per-mode top ids for each pair
    # pair_id -> mode -> {ids, hit, relevant_found}
    matrix: Dict[str, Dict[str, Any]] = {}
    mode_hits: Dict[str, int] = {label: 0 for label, _, _ in mode_specs}

    for pair in pairs:
        pid = pair.get("id") or pair["query"][:40]
        q = pair["query"]
        rel = list(pair.get("relevant_ids") or [])
        rel_set = set(rel)
        matrix[pid] = {
            "id": pid,
            "query": q,
            "relevant_ids": rel,
            "modes": {},
        }
        for label, search_mode, do_rerank in mode_specs:
            results = kb.search(
                q,
                top_k=top_k,
                mode=search_mode,
                settings={"cohere_rerank_enabled": do_rerank},
                rerank=do_rerank if use_lexical_rerank else False,
            )
            ids = [r.get("id") for r in results if r.get("id")]
            found = [i for i in ids if i in rel_set]
            ok = hit_at_k(ids, rel, top_k)
            if ok:
                mode_hits[label] += 1
            retrievers = sorted({str(r.get("retriever") or search_mode) for r in results})
            matrix[pid]["modes"][label] = {
                "retrieved_ids": ids,
                "relevant_found": found,
                "hit": ok,
                "retrievers": retrievers,
            }

    n = max(len(pairs), 1)
    summary_modes: Dict[str, Any] = {}
    chart = []
    for label, _, _ in mode_specs:
        rate = round(mode_hits[label] / n, 4)
        summary_modes[label] = {
            "pairs": len(pairs),
            "hits": mode_hits[label],
            "hit_at_k": rate,
            "k": top_k,
        }
        chart.append(
            {
                "mode": label,
                "label": {
                    "bm25": "BM25 only",
                    "dense": "LanceDB dense",
                    "hybrid": "Hybrid RRF",
                    "hybrid_rerank": "Hybrid + re-rank",
                }.get(label, label),
                "hit_at_k": rate,
                "hit_pct": round(rate * 100, 1),
                "hits": mode_hits[label],
                "pairs": len(pairs),
            }
        )

    # Identification rows: exclusive relevant recovery
    identification: List[Dict[str, Any]] = []
    exclusive_counts = {label: 0 for label, _, _ in mode_specs}
    for pid, row in matrix.items():
        modes = row["modes"]
        # relevant ids found by each mode
        found_sets = {m: set(modes[m]["relevant_found"]) for m in modes}
        all_found = set().union(*found_sets.values()) if found_sets else set()
        exclusive = {}
        for m, s in found_sets.items():
            others = set().union(*(found_sets[o] for o in found_sets if o != m)) if len(found_sets) > 1 else set()
            excl = sorted(s - others)
            exclusive[m] = excl
            exclusive_counts[m] += len(excl)

        winners = [m for m, info in modes.items() if info["hit"]]
        # Prefer denser/hybrid when tied for display
        preferred = None
        for cand in ("hybrid_rerank", "hybrid", "dense", "bm25"):
            if cand in winners:
                preferred = cand
                break

        identification.append(
            {
                "id": pid,
                "query": row["query"],
                "relevant_ids": row["relevant_ids"],
                "bm25_hit": modes.get("bm25", {}).get("hit"),
                "dense_hit": modes.get("dense", {}).get("hit"),
                "hybrid_hit": modes.get("hybrid", {}).get("hit"),
                "hybrid_rerank_hit": modes.get("hybrid_rerank", {}).get("hit"),
                "bm25_found": modes.get("bm25", {}).get("relevant_found", []),
                "dense_found": modes.get("dense", {}).get("relevant_found", []),
                "hybrid_found": modes.get("hybrid", {}).get("relevant_found", []),
                "hybrid_rerank_found": modes.get("hybrid_rerank", {}).get("relevant_found", []),
                "bm25_top": (modes.get("bm25", {}).get("retrieved_ids") or [])[:3],
                "dense_top": (modes.get("dense", {}).get("retrieved_ids") or [])[:3],
                "hybrid_top": (modes.get("hybrid", {}).get("retrieved_ids") or [])[:3],
                "exclusive_relevant": exclusive,
                "winners": winners,
                "preferred_mode": preferred,
                "all_relevant_recovered": sorted(all_found),
                "missed_relevant": sorted(set(row["relevant_ids"]) - all_found),
            }
        )

    # Vector store snapshot for UI identification
    try:
        vs = kb.vector_status()
    except Exception as e:
        vs = {"ok": False, "error": str(e)}

    return {
        "top_k": top_k,
        "pair_count": len(pairs),
        "base_model_recommendation": data.get("base_model_recommendation"),
        "modes": summary_modes,
        "chart": chart,
        "exclusive_relevant_counts": exclusive_counts,
        "identification": identification,
        "vector_store": {
            "ok": vs.get("ok"),
            "enabled": vs.get("enabled"),
            "kb_rows": vs.get("kb_rows"),
            "incident_rows": vs.get("incident_rows"),
            "embedder": vs.get("embedder"),
            "dim": vs.get("dim"),
            "lancedb_importable": vs.get("lancedb_importable"),
            "vector_ready": vs.get("vector_ready"),
            "path": vs.get("path"),
            "error": vs.get("error"),
        },
        "legend": {
            "bm25": "Keyword BM25 over in-code KB (no vectors)",
            "dense": "LanceDB ANN only (hash/sbert embeddings)",
            "hybrid": "BM25 + LanceDB fused with Reciprocal Rank Fusion",
            "hybrid_rerank": "Hybrid then re-rank (lexical offline / Cohere when keyed)",
        },
    }


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    out = run_retrieval_eval(top_k=5)
    s = out["summary"]
    print("Retrieval eval (offline)")
    print(f"  recommended model: {s.get('base_model_recommendation')}")
    for mode, stats in (s.get("modes") or {}).items():
        print(f"  {mode}: hit@{stats['k']} = {stats['hit_at_k']} ({stats['hits']}/{stats['pairs']})")
    print(f"  passed={s.get('passed')}")
    print("--- compare ---")
    cmp_ = run_retrieval_compare(top_k=5, use_lexical_rerank=True)
    for row in cmp_["chart"]:
        print(
            f"  {row['label']}: hit@k={row['hit_at_k']} exclusive_rel={cmp_['exclusive_relevant_counts'].get(row['mode'])}")


if __name__ == "__main__":
    main()
