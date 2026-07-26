"""Offline tests for hybrid BM25 + dense RRF retrieval scaffold.

Uses hashing embedder + temp LanceDB path (no HF download, no Mongo).

Run:
  cd backend
  pytest tests/test_vector_rag.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@pytest.fixture()
def hash_env(tmp_path, monkeypatch):
    monkeypatch.setenv("ACTIRA_EMBEDDING_BACKEND", "hash")
    monkeypatch.setenv("ACTIRA_EMBEDDING_DIM", "64")
    monkeypatch.setenv("ACTIRA_VECTOR_STORE", "1")
    monkeypatch.setenv("ACTIRA_RETRIEVAL_MODE", "hybrid")
    monkeypatch.setenv("ACTIRA_LANCEDB_PATH", str(tmp_path / "lancedb"))
    # reset singletons after env change
    import embeddings
    import vector_store

    embeddings.reset_embedder_cache()
    vector_store._db = None
    vector_store._path = None
    yield tmp_path
    embeddings.reset_embedder_cache()
    vector_store._db = None
    vector_store._path = None


class TestEmbeddings:
    def test_hash_embedder_dim_and_stability(self, hash_env):
        from embeddings import get_embedder, cosine

        emb = get_embedder()
        assert emb.name == "hash"
        assert emb.dim == 64
        a = emb.embed_query("SSH brute force failed password")
        b = emb.embed_query("SSH brute force failed password")
        c = emb.embed_query("completely unrelated gardening tips")
        assert len(a) == 64
        assert a == b
        assert cosine(a, b) > 0.99
        # related security text should not be identical to gardening
        assert cosine(a, c) < 0.99

    def test_none_backend(self, monkeypatch, tmp_path):
        monkeypatch.setenv("ACTIRA_EMBEDDING_BACKEND", "none")
        monkeypatch.setenv("ACTIRA_LANCEDB_PATH", str(tmp_path / "x"))
        import embeddings

        embeddings.reset_embedder_cache()
        emb = embeddings.get_embedder()
        assert emb.dim == 0
        assert emb.embed_texts(["a"]) == [[]]
        embeddings.reset_embedder_cache()


class TestRRF:
    def test_rrf_prefers_consensus(self):
        from vector_store import rrf_fuse, rrf_scores

        a = ["doc1", "doc2", "doc3"]
        b = ["doc2", "doc1", "doc4"]
        fused = rrf_fuse([a, b], top_k=3)
        assert fused[0] in ("doc1", "doc2")
        scores = rrf_scores([a, b])
        assert scores["doc2"] > scores["doc3"]
        assert scores["doc1"] > scores["doc4"]


class TestVectorStore:
    def test_reindex_and_search(self, hash_env):
        lancedb = pytest.importorskip("lancedb")
        from embeddings import get_embedder
        from vector_store import reindex_kb, search_kb, status, upsert_incident, search_incidents

        docs = [
            {
                "id": "T1110",
                "source": "MITRE",
                "title": "Brute Force",
                "text": "Adversaries may use brute force techniques against SSH passwords.",
            },
            {
                "id": "T1566",
                "source": "MITRE",
                "title": "Phishing",
                "text": "Adversaries send phishing emails with malicious attachments.",
            },
            {
                "id": "PB-RANSOMWARE",
                "source": "SOC",
                "title": "Ransomware Response",
                "text": "Isolate hosts, do not pay ransom, restore from backups.",
            },
        ]
        out = reindex_kb(docs)
        assert out.get("ok") is True
        assert out.get("rows") == 3

        emb = get_embedder()
        hits = search_kb(emb.embed_query("ssh brute force password spray"), top_k=2)
        assert hits
        ids = [h["id"] for h in hits]
        assert "T1110" in ids

        st = status()
        assert st.get("ok") is True
        assert st.get("kb_rows") == 3
        assert st.get("embedder") == "hash"

        ok = upsert_incident("inc-1", "Brute force", "SSH failed password from 1.2.3.4")
        assert ok is True
        ihits = search_incidents(emb.embed_query("ssh failed login"), top_k=3)
        assert any(h.get("id") == "inc-1" for h in ihits)


class TestKnowledgeBaseHybrid:
    def test_hybrid_search_falls_back_and_tags_retriever(self, hash_env):
        # Import after env so KnowledgeBase init uses temp path
        import importlib
        import knowledge_base
        import embeddings
        import vector_store

        embeddings.reset_embedder_cache()
        vector_store._db = None
        vector_store._path = None
        importlib.reload(knowledge_base)

        kb = knowledge_base.KnowledgeBase(knowledge_base.KB_DOCS)
        bm25 = kb.search("brute force ssh", top_k=3, mode="bm25")
        assert bm25
        assert all(r.get("retriever") == "bm25" for r in bm25)

        # hybrid: if lancedb missing, still returns bm25
        hybrid = kb.search("brute force ssh", top_k=3, mode="hybrid")
        assert hybrid
        assert len(hybrid) >= 1
        # ids should be real KB docs
        assert all(r.get("id") for r in hybrid)

        if pytest.importorskip("lancedb", reason="lancedb optional for hybrid dense path"):
            re = kb.reindex_vectors()
            assert re.get("ok") is True
            # Hash embedder is bag-of-ngrams — assert plumbing, not semantic quality
            dense = kb.search("CVE-2021-44228 Log4Shell jndi ldap", top_k=5, mode="dense")
            assert dense
            assert all(r.get("retriever") == "dense" for r in dense)
            assert all(r.get("id") for r in dense)
            hybrid2 = kb.search("brute force authentication failure", top_k=3, mode="hybrid")
            assert hybrid2
            assert hybrid2[0].get("retriever") == "hybrid"

        st = kb.vector_status()
        assert "ok" in st or "error" in st
