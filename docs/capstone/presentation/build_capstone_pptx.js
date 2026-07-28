/**
 * ACTIRA — Final Capstone Project viva deck (light enterprise theme).
 * Run: node docs/capstone/presentation/build_capstone_pptx.js
 * Output: docs/capstone/presentation/ACTIRA_Capstone_Presentation.pptx
 *
 * Design notes:
 * - Prefer short lines / multi-line boxes so text never clips under footer
 * - Product capability first (not team roster)
 * - Max surface coverage: architecture A–E + all major UI areas
 */
const PptxGenJS = require("pptxgenjs");
const path = require("path");
const fs = require("fs");

const outPath = path.join(__dirname, "ACTIRA_Capstone_Presentation.pptx");
const shotsDir = path.join(__dirname, "..", "assets", "screenshots");

function shot(name) {
  const p = path.join(shotsDir, name);
  return fs.existsSync(p) ? p : null;
}

const C = {
  bg: "F8FAFC",
  card: "FFFFFF",
  cardAlt: "F1F5F9",
  border: "E2E8F0",
  text: "0F172A",
  muted: "64748B",
  accent: "2563EB",
  accentSoft: "DBEAFE",
  green: "059669",
  amber: "D97706",
  red: "DC2626",
  white: "FFFFFF",
  navy: "0F172A",
};

const TOTAL = 30;
const FOOTER_Y = 7.12;
const CONTENT_BOTTOM = 7.05;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "ACTIRA Final Capstone Project";
pptx.title = "ACTIRA — Final Capstone Project";
pptx.subject = "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor";

function bg(slide) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 7.5,
    fill: { color: C.bg },
  });
}

function footer(slide, n, total = TOTAL) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: FOOTER_Y, w: 13.333, h: 0.38,
    fill: { color: C.white },
  });
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: FOOTER_Y, w: 13.333, h: 0.015,
    fill: { color: C.border },
  });
  slide.addText("ACTIRA  ·  Final Capstone Project  ·  Confidential for evaluation", {
    x: 0.4, y: FOOTER_Y + 0.05, w: 10, h: 0.28,
    fontSize: 10, color: C.muted, fontFace: "Calibri",
    valign: "middle",
  });
  slide.addText(`${n} / ${total}`, {
    x: 11.5, y: FOOTER_Y + 0.05, w: 1.5, h: 0.28,
    fontSize: 10, color: C.muted, fontFace: "Calibri", align: "right", valign: "middle",
  });
}

function titleBar(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.5, y: 0.22, w: 12.3, h: 0.4,
    fontSize: 22, bold: true, color: C.navy, fontFace: "Calibri",
    valign: "middle",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.62, w: 12.3, h: 0.32,
      fontSize: 12, color: C.accent, fontFace: "Calibri",
      valign: "middle",
    });
  }
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 0.98, w: 2.0, h: 0.04,
    fill: { color: C.accent },
  });
}

function card(slide, x, y, w, h) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: C.card },
    line: { color: C.border, width: 1 },
    shadow: { type: "outer", color: "0F172A", blur: 6, opacity: 0.06, offset: 1 },
    rectRadius: 0.08,
  });
}

function addShot(slide, file, x, y, w, h) {
  const p = shot(file);
  if (!p) {
    card(slide, x, y, w, h);
    slide.addText(`[Missing ${file}]`, {
      x, y: y + h / 2 - 0.15, w, h: 0.35,
      fontSize: 11, color: C.muted, align: "center", fontFace: "Calibri",
    });
    return;
  }
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: x - 0.03, y: y - 0.03, w: w + 0.06, h: h + 0.06,
    fill: { color: C.white },
    line: { color: C.border, width: 1 },
    rectRadius: 0.05,
  });
  slide.addImage({
    path: p,
    x, y, w, h,
    sizing: { type: "contain", w, h },
  });
}

function bulletBlock(slide, items, x, y, w, lineH = 0.55, fontSize = 12) {
  // Generous line height + wrap so text never clips under the next bullet or footer
  items.forEach((t, i) => {
    slide.addText("•  " + t, {
      x, y: y + i * lineH, w, h: lineH - 0.06,
      fontSize, color: C.text, fontFace: "Calibri",
      valign: "top", wrap: true, shrinkText: true,
    });
  });
}

function safeText(slide, text, opts) {
  slide.addText(text, {
    wrap: true,
    shrinkText: true,
    fontFace: "Calibri",
    ...opts,
  });
}

// ─── 1 Title ─────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: C.accent },
  });
  s.addText("FINAL CAPSTONE PROJECT", {
    x: 0.7, y: 1.35, w: 11, h: 0.35,
    fontSize: 13, color: C.accent, bold: true, fontFace: "Calibri",
    charSpacing: 1.5,
  });
  s.addText("ACTIRA", {
    x: 0.7, y: 1.85, w: 12, h: 0.65,
    fontSize: 44, bold: true, color: C.navy, fontFace: "Calibri",
  });
  s.addText("Agentic Cybersecurity Threat Intelligence\n& Incident Response Advisor", {
    x: 0.7, y: 2.6, w: 11.5, h: 0.85,
    fontSize: 20, color: C.text, fontFace: "Calibri",
  });
  s.addText("Human-gated AI IR advisor  ·  Hybrid RAG  ·  Investigation workspace  ·  Offline golden eval", {
    x: 0.7, y: 3.65, w: 11.5, h: 0.35,
    fontSize: 13, color: C.muted, fontFace: "Calibri",
  });
  s.addText(
    "Advanced Certification Programme in Agentic and Generative AI\n" +
    "TalentSprint / IISc track  ·  27 July 2026  ·  Enterprise Pilot Ready (78/100)\n" +
    "Final Capstone Project submission pack",
    {
      x: 0.7, y: 4.85, w: 11.5, h: 1.15,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
      wrap: true, valign: "top",
    }
  );
  footer(s, 1);
}

// ─── 2 Problem ───────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "The problem", "SOC alert overload without grounded IR");
  const pains = [
    { t: "Alert overload", d: "SIEM / EDR / cloud sensors outpace manual triage capacity" },
    { t: "Manual IR steps", d: "IoC → TI → ATT&CK → playbook is slow and inconsistent" },
    { t: "Chatbot risk", d: "Generic LLMs lack citations, audit trail, and formal human gates" },
    { t: "Cost of delay", d: "Inconsistent response quality under fatigue and time pressure" },
  ];
  pains.forEach((p, i) => {
    const x = 0.5 + (i % 2) * 6.35;
    const y = 1.25 + Math.floor(i / 2) * 2.7;
    card(s, x, y, 6.1, 2.5);
    s.addText(String(i + 1), {
      x: x + 0.3, y: y + 0.35, w: 0.5, h: 0.45,
      fontSize: 18, bold: true, color: C.accent, fontFace: "Calibri",
    });
    s.addText(p.t, {
      x: x + 0.9, y: y + 0.4, w: 4.9, h: 0.45,
      fontSize: 16, bold: true, color: C.navy, fontFace: "Calibri",
    });
    s.addText(p.d, {
      x: x + 0.9, y: y + 1.0, w: 4.9, h: 1.15,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
      wrap: true, valign: "top",
    });
  });
  footer(s, 2);
}

// ─── 3 Objectives ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Objectives & non-goals", "Clear scope for Final Capstone evaluation");
  card(s, 0.5, 1.25, 6.15, 5.55);
  s.addText("OBJECTIVES", {
    x: 0.75, y: 1.45, w: 5.6, h: 0.32,
    fontSize: 12, bold: true, color: C.green, fontFace: "Calibri",
  });
  bulletBlock(s, [
    "Automate parse → IoC → TI → ATT&CK → RAG playbook",
    "Human-in-the-loop for critical / low-grounding cases",
    "Investigation workspace as case system of record",
    "Offline golden IR evaluation (CI gates)",
    "RBAC, vault, audit integrity, compliance alignment",
    "Honest product framing for pilot boards",
  ], 0.8, 1.95, 5.5, 0.72, 12);

  card(s, 6.9, 1.25, 5.95, 5.55);
  s.addText("NON-GOALS", {
    x: 7.15, y: 1.45, w: 5.4, h: 0.32,
    fontSize: 12, bold: true, color: C.amber, fontFace: "Calibri",
  });
  bulletBlock(s, [
    "Not a Sentinel / Splunk / Falcon replacement",
    "Not multi-tenant SaaS isolation (v1)",
    "Not unsupervised SOAR execution",
    "Not formal ISO / SOC2 certification",
    "Not 500-user scale certification",
    "Not lake-scale SIEM hunt (case hunt only)",
  ], 7.2, 1.95, 5.4, 0.72, 12);
  footer(s, 3);
}

// ─── 4 Solution ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Solution overview", "Human-gated AI IR advisor for single-tenant pilots");
  s.addText("Upload → Parse → IoC → TI → ATT&CK → Hybrid RAG → Playbook → HiTL → Workspace → Audit", {
    x: 0.5, y: 1.2, w: 12.3, h: 0.35,
    fontSize: 12, color: C.accent, fontFace: "Calibri",
  });
  const steps = [
    { n: "01", t: "Ingest", d: "Multi-format\nZIP + jobs" },
    { n: "02", t: "Enrich", d: "IoC + TI\nlive or mock" },
    { n: "03", t: "Map", d: "ATT&CK\nheuristics" },
    { n: "04", t: "Advise", d: "RAG\nplaybooks" },
    { n: "05", t: "Govern", d: "HiTL +\naudit" },
  ];
  steps.forEach((st, i) => {
    const x = 0.5 + i * 2.55;
    card(s, x, 1.8, 2.4, 2.7);
    s.addText(st.n, {
      x: x + 0.15, y: 2.0, w: 2.1, h: 0.3,
      fontSize: 12, color: C.accent, bold: true, fontFace: "Calibri",
    });
    s.addText(st.t, {
      x: x + 0.15, y: 2.4, w: 2.1, h: 0.4,
      fontSize: 18, bold: true, color: C.navy, fontFace: "Calibri",
    });
    s.addText(st.d, {
      x: x + 0.15, y: 2.95, w: 2.1, h: 1.1,
      fontSize: 12, color: C.muted, fontFace: "Calibri",
    });
  });
  s.addText("Personas: Analyst · Senior Reviewer · Admin · Executive (demo view)", {
    x: 0.5, y: 4.85, w: 12.3, h: 0.32,
    fontSize: 13, color: C.text, fontFace: "Calibri",
  });
  s.addText("Positioning: complements SIEM dual-run — does not replace the platform of record.", {
    x: 0.5, y: 5.3, w: 12.3, h: 0.32,
    fontSize: 12, color: C.muted, fontFace: "Calibri",
  });
  s.addText("Evaluation focus: product surfaces, architecture, evaluation metrics — not personnel lists.", {
    x: 0.5, y: 5.75, w: 12.3, h: 0.32,
    fontSize: 12, color: C.muted, fontFace: "Calibri",
  });
  footer(s, 4);
}

// ─── 5–9 Architecture posters ────────────────────────────────
[
  ["12_architecture.png", "Detailed architecture", "Overall modular monolith · dual API · light poster", 5],
  ["15_data_flow.png", "Data-flow architecture", "Upload → job pipeline → HiTL → workspace → audit", 6],
  ["16_components.png", "Component architecture", "React pages · FastAPI routers · engines · data plane", 7],
  ["17_rag_pipeline.png", "Hybrid RAG architecture", "BM25 + vectors (RRF) · citation allow-list · grounding", 8],
  ["18_hitl_policy.png", "Human-in-the-Loop policy", "Severity & grounding gates · race-safe review · audit", 9],
].forEach(([file, title, sub, n]) => {
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, title, sub);
  addShot(s, file, 0.5, 1.15, 12.3, 5.7);
  footer(s, n);
});

// ─── 10 Layers ───────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Architecture layers", "React · FastAPI · MongoDB · LanceDB");
  const layers = [
    { t: "React SPA", d: "SOC console · Workspace · Settings · Compliance · Hunt · Audit" },
    { t: "FastAPI  (/api  +  /api/v1)", d: "Auth · Jobs · Pipeline · Review · Hunt · LLM · Audit · Export" },
    { t: "MongoDB  +  LanceDB", d: "Cases / users / audit chain  ·  Hybrid BM25 + dense vectors (RRF)" },
    { t: "External (optional)", d: "LLM providers  ·  AbuseIPDB / VT / TI  ·  Slack / email" },
  ];
  layers.forEach((L, i) => {
    const y = 1.25 + i * 1.3;
    card(s, 0.8, y, 11.7, 1.15);
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 0.8, y, w: 0.14, h: 1.15, fill: { color: C.accent }, rectRadius: 0.04,
    });
    s.addText(L.t, {
      x: 1.2, y: y + 0.18, w: 11, h: 0.35,
      fontSize: 15, bold: true, color: C.navy, fontFace: "Calibri",
    });
    s.addText(L.d, {
      x: 1.2, y: y + 0.58, w: 11, h: 0.4,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 10);
}

// ─── 11 AI / RAG ─────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "AI & RAG design", "Grounded playbooks with measurable offline gates");
  const items = [
    { t: "Hybrid retrieval", d: "BM25 + LanceDB dense vectors fused with RRF; optional re-rank" },
    { t: "Citation grounding", d: "Playbook citation_ids ⊆ KB allow-list; grounding score 0–1" },
    { t: "Structured JSON", d: "NIST-style phases; resilient parse for noisy LLM output" },
    { t: "Multi-provider LLM", d: "Free/paid catalog; cross-provider fallback; template last resort" },
    { t: "HiTL gates", d: "Critical severity or low grounding → pending_review" },
    { t: "Honest framing", d: "Modular agentic stages — not a full LangGraph swarm product" },
  ];
  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.4;
    const y = 1.25 + row * 1.8;
    card(s, x, y, 6.15, 1.6);
    s.addText(it.t, {
      x: x + 0.25, y: y + 0.25, w: 5.6, h: 0.35,
      fontSize: 14, bold: true, color: C.accent, fontFace: "Calibri",
    });
    s.addText(it.d, {
      x: x + 0.25, y: y + 0.7, w: 5.6, h: 0.7,
      fontSize: 12, color: C.muted, fontFace: "Calibri",
      wrap: true, valign: "top",
    });
  });
  footer(s, 11);
}

// ─── 12 Login + Dashboard ────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Login & Dashboard", "Honest health probe · live KPIs after auth");
  addShot(s, "01_login.png", 0.4, 1.2, 6.2, 5.55);
  addShot(s, "02_dashboard.png", 6.8, 1.2, 6.15, 5.55);
  footer(s, 12);
}

// ─── 13 Upload + Incidents ───────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Ingest & incidents", "Job queue intake · case inventory");
  addShot(s, "03_upload.png", 0.4, 1.2, 6.2, 5.55);
  addShot(s, "04_incidents.png", 6.8, 1.2, 6.15, 5.55);
  footer(s, 13);
}

// ─── 14 Workspace ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Investigation workspace", "System of record for a single case");
  addShot(s, "05_workspace.png", 0.4, 1.15, 8.5, 5.65);
  card(s, 9.15, 1.15, 3.75, 5.65);
  s.addText("Workspace tabs", {
    x: 9.4, y: 1.4, w: 3.3, h: 0.35,
    fontSize: 14, bold: true, color: C.accent, fontFace: "Calibri",
  });
  ["Case", "Evidence", "Timeline", "Graph", "TI", "MITRE", "Notes", "Playbooks", "RCA", "AI"].forEach((t, i) => {
    s.addText("▸  " + t, {
      x: 9.4, y: 1.9 + i * 0.42, w: 3.3, h: 0.38,
      fontSize: 12, color: C.text, fontFace: "Calibri",
      valign: "middle", wrap: false,
    });
  });
  footer(s, 14);
}

// ─── 15 Graph + Playbook ─────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Entity graph & IR playbook", "Relationships · citations · grounding");
  addShot(s, "06_graph.png", 0.4, 1.2, 6.2, 5.55);
  addShot(s, "07_playbook.png", 6.8, 1.2, 6.15, 5.55);
  footer(s, 15);
}

// ─── 16 HiTL Review ──────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Human-in-the-Loop review", "Race-safe approve / reject · audit write");
  addShot(s, "08_review.png", 0.5, 1.15, 12.3, 5.7);
  footer(s, 16);
}

// ─── 17 Hunt + Compliance ───────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Hunt & compliance", "Case hunt honesty · alignment score (not cert)");
  addShot(s, "09_hunt.png", 0.4, 1.2, 6.2, 5.55);
  addShot(s, "10_compliance.png", 6.8, 1.2, 6.15, 5.55);
  footer(s, 17);
}

// ─── 18 Audit + Knowledge ────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Audit & knowledge", "Server-paged audit · hash / hybrid embedders");
  addShot(s, "13_audit.png", 0.4, 1.2, 6.2, 5.55);
  addShot(s, "14_golden.png", 6.8, 1.2, 6.15, 5.55);
  footer(s, 18);
}

// ─── 19 Settings LLM ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Settings — multi-provider LLM", "Vaulted secrets · fallback · offline templates");
  addShot(s, "11_settings_llm.png", 0.5, 1.15, 12.3, 5.7);
  footer(s, 19);
}

// ─── 20 Security ─────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Security & governance", "Pilot controls with honest compliance language");
  const secs = [
    { t: "RBAC", d: "analyst · senior_reviewer · admin matrix on mutate paths" },
    { t: "Sessions", d: "Cookie JWT · lockout after failures · weak secret refused outside lab" },
    { t: "Vault", d: "API keys encrypt-at-rest; never returned raw from Settings" },
    { t: "Audit chain", d: "SHA-256 integrity · summary & export for executives" },
    { t: "Compliance", d: "Alignment score + gaps + evidence — not certification" },
    { t: "Ingest safety", d: "ZIP bomb limits · pipeline isolation on bad files" },
  ];
  secs.forEach((it, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 0.45 + col * 4.25;
    const y = 1.25 + row * 2.7;
    card(s, x, y, 4.05, 2.5);
    s.addText(it.t, {
      x: x + 0.25, y: y + 0.4, w: 3.55, h: 0.4,
      fontSize: 16, bold: true, color: C.accent, fontFace: "Calibri",
    });
    s.addText(it.d, {
      x: x + 0.25, y: y + 0.95, w: 3.55, h: 1.25,
      fontSize: 12, color: C.muted, fontFace: "Calibri",
      wrap: true, valign: "top",
    });
  });
  footer(s, 20);
}

// ─── 21 Testing ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Testing & evaluation", "Golden offline IR suite — 27 July 2026");
  s.addTable(
    [
      [
        { text: "Metric", options: { bold: true, color: C.white, fill: { color: C.accent } } },
        { text: "Threshold", options: { bold: true, color: C.white, fill: { color: C.accent } } },
        { text: "Result", options: { bold: true, color: C.white, fill: { color: C.accent } } },
        { text: "Status", options: { bold: true, color: C.white, fill: { color: C.accent } } },
      ],
      ["Golden cases", "≥ 30", "37", "PASS"],
      ["Mean IoC F1", "≥ 0.85", "0.982", "PASS"],
      ["Mean technique recall", "≥ 0.80", "0.930", "PASS"],
      ["Mean grounding", "≥ 0.50", "1.000", "PASS"],
      ["Full phase coverage", "100%", "100%", "PASS"],
      ["Mean latency (offline)", "≤ 7 s", "< 0.01 s", "PASS"],
      ["Formal pack (66 tests)", "0 fail", "66 / 66", "PASS"],
    ],
    {
      x: 0.5, y: 1.25, w: 12.3, h: 4.7,
      colW: [4.0, 2.5, 3.0, 2.8],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: "Calibri",
      fontSize: 12,
      color: C.text,
      align: "center",
      valign: "middle",
      fill: { color: C.white },
    }
  );
  s.addText("Also covered: unit · RBAC · pipeline isolation · trust honesty surfaces. Live LLM quality is not gated offline.", {
    x: 0.5, y: 6.2, w: 12.3, h: 0.55,
    fontSize: 11, color: C.muted, fontFace: "Calibri", wrap: true,
  });
  footer(s, 21);
}

// ─── 22 Demo path ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Demo path (≈6 min)", "Full product tour with Indian-English voiceover");
  const pathSteps = [
    { n: "1", t: "Login", d: "Auth" },
    { n: "2", t: "Ingest", d: "Upload" },
    { n: "3", t: "Case", d: "Workspace" },
    { n: "4", t: "Playbook", d: "Grounding" },
    { n: "5", t: "HiTL", d: "Review" },
    { n: "6", t: "Hunt", d: "Trust" },
    { n: "7", t: "Govern", d: "Audit+" },
  ];
  pathSteps.forEach((st, i) => {
    const x = 0.4 + i * 1.85;
    card(s, x, 1.3, 1.75, 2.35);
    s.addText(st.n, {
      x: x + 0.1, y: 1.5, w: 1.55, h: 0.4,
      fontSize: 16, bold: true, color: C.accent, align: "center", fontFace: "Calibri",
    });
    s.addText(st.t, {
      x: x + 0.1, y: 2.1, w: 1.55, h: 0.4,
      fontSize: 13, bold: true, color: C.navy, align: "center", fontFace: "Calibri",
    });
    s.addText(st.d, {
      x: x + 0.1, y: 2.6, w: 1.55, h: 0.55,
      fontSize: 12, color: C.muted, align: "center", fontFace: "Calibri",
    });
  });
  addShot(s, "02_dashboard.png", 0.4, 3.9, 4.0, 2.75);
  addShot(s, "05_workspace.png", 4.65, 3.9, 4.0, 2.75);
  addShot(s, "09_hunt.png", 8.9, 3.9, 4.0, 2.75);
  footer(s, 22);
}

// ─── 23 Results ──────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Results & impact", "Capstone fit + pilot readiness");
  const kpis = [
    { v: "78", u: "/100", l: "Enterprise board\nPilot Ready" },
    { v: "0.98", u: "F1", l: "Mean IoC F1\ngolden offline" },
    { v: "0.93", u: "R", l: "Technique recall\ngolden offline" },
    { v: "37", u: "cases", l: "Golden dataset\nCI gated" },
  ];
  kpis.forEach((k, i) => {
    const x = 0.5 + i * 3.2;
    card(s, x, 1.25, 3.0, 2.7);
    s.addText(k.v, {
      x: x + 0.15, y: 1.5, w: 2.7, h: 0.65,
      fontSize: 32, bold: true, color: C.accent, align: "center", fontFace: "Calibri",
    });
    s.addText(k.u, {
      x: x + 0.15, y: 2.2, w: 2.7, h: 0.3,
      fontSize: 13, color: C.muted, align: "center", fontFace: "Calibri",
    });
    s.addText(k.l, {
      x: x + 0.2, y: 2.7, w: 2.6, h: 0.9,
      fontSize: 12, color: C.text, align: "center", fontFace: "Calibri",
    });
  });
  card(s, 0.5, 4.25, 12.3, 2.45);
  s.addText("Impact narrative", {
    x: 0.8, y: 4.5, w: 11.7, h: 0.35,
    fontSize: 14, bold: true, color: C.green, fontFace: "Calibri",
  });
  s.addText(
    "Faster time-to-first playbook vs pure manual IR · Traceable citations · Reproducible offline eval · " +
    "React workspace exceeds Gradio baseline · Wave C compliance + audit export for executives · " +
    "Trust honesty surfaces on Hunt, Compliance, Audit, Analytics, and Knowledge",
    {
      x: 0.8, y: 5.0, w: 11.7, h: 1.35,
      fontSize: 12, color: C.text, fontFace: "Calibri",
      wrap: true, valign: "top",
    }
  );
  footer(s, 23);
}

// ─── 24 Challenges ───────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Challenges & mitigations", "Mapped to Final Capstone challenge list");
  s.addTable(
    [
      [
        { text: "Challenge", options: { bold: true, color: C.white, fill: { color: C.accent } } },
        { text: "Mitigation", options: { bold: true, color: C.white, fill: { color: C.accent } } },
      ],
      ["Log volume", "Jobs + ZIP limits (not real-time SIEM)"],
      ["Correlation accuracy", "Heuristic ATT&CK + HiTL + timeline"],
      ["False positives", "Grounding score + review queue"],
      ["TI cost / keys", "Mock default + multi-vendor vault"],
      ["Hallucination risk", "Citations allow-list + templates"],
      ["HiTL coordination", "Queue · claim · audit trail"],
    ],
    {
      x: 0.5, y: 1.25, w: 12.3, h: 5.4,
      colW: [4.0, 8.3],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: "Calibri",
      fontSize: 12,
      color: C.text,
      valign: "middle",
      fill: { color: C.white },
    }
  );
  footer(s, 24);
}

// ─── 25 Future ───────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Future work", "From pilot to production path");
  const horiz = [
    { t: "Next sprint", items: ["Connector pilots", "Analytics polish", "E2E expansion"] },
    { t: "Next release", items: ["SSO JWKS hardening", "API rate limits", "SIEM dual-run packs"] },
    { t: "v2.0", items: ["Multi-tenant design", "SIEM connectors", "Commercial pilot"] },
    { t: "v3.0", items: ["Gated SOAR actions", "Forensics agent", "RAGAS board metrics"] },
  ];
  horiz.forEach((h, i) => {
    const x = 0.45 + i * 3.2;
    card(s, x, 1.3, 3.05, 5.4);
    s.addText(h.t, {
      x: x + 0.2, y: 1.6, w: 2.65, h: 0.45,
      fontSize: 15, bold: true, color: C.accent, fontFace: "Calibri",
    });
    h.items.forEach((it, j) => {
      s.addText("▸  " + it, {
        x: x + 0.2, y: 2.5 + j * 1.0, w: 2.65, h: 0.8,
        fontSize: 13, color: C.text, fontFace: "Calibri",
      });
    });
  });
  footer(s, 25);
}

// ─── 26 Architecture recap ───────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Architecture recap", "Overall · data-flow · components · RAG · HiTL");
  addShot(s, "12_architecture.png", 0.35, 1.2, 4.1, 2.65);
  addShot(s, "15_data_flow.png", 4.6, 1.2, 4.1, 2.65);
  addShot(s, "16_components.png", 8.85, 1.2, 4.1, 2.65);
  addShot(s, "17_rag_pipeline.png", 2.4, 4.15, 4.1, 2.55);
  addShot(s, "18_hitl_policy.png", 6.8, 4.15, 4.1, 2.55);
  footer(s, 26);
}

// ─── 27 Product gallery ──────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Product gallery", "Additional surfaces in the Final Capstone pack");
  addShot(s, "03_upload.png", 0.35, 1.2, 4.1, 2.65);
  addShot(s, "04_incidents.png", 4.6, 1.2, 4.1, 2.65);
  addShot(s, "08_review.png", 8.85, 1.2, 4.1, 2.65);
  addShot(s, "10_compliance.png", 2.4, 4.15, 4.1, 2.55);
  addShot(s, "11_settings_llm.png", 6.8, 4.15, 4.1, 2.55);
  footer(s, 27);
}

// ─── 28 Deliverables ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Final deliverables", "docs/capstone/FINAL_DELIVERABLES/");
  const items = [
    { t: "Project report PDF", d: "Chapters + architecture A–E + figure narrations + appendices A–F" },
    { t: "Viva presentation", d: "30 slides · architecture + full UI surface coverage" },
    { t: "Demo video + voice", d: "Full product tour · Indian English voiceover (Neerja)" },
    { t: "Screenshots & figures", d: "Light-theme UI 01–18 · SVG/PNG architecture posters" },
  ];
  items.forEach((it, i) => {
    const y = 1.3 + i * 1.3;
    card(s, 0.6, y, 12.1, 1.15);
    s.addText(it.t, {
      x: 0.95, y: y + 0.2, w: 11.4, h: 0.35,
      fontSize: 15, bold: true, color: C.navy, fontFace: "Calibri",
    });
    s.addText(it.d, {
      x: 0.95, y: y + 0.6, w: 11.4, h: 0.35,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 28);
}

// ─── 29 Conclusion ───────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Conclusion", "Final Capstone Project objectives met — and exceeded");
  const bullets = [
    "End-to-end AI IR advisor: ingest → enrich → ATT&CK → grounded playbook → HiTL → workspace",
    "Exceeds Gradio baseline with React SOC UI, compliance alignment, audit integrity, golden CI",
    "Strong offline metrics (IoC F1 0.98, technique recall 0.93) with honest evaluation limits",
    "Enterprise Pilot Ready at 78/100 — not multi-tenant SIEM/XDR replacement",
    "Ethical stance: advisory AI with human accountability for high-risk actions",
  ];
  bullets.forEach((b, i) => {
    const y = 1.2 + i * 1.08;
    card(s, 0.5, y, 12.3, 0.98);
    s.addText((i + 1) + ".  " + b, {
      x: 0.75, y: y + 0.14, w: 11.8, h: 0.72,
      fontSize: 12, color: C.text, fontFace: "Calibri",
      valign: "middle", wrap: true, shrinkText: true,
    });
  });
  footer(s, 29);
}

// ─── 30 Q&A ──────────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: C.accent },
  });
  s.addText("Thank you", {
    x: 0.7, y: 2.0, w: 12, h: 0.65,
    fontSize: 40, bold: true, color: C.navy, fontFace: "Calibri",
  });
  s.addText("Questions & discussion", {
    x: 0.7, y: 2.8, w: 12, h: 0.45,
    fontSize: 22, color: C.accent, fontFace: "Calibri",
  });
  s.addText(
    "Final Capstone Project pack: docs/capstone/FINAL_DELIVERABLES/\n" +
    "Report PDF · Presentation · Demo video (Indian-English voiceover)\n" +
    "Architecture figures A–E · Light-theme screenshots · Appendices A–F",
    {
      x: 0.7, y: 3.8, w: 11.5, h: 1.5,
      fontSize: 14, color: C.muted, fontFace: "Calibri",
    }
  );
  footer(s, 30);
}

pptx.writeFile({ fileName: outPath }).then(() => {
  console.log("Wrote", outPath, `(${TOTAL} slides)`);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
