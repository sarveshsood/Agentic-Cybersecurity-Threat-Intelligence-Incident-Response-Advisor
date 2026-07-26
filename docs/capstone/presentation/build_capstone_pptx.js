/**
 * ACTIRA Capstone viva deck — Project 4 submission.
 * Run: node docs/capstone/presentation/build_capstone_pptx.js
 * Output: docs/capstone/presentation/ACTIRA_Capstone_Presentation.pptx
 */
const PptxGenJS = require("pptxgenjs");
const path = require("path");

// Output stays next to this script: docs/capstone/presentation/
const outPath = path.join(__dirname, "ACTIRA_Capstone_Presentation.pptx");

const C = {
  bg: "0B1220",
  card: "121A2B",
  cardAlt: "162033",
  border: "243044",
  text: "E8EEF7",
  muted: "94A3B8",
  accent: "38BDF8",
  accent2: "22D3EE",
  green: "34D399",
  amber: "FBBF24",
  red: "F87171",
  white: "FFFFFF",
  navy: "0F172A",
};

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

function footer(slide, n, total = 18) {
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 7.15, w: 13.333, h: 0.35,
    fill: { color: C.navy },
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
    x: 0.5, y: 0.28, w: 12.3, h: 0.45,
    fontSize: 26, bold: true, color: C.white, fontFace: "Calibri",
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.72, w: 12.3, h: 0.32,
      fontSize: 13, color: C.accent, fontFace: "Calibri",
    });
  }
  slide.addShape(pptx.shapes.RECTANGLE, {
    x: 0.5, y: 1.1, w: 2.2, h: 0.05,
    fill: { color: C.accent },
  });
}

function card(slide, x, y, w, h) {
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h,
    fill: { color: C.card },
    shadow: { type: "outer", color: "000000", blur: 8, opacity: 0.25, offset: 2 },
    rectRadius: 0.08,
  });
}

// ─── Slide 1 Title ───────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.accent },
  });
  s.addText("CAPSTONE PROJECT 4", {
    x: 0.7, y: 1.5, w: 11, h: 0.35,
    fontSize: 14, color: C.accent, bold: true, fontFace: "Calibri",
    charSpacing: 3,
  });
  s.addText("ACTIRA", {
    x: 0.7, y: 2.0, w: 12, h: 0.7,
    fontSize: 48, bold: true, color: C.white, fontFace: "Calibri",
  });
  s.addText("Agentic Cybersecurity Threat Intelligence\n& Incident Response Advisor", {
    x: 0.7, y: 2.75, w: 11, h: 0.9,
    fontSize: 22, color: C.text, fontFace: "Calibri",
  });
  s.addText("Human-gated AI IR advisor  ·  Hybrid RAG  ·  Investigation workspace  ·  Offline golden eval", {
    x: 0.7, y: 3.9, w: 11.5, h: 0.35,
    fontSize: 13, color: C.muted, fontFace: "Calibri",
  });
  s.addText("Advanced Certification Programme in Agentic and Generative AI\nTalentSprint / IISc track  ·  26 July 2026  ·  Enterprise Pilot Ready (78/100)", {
    x: 0.7, y: 5.5, w: 11, h: 0.7,
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
    const y = 1.5 + Math.floor(i / 2) * 2.4;
    card(s, x, y, 6.0, 2.15);
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.25, y: y + 0.35, w: 0.55, h: 0.55,
      fill: { color: "1E3A5F" }, rectRadius: 0.08,
    });
    s.addText(String(i + 1), {
      x: x + 0.25, y: y + 0.42, w: 0.55, h: 0.4,
      fontSize: 16, bold: true, color: C.accent, align: "center", fontFace: "Calibri",
    });
    s.addText(p.t, {
      x: x + 1.0, y: y + 0.35, w: 4.7, h: 0.45,
      fontSize: 18, bold: true, color: C.white, fontFace: "Calibri",
    });
    s.addText(p.d, {
      x: x + 1.0, y: y + 0.9, w: 4.7, h: 0.9,
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
  card(s, 0.5, 1.45, 6.2, 5.2);
  s.addText("OBJECTIVES", {
    x: 0.75, y: 1.65, w: 5.7, h: 0.35,
    fontSize: 12, bold: true, color: C.green, fontFace: "Calibri", charSpacing: 1,
  });
  const objs = [
    "Automate parse → IoC → TI → ATT&CK → RAG playbook",
    "Human-in-the-loop for critical / low-grounding cases",
    "Investigation workspace as case system of record",
    "Offline golden IR evaluation (CI gates)",
    "RBAC, vault, audit integrity, compliance alignment",
  ];
  objs.forEach((t, i) => {
    s.addText("▸  " + t, {
      x: 0.85, y: 2.2 + i * 0.7, w: 5.5, h: 0.6,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  card(s, 6.95, 1.45, 5.9, 5.2);
  s.addText("NON-GOALS", {
    x: 7.2, y: 1.65, w: 5.4, h: 0.35,
    fontSize: 12, bold: true, color: C.amber, fontFace: "Calibri", charSpacing: 1,
  });
  const non = [
    "Not a Sentinel / Splunk / Falcon replacement",
    "Not multi-tenant SaaS isolation (v1)",
    "Not unsupervised SOAR execution",
    "Not formal ISO/SOC2 certification",
    "Not 500-user scale certification",
  ];
  non.forEach((t, i) => {
    s.addText("▸  " + t, {
      x: 7.3, y: 2.2 + i * 0.7, w: 5.3, h: 0.6,
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
    x: 0.5, y: 1.4, w: 12.3, h: 0.4,
    fontSize: 14, color: C.accent, fontFace: "Calibri",
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
    card(s, x, 2.15, 2.4, 2.8);
    s.addText(st.n, {
      x: x + 0.15, y: 2.35, w: 2.1, h: 0.4,
      fontSize: 12, color: C.accent, bold: true, fontFace: "Calibri",
    });
    s.addText(st.t, {
      x: x + 0.15, y: 2.85, w: 2.1, h: 0.45,
      fontSize: 20, bold: true, color: C.white, fontFace: "Calibri",
    });
    s.addText(st.d, {
      x: x + 0.15, y: 3.45, w: 2.1, h: 1.1,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  s.addText("Personas: Analyst  ·  Senior Reviewer  ·  Admin  ·  Executive (demo)", {
    x: 0.5, y: 5.3, w: 12.3, h: 0.35,
    fontSize: 14, color: C.text, fontFace: "Calibri",
  });
  s.addText("Positioning: complements SIEM dual-run — does not replace the platform of record.", {
    x: 0.5, y: 5.75, w: 12.3, h: 0.35,
    fontSize: 13, color: C.muted, fontFace: "Calibri",
  });
  footer(s, 4);
}

// ─── Slide 5 Architecture ────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Architecture", "Modular monolith · dual API · pilot-ready packaging");
  const layers = [
    { t: "React SPA", d: "SOC console · Workspace · Settings · Compliance", c: "1E3A5F" },
    { t: "FastAPI  (/api  +  /api/v1)", d: "Auth · Jobs · Pipeline · Review · Hunt · LLM · Audit", c: "164E63" },
    { t: "MongoDB  +  LanceDB", d: "Cases / users / audit  ·  Hybrid BM25 + vectors (RRF)", c: "14532D" },
    { t: "External (optional)", d: "LLM providers  ·  AbuseIPDB / VT / TI  ·  Slack", c: "713F12" },
  ];
  layers.forEach((L, i) => {
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.5, y: 1.5 + i * 1.2, w: 10.3, h: 1.0,
      fill: { color: C.card }, rectRadius: 0.08,
    });
    s.addShape(pptx.shapes.ROUNDED_RECTANGLE, {
      x: 1.5, y: 1.5 + i * 1.2, w: 0.15, h: 1.0,
      fill: { color: C.accent }, rectRadius: 0.04,
    });
    s.addText(L.t, {
      x: 1.95, y: 1.58 + i * 1.2, w: 9.5, h: 0.4,
      fontSize: 16, bold: true, color: C.white, fontFace: "Calibri",
    });
    s.addText(L.d, {
      x: 1.95, y: 2.0 + i * 1.2, w: 9.5, h: 0.35,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 5);
}

// ─── Slide 6 AI / RAG ────────────────────────────────────────
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
    const y = 1.45 + row * 1.75;
    card(s, x, y, 6.15, 1.55);
    s.addText(it.t, {
      x: x + 0.3, y: y + 0.25, w: 5.5, h: 0.4,
      fontSize: 16, bold: true, color: C.accent, fontFace: "Calibri",
    });
    s.addText(it.d, {
      x: x + 0.3, y: y + 0.7, w: 5.5, h: 0.6,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 6);
}

// ─── Slide 7 TI & ATT&CK ─────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Threat intelligence & ATT&CK", "Enrichment + technique mapping");
  card(s, 0.5, 1.5, 6.0, 5.1);
  s.addText("IoC & TI", {
    x: 0.8, y: 1.75, w: 5.4, h: 0.4,
    fontSize: 18, bold: true, color: C.white, fontFace: "Calibri",
  });
  [
    "Extract IP / domain / URL / hash",
    "Filter private IPs from public enrich",
    "Live: AbuseIPDB, VT, GreyNoise, …",
    "Mock default without keys (demo-safe)",
    "FORCE_MOCK_TI for deterministic tests",
  ].forEach((t, i) => {
    s.addText("●  " + t, {
      x: 0.9, y: 2.4 + i * 0.65, w: 5.3, h: 0.55,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  card(s, 6.8, 1.5, 6.0, 5.1);
  s.addText("MITRE ATT&CK", {
    x: 7.1, y: 1.75, w: 5.4, h: 0.4,
    fontSize: 18, bold: true, color: C.white, fontFace: "Calibri",
  });
  [
    "Heuristic keyword / pattern mapping",
    "Technique filters on incident list",
    "Dashboard heatmap of prevalence",
    "Timeline + RCA for kill-chain narrative",
    "Not full STIX/TAXII enterprise sync",
  ].forEach((t, i) => {
    s.addText("●  " + t, {
      x: 7.2, y: 2.4 + i * 0.65, w: 5.3, h: 0.55,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  footer(s, 7);
}

// ─── Slide 8 Workspace ───────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Investigation workspace", "System of record for a single case");
  const tabs = [
    "Case", "Evidence", "Timeline", "Graph", "TI", "MITRE", "Notes", "Playbooks", "RCA", "AI"
  ];
  tabs.forEach((t, i) => {
    const x = 0.5 + (i % 5) * 2.5;
    const y = 1.6 + Math.floor(i / 5) * 1.5;
    card(s, x, y, 2.35, 1.25);
    s.addText(t, {
      x: x + 0.1, y: y + 0.4, w: 2.15, h: 0.45,
      fontSize: 16, bold: true, color: C.white, align: "center", fontFace: "Calibri",
    });
  });
  s.addText("URL tab state (?tab=)  ·  Notes with audit  ·  SSE AI investigator  ·  Similar cases API", {
    x: 0.5, y: 4.9, w: 12.3, h: 0.4,
    fontSize: 14, color: C.muted, fontFace: "Calibri",
  });
  s.addText("Load errors and 404s surface explicit UI (no infinite spinner) — critical for analyst trust.", {
    x: 0.5, y: 5.5, w: 12.3, h: 0.4,
    fontSize: 14, color: C.accent, fontFace: "Calibri",
  });
  footer(s, 8);
}

// ─── Slide 9 Security ────────────────────────────────────────
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
    const y = 1.5 + row * 2.5;
    card(s, x, y, 4.0, 2.25);
    s.addText(it.t, {
      x: x + 0.25, y: y + 0.4, w: 3.5, h: 0.45,
      fontSize: 18, bold: true, color: C.accent, fontFace: "Calibri",
    });
    s.addText(it.d, {
      x: x + 0.25, y: y + 1.0, w: 3.5, h: 0.9,
      fontSize: 13, color: C.muted, fontFace: "Calibri",
    });
  });
  footer(s, 9);
}

// ─── Slide 10 Testing ────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Testing & evaluation", "Golden offline IR suite — 26 July 2026");
  s.addTable(
    [
      [
        { text: "Metric", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
        { text: "Threshold", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
        { text: "Result", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
        { text: "Status", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
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
      x: 0.5, y: 1.4, w: 12.3, h: 4.4,
      colW: [4.0, 2.5, 3.0, 2.8],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: "Calibri",
      fontSize: 13,
      color: C.text,
      align: "center",
      valign: "middle",
    }
  );
  s.addText("Also: unit · RBAC · pipeline isolation · Playwright smoke  ·  Live LLM quality not gated offline (honest limit)", {
    x: 0.5, y: 6.15, w: 12.3, h: 0.35,
    fontSize: 12, color: C.muted, fontFace: "Calibri",
  });
  footer(s, 10);
}

// ─── Slide 11 Demo path ──────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "5-minute demo path", "Live path — see DEMO_SCRIPT.md");
  const pathSteps = [
    { n: "1", t: "Login", d: "Analyst / reviewer roles" },
    { n: "2", t: "Ingest", d: "Sample log package" },
    { n: "3", t: "Incident", d: "Open workspace" },
    { n: "4", t: "Evidence", d: "Timeline · graph" },
    { n: "5", t: "Playbook", d: "Citations · score" },
    { n: "6", t: "HiTL", d: "Approve + comment" },
    { n: "7", t: "Govern", d: "Compliance · audit" },
  ];
  pathSteps.forEach((st, i) => {
    const x = 0.4 + i * 1.85;
    card(s, x, 2.2, 1.75, 3.2);
    s.addShape(pptx.shapes.OVAL, {
      x: x + 0.55, y: 2.5, w: 0.65, h: 0.65,
      fill: { color: "1E3A5F" },
    });
    s.addText(st.n, {
      x: x + 0.55, y: 2.6, w: 0.65, h: 0.5,
      fontSize: 16, bold: true, color: C.accent, align: "center", fontFace: "Calibri",
    });
    s.addText(st.t, {
      x: x + 0.1, y: 3.4, w: 1.55, h: 0.5,
      fontSize: 14, bold: true, color: C.white, align: "center", fontFace: "Calibri",
    });
    s.addText(st.d, {
      x: x + 0.1, y: 4.05, w: 1.55, h: 0.9,
      fontSize: 12, color: C.muted, align: "center", fontFace: "Calibri",
    });
  });
  footer(s, 11);
}

// ─── Slide 12 Results ────────────────────────────────────────
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
    card(s, x, 1.5, 3.0, 2.8);
    s.addText(k.v, {
      x: x + 0.15, y: 1.8, w: 2.7, h: 0.7,
      fontSize: 36, bold: true, color: C.accent, align: "center", fontFace: "Calibri",
    });
    s.addText(k.u, {
      x: x + 0.15, y: 2.5, w: 2.7, h: 0.35,
      fontSize: 14, color: C.muted, align: "center", fontFace: "Calibri",
    });
    s.addText(k.l, {
      x: x + 0.2, y: 3.15, w: 2.6, h: 0.8,
      fontSize: 13, color: C.text, align: "center", fontFace: "Calibri",
    });
  });
  card(s, 0.5, 4.55, 12.3, 1.9);
  s.addText("Impact narrative", {
    x: 0.8, y: 4.75, w: 11.7, h: 0.35,
    fontSize: 14, bold: true, color: C.green, fontFace: "Calibri",
  });
  s.addText("Faster time-to-first playbook vs pure manual IR  ·  Traceable citations  ·  Reproducible offline eval  ·  React workspace exceeds Gradio baseline  ·  Wave C compliance + audit export for executives", {
    x: 0.8, y: 5.25, w: 11.7, h: 0.9,
    fontSize: 14, color: C.text, fontFace: "Calibri",
  });
  footer(s, 12);
}

// ─── Slide 13 Challenges ─────────────────────────────────────
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
        { text: "Challenge", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
        { text: "Mitigation", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
      ],
      ...rows,
    ],
    {
      x: 0.5, y: 1.45, w: 12.3, h: 5.2,
      colW: [4.0, 8.3],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: "Calibri",
      fontSize: 14,
      color: C.text,
      valign: "middle",
    }
  );
  footer(s, 13);
}

// ─── Slide 14 Future ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Future work", "From pilot to production path");
  const horiz = [
    { t: "Next sprint", items: ["Demo video + screenshots", "Login marketing honesty", "Analytics error polish"] },
    { t: "Next release", items: ["SSO JWKS hardening", "API rate limits", "E2E expansion"] },
    { t: "v2.0", items: ["Multi-tenant design", "SIEM connectors", "Commercial pilot"] },
    { t: "v3.0", items: ["Gated SOAR actions", "Forensics agent", "RAGAS board metrics"] },
  ];
  horiz.forEach((h, i) => {
    const x = 0.45 + i * 3.2;
    card(s, x, 1.55, 3.05, 5.0);
    s.addText(h.t, {
      x: x + 0.2, y: 1.85, w: 2.65, h: 0.5,
      fontSize: 16, bold: true, color: C.accent, fontFace: "Calibri",
    });
    h.items.forEach((it, j) => {
      s.addText("▸  " + it, {
        x: x + 0.2, y: 2.7 + j * 0.9, w: 2.65, h: 0.75,
        fontSize: 13, color: C.text, fontFace: "Calibri",
      });
    });
  });
  footer(s, 14);
}

// ─── Slide 15 Conclusion ─────────────────────────────────────
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
    card(s, 0.5, 1.4 + i * 1.0, 12.3, 0.88);
    s.addText((i + 1) + ".  " + b, {
      x: 0.8, y: 1.55 + i * 1.0, w: 11.7, h: 0.6,
      fontSize: 15, color: C.text, fontFace: "Calibri",
    });
  });
  footer(s, 15);
}

// ─── Slide 16 Q&A ────────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  s.addShape(pptx.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.accent },
  });
  s.addText("Thank you", {
    x: 0.7, y: 2.3, w: 12, h: 0.7,
    fontSize: 42, bold: true, color: C.white, fontFace: "Calibri",
  });
  s.addText("Questions & discussion", {
    x: 0.7, y: 3.1, w: 12, h: 0.5,
    fontSize: 24, color: C.accent, fontFace: "Calibri",
  });
  s.addText("Pack: docs/capstone/  ·  Report: PROJECT_REPORT.md  ·  Appendices: appendices/\nPPT: presentation/  ·  Board: board/CAPSTONE_BOARD_REVIEW_AND_SUBMISSION.md", {
    x: 0.7, y: 4.2, w: 11.5, h: 0.9,
    fontSize: 14, color: C.muted, fontFace: "Calibri",
  });
  footer(s, 16);
}

// ─── Backup 17 Competitive ───────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Backup — competitive positioning", "Do not claim SIEM replacement");
  s.addTable(
    [
      [
        { text: "Dimension", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
        { text: "ACTIRA", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
        { text: "SIEM / XDR", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
        { text: "Generic LLM", options: { bold: true, color: C.white, fill: { color: "1E3A5F" } } },
      ],
      ["Grounded IR playbooks", "Yes + citations", "Playbooks / SOAR", "Weak / no KB"],
      ["HiTL gates", "First-class", "Varies", "None"],
      ["Offline golden eval", "CI gated", "Rare for IR NLP", "No"],
      ["Data lake / connectors", "Upload pilot", "Core strength", "N/A"],
      ["Investigation UX", "Workspace", "Mature", "Chat only"],
      ["Open modular stack", "Yes", "Closed suites", "SaaS only"],
    ],
    {
      x: 0.4, y: 1.4, w: 12.5, h: 5.2,
      colW: [3.2, 3.2, 3.1, 3.0],
      border: [{ pt: 0.5, color: C.border }],
      fontFace: "Calibri",
      fontSize: 12,
      color: C.text,
      valign: "middle",
    }
  );
  footer(s, 17);
}

// ─── Backup 18 Stack ─────────────────────────────────────────
{
  const s = pptx.addSlide();
  bg(s);
  titleBar(s, "Backup — tech stack & pack index", "Submission artifacts");
  card(s, 0.5, 1.45, 6.0, 5.15);
  s.addText("Stack", {
    x: 0.8, y: 1.7, w: 5.4, h: 0.4,
    fontSize: 16, bold: true, color: C.accent, fontFace: "Calibri",
  });
  [
    "Python · FastAPI · Pydantic",
    "React SPA · Recharts",
    "MongoDB · LanceDB",
    "Multi-provider LLMs",
    "pytest · Playwright",
    "Docker Compose · Helm",
  ].forEach((t, i) => {
    s.addText("●  " + t, {
      x: 0.9, y: 2.3 + i * 0.55, w: 5.3, h: 0.5,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  card(s, 6.8, 1.45, 6.0, 5.15);
  s.addText("docs/capstone/", {
    x: 7.1, y: 1.7, w: 5.4, h: 0.4,
    fontSize: 16, bold: true, color: C.accent, fontFace: "Calibri",
  });
  [
    "PROJECT_REPORT.md",
    "presentation/*.pptx",
    "appendices/A–F",
    "board/CAPSTONE_BOARD…",
    "outlines + PPT_OUTLINE",
    "assets/screenshots",
  ].forEach((t, i) => {
    s.addText("●  " + t, {
      x: 7.2, y: 2.3 + i * 0.55, w: 5.3, h: 0.5,
      fontSize: 14, color: C.text, fontFace: "Calibri",
    });
  });
  footer(s, 18);
}

pptx.writeFile({ fileName: outPath }).then(() => {
  console.log("Wrote", outPath);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
