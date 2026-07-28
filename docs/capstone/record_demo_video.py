"""
Record ACTIRA Final Capstone demo video with:
  - viewport 1920x1200, light theme, visible mouse cursor
  - **scene-synced** soft Indian-English voiceover (edge-tts)
  - each VO segment starts when that UI scene appears on screen

Requires: backend :8001, frontend :3000, playwright chromium, demo users.

  python docs/capstone/record_demo_video.py
  python docs/capstone/record_demo_video.py --no-voice

Outputs under docs/capstone/assets/video/:
  ACTIRA_Capstone_Demo_5min.webm
  ACTIRA_Capstone_Demo_5min.mp4   (with synced voiceover)
  ACTIRA_Capstone_Demo_5min_scenes.txt
  ACTIRA_Capstone_Demo_5min_timeline.json
  _vo_seg_*.mp3  (per-scene clips)
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from _capture_theme import (  # noqa: E402
    apply_light_context,
    click_with_mouse,
    force_light_theme,
    inject_demo_cursor,
    mouse_to,
    mouse_to_locator,
)

OUT_DIR = ROOT / "assets" / "video"
BASE = "http://localhost:3000"
ADMIN = {"email": "admin@soc.example.com", "password": "Admin123!", "label": "admin"}
REVIEWER = {"email": "reviewer@soc.example.com", "password": "Reviewer123!", "label": "reviewer"}
ANALYST = {"email": "analyst@soc.example.com", "password": "Analyst123!", "label": "analyst"}

VIEWPORT = {"width": 1920, "height": 1200}
DEVICE_SCALE = 1.00
# Soft Indian English TTS
TTS_RATE = "-6%"
TTS_VOLUME = "-20%"
TTS_PITCH = "-2Hz"
# Extra hold after speech so viewers can absorb the UI before the next jump
POST_SPEECH_HOLD = 1.2
# Brief hold at start of scene before speech conceptually "begins" (mouse settle)
PRE_SPEECH_HOLD = 0.4

INDIAN_VOICES = (
    "en-IN-NeerjaNeural",
    "en-IN-PrabhatNeural",
    "en-IN-NeerjaExpressiveNeural",
)

# Ordered scenes: id must match marks in record_ui. Each VO line describes ONLY that on-screen moment.
# Dwell = VO duration + POST_SPEECH_HOLD so speech and UI stay locked (~5.5–6.5 min total).
SCENE_SCRIPT: list[tuple[str, str]] = [
    (
        "login",
        "Welcome to the Final Capstone Project demonstration of ACTIRA — Agentic Cybersecurity "
        "Threat Intelligence and Incident Response Advisor. On screen: the login shell with an honest "
        "platform health probe and capability tiles — not fabricated tenant K P Is before sign-in. "
        "ACTIRA is a human-gated A I advisor for single-tenant pilots, not a S I E M replacement.",
    ),
    (
        "auth",
        "We authenticate as an analyst with real credentials. Demo chips only auto-fill the form; "
        "Sign in submits authentication and opens a role-based session.",
    ),
    (
        "dashboard",
        "Dashboard: live K P Is, severity mix, incident volume, and an ATT and CK technique heatmap "
        "from Mongo-backed analytics with a short-lived cache. Empty tenants show zeros, not demo filler.",
    ),
    (
        "upload",
        "Upload and ingest. Multi-format logs and ZIP bundles enter an asynchronous job queue. "
        "Parse, IoC extract, threat-intel enrich, ATT and CK map, hybrid R A G, and playbook generation "
        "run as pipeline stages — a job system, not a chat window.",
    ),
    (
        "incidents",
        "Incidents list: the case inventory with severity filters and deep links into the investigation "
        "workspace. Each row is a first-class incident document.",
    ),
    (
        "workspace",
        "Investigation workspace on a live case. Overview shows severity, indicators, and techniques. "
        "Tabs include Evidence, Timeline, MITRE, Graph, and Playbooks with shareable U R L tab state.",
    ),
    (
        "playbook",
        "Playbook tab: hybrid-R A G guidance with containment, eradication, recovery, and lessons phases. "
        "Citation chips stay on the knowledge-base allow-list. A grounding score measures source attachment. "
        "Low grounding or critical severity forces pending review.",
    ),
    (
        "review",
        "Now as senior reviewer — the human-in-the-loop queue. Approve, reject, or edit. Claim and decide "
        "are race-safe. Decisions write audit events into a best-effort hash chain — integrity hashing, "
        "not WORM storage.",
    ),
    (
        "hunt",
        "Threat Hunt: natural-language case hunt over about five hundred recent incidents — not a full "
        "S I E M log lake. Honesty banners state those limits on this screen.",
    ),
    (
        "compliance",
        "Compliance: product control-alignment score with assumed versus live-verified evidence. "
        "This is pilot readiness narrative — not I S O or S O C 2 certification.",
    ),
    (
        "audit",
        "Audit trail is server-paged for large tenants, with inspect actions for event detail and "
        "integrity summaries for executive export.",
    ),
    (
        "knowledge",
        "Knowledge base defaults to hash embeddings for offline demos. The banner discloses the active "
        "embedder so demos never over-claim vector quality.",
    ),
    (
        "analytics",
        "Analytics uses a short-lived cache footer — not a live S I E M stream — and supports "
        "drill-through into cases.",
    ),
    (
        "settings",
        "Settings: multi-provider L L M catalog — free and paid models, vaulted secrets never returned "
        "raw, cross-provider fallback, and template playbooks for offline golden evaluation.",
    ),
    (
        "architecture",
        "Architecture posters: modular monolith with React edge, Fast A P I dual mounts, Mongo D B for "
        "cases and audit, Lance D B for hybrid retrieval. Data flow runs upload through parse, IoC, "
        "threat intel, ATT and CK, hybrid R A G, playbook, human gate, workspace, and audit. "
        "Component, R A G, and human-in-the-loop policy diagrams complete the set.",
    ),
    (
        "close",
        "ACTIRA closes the Final Capstone Project with citation-grounded playbooks, mandatory human gates, "
        "golden offline evaluation on thirty-seven cases — IoC F1 about zero point nine eight, technique "
        "recall about zero point nine three — sixty-six automated tests passed, and enterprise pilot "
        "readiness at seventy-eight of one hundred. Thank you for reviewing ACTIRA.",
    ),
]


def log(msg: str) -> None:
    print(f"  {msg}", flush=True)


def dwell(page, seconds: float, label: str = ""):
    ms = max(0, int(seconds * 1000))
    if label:
        log(f"… {label} ({seconds:.1f}s) @ {page.url}")
    try:
        vp = page.viewport_size or VIEWPORT
        cx, cy = vp["width"] * 0.45, vp["height"] * 0.4
        inject_demo_cursor(page)
        page.mouse.move(cx, cy, steps=8)
        page.wait_for_timeout(ms // 2 if ms > 400 else ms)
        if ms > 400:
            page.mouse.move(cx + 40, cy + 25, steps=12)
            page.wait_for_timeout(ms - ms // 2)
    except Exception:
        page.wait_for_timeout(ms)


def is_login_url(page) -> bool:
    return "/login" in (page.url or "")


def wait_left_login(page, timeout_s: float = 15.0) -> bool:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if not is_login_url(page):
            return True
        page.wait_for_timeout(250)
    return not is_login_url(page)


def login(page, email: str, password: str, *, label: str = "user") -> None:
    """Fill credentials and submit Sign in (demo chips only autofill — never auth)."""
    page.goto(f"{BASE}/login", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(400)
    force_light_theme(page)
    inject_demo_cursor(page)

    email_sel = page.locator('[data-testid="auth-email"], input[type="email"]').first
    pass_sel = page.locator('[data-testid="auth-password"], input[type="password"]').first
    submit = page.locator('[data-testid="auth-submit"], button[type="submit"]').first

    email_sel.wait_for(state="visible", timeout=15000)
    email_sel.click()
    email_sel.fill("")
    email_sel.fill(email)
    page.wait_for_timeout(80)
    pass_sel.click()
    pass_sel.fill("")
    pass_sel.fill(password)
    page.wait_for_timeout(80)

    try:
        mouse_to_locator(page, submit, steps=12)
    except Exception:
        pass
    submitted = False
    try:
        submit.click(timeout=5000)
        submitted = True
        log(f"submit.click ({label})")
    except Exception as e:
        log(f"submit.click failed ({label}): {e}")
    if not submitted:
        if not click_with_mouse(page, submit):
            pass_sel.press("Enter")
            log(f"submit via Enter ({label})")

    if not wait_left_login(page, 12.0):
        log(f"login still on /login for {label} — retry")
        try:
            email_sel.fill(email)
            pass_sel.fill(password)
            submit.click(timeout=4000)
        except Exception:
            try:
                pass_sel.press("Enter")
            except Exception:
                pass
        if not wait_left_login(page, 10.0):
            try:
                page.evaluate(
                    """([em, pw]) => {
                      const e = document.querySelector('[data-testid="auth-email"]');
                      const p = document.querySelector('[data-testid="auth-password"]');
                      const b = document.querySelector('[data-testid="auth-submit"]');
                      if (e) { e.value = em; e.dispatchEvent(new Event('input', {bubbles:true})); }
                      if (p) { p.value = pw; p.dispatchEvent(new Event('input', {bubbles:true})); }
                      if (b) b.click();
                    }""",
                    [email, password],
                )
            except Exception:
                pass
            if not wait_left_login(page, 8.0):
                raise RuntimeError(f"Login failed for {label} ({email}); still on {page.url}")

    try:
        page.wait_for_function(
            "() => !location.pathname.includes('/login')",
            timeout=8000,
        )
    except Exception:
        if is_login_url(page):
            raise RuntimeError(f"Login URL still /login after wait for {label}")

    force_light_theme(page)
    inject_demo_cursor(page)
    log(f"logged in as {label} → {page.url}")


def logout(page):
    for sel in (
        '[data-testid="logout"]',
        'button:has-text("Log out")',
        'button:has-text("Logout")',
        'a:has-text("Sign out")',
        'button:has-text("Sign out")',
    ):
        loc = page.locator(sel)
        try:
            if loc.count() and loc.first.is_visible():
                click_with_mouse(page, loc)
                page.wait_for_timeout(1000)
                if not is_login_url(page):
                    page.context.clear_cookies()
                    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
                    page.wait_for_timeout(600)
                force_light_theme(page)
                inject_demo_cursor(page)
                log(f"logged out → {page.url}")
                return
        except Exception:
            continue
    page.context.clear_cookies()
    page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    page.wait_for_timeout(600)
    force_light_theme(page)
    inject_demo_cursor(page)
    log(f"logged out (cookie clear) → {page.url}")


def safe_goto(page, path: str, wait_s: float = 1.5, *, require_auth: bool = True) -> str:
    page.goto(f"{BASE}{path}", wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(int(wait_s * 1000))
    force_light_theme(page)
    inject_demo_cursor(page)
    url = page.url or ""
    if require_auth and path not in ("/login",) and is_login_url(page):
        raise RuntimeError(f"Auth required: navigated to {path} but landed on {url}")
    log(f"goto {path} → {url}")
    return url


def try_click(page, selectors, timeout_ms: int = 2500) -> bool:
    for sel in selectors:
        loc = page.locator(sel)
        try:
            if loc.count() and loc.first.is_visible():
                return click_with_mouse(page, loc)
        except Exception:
            continue
    return False


def open_first_incident(page) -> bool:
    safe_goto(page, "/incidents", 1.5)
    inject_demo_cursor(page)
    links = page.locator('a[href*="/incidents/"]')
    if links.count():
        mouse_to_locator(page, links.first)
        href = links.first.get_attribute("href") or ""
        if href:
            if href.startswith("http"):
                page.goto(href, wait_until="domcontentloaded")
            else:
                safe_goto(page, href if href.startswith("/") else f"/{href}", 1.5)
            page.wait_for_timeout(800)
            force_light_theme(page)
            inject_demo_cursor(page)
            ok = "/incidents/" in page.url
            log(f"open incident → {page.url} ok={ok}")
            return ok
    rows = page.locator("table tbody tr, [data-testid*='incident']")
    if rows.count():
        click_with_mouse(page, rows.first)
        page.wait_for_timeout(1200)
        ok = "/incidents/" in page.url
        log(f"open incident row → {page.url} ok={ok}")
        return ok
    log("no incidents found to open")
    return False


def maybe_load_sample(page):
    safe_goto(page, "/upload", 1.2)
    inject_demo_cursor(page)
    sel = page.locator('[data-testid="sample-template-select"], #sample-template')
    if sel.count():
        try:
            mouse_to_locator(page, sel)
            sel.first.select_option(index=1)
            page.wait_for_timeout(500)
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
    page.wait_for_timeout(800)
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
    page.wait_for_timeout(1200)


def show_architecture_poster(page, name: str, seconds: float = 8.0):
    fig = ROOT / "assets" / "figures" / name
    if not fig.exists():
        log(f"missing architecture figure {name}")
        return
    svg = fig.read_text(encoding="utf-8")
    page.set_content(
        f"""<!doctype html><html><head><meta charset="utf-8">
        <style>html,body{{margin:0;background:#F8FAFC;min-height:100vh;
        display:flex;align-items:center;justify-content:center;padding:24px}}</style>
        </head><body>{svg}</body></html>""",
        wait_until="domcontentloaded",
    )
    page.wait_for_timeout(400)
    inject_demo_cursor(page)
    mouse_to(page, 420, 220, steps=18)
    page.wait_for_timeout(300)
    mouse_to(page, 980, 400, steps=22)
    dwell(page, seconds, f"architecture {name}")


def _resolve_ffmpeg() -> str | None:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return None


def probe_media_duration(path: Path) -> float | None:
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg or not path.exists():
        return None
    try:
        r = subprocess.run([ffmpeg, "-i", str(path)], capture_output=True, text=True, errors="replace")
        m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", r.stderr or "")
        if not m:
            return None
        h, mi, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
        return h * 3600 + mi * 60 + s
    except Exception:
        return None


def synthesize_segment(text: str, out_mp3: Path, voice: str = INDIAN_VOICES[0]) -> Path | None:
    """Synthesize one soft VO segment via edge-tts."""
    out_mp3.parent.mkdir(parents=True, exist_ok=True)
    try:
        import asyncio

        import edge_tts

        async def _run():
            communicate = edge_tts.Communicate(
                text,
                voice=voice,
                rate=TTS_RATE,
                volume=TTS_VOLUME,
                pitch=TTS_PITCH,
            )
            await communicate.save(str(out_mp3))

        asyncio.run(_run())
        if out_mp3.exists() and out_mp3.stat().st_size > 500:
            return out_mp3
    except Exception as e:
        log(f"edge-tts segment failed: {e}")
    return None


def synthesize_all_segments() -> dict[str, dict]:
    """
    Pre-render every scene VO clip.
    Returns {scene_id: {path, duration, text}}
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    segs: dict[str, dict] = {}
    voice = INDIAN_VOICES[0]
    # pick first working voice
    for v in INDIAN_VOICES:
        test = OUT_DIR / "_vo_probe.mp3"
        if synthesize_segment("Probe.", test, voice=v):
            voice = v
            try:
                test.unlink()
            except OSError:
                pass
            break

    print(f"Synthesizing {len(SCENE_SCRIPT)} scene-synced VO clips (voice={voice}, soft)…")
    for sid, text in SCENE_SCRIPT:
        path = OUT_DIR / f"_vo_seg_{sid}.mp3"
        ok = synthesize_segment(text, path, voice=voice)
        if not ok:
            # SAPI fallback per segment
            ok = synthesize_segment_sapi(text, path.with_suffix(".wav"))
            path = path.with_suffix(".wav") if ok else path
        dur = probe_media_duration(path) if path.exists() else None
        if not dur or dur < 0.5:
            # estimate ~13 chars/sec soft speech
            dur = max(4.0, len(text) / 13.0)
            log(f"WARN {sid}: duration estimate {dur:.1f}s (probe failed)")
        segs[sid] = {"path": str(path), "duration": float(dur), "text": text}
        log(f"VO {sid}: {dur:.1f}s → {path.name}")
    return segs


def synthesize_segment_sapi(text: str, out_wav: Path) -> Path | None:
    ps = out_wav.with_suffix(".ps1")
    safe = text.replace("'", "''")
    out_ps = str(out_wav).replace("'", "''")
    ps.write_text(
        f"""
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -2
$synth.Volume = 78
$picked = $null
foreach ($v in $synth.GetInstalledVoices()) {{
  $info = $v.VoiceInfo
  if ($info.Culture.Name -eq 'en-IN' -or $info.Name -match 'Indian|Ravi|Heera|Priya') {{
    $picked = $info.Name; break
  }}
}}
if ($picked) {{ $synth.SelectVoice($picked) }}
$synth.SetOutputToWaveFile('{out_ps}')
$synth.Speak('{safe}')
$synth.Dispose()
""",
        encoding="utf-8",
    )
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps)],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode == 0 and out_wav.exists() and out_wav.stat().st_size > 500:
            return out_wav
    except Exception as e:
        log(f"SAPI segment error: {e}")
    finally:
        try:
            ps.unlink()
        except OSError:
            pass
    return None


def scene_hold(page, segs: dict[str, dict], scene_id: str, *, extra: float = 0.0) -> float:
    """Hold on current UI for VO duration + post-speech buffer (A/V lock)."""
    vo = segs.get(scene_id, {})
    hold = float(vo.get("duration", 8.0)) + POST_SPEECH_HOLD + extra
    dwell(page, hold, f"scene:{scene_id}")
    return hold


def build_synced_audio(
    timeline: list[dict],
    segs: dict[str, dict],
    video_seconds: float,
    out_wav: Path,
) -> Path | None:
    """
    Place each scene VO at its recorded start time via adelay + amix.
    timeline items: {id, t0, url}
    """
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        return None

    # Build list of (path, delay_ms) for scenes that have audio
    clips: list[tuple[Path, int, str]] = []
    for item in timeline:
        sid = item["id"]
        if sid not in segs:
            continue
        p = Path(segs[sid]["path"])
        if not p.exists():
            continue
        delay_ms = max(0, int(round(float(item["t0"]) * 1000)))
        clips.append((p, delay_ms, sid))

    if not clips:
        log("no VO clips for timeline mux")
        return None

    # ffmpeg: n inputs + amix
    # [i:a]adelay=DELAY|DELAY,volume=0.95[a{i}]; amix
    cmd = [ffmpeg, "-y"]
    for p, _, _ in clips:
        cmd += ["-i", str(p)]

    filters = []
    mix_in = []
    for i, (_, delay_ms, sid) in enumerate(clips):
        # adelay needs both channels for stereo; we force mono later
        filters.append(
            f"[{i}:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=mono,"
            f"adelay={delay_ms}|{delay_ms},volume=0.90[a{i}]"
        )
        mix_in.append(f"[a{i}]")
        log(f"place VO {sid} @ {delay_ms/1000:.1f}s")

    n = len(clips)
    filters.append(
        f"{''.join(mix_in)}amix=inputs={n}:duration=longest:dropout_transition=0:normalize=0[mix]"
    )
    # Pad/trim to exact video length
    filters.append(f"[mix]apad=whole_dur={video_seconds:.3f},atrim=0:{video_seconds:.3f},volume=0.95[out]")

    cmd += [
        "-filter_complex",
        ";".join(filters),
        "-map",
        "[out]",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "44100",
        "-ac",
        "1",
        str(out_wav),
    ]
    try:
        r = subprocess.run(cmd, check=False, capture_output=True, text=True, errors="replace")
        if r.returncode != 0 or not out_wav.exists():
            log(f"synced audio failed: {(r.stderr or '')[-400:]}")
            return None
        print(f"  synced VO wav: {out_wav.name} ({out_wav.stat().st_size // 1024} KB)")
        return out_wav
    except Exception as e:
        log(f"synced audio error: {e}")
        return None


def convert_webm_to_mp4(webm: Path, audio: Path | None = None) -> Path | None:
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        print("  ffmpeg not available — leaving .webm only")
        return None
    mp4 = webm.with_suffix(".mp4")
    vdur = probe_media_duration(webm)
    if audio and audio.exists():
        cmd = [
            ffmpeg,
            "-y",
            "-i",
            str(webm),
            "-i",
            str(audio),
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "44100",
            "-ac",
            "1",
            "-t",
            f"{vdur:.3f}" if vdur else "600",
            "-movflags",
            "+faststart",
            str(mp4),
        ]
    else:
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
        r = subprocess.run(cmd, check=False, capture_output=True, text=True, errors="replace")
        if r.returncode != 0:
            if audio and audio.exists():
                cmd2 = [
                    ffmpeg, "-y", "-i", str(webm), "-i", str(audio),
                    "-c:v", "libx264", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k",
                    "-shortest", "-movflags", "+faststart", str(mp4),
                ]
                subprocess.run(cmd2, check=True, capture_output=True)
            else:
                raise RuntimeError((r.stderr or "")[-300:])
        print(f"  wrote {mp4.name} ({mp4.stat().st_size // 1024} KB)" + (" +synced-voice" if audio else ""))
        return mp4
    except Exception as e:
        print(f"  ffmpeg convert failed: {e}")
        return None


def concat_vo_for_standalone(segs: dict[str, dict], out_mp3: Path) -> Path | None:
    """Concatenate scene clips (order of SCENE_SCRIPT) for standalone MP3 deliverable."""
    ffmpeg = _resolve_ffmpeg()
    if not ffmpeg:
        return None
    list_file = OUT_DIR / "_vo_concat.txt"
    lines = []
    for sid, _ in SCENE_SCRIPT:
        p = Path(segs[sid]["path"]) if sid in segs else None
        if p and p.exists():
            # ffmpeg concat demuxer needs escaped paths
            lines.append(f"file '{p.resolve().as_posix()}'")
    if not lines:
        return None
    list_file.write_text("\n".join(lines) + "\n", encoding="utf-8")
    cmd = [
        ffmpeg, "-y", "-f", "concat", "-safe", "0",
        "-i", str(list_file),
        "-c:a", "libmp3lame", "-b:a", "96k",
        str(out_mp3),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True)
        return out_mp3 if out_mp3.exists() else None
    except Exception as e:
        log(f"concat VO failed: {e}")
        return None


def record_ui(segs: dict[str, dict]) -> tuple[Path, float, list[dict]]:
    """
    Record product tour. Returns (webm, wall_elapsed, timeline).
    timeline: [{id, t0, url}, ...] — t0 is seconds from recording start.
    """
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.webm"):
        if old.name.startswith("page-") or "tmp" in old.name.lower():
            try:
                old.unlink()
            except OSError:
                pass

    print(f"Recording scene-synced demo from {BASE} → {OUT_DIR}")
    print(f"  viewport={VIEWPORT} dpr={DEVICE_SCALE} light + cursor + A/V lock")
    wall0 = time.monotonic()
    scenes_log: list[str] = []
    timeline: list[dict] = []
    rec_t0: float | None = None  # set after first paint (approx video clock)

    def mark(scene_id: str, page) -> None:
        nonlocal rec_t0
        now = time.monotonic()
        if rec_t0 is None:
            rec_t0 = now
        t0 = max(0.0, now - rec_t0)
        # Small PRE_SPEECH hold so speech starts just after UI is stable
        entry = {
            "id": scene_id,
            "t0": round(t0 + PRE_SPEECH_HOLD, 3),
            "url": page.url if page else "",
            "vo_duration": round(float(segs.get(scene_id, {}).get("duration", 0)), 2),
        }
        timeline.append(entry)
        scenes_log.append(f"{scene_id}:{entry['url']}")
        log(f"MARK {scene_id} @ {entry['t0']:.1f}s vo={entry['vo_duration']:.1f}s")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=VIEWPORT,
            device_scale_factor=DEVICE_SCALE,
            color_scheme="light",
            reduced_motion="reduce",
            record_video_dir=str(OUT_DIR),
            record_video_size=VIEWPORT,
        )
        apply_light_context(context)
        page = context.new_page()
        # Playwright video clock starts when the page is created — lock VO to that origin.
        rec_t0 = time.monotonic()
        page.set_default_timeout(25000)
        try:
            page.emulate_media(color_scheme="light", reduced_motion="reduce")
        except Exception:
            page.emulate_media(color_scheme="light")

        # ── LOGIN ──
        safe_goto(page, "/login", 1.0, require_auth=False)
        force_light_theme(page)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(500)
        force_light_theme(page)
        inject_demo_cursor(page)
        for sel in (
            '[data-testid="login-status-honesty"]',
            '[data-testid="demo-operators"]',
            '[data-testid="auth-email"]',
        ):
            loc = page.locator(sel)
            if loc.count():
                mouse_to_locator(page, loc, steps=14)
                page.wait_for_timeout(200)
        mark("login", page)
        try:
            page.screenshot(path=str(OUT_DIR / "_chk_00_login.png"), full_page=False)
        except Exception:
            pass
        scene_hold(page, segs, "login")

        # ── AUTH (fill + submit while VO plays) ──
        mark("auth", page)
        # Perform login without re-goto if already on login
        email_sel = page.locator('[data-testid="auth-email"], input[type="email"]').first
        pass_sel = page.locator('[data-testid="auth-password"], input[type="password"]').first
        submit = page.locator('[data-testid="auth-submit"], button[type="submit"]').first
        email_sel.fill(ANALYST["email"])
        pass_sel.fill(ANALYST["password"])
        page.wait_for_timeout(200)
        try:
            mouse_to_locator(page, submit, steps=10)
        except Exception:
            pass
        try:
            submit.click(timeout=5000)
        except Exception:
            pass_sel.press("Enter")
        if not wait_left_login(page, 12.0):
            login(page, ANALYST["email"], ANALYST["password"], label=ANALYST["label"])
        # Hold remaining auth VO time after login completes
        auth_dur = float(segs.get("auth", {}).get("duration", 6.0))
        elapsed_auth = time.monotonic() - (rec_t0 + timeline[-1]["t0"] - PRE_SPEECH_HOLD)
        remain = auth_dur + POST_SPEECH_HOLD - elapsed_auth
        if remain > 0.5:
            dwell(page, remain, "auth hold")
        if is_login_url(page):
            raise RuntimeError("still on login after analyst login")
        scenes_log.append(f"analyst_in:{page.url}")

        # ── DASHBOARD ──
        safe_goto(page, "/", 1.5)
        if is_login_url(page):
            raise RuntimeError("dashboard bounce to login")
        mark("dashboard", page)
        try:
            page.screenshot(path=str(OUT_DIR / "_chk_01_dashboard.png"), full_page=False)
        except Exception:
            pass
        scene_hold(page, segs, "dashboard")

        # ── UPLOAD ──
        maybe_load_sample(page)
        mark("upload", page)
        scene_hold(page, segs, "upload")

        # ── INCIDENTS + WORKSPACE + PLAYBOOK ──
        safe_goto(page, "/incidents", 1.5)
        mark("incidents", page)
        scene_hold(page, segs, "incidents", extra=-1.0)  # slightly shorter if long

        if open_first_incident(page):
            mark("workspace", page)
            scene_hold(page, segs, "workspace")
            # open playbook tab mid-hold is better before playbook mark
            for tab in ("Playbook", "Playbooks"):
                loc = page.locator(
                    f'[role="tab"]:has-text("{tab}"), button:has-text("{tab}"), a:has-text("{tab}")'
                )
                if loc.count() and loc.first.is_visible():
                    click_with_mouse(page, loc)
                    page.wait_for_timeout(800)
                    break
            mark("playbook", page)
            # peek other tabs briefly while still on workspace context after playbook VO
            scene_hold(page, segs, "playbook")
            for tab in ("Evidence", "MITRE", "Timeline"):
                loc = page.locator(
                    f'[role="tab"]:has-text("{tab}"), button:has-text("{tab}"), a:has-text("{tab}")'
                )
                if loc.count() and loc.first.is_visible():
                    click_with_mouse(page, loc)
                    dwell(page, 2.0, f"tab {tab}")
                    scenes_log.append(f"tab_{tab}:{page.url}")
        else:
            mark("workspace", page)
            scene_hold(page, segs, "workspace")
            mark("playbook", page)
            scene_hold(page, segs, "playbook")

        # ── REVIEWER / HITL ──
        logout(page)
        page.wait_for_timeout(400)
        login(page, REVIEWER["email"], REVIEWER["password"], label=REVIEWER["label"])
        scenes_log.append(f"reviewer_in:{page.url}")
        safe_goto(page, "/review", 1.5)
        mark("review", page)
        try_click(page, ['button:has-text("Open")', "table tbody tr", 'button:has-text("Approve")'])
        scene_hold(page, segs, "review")

        # ── ADMIN SURFACES ──
        logout(page)
        login(page, ADMIN["email"], ADMIN["password"], label=ADMIN["label"])
        scenes_log.append(f"admin_in:{page.url}")

        safe_goto(page, "/hunt", 1.5)
        mark("hunt", page)
        q = page.locator(
            '[data-testid="hunt-query"], input[placeholder*="PowerShell"], input[type="search"], form input'
        ).first
        try:
            if q.is_visible():
                mouse_to_locator(page, q)
                q.click()
                q.fill("PowerShell lateral movement")
                page.wait_for_timeout(400)
                try_click(page, ['[data-testid="hunt-submit"]', 'button:has-text("Hunt")', 'button[type="submit"]'])
        except Exception:
            pass
        scene_hold(page, segs, "hunt")

        safe_goto(page, "/compliance", 1.5)
        for sel in (
            '[data-testid="compliance-disclaimer"]',
            '[data-testid="compliance-verification-summary"]',
        ):
            loc = page.locator(sel)
            if loc.count():
                mouse_to_locator(page, loc, steps=14)
                page.wait_for_timeout(300)
        mark("compliance", page)
        scene_hold(page, segs, "compliance")

        safe_goto(page, "/audit", 1.5)
        mark("audit", page)
        scene_hold(page, segs, "audit")

        safe_goto(page, "/knowledge", 1.5)
        loc = page.locator('[data-testid="kb-embedder-banner"]')
        if loc.count():
            mouse_to_locator(page, loc)
        mark("knowledge", page)
        scene_hold(page, segs, "knowledge")

        safe_goto(page, "/analytics", 1.5)
        loc = page.locator('[data-testid="analytics-cache-footer"]')
        if loc.count():
            try:
                loc.first.scroll_into_view_if_needed()
            except Exception:
                pass
            mouse_to_locator(page, loc)
        mark("analytics", page)
        scene_hold(page, segs, "analytics")

        safe_goto(page, "/settings", 1.5)
        for tab in ("LLM", "AI", "Models", "Providers"):
            loc = page.locator(
                f'button:has-text("{tab}"), [role="tab"]:has-text("{tab}"), a:has-text("{tab}")'
            )
            if loc.count():
                try:
                    click_with_mouse(page, loc)
                    break
                except Exception:
                    pass
        mark("settings", page)
        scene_hold(page, segs, "settings")

        # ── ARCHITECTURE POSTERS (one VO spans the set) ──
        mark("architecture", page)
        arch_vo = float(segs.get("architecture", {}).get("duration", 25.0))
        per = max(4.0, (arch_vo + POST_SPEECH_HOLD) / 5.0)
        for fig_name in (
            "12_architecture.svg",
            "data_flow.svg",
            "components.svg",
            "rag_pipeline.svg",
            "hitl_policy.svg",
        ):
            show_architecture_poster(page, fig_name, per)
            scenes_log.append(f"arch:{fig_name}")

        # ── CLOSE ──
        try:
            safe_goto(page, "/", 1.2)
        except Exception:
            login(page, ADMIN["email"], ADMIN["password"], label="admin_close")
            safe_goto(page, "/", 1.2)
        mark("close", page)
        scene_hold(page, segs, "close")

        video_path = Path(page.video.path()) if page.video else None
        context.close()
        browser.close()

    elapsed = time.monotonic() - wall0
    print(f"Recording wall time: {elapsed:.1f}s")
    print("Timeline:")
    for item in timeline:
        print(f"  - {item['id']:12s} @ {item['t0']:6.1f}s  vo={item['vo_duration']:.1f}s  {item['url'][:60]}")

    app_scenes = [s for s in scenes_log if any(k in s for k in (
        "dashboard", "upload", "workspace", "review", "hunt", "analyst_in",
        "compliance", "audit", "knowledge", "analytics", "settings",
    )) and "/login" not in s.split(":", 1)[-1]]
    if len(app_scenes) < 3:
        raise RuntimeError(
            "Video recording never left the login shell — check credentials / auth. "
            f"app_scenes={app_scenes}"
        )

    chk = OUT_DIR / "_chk_01_dashboard.png"
    if not chk.exists():
        raise RuntimeError("Missing post-login dashboard checkpoint screenshot")

    if not video_path or not video_path.exists():
        webms = sorted(
            [p for p in OUT_DIR.glob("*.webm") if not p.name.startswith("_")],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        if not webms:
            raise RuntimeError("no webm produced")
        video_path = webms[0]

    final_webm = OUT_DIR / "ACTIRA_Capstone_Demo_5min.webm"
    if video_path.resolve() != final_webm.resolve():
        if final_webm.exists():
            final_webm.unlink()
        video_path.replace(final_webm)
    print(f"  wrote {final_webm.name} ({final_webm.stat().st_size // 1024} KB)")

    trail = OUT_DIR / "ACTIRA_Capstone_Demo_5min_scenes.txt"
    trail.write_text("\n".join(scenes_log) + "\n", encoding="utf-8")

    tjson = OUT_DIR / "ACTIRA_Capstone_Demo_5min_timeline.json"
    tjson.write_text(json.dumps(timeline, indent=2), encoding="utf-8")
    print(f"  timeline: {len(timeline)} scenes → {tjson.name}")
    return final_webm, elapsed, timeline


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-voice", action="store_true", help="Skip TTS voiceover mux")
    parser.add_argument(
        "--voice-only",
        action="store_true",
        help="Rebuild synced audio from existing webm + timeline.json (no re-record)",
    )
    args = parser.parse_args()

    segs = synthesize_all_segments() if not args.no_voice else {}
    timeline: list[dict] = []

    if args.voice_only:
        webm = OUT_DIR / "ACTIRA_Capstone_Demo_5min.webm"
        tjson = OUT_DIR / "ACTIRA_Capstone_Demo_5min_timeline.json"
        if not webm.exists():
            print(f"ERROR: missing {webm}", file=sys.stderr)
            return 1
        if not tjson.exists():
            print(
                "ERROR: --voice-only needs ACTIRA_Capstone_Demo_5min_timeline.json "
                "(from a scene-synced recording). Re-run without --voice-only.",
                file=sys.stderr,
            )
            return 1
        timeline = json.loads(tjson.read_text(encoding="utf-8"))
        elapsed = probe_media_duration(webm) or 300.0
        print(f"Voice-only remux using timeline ({len(timeline)} scenes), video≈{elapsed:.1f}s")
    else:
        try:
            webm, elapsed, timeline = record_ui(segs if segs else {s: {"duration": 8.0} for s, _ in SCENE_SCRIPT})
        except Exception as e:
            print(f"ERROR: record failed: {e}", file=sys.stderr)
            return 1

    video_secs = probe_media_duration(webm) or max(elapsed, 60.0)
    audio = None
    if not args.no_voice and segs and timeline:
        # Correct VO start times: Playwright video may start slightly before our rec_t0.
        # Scale timeline to video length if wall clock differs mildly.
        if timeline:
            last_end = max(
                item["t0"] + float(segs.get(item["id"], {}).get("duration", 0)) + POST_SPEECH_HOLD
                for item in timeline
            )
            if last_end > 10 and video_secs > 10:
                # If video is longer than our marks suggest, keep marks as-is (silence at end OK).
                # If marks run past video, scale down slightly.
                if last_end > video_secs + 2:
                    scale = video_secs / last_end
                    log(f"scale timeline by {scale:.3f} (marks {last_end:.1f}s > video {video_secs:.1f}s)")
                    for item in timeline:
                        item["t0"] = round(item["t0"] * scale, 3)

        padded = OUT_DIR / "ACTIRA_Capstone_Demo_5min_voice_pad.wav"
        audio = build_synced_audio(timeline, segs, video_secs, padded)
        standalone = OUT_DIR / "ACTIRA_Capstone_Demo_5min_voice.mp3"
        concat_vo_for_standalone(segs, standalone)

    convert_webm_to_mp4(webm, audio=audio)

    meta = OUT_DIR / "ACTIRA_Capstone_Demo_5min.txt"
    meta.write_text(
        f"ACTIRA Final Capstone demo video (scene-synced voice)\n"
        f"viewport: {VIEWPORT} dpr={DEVICE_SCALE} color_scheme=light\n"
        f"mouse: visible cursor overlay + movement\n"
        f"voiceover: {'scene-synced soft Indian English (edge-tts Neerja)' if audio else 'no'}\n"
        f"video_duration≈{video_secs:.1f}s wall_clock≈{elapsed:.1f}s\n"
        f"scenes: {len(timeline)} marked on timeline\n"
        f"files: ACTIRA_Capstone_Demo_5min.webm + .mp4\n"
        f"timeline: ACTIRA_Capstone_Demo_5min_timeline.json\n"
        f"script: docs/capstone/DEMO_VIDEO_5MIN.md\n"
        f"honesty: docs/product/PRODUCT_HONESTY.md\n"
        f"auth_note: demo-* buttons only autofill; recorder always fill+submit credentials\n"
        f"fix: login must leave /login; checkpoints _chk_00_login.png + _chk_01_dashboard.png\n",
        encoding="utf-8",
    )
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
