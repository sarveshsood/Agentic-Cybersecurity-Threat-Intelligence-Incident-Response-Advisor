/**
 * Canonical left-rail + Jump (command palette) navigation.
 * Single source of truth — keep Layout and CommandPalette in lockstep.
 *
 * Section order = IR workflow: Operate → Analyze → Govern → Admin.
 */
import {
    BookBookmark,
    ChartBar,
    Crosshair,
    FileText,
    Flask,
    Gauge,
    GearSix,
    Heartbeat,
    ListChecks,
    MapTrifold,
    ShieldCheck,
    ShieldWarning,
    TestTube,
    UploadSimple,
} from "@phosphor-icons/react";

/** @typedef {"Operate" | "Analyze" | "Govern" | "Admin"} NavSection */

/**
 * @type {Array<{
 *   to: string,
 *   label: string,
 *   icon: import("@phosphor-icons/react").Icon,
 *   roles: string[],
 *   tip: string,
 *   section: NavSection,
 *   colorClass: string,
 *   keywords?: string,
 *   feature?: string,
 * }>}
 */
export const NAV = [
    // —— Operate ——
    {
        to: "/",
        label: "Dashboard",
        icon: Gauge,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "SOC KPIs, recent activity, ATT&CK heatmap",
        section: "Operate",
        colorClass: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
        keywords: "home kpi operations workload queue",
    },
    {
        to: "/upload",
        label: "Ingest Logs",
        icon: UploadSimple,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Upload logs or multi-file incident packages",
        section: "Operate",
        colorClass: "text-primary bg-primary/10",
        keywords: "upload pipeline logs zip sample",
    },
    {
        to: "/incidents",
        label: "Incidents",
        icon: ShieldWarning,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Browse and open IR cases",
        section: "Operate",
        colorClass: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
        keywords: "cases list triage severity",
    },
    {
        to: "/review",
        label: "Review Queue",
        icon: ListChecks,
        roles: ["senior_reviewer", "admin"],
        tip: "Human-in-the-loop playbook approval queue",
        section: "Operate",
        colorClass: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
        keywords: "hitl approve reject playbook",
    },
    {
        to: "/hunt",
        label: "Threat Hunt",
        icon: Crosshair,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Natural-language hunt across recent incidents",
        section: "Operate",
        colorClass: "text-primary bg-primary/10",
        keywords: "hunt threat powershell lateral ransomware dns",
    },
    // —— Analyze ——
    {
        to: "/analytics",
        label: "Analytics",
        icon: ChartBar,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "EDA charts, IoC trends, BM25 vs LanceDB retrieval comparison",
        section: "Analyze",
        colorClass: "text-blue-500 bg-blue-50 dark:bg-blue-950/30",
        keywords: "charts eda trends retrieval",
    },
    {
        to: "/knowledge",
        label: "Knowledge Base",
        icon: BookBookmark,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Search MITRE/NIST/CISA KB (BM25, dense, hybrid)",
        section: "Analyze",
        colorClass: "text-teal-600 bg-teal-50 dark:bg-teal-950/30",
        keywords: "kb search mitre nist cisa rag",
    },
    // —— Govern ——
    {
        to: "/audit",
        label: "Audit Trail",
        icon: FileText,
        roles: ["senior_reviewer", "admin"],
        tip: "Hash-chained platform audit log (reviews, settings, ingest) — best-effort, not WORM",
        section: "Govern",
        colorClass: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30",
        keywords: "audit log compliance hash integrity",
    },
    {
        to: "/compliance",
        label: "Compliance",
        icon: ShieldCheck,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Product-alignment score (not certification) — gaps, evidence pack, executive export",
        section: "Govern",
        colorClass: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
        keywords: "iso soc2 nist gaps evidence governance",
    },
    {
        to: "/roadmap",
        label: "Roadmap",
        icon: MapTrifold,
        roles: ["analyst", "senior_reviewer", "admin"],
        tip: "Product roadmap and progress",
        section: "Govern",
        colorClass: "text-sky-600 bg-sky-50 dark:bg-sky-950/30",
        keywords: "product roadmap progress",
    },
    // —— Admin ——
    {
        to: "/qa",
        label: "QA Health",
        icon: TestTube,
        roles: ["senior_reviewer", "admin"],
        tip: "Testing Health Center — coverage, suites, release readiness (not Ops runtime)",
        section: "Admin",
        colorClass: "text-primary bg-primary/10",
        keywords: "qa quality testing coverage readiness junit release",
        feature: "qa_health_center",
    },
    {
        to: "/benchmark",
        label: "Golden Eval",
        icon: Flask,
        roles: ["admin"],
        tip: "Offline golden IR quality gates (admin)",
        section: "Admin",
        colorClass: "text-slate-600 bg-slate-100 dark:bg-slate-800",
        keywords: "benchmark quality golden eval",
    },
    {
        to: "/ops",
        label: "Ops & Health",
        icon: Heartbeat,
        roles: ["admin"],
        tip: "Multi-replica flags, queue, pipeline timings, LLM budget (runtime — not QA)",
        section: "Admin",
        colorClass: "text-rose-600 bg-rose-50 dark:bg-rose-950/30",
        keywords: "ops health ha multi-replica queue timings",
    },
    {
        to: "/settings",
        label: "Settings",
        icon: GearSix,
        roles: ["admin"],
        tip: "LLM, TI keys, pipeline, and retention",
        section: "Admin",
        colorClass: "text-slate-500 bg-slate-100 dark:bg-slate-800",
        keywords: "llm keys config groq fallback platform",
    },
];

/** Stable section order for left rail + Jump groups. */
export const NAV_SECTIONS = ["Operate", "Analyze", "Govern", "Admin"];

/**
 * Filter nav by RBAC role and optional product feature flags.
 * @param {string} [role]
 * @param {{ isFeatureEnabled?: (key: string) => boolean }} [opts]
 */
export function navForRole(role, opts = {}) {
    const r = role || "analyst";
    const featOk = opts.isFeatureEnabled;
    return NAV.filter((n) => {
        if (!Array.isArray(n.roles) || !n.roles.includes(r)) return false;
        if (n.feature) {
            // Hide feature-gated items until flags load / when disabled
            if (typeof featOk !== "function") return false;
            if (!featOk(n.feature)) return false;
        }
        return true;
    });
}

/** Group nav items by section; omit empty sections. */
export function groupNav(items) {
    const bySection = new Map(NAV_SECTIONS.map((s) => [s, []]));
    for (const item of items) {
        const sec = item.section || "Operate";
        if (!bySection.has(sec)) bySection.set(sec, []);
        bySection.get(sec).push(item);
    }
    return NAV_SECTIONS
        .filter((label) => (bySection.get(label) || []).length > 0)
        .map((label) => ({label, items: bySection.get(label)}));
}
