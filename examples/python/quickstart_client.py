"""Minimal ACTIRA API client example (Python).

Usage:
  export ACTIRA_BASE=http://127.0.0.1:8001
  export ACTIRA_EMAIL=analyst@soc.example.com
  export ACTIRA_PASSWORD=Analyst123!
  python examples/python/quickstart_client.py
"""
from __future__ import annotations

import os
import sys

import requests

BASE = os.environ.get("ACTIRA_BASE", "http://127.0.0.1:8001").rstrip("/")
EMAIL = os.environ.get("ACTIRA_EMAIL", "analyst@soc.example.com")
PASSWORD = os.environ.get("ACTIRA_PASSWORD", "Analyst123!")


def main() -> int:
    health = requests.get(f"{BASE}/api/health", timeout=10)
    health.raise_for_status()
    print("health:", health.json())

    login = requests.post(
        f"{BASE}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    login.raise_for_status()
    data = login.json()
    token = data.get("access_token")
    if not token:
        print("No access_token in response (cookie-only mode?).", file=sys.stderr)
        return 1

    headers = {"Authorization": f"Bearer {token}"}
    incidents = requests.get(f"{BASE}/api/incidents", headers=headers, timeout=30)
    incidents.raise_for_status()
    body = incidents.json()
    items = body if isinstance(body, list) else body.get("items") or body.get("incidents") or body
    n = len(items) if isinstance(items, list) else "?"
    print(f"incidents: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
