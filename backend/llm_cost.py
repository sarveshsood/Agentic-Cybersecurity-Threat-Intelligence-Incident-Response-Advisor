"""Estimated LLM dollar cost from token usage (enterprise P3).

Pricing is approximate list rates (USD per 1M tokens). Override via env JSON:

  LLM_PRICE_TABLE_JSON={"anthropic:claude-sonnet-4-6":{"in":3.0,"out":15.0},...}

Or per-provider defaults when model unknown.
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, Optional, Tuple

# USD per 1M tokens — approximate public list prices (update as needed)
_DEFAULT_RATES: Dict[str, Dict[str, float]] = {
    "anthropic:claude-sonnet-4-6": {"in": 3.0, "out": 15.0},
    "anthropic:claude-opus-4-8": {"in": 15.0, "out": 75.0},
    "anthropic:claude-haiku-4-5": {"in": 0.8, "out": 4.0},
    "openai:gpt-5.4": {"in": 2.5, "out": 10.0},
    "openai:gpt-5.4-mini": {"in": 0.4, "out": 1.6},
    "openai:gpt-5.2": {"in": 2.0, "out": 8.0},
    "groq:llama-3.3-70b-versatile": {"in": 0.59, "out": 0.79},
    "groq:llama-3.1-8b-instant": {"in": 0.05, "out": 0.08},
    "gemini:gemini-3.1-pro-preview": {"in": 1.25, "out": 5.0},
    "gemini:gemini-3-flash-preview": {"in": 0.1, "out": 0.4},
    # Provider rollups when model unknown
    "anthropic": {"in": 3.0, "out": 15.0},
    "openai": {"in": 2.5, "out": 10.0},
    "groq": {"in": 0.5, "out": 0.8},
    "gemini": {"in": 1.0, "out": 4.0},
    "template": {"in": 0.0, "out": 0.0},
    "fallback": {"in": 0.0, "out": 0.0},
    "unknown": {"in": 2.0, "out": 8.0},
}


def _load_overrides() -> Dict[str, Dict[str, float]]:
    raw = (os.environ.get("LLM_PRICE_TABLE_JSON") or "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
        out: Dict[str, Dict[str, float]] = {}
        if isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, dict):
                    out[str(k).lower()] = {
                        "in": float(v.get("in") or v.get("input") or 0),
                        "out": float(v.get("out") or v.get("output") or 0),
                    }
                elif isinstance(v, (int, float)):
                    out[str(k).lower()] = {"in": float(v), "out": float(v)}
        return out
    except Exception:
        return {}


def rates_for(provider: str = "", model: str = "") -> Tuple[float, float]:
    """Return (input_usd_per_1m, output_usd_per_1m)."""
    overrides = _load_overrides()
    table = {**_DEFAULT_RATES, **overrides}
    p = (provider or "unknown").strip().lower()
    m = (model or "").strip().lower()
    key = f"{p}:{m}" if m else p
    if key in table:
        r = table[key]
        return float(r.get("in", 0)), float(r.get("out", 0))
    if p in table:
        r = table[p]
        return float(r.get("in", 0)), float(r.get("out", 0))
    r = table["unknown"]
    return float(r.get("in", 2.0)), float(r.get("out", 8.0))


def estimate_usd(
    tokens: int,
    *,
    provider: str = "",
    model: str = "",
    output_ratio: float = 0.35,
) -> Dict[str, Any]:
    """Estimate cost assuming ``output_ratio`` of tokens are completion tokens."""
    n = max(0, int(tokens or 0))
    rin, rout = rates_for(provider, model)
    ratio = min(0.9, max(0.05, float(output_ratio)))
    out_tok = int(n * ratio)
    in_tok = n - out_tok
    cost = (in_tok / 1_000_000.0) * rin + (out_tok / 1_000_000.0) * rout
    return {
        "tokens": n,
        "tokens_in_est": in_tok,
        "tokens_out_est": out_tok,
        "usd_per_1m_in": rin,
        "usd_per_1m_out": rout,
        "estimated_usd": round(cost, 6),
        "provider": provider or "unknown",
        "model": model or "",
        "currency": "USD",
        "disclaimer": (
            "Estimate from char/4 tokens and public list rates — not a billing invoice. "
            "Override with LLM_PRICE_TABLE_JSON."
        ),
    }


def price_table_public() -> Dict[str, Any]:
    overrides = _load_overrides()
    table = {**_DEFAULT_RATES, **overrides}
    return {
        "currency": "USD",
        "unit": "per_1m_tokens",
        "rates": table,
        "overridden_keys": list(overrides.keys()),
    }
