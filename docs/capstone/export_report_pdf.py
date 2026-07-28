"""
Export a readable, submission-quality ACTIRA capstone PDF.

  python docs/capstone/export_report_pdf.py

Output: docs/capstone/PROJECT_REPORT.pdf

Design goals:
- Clean title page, TOC, chapter starts
- Comfortable body typography and spacing (light enterprise)
- Real markdown tables (not monospaced pipes)
- Embedded light-theme screenshots + architecture figures
- Dedicated architecture-detail section (poster + control tables)
- One figure per page for clear reading
- Full detailed appendices A-F from appendices/*.md
"""
from __future__ import annotations

import re
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import XPos, YPos

try:
    from PIL import Image as PILImage
except ImportError:  # pragma: no cover
    PILImage = None

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "PROJECT_REPORT.md"
OUT = ROOT / "PROJECT_REPORT.pdf"
SHOTS = ROOT / "assets" / "screenshots"
FIGS = ROOT / "assets" / "figures"

# Light enterprise theme (matches UI + screenshot pack)
NAVY = (15, 23, 42)
BLUE = (37, 99, 235)
SLATE = (51, 65, 85)
MUTED = (100, 116, 139)
LIGHT = (248, 250, 252)
BORDER = (226, 232, 240)
WHITE = (255, 255, 255)
GREEN = (22, 163, 74)
SOFT_BLUE = (239, 246, 255)

# Page geometry (A4 mm) — generous margins for reading
MARGIN_L = 20
MARGIN_R = 20
MARGIN_T = 22
MARGIN_B = 18

# (filename, short caption, documentary narrative for evaluators)
SCREENSHOTS = [
    (
        "01_login.png",
        "Figure 1. Login — platform status probe (honest health, not fake KPIs)",
        "Entry surface for analysts, senior reviewers, and admins. The left pane documents product "
        "capabilities; the right pane is the credential form with optional demo autofill (autofill does "
        "not authenticate until Sign in). Status tiles probe live backend/Mongo health rather than "
        "fabricating tenant KPIs — live metrics appear only after authentication on the Dashboard.",
    ),
    (
        "02_dashboard.png",
        "Figure 2. Dashboard — live KPIs and ATT&CK heatmap",
        "Post-login home: severity mix, incident volume, IoC/event counters, and an ATT&CK technique "
        "heatmap driven from Mongo-backed analytics (short-lived cache). Empty tenants show zeros, not "
        "demo filler, unless an explicit demo-fallback flag is enabled and disclosed by banner.",
    ),
    (
        "03_upload.png",
        "Figure 3. Upload / ingest — multi-format logs and job queue",
        "Analyst evidence intake: multi-file and ZIP upload, sample-bundle staging, and job-queue "
        "visibility. The pipeline is asynchronous (parse, IoC, TI, ATT&CK, RAG, playbook) rather than a "
        "chat session — matching the modular agentic design described in Chapter 4.",
    ),
    (
        "04_incidents.png",
        "Figure 4. Incidents list — severity and filters",
        "Case inventory with severity filters, search, and deep links into the investigation workspace. "
        "Each row is a first-class incident document in MongoDB — the product system of record for IR "
        "narrative, not a transient chat thread.",
    ),
    (
        "05_workspace.png",
        "Figure 5. Investigation workspace — case system of record",
        "Single-pane investigation: case metadata, evidence, timeline, techniques, notes, and AI "
        "investigator stream. URL tab state supports shareable deep links for dual-run SIEM pilots.",
    ),
    (
        "06_graph.png",
        "Figure 6. Entity graph / assets view",
        "Entity/assets graph derived from correlated CES events and IoCs. Complements timeline and MITRE "
        "views so reviewers can see lateral relationships without leaving the case.",
    ),
    (
        "07_playbook.png",
        "Figure 7. IR playbook — phases, citations, grounding",
        "Hybrid-RAG playbook with containment/eradication/recovery/lessons phases, citation chips bound "
        "to the KB allow-list, and a grounding score. Low grounding or critical severity forces HiTL "
        "pending_review before closure.",
    ),
    (
        "08_review.png",
        "Figure 8. Human-in-the-Loop review queue",
        "Senior-reviewer queue for mandatory human gates. Approve/reject is race-safe (409 on double "
        "claim). Decisions write audit events into the integrity chain — best-effort hash chain, not WORM.",
    ),
    (
        "09_hunt.png",
        "Figure 9. Threat hunting",
        "Natural-language case hunt over a bounded recent incident window (not a SIEM log lake). "
        "Honesty banners state scoring limits so evaluators do not confuse case hunt with lake-scale hunt.",
    ),
    (
        "10_compliance.png",
        "Figure 10. Compliance alignment score (not certification)",
        "Product control-alignment score with assumed vs live-verified evidence and gap lists. Explicitly "
        "not ISO/SOC2 certification — suitable for board narrative packs and pilot readiness stories.",
    ),
    (
        "11_settings_llm.png",
        "Figure 11. Settings — multi-provider LLM catalog",
        "Admin LLM catalog: free/paid models, vaulted secrets (never returned raw), cross-provider "
        "fallback, and template-playbook offline path for deterministic golden evaluation.",
    ),
    (
        "12_architecture.png",
        "Figure 12. System architecture overview (light enterprise poster)",
        "Overall modular monolith: React SPA edge, FastAPI dual mounts (/api and /api/v1), MongoDB case/"
        "audit store, LanceDB hybrid RAG, optional LLM/TI. See Architecture detail for data-flow, "
        "component, RAG, and HiTL posters (Figures A-E).",
    ),
]

# Detailed architecture posters (rendered from assets/figures/*.svg)
ARCH_FIGURES = [
    (
        "12_architecture.png",
        "Figure A. Overall architecture poster",
        "Top-level context for evaluators: users (analyst/reviewer/admin/SIEM ingest), edge (React + "
        "FastAPI), data plane (MongoDB + LanceDB), and optional external LLM/TI. The IR pipeline strip "
        "states the job-queued path from upload through audit/compliance.",
        SHOTS,
    ),
    (
        "15_data_flow.png",
        "Figure B. Data flow — upload to review",
        "Ten-stage pipeline: Upload, Job, Parse (CES), IoC, TI (or mock), ATT&CK, Hybrid RAG playbook, "
        "HiTL gate, Workspace, Audit/export. Offline golden evaluation keeps template playbooks and mock "
        "TI so CI remains deterministic without live API keys.",
        SHOTS,
    ),
    (
        "16_components.png",
        "Figure C. Component architecture",
        "Frontend pages/design system, FastAPI routers (auth, jobs, review, hunt, audit), engines "
        "(parsers, IoC, enrichment, ATT&CK, hybrid RAG, playbook agent, HiTL, vault, investigator SSE), "
        "and data/external planes. ADR 0001 prefers modular monolith over premature microservices.",
        SHOTS,
    ),
    (
        "17_rag_pipeline.png",
        "Figure D. Hybrid RAG playbook pipeline",
        "Query construction from incident context, BM25 + LanceDB ANN fused by RRF, optional re-rank, "
        "LLM or template generation, citation allow-list filter, and grounding score. Trust controls "
        "are first-class: citations must subset retrieved KB IDs; low grounding triggers HiTL.",
        SHOTS,
    ),
    (
        "18_hitl_policy.png",
        "Figure E. Human-in-the-Loop policy",
        "Decision tree: severity gate, grounding threshold, optional auto-approve (never bypasses "
        "severity), pending_review path, race-safe reviewer actions, and audit integrity notes. Roles: "
        "analyst investigate, senior_reviewer approve, admin govern.",
        SHOTS,
    ),
]


class ReportPDF(FPDF):
    def __init__(self):
        super().__init__(unit="mm", format="A4")
        self._in_front = False
        self.set_auto_page_break(auto=True, margin=MARGIN_B)

    def header(self):
        if self.page_no() <= 2 or self._in_front:
            return
        self.set_draw_color(*BORDER)
        self.set_line_width(0.25)
        self.line(MARGIN_L, 14, 210 - MARGIN_R, 14)
        self.set_xy(MARGIN_L, 6)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(110, 6, "ACTIRA  |  Final Capstone Project  |  Confidential for evaluation", align="L")
        self.cell(self.epw - 110, 6, "27 July 2026", align="R")
        self.set_y(18)

    def footer(self):
        if self.page_no() == 1:
            return
        self.set_y(-14)
        self.set_draw_color(*BORDER)
        self.line(MARGIN_L, self.get_y(), 210 - MARGIN_R, self.get_y())
        self.set_y(-11)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(*MUTED)
        self.cell(0, 6, f"Page {self.page_no()}", align="C")


def ascii_safe(s: str) -> str:
    """Map common Unicode (box-drawing, math, emoji) so Helvetica never emits ????."""
    if s is None:
        return ""
    s = str(s)
    # Unescape common HTML entities that appear in markdown tables/cells
    s = (
        s.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
        .replace("&nbsp;", " ")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    repl = {
        # dashes / quotes / spaces
        "\u2014": "-", "\u2013": "-", "\u2012": "-", "\u2015": "-",
        "\u2018": "'", "\u2019": "'", "\u201a": "'", "\u201b": "'",
        "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u201f": '"',
        "\u00a0": " ", "\u202f": " ", "\u2009": " ", "\u200a": " ",
        "\u200b": "", "\u200c": "", "\u200d": "", "\ufeff": "",
        "\u2011": "-", "\u2212": "-",
        # bullets / misc
        "\u2022": "*", "\u2023": "*", "\u2043": "-", "\u00b7": "-",
        "\u2026": "...", "\u00d7": "x", "\u00f7": "/",
        "\u2713": "OK", "\u2714": "OK", "\u2717": "X", "\u2718": "X",
        "\u2705": "[OK]", "\u274c": "[X]", "\u26a0": "!", "\u2139": "i",
        "\ufe0f": "", "\u2122": "(TM)", "\u00ae": "(R)", "\u00a9": "(C)",
        # arrows (incl. heavy / double)
        "\u2192": "->", "\u2190": "<-", "\u2191": "^", "\u2193": "v",
        "\u21d2": "=>", "\u21d0": "<=", "\u2194": "<->", "\u27a1": "->",
        "\u279c": "->", "\u2794": "->", "\u21a6": "->",
        # comparisons / math / set theory
        "\u2248": "~", "\u2265": ">=", "\u2264": "<=", "\u2260": "!=",
        "\u2286": " subset-of ", "\u2282": " subset ", "\u2287": " superset-of ",
        "\u2208": " in ", "\u2209": " not-in ", "\u221e": "inf", "\u00b1": "+/-",
        "\u2243": "~", "\u223c": "~", "\u2229": " n ", "\u222a": " u ",
        "\u22a5": "perp", "\u2211": "sum", "\u220f": "prod",
        # box drawing (tree listings in report) — was the main ???? source
        "\u2500": "-", "\u2501": "-", "\u2502": "|", "\u2503": "|",
        "\u250c": "+", "\u2510": "+", "\u2514": "+", "\u2518": "+",
        "\u251c": "+", "\u2524": "+", "\u252c": "+", "\u2534": "+",
        "\u253c": "+", "\u2550": "=", "\u2551": "|",
        "\u2554": "+", "\u2557": "+", "\u255a": "+", "\u255d": "+",
        "\u2560": "+", "\u2563": "+", "\u2566": "+", "\u2569": "+",
        "\u256c": "+", "\u2574": "-", "\u2575": "|", "\u2576": "-",
        "\u2577": "|",
        # light/heavy box variants often used in pack layout trees
        "\u2504": "-", "\u2505": "-", "\u2506": "|", "\u2507": "|",
        "\u2508": "-", "\u2509": "-", "\u250a": "|", "\u250b": "|",
        "\u2511": "+", "\u2512": "+", "\u2513": "+", "\u2515": "+",
        "\u2516": "+", "\u2517": "+", "\u2519": "+", "\u251a": "+",
        "\u251b": "+", "\u251d": "+", "\u251e": "+", "\u251f": "+",
        "\u2520": "+", "\u2521": "+", "\u2522": "+", "\u2523": "+",
        "\u2525": "+", "\u2526": "+", "\u2527": "+", "\u2528": "+",
        "\u2529": "+", "\u252a": "+", "\u252b": "+", "\u252d": "+",
        "\u252e": "+", "\u252f": "+", "\u2530": "+", "\u2531": "+",
        "\u2532": "+", "\u2533": "+", "\u2535": "+", "\u2536": "+",
        "\u2537": "+", "\u2538": "+", "\u2539": "+", "\u253a": "+",
        "\u253b": "+", "\u253d": "+", "\u253e": "+", "\u253f": "+",
        "\u2540": "+", "\u2541": "+", "\u2542": "+", "\u2543": "+",
        "\u2544": "+", "\u2545": "+", "\u2546": "+", "\u2547": "+",
        "\u2548": "+", "\u2549": "+", "\u254a": "+", "\u254b": "+",
        # triangles / shapes used in ASCII diagrams
        "\u25bc": "v", "\u25b2": "^", "\u25b6": ">", "\u25c0": "<",
        "\u25cf": "*", "\u25cb": "o", "\u25a0": "#", "\u25a1": "[]",
        "\u25b8": ">", "\u25ba": ">", "\u25c2": "<", "\u25c4": "<",
        # greek / common tech
        "\u03b1": "a", "\u03b2": "b", "\u03bc": "u", "\u03c3": "s",
        "\u0394": "Delta", "\u03c0": "pi",
        # misc punctuation that sometimes slips into reports
        "\u2032": "'", "\u2033": "''", "\u00b0": " deg",
        "\u2197": "->", "\u2198": "->", "\u2196": "<-", "\u2199": "<-",
    }
    for a, b in repl.items():
        s = s.replace(a, b)
    # Drop remaining non-latin-1 with a readable fallback (never bare ?)
    out: list[str] = []
    for ch in s:
        o = ord(ch)
        if o < 256:
            out.append(ch)
        elif 0x1F300 <= o <= 0x1FAFF or 0x2600 <= o <= 0x27BF:
            out.append("")  # emoji / dingbats
        elif 0x2500 <= o <= 0x257F:
            out.append("-")  # any remaining box-drawing
        else:
            out.append(ch.encode("ascii", errors="ignore").decode("ascii") or "-")
    # Final belt: only latin-1 codepoints Helvetica can render
    safe: list[str] = []
    for ch in "".join(out):
        try:
            ch.encode("latin-1")
            safe.append(ch)
        except UnicodeEncodeError:
            safe.append("-")
    return "".join(safe)


def clean_inline(text: str) -> str:
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"", text)
    return ascii_safe(text.strip())


def ensure_space(pdf: ReportPDF, h: float = 20):
    if pdf.get_y() > pdf.h - pdf.b_margin - h:
        pdf.add_page()


def h1(pdf: ReportPDF, text: str):
    ensure_space(pdf, 28)
    if pdf.get_y() > 36:
        pdf.add_page()
    pdf.set_x(pdf.l_margin)
    pdf.set_fill_color(*BLUE)
    pdf.rect(pdf.l_margin, pdf.get_y(), 3.2, 11, style="F")
    pdf.set_xy(pdf.l_margin + 6, pdf.get_y())
    pdf.set_font("Helvetica", "B", 15)
    pdf.set_text_color(*NAVY)
    pdf.multi_cell(pdf.epw - 6, 7.5, clean_inline(text))
    pdf.ln(2)
    pdf.set_draw_color(*BORDER)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + pdf.epw, pdf.get_y())
    pdf.ln(5)


def h2(pdf: ReportPDF, text: str):
    ensure_space(pdf, 20)
    pdf.ln(3)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*BLUE)
    pdf.multi_cell(pdf.epw, 6.5, clean_inline(text))
    pdf.ln(1.5)


def h3(pdf: ReportPDF, text: str):
    ensure_space(pdf, 16)
    pdf.ln(2)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 10.5)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(pdf.epw, 5.8, clean_inline(text))
    pdf.ln(1)


def body(pdf: ReportPDF, text: str):
    if not text.strip():
        return
    ensure_space(pdf, 14)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "", 10.5)
    pdf.set_text_color(*SLATE)
    # Slightly taller line height for comfortable reading
    pdf.multi_cell(pdf.epw, 5.8, clean_inline(text))
    pdf.ln(2)


def bullet(pdf: ReportPDF, text: str, level: int = 0):
    ensure_space(pdf, 12)
    indent = 5 + level * 5
    pdf.set_x(pdf.l_margin + indent)
    pdf.set_font("Helvetica", "", 10.5)
    pdf.set_text_color(*SLATE)
    # Latin-1 safe bullet
    mark = "-"
    pdf.multi_cell(pdf.epw - indent, 5.6, f"{mark}  {clean_inline(text)}")
    pdf.ln(0.8)


def quote(pdf: ReportPDF, text: str):
    ensure_space(pdf, 16)
    y = pdf.get_y()
    pdf.set_xy(pdf.l_margin + 5, y)
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(*SLATE)
    start = pdf.get_y()
    pdf.multi_cell(pdf.epw - 5, 5.4, clean_inline(text), fill=False)
    end = pdf.get_y()
    pdf.set_fill_color(*BLUE)
    pdf.rect(pdf.l_margin, start, 1.8, max(end - start, 6), style="F")
    # soft tint behind quote (draw under text area)
    pdf.set_y(end + 3)


def code_block(pdf: ReportPDF, lines: list[str]):
    ensure_space(pdf, 18)
    pdf.set_fill_color(241, 245, 249)
    pdf.set_draw_color(*BORDER)
    pdf.set_font("Courier", "", 8)
    pdf.set_text_color(*NAVY)
    # ascii_safe each line so box-drawing / arrows never become "????"
    # Keep pure ASCII diagrams intact; only sanitize non-latin-1.
    cleaned: list[str] = []
    for ln in lines:
        cleaned.append(ascii_safe(ln if ln is not None else ""))
    text = "\n".join(cleaned) or " "
    pdf.set_x(pdf.l_margin)
    pdf.multi_cell(pdf.epw, 4.4, text, fill=True, border=0)
    pdf.ln(3)


def parse_table_row(line: str) -> list[str]:
    parts = [c.strip() for c in line.strip().strip("|").split("|")]
    return [clean_inline(p) for p in parts]


def is_sep_row(line: str) -> bool:
    core = line.replace("|", "").replace(":", "").replace("-", "").replace(" ", "")
    return core == ""


def _wrap_cell_text(pdf: ReportPDF, text: str, max_w: float) -> list[str]:
    """Word-wrap text to fit max_w without fpdf multi_cell Y side-effects."""
    text = (text or " ").replace("\n", " ").strip() or " "
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        if pdf.get_string_width(trial) <= max_w:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            # Hard-break very long tokens
            if pdf.get_string_width(w) > max_w:
                chunk = ""
                for ch in w:
                    t2 = chunk + ch
                    if pdf.get_string_width(t2) > max_w and chunk:
                        lines.append(chunk)
                        chunk = ch
                    else:
                        chunk = t2
                cur = chunk
            else:
                cur = w
    if cur:
        lines.append(cur)
    return lines or [" "]


def draw_table(pdf: ReportPDF, rows: list[list[str]]):
    if not rows:
        return
    ensure_space(pdf, 26)
    cols = max(len(r) for r in rows)
    # Always latin-1 safe (core Helvetica) — covers hardcoded appendix cells too
    rows = [[ascii_safe(c or "") for c in (r + [""] * (cols - len(r)))] for r in rows]
    usable = pdf.epw
    if cols == 2:
        widths = [usable * 0.34, usable * 0.66]
    elif cols == 3:
        widths = [usable * 0.28, usable * 0.36, usable * 0.36]
    elif cols == 4:
        widths = [usable * 0.26, usable * 0.24, usable * 0.28, usable * 0.22]
    else:
        widths = [usable / cols] * cols

    line_h = 4.4
    pad_y = 1.4
    max_lines = 8  # keep rows readable; avoid clipping off page bottom

    for ri, row in enumerate(rows):
        pdf.set_font("Helvetica", "B" if ri == 0 else "", 8.5)
        wrapped: list[list[str]] = []
        for ci, cell in enumerate(row):
            max_w = max(widths[ci] - 3, 10)
            lines = _wrap_cell_text(pdf, cell, max_w)
            if len(lines) > max_lines:
                lines = lines[: max_lines - 1] + [lines[max_lines - 1][: max(1, len(lines[max_lines - 1]) - 1)] + "..."]
            wrapped.append(lines)
        rh = max(line_h + pad_y * 2, max(len(w) for w in wrapped) * line_h + pad_y * 2)

        if pdf.get_y() + rh > pdf.h - pdf.b_margin:
            pdf.add_page()

        x0 = pdf.l_margin
        y0 = pdf.get_y()
        if ri == 0:
            pdf.set_fill_color(*BLUE)
            pdf.set_text_color(*WHITE)
            pdf.set_font("Helvetica", "B", 8.5)
        elif ri % 2 == 0:
            pdf.set_fill_color(*LIGHT)
            pdf.set_text_color(*SLATE)
            pdf.set_font("Helvetica", "", 8.5)
        else:
            pdf.set_fill_color(*WHITE)
            pdf.set_text_color(*SLATE)
            pdf.set_font("Helvetica", "", 8.5)

        # Draw fills first
        x = x0
        for ci in range(cols):
            pdf.rect(x, y0, widths[ci], rh, style="F")
            x += widths[ci]

        # Draw text with fixed Y per line (no multi_cell overflow into next row)
        x = x0
        for ci, lines in enumerate(wrapped):
            ty = y0 + pad_y
            for ln in lines:
                pdf.set_xy(x + 1.5, ty)
                pdf.cell(widths[ci] - 3, line_h, ln[:200], border=0)
                ty += line_h
            x += widths[ci]

        pdf.set_draw_color(*BORDER)
        pdf.set_line_width(0.2)
        x = x0
        for ci in range(cols):
            pdf.rect(x, y0, widths[ci], rh, style="D")
            x += widths[ci]
        pdf.set_y(y0 + rh)

    pdf.ln(5)


def image_display_size(path: Path, max_w: float, max_h: float) -> tuple[float, float]:
    """Return (w_mm, h_mm) fitting inside max box, preserving aspect ratio."""
    if PILImage is not None:
        with PILImage.open(path) as im:
            iw, ih = im.size
    else:
        # Fallback assume 16:9 UI captures
        iw, ih = 1920, 1080
    if iw <= 0 or ih <= 0:
        return max_w, max_h * 0.5
    scale = min(max_w / iw, max_h / ih)
    return iw * scale, ih * scale


def embed_figure(
    pdf: ReportPDF,
    path: Path,
    caption: str,
    *,
    narrative: str | None = None,
    new_page: bool = True,
):
    """Place one screenshot with caption + optional documentary narrative."""
    if new_page:
        pdf.add_page()
    else:
        ensure_space(pdf, 100)

    # Caption bar
    pdf.set_fill_color(*SOFT_BLUE)
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*NAVY)
    pdf.multi_cell(pdf.epw, 6, ascii_safe(caption), fill=True)
    pdf.ln(3)

    max_w = pdf.epw
    # Reserve space for documentary narrative under the image when provided
    narr_reserve = 28 if narrative else 8
    max_h = min(145, pdf.h - pdf.get_y() - pdf.b_margin - narr_reserve)
    w, h = image_display_size(path, max_w, max_h)
    x = pdf.l_margin + (pdf.epw - w) / 2

    try:
        # Light border around figure
        pdf.set_draw_color(*BORDER)
        pdf.set_line_width(0.3)
        pdf.rect(x - 0.5, pdf.get_y() - 0.5, w + 1, h + 1, style="D")
        pdf.image(str(path), x=x, y=pdf.get_y(), w=w, h=h)
        pdf.set_y(pdf.get_y() + h + 4)
    except Exception as e:
        body(pdf, f"[Could not embed {path.name}: {e}]")

    if narrative:
        # Plain figure narration (no "Documentary note" label)
        ensure_space(pdf, 18)
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_text_color(*SLATE)
        pdf.multi_cell(pdf.epw, 4.6, ascii_safe(narrative))
        pdf.ln(2)


def title_page(pdf: ReportPDF):
    pdf._in_front = True
    pdf.add_page()
    # top accent
    pdf.set_fill_color(*NAVY)
    pdf.rect(0, 0, 210, 52, style="F")
    pdf.set_fill_color(*BLUE)
    pdf.rect(0, 52, 210, 3.5, style="F")

    pdf.set_xy(MARGIN_L, 16)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(0, 6, "ADVANCED CERTIFICATION PROGRAMME", align="L")
    pdf.set_xy(MARGIN_L, 26)
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 7, "Agentic and Generative AI  |  Final Capstone Project")

    pdf.set_xy(MARGIN_L, 72)
    pdf.set_font("Helvetica", "B", 34)
    pdf.set_text_color(*NAVY)
    pdf.cell(0, 14, "ACTIRA")

    pdf.set_xy(MARGIN_L, 92)
    pdf.set_font("Helvetica", "", 13.5)
    pdf.set_text_color(*BLUE)
    pdf.multi_cell(
        pdf.epw,
        7,
        ascii_safe(
            "Agentic Cybersecurity Threat Intelligence\n"
            "& Incident Response Advisor"
        ),
    )

    pdf.set_draw_color(*BLUE)
    pdf.set_line_width(0.7)
    pdf.line(MARGIN_L, 122, 72, 122)

    meta = [
        ("Status", "Final Capstone Project submission pack"),
        ("Program", "TalentSprint / IISc track"),
        ("Maturity", "Enterprise Pilot Ready (single-tenant)"),
        ("Board score", "78 / 100"),
        ("Golden IR", "37 cases | IoC F1 0.982 | Technique recall 0.930"),
        ("Test pack", "66 automated tests passed (2026-07-27)"),
        ("Coverage", "Architecture A-E, UI 01-18, demo video + voiceover"),
        ("Date", "27 July 2026"),
    ]
    y = 130
    for label, val in meta:
        pdf.set_xy(MARGIN_L, y)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(*MUTED)
        pdf.cell(36, 6.5, label.upper())
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(*SLATE)
        # multi_cell so long values wrap instead of clipping off-page
        pdf.set_xy(MARGIN_L + 36, y)
        pdf.multi_cell(pdf.epw - 36, 5.5, ascii_safe(val))
        y = max(y + 8.5, pdf.get_y() + 1.5)

    pdf.set_xy(MARGIN_L, min(y + 8, 250))
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(*MUTED)
    pdf.multi_cell(
        pdf.epw,
        5,
        ascii_safe(
            "Final Capstone Project deliverable. Advisory AI with Human-in-the-Loop gates. "
            "Does not replace SIEM/XDR platforms of record (Sentinel, Splunk ES, Falcon, XSIAM). "
            "Compliance scores are product alignment only — not formal certification. "
            "Appendix E lists roles for completeness only — product capabilities are the evaluation focus."
        ),
    )
    pdf._in_front = False


def toc_page(pdf: ReportPDF):
    pdf.add_page()
    h1(pdf, "Table of contents")
    items = [
        ("1", "Introduction"),
        ("2", "Literature & related work"),
        ("3", "System requirements"),
        ("4", "System architecture"),
        ("5", "Design & methodology"),
        ("6", "Implementation"),
        ("7", "Testing & evaluation"),
        ("8", "Results & discussion"),
        ("9", "Challenges & mitigations"),
        ("10", "Conclusion & future work"),
        ("", "Architecture detail (poster + control tables)"),
        ("", "Figures — Screenshots & architecture (light theme)"),
        ("", "References"),
        ("A", "Appendix A — Test case catalog (detailed)"),
        ("B", "Appendix B — API surface (detailed)"),
        ("C", "Appendix C — Sample outputs"),
        ("D", "Appendix D — Configuration"),
        ("E", "Appendix E — Team roles"),
        ("F", "Appendix F — Glossary"),
    ]
    for num, item in items:
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", "", 11)
        pdf.set_text_color(*SLATE)
        label = f"{num}." if num.isdigit() else (f"{num}." if num else "")
        pdf.cell(12, 7.5, label, align="L")
        pdf.cell(0, 7.5, ascii_safe(item))
        pdf.ln(7.5)


def figures_section(pdf: ReportPDF):
    pdf.add_page()
    h1(pdf, "Figures — Screenshots & architecture")
    body(
        pdf,
        "The following figures are live light-theme captures from the ACTIRA lab environment "
        "(Playwright: docs/capstone/capture_screenshots.py) plus detailed architecture posters. "
        "Each figure is placed on its own page with a short narration for evaluators.",
    )
    body(
        pdf,
        "UI theme: light enterprise shell (default for this Final Capstone Project pack). "
        "Architecture posters use the same light palette as the product screenshots. "
        "Figures A-E in the Architecture detail section expand system design beyond Figure 12.",
    )

    for item in SCREENSHOTS:
        fname = item[0]
        caption = item[1]
        narrative = item[2] if len(item) > 2 else None
        path = SHOTS / fname
        if not path.exists():
            pdf.add_page()
            body(pdf, f"[Missing image: {fname} - re-run capture_screenshots.py]")
            continue
        embed_figure(pdf, path, caption, narrative=narrative, new_page=True)


def emit_structured_markdown(pdf: ReportPDF, text: str, *, stop_at_appendices: bool = False):
    """Parse markdown into readable PDF blocks (headings, tables, lists, code)."""
    lines = text.splitlines()
    i = 0
    in_code = False
    code_buf: list[str] = []
    table_buf: list[str] = []

    def flush_table():
        nonlocal table_buf
        if not table_buf:
            return
        rows = []
        for tl in table_buf:
            if is_sep_row(tl):
                continue
            rows.append(parse_table_row(tl))
        draw_table(pdf, rows)
        table_buf = []

    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()

        if stop_at_appendices and line.startswith("# Appendices"):
            flush_table()
            break

        if line.startswith("## Pack layout"):
            flush_table()
            i += 1
            while i < len(lines) and not (
                lines[i].startswith("# ") or lines[i].startswith("## ")
            ):
                i += 1
            continue

        if line.startswith("## Table of contents"):
            flush_table()
            i += 1
            while i < len(lines) and not lines[i].startswith("#"):
                i += 1
            continue

        if line.strip().startswith("```"):
            flush_table()
            if in_code:
                code_block(pdf, code_buf)
                code_buf = []
                in_code = False
            else:
                in_code = True
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        if line.startswith("|"):
            table_buf.append(line)
            i += 1
            continue
        else:
            flush_table()

        if not line.strip():
            pdf.ln(2)
            i += 1
            continue

        if line.startswith("# "):
            h1(pdf, line[2:])
        elif line.startswith("## "):
            h2(pdf, line[3:])
        elif line.startswith("### "):
            h3(pdf, line[4:])
        elif line.startswith("> "):
            parts = [line[2:]]
            i += 1
            while i < len(lines) and lines[i].startswith("> "):
                parts.append(lines[i][2:])
                i += 1
            quote(pdf, " ".join(parts))
            continue
        elif re.match(r"^[-*] ", line):
            bullet(pdf, line[2:])
        elif re.match(r"^\d+\.\s", line):
            bullet(pdf, re.sub(r"^\d+\.\s+", "", line))
        elif line.strip() == "---":
            pdf.ln(2)
            pdf.set_draw_color(*BORDER)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.l_margin + pdf.epw, pdf.get_y())
            pdf.ln(4)
        else:
            body(pdf, line)

        i += 1

    flush_table()


APPENDICES = [
    ("A_test_case_catalog.md", "Appendix A — Test case catalog (detailed)"),
    ("B_api_surface.md", "Appendix B — API surface (detailed)"),
    ("C_sample_outputs.md", "Appendix C — Sample outputs"),
    ("D_configuration.md", "Appendix D — Configuration"),
    ("E_team_roles.md", "Appendix E — Team roles"),
    ("F_glossary.md", "Appendix F — Glossary"),
]


def architecture_detail_section(pdf: ReportPDF):
    """Dedicated detailed architecture pages with full poster set + control tables."""
    pdf.add_page()
    h1(pdf, "Architecture detail (submission posters)")
    body(
        pdf,
        "ACTIRA is a modular monolith optimized for single-tenant pilot reliability: "
        "React SPA on the edge, FastAPI dual mounts (/api and /api/v1), MongoDB for cases/"
        "users/audit, LanceDB for hybrid BM25+vector RAG, and optional external LLM/TI APIs. "
        "The IR pipeline is job-queued: Upload -> Parse -> IoC -> TI -> ATT&CK -> Hybrid RAG -> "
        "Playbook -> HiTL -> Workspace -> Audit/Compliance.",
    )
    body(
        pdf,
        "Positioning for evaluators: complements SIEM/XDR dual-run pilots; does not replace "
        "Sentinel, Splunk ES, Falcon, or XSIAM. LLM and TI keys are optional - template playbooks "
        "and mock TI keep offline golden evaluation deterministic.",
    )
    body(
        pdf,
        "The five posters below are the detailed architecture set used in the viva deck and demo "
        "video. Editable SVG/Mermaid sources live under docs/capstone/assets/figures/. "
        "PNG renders are produced by capture_screenshots.py (Playwright SVG -> PNG).",
    )

    # Full ARCH_FIGURES pack (A-E) with documentary narratives
    twin_map = {
        "12_architecture.png": "12_architecture.png",
        "15_data_flow.png": "data_flow.png",
        "16_components.png": "components.png",
        "17_rag_pipeline.png": "rag_pipeline.png",
        "18_hitl_policy.png": "hitl_policy.png",
    }
    for item in ARCH_FIGURES:
        fname, caption, narrative, base = item[0], item[1], item[2], item[3]
        candidates = [base / fname, FIGS / fname, FIGS / twin_map.get(fname, fname)]
        path = next((p for p in candidates if p.exists()), None)
        if not path:
            pdf.add_page()
            body(pdf, f"[Missing architecture figure: {fname} - re-run capture_screenshots.py]")
            continue
        embed_figure(pdf, path, caption, narrative=narrative, new_page=True)

    pdf.add_page()
    h2(pdf, "Layer responsibilities")
    draw_table(
        pdf,
        [
            ["Layer", "Components", "Responsibilities"],
            ["Edge UI", "React SPA", "Auth, Dashboard, Upload, Workspace, Review, Hunt, Settings, Compliance"],
            ["API", "FastAPI /api + /api/v1", "Jobs, pipeline, RBAC, SSE investigator, export APIs"],
            ["Engines", "Parse/IoC/TI/ATT&CK/RAG/HiTL", "Deterministic + optional LLM stages"],
            ["Data", "MongoDB + LanceDB", "Cases, users, audit chain; hybrid retrieval index"],
            ["External", "LLM / TI / Slack", "Optional; mock/template offline path"],
        ],
    )
    h2(pdf, "Security & governance architecture")
    draw_table(
        pdf,
        [
            ["Control", "Mechanism"],
            ["AuthN", "Password login + cookie JWT; lockout; OIDC scaffold"],
            ["AuthZ", "RBAC: analyst / senior_reviewer / admin"],
            ["Secrets", "Settings vault encrypt-at-rest; never return raw keys"],
            ["Ingest safety", "ZIP bomb / size limits; pipeline isolation"],
            ["Audit", "SHA-256 integrity chain; summary + executive export"],
            ["Compliance", "Alignment score + gaps + evidence (not certification)"],
        ],
    )
    h2(pdf, "AI / RAG architecture")
    bullet(pdf, "Hybrid retrieval: BM25 + LanceDB dense vectors fused with Reciprocal Rank Fusion (RRF)")
    bullet(pdf, "Citation allow-list: playbook citation_ids must subset retrieved KB IDs")
    bullet(pdf, "Grounding score 0-1; low grounding or critical severity -> HiTL pending_review")
    bullet(pdf, "Multi-provider LLM catalog with cross-provider fallback; template last resort")
    bullet(pdf, "Honest framing: modular agentic pipeline stages, not a full multi-agent swarm product")
    h2(pdf, "How to read the architecture figures")
    bullet(pdf, "Figure A (overall): context diagram — who uses ACTIRA and which planes they touch")
    bullet(pdf, "Figure B (data flow): ordered pipeline stages from upload through audit/export")
    bullet(pdf, "Figure C (components): frontend pages, FastAPI routers, engines, data/external planes")
    bullet(pdf, "Figure D (RAG): hybrid retrieval, citation filter, grounding, template offline path")
    bullet(pdf, "Figure E (HiTL): severity/grounding gates, race-safe review, audit integrity notes")


def appendix_detailed(pdf: ReportPDF):
    """Full appendices A-F from docs/capstone/appendices/*.md (detailed submission pack)."""
    app_dir = ROOT / "appendices"

    # Executive summary of formal automation (always first)
    pdf.add_page()
    h1(pdf, "Appendices — formal automation evidence")
    body(
        pdf,
        "The following pages include the full detailed appendix pack (A-F) for this Final Capstone "
        "Project. Formal automated evidence (2026-07-27) is summarized first. Appendix E is "
        "included for completeness only — evaluation focus is product capability, not personnel.",
    )
    h2(pdf, "Formal run (2026-07-27)")
    draw_table(
        pdf,
        [
            ["Suite", "Result", "Notes"],
            ["Golden IR + Wave C + RBAC + Hardening", "66 / 66 PASS", "~18s, exit 0"],
            ["Golden cases", "37", "IoC F1 0.982, technique recall 0.930"],
            ["Mean grounding (template path)", "1.000", "CI offline path"],
            ["Demo video + screenshots", "Regenerated", "Light theme, full product tour"],
        ],
    )
    body(
        pdf,
        "Command: python -m pytest backend/tests/test_golden_benchmark.py "
        "backend/tests/test_compliance_score.py backend/tests/test_audit_intelligence.py "
        "backend/tests/test_llm_fallback_catalog.py backend/tests/test_executive_export.py "
        "backend/tests/test_rbac_matrix.py backend/tests/test_hardening.py -q",
    )

    for fname, title in APPENDICES:
        path = app_dir / fname
        pdf.add_page()
        h1(pdf, title)
        if not path.exists():
            body(pdf, f"[Missing appendix file: appendices/{fname}]")
            continue
        body(pdf, f"Source: docs/capstone/appendices/{fname}")
        text = path.read_text(encoding="utf-8")
        # Drop leading H1 (we already printed title)
        text = re.sub(r"^# .+\n+", "", text, count=1)
        emit_structured_markdown(pdf, text)


def main() -> None:
    if not REPORT.exists():
        raise SystemExit(f"Missing {REPORT}")

    pdf = ReportPDF()
    pdf.set_margins(MARGIN_L, MARGIN_T, MARGIN_R)
    # Slightly more breathing room between blocks via default line spacing
    pdf.set_auto_page_break(auto=True, margin=MARGIN_B)

    title_page(pdf)
    toc_page(pdf)

    md = REPORT.read_text(encoding="utf-8")
    pdf.add_page()
    h1(pdf, "Abstract")
    m = re.search(r"## Abstract\s*\n+(.+?)\n+---\s*\n", md, re.S)
    if m:
        for para in re.split(r"\n\s*\n", m.group(1).strip()):
            if para.strip().startswith("**Keywords"):
                pdf.ln(2)
                pdf.set_font("Helvetica", "B", 9.5)
                pdf.set_text_color(*MUTED)
                pdf.set_x(pdf.l_margin)
                pdf.multi_cell(pdf.epw, 5.4, clean_inline(para))
            else:
                body(pdf, para)
    else:
        body(pdf, "See PROJECT_REPORT.md for abstract.")

    ch = re.search(r"# Chapter 1", md)
    if ch:
        rest = md[ch.start():]
        ap = re.search(r"\n# Appendices\b", rest)
        if ap:
            rest = rest[: ap.start()]
        # Stop before loose "Figures" / "References" if they are only pointers
        emit_structured_markdown(pdf, rest)

    # Detailed architecture poster + control tables (after body chapters)
    architecture_detail_section(pdf)
    figures_section(pdf)
    appendix_detailed(pdf)

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")
    print(f"  size: {OUT.stat().st_size / 1024:.0f} KB")
    print(f"  pages: {pdf.page_no()}")
    missing = [item[0] for item in SCREENSHOTS if not (SHOTS / item[0]).exists()]
    if missing:
        print(f"  missing screenshots: {missing}")
    else:
        print(f"  screenshots embedded: {len(SCREENSHOTS)} (light theme + figure narrations)")
    arch_missing = [item[0] for item in ARCH_FIGURES if not (SHOTS / item[0]).exists()]
    if arch_missing:
        print(f"  missing architecture figures: {arch_missing}")
    else:
        print(f"  architecture figures embedded: {len(ARCH_FIGURES)} (A-E)")


if __name__ == "__main__":
    main()
