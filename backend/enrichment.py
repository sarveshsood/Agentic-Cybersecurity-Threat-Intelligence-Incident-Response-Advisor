"""Threat intel enrichment.

Uses live provider APIs when keys are present in Settings (MongoDB) or env;
falls back to deterministic mock data per source when a key is missing or the
call fails.
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from typing import Any, Dict, Optional

from backend.models import IoC
from backend.secrets_util import clean_secret, is_real_secret
from backend import ti_http

logger = logging.getLogger(__name__)

# Short timeouts so the pipeline stays responsive if a provider is slow.
# Overridable via TI_HTTP_TIMEOUT env (see ti_http.http_timeout).
_HTTP_TIMEOUT = 8


def _stable_score(seed: str, salt: str, low: int = 0, high: int = 100) -> int:
    h = int(hashlib.sha256(f"{salt}::{seed}".encode()).hexdigest(), 16)
    return low + (h % (high - low + 1))


def _key(settings: Optional[dict], field: str, env_var: str = "") -> str:
    if settings:
        v = clean_secret(settings.get(field))
        if is_real_secret(v):
            return v
    if env_var:
        v = clean_secret(os.environ.get(env_var, ""))
        if is_real_secret(v):
            return v
    return ""


# ---------- Mock providers ----------

def mock_abuseipdb(ioc: IoC) -> Dict[str, Any]:
    score = _stable_score(ioc.value, "abuse", 0, 100)
    return {
        "source": "AbuseIPDB",
        "score": score,
        "confidence": score,
        "reports": _stable_score(ioc.value, "reports", 0, 300),
        "country": ["US", "RU", "CN", "NL", "BR"][_stable_score(ioc.value, "country", 0, 4)],
        "mock": True,
    }


def mock_virustotal(ioc: IoC) -> Dict[str, Any]:
    total = 90
    malicious = _stable_score(ioc.value, "vt_mal", 0, 60)
    return {
        "source": "VirusTotal",
        "score": int((malicious / total) * 100),
        "malicious": malicious,
        "total_engines": total,
        "categories": ["phishing", "malware", "c2", "suspicious"][:1 + _stable_score(ioc.value, "cat", 0, 3)],
        "mock": True,
    }


def mock_greynoise(ioc: IoC) -> Dict[str, Any]:
    classes = ["malicious", "benign", "unknown"]
    cls = classes[_stable_score(ioc.value, "gn", 0, 2)]
    return {
        "source": "GreyNoise",
        "classification": cls,
        "score": 100 if cls == "malicious" else (0 if cls == "benign" else 40),
        "actor": ["Mirai", "Shodan", "unknown", "MassScan"][_stable_score(ioc.value, "actor", 0, 3)],
        "mock": True,
    }


def mock_threatfox(ioc: IoC) -> Dict[str, Any]:
    score = _stable_score(ioc.value, "tf", 0, 100)
    return {
        "source": "ThreatFox",
        "score": score,
        "malware_family": ["Emotet", "Cobalt Strike", "TrickBot", "IcedID", "Qakbot"][
            _stable_score(ioc.value, "fam", 0, 4)] if score > 40 else None,
        "confidence": score,
        "mock": True,
    }


def mock_otx(ioc: IoC) -> Dict[str, Any]:
    pulse = _stable_score(ioc.value, "otx", 0, 20)
    return {
        "source": "AlienVault OTX",
        "score": min(100, pulse * 8),
        "pulse_count": pulse,
        "mock": True,
    }


def mock_shodan(ioc: IoC) -> Dict[str, Any]:
    ports = _stable_score(ioc.value, "shodan_ports", 0, 12)
    return {
        "source": "Shodan",
        "score": min(100, ports * 6),
        "open_ports": ports,
        "mock": True,
    }


# ---------- Live providers ----------

def live_abuseipdb(ioc: IoC, api_key: str) -> Dict[str, Any]:
    """AbuseIPDB check — IPs only. https://docs.abuseipdb.com/"""
    if ioc.type != "ip":
        return {"source": "AbuseIPDB", "score": 0, "skipped": True, "reason": "ip_only", "mock": False}
    r = ti_http.get(
        "https://api.abuseipdb.com/api/v2/check",
        provider="abuseipdb",
        headers={"Key": api_key, "Accept": "application/json"},
        params={"ipAddress": ioc.value, "maxAgeInDays": 90, "verbose": ""},
        timeout=ti_http.http_timeout(),
    )
    r.raise_for_status()
    data = r.json().get("data") or {}
    score = int(data.get("abuseConfidenceScore") or 0)
    return {
        "source": "AbuseIPDB",
        "score": score,
        "confidence": score,
        "reports": int(data.get("totalReports") or 0),
        "country": data.get("countryCode"),
        "isp": data.get("isp"),
        "usage_type": data.get("usageType"),
        "is_tor": bool(data.get("isTor")),
        "mock": False,
    }


def _vt_path(ioc: IoC) -> Optional[str]:
    if ioc.type == "ip":
        return f"https://www.virustotal.com/api/v3/ip_addresses/{ioc.value}"
    if ioc.type == "domain":
        return f"https://www.virustotal.com/api/v3/domains/{ioc.value}"
    if ioc.type == "url":
        # VirusTotal wants base64url without padding of the URL
        import base64
        url_id = base64.urlsafe_b64encode(ioc.value.encode()).decode().rstrip("=")
        return f"https://www.virustotal.com/api/v3/urls/{url_id}"
    if ioc.type in ("hash_md5", "hash_sha1", "hash_sha256"):
        return f"https://www.virustotal.com/api/v3/files/{ioc.value}"
    return None


def live_virustotal(ioc: IoC, api_key: str) -> Dict[str, Any]:
    path = _vt_path(ioc)
    if not path:
        return {"source": "VirusTotal", "score": 0, "skipped": True, "reason": "unsupported_type", "mock": False}
    r = ti_http.get(
        path,
        provider="virustotal",
        headers={"x-apikey": api_key},
        timeout=ti_http.http_timeout(),
    )
    if r.status_code == 404:
        return {
            "source": "VirusTotal",
            "score": 0,
            "malicious": 0,
            "total_engines": 0,
            "not_found": True,
            "mock": False,
        }
    r.raise_for_status()
    attrs = (r.json().get("data") or {}).get("attributes") or {}
    stats = attrs.get("last_analysis_stats") or {}
    malicious = int(stats.get("malicious") or 0)
    suspicious = int(stats.get("suspicious") or 0)
    total = sum(int(stats.get(k) or 0) for k in ("malicious", "suspicious", "undetected", "harmless", "timeout"))
    score = int(((malicious + 0.5 * suspicious) / total) * 100) if total else 0
    cats = attrs.get("categories") or attrs.get("threat_names") or []
    if isinstance(cats, dict):
        cats = list(cats.values())[:4]
    return {
        "source": "VirusTotal",
        "score": min(100, score),
        "malicious": malicious,
        "suspicious": suspicious,
        "total_engines": total,
        "categories": list(cats)[:4] if cats else [],
        "mock": False,
    }


def live_greynoise(ioc: IoC, api_key: str) -> Dict[str, Any]:
    """GreyNoise community or enterprise IP lookup."""
    if ioc.type != "ip":
        return {"source": "GreyNoise", "score": 0, "classification": "unknown", "skipped": True, "reason": "ip_only",
                "mock": False}
    # Prefer authenticated community endpoint when key present
    r = ti_http.get(
        f"https://api.greynoise.io/v3/community/{ioc.value}",
        provider="greynoise",
        headers={"key": api_key, "Accept": "application/json"},
        timeout=ti_http.http_timeout(),
    )
    if r.status_code == 404:
        return {
            "source": "GreyNoise",
            "classification": "unknown",
            "score": 40,
            "noise": False,
            "riot": False,
            "not_found": True,
            "mock": False,
        }
    r.raise_for_status()
    data = r.json()
    classification = (data.get("classification") or "unknown").lower()
    if classification == "malicious":
        score = 100
    elif classification == "benign":
        score = 0
    else:
        score = 40
    return {
        "source": "GreyNoise",
        "classification": classification,
        "score": score,
        "actor": data.get("name") or data.get("actor"),
        "noise": bool(data.get("noise")),
        "riot": bool(data.get("riot")),
        "mock": False,
    }


def live_threatfox(ioc: IoC, api_key: str) -> Dict[str, Any]:
    """ThreatFox IOC search (abuse.ch). Auth via Auth-Key header when provided."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Auth-Key"] = api_key
    # search_ioc expects the raw IOC string
    r = ti_http.post(
        "https://threatfox-api.abuse.ch/api/v1/",
        provider="threatfox",
        headers=headers,
        json={"query": "search_ioc", "search_term": ioc.value},
        timeout=ti_http.http_timeout(),
    )
    r.raise_for_status()
    body = r.json()
    if body.get("query_status") in ("no_result", "no_result_error"):
        return {
            "source": "ThreatFox",
            "score": 0,
            "malware_family": None,
            "confidence": 0,
            "not_found": True,
            "mock": False,
        }
    if body.get("query_status") != "ok":
        # Auth or other error — surface for fallback
        raise RuntimeError(f"ThreatFox status: {body.get('query_status')}")
    data = body.get("data") or []
    if not data:
        return {
            "source": "ThreatFox",
            "score": 0,
            "malware_family": None,
            "confidence": 0,
            "not_found": True,
            "mock": False,
        }
    confidences = [int(d.get("confidence_level") or 0) for d in data]
    confidence = max(confidences) if confidences else 0
    families = [d.get("malware_printable") or d.get("malware") for d in data if
                d.get("malware_printable") or d.get("malware")]
    family = families[0] if families else None
    return {
        "source": "ThreatFox",
        "score": min(100, confidence),
        "malware_family": family,
        "confidence": confidence,
        "hit_count": len(data),
        "mock": False,
    }


def live_otx(ioc: IoC, api_key: str) -> Dict[str, Any]:
    """AlienVault OTX general indicator lookup."""
    type_map = {
        "ip": "IPv4",
        "domain": "domain",
        "url": "url",
        "hash_md5": "file",
        "hash_sha1": "file",
        "hash_sha256": "file",
    }
    section = type_map.get(ioc.type)
    if not section:
        return {"source": "AlienVault OTX", "score": 0, "skipped": True, "reason": "unsupported_type", "mock": False}
    r = ti_http.get(
        f"https://otx.alienvault.com/api/v1/indicators/{section}/{ioc.value}/general",
        provider="otx",
        headers={"X-OTX-API-KEY": api_key},
        timeout=ti_http.http_timeout(),
    )
    if r.status_code == 404:
        return {"source": "AlienVault OTX", "score": 0, "pulse_count": 0, "not_found": True, "mock": False}
    r.raise_for_status()
    data = r.json()
    pulse = int((data.get("pulse_info") or {}).get("count") or 0)
    return {
        "source": "AlienVault OTX",
        "score": min(100, pulse * 8),
        "pulse_count": pulse,
        "mock": False,
    }


def live_shodan(ioc: IoC, api_key: str) -> Dict[str, Any]:
    if ioc.type != "ip":
        return {"source": "Shodan", "score": 0, "skipped": True, "reason": "ip_only", "mock": False}
    r = ti_http.get(
        f"https://api.shodan.io/shodan/host/{ioc.value}",
        provider="shodan",
        params={"key": api_key},
        timeout=ti_http.http_timeout(),
    )
    if r.status_code == 404:
        return {"source": "Shodan", "score": 0, "open_ports": 0, "not_found": True, "mock": False}
    r.raise_for_status()
    data = r.json()
    ports = data.get("ports") or []
    vulns = data.get("vulns") or []
    score = min(100, len(ports) * 5 + len(vulns) * 15)
    return {
        "source": "Shodan",
        "score": score,
        "open_ports": len(ports),
        "ports": ports[:20],
        "vulns": list(vulns)[:10] if isinstance(vulns, (list, set)) else list(vulns.keys())[:10],
        "org": data.get("org"),
        "mock": False,
    }


def _app_env() -> str:
    return (os.environ.get("ENV") or "dev").strip().lower()


def _force_mock_env() -> bool:
    return (os.environ.get("FORCE_MOCK_TI") or "").strip().lower() in ("1", "true", "yes", "on")


def _unscored_source(name: str) -> Dict[str, Any]:
    """A-E1: non-dev without API key — do not invent mock threat scores."""
    return {
        "source": name,
        "score": 0,
        "mock": False,
        "unscored": True,
        "reason": "no_api_key",
    }


def _run_source(
        name: str,
        live_fn,
        mock_fn,
        ioc: IoC,
        api_key: str,
        *,
        allow_mock: bool,
) -> Dict[str, Any]:
    if not api_key:
        if allow_mock:
            return mock_fn(ioc)
        return _unscored_source(name)
    t0 = time.perf_counter()
    try:
        result = live_fn(ioc, api_key)
        result.setdefault("mock", False)
        try:
            from backend.metrics_registry import record_ti

            record_ti(name.lower().replace(" ", "_"), "live", time.perf_counter() - t0)
        except Exception:
            pass
        return result
    except ti_http.CircuitOpenError as e:
        logger.warning(
            "%s circuit open for %s=%s (%.0fs left) — using mock",
            name, ioc.type, ioc.value[:40], e.remaining,
        )
        out = mock_fn(ioc)
        out["live_error"] = "CircuitOpen"
        out["fallback_mock"] = True
        out["circuit_open"] = True
        try:
            from backend.metrics_registry import record_ti

            record_ti(name.lower().replace(" ", "_"), "circuit", time.perf_counter() - t0)
        except Exception:
            pass
        return out
    except Exception as e:
        logger.warning("%s live enrichment failed for %s=%s: %s — using mock",
                       name, ioc.type, ioc.value[:40], type(e).__name__)
        out = mock_fn(ioc)
        out["live_error"] = type(e).__name__
        out["fallback_mock"] = True
        try:
            from backend.metrics_registry import record_ti

            record_ti(name.lower().replace(" ", "_"), "error", time.perf_counter() - t0)
        except Exception:
            pass
        return out


def enrich_ioc(
        ioc: IoC,
        settings: Optional[dict] = None,
        *,
        force_mock: bool = False,
) -> IoC:
    """Enrich IoC with threat intel. Live when keys exist; mock otherwise.

    force_mock=True: never call live APIs (ignore Settings + env keys).
    Used by golden benchmark / CI so offline runs stay fast and deterministic.

    A-E1: In non-dev (and FORCE_MOCK_TI not set), missing keys yield unscored 0
    instead of deterministic mock scores that inflate severity.
    """
    if ioc.type not in ("ip", "domain", "url", "hash_md5", "hash_sha1", "hash_sha256"):
        ioc.enrichment = {"skipped": True}
        return ioc

    settings = settings or {}
    env = _app_env()
    use_mock_default = force_mock or _force_mock_env() or env in ("dev", "test", "local", "")
    if force_mock or _force_mock_env():
        abuse_key = vt_key = gn_key = tf_key = otx_key = shodan_key = ""
        allow_mock = True
    else:
        abuse_key = _key(settings, "abuseipdb_key", "ABUSEIPDB_API_KEY")
        vt_key = _key(settings, "virustotal_key", "VIRUSTOTAL_API_KEY")
        gn_key = _key(settings, "greynoise_key", "GREYNOISE_API_KEY")
        tf_key = _key(settings, "threatfox_key", "THREATFOX_API_KEY")
        otx_key = _key(settings, "otx_api_key", "OTX_API_KEY")
        shodan_key = _key(settings, "shodan_api_key", "SHODAN_API_KEY")
        allow_mock = use_mock_default

    a = _run_source("AbuseIPDB", live_abuseipdb, mock_abuseipdb, ioc, abuse_key, allow_mock=allow_mock)
    v = _run_source("VirusTotal", live_virustotal, mock_virustotal, ioc, vt_key, allow_mock=allow_mock)
    g = _run_source("GreyNoise", live_greynoise, mock_greynoise, ioc, gn_key, allow_mock=allow_mock)
    t = _run_source("ThreatFox", live_threatfox, mock_threatfox, ioc, tf_key, allow_mock=allow_mock)
    o = _run_source("OTX", live_otx, mock_otx, ioc, otx_key, allow_mock=allow_mock)
    s = _run_source("Shodan", live_shodan, mock_shodan, ioc, shodan_key, allow_mock=allow_mock)

    # Weighted mean of core four; OTX/Shodan slightly boost when live hits
    score = 0.3 * a.get("score", 0) + 0.4 * v.get("score", 0) + 0.3 * t.get("score", 0)
    if g.get("classification") == "benign":
        score = min(score, 15.0)
    elif g.get("classification") == "malicious":
        score = max(score, 70.0)
    if not o.get("mock") and o.get("pulse_count", 0) > 0:
        score = min(100.0, score + min(15.0, o["pulse_count"] * 2))
    if not s.get("mock") and s.get("open_ports", 0) > 5:
        score = min(100.0, score + 5.0)

    ioc.threat_score = round(float(score), 1)
    ioc.enrichment = {
        "abuseipdb": a,
        "virustotal": v,
        "greynoise": g,
        "threatfox": t,
        "otx": o,
        "shodan": s,
        "weighted_score": ioc.threat_score,
        "mode": {
            "abuseipdb": "live" if not a.get("mock") and not a.get("unscored") else (
                "unscored" if a.get("unscored") else "mock"),
            "virustotal": "live" if not v.get("mock") and not v.get("unscored") else (
                "unscored" if v.get("unscored") else "mock"),
            "greynoise": "live" if not g.get("mock") and not g.get("unscored") else (
                "unscored" if g.get("unscored") else "mock"),
            "threatfox": "live" if not t.get("mock") and not t.get("unscored") else (
                "unscored" if t.get("unscored") else "mock"),
            "otx": "live" if not o.get("mock") and not o.get("unscored") else (
                "unscored" if o.get("unscored") else "mock"),
            "shodan": "live" if not s.get("mock") and not s.get("unscored") else (
                "unscored" if s.get("unscored") else "mock"),
        },
    }
    return ioc
