"""
Capture live ACTIRA UI screenshots into docs/capstone/assets/screenshots/.

Requires: backend :8001, frontend :3000, playwright + chromium, demo users.

  python docs/capstone/capture_screenshots.py

Viewport (submission standard):
  viewport={"width": 1920, "height": 1200}
  device_scale_factor=1.00
  color_scheme="light"
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from _capture_theme import (  # noqa: E402
    apply_light_context,
    assert_light_screenshot,
    force_light_theme,
)

OUT = ROOT / "assets" / "screenshots"
BASE = "http://localhost:3000"
ADMIN = {"email": "admin@soc.example.com", "password": "Admin123!"}
REVIEWER = {"email": "reviewer@soc.example.com", "password": "Reviewer123!"}

SHOTS = []  # filled as we go

VIEWPORT = {"width": 1920, "height": 1200}
DEVICE_SCALE = 1.00


def shot(page, name: str, full_page: bool = False, *, require_light: bool = False):
    OUT.mkdir(parents=True, exist_ok=True)
    force_light_theme(page)
    page.wait_for_timeout(250)
    path = OUT / name
    page.screenshot(path=str(path), full_page=full_page)
    if require_light and not assert_light_screenshot(path):
        # One more hard force + reload-free repaint before accepting a dark frame
        print(f"  WARN {name} looked dark — re-forcing light and re-shooting")
        force_light_theme(page)
        page.wait_for_timeout(400)
        page.evaluate(
            """() => {
              localStorage.setItem('soc_theme', 'light');
              if (typeof window.__ACTIRA_SET_THEME__ === 'function')
                window.__ACTIRA_SET_THEME__('light');
              window.dispatchEvent(new CustomEvent('actira-force-theme', { detail: { theme: 'light' } }));
            }"""
        )
        force_light_theme(page)
        page.wait_for_timeout(350)
        page.screenshot(path=str(path), full_page=full_page)
        if not assert_light_screenshot(path):
            print(f"  ERROR {name} still dark after re-force — check ThemeProvider / CSS")
    print(f"  wrote {path.name} ({path.stat().st_size // 1024} KB)")
    SHOTS.append(name)


def login(page, email: str, password: str):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(800)
    force_light_theme(page)
    if "/login" not in page.url:
        page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        force_light_theme(page)
    email_sel = page.locator('[data-testid="auth-email"], input[type="email"], #auth-email').first
    pass_sel = page.locator('[data-testid="auth-password"], input[type="password"]').first
    email_sel.fill(email)
    pass_sel.fill(password)
    page.locator('[data-testid="auth-submit"], button[type="submit"]').first.click()
    page.wait_for_timeout(2000)
    for _ in range(20):
        if "/login" not in page.url:
            break
        page.wait_for_timeout(500)
    force_light_theme(page)


def logout(page):
    for sel in [
        '[data-testid="logout"]',
        'button:has-text("Log out")',
        'button:has-text("Logout")',
        'a:has-text("Logout")',
        'text=Sign out',
    ]:
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible():
            loc.first.click()
            page.wait_for_timeout(1000)
            return
    page.context.clear_cookies()
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")


def safe_goto(page, path: str, wait_ms: int = 1500):
    page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(wait_ms)
    force_light_theme(page)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Capturing from {BASE} → {OUT}")
    print(f"  viewport={VIEWPORT} dpr={DEVICE_SCALE} color_scheme=light")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=DEVICE_SCALE,
            color_scheme="light",
            reduced_motion="reduce",
        )
        apply_light_context(context)
        page = context.new_page()
        page.set_default_timeout(30000)
        try:
            page.emulate_media(color_scheme="light", reduced_motion="reduce")
        except Exception:
            page.emulate_media(color_scheme="light")

        # 01 Login — pure white/slate enterprise shell (not dark/blue night scheme)
        # Init script sets localStorage before first paint; reload settles ThemeProvider.
        safe_goto(page, "/login", 1200)
        force_light_theme(page)
        page.wait_for_timeout(300)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(700)
        force_light_theme(page)
        page.wait_for_timeout(300)
        # If React still reports dark preference, force + reload once more
        try:
            state = page.evaluate(
                """() => {
                  const t = document.documentElement.getAttribute('data-theme');
                  const dark = document.documentElement.classList.contains('dark');
                  const pref = localStorage.getItem('soc_theme');
                  return { t, dark, pref };
                }"""
            )
            if state.get("dark") or state.get("t") == "dark" or state.get("pref") not in (None, "light"):
                page.evaluate(
                    """() => {
                      localStorage.setItem('soc_theme', 'light');
                      if (typeof window.__ACTIRA_SET_THEME__ === 'function')
                        window.__ACTIRA_SET_THEME__('light');
                      window.dispatchEvent(new CustomEvent('actira-force-theme', { detail: { theme: 'light' } }));
                    }"""
                )
                page.reload(wait_until="domcontentloaded")
                page.wait_for_timeout(800)
                force_light_theme(page)
                page.wait_for_timeout(300)
        except Exception:
            pass
        force_light_theme(page)
        shot(page, "01_login.png", require_light=True)

        login(page, ADMIN["email"], ADMIN["password"])
        force_light_theme(page)

        safe_goto(page, "/", 2500)
        shot(page, "02_dashboard.png")

        for path in ("/upload", "/ingest", "/logs"):
            try:
                safe_goto(page, path, 1500)
                if (
                    page.locator("text=Upload").count()
                    or page.locator("text=Ingest").count()
                    or "upload" in page.url.lower()
                    or "ingest" in page.url.lower()
                ):
                    shot(page, "03_upload.png")
                    break
            except Exception:
                continue
        else:
            for t in ("Ingest", "Upload", "Logs"):
                loc = page.locator(f'a:has-text("{t}"), button:has-text("{t}")')
                if loc.count():
                    loc.first.click()
                    page.wait_for_timeout(1500)
                    force_light_theme(page)
                    shot(page, "03_upload.png")
                    break

        safe_goto(page, "/incidents", 2000)
        shot(page, "04_incidents.png")

        incident_href = None
        links = page.locator('a[href*="/incidents/"]')
        if links.count():
            href = links.first.get_attribute("href") or ""
            if re.search(r"/incidents/[^/]+", href):
                incident_href = href if href.startswith("http") else href

        if not incident_href:
            rows = page.locator('[data-testid*="incident"], table tbody tr, .incident-row')
            if rows.count():
                rows.first.click()
                page.wait_for_timeout(2000)
                if "/incidents/" in page.url:
                    incident_href = page.url

        if incident_href:
            if incident_href.startswith("http"):
                page.goto(incident_href, wait_until="domcontentloaded")
            else:
                safe_goto(page, incident_href if incident_href.startswith("/") else f"/{incident_href}", 2500)
            page.wait_for_timeout(1500)
            force_light_theme(page)
            shot(page, "05_workspace.png")

            for tab in ("Graph", "Assets", "Entity"):
                loc = page.locator(
                    f'button:has-text("{tab}"), [role="tab"]:has-text("{tab}"), a:has-text("{tab}")'
                )
                if loc.count():
                    loc.first.click()
                    page.wait_for_timeout(1200)
                    force_light_theme(page)
                    shot(page, "06_graph.png")
                    break
            else:
                shot(page, "06_graph.png")

            for tab in ("Playbook", "Playbooks", "Recommendations"):
                loc = page.locator(
                    f'button:has-text("{tab}"), [role="tab"]:has-text("{tab}"), a:has-text("{tab}")'
                )
                if loc.count():
                    loc.first.click()
                    page.wait_for_timeout(1200)
                    force_light_theme(page)
                    shot(page, "07_playbook.png")
                    break
            else:
                shot(page, "07_playbook.png")
        else:
            print("  no incidents found — workspace/graph/playbook will reuse dashboard-style captures")
            safe_goto(page, "/incidents", 1000)
            shot(page, "05_workspace.png")
            shot(page, "06_graph.png")
            shot(page, "07_playbook.png")

        for path in ("/review", "/reviews"):
            safe_goto(page, path, 1800)
            if "review" in page.url.lower() or page.locator("text=Review").count():
                shot(page, "08_review.png")
                break
        else:
            loc = page.locator('a:has-text("Review")')
            if loc.count():
                loc.first.click()
                page.wait_for_timeout(1500)
            force_light_theme(page)
            shot(page, "08_review.png")

        safe_goto(page, "/hunt", 1800)
        shot(page, "09_hunt.png")

        safe_goto(page, "/compliance", 2000)
        shot(page, "10_compliance.png")

        safe_goto(page, "/audit", 2000)
        try:
            first_view = page.locator('[data-testid^="audit-inspect-btn-"], button:has-text("View")').first
            if first_view.count() and first_view.is_visible():
                first_view.click()
                page.wait_for_timeout(600)
        except Exception:
            pass
        shot(page, "13_audit.png")
        try:
            close_btn = page.locator('[data-testid="audit-inspect-close"]')
            if close_btn.count() and close_btn.first.is_visible():
                close_btn.first.click()
                page.wait_for_timeout(300)
        except Exception:
            pass

        safe_goto(page, "/benchmark", 2000)
        shot(page, "14_golden.png")

        safe_goto(page, "/settings", 2000)
        for tab in ("LLM", "AI", "Models", "Providers"):
            loc = page.locator(
                f'button:has-text("{tab}"), [role="tab"]:has-text("{tab}"), a:has-text("{tab}")'
            )
            if loc.count():
                try:
                    loc.first.click()
                    page.wait_for_timeout(1000)
                except Exception:
                    pass
                break
        shot(page, "11_settings_llm.png")

        # Architecture / diagram posters (light SVG → PNG for PDF + PPT)
        arch_figs = [
            ("12_architecture.svg", "12_architecture.png"),
            ("data_flow.svg", "15_data_flow.png"),
            ("components.svg", "16_components.png"),
            ("rag_pipeline.svg", "17_rag_pipeline.png"),
            ("hitl_policy.svg", "18_hitl_policy.png"),
        ]
        dark_to_light = {
            "#0B1220": "#F8FAFC",
            "#121A2B": "#FFFFFF",
            "#243044": "#E2E8F0",
            "#E8EEF7": "#0F172A",
            "#38BDF8": "#2563EB",
            "#1E3A5F": "#DBEAFE",
            "#164E63": "#CFFAFE",
            "#34D399": "#059669",
            "#94A3B8": "#64748B",
            "#713F12": "#FEF3C7",
            "#14532D": "#D1FAE5",
        }
        for svg_name, png_name in arch_figs:
            fig = ROOT / "assets" / "figures" / svg_name
            if not fig.exists():
                print(f"  skip missing figure {svg_name}")
                continue
            svg = fig.read_text(encoding="utf-8")
            for dark, light in dark_to_light.items():
                svg = svg.replace(dark, light).replace(dark.lower(), light)
            page.set_content(
                f"""<!doctype html><html><head><meta charset="utf-8">
                <style>html,body{{margin:0;background:#F8FAFC;min-height:100vh;
                display:flex;align-items:center;justify-content:center;padding:16px}}</style>
                </head><body>{svg}</body></html>""",
                wait_until="domcontentloaded",
            )
            page.wait_for_timeout(350)
            shot(page, png_name)
            # Mirror into figures/ for PDF twin lookup (all architecture posters)
            try:
                import shutil

                twin_name = {
                    "12_architecture.png": "12_architecture.png",
                    "15_data_flow.png": "data_flow.png",
                    "16_components.png": "components.png",
                    "17_rag_pipeline.png": "rag_pipeline.png",
                    "18_hitl_policy.png": "hitl_policy.png",
                }.get(png_name)
                if twin_name:
                    dest = ROOT / "assets" / "figures" / twin_name
                    shutil.copy2(OUT / png_name, dest)
                    print(f"  twin → figures/{twin_name}")
            except Exception as e:
                print(f"  figure twin copy skipped: {e}")

        browser.close()

    print(f"Done: {len(SHOTS)} screenshots")
    for s in SHOTS:
        print(" -", s)


if __name__ == "__main__":
    main()
