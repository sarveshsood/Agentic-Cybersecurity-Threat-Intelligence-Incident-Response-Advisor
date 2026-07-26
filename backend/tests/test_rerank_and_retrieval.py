"""Offline tests: Cohere re-rank (mocked) + lexical re-rank + retrieval hit@k.

Run:
  cd backend
  pytest tests/test_rerank_and_retrieval.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
class TestLexicalRerank:
    def test_promotes_overlap(self):
        from backend.reranker import lexical_rerank

        docs = [
            {"id": "a", "title": "Gardening", "text": "plants and soil", "retriever": "hybrid"},
            {"id": "b", "title": "Brute Force", "text": "SSH failed password brute force", "retriever": "hybrid"},
            {"id": "c", "title": "Other", "text": "unrelated", "retriever": "hybrid"},
        ]
        out = lexical_rerank("SSH brute force password", docs, top_n=2)
        assert len(out) == 2
        assert out[0]["id"] == "b"
        assert out[0].get("rerank_score", 0) > 0
        assert "lexical" in out[0].get("retriever", "")


class TestCohereRerankMock:
    def test_cohere_reorder_from_api(self):
        from backend.reranker import cohere_rerank

        docs = [
            {"id": "a", "title": "A", "text": "first"},
            {"id": "b", "title": "B", "text": "second"},
            {"id": "c", "title": "C", "text": "third"},
        ]
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "results": [
                {"index": 2, "relevance_score": 0.9},
                {"index": 0, "relevance_score": 0.5},
            ]
        }
        with patch("requests.post", return_value=mock_resp) as post:
            out = cohere_rerank("q", docs, api_key="test-key", top_n=2)
            assert post.called
            assert [d["id"] for d in out] == ["c", "a"]
            assert out[0]["rerank_score"] == 0.9
            assert "cohere" in out[0]["retriever"]

    def test_cohere_failure_keeps_order(self):
        from backend.reranker import cohere_rerank

        docs = [{"id": "a", "title": "A", "text": "x"}, {"id": "b", "title": "B", "text": "y"}]
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "err"
        with patch("requests.post", return_value=mock_resp):
            out = cohere_rerank("q", docs, api_key="k")
            assert [d["id"] for d in out] == ["a", "b"]

    def test_maybe_rerank_skips_without_key(self, monkeypatch):
        from backend.reranker import maybe_rerank

        monkeypatch.delenv("COHERE_API_KEY", raising=False)
        monkeypatch.setenv("ACTIRA_RERANK_BACKEND", "cohere")
        monkeypatch.setenv("ACTIRA_COHERE_RERANK", "1")
        docs = [{"id": "a", "title": "A", "text": "x"}]
        out = maybe_rerank("q", docs, settings={"cohere_rerank_enabled": True})
        assert out == docs

    def test_maybe_rerank_disabled(self, monkeypatch):
        from backend.reranker import maybe_rerank

        monkeypatch.setenv("ACTIRA_RERANK_BACKEND", "lexical")
        docs = [
            {"id": "a", "title": "x", "text": "nope"},
            {"id": "b", "title": "brute force ssh", "text": "failed password"},
        ]
        out = maybe_rerank("ssh brute", docs, enabled=False)
        assert [d["id"] for d in out] == ["a", "b"]


class TestSecretModel:
    def test_cohere_in_secret_fields(self):
        from backend.models import SECRET_SETTINGS_FIELDS, Settings

        assert "cohere_api_key" in SECRET_SETTINGS_FIELDS
        s = Settings(cohere_rerank_enabled=False, cohere_api_key="secret")
        assert s.cohere_rerank_enabled is False


class TestRetrievalEval:
    def test_hit_at_k_threshold(self, monkeypatch, tmp_path):
        monkeypatch.setenv("ACTIRA_EMBEDDING_BACKEND", "hash")
        monkeypatch.setenv("ACTIRA_VECTOR_STORE", "0")  # BM25-only still evaluated
        monkeypatch.setenv("ACTIRA_RERANK_BACKEND", "lexical")
        from backend.retrieval_eval import run_retrieval_eval

        out = run_retrieval_eval(top_k=5, modes=("bm25",), use_lexical_rerank=True)
        summary = out["summary"]
        assert summary["modes"]["bm25"]["pairs"] >= 8
        # Offline BM25 on our own pairs should be strong
        assert summary["modes"]["bm25"]["hit_at_k"] >= 0.7
        assert summary["passed"] is True

    def test_retrieval_compare_identification(self, monkeypatch, tmp_path):
        monkeypatch.setenv("ACTIRA_EMBEDDING_BACKEND", "hash")
        monkeypatch.setenv("ACTIRA_VECTOR_STORE", "0")
        monkeypatch.setenv("ACTIRA_RERANK_BACKEND", "lexical")
        from backend.retrieval_eval import run_retrieval_compare

        out = run_retrieval_compare(top_k=5, use_lexical_rerank=True)
        assert out["pair_count"] >= 8
        assert "bm25" in out["modes"]
        assert "hybrid" in out["modes"]
        assert len(out["chart"]) >= 3
        assert len(out["identification"]) == out["pair_count"]
        row = out["identification"][0]
        assert "query" in row and "bm25_hit" in row and "preferred_mode" in row
        assert "vector_store" in out
        assert "legend" in out
