"""
Record ACTIRA 5-minute capstone demo video (silent UI walkthrough).

Requires: backend :8001, frontend :3000, playwright chromium, demo users seeded.

  python docs/capstone/record_demo_video.py

Output:
  docs/capstone/assets/video/ACTIRA_Capstone_Demo_5min.webm  (Playwright native)
  docs/capstone/assets/video/ACTIRA_Capstone_Demo_5min.mp4   (if ffmpeg available)

Voiceover: use docs/capstone/DEMO_VIDEO_5MIN.md while this plays (or dub later).
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PwTimeout

ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT / "assets" / "video"
BASE = "http://localhost:3000"
ADMIN = {"email": "admin@soc.example.com", "password": "Admin123!"}
REVIEWER = {"email": "reviewer@soc.example.com", "password": "Reviewer123!"}
ANALYST = {"email": "analyst@soc.example.com", "password": "Analyst123!"}

# Target ~300s wall clock for a full 5-minute deliverable
TARGET_SECONDS = 300


def dwell(page, seconds: float, label: str = ""):
    ms = max(0, int(seconds * 1000))
    if label:
        print(f"  … {label} ({seconds:.1f}s)")
    page.wait_for_timeout(ms)


def login(page, email: str, password: str):
    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(600)
    if "/login" not in page.url:
        page.goto(f"{BASE}/login", wait_until="domcontentloaded")
        page.wait_for_timeout(400)
    page.locator('[data-testid="auth-email"], input[type="email"]').first.fill(email)
    page.locator('[data-testid="auth-password"], input[type="password"]').first.fill(password)
    page.locator('[data-testid="auth-submit"], button[type="submit"]').first.click()
    for _ in range(30):
        if "/login" not in page.url:
            break
        page.wait_for_timeout(400)


def logout(page):
    for sel in (
        '[data-testid="logout"]',
        'button:has-text("Log out")',
        'button:has-text("Logout")',
        'a:has-text("Sign out")',
    ):
        loc = page.locator(sel)
        if loc.count() and loc.first.is_visible():
            loc.first.click()
            page.wait_for_timeout(800)
            return
    page.context.clear_cookies()
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")


def safe_goto(page, path: str, wait_s: float = 1.5):
    page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60000)
    dwell(page, wait_s)


def force_light_theme(page):
    page.evaluate(
        """() => {
            try { localStorage.setItem('soc_theme', 'light'); } catch (e) {}
            const root = document.documentElement;
            root.setAttribute('data-theme', 'light');
            root.classList.add('light');
            root.classList.remove('dark');
            root.style.colorScheme = 'light';
        }"""
    )


def try_click(page, selectors, timeout_ms: int = 2000) -> bool:
    for sel in selectors:
        loc = page.locator(sel)
        try:
            if loc.count() and loc.first.is_visible():
                loc.first.click(timeout=timeout_ms)
                return True
        except Exception:
            continue
    return False


def open_first_incident(page) -> bool:
    safe_goto(page, "/incidents", 2.0)
    links = page.locator('a[href*="/incidents/"]')
    if links.count():
        href = links.first.get_attribute("href") or ""
        if href:
            if href.startswith("http"):
                page.goto(href, wait_until="domcontentloaded")
            else:
                safe_goto(page, href if href.startswith("/") else f"/{href}", 2.0)
            dwell(page, 2.0)
            return "/incidents/" in page.url
    rows = page.locator("table tbody tr, [data-testid*='incident']")
    if rows.count():
        rows.first.click()
        dwell(page, 2.5)
        return "/incidents/" in page.url
    return False


def maybe_load_sample(page):
    """Stage sample on upload page if controls exist (non-fatal)."""
    safe_goto(page, "/upload", 1.5)
    # Prefer sample template + load bundle
    sel = page.locator('[data-testid="sample-template-select"], #sample-template')
    if sel.count():
        try:
            sel.first.select_option(index=1)
            dwell(page, 0.8)
        except Exception:
            pass
    try_click(
        page,
        [
            '[data-testid="load-sample-bundle-header"]',
            'button:has-text("Stage sample")',
            'button:has-text("Load sample")',
            'button:has-text("sample")',
        ],
    )
    dwell(page, 1.5)
    try_click(
        page,
        [
            '[data-testid="upload-submit"]',
            'button:has-text("Start")',
            'button:has-text("Upload")',
            'button:has-text("Ingest")',
            'button:has-text("Analyze")',
        ],
    )
    dwell(page, 3.0)


def _resolve_ffmpeg() -> str | None:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def convert_webm_to_mp4(webm: Path) -> Path | None:
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        print("  ffmpeg not available — leaving .webm only (pip install imageio-ffmpeg to convert)")
        return None
    mp4 = webm.with_suffix(".mp4")
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(webm),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-an",
        str(mp4),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        print(f"  wrote {mp4.name} ({mp4.stat().st_size // 1024} KB)")
        return mp4
    except Exception as e:
        print(f"  ffmpeg convert failed: {e}")
        return None


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Clean previous recording dir fragments
    for old in OUT_DIR.glob("*.webm"):
        if old.name.startswith("page-") or "tmp" in old.name.lower():
            try:
                old.unlink()
            except OSError:
                pass

    print(f"Recording demo from {BASE} → {OUT_DIR}")
    t0 = time.monotonic()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1600, "height": 900},
            device_scale_factor=1.0,
            color_scheme="light",
            record_video_dir=str(OUT_DIR),
            record_video_size={"width": 1600, "height": 900},
        )
        context.add_init_script(
            """() => { try { localStorage.setItem('soc_theme', 'light'); } catch (e) {} }"""
        )
        page = context.new_page()
        page.set_default_timeout(25000)

        # --- 0:00 Frame the product / login ---
        safe_goto(page, "/login", 1.0)
        force_light_theme(page)
        dwell(page, 8.0, "login honesty + problem frame")

        # Prefer analyst demo card if present, else form login
        if not try_click(page, ['[data-testid="demo-analyst"]', 'button:has-text("Analyst")']):
            login(page, ANALYST["email"], ANALYST["password"])
        else:
            dwell(page, 2.0)
        force_light_theme(page)
        dwell(page, 4.0, "post-login dashboard")

        # --- Ingest sample ---
        maybe_load_sample(page)
        dwell(page, 6.0, "ingest / sample staged")

        # --- Incidents + workspace ---
        if open_first_incident(page):
            dwell(page, 10.0, "incident workspace overview")
            for tab in ("Playbook", "Playbooks", "Evidence", "MITRE", "Timeline"):
                if try_click(
                    page,
                    [
                        f'[role="tab"]:has-text("{tab}")',
                        f'button:has-text("{tab}")',
                        f'a:has-text("{tab}")',
                    ],
                ):
                    dwell(page, 5.0, f"workspace tab {tab}")
        else:
            safe_goto(page, "/incidents", 2.0)
            dwell(page, 8.0, "incidents list (no case open)")

        # --- HiTL reviewer ---
        logout(page)
        dwell(page, 2.0, "logout")
        if not try_click(page, ['[data-testid="demo-reviewer"]', 'button:has-text("Reviewer")']):
            login(page, REVIEWER["email"], REVIEWER["password"])
        else:
            dwell(page, 2.0)
        force_light_theme(page)
        safe_goto(page, "/review", 2.0)
        dwell(page, 12.0, "review queue HiTL")
        try_click(
            page,
            [
                'button:has-text("Approve")',
                'button:has-text("Open")',
                "table tbody tr",
            ],
        )
        dwell(page, 6.0, "review action dwell")

        # --- Trust surfaces (admin) ---
        logout(page)
        if not try_click(page, ['[data-testid="demo-admin"]', 'button:has-text("Admin")']):
            login(page, ADMIN["email"], ADMIN["password"])
        else:
            dwell(page, 2.0)
        force_light_theme(page)

        safe_goto(page, "/hunt", 2.0)
        dwell(page, 4.0, "hunt honesty banner")
        q = page.locator('[data-testid="hunt-query"], input[placeholder*="PowerShell"], input[type="search"], form input').first
        try:
            if q.is_visible():
                q.fill("PowerShell lateral movement")
                dwell(page, 1.0)
                try_click(page, ['[data-testid="hunt-submit"]', 'button:has-text("Hunt")', 'button[type="submit"]'])
                dwell(page, 8.0, "hunt results + pool honesty")
        except Exception:
            dwell(page, 6.0, "hunt page static")

        safe_goto(page, "/compliance", 2.0)
        dwell(page, 12.0, "compliance disclaimer + provenance")

        safe_goto(page, "/audit", 2.0)
        dwell(page, 8.0, "audit trail paging honesty")

        safe_goto(page, "/knowledge", 2.0)
        dwell(page, 8.0, "KB hash-embedder banner")

        safe_goto(page, "/analytics", 2.5)
        dwell(page, 10.0, "analytics + cache footer")

        # --- Close on dashboard ---
        safe_goto(page, "/", 2.0)
        dwell(page, 10.0, "close / pilot-ready dashboard")

        elapsed = time.monotonic() - t0
        # Pad to approach TARGET_SECONDS if under-run (still useful for VO timing)
        remaining = TARGET_SECONDS - elapsed
        if remaining > 3:
            dwell(page, min(remaining, 45.0), f"pad to ~{TARGET_SECONDS}s")

        video_path = Path(page.video.path()) if page.video else None
        context.close()
        browser.close()

    elapsed = time.monotonic() - t0
    print(f"Recording wall time: {elapsed:.1f}s")

    if not video_path or not video_path.exists():
        # Playwright names video after close; search newest webm
        webms = sorted(OUT_DIR.glob("*.webm"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not webms:
            print("ERROR: no webm produced", file=sys.stderr)
            return 1
        video_path = webms[0]

    final_webm = OUT_DIR / "ACTIRA_Capstone_Demo_5min.webm"
    if video_path.resolve() != final_webm.resolve():
        if final_webm.exists():
            final_webm.unlink()
        video_path.replace(final_webm)
    print(f"  wrote {final_webm.name} ({final_webm.stat().st_size // 1024} KB)")

    convert_webm_to_mp4(final_webm)

    # Write duration sidecar for pack checklist
    meta = OUT_DIR / "ACTIRA_Capstone_Demo_5min.txt"
    meta.write_text(
        f"ACTIRA capstone demo video (UI walkthrough)\n"
        f"recorded: wall_clock≈{elapsed:.1f}s target={TARGET_SECONDS}s\n"
        f"file: {final_webm.name}\n"
        f"voiceover: docs/capstone/DEMO_VIDEO_5MIN.md\n"
        f"stack: frontend {BASE} + backend health required\n"
        f"honesty: docs/product/PRODUCT_HONESTY.md\n",
        encoding="utf-8",
    )
    print(f"Done. Narrate with DEMO_VIDEO_5MIN.md ({elapsed:.0f}s UI track).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
