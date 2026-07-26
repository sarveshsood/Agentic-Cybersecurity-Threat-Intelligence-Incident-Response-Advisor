"""
Capture live ACTIRA UI screenshots into docs/capstone/assets/screenshots/.

Requires: backend :8001, frontend :3000, playwright + chromium, demo users.

  python docs/capstone/capture_screenshots.py
"""
from __future__ import annotations

import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "assets" / "screenshots"
BASE = "http://localhost:3000"
ADMIN = {"email": "admin@soc.example.com", "password": "Admin123!"}
REVIEWER = {"email": "reviewer@soc.example.com", "password": "Reviewer123!"}

SHOTS = []  # filled as we go


def shot(page, name: str, full_page: bool = False):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    page.screenshot(path=str(path), full_page=full_page)
    print(f"  wrote {path.name} ({path.stat().st_size // 1024} KB)")
    SHOTS.append(name)


def login(page, email: str, password: str):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(800)
    # dismiss if already logged in
    if "/login" not in page.url:
        page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        page.wait_for_timeout(500)
    email_sel = page.locator('[data-testid="auth-email"], input[type="email"], #auth-email').first
    pass_sel = page.locator('[data-testid="auth-password"], input[type="password"]').first
    email_sel.fill(email)
    pass_sel.fill(password)
    page.locator('[data-testid="auth-submit"], button[type="submit"]').first.click()
    page.wait_for_timeout(2000)
    # wait for leave login
    for _ in range(20):
        if "/login" not in page.url:
            break
        page.wait_for_timeout(500)


def logout(page):
    # try common paths
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
    # clear cookies via context
    page.context.clear_cookies()
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")


def safe_goto(page, path: str, wait_ms: int = 1500):
    page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(wait_ms)


def force_light_theme(page):
    """Persist light theme and strip any stale per-route theme overrides."""
    page.evaluate(
        """() => {
            localStorage.setItem('soc_theme', 'light');
            try {
                const key = 'actira_ui_prefs_v1';
                const raw = localStorage.getItem(key);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                const rp = parsed.route_prefs || {};
                let changed = false;
                for (const route of Object.keys(rp)) {
                    if (rp[route] && 'theme' in rp[route]) {
                        delete rp[route].theme;
                        changed = true;
                    }
                }
                if (changed) {
                    parsed.route_prefs = rp;
                    localStorage.setItem(key, JSON.stringify(parsed));
                }
            } catch (e) { /* ignore */ }
            const root = document.documentElement;
            root.setAttribute('data-theme', 'light');
            root.classList.add('light');
            root.classList.remove('dark');
            root.style.colorScheme = 'light';
        }"""
    )


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    print(f"Capturing from {BASE} → {OUT}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
            device_scale_factor=1.00,
            color_scheme="light",
        )
        # Seed theme before any app JS runs (survives navigations in this context)
        context.add_init_script(
            """() => {
                try { localStorage.setItem('soc_theme', 'light'); } catch (e) {}
            }"""
        )
        page = context.new_page()
        page.set_default_timeout(30000)

        # 01 Login (before auth)
        safe_goto(page, "/login", 1200)
        force_light_theme(page)
        page.wait_for_timeout(300)
        shot(page, "01_login.png")

        # Login as admin for broadest access
        login(page, ADMIN["email"], ADMIN["password"])
        force_light_theme(page)

        # 02 Dashboard
        safe_goto(page, "/", 2500)
        force_light_theme(page)
        page.wait_for_timeout(200)
        shot(page, "02_dashboard.png")

        # 03 Upload
        for path in ("/upload", "/ingest", "/logs"):
            try:
                safe_goto(page, path, 1500)
                if page.locator("text=Upload").count() or page.locator("text=Ingest").count() or "upload" in page.url.lower() or "ingest" in page.url.lower():
                    shot(page, "03_upload.png")
                    break
            except Exception:
                continue
        else:
            # nav click
            for t in ("Ingest", "Upload", "Logs"):
                loc = page.locator(f'a:has-text("{t}"), button:has-text("{t}")')
                if loc.count():
                    loc.first.click()
                    page.wait_for_timeout(1500)
                    shot(page, "03_upload.png")
                    break

        # 04 Incidents
        safe_goto(page, "/incidents", 2000)
        shot(page, "04_incidents.png")

        # Open first incident if any
        incident_href = None
        links = page.locator('a[href*="/incidents/"]')
        if links.count():
            href = links.first.get_attribute("href") or ""
            if re.search(r"/incidents/[^/]+", href):
                incident_href = href if href.startswith("http") else href

        if not incident_href:
            # try row click
            rows = page.locator('[data-testid*="incident"], table tbody tr, .incident-row')
            if rows.count():
                rows.first.click()
                page.wait_for_timeout(2000)
                if "/incidents/" in page.url:
                    incident_href = page.url

        # 05 Workspace
        if incident_href:
            if incident_href.startswith("http"):
                page.goto(incident_href, wait_until="domcontentloaded")
            else:
                safe_goto(page, incident_href if incident_href.startswith("/") else f"/{incident_href}", 2500)
            page.wait_for_timeout(1500)
            shot(page, "05_workspace.png")

            # 06 Graph tab
            for tab in ("Graph", "Assets", "Entity"):
                loc = page.locator(f'button:has-text("{tab}"), [role="tab"]:has-text("{tab}"), a:has-text("{tab}")')
                if loc.count():
                    loc.first.click()
                    page.wait_for_timeout(1200)
                    shot(page, "06_graph.png")
                    break
            else:
                shot(page, "06_graph.png")  # fallback same page

            # 07 Playbook
            for tab in ("Playbook", "Playbooks", "Recommendations"):
                loc = page.locator(f'button:has-text("{tab}"), [role="tab"]:has-text("{tab}"), a:has-text("{tab}")')
                if loc.count():
                    loc.first.click()
                    page.wait_for_timeout(1200)
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

        # 08 Review
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
            shot(page, "08_review.png")

        # 09 Hunt
        safe_goto(page, "/hunt", 1800)
        shot(page, "09_hunt.png")

        # 10 Compliance
        safe_goto(page, "/compliance", 2000)
        shot(page, "10_compliance.png")

        # 10b Audit trail (inspector-ready table)
        safe_goto(page, "/audit", 2000)
        force_light_theme(page)
        # open first row inspector if rows exist
        try:
            first_view = page.locator('[data-testid^="audit-inspect-btn-"], button:has-text("View")').first
            if first_view.count() and first_view.is_visible():
                first_view.click()
                page.wait_for_timeout(600)
        except Exception:
            pass
        shot(page, "13_audit.png")
        # close drawer if open
        try:
            close_btn = page.locator('[data-testid="audit-inspect-close"]')
            if close_btn.count() and close_btn.first.is_visible():
                close_btn.first.click()
                page.wait_for_timeout(300)
        except Exception:
            pass

        # 10c Golden benchmark (admin)
        safe_goto(page, "/benchmark", 2000)
        force_light_theme(page)
        shot(page, "14_golden.png")

        # 11 Settings LLM
        safe_goto(page, "/settings", 2000)
        # try LLM tab
        for tab in ("LLM", "AI", "Models", "Providers"):
            loc = page.locator(f'button:has-text("{tab}"), [role="tab"]:has-text("{tab}"), a:has-text("{tab}")')
            if loc.count():
                try:
                    loc.first.click()
                    page.wait_for_timeout(1000)
                except Exception:
                    pass
                break
        shot(page, "11_settings_llm.png")

        # 12 Architecture — render figure on light shell (matches capture theme)
        fig = ROOT / "assets" / "figures" / "12_architecture.svg"
        if fig.exists():
            svg = fig.read_text(encoding="utf-8")
            # If an older dark SVG is still on disk, remap to the light enterprise palette
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
            }
            for dark, light in dark_to_light.items():
                svg = svg.replace(dark, light).replace(dark.lower(), light)
            page.set_content(
                f"""<!doctype html><html><body style="margin:0;background:#F8FAFC;display:flex;align-items:center;justify-content:center;min-height:100vh">
                {svg}
                </body></html>""",
                wait_until="domcontentloaded",
            )
            page.wait_for_timeout(400)
            shot(page, "12_architecture.png")
        else:
            safe_goto(page, "/", 1000)
            force_light_theme(page)
            shot(page, "12_architecture.png")

        browser.close()

    print(f"Done: {len(SHOTS)} screenshots")
    for s in SHOTS:
        print(" -", s)


if __name__ == "__main__":
    main()
