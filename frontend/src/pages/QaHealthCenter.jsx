/**
 * Testing Health Center (QA Health) — Phase 0 SPA.
 * Design: docs/product/TESTING_HEALTH_CENTER_DESIGN.md
 * Distinct from Ops & Health (/ops) — quality / release readiness only.
 */
import {useCallback, useEffect, useMemo, useState} from "react";
import {Link, useSearchParams} from "react-router-dom";
import {
    ArrowClockwise,
    CheckCircle,
    ListChecks,
    Play,
    ShieldWarning,
    TestTube,
    UploadSimple,
    Warning,
    XCircle,
} from "@phosphor-icons/react";
import {toast} from "sonner";
import {api, apiErrorMessage} from "../lib/api";
import {useAuth} from "../lib/auth";
import {isFeatureEnabled, loadFeatures} from "../lib/features";
import {HelpTip} from "../components/HelpTip";
import {ListState} from "../components/ListState";
import {
    AlertBanner,
    DsButton,
    EmptyState,
    ErrorState,
    KpiCard,
    PageHeader,
    Panel,
    SectionLabel,
} from "../design-system";

const TABS = [
    {id: "overview", label: "Overview"},
    {id: "usecases", label: "Use cases"},
    {id: "suites", label: "Suites"},
    {id: "coverage", label: "Coverage"},
    {id: "release", label: "Release"},
    {id: "admin", label: "Admin", adminOnly: true},
];

function formatPct(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return `${Number(v).toFixed(1)}%`;
}

function StatusPill({status}) {
    const s = String(status || "").toLowerCase();
    const ok = s === "passed" || s === "pass" || s === "ready";
    const bad = s === "failed" || s === "fail" || s === "error" || s === "not_ready";
    const cls = ok
        ? "bg-success-soft text-success border-[var(--success-border)]"
        : bad
          ? "bg-error-soft text-error border-[var(--error-border)]"
          : "bg-muted text-muted-foreground border-border";
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
            {ok ? <CheckCircle size={12} weight="fill"/> : bad ? <XCircle size={12} weight="fill"/> : <Warning size={12}/>}
            {status || "—"}
        </span>
    );
}

export default function QaHealthCenter() {
    const {user} = useAuth();
    const isAdmin = user?.role === "admin";
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get("tab") || "overview";
    const setTab = (id) => {
        const next = new URLSearchParams(searchParams);
        next.set("tab", id);
        setSearchParams(next, {replace: true});
    };

    const [flagReady, setFlagReady] = useState(false);
    const [flagOn, setFlagOn] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState(null);
    const [runs, setRuns] = useState([]);
    const [coverage, setCoverage] = useState(null);
    const [release, setRelease] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    // Use cases catalog
    const [cases, setCases] = useState([]);
    const [caseStats, setCaseStats] = useState(null);
    const [caseTotal, setCaseTotal] = useState(0);
    const [caseFilter, setCaseFilter] = useState({q: "", module: "", runner: "", automation: ""});
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [running, setRunning] = useState(false);
    const [caseDetail, setCaseDetail] = useState(null);

    // Admin ingest form
    const [junitFile, setJunitFile] = useState(null);
    const [covFile, setCovFile] = useState(null);
    const [buildId, setBuildId] = useState("local-ui");
    const [ingesting, setIngesting] = useState(false);

    useEffect(() => {
        loadFeatures()
            .then(() => setFlagOn(isFeatureEnabled("qa_health_center")))
            .catch(() => setFlagOn(false))
            .finally(() => setFlagReady(true));
    }, []);

    const load = useCallback(
        async (opts = {}) => {
            const silent = Boolean(opts.silent);
            if (!isFeatureEnabled("qa_health_center")) {
                setLoading(false);
                return;
            }
            if (silent) setRefreshing(true);
            else {
                setLoading(true);
                setError(null);
            }
            try {
                // Settled so one 404 (e.g. cases on old API) does not blank the whole page
                const settled = await Promise.allSettled([
                    api.get("/qa/summary"),
                    api.get("/qa/runs", {params: {limit: 50}}),
                    api.get("/qa/coverage"),
                    api.get("/qa/release/latest"),
                    api.get("/qa/cases", {params: {limit: 500}}),
                ]);
                const val = (i) => (settled[i].status === "fulfilled" ? settled[i].value?.data : null);
                const err = (i) => (settled[i].status === "rejected" ? settled[i].reason : null);

                const s = val(0);
                const r = val(1);
                const c = val(2);
                const rel = val(3);
                const uc = val(4);

                // Core endpoints — if all core fail, surface error
                if (!s && !r && !c && !rel) {
                    const first = err(0) || err(1) || err(2) || err(3);
                    const msg = apiErrorMessage(first) || "Failed to load QA Health";
                    if (first?.response?.status === 404) {
                        setError(
                            "QA Health API routes not found. Restart the backend with FEATURE_QA_HEALTH_CENTER=1 so /qa/* is loaded.",
                        );
                    } else if (!silent) {
                        setError(msg);
                    }
                } else {
                    setError(null);
                }

                if (s) setSummary(s);
                if (r) setRuns(r.items || []);
                if (c) setCoverage(c);
                if (rel) setRelease(rel);
                if (uc) {
                    setCases(uc.items || []);
                    setCaseTotal(uc.catalog_total || uc.total || 0);
                    setCaseStats(uc.stats || null);
                }
                // cases optional — older API without catalog still shows Overview
            } catch (e) {
                const msg = apiErrorMessage(e) || "Failed to load QA Health";
                if (!silent) setError(msg);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [],
    );

    useEffect(() => {
        if (!flagReady) return;
        if (!flagOn) {
            setLoading(false);
            return;
        }
        load({silent: false});
    }, [flagReady, flagOn, load]);

    const activeTabs = useMemo(
        () => TABS.filter((t) => !t.adminOnly || isAdmin),
        [isAdmin],
    );

    const onIngest = async (e) => {
        e.preventDefault();
        if (!junitFile && !covFile) {
            toast.error("Choose a JUnit XML and/or coverage.xml file");
            return;
        }
        setIngesting(true);
        try {
            const fd = new FormData();
            if (junitFile) fd.append("junit", junitFile);
            if (covFile) fd.append("coverage", covFile);
            if (buildId) fd.append("build_id", buildId);
            fd.append("suite_type", "unit");
            // Do not set Content-Type — axios must add multipart boundary
            const r = await api.post("/qa/ingest", fd);
            const verdict = r.data?.release?.verdict;
            toast.success(verdict ? `Ingested — release ${verdict}` : "Ingested");
            setJunitFile(null);
            setCovFile(null);
            await load({silent: true});
            setTab("release");
        } catch (err) {
            toast.error(apiErrorMessage(err) || "Ingest failed");
        } finally {
            setIngesting(false);
        }
    };

    const onRecompute = async () => {
        try {
            const r = await api.post("/qa/release/recompute", null, {
                params: {build_id: summary?.build_id || undefined},
            });
            toast.success(`Recomputed: ${r.data?.verdict || "done"}`);
            await load({silent: true});
        } catch (err) {
            toast.error(apiErrorMessage(err) || "Recompute failed");
        }
    };

    const loadCases = useCallback(async () => {
        try {
            const params = {limit: 500};
            if (caseFilter.q) params.q = caseFilter.q;
            if (caseFilter.module) params.module = caseFilter.module;
            if (caseFilter.runner) params.runner = caseFilter.runner;
            if (caseFilter.automation) params.automation = caseFilter.automation;
            const r = await api.get("/qa/cases", {params});
            setCases(r.data?.items || []);
            setCaseTotal(r.data?.catalog_total || r.data?.total || 0);
            setCaseStats(r.data?.stats || null);
        } catch (err) {
            // Do not toast on every tab open if API not upgraded — empty state + banner handle it
            setCases([]);
            if (err?.response?.status !== 404) {
                toast.error(apiErrorMessage(err) || "Failed to load use cases");
            }
        }
    }, [caseFilter]);

    useEffect(() => {
        if (flagOn && tab === "usecases") {
            loadCases();
        }
    }, [flagOn, tab, loadCases]);

    const toggleSelect = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectAllVisible = () => {
        setSelectedIds(new Set(cases.map((c) => c.id)));
    };

    const clearSelection = () => setSelectedIds(new Set());

    const onRunUseCases = async (scope, ids) => {
        if (!isAdmin) {
            toast.error("Running use cases requires admin");
            return;
        }
        setRunning(true);
        try {
            const body = {scope};
            if (ids?.length) body.case_ids = ids;
            const r = await api.post("/qa/usecases/run", body);
            const n = r.data?.result_count ?? 0;
            const g = r.data?.golden;
            if (g?.ran) {
                toast.success(
                    `Golden suite ${g.passed ? "PASSED" : "FAILED"} · ${n} use case row(s) updated`,
                );
            } else {
                toast.message(`Processed ${n} use case(s) (manual listed, not auto-run)`);
            }
            await load({silent: true});
            await loadCases();
            setTab("usecases");
        } catch (err) {
            toast.error(apiErrorMessage(err) || "Run failed");
        } finally {
            setRunning(false);
        }
    };

    const onSeedCatalog = async () => {
        try {
            const r = await api.post("/qa/seed/catalog", null, {params: {force: true}});
            toast.success(`Catalog seeded: ${r.data?.upserted || r.data?.seed_count || 0} cases`);
            await loadCases();
        } catch (err) {
            toast.error(apiErrorMessage(err) || "Seed failed");
        }
    };

    const filteredHint = useMemo(() => {
        if (!caseStats) return "";
        const r = caseStats.by_runner || {};
        return `${caseTotal} total · golden runnable: ${r.golden || 0} · manual: ${r.manual || 0}`;
    }, [caseStats, caseTotal]);

    if (!flagReady || loading) {
        return (
            <div className="p-6" data-testid="qa-health-loading">
                <ListState variant="loading" message="Loading QA Health Center…"/>
            </div>
        );
    }

    if (!flagOn) {
        return (
            <div className="space-y-6 pb-8" data-testid="qa-health-disabled">
                <PageHeader
                    testid="qa-health-header"
                    title="QA Health Center"
                    icon={TestTube}
                    subtitle="Testing quality portal — feature flag off"
                    tipTitle="QA Health Center"
                    tipBody="Enterprise Testing Health Center for coverage, suite results, and release readiness. Distinct from Ops & Health (runtime)."
                    how="Enable FEATURE_QA_HEALTH_CENTER=1 on the API, then refresh."
                />
                <EmptyState
                    title="Feature not enabled"
                    description="Set FEATURE_QA_HEALTH_CENTER=1 in the backend environment and reload. SPA flag key: qa_health_center."
                    testid="qa-health-flag-off"
                />
            </div>
        );
    }

    // Only hard-block the page when we have no data at all
    if (error && !summary && !runs.length && !coverage && !release) {
        return (
            <div className="space-y-4 pb-8" data-testid="qa-health-error">
                <PageHeader
                    testid="qa-health-header"
                    title="QA Health Center"
                    icon={TestTube}
                    tipTitle="QA Health"
                    tipBody="Quality / release readiness portal."
                />
                <ErrorState message={error}/>
                <DsButton variant="secondary" size="sm" tooltip="Retry load" onClick={() => load({silent: false})}>
                    Retry
                </DsButton>
            </div>
        );
    }

    const verdict = release?.verdict || summary?.verdict;
    const empty = Boolean(summary?.empty) && !runs.length;

    return (
        <div className="space-y-6 pb-8" data-testid="qa-health-page">
            <PageHeader
                testid="qa-health-header"
                title="QA Health Center"
                icon={TestTube}
                subtitle="Coverage, test suites, and release readiness — not runtime Ops"
                tipTitle="Testing Health Center"
                tipBody="Single source of truth for CI quality artifacts: JUnit results, code coverage vs 95% gate, and deterministic READY / NOT_READY."
                how="Ingest via Admin tab or POST /qa/ingest (X-QA-Ingest-Token). Ops runtime lives at /ops."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <DsButton
                            variant="secondary"
                            size="sm"
                            tooltip="Refresh summary, suites, coverage, and release"
                            onClick={() => load({silent: true})}
                            disabled={refreshing}
                            data-testid="qa-refresh"
                        >
                            <ArrowClockwise size={14} className={refreshing ? "animate-spin" : ""}/>
                            Refresh
                        </DsButton>
                        <Link
                            to="/ops"
                            className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                            data-testid="qa-link-ops"
                        >
                            Ops & Health →
                        </Link>
                        <Link
                            to="/benchmark"
                            className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                            data-testid="qa-link-golden"
                        >
                            Golden Eval →
                        </Link>
                    </div>
                }
            />

            {error && (
                <AlertBanner variant="warning" title="Partial load" testid="qa-partial-error">
                    {error}
                </AlertBanner>
            )}
            {flagOn && caseTotal === 0 && cases.length === 0 && tab === "usecases" && (
                <AlertBanner variant="info" title="Use-case API" testid="qa-cases-api-hint">
                    Catalog empty or API not upgraded. Restart backend to load GET /qa/cases, then click Reseed catalog (admin).
                </AlertBanner>
            )}

            <div className="flex flex-wrap gap-1 border-b border-border pb-px" role="tablist" aria-label="QA tabs">
                {activeTabs.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={tab === t.id}
                        data-testid={`qa-tab-${t.id}`}
                        className={`px-3 py-2 text-xs font-semibold rounded-t-md border-b-2 transition-colors ${
                            tab === t.id
                                ? "border-primary text-primary bg-primary/5"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === "overview" && (
                <div className="space-y-4" data-testid="qa-panel-overview">
                    {empty && (
                        <EmptyState
                            title="No quality artifacts yet"
                            description="Ingest JUnit XML and coverage.xml from CI or the Admin tab to populate readiness. Use cases are listed under the Use cases tab."
                            testid="qa-empty-overview"
                        />
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <KpiCard
                            label="Release readiness"
                            value={verdict || "—"}
                            tipTitle="Release readiness"
                            tipBody="Deterministic READY / NOT_READY from unit, golden, coverage policy, and defects (qa-readiness-v1)."
                            tone={verdict === "READY" ? "success" : verdict === "NOT_READY" ? "error" : "default"}
                            testid="qa-kpi-verdict"
                        />
                        <KpiCard
                            label="Quality score"
                            value={summary?.quality_score != null ? summary.quality_score : "—"}
                            tipTitle="Quality score"
                            tipBody="Weighted module health from recent suite pass rates (mapped via qa_module_map_v1)."
                            testid="qa-kpi-score"
                        />
                        <KpiCard
                            label="Grade"
                            value={summary?.grade || "—"}
                            tipTitle="Grade"
                            tipBody="A≥90, B≥80, C≥70, D≥60, F&lt;60 from quality score."
                            testid="qa-kpi-grade"
                        />
                        <KpiCard
                            label="Coverage"
                            value={formatPct(summary?.coverage_percent)}
                            tipTitle="Code coverage"
                            tipBody="Backend Cobertura line-rate percent. Org gate is 95% (.coveragerc / make coverage). Soft mode does not force NOT_READY."
                            testid="qa-kpi-coverage"
                        />
                        <KpiCard
                            label="Use cases"
                            value={caseTotal || "—"}
                            tipTitle="Catalog size"
                            tipBody="Capstone master test catalog (all TC-* use cases). Open the Use cases tab to list and run."
                            testid="qa-kpi-usecases"
                        />
                    </div>

                    {(summary?.blockers?.length > 0 || summary?.soft_warnings?.length > 0) && (
                        <Panel
                            title="Signals"
                            tipTitle="Blockers & soft warnings"
                            tipBody="Hard blockers force NOT_READY. Soft warnings (e.g. coverage soft mode) never alone block release."
                            testid="qa-signals"
                        >
                            {summary?.blockers?.length > 0 && (
                                <div className="mb-2">
                                    <SectionLabel tipTitle="Hard gates" tipBody="Failed hard readiness gates.">Blockers</SectionLabel>
                                    <ul className="text-xs text-error space-y-1 mt-1">
                                        {summary.blockers.map((b) => (
                                            <li key={b} className="font-mono">• {b}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {summary?.soft_warnings?.length > 0 && (
                                <div>
                                    <SectionLabel tipTitle="Soft" tipBody="Informational; do not alone force NOT_READY.">Soft warnings</SectionLabel>
                                    <ul className="text-xs text-warning space-y-1 mt-1">
                                        {summary.soft_warnings.map((w) => (
                                            <li key={w}>• {w}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </Panel>
                    )}

                    <Panel
                        title="Module health"
                        tipTitle="Modules"
                        tipBody="Coarse pass-rate scores by mapped health module (Backend, AI, Security, …)."
                        testid="qa-modules"
                    >
                        {Object.keys(summary?.module_scores || {}).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No module scores yet.</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                {Object.entries(summary.module_scores).map(([m, v]) => (
                                    <div
                                        key={m}
                                        className="rounded border border-border px-2 py-2 text-center"
                                        data-testid={`qa-module-${m}`}
                                    >
                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{m}</div>
                                        <div className="font-mono text-lg font-semibold">{Number(v).toFixed(0)}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Panel>
                </div>
            )}

            {tab === "usecases" && (
                <div className="space-y-4" data-testid="qa-panel-usecases">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <SectionLabel
                            tipTitle="Use case catalog"
                            tipBody="All TC-* cases from the capstone master test catalog (seeded into Mongo). Golden-runner cases can execute offline IR golden suite from this UI."
                        >
                            All use cases
                        </SectionLabel>
                        <div className="flex flex-wrap gap-2">
                            {isAdmin && (
                                <>
                                    <DsButton
                                        size="sm"
                                        variant="primary"
                                        loading={running}
                                        tooltip="Run offline golden IR suite and update golden-mapped use cases"
                                        onClick={() => onRunUseCases("golden")}
                                        data-testid="qa-run-golden"
                                    >
                                        <Play size={14}/>
                                        Run golden suite
                                    </DsButton>
                                    <DsButton
                                        size="sm"
                                        variant="secondary"
                                        loading={running}
                                        disabled={!selectedIds.size}
                                        tooltip="Run selected (golden auto; manual shows steps only)"
                                        onClick={() => onRunUseCases("case", [...selectedIds])}
                                        data-testid="qa-run-selected"
                                    >
                                        <Play size={14}/>
                                        Run selected ({selectedIds.size})
                                    </DsButton>
                                    <DsButton
                                        size="sm"
                                        variant="secondary"
                                        tooltip="Reseed catalog from backend/data/qa_catalog_seed_v1.json"
                                        onClick={onSeedCatalog}
                                        data-testid="qa-seed-catalog"
                                    >
                                        <ListChecks size={14}/>
                                        Reseed catalog
                                    </DsButton>
                                </>
                            )}
                            <DsButton
                                size="sm"
                                variant="secondary"
                                tooltip="Reload use case list"
                                onClick={loadCases}
                                data-testid="qa-reload-cases"
                            >
                                <ArrowClockwise size={14}/>
                                Reload
                            </DsButton>
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground" data-testid="qa-usecase-stats">
                        {filteredHint || `${cases.length} shown`}
                        {!isAdmin && " · Sign in as admin to run golden suite"}
                    </p>

                    <div className="flex flex-wrap gap-2 items-end" data-testid="qa-usecase-filters">
                        <label className="text-xs">
                            <span className="text-muted-foreground">Search</span>
                            <input
                                className="sbp-input mt-0.5 block rounded-md px-2 py-1.5 text-sm min-w-[10rem]"
                                value={caseFilter.q}
                                onChange={(e) => setCaseFilter((f) => ({...f, q: e.target.value}))}
                                placeholder="TC-AUTH, login…"
                                data-testid="qa-filter-q"
                            />
                        </label>
                        <label className="text-xs">
                            <span className="text-muted-foreground">Module</span>
                            <select
                                className="sbp-input mt-0.5 block rounded-md px-2 py-1.5 text-sm"
                                value={caseFilter.module}
                                onChange={(e) => setCaseFilter((f) => ({...f, module: e.target.value}))}
                                data-testid="qa-filter-module"
                            >
                                <option value="">All</option>
                                {["Backend", "Frontend", "API", "AI", "Security", "Documentation", "DevOps", "Unmapped"].map((m) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        </label>
                        <label className="text-xs">
                            <span className="text-muted-foreground">Runner</span>
                            <select
                                className="sbp-input mt-0.5 block rounded-md px-2 py-1.5 text-sm"
                                value={caseFilter.runner}
                                onChange={(e) => setCaseFilter((f) => ({...f, runner: e.target.value}))}
                                data-testid="qa-filter-runner"
                            >
                                <option value="">All</option>
                                <option value="golden">golden (runnable)</option>
                                <option value="manual">manual</option>
                                <option value="e2e_manual">e2e_manual</option>
                                <option value="semi">semi</option>
                            </select>
                        </label>
                        <label className="text-xs">
                            <span className="text-muted-foreground">Automation</span>
                            <select
                                className="sbp-input mt-0.5 block rounded-md px-2 py-1.5 text-sm"
                                value={caseFilter.automation}
                                onChange={(e) => setCaseFilter((f) => ({...f, automation: e.target.value}))}
                                data-testid="qa-filter-auto"
                            >
                                <option value="">All</option>
                                <option value="auto">auto</option>
                                <option value="semi">semi</option>
                                <option value="manual">manual</option>
                            </select>
                        </label>
                        <DsButton size="sm" variant="secondary" tooltip="Apply filters" onClick={loadCases} data-testid="qa-filter-apply">
                            Apply
                        </DsButton>
                        <DsButton size="sm" variant="ghost" tooltip="Select all visible rows" onClick={selectAllVisible}>
                            Select all
                        </DsButton>
                        <DsButton size="sm" variant="ghost" tooltip="Clear selection" onClick={clearSelection}>
                            Clear
                        </DsButton>
                    </div>

                    {!cases.length ? (
                        <EmptyState
                            title="No use cases"
                            description="Click Reseed catalog (admin) or ensure backend/data/qa_catalog_seed_v1.json is present."
                            testid="qa-empty-cases"
                        />
                    ) : (
                        <div className="overflow-x-auto rounded border border-border max-h-[32rem] overflow-y-auto">
                            <table className="w-full text-xs" data-testid="qa-cases-table">
                                <thead className="bg-muted/40 text-left text-muted-foreground sticky top-0">
                                    <tr>
                                        <th className="p-2 w-8"/>
                                        <th className="p-2 font-medium">ID</th>
                                        <th className="p-2 font-medium">Title</th>
                                        <th className="p-2 font-medium">Module</th>
                                        <th className="p-2 font-medium">Priority</th>
                                        <th className="p-2 font-medium">Type</th>
                                        <th className="p-2 font-medium">Runner</th>
                                        <th className="p-2 font-medium">Status</th>
                                        <th className="p-2 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cases.map((c) => (
                                        <tr key={c.id} className="border-t border-border hover:bg-muted/20" data-testid={`qa-case-${c.id}`}>
                                            <td className="p-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(c.id)}
                                                    onChange={() => toggleSelect(c.id)}
                                                    aria-label={`Select ${c.id}`}
                                                />
                                            </td>
                                            <td className="p-2 font-mono font-semibold whitespace-nowrap">{c.id}</td>
                                            <td className="p-2 max-w-[14rem]">
                                                <button
                                                    type="button"
                                                    className="text-left hover:text-primary hover:underline"
                                                    onClick={() => setCaseDetail(c)}
                                                >
                                                    {c.title}
                                                </button>
                                            </td>
                                            <td className="p-2">{c.module}</td>
                                            <td className="p-2 font-mono">{c.priority}</td>
                                            <td className="p-2">{c.type || c.category}</td>
                                            <td className="p-2 font-mono">{c.runner}</td>
                                            <td className="p-2"><StatusPill status={c.status}/></td>
                                            <td className="p-2">
                                                {isAdmin && c.runner === "golden" ? (
                                                    <DsButton
                                                        size="sm"
                                                        variant="ghost"
                                                        tooltip={`Run golden suite (covers ${c.id})`}
                                                        loading={running}
                                                        onClick={() => onRunUseCases("case", [c.id])}
                                                    >
                                                        <Play size={12}/>
                                                        Run
                                                    </DsButton>
                                                ) : (
                                                    <DsButton
                                                        size="sm"
                                                        variant="ghost"
                                                        tooltip="View steps / expected"
                                                        onClick={() => setCaseDetail(c)}
                                                    >
                                                        View
                                                    </DsButton>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {caseDetail && (
                        <Panel
                            title={`${caseDetail.id} — ${caseDetail.title}`}
                            tipTitle="Use case detail"
                            tipBody="Steps and expected results from the master catalog."
                            testid="qa-case-detail"
                            actions={
                                <DsButton size="sm" variant="ghost" tooltip="Close detail" onClick={() => setCaseDetail(null)}>
                                    Close
                                </DsButton>
                            }
                        >
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div><dt className="text-muted-foreground">Module</dt><dd className="font-medium">{caseDetail.module}</dd></div>
                                <div><dt className="text-muted-foreground">Runner</dt><dd className="font-mono">{caseDetail.runner}</dd></div>
                                <div><dt className="text-muted-foreground">Priority</dt><dd>{caseDetail.priority}</dd></div>
                                <div><dt className="text-muted-foreground">Automation</dt><dd>{caseDetail.automation}</dd></div>
                                <div className="sm:col-span-2"><dt className="text-muted-foreground">Steps</dt><dd className="mt-0.5">{caseDetail.description}</dd></div>
                                <div className="sm:col-span-2"><dt className="text-muted-foreground">Expected</dt><dd className="mt-0.5">{caseDetail.expected}</dd></div>
                                {caseDetail.actual_last && (
                                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Last actual</dt><dd className="mt-0.5 font-mono text-[11px]">{caseDetail.actual_last}</dd></div>
                                )}
                            </dl>
                        </Panel>
                    )}
                </div>
            )}

            {tab === "suites" && (
                <div className="space-y-3" data-testid="qa-panel-suites">
                    <SectionLabel
                        tipTitle="Suite runs"
                        tipBody="Ingested JUnit suites (unit, security, golden, e2e). Upserted by build.id + suite_type."
                    >
                        Suite runs
                    </SectionLabel>
                    {!runs.length ? (
                        <EmptyState title="No suite runs" description="Ingest JUnit XML from Admin or CI." testid="qa-empty-runs"/>
                    ) : (
                        <div className="overflow-x-auto rounded border border-border">
                            <table className="w-full text-xs" data-testid="qa-runs-table">
                                <thead className="bg-muted/40 text-left text-muted-foreground">
                                    <tr>
                                        <th className="p-2 font-medium">Name</th>
                                        <th className="p-2 font-medium">Type</th>
                                        <th className="p-2 font-medium">Status</th>
                                        <th className="p-2 font-medium">Passed</th>
                                        <th className="p-2 font-medium">Failed</th>
                                        <th className="p-2 font-medium">Build</th>
                                        <th className="p-2 font-medium">Finished</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {runs.map((r) => (
                                        <tr key={r.id} className="border-t border-border" data-testid={`qa-run-${r.id}`}>
                                            <td className="p-2 font-medium">{r.name || r.id}</td>
                                            <td className="p-2 font-mono">{r.suite_type}</td>
                                            <td className="p-2"><StatusPill status={r.status}/></td>
                                            <td className="p-2 font-mono">{r.counts?.passed ?? "—"}</td>
                                            <td className="p-2 font-mono">{r.counts?.failed ?? "—"}</td>
                                            <td className="p-2 font-mono truncate max-w-[8rem]">{r.build?.id || "—"}</td>
                                            <td className="p-2 text-muted-foreground">{r.finished_at ? String(r.finished_at).slice(0, 19) : "—"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {tab === "coverage" && (
                <div className="space-y-4" data-testid="qa-panel-coverage">
                    <SectionLabel
                        tipTitle="Coverage"
                        tipBody="Backend Cobertura root line-rate. Gate 95%. Frontend N/A until Istanbul/nyc pipeline exists."
                    >
                        Code coverage
                    </SectionLabel>
                    {!coverage?.available ? (
                        <EmptyState
                            title="No coverage snapshot"
                            description={coverage?.note || "Upload coverage.xml from make coverage / CI."}
                            testid="qa-empty-coverage"
                        />
                    ) : (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <KpiCard
                                    label="Line coverage"
                                    value={formatPct(coverage.backend?.percent)}
                                    tipTitle="Line rate"
                                    tipBody="Cobertura line-rate × 100. Product READY uses this metric."
                                    testid="qa-cov-line"
                                />
                                <KpiCard
                                    label="Branch (display)"
                                    value={coverage.backend?.branch_rate != null ? formatPct(coverage.backend.branch_rate * 100) : "—"}
                                    tipTitle="Branch rate"
                                    tipBody="Shown for awareness; not a hard READY threshold in v1."
                                    testid="qa-cov-branch"
                                />
                                <KpiCard
                                    label="Gap to 95%"
                                    value={coverage.backend?.gap_to_gate != null ? `${coverage.backend.gap_to_gate}` : "—"}
                                    tipTitle="Gate gap"
                                    tipBody="max(0, 95 − percent). Soft mode warns only."
                                    testid="qa-cov-gap"
                                />
                                <KpiCard
                                    label="Gate"
                                    value={coverage.backend?.gate_passed ? "PASS" : "BELOW"}
                                    tipTitle="Gate status"
                                    tipBody="Whether line percent ≥ gate (default 95)."
                                    tone={coverage.backend?.gate_passed ? "ok" : "warning"}
                                    testid="qa-cov-gate"
                                />
                            </div>
                            {coverage.frontend && (
                                <AlertBanner variant="info" title="Frontend coverage" testid="qa-fe-cov-na">
                                    {coverage.frontend.note || "No Istanbul/nyc CI artifact ingested — shown as N/A."}
                                </AlertBanner>
                            )}
                            {(coverage.packages || []).length > 0 && (
                                <Panel title="Packages (top)" tipTitle="Packages" tipBody="Cobertura package rollup (normalized names)." testid="qa-cov-packages">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead className="text-muted-foreground text-left">
                                                <tr>
                                                    <th className="p-1.5">Package</th>
                                                    <th className="p-1.5">Line rate</th>
                                                    <th className="p-1.5">Branch rate</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {coverage.packages.slice(0, 30).map((p) => (
                                                    <tr key={p.name} className="border-t border-border">
                                                        <td className="p-1.5 font-mono">{p.name}</td>
                                                        <td className="p-1.5 font-mono">{formatPct((p.line_rate || 0) * 100)}</td>
                                                        <td className="p-1.5 font-mono">{formatPct((p.branch_rate || 0) * 100)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </Panel>
                            )}
                        </>
                    )}
                </div>
            )}

            {tab === "release" && (
                <div className="space-y-4" data-testid="qa-panel-release">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <SectionLabel
                            tipTitle="qa-readiness-v1"
                            tipBody="Hard gates: unit pass/fresh, golden pass/fresh, optional security/e2e, no critical defects, coverage if hard mode."
                        >
                            Release readiness
                        </SectionLabel>
                        {isAdmin && (
                            <DsButton
                                variant="secondary"
                                size="sm"
                                tooltip="Re-run readiness against latest stored artifacts"
                                onClick={onRecompute}
                                data-testid="qa-recompute"
                            >
                                Recompute
                            </DsButton>
                        )}
                    </div>
                    {!release?.available ? (
                        <EmptyState
                            title="No release snapshot"
                            description={release?.note || "Ingest artifacts to compute READY / NOT_READY."}
                            testid="qa-empty-release"
                        />
                    ) : (
                        <>
                            <div
                                className={`rounded-lg border p-4 flex flex-wrap items-center gap-4 ${
                                    release.verdict === "READY"
                                        ? "border-[var(--success-border)] bg-success-soft/30"
                                        : "border-[var(--error-border)] bg-error-soft/30"
                                }`}
                                data-testid="qa-verdict-banner"
                            >
                                {release.verdict === "READY" ? (
                                    <CheckCircle size={32} className="text-success" weight="fill"/>
                                ) : (
                                    <ShieldWarning size={32} className="text-error" weight="fill"/>
                                )}
                                <div>
                                    <div className="text-2xl font-bold tracking-tight">{release.verdict}</div>
                                    <div className="text-xs text-muted-foreground font-mono">
                                        score {release.score} · grade {release.grade} · mode {release.coverage_mode} ·{" "}
                                        {release.algorithm_version}
                                    </div>
                                </div>
                            </div>
                            <Panel title="Checklist" tipTitle="Gates" tipBody="Hard gates block READY; soft items are warnings." testid="qa-checklist">
                                <ul className="space-y-1.5 text-xs">
                                    {(release.checklist || []).map((c) => (
                                        <li key={c.id} className="flex items-start gap-2 font-mono" data-testid={`qa-gate-${c.id}`}>
                                            {c.passed ? (
                                                <CheckCircle size={14} className="text-success shrink-0 mt-0.5" weight="fill"/>
                                            ) : (
                                                <XCircle size={14} className="text-error shrink-0 mt-0.5" weight="fill"/>
                                            )}
                                            <span>
                                                <span className="font-semibold">{c.id}</span>
                                                {c.hard ? " [hard]" : " [soft]"}
                                                {c.note ? ` — ${c.note}` : ""}
                                                {c.value != null ? ` (value=${c.value}, thr=${c.threshold})` : ""}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </Panel>
                            {(release.soft_warnings || []).length > 0 && (
                                <AlertBanner variant="warning" title="Soft warnings" testid="qa-release-warnings">
                                    <ul className="list-disc pl-4 text-xs">
                                        {release.soft_warnings.map((w) => (
                                            <li key={w}>{w}</li>
                                        ))}
                                    </ul>
                                </AlertBanner>
                            )}
                        </>
                    )}
                </div>
            )}

            {tab === "admin" && isAdmin && (
                <div className="space-y-4" data-testid="qa-panel-admin">
                    <SectionLabel
                        tipTitle="Ingest"
                        tipBody="Upload JUnit XML and/or Cobertura coverage.xml. CI can POST with X-QA-Ingest-Token instead."
                    >
                        Artifact ingest
                    </SectionLabel>
                    <Panel title="Upload" tipTitle="Admin upload" tipBody="Multipart same as POST /qa/ingest." testid="qa-ingest-panel">
                        <form className="space-y-3 max-w-lg" onSubmit={onIngest}>
                            <label className="block text-xs">
                                <span className="text-muted-foreground font-medium">Build id</span>
                                <input
                                    className="sbp-input mt-1 w-full rounded-md px-2 py-1.5 text-sm font-mono"
                                    value={buildId}
                                    onChange={(e) => setBuildId(e.target.value)}
                                    data-testid="qa-ingest-build"
                                />
                            </label>
                            <label className="block text-xs">
                                <span className="text-muted-foreground font-medium inline-flex items-center gap-1">
                                    JUnit XML
                                    <HelpTip title="JUnit" body="pytest --junitxml=reports/junit-unit.xml" testid="tip-junit"/>
                                </span>
                                <input
                                    type="file"
                                    accept=".xml,text/xml,application/xml"
                                    className="mt-1 block w-full text-xs"
                                    data-testid="qa-ingest-junit"
                                    onChange={(e) => setJunitFile(e.target.files?.[0] || null)}
                                />
                            </label>
                            <label className="block text-xs">
                                <span className="text-muted-foreground font-medium inline-flex items-center gap-1">
                                    Coverage XML
                                    <HelpTip title="Coverage" body="make coverage → reports/coverage.xml (Cobertura)" testid="tip-cov"/>
                                </span>
                                <input
                                    type="file"
                                    accept=".xml,text/xml,application/xml"
                                    className="mt-1 block w-full text-xs"
                                    data-testid="qa-ingest-coverage"
                                    onChange={(e) => setCovFile(e.target.files?.[0] || null)}
                                />
                            </label>
                            <DsButton
                                type="submit"
                                loading={ingesting}
                                tooltip="Parse and store artifacts, recompute readiness"
                                data-testid="qa-ingest-submit"
                            >
                                <UploadSimple size={14}/>
                                Ingest artifacts
                            </DsButton>
                        </form>
                        <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
                            CI example: <code className="font-mono">X-QA-Ingest-Token</code> header + multipart{" "}
                            <code className="font-mono">junit</code> / <code className="font-mono">coverage</code> /{" "}
                            <code className="font-mono">meta</code>. Never put the service token in{" "}
                            <code className="font-mono">Authorization: Bearer</code>.
                        </p>
                    </Panel>
                </div>
            )}
        </div>
    );
}
