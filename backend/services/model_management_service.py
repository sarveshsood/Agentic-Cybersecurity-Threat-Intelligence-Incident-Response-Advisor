"""Unified LLM model management: routes, health, fallback chain preview.

Supports automatic fallback (chain on failure) and manual backup route.
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.llm_provider import (
    FALLBACK_PROVIDER_ORDER,
    PROVIDER_MODELS,
    _fallback_chain,
    _merge_keys,
    default_model_for_provider,
    last_effective_llm,
    llm_catalog,
)

logger = logging.getLogger(__name__)

# Process-local last probe results for latency chips (primary/backup).
_last_probes: Dict[str, Dict[str, Any]] = {}
_probe_lock = threading.Lock()


def _key_map(settings: dict) -> Dict[str, str]:
    return _merge_keys(None, settings=settings)


def get_last_probes() -> Dict[str, Dict[str, Any]]:
    with _probe_lock:
        return {k: dict(v) for k, v in _last_probes.items()}


def _store_probe(result: Dict[str, Any]) -> None:
    route = str(result.get("route") or "primary").strip().lower()
    row = {
        "ok": bool(result.get("ok")),
        "route": route,
        "provider": result.get("provider"),
        "model": result.get("model"),
        "latency_ms": result.get("latency_ms"),
        "error": result.get("error"),
        "message": (result.get("message") or "")[:200] or None,
        "ts": datetime.now(timezone.utc).isoformat(),
    }
    with _probe_lock:
        _last_probes[route] = row


def resolve_routes(settings: Optional[dict] = None) -> Dict[str, Any]:
    """Public route snapshot for Settings UI / topbar."""
    s = dict(settings or {})
    keys = _key_map(s)
    primary_p = str(s.get("llm_provider") or "anthropic").strip().lower()
    primary_m = str(s.get("llm_model") or default_model_for_provider(primary_p)).strip()
    fb_p = str(s.get("llm_fallback_provider") or "anthropic").strip().lower()
    fb_m = (s.get("llm_fallback_model") or "").strip() or (
        default_model_for_provider(fb_p) if fb_p in PROVIDER_MODELS else ""
    )
    auto_chain = [
        {"provider": p, "model": m, "key_ready": bool((keys.get(p) or "").strip())}
        for p, m in _fallback_chain(primary_p, keys, s)
    ]
    # Ensure preferred backup appears even when primary has no auto chain
    if fb_p and fb_p != "none" and fb_p in PROVIDER_MODELS:
        if not any(c["provider"] == fb_p for c in auto_chain):
            auto_chain.insert(
                0,
                {
                    "provider": fb_p,
                    "model": fb_m or default_model_for_provider(fb_p),
                    "key_ready": bool((keys.get(fb_p) or "").strip()),
                },
            )
    providers_health: List[Dict[str, Any]] = []
    for p in PROVIDER_MODELS:
        providers_health.append(
            {
                "provider": p,
                "default_model": default_model_for_provider(p),
                "key_ready": bool((keys.get(p) or "").strip()),
                "in_fallback_order": p in FALLBACK_PROVIDER_ORDER,
            }
        )
    probes = get_last_probes()
    primary_probe = probes.get("primary") or probes.get("auto")
    backup_probe = probes.get("backup")
    eff = last_effective_llm()
    return {
        "primary": {
            "provider": primary_p,
            "model": primary_m,
            "key_ready": bool((keys.get(primary_p) or "").strip()),
            "latency_ms": (primary_probe or {}).get("latency_ms"),
            "probe_ok": (primary_probe or {}).get("ok"),
            "probed_at": (primary_probe or {}).get("ts"),
        },
        "backup": {
            "provider": fb_p if fb_p != "none" else None,
            "model": fb_m if fb_p != "none" else None,
            "key_ready": bool((keys.get(fb_p) or "").strip()) if fb_p != "none" else False,
            "latency_ms": (backup_probe or {}).get("latency_ms"),
            "probe_ok": (backup_probe or {}).get("ok"),
            "probed_at": (backup_probe or {}).get("ts"),
        },
        "auto_fallback_enabled": s.get("llm_fallback_enabled") is not False,
        "manual_route": str(s.get("llm_manual_route") or "primary").strip().lower(),
        "auto_chain": auto_chain,
        "fallback_order": list(FALLBACK_PROVIDER_ORDER),
        "providers": providers_health,
        "last_probes": probes,
        "last_effective": {
            "provider": eff.get("provider"),
            "model": eff.get("model"),
            "via_fallback": bool(eff.get("via_fallback")),
            "ts": eff.get("ts"),
        },
        "catalog": llm_catalog(),
    }


async def probe_route(
    settings: dict,
    *,
    route: str = "primary",
) -> Dict[str, Any]:
    """Minimal completion probe for primary or backup route."""
    from backend.llm_provider import call_llm, LLMCallError, LLMConfigError

    route_l = (route or "primary").strip().lower()
    if route_l not in ("primary", "backup", "auto"):
        route_l = "primary"
    provider = str(settings.get("llm_provider") or "anthropic")
    model = str(settings.get("llm_model") or "claude-sonnet-4-6")
    t0 = time.perf_counter()
    try:
        text, eff_p, eff_m = await call_llm(
            system="You are a health-check probe. Reply with exactly: ok",
            user="ping",
            provider=provider,
            model=model,
            settings=settings,
            json_mode=False,
            use_prompt_cache=False,
            route=route_l if route_l != "auto" else "auto",
        )
        ms = int((time.perf_counter() - t0) * 1000)
        result = {
            "ok": True,
            "route": route_l,
            "provider": eff_p,
            "model": eff_m,
            "latency_ms": ms,
            "preview": (text or "")[:120],
        }
        _store_probe(result)
        return result
    except (LLMConfigError, LLMCallError, Exception) as e:
        ms = int((time.perf_counter() - t0) * 1000)
        result = {
            "ok": False,
            "route": route_l,
            "error": type(e).__name__,
            "message": str(e) or type(e).__name__,
            "latency_ms": ms,
            "provider": provider,
            "model": model,
        }
        _store_probe(result)
        return result
