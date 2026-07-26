"""
Export docs/capstone/PROJECT_REPORT.md (+ appendix summaries) to a simple PDF.

  python docs/capstone/export_report_pdf.py

Output: docs/capstone/PROJECT_REPORT.pdf
"""
from __future__ import annotations

import re
from pathlib import Path

from fpdf import FPDF

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "PROJECT_REPORT.md"
OUT = ROOT / "PROJECT_REPORT.pdf"

APPENDIX_FILES = [
    ROOT / "appendices" / "A_test_case_catalog.md",
    ROOT / "appendices" / "B_api_surface.md",
    ROOT / "appendices" / "C_sample_outputs.md",
    ROOT / "appendices" / "D_configuration.md",
    ROOT / "appendices" / "E_team_roles.md",
    ROOT / "appendices" / "F_glossary.md",
]


class ReportPDF(FPDF):
    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 8, "ACTIRA Capstone Project Report  |  Project 4  |  Confidential for evaluation", align="L")
        self.ln(10)

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 116, 139)
        self.cell(0, 8, f"Page {self.page_no()}", align="C")


def clean_line(line: str) -> str:
    # strip markdown links [text](url) -> text
    line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
    # bold/italic
    line = re.sub(r"\*\*([^*]+)\*\*", r"\1", line)
    line = re.sub(r"\*([^*]+)\*", r"\1", line)
    line = re.sub(r"`([^`]+)`", r"\1", line)
    # images
    line = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"[\1]", line)
    return ascii_safe(line)


def emit_markdown(pdf: ReportPDF, text: str, max_pages_soft: int | None = None):
    in_code = False
    usable = pdf.w - pdf.l_margin - pdf.r_margin
    for raw in text.splitlines():
        if max_pages_soft and pdf.page_no() > max_pages_soft:
            pdf.set_font("Helvetica", "I", 10)
            pdf.set_text_color(148, 163, 184)
            pdf.multi_cell(usable, 6, ascii_safe("[Truncated for PDF size - see full Markdown in docs/capstone/]"))
            return
        line = raw.rstrip()
        pdf.set_x(pdf.l_margin)
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            pdf.set_font("Courier", size=8)
            pdf.set_text_color(30, 41, 59)
            pdf.multi_cell(usable, 4, clean_line(line)[:200] or " ")
            continue
        if not line.strip():
            pdf.ln(3)
            continue
        if line.startswith("# "):
            pdf.ln(4)
            pdf.set_font("Helvetica", "B", 16)
            pdf.set_text_color(15, 23, 42)
            pdf.multi_cell(usable, 8, clean_line(line[2:]))
            pdf.ln(2)
        elif line.startswith("## "):
            pdf.ln(3)
            pdf.set_font("Helvetica", "B", 13)
            pdf.set_text_color(30, 58, 138)
            pdf.multi_cell(usable, 7, clean_line(line[3:]))
            pdf.ln(1)
        elif line.startswith("### "):
            pdf.ln(2)
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(51, 65, 85)
            pdf.multi_cell(usable, 6, clean_line(line[4:]))
        elif line.startswith("|"):
            pdf.set_font("Courier", size=7)
            pdf.set_text_color(51, 65, 85)
            # skip separator rows
            if re.match(r"^\|[\s\-:|]+\|$", line.replace(" ", "")):
                continue
            pdf.multi_cell(usable, 4, clean_line(line)[:180])
        elif line.startswith("> "):
            pdf.set_font("Helvetica", "I", 10)
            pdf.set_text_color(71, 85, 105)
            pdf.multi_cell(usable, 5, clean_line(line[2:]))
        elif line.startswith("- ") or line.startswith("* "):
            pdf.set_font("Helvetica", size=10)
            pdf.set_text_color(30, 41, 59)
            pdf.multi_cell(usable, 5, "* " + clean_line(line[2:]))
        else:
            pdf.set_font("Helvetica", size=10)
            pdf.set_text_color(30, 41, 59)
            pdf.multi_cell(usable, 5, clean_line(line))


def ascii_safe(s: str) -> str:
    """Helvetica core fonts are Latin-1; drop / replace other glyphs."""
    repl = {
        "\u2014": "-",
        "\u2013": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2022": "*",
        "\u2192": "->",
        "\u2190": "<-",
        "\u2248": "~",
        "\u2265": ">=",
        "\u2264": "<=",
        "\u00d7": "x",
        "\u2026": "...",
        "\u00b7": "-",
        "\u2713": "OK",
        "\u2717": "X",
        "\u2011": "-",
        "\u00a0": " ",
    }
    for a, b in repl.items():
        s = s.replace(a, b)
    return s.encode("latin-1", errors="replace").decode("latin-1")


def main() -> None:
    pdf = ReportPDF()
    pdf.set_margins(18, 16, 18)
    pdf.set_auto_page_break(auto=True, margin=16)
    def write(w, h, text, **kwargs):
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(w, h, text, **kwargs)

    pdf.add_page()
    w = pdf.epw
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(15, 23, 42)
    write(w, 10, "ACTIRA")
    pdf.set_font("Helvetica", size=14)
    pdf.set_text_color(56, 100, 200)
    write(w, 8, ascii_safe("Agentic Cybersecurity Threat Intelligence & Incident Response Advisor"))
    pdf.ln(4)
    pdf.set_font("Helvetica", size=11)
    pdf.set_text_color(71, 85, 105)
    write(
        w,
        6,
        ascii_safe(
            "Capstone Project 4 | Advanced Certification Programme in Agentic and Generative AI\n"
            "26 July 2026 | Enterprise Pilot Ready (78/100)\n"
            "Group 1 team - see Appendix E"
        ),
    )
    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 9)
    write(
        w,
        5,
        ascii_safe(
            "Generated from docs/capstone/PROJECT_REPORT.md and appendices/. "
            "For editable source and full test tables, use the Markdown pack."
        ),
    )

    body = REPORT.read_text(encoding="utf-8")
    pdf.add_page()
    emit_markdown(pdf, body)

    for ap in APPENDIX_FILES:
        if not ap.exists():
            continue
        pdf.add_page()
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(15, 23, 42)
        write(pdf.epw, 8, ascii_safe(ap.name))
        pdf.ln(2)
        emit_markdown(pdf, ap.read_text(encoding="utf-8"), max_pages_soft=pdf.page_no() + 12)

    pdf.output(str(OUT))
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes, {pdf.page_no()} pages)")


if __name__ == "__main__":
    main()
