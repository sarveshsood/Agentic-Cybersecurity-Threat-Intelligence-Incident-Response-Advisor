"""Threat-intel HTTP client: timeouts, proxy/SSL, retries, circuit breakers.

Env / settings knobs
--------------------
- ``TI_HTTP_TIMEOUT`` — request timeout seconds (default 8)
- ``TI_HTTP_RETRIES`` — retries after first attempt (default 2)
- ``TI_HTTP_BACKOFF_BASE`` — exponential backoff base seconds (default 0.4)
- ``TI_HTTP_PROXY`` / ``HTTPS_PROXY`` / ``HTTP_PROXY`` — outbound proxy
- ``TI_HTTP_CA_BUNDLE`` / ``REQUESTS_CA_BUNDLE`` / ``SSL_CERT_FILE`` — custom CA
- ``TI_HTTP_VERIFY_SSL`` — ``0`` disables TLS verify (lab only; default on)
- ``TI_CIRCUIT_FAILURES`` — open circuit after N consecutive failures (default 5)
- ``TI_CIRCUIT_COOLDOWN_SECONDS`` — open duration (default 60)

Per-provider circuit keys: ``abuseipdb``, ``virustotal``, ``greynoise``,
``threatfox``, ``otx``, ``shodan``.
"""
from __future__ import annotations

import logging
import os
import threading
import time
from typing import Any, Dict, Optional

import requests
from requests.adapters import HTTPAdapter

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_circuits: Dict[str, Dict[str, Any]] = {}
_session: Optional[requests.Session] = None
_session_lock = threading.Lock()


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return float(raw)
    except (TypeError, ValueError):
        return default


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(raw)
    except (TypeError, ValueError):
        return default


def _truthy(name: str, default: bool = True) -> bool:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def http_timeout() -> float:
    return max(1.0, _float_env("TI_HTTP_TIMEOUT", 8.0))


def max_retries() -> int:
    return max(0, min(8, _int_env("TI_HTTP_RETRIES", 2)))


def backoff_base() -> float:
    return max(0.05, _float_env("TI_HTTP_BACKOFF_BASE", 0.4))


def circuit_threshold() -> int:
    return max(1, _int_env("TI_CIRCUIT_FAILURES", 5))


def circuit_cooldown() -> float:
    return max(5.0, _float_env("TI_CIRCUIT_COOLDOWN_SECONDS", 60.0))


def _proxy_dict() -> Optional[Dict[str, str]]:
    proxy = (
        (os.environ.get("TI_HTTP_PROXY") or "").strip()
        or (os.environ.get("HTTPS_PROXY") or "").strip()
        or (os.environ.get("HTTP_PROXY") or "").strip()
    )
    if not proxy:
        return None
    return {"http": proxy, "https": proxy}


def _verify() -> Any:
    if not _truthy("TI_HTTP_VERIFY_SSL", default=True):
        return False
    for key in ("TI_HTTP_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "SSL_CERT_FILE"):
        path = (os.environ.get(key) or "").strip()
        if path and os.path.isfile(path):
            return path
    return True


def get_session() -> requests.Session:
    """Shared session (connection pool) for TI calls."""
    global _session
    with _session_lock:
        if _session is None:
            s = requests.Session()
            adapter = HTTPAdapter(pool_connections=20, pool_maxsize=20, max_retries=0)
            s.mount("https://", adapter)
            s.mount("http://", adapter)
            proxies = _proxy_dict()
            if proxies:
                s.proxies.update(proxies)
            s.verify = _verify()
            _session = s
        return _session


def reset_session() -> None:
    """Test helper — drop cached session."""
    global _session
    with _session_lock:
        if _session is not None:
            try:
                _session.close()
            except Exception:
                pass
        _session = None


def reset_circuits() -> None:
    with _lock:
        _circuits.clear()


def circuit_states() -> Dict[str, Dict[str, Any]]:
    with _lock:
        return {k: dict(v) for k, v in _circuits.items()}


class CircuitOpenError(RuntimeError):
    def __init__(self, provider: str, remaining: float):
        self.provider = provider
        self.remaining = remaining
        super().__init__(f"circuit_open:{provider}:{remaining:.1f}s")


def _circuit_allow(provider: str) -> None:
    key = (provider or "unknown").lower()
    now = time.monotonic()
    with _lock:
        st = _circuits.get(key)
        if not st:
            return
        if st.get("state") == "open":
            until = float(st.get("open_until") or 0)
            if now < until:
                raise CircuitOpenError(key, until - now)
            # half-open: allow one probe
            st["state"] = "half_open"


def _circuit_success(provider: str) -> None:
    key = (provider or "unknown").lower()
    with _lock:
        _circuits[key] = {"state": "closed", "failures": 0, "open_until": 0}


def _circuit_failure(provider: str) -> None:
    key = (provider or "unknown").lower()
    thr = circuit_threshold()
    cool = circuit_cooldown()
    now = time.monotonic()
    with _lock:
        st = _circuits.setdefault(key, {"state": "closed", "failures": 0, "open_until": 0})
        st["failures"] = int(st.get("failures") or 0) + 1
        if st["failures"] >= thr:
            st["state"] = "open"
            st["open_until"] = now + cool
            logger.warning(
                "TI circuit OPEN for %s after %s failures (cooldown=%.0fs)",
                key,
                st["failures"],
                cool,
            )


def _retriable_status(code: int) -> bool:
    return code in (408, 425, 429, 500, 502, 503, 504)


def request(
    method: str,
    url: str,
    *,
    provider: str = "ti",
    headers: Optional[dict] = None,
    params: Optional[dict] = None,
    json: Optional[dict] = None,
    timeout: Optional[float] = None,
    retries: Optional[int] = None,
) -> requests.Response:
    """HTTP request with circuit breaker + exponential backoff retries."""
    _circuit_allow(provider)
    to = timeout if timeout is not None else http_timeout()
    attempts = 1 + (retries if retries is not None else max_retries())
    session = get_session()
    last_exc: Optional[BaseException] = None
    base = backoff_base()

    for attempt in range(attempts):
        try:
            resp = session.request(
                method.upper(),
                url,
                headers=headers,
                params=params,
                json=json,
                timeout=to,
            )
            # Do not retry auth / client errors except retriable set
            if resp.status_code < 400 or resp.status_code in (404,):
                _circuit_success(provider)
                return resp
            if _retriable_status(resp.status_code) and attempt < attempts - 1:
                sleep_s = base * (2 ** attempt)
                logger.info(
                    "TI %s HTTP %s — retry %s/%s in %.2fs",
                    provider,
                    resp.status_code,
                    attempt + 1,
                    attempts - 1,
                    sleep_s,
                )
                time.sleep(sleep_s)
                continue
            # Non-retriable 4xx or exhausted retries
            if resp.status_code >= 500 or resp.status_code == 429:
                _circuit_failure(provider)
            else:
                _circuit_success(provider)
            return resp
        except CircuitOpenError:
            raise
        except (requests.Timeout, requests.ConnectionError, requests.SSLError) as e:
            last_exc = e
            if attempt < attempts - 1:
                sleep_s = base * (2 ** attempt)
                logger.info(
                    "TI %s %s — retry %s/%s in %.2fs",
                    provider,
                    type(e).__name__,
                    attempt + 1,
                    attempts - 1,
                    sleep_s,
                )
                time.sleep(sleep_s)
                continue
            _circuit_failure(provider)
            raise
        except requests.RequestException as e:
            last_exc = e
            _circuit_failure(provider)
            raise
    if last_exc:
        raise last_exc
    raise RuntimeError(f"TI request failed for {provider}")


def get(url: str, **kwargs: Any) -> requests.Response:
    return request("GET", url, **kwargs)


def post(url: str, **kwargs: Any) -> requests.Response:
    return request("POST", url, **kwargs)
