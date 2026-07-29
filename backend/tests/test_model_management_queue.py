"""Model management dual-fallback + pipeline parallel + queue routes smoke."""
from __future__ import annotations

from backend.llm_provider import _fallback_chain, default_model_for_provider
from backend.pipeline_parallel import parallel_snapshot, resolve_enrich_concurrency, resolve_parse_concurrency
from backend.services.model_management_service import resolve_routes
from backend.settings_versions import public_snapshot


def test_fallback_chain_uses_preferred_model():
    keys = {"anthropic": "k1", "groq": "k2", "openai": "k3"}
    chain = _fallback_chain(
        "anthropic",
        keys,
        {
            "llm_fallback_enabled": True,
            "llm_fallback_provider": "groq",
            "llm_fallback_model": "openai/gpt-oss-120b",
        },
    )
    assert chain
    assert chain[0][0] == "groq"
    assert chain[0][1] == "openai/gpt-oss-120b"


def test_fallback_chain_disabled():
    keys = {"anthropic": "k1", "groq": "k2"}
    chain = _fallback_chain(
        "anthropic",
        keys,
        {"llm_fallback_enabled": False, "llm_fallback_provider": "groq"},
    )
    assert chain == []


def test_resolve_routes_snapshot():
    snap = resolve_routes(
        {
            "llm_provider": "anthropic",
            "llm_model": "claude-sonnet-4-6",
            "llm_fallback_enabled": True,
            "llm_fallback_provider": "groq",
            "llm_fallback_model": "openai/gpt-oss-120b",
            "llm_manual_route": "primary",
            "anthropic_api_key": "sk-ant-x",
            "groq_api_key": "gsk-x",
        }
    )
    assert snap["primary"]["provider"] == "anthropic"
    assert snap["backup"]["provider"] == "groq"
    assert snap["backup"]["model"] == "openai/gpt-oss-120b"
    assert snap["manual_route"] == "primary"
    assert "auto_chain" in snap
    assert snap["auto_fallback_enabled"] is True


def test_resolve_routes_manual_backup():
    snap = resolve_routes(
        {
            "llm_provider": "openai",
            "llm_model": "gpt-4o",
            "llm_fallback_provider": "anthropic",
            "llm_fallback_model": "claude-sonnet-4-6",
            "llm_manual_route": "backup",
            "openai_api_key": "sk-x",
            "anthropic_api_key": "sk-ant-x",
        }
    )
    assert snap["manual_route"] == "backup"
    assert snap["backup"]["provider"] == "anthropic"
    assert snap["backup"]["model"] == "claude-sonnet-4-6"


def test_settings_version_snapshot_includes_manual_route():
    snap = public_snapshot(
        {
            "llm_provider": "anthropic",
            "llm_fallback_model": "m1",
            "llm_manual_route": "backup",
            "anthropic_api_key": "SECRET",
        }
    )
    assert snap.get("llm_manual_route") == "backup"
    assert snap.get("llm_fallback_model") == "m1"
    assert "anthropic_api_key" not in snap


def test_pipeline_parallel_clamps(monkeypatch):
    # Defaults read PARSE_CONCURRENCY / ENRICH_CONCURRENCY from env when settings empty
    monkeypatch.delenv("PARSE_CONCURRENCY", raising=False)
    monkeypatch.delenv("ENRICH_CONCURRENCY", raising=False)
    assert resolve_parse_concurrency({"parse_concurrency": 100}) == 16
    assert resolve_enrich_concurrency({"enrich_concurrency": 0}) == 1
    assert resolve_parse_concurrency({}) == 4
    assert resolve_enrich_concurrency({}) == 8
    snap = parallel_snapshot({"parse_concurrency": 4, "enrich_concurrency": 8})
    assert "parse_files" in snap["parallel_stages"]
    assert "playbook" in snap["sequential_stages"]
    assert "hitl_gate" in snap["sequential_stages"]


def test_default_model_groq():
    m = default_model_for_provider("groq")
    assert m
    assert "gpt-oss" in m or "llama" in m or "/" in m


def test_routes_registered():
    from backend.routers import analytics, realtime, settings

    ap = [getattr(r, "path", "") for r in analytics.router.routes]
    assert any("queue" in p for p in ap)
    sp = [getattr(r, "path", "") for r in settings.router.routes]
    assert any("llm-routes" in p for p in sp)
    assert any("test-llm" in p for p in sp)
    rp = [getattr(r, "path", "") for r in realtime.router.routes]
    assert any("sse" in p for p in rp)
    assert any("ws" in p for p in rp)


def test_realtime_in_all_domain_routers():
    from backend.routers import ALL_DOMAIN_ROUTERS, realtime

    assert realtime in ALL_DOMAIN_ROUTERS


def test_ws_token_from_cookie_helper():
    from backend.routers.realtime import COOKIE_NAME, _token_from_ws

    class FakeWS:
        def __init__(self):
            self.query_params = {}
            self.headers = {}
            self.cookies = {COOKIE_NAME: "jwt-from-cookie"}

    assert _token_from_ws(FakeWS(), None) == "jwt-from-cookie"
    assert _token_from_ws(FakeWS(), "bearer ABC") == "ABC"


def test_probe_route_stores_last_probe():
    import asyncio
    from backend.services import model_management_service as mms

    async def fake_call_llm(**kwargs):
        return ("ok", "anthropic", "claude-sonnet-4-6")

    # Patch call_llm path used inside probe_route
    import backend.llm_provider as lp

    orig = getattr(lp, "call_llm", None)

    async def _run():
        lp.call_llm = fake_call_llm  # type: ignore
        try:
            res = await mms.probe_route(
                {
                    "llm_provider": "anthropic",
                    "llm_model": "claude-sonnet-4-6",
                    "anthropic_api_key": "sk-test",
                },
                route="primary",
            )
            assert res["ok"] is True
            probes = mms.get_last_probes()
            assert "primary" in probes
            assert probes["primary"]["ok"] is True
            assert probes["primary"].get("latency_ms") is not None
            snap = mms.resolve_routes(
                {
                    "llm_provider": "anthropic",
                    "llm_model": "claude-sonnet-4-6",
                    "llm_fallback_provider": "groq",
                    "anthropic_api_key": "sk-test",
                }
            )
            assert snap["primary"].get("latency_ms") is not None
            assert "last_probes" in snap
        finally:
            if orig is not None:
                lp.call_llm = orig

    # Python 3.12+: no implicit current loop on MainThread — use asyncio.run
    asyncio.run(_run())
