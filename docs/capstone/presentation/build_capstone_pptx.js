/**
 * ACTIRA Capstone viva deck — Project 4 submission (light enterprise theme).
 * Run: node docs/capstone/presentation/build_capstone_pptx.js
 * Output: docs/capstone/presentation/ACTIRA_Capstone_Presentation.pptx
 *
 * Screenshots: docs/capstone/assets/screenshots/*.png (light theme captures)
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

// Light enterprise palette (matches UI + report figures)
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
  headerBar: "0F172A",
};

const TOTAL = 20;

const pptx = new PptxGenJS();
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE";
pptx.author = "ACTIRA Capstone Team";
pptx.title = "ACTIRA — Capstone Project 4";
pptx.subject = "Agentic Cybersecurity Threat Intelligence & Incident Response Advisor";

function bg(slide) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 13.333, h: 7.5,
    fill: { color: C.bg },
  });
}

function footer(slide, n, total = TOTAL) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 7.15, w: 13.333, h: 0.35,
    fill: { color: C.white },
  });
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 7.15, w: 13.333, h: 0.015,
    fill: { color: C.border },
  });
  slide.addText("ACTIRA  ·  Capstone Project 4  ·  Confidential for evaluation", {
    x: 0.4, y: 7.18, w: 10, h: 0.28,
    fontSize: 10, color: C.muted, fontFace: "Calibri",
  });
  slide.addText(`${n} / ${total}`, {
    x: 11.5, y: 7.18, w: 1.5, h: 0.28,
    fontSize: 10, color: C.muted, fontFace: "Calibri", align: "right",
  });
}

function titleBar(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.5, y: 0.28, w: 12.3, h: 0.42,
    fontSize: 24, bold: true, color: C.navy, fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.7, w: 12.3, h: 0.3,
      fontSize: 13, color: C.accent, fontFace: "Calibri",
    });
  }
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 1.08, w: 2.0, h: 0.045,
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
      x, y: y + h / 2 - 0.2, w, h: 0.4,
      fontSize: 12, color: C.muted, align: "center", fontFace: "Calibri",
    });
    return;
  }
  // Light frame
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x: x - 0.04, y: y - 0.04, w: w + 0.08, h: h + 0.08,
    fill: { color: C.white },
    line: { color: C.border, width: 1 },
    rectRadius: 0.06,
  });
  slide.addImage({
    path: p,
    x, y, w, h,
    sizing: { type: "contain", w, h },
  });
}

// ─── Slide 1 Title ───────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: C.accent },
  });
  s.addText("CAPSTONE PROJECT 4", {
    x: 0.7, y: 1.45, w: 11, h: 0.35,
    fontSize: 13, color: C.accent, bold: true, fontFace: "Calibri",
    charSpacing: 2,
  });
  s.addText("ACTIRA", {
    x: 0.7, y: 1.95, w: 12, h: 0.7,
    fontSize: 46, bold: true, color: C.navy, fontFace: "Calibri",
  });
  s.addText("Agentic Cybersecurity Threat Intelligence\n& Incident Response Advisor", {
    x: 0.7, y: 2.75, w: 11, h: 0.85,
    fontSize: 20, color: C.text, fontFace: "Calibri",
  });
  s.addText("Human-gated AI IR advisor  ·  Hybrid RAG  ·  Investigation workspace  ·  Offline golden eval", {
    x: 0.7, y: 3.85, w: 11.5, h: 0.35,
    fontSize: 13, color: C.muted, fontFace: "Calibri",
  });
  s.addText("Advanced Certification Programme in Agentic and Generative AI\nTalentSprint / IISc track  ·  26 July 2026  ·  Enterprise Pilot Ready (78/100)", {
    x: 0.7, y: 5.35, w: 11, h: 0.7,
    fontSize: 13, color: C.muted, fontFace: "Calibri",
  });
  footer(s, 1);
}

// ─── Slide 2 Problem ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "The problem", "SOC alert overload without grounded IR");
  const pains = [
    { t: "Alert overload", d: "SIEM / EDR / cloud sensors outpace manual triage" },
    { t: "Manual IR steps", d: "IoC extract → TI → ATT&CK → playbook is slow & inconsistent" },
    { t: "Chatbot risk", d: "Generic LLMs lack citations, audit trail, and formal human gates" },
    { t: "Cost of delay", d: "Inconsistent response quality under fatigue and time pressure" },
  ];
  pains.forEach((p, i) => {
    const x = 0.5 + (i % 2) * 6.3;
    const y = 1.45 + Math.floor(i / 2) * 2.45;
    card(s, x, y, 6.0, 2.2);
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.25, y: y + 0.4, w: 0.55, h: 0.55,
      fill: { color: C.accentSoft }, rectRadius: 0.08,
    });
    s.addText(String(i + 1), {
      x: x + 0.25, y: y + 0.48, w: 0.55, h: 0.4,
      fontSize: 16, bold: true, color: C.accent, align: "center", fontFace: "Calibri",
    });
    s.addText(p.t, {
      x: x + 1.0, y: y + 0.4, w: 4.7, h: 0.45,
      fontSize: 17, bold: true, color: C.navy, fontFace: "Calibri",
    });
    s.addText(p.d, {
      x: x + 1.0, y: y + 1.0, w: 4.7, h: 0.85,
      fontSize: 14, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 2);
}

// ─── Slide 3 Objectives ──────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Objectives & non-goals", "Clear scope for evaluators");
  card(s, 0.5, 1.4, 6.2, 5.25);
  s.addText("OBJECTIVES", {
    x: 0.75, y: 1.6, w: 5.7, h: 0.35,
    fontSize: 12, bold: true, color: C.green, fontFace: "Calibri", charSpacing: 1,
  });
  [
    "Automate parse → IoC → TI → ATT&CK → RAG playbook",
    "Human-in-the-loop for critical / low-grounding cases",
    "Investigation workspace as case system of record",
    "Offline golden IR evaluation (CI gates)",
    "RBAC, vault, audit integrity, compliance alignment",
  ].forEach((t, i) => {
    s.addText("▸  " + t, {
      x: 0.85, y: 2.15 + i * 0.75, w: 5.5, h: 0.65,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  card(s, 6.95, 1.4, 5.9, 5.25);
  s.addText("NON-GOALS", {
    x: 7.2, y: 1.6, w: 5.4, h: 0.35,
    fontSize: 12, bold: true, color: C.amber, fontFace: "Calibri", charSpacing: 1,
  });
  [
    "Not a Sentinel / Splunk / Falcon replacement",
    "Not multi-tenant SaaS isolation (v1)",
    "Not unsupervised SOAR execution",
    "Not formal ISO/SOC2 certification",
    "Not 500-user scale certification",
  ].forEach((t, i) => {
    s.addText("▸  " + t, {
      x: 7.3, y: 2.15 + i * 0.75, w: 5.3, h: 0.65,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  footer(s, 3);
}

// ─── Slide 4 Solution ────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Solution overview", "Human-gated AI IR advisor");
  s.addText("Upload logs → parse → IoC → TI → ATT&CK → hybrid RAG → playbook → HiTL → workspace → audit", {
    x: 0.5, y: 1.35, w: 12.3, h: 0.38,
    fontSize: 13, color: C.accent, fontFace: "Calibri",
  });
  const steps = [
    { n: "01", t: "Ingest", d: "Multi-format\nZIP + jobs" },
    { n: "02", t: "Enrich", d: "IoC + TI\nlive/mock" },
    { n: "03", t: "Map", d: "ATT&CK\nheuristics" },
    { n: "04", t: "Advise", d: "RAG\nplaybooks" },
    { n: "05", t: "Govern", d: "HiTL +\naudit" },
  ];
  steps.forEach((st, i) => {
    const x = 0.5 + i * 2.55;
    card(s, x, 2.0, 2.4, 2.9);
    s.addText(st.n, {
      x: x + 0.15, y: 2.2, w: 2.1, h: 0.35,
      fontSize: 12, color: C.accent, bold: true, fontFace: "Calibri",
    });
    s.addText(st.t, {
      x: x + 0.15, y: 2.7, w: 2.1, h: 0.45,
      fontSize: 20, bold: true, color: C.navy, fontFace: "Calibri",
    });
    s.addText(st.d, {
      x: x + 0.15, y: 3.35, w: 2.1, h: 1.1,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  s.addText("Personas: Analyst  ·  Senior Reviewer  ·  Admin  ·  Executive (demo)", {
    x: 0.5, y: 5.25, w: 12.3, h: 0.35,
    fontSize: 14, color: C.text, fontFace: "Calibri",
  });
  s.addText("Positioning: complements SIEM dual-run — does not replace the platform of record.", {
    x: 0.5, y: 5.7, w: 12.3, h: 0.35,
    fontSize: 13, color: C.muted, fontFace: "Calibri",
  });
  footer(s, 4);
}

// ─── Slide 5 Architecture (figure) ───────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Architecture", "Modular monolith · dual API · light enterprise UI");
  addShot(s, "12_architecture.png", 0.55, 1.35, 12.2, 5.45);
  footer(s, 5);
}

// ─── Slide 6 Architecture layers ─────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Architecture layers", "React · FastAPI · MongoDB · LanceDB");
  const layers = [
    { t: "React SPA", d: "SOC console · Workspace · Settings · Compliance" },
    { t: "FastAPI  (/api  +  /api/v1)", d: "Auth · Jobs · Pipeline · Review · Hunt · LLM · Audit" },
    { t: "MongoDB  +  LanceDB", d: "Cases / users / audit  ·  Hybrid BM25 + vectors (RRF)" },
    { t: "External (optional)", d: "LLM providers  ·  AbuseIPDB / VT / TI  ·  Slack" },
  ];
  layers.forEach((L, i) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.5, y: 1.45 + i * 1.25, w: 10.3, h: 1.05,
      fill: { color: C.card },
      line: { color: C.border, width: 1 },
      rectRadius: 0.08,
    });
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.5, y: 1.45 + i * 1.25, w: 0.14, h: 1.05,
      fill: { color: C.accent }, rectRadius: 0.04,
    });
    s.addText(L.t, {
      x: 1.95, y: 1.55 + i * 1.25, w: 9.5, h: 0.4,
      fontSize: 16, bold: true, color: C.navy, fontFace: "Calibri",
    });
    s.addText(L.d, {
      x: 1.95, y: 1.98 + i * 1.25, w: 9.5, h: 0.35,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 6);
}

// ─── Slide 7 AI / RAG ────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "AI & RAG design", "Grounded playbooks with measurable offline gates");
  const items = [
    { t: "Hybrid retrieval", d: "BM25 + LanceDB dense vectors fused with RRF; optional re-rank" },
    { t: "Citation grounding", d: "Playbook citation_ids ⊆ KB allow-list; grounding score 0–1" },
    { t: "Structured JSON", d: "NIST-style phases; resilient parse_llm_json for noisy LLM output" },
    { t: "Multi-provider LLM", d: "Free/paid catalog; cross-provider fallback; template last resort" },
    { t: "HiTL gates", d: "Critical severity or low grounding → pending_review" },
    { t: "Honest framing", d: "Modular agentic pipeline stages — not a full LangGraph swarm product" },
  ];
  items.forEach((it, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.5 + col * 6.4;
    const y = 1.4 + row * 1.75;
    card(s, x, y, 6.15, 1.55);
    s.addText(it.t, {
      x: x + 0.3, y: y + 0.25, w: 5.5, h: 0.4,
      fontSize: 15, bold: true, color: C.accent, fontFace: "Calibri",
    });
    s.addText(it.d, {
      x: x + 0.3, y: y + 0.7, w: 5.5, h: 0.6,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 7);
}

// ─── Slide 8 TI & ATT&CK ─────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Threat intelligence & ATT&CK", "Enrichment + technique mapping");
  card(s, 0.5, 1.45, 6.0, 5.2);
  s.addText("IoC & TI", {
    x: 0.8, y: 1.7, w: 5.4, h: 0.4,
    fontSize: 17, bold: true, color: C.navy, fontFace: "Calibri",
  });
  [
    "Extract IP / domain / URL / hash",
    "Filter private IPs from public enrich",
    "Live: AbuseIPDB, VT, GreyNoise, …",
    "Mock default without keys (demo-safe)",
    "FORCE_MOCK_TI for deterministic tests",
  ].forEach((t, i) => {
    s.addText("●  " + t, {
      x: 0.9, y: 2.35 + i * 0.7, w: 5.3, h: 0.55,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  card(s, 6.8, 1.45, 6.0, 5.2);
  s.addText("MITRE ATT&CK", {
    x: 7.1, y: 1.7, w: 5.4, h: 0.4,
    fontSize: 17, bold: true, color: C.navy, fontFace: "Calibri",
  });
  [
    "Heuristic keyword / pattern mapping",
    "Technique filters on incident list",
    "Dashboard heatmap of prevalence",
    "Timeline + RCA for kill-chain narrative",
    "Not full STIX/TAXII enterprise sync",
  ].forEach((t, i) => {
    s.addText("●  " + t, {
      x: 7.2, y: 2.35 + i * 0.7, w: 5.3, h: 0.55,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  footer(s, 8);
}

// ─── Slide 9 Workspace (screenshot) ──────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Investigation workspace", "System of record for a single case");
  addShot(s, "05_workspace.png", 0.5, 1.3, 8.4, 5.5);
  card(s, 9.15, 1.3, 3.7, 5.5);
  s.addText("Workspace tabs", {
    x: 9.4, y: 1.55, w: 3.2, h: 0.35,
    fontSize: 14, bold: true, color: C.accent, fontFace: "Calibri",
  });
  ["Case", "Evidence", "Timeline", "Graph", "TI", "MITRE", "Notes", "Playbooks", "RCA", "AI"].forEach((t, i) => {
    s.addText("▸  " + t, {
      x: 9.4, y: 2.05 + i * 0.4, w: 3.2, h: 0.38,
      fontSize: 13, color: C.text, fontFace: "Calibri",
    });
  });
  footer(s, 9);
}

// ─── Slide 10 Playbook + HiTL (screenshots) ──────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Playbook & Human-in-the-Loop", "Citations, grounding, formal review");
  addShot(s, "07_playbook.png", 0.4, 1.3, 6.15, 5.5);
  addShot(s, "08_review.png", 6.75, 1.3, 6.15, 5.5);
  footer(s, 10);
}

// ─── Slide 11 Security ───────────────────────────────────────
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
    const x = 0.5 + col * 4.2;
    const y = 1.4 + row * 2.55;
    card(s, x, y, 4.0, 2.35);
    s.addText(it.t, {
      x: x + 0.25, y: y + 0.4, w: 3.5, h: 0.45,
      fontSize: 17, bold: true, color: C.accent, fontFace: "Calibri",
    });
    s.addText(it.d, {
      x: x + 0.25, y: y + 1.05, w: 3.5, h: 0.95,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 11);
}

// ─── Slide 12 Compliance screenshot ──────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Compliance alignment", "Product readiness score — not formal certification");
  addShot(s, "10_compliance.png", 0.5, 1.3, 12.3, 5.5);
  footer(s, 12);
}

// ─── Slide 13 Testing ────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Testing & evaluation", "Golden offline IR suite — 26 July 2026");
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
      ["Case errors / gate failures", "0", "0 / []", "PASS"],
    ],
    {
      x: 0.5, y: 1.35, w: 12.3, h: 4.5,
      colW: [4.0, 2.5, 3.0, 2.8],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: "Calibri",
      fontSize: 13,
      color: C.text,
      align: "center",
      valign: "middle",
      fill: { color: C.white },
    }
  );
  s.addText("Also: unit · RBAC · pipeline isolation · Playwright smoke  ·  Live LLM quality not gated offline (honest limit)", {
    x: 0.5, y: 6.15, w: 12.3, h: 0.35,
    fontSize: 12, color: C.muted, fontFace: "Calibri",
  });
  footer(s, 13);
}

// ─── Slide 14 Demo path ──────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "5-minute demo path", "Live path — see DEMO_SCRIPT.md");
  const pathSteps = [
    { n: "1", t: "Login", d: "Roles" },
    { n: "2", t: "Ingest", d: "Sample logs" },
    { n: "3", t: "Incident", d: "Workspace" },
    { n: "4", t: "Evidence", d: "Timeline" },
    { n: "5", t: "Playbook", d: "Grounding" },
    { n: "6", t: "HiTL", d: "Approve" },
    { n: "7", t: "Govern", d: "Audit" },
  ];
  pathSteps.forEach((st, i) => {
    const x = 0.4 + i * 1.85;
    card(s, x, 1.55, 1.75, 2.6);
    s.addShape(pptx.shapes.OVAL, {
      x: x + 0.55, y: 1.8, w: 0.65, h: 0.65,
      fill: { color: C.accentSoft },
    });
    s.addText(st.n, {
      x: x + 0.55, y: 1.9, w: 0.65, h: 0.5,
      fontSize: 16, bold: true, color: C.accent, align: "center", fontFace: "Calibri",
    });
    s.addText(st.t, {
      x: x + 0.1, y: 2.65, w: 1.55, h: 0.4,
      fontSize: 13, bold: true, color: C.navy, align: "center", fontFace: "Calibri",
    });
    s.addText(st.d, {
      x: x + 0.1, y: 3.15, w: 1.55, h: 0.55,
      fontSize: 12, color: C.muted, align: "center", fontFace: "Calibri",
    });
  });
  // Mini gallery
  addShot(s, "02_dashboard.png", 0.5, 4.45, 4.0, 2.35);
  addShot(s, "04_incidents.png", 4.7, 4.45, 4.0, 2.35);
  addShot(s, "09_hunt.png", 8.9, 4.45, 4.0, 2.35);
  footer(s, 14);
}

// ─── Slide 15 Dashboard + Settings ───────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Product UI (light theme)", "Dashboard KPIs · multi-provider LLM settings");
  addShot(s, "02_dashboard.png", 0.4, 1.3, 6.15, 5.5);
  addShot(s, "11_settings_llm.png", 6.75, 1.3, 6.15, 5.5);
  footer(s, 15);
}

// ─── Slide 16 Results ────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Results & impact", "Capstone fit + pilot readiness");
  const kpis = [
    { v: "78", u: "/100", l: "Enterprise board score\nPilot Ready" },
    { v: "0.98", u: "F1", l: "Mean IoC F1\ngolden offline" },
    { v: "0.93", u: "R", l: "Technique recall\ngolden offline" },
    { v: "37", u: "cases", l: "Golden dataset\nCI gated" },
  ];
  kpis.forEach((k, i) => {
    const x = 0.5 + i * 3.2;
    card(s, x, 1.45, 3.0, 2.85);
    s.addText(k.v, {
      x: x + 0.15, y: 1.75, w: 2.7, h: 0.7,
      fontSize: 34, bold: true, color: C.accent, align: "center", fontFace: "Calibri",
    });
    s.addText(k.u, {
      x: x + 0.15, y: 2.45, w: 2.7, h: 0.35,
      fontSize: 14, color: C.muted, align: "center", fontFace: "Calibri",
    });
    s.addText(k.l, {
      x: x + 0.2, y: 3.05, w: 2.6, h: 0.85,
      fontSize: 13, color: C.text, align: "center", fontFace: "Calibri",
    });
  });
  card(s, 0.5, 4.55, 12.3, 1.95);
  s.addText("Impact narrative", {
    x: 0.8, y: 4.75, w: 11.7, h: 0.35,
    fontSize: 14, bold: true, color: C.green, fontFace: "Calibri",
  });
  s.addText("Faster time-to-first playbook vs pure manual IR  ·  Traceable citations  ·  Reproducible offline eval  ·  React workspace exceeds Gradio baseline  ·  Wave C compliance + audit export for executives", {
    x: 0.8, y: 5.25, w: 11.7, h: 0.9,
    fontSize: 14, color: C.text, fontFace: "Calibri",
  });
  footer(s, 16);
}

// ─── Slide 17 Challenges ─────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Challenges & mitigations", "Mapped to Project 4 challenge list");
  const rows = [
    ["Log volume", "Jobs + ZIP limits (not real-time SIEM)"],
    ["Correlation accuracy", "Heuristic ATT&CK + HiTL + timeline"],
    ["False positives", "Grounding score + review queue"],
    ["TI cost / keys", "Mock default + multi-vendor vault"],
    ["Hallucination risk", "Citations allow-list + templates"],
    ["HiTL coordination", "Queue · claim · audit trail"],
  ];
  s.addTable(
    [
      [
        { text: "Challenge", options: { bold: true, color: C.white, fill: { color: C.accent } } },
        { text: "Mitigation", options: { bold: true, color: C.white, fill: { color: C.accent } } },
      ],
      ...rows,
    ],
    {
      x: 0.5, y: 1.4, w: 12.3, h: 5.25,
      colW: [4.0, 8.3],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: "Calibri",
      fontSize: 14,
      color: C.text,
      valign: "middle",
      fill: { color: C.white },
    }
  );
  footer(s, 17);
}

// ─── Slide 18 Future ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Future work", "From pilot to production path");
  const horiz = [
    { t: "Next sprint", items: ["Demo video polish", "Analytics error polish", "E2E expansion"] },
    { t: "Next release", items: ["SSO JWKS hardening", "API rate limits", "Connector pilots"] },
    { t: "v2.0", items: ["Multi-tenant design", "SIEM connectors", "Commercial pilot"] },
    { t: "v3.0", items: ["Gated SOAR actions", "Forensics agent", "RAGAS board metrics"] },
  ];
  horiz.forEach((h, i) => {
    const x = 0.45 + i * 3.2;
    card(s, x, 1.5, 3.05, 5.1);
    s.addText(h.t, {
      x: x + 0.2, y: 1.8, w: 2.65, h: 0.5,
      fontSize: 16, bold: true, color: C.accent, fontFace: "Calibri",
    });
    h.items.forEach((it, j) => {
      s.addText("▸  " + it, {
        x: x + 0.2, y: 2.7 + j * 0.95, w: 2.65, h: 0.8,
        fontSize: 13, color: C.text, fontFace: "Calibri",
      });
    });
  });
  footer(s, 18);
}

// ─── Slide 19 Conclusion ─────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Conclusion", "Project 4 objectives met — and exceeded");
  const bullets = [
    "End-to-end AI IR advisor: ingest → enrich → ATT&CK → grounded playbook → HiTL → workspace",
    "Exceeds Gradio baseline with React SOC UI, compliance alignment, audit integrity, golden CI",
    "Strong offline metrics (IoC F1 0.98, technique recall 0.93) with honest evaluation limits",
    "Enterprise Pilot Ready at 78/100 — not multi-tenant SIEM/XDR replacement",
    "Ethical stance: advisory AI with human accountability for high-risk actions",
  ];
  bullets.forEach((b, i) => {
    card(s, 0.5, 1.35 + i * 1.02, 12.3, 0.9);
    s.addText((i + 1) + ".  " + b, {
      x: 0.8, y: 1.5 + i * 1.02, w: 11.7, h: 0.6,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  footer(s, 19);
}

// ─── Slide 20 Q&A ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: C.accent },
  });
  s.addText("Thank you", {
    x: 0.7, y: 2.2, w: 12, h: 0.7,
    fontSize: 42, bold: true, color: C.navy, fontFace: "Calibri",
  });
  s.addText("Questions & discussion", {
    x: 0.7, y: 3.0, w: 12, h: 0.5,
    fontSize: 22, color: C.accent, fontFace: "Calibri",
  });
  s.addText("Pack: docs/capstone/  ·  Report PDF: PROJECT_REPORT.pdf  ·  Appendices: appendices/\nPPT: presentation/  ·  Board: board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md\nScreenshots: light-theme live captures (capture_screenshots.py)", {
    x: 0.7, y: 4.1, w: 11.5, h: 1.2,
    fontSize: 14, color: C.muted, fontFace: "Calibri",
  });
  footer(s, 20);
}

pptx.writeFile({ fileName: outPath }).then(() => {
  console.log("Wrote", outPath);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
