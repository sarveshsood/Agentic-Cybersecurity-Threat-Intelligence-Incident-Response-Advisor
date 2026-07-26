#!/usr/bin/env python3
"""Standalone smoke test: send ACTIRA alert email without SMTP details.

Usage:

  set REACT_APP_BACKEND_URL=http://127.0.0.1:8001
  set SMOKE_EMAIL_TO=sarvesh.sood@gmail.com
  python backend/tests/smoke_email_alert.py

SMTP_* is optional. Default delivery uses a zero-config HTTP gateway + local outbox.
"""
from __future__ import annotations

import json
import os
import sys

import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://127.0.0.1:8001").rstrip("/")
API = f"{BASE}/api"
TO = os.environ.get("SMOKE_EMAIL_TO", "sarvesh.sood@gmail.com")
ADMIN = {
    "email": os.environ.get("SMOKE_ADMIN_EMAIL", "admin@soc.example.com"),
    "password": os.environ.get("SMOKE_ADMIN_PASSWORD", "Admin123!"),
}


def main() -> int:
    print(f"ACTIRA email smoke test → {TO}")
    print(f"API: {API}")
    print("SMTP details: NOT required (HTTP gateway default)")

    try:
        health = requests.get(f"{API}/", timeout=5)
    except requests.RequestException as e:
        print(f"FAIL: API not reachable: {e}")
        return 2
    if health.status_code != 200:
        print(f"FAIL: health {health.status_code} {health.text[:200]}")
        return 2

    login = requests.post(f"{API}/auth/login", json=ADMIN, timeout=15)
    if login.status_code != 200:
        print(f"FAIL: login {login.status_code} {login.text[:300]}")
        return 2
    token = login.json()["access_token"]
    h = {"Authorization": f"Bearer {token}"}

    st = requests.get(f"{API}/settings/email-status", headers=h, timeout=15)
    print("email-status:", json.dumps(st.json(), indent=2)[:1500])

    r = requests.post(
        f"{API}/settings/test-email",
        headers=h,
        json={"to": TO, "save_recipient": True},
        timeout=60,
    )
    print(f"test-email status: {r.status_code}")
    try:
        body = r.json()
    except Exception:
        body = {"raw": r.text[:500]}
    print(json.dumps(body, indent=2)[:2500])

    if r.status_code == 200 and body.get("ok"):
        transport = (body.get("result") or {}).get("transport")
        print(f"\nOK — delivered via {transport} (no SMTP required)")
        print(f"Check inbox/spam for {TO}")
        note = body.get("activation_note") or (body.get("result") or {}).get("activation_note")
        if note:
            print(f"Note: {note}")
        return 0

    detail = body.get("detail") if isinstance(body, dict) else body
    if isinstance(detail, dict) and detail.get("outbox_id"):
        print(f"\nOutbox recorded: {detail.get('outbox_id')}")
        print("Remote delivery failed; outbox file is under backend/data/email_outbox/")
    print("\nFAIL — email not confirmed delivered")
    return 1


if __name__ == "__main__":
    sys.exit(main())
