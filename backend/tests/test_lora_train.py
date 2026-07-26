"""Offline tests for domain embedding LoRA pipeline (rm-w1-embeddings t3).

No torch / HF download required — uses linear_lora + hash base.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


@pytest.fixture()
def lora_env(tmp_path, monkeypatch):
    monkeypatch.setenv("ACTIRA_EMBEDDING_BACKEND", "hash")
    monkeypatch.setenv("ACTIRA_EMBEDDING_DIM", "64")
    monkeypatch.setenv("ACTIRA_LORA_PATH", str(tmp_path / "adapter"))
    import embeddings

    embeddings.reset_embedder_cache()
    yield tmp_path
    embeddings.reset_embedder_cache()


class TestCorpus:
    def test_build_from_golden_pairs(self):
        from lora_train import build_corpus_from_pairs

        ex = build_corpus_from_pairs()
        assert len(ex) >= 10
        assert all(e.query and e.positive for e in ex)
        assert any(e.positive_id.startswith("T") or e.positive_id.startswith("PB") for e in ex)

    def test_build_from_approved_incidents(self):
        from lora_train import build_corpus_from_approved_incidents

        incidents = [
            {
                "id": "inc-1",
                "status": "approved",
                "title": "SSH brute force on bastion",
                "summary": "Multiple failed password attempts from 1.2.3.4",
                "techniques": ["T1110"],
                "playbook": {
                    "title": "Brute force response",
                    "steps": [
                        {"phase": "containment", "action": "Block source IP at firewall"},
                        {"phase": "eradication", "action": "Reset affected credentials"},
                    ],
                },
            },
            {
                "id": "inc-skip",
                "status": "pending_review",
                "title": "Not approved yet",
                "summary": "Should be skipped",
                "playbook": {"steps": [{"action": "noop"}]},
            },
        ]
        ex = build_corpus_from_approved_incidents(incidents)
        assert len(ex) == 1
        assert ex[0].source == "approved_incident"
        assert "firewall" in ex[0].positive.lower() or "Block" in ex[0].positive


class TestLinearLora:
    def test_train_save_load_apply(self, lora_env):
        from lora_train import (
            build_corpus_from_pairs,
            load_adapter,
            save_adapter,
            train_linear_lora,
        )

        examples = build_corpus_from_pairs()
        art = train_linear_lora(
            examples,
            dim=64,
            rank=4,
            epochs=3,
            lr=0.08,
            seed=7,
        )
        assert art.dim == 64
        assert art.rank == 4
        assert len(art.A) == 4
        assert len(art.B) == 64
        assert art.train_meta.get("examples") == len(examples)
        assert art.train_meta.get("final_loss") is not None

        out = lora_env / "adapter"
        save_adapter(art, out)
        assert (out / "adapter.json").is_file()
        assert (out / "adapter_weights.npz").is_file()

        loaded = load_adapter(out)
        assert loaded.dim == 64
        # residual apply changes vector for non-empty input
        from embeddings import HashingEmbedder

        base = HashingEmbedder(dim=64).embed_query("SSH brute force failed password")
        adapted = loaded.apply(base)
        assert len(adapted) == 64
        # L2 normalized
        import numpy as np

        assert abs(float(np.linalg.norm(adapted)) - 1.0) < 1e-4

    def test_run_train_end_to_end(self, lora_env):
        from lora_train import run_train

        out = lora_env / "adapter"
        result = run_train(
            method="linear_lora",
            out_dir=out,
            dim=64,
            rank=4,
            epochs=2,
            lr=0.1,
            evaluate=True,
        )
        assert result["ok"] is True
        assert result["method"] == "linear_lora"
        assert result["examples"] >= 10
        assert "eval" in result
        assert 0.0 <= result["eval"]["hit_at_k"] <= 1.0
        assert result["activate"]["ACTIRA_EMBEDDING_BACKEND"] == "lora"

    def test_lora_embedder_backend(self, lora_env, monkeypatch):
        from lora_train import run_train
        import embeddings

        out = lora_env / "adapter"
        run_train(method="linear_lora", out_dir=out, dim=64, rank=4, epochs=2, evaluate=False)

        monkeypatch.setenv("ACTIRA_EMBEDDING_BACKEND", "lora")
        monkeypatch.setenv("ACTIRA_LORA_PATH", str(out))
        monkeypatch.setenv("ACTIRA_EMBEDDING_DIM", "64")
        embeddings.reset_embedder_cache()
        emb = embeddings.get_embedder()
        assert emb.name.startswith("lora:")
        assert emb.dim == 64
        v = emb.embed_query("ransomware encrypted files")
        assert len(v) == 64
        embeddings.reset_embedder_cache()

    def test_adapter_status_missing(self, tmp_path, monkeypatch):
        from lora_train import adapter_status

        monkeypatch.setenv("ACTIRA_LORA_PATH", str(tmp_path / "missing"))
        st = adapter_status(tmp_path / "missing")
        assert st["ok"] is False
        assert "hint" in st


class TestCli:
    def test_main_linear(self, lora_env):
        from lora_train import main

        out = lora_env / "cli-adapter"
        rc = main(
            [
                "--method",
                "linear_lora",
                "--out",
                str(out),
                "--dim",
                "64",
                "--rank",
                "4",
                "--epochs",
                "2",
                "--lr",
                "0.1",
            ]
        )
        assert rc == 0
        meta = json.loads((out / "adapter.json").read_text(encoding="utf-8"))
        assert meta["method"] == "linear_lora"
        assert meta["dim"] == 64
