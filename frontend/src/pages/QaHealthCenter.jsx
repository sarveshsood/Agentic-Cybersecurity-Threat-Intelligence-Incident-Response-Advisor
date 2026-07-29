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
    {id: "recommendations", label: "Recommendations"},
    {id: "admin", label: "Admin", adminOnly: true},
];

function formatPct(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return `${Number(v).toFixed(1)}%`;
}

function StatusPill({status}) {
    const s = String(status || "not_run").toLowerCase();
    const ok = s === "passed" || s === "pass" || s === "ready";
    const bad = s === "failed" || s === "fail" || s === "error" || s === "not_ready";
    const skip = s === "skipped" || s === "manual" || s === "blocked";
    const cls = ok
        ? "bg-success-soft text-success border-[var(--success-border)]"
        : bad
          ? "bg-error-soft text-error border-[var(--error-border)]"
          : skip
            ? "bg-warning-soft text-warning border-[var(--warning-border)]"
            : "bg-muted text-muted-foreground border-border";
    return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${cls}`}>
            {ok ? <CheckCircle size={12} weight="fill"/> : bad ? <XCircle size={12} weight="fill"/> : <Warning size={12}/>}
            {status || "not_run"}
        </span>
    );
}

function fmtWhen(iso) {
    if (!iso) return "—";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
        return d.toLocaleString();
    } catch {
        return String(iso).slice(0, 19);
    }
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
    const [caseFilter, setCaseFilter] = useState({q: "", module: "", runner: "", automation: "", status: ""});
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [running, setRunning] = useState(false);
    const [runProgress, setRunProgress] = useState(null);
    const [lastBatch, setLastBatch] = useState(null);
    const [batches, setBatches] = useState([]);
    const [caseDetail, setCaseDetail] = useState(null);
    const [apiCaps, setApiCaps] = useState({
        cases: false,
        healthzPhase: null,
        playwright: null,
        verdict: null,
    });

    // Admin ingest form
    const [junitFile, setJunitFile] = useState(null);
    const [covFile, setCovFile] = useState(null);
    const [buildId, setBuildId] = useState("local-ui");
    const [ingesting, setIngesting] = useState(false);
    const [liveQualityRunning, setLiveQualityRunning] = useState(false);
    const [coverageMeta, setCoverageMeta] = useState(null);
    const [recommendations, setRecommendations] = useState([]);
    const [signals, setSignals] = useState([]);
    const [recLoading, setRecLoading] = useState(false);

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
                if (c) {
                    setCoverage(c);
                    setCoverageMeta({
                        source: c.source || null,
                        build_id: c.build?.id || null,
                        captured_at: c.captured_at || null,
                        live: String(c.source || "").includes("live"),
                    });
                }
                if (rel) setRelease(rel);
                if (uc) {
                    setCases(uc.items || []);
                    setCaseTotal(uc.catalog_total || uc.total || 0);
                    setCaseStats(uc.stats || null);
                    if (uc.last_batch) setLastBatch(uc.last_batch);
                    setApiCaps((prev) => ({...prev, cases: true}));
                    // Auto-seed once if catalog empty (admin only)
                    if ((uc.catalog_total || 0) === 0 && isAdmin) {
                        try {
                            await api.post("/qa/seed/catalog", null, {params: {force: false}});
                            const again = await api.get("/qa/cases", {params: {limit: 500}});
                            setCases(again.data?.items || []);
                            setCaseTotal(again.data?.catalog_total || again.data?.total || 0);
                            setCaseStats(again.data?.stats || null);
                            if (again.data?.last_batch) setLastBatch(again.data.last_batch);
                        } catch {
                            /* seed optional */
                        }
                    }
                } else {
                    // Do not keep stale catalog rows when /qa/cases is missing (old API process)
                    setApiCaps((prev) => ({...prev, cases: false}));
                    setCases([]);
                    setCaseTotal(0);
                    setCaseStats(null);
                    const casesErr = err(4);
                    if (casesErr?.response?.status === 404 && !silent) {
                        setError(
                            "Use-case API missing on this backend process (/qa/cases 404). Restart API from this repo with FEATURE_QA_HEALTH_CENTER=1 so catalog + Run buttons work.",
                        );
                    }
                }
                try {
                    const hz = await api.get("/qa/healthz");
                    const caps = hz.data?.capabilities || {};
                    setApiCaps((prev) => ({
                        ...prev,
                        healthzPhase: hz.data?.phase || null,
                        playwright: hz.data?.playwright_enabled ?? caps.e2e ?? null,
                        verdict: caps.verdict ?? true,
                    }));
                } catch {
                    /* ignore */
                }
            } catch (e) {
                const msg = apiErrorMessage(e) || "Failed to load QA Health";
                if (!silent) setError(msg);
            } finally {
                setLoading(false);
                setRefreshing(false);
            }
        },
        [isAdmin],
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
            // Omit build_id: use latest unit + golden + coverage across builds.
            // Passing summary.build_id (often ui-golden-*) hid unit suites and broke readiness.
            const r = await api.post("/qa/release/recompute", null, {timeout: 60000});
            const v = r.data?.verdict || "done";
            const blockers = r.data?.blockers || [];
            toast.success(
                blockers.length
                    ? `Recomputed: ${v} · blockers: ${blockers.join(", ")}`
                    : `Recomputed: ${v}`,
                {duration: 8000},
            );
            await load({silent: true});
            setTab("release");
        } catch (err) {
            toast.error(apiErrorMessage(err) || "Recompute failed");
        }
    };

    const onLiveQuality = async () => {
        if (!isAdmin) {
            toast.error("Live quality requires admin");
            return;
        }
        setLiveQualityRunning(true);
        toast.message("Running real pytest + coverage on this machine… may take several minutes", {
            duration: 12000,
        });
        try {
            const r = await api.post("/qa/live-quality", null, {timeout: 960000});
            const rel = r.data?.release || {};
            const pct = r.data?.coverage_percent ?? r.data?.ingest?.coverage?.percent;
            toast.success(
                `Live quality done · verdict ${rel.verdict || "—"} · coverage ${pct != null ? `${pct}%` : "—"} · build ${r.data?.build_id || "—"}`,
                {duration: 12000},
            );
            if (r.data?.pytest?.exit_code !== 0) {
                toast.message(
                    `pytest exit ${r.data.pytest.exit_code} (artifacts still ingested — check suite failures)`,
                    {duration: 10000},
                );
            }
            await load({silent: true});
            setTab("release");
        } catch (err) {
            if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
                toast.error(
                    "Live quality timed out in browser — backend may still be running. Wait, then Refresh.",
                    {duration: 12000},
                );
            } else {
                toast.error(apiErrorMessage(err) || "Live quality failed");
            }
        } finally {
            setLiveQualityRunning(false);
        }
    };

    const loadCases = useCallback(async () => {
        try {
            const params = {limit: 500};
            if (caseFilter.q) params.q = caseFilter.q;
            if (caseFilter.module) params.module = caseFilter.module;
            if (caseFilter.runner) params.runner = caseFilter.runner;
            if (caseFilter.automation) params.automation = caseFilter.automation;
            if (caseFilter.status) params.status = caseFilter.status;
            const r = await api.get("/qa/cases", {params});
            setCases(r.data?.items || []);
            setCaseTotal(r.data?.catalog_total || r.data?.total || 0);
            setCaseStats(r.data?.stats || null);
            if (r.data?.last_batch) setLastBatch(r.data.last_batch);
            setApiCaps((prev) => ({...prev, cases: true}));
        } catch (err) {
            setCases([]);
            setApiCaps((prev) => ({...prev, cases: false}));
            if (err?.response?.status !== 404) {
                toast.error(apiErrorMessage(err) || "Failed to load use cases");
            }
        }
    }, [caseFilter]);

    const loadBatches = useCallback(async () => {
        try {
            const r = await api.get("/qa/usecases/runs", {params: {limit: 10}});
            setBatches(r.data?.items || []);
            if (r.data?.items?.[0]) setLastBatch(r.data.items[0]);
        } catch {
            /* optional on old API */
        }
    }, []);

    useEffect(() => {
        if (flagOn && tab === "usecases") {
            loadCases();
            loadBatches();
        }
    }, [flagOn, tab, loadCases, loadBatches]);

    const loadRecommendations = useCallback(async () => {
        setRecLoading(true);
        try {
            const [r, s] = await Promise.all([
                api.get("/qa/recommendations", {params: {limit: 50}}),
                api.get("/qa/signals", {params: {limit: 100}}),
            ]);
            setRecommendations(r.data?.items || []);
            setSignals(s.data?.items || []);
        } catch (err) {
            if (err?.response?.status === 404) {
                toast.error(
                    "Recommendations routes missing — restart backend (FEATURE_QA_HEALTH_CENTER=1) from this repo.",
                    {duration: 10000},
                );
            } else {
                toast.error(apiErrorMessage(err) || "Failed to load recommendations");
            }
            setRecommendations([]);
            setSignals([]);
        } finally {
            setRecLoading(false);
        }
    }, []);

    const onRefreshRecommendations = async () => {
        try {
            setRecLoading(true);
            const r = await api.post("/qa/recommendations/refresh");
            toast.success(
                `Refreshed · ${r.data?.signal_count ?? 0} signals · ${r.data?.recommendation_count ?? 0} recommendations`,
            );
            await loadRecommendations();
        } catch (err) {
            const st = err?.response?.status;
            if (st === 404) {
                toast.error(
                    "Recommendations API not on this backend process (404). Restart API from this repo so POST /qa/recommendations/refresh is loaded.",
                    {duration: 12000},
                );
            } else {
                toast.error(apiErrorMessage(err) || "Refresh failed");
            }
        } finally {
            setRecLoading(false);
        }
    };

    const onRecStatus = async (id, status) => {
        try {
            await api.patch(`/qa/recommendations/${id}`, {status});
            toast.success(`Recommendation → ${status}`);
            await loadRecommendations();
        } catch (err) {
            toast.error(apiErrorMessage(err) || "Update failed");
        }
    };

    useEffect(() => {
        if (flagOn && (tab === "recommendations" || tab === "overview")) {
            loadRecommendations();
        }
    }, [flagOn, tab, loadRecommendations]);

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

    const applyRunResultsLocally = (results, batch) => {
        if (!Array.isArray(results) || !results.length) return;
        const now = new Date().toISOString();
        const byId = new Map(results.map((x) => [x.id, x]));
        setCases((prev) =>
            prev.map((c) => {
                const hit = byId.get(c.id);
                if (!hit) return c;
                return {
                    ...c,
                    status: hit.status || c.status,
                    last_run_at: now,
                    last_batch_id: hit.batch_id || batch?.id || c.last_batch_id,
                    last_run_id: hit.run_id || c.last_run_id,
                    run_count: (c.run_count || 0) + 1,
                    actual_last: hit.message || c.actual_last,
                    run_history: [
                        {
                            at: now,
                            status: hit.status,
                            batch_id: hit.batch_id,
                            run_id: hit.run_id,
                        },
                        ...(Array.isArray(c.run_history) ? c.run_history : []).slice(0, 24),
                    ],
                };
            }),
        );
        setCaseDetail((prev) => {
            if (!prev) return prev;
            const hit = byId.get(prev.id);
            if (!hit) return prev;
            return {
                ...prev,
                status: hit.status || prev.status,
                last_run_at: now,
                last_batch_id: hit.batch_id || batch?.id || prev.last_batch_id,
                last_run_id: hit.run_id || prev.last_run_id,
                run_count: (prev.run_count || 0) + 1,
                actual_last: hit.message || prev.actual_last,
                run_history: [
                    {
                        at: now,
                        status: hit.status,
                        batch_id: hit.batch_id,
                        run_id: hit.run_id,
                    },
                    ...(Array.isArray(prev.run_history) ? prev.run_history : []).slice(0, 24),
                ],
            };
        });
        // KPIs from batch counts when provided
        if (batch?.counts) {
            setCaseStats((prev) => ({
                ...(prev || {}),
                pass: batch.counts.pass ?? prev?.pass,
                fail: batch.counts.fail ?? prev?.fail,
                skipped: batch.counts.skipped ?? prev?.skipped,
                // After a full run, not_run should drop; leave exact until reload
                not_run: prev?.not_run,
            }));
        }
    };

    const onRunUseCases = async (scope, ids) => {
        if (!isAdmin) {
            toast.error("Running use cases requires admin");
            return;
        }
        if (!apiCaps.cases) {
            toast.error(
                "Use-case API not loaded on backend. Restart API (FEATURE_QA_HEALTH_CENTER=1) and hard-refresh the page.",
            );
            return;
        }
        setRunning(true);
        const scopeLabel =
            scope === "e2e"
                ? "E2E (Playwright browser only)"
                : scope === "all"
                  ? "All (golden + API smoke, no browser)"
                  : scope === "golden"
                    ? "Golden IR suite only"
                    : "Selected cases";
        setRunProgress({
            scope,
            message:
                scope === "e2e"
                    ? "E2E: Playwright only (1–3 min). Does not run golden or API smoke."
                    : scope === "all"
                      ? "All: golden IR + API smoke for full catalog. Does not open a browser."
                      : scope === "golden"
                        ? "Golden: offline IR suite only…"
                        : "Running selected cases…",
        });
        try {
            const body = {scope};
            if (ids?.length) {
                body.case_ids = ids;
                body.scope = "case";
            }
            // E2E Playwright can take several minutes
            const r = await api.post("/qa/usecases/run", body, {
                timeout: scope === "e2e" ? 360000 : scope === "all" ? 180000 : 120000,
            });
            const counts = r.data?.counts || {};
            const n = r.data?.result_count ?? 0;
            const batch = r.data?.batch || r.data;
            const results = r.data?.results || [];
            setLastBatch(batch);
            // Immediate UI update so status leaves not_run without waiting on reload race
            applyRunResultsLocally(results, batch);
            // Clear status filter so updated rows stay visible
            setCaseFilter((f) => (f.status ? {...f, status: ""} : f));
            setRunProgress({
                scope,
                message: `Done · ${scopeLabel}`,
                counts,
                batch_id: r.data?.batch_id,
                engines: r.data?.engines,
            });
            const blocked = counts.blocked || 0;
            const eng = r.data?.engines || {};
            const engBits = [
                eng.golden ? "golden" : null,
                eng.playwright ? "playwright" : null,
                eng.api_smoke ? "api_smoke" : null,
            ]
                .filter(Boolean)
                .join("+") || scope;
            toast.success(
                `${scopeLabel}: ${n} cases · pass ${counts.pass || 0} · fail ${counts.fail || 0}` +
                    (blocked ? ` · blocked ${blocked}` : "") +
                    ` · engines: ${engBits}`,
                {duration: 9000},
            );
            const pw = r.data?.playwright;
            if (scope === "e2e") {
                if (pw?.ran) {
                    toast.message(
                        `Playwright finished · mapped ${pw.test_count ?? "—"} TC` +
                            (pw.base_url ? ` · ${pw.base_url}` : "") +
                            (pw.reason ? ` · ${pw.reason}` : ""),
                        {duration: 10000},
                    );
                } else {
                    toast.error(
                        pw?.reason ||
                            "E2E did not run Playwright — need FE on :3000 and: npx playwright install chromium",
                        {duration: 12000},
                    );
                }
            }
            setTab("usecases");
            // Authoritative reload — do not apply status= filter (may hide just-updated rows)
            const reloadCases = async () => {
                try {
                    const params = {limit: 500};
                    if (caseFilter.q) params.q = caseFilter.q;
                    if (caseFilter.module) params.module = caseFilter.module;
                    if (caseFilter.runner) params.runner = caseFilter.runner;
                    if (caseFilter.automation) params.automation = caseFilter.automation;
                    const cr = await api.get("/qa/cases", {params});
                    setCases(cr.data?.items || []);
                    setCaseTotal(cr.data?.catalog_total || cr.data?.total || 0);
                    setCaseStats(cr.data?.stats || null);
                    if (cr.data?.last_batch) setLastBatch(cr.data.last_batch);
                    setApiCaps((prev) => ({...prev, cases: true}));
                } catch (e) {
                    if (e?.response?.status === 404) {
                        setApiCaps((prev) => ({...prev, cases: false}));
                    }
                }
            };
            await Promise.all([load({silent: true}), reloadCases(), loadBatches()]);
            // Refresh open detail from server if present
            if (caseDetail?.id) {
                try {
                    const d = await api.get(`/qa/cases/${caseDetail.id}`);
                    if (d.data) setCaseDetail(d.data);
                } catch {
                    /* keep local merge */
                }
            }
        } catch (err) {
            setRunProgress(null);
            const status = err?.response?.status;
            if (status === 404) {
                toast.error(
                    "Run endpoint missing (404). Restart the backend from this repo so POST /qa/usecases/run is registered.",
                    {duration: 10000},
                );
                setApiCaps((prev) => ({...prev, cases: false}));
            } else if (status === 400) {
                toast.error(apiErrorMessage(err) || "Bad run request (check scope / selected cases)");
            } else if (err?.code === "ECONNABORTED" || /timeout/i.test(err?.message || "")) {
                toast.error(
                    "Run timed out in the browser — backend may still be finishing. Wait 1–2 min, then click Reload.",
                    {duration: 12000},
                );
                await loadCases();
                await loadBatches();
            } else {
                toast.error(apiErrorMessage(err) || "Run failed");
            }
        } finally {
            setRunning(false);
        }
    };

    const onSeedCatalog = async () => {
        if (!apiCaps.cases) {
            toast.error("Seed API missing — restart backend so POST /qa/seed/catalog exists");
            return;
        }
        try {
            const r = await api.post("/qa/seed/catalog", null, {params: {force: true}});
            toast.success(`Catalog seeded: ${r.data?.upserted || r.data?.seed_count || 0} cases`);
            await loadCases();
        } catch (err) {
            if (err?.response?.status === 404) {
                toast.error("Seed endpoint 404 — restart backend with latest QA routes");
                setApiCaps((prev) => ({...prev, cases: false}));
            } else {
                toast.error(apiErrorMessage(err) || "Seed failed");
            }
        }
    };

    const onVerdict = async (caseId, status) => {
        if (!isAdmin) {
            toast.error("Verdict requires admin");
            return;
        }
        try {
            const r = await api.post(`/qa/cases/${caseId}/verdict`, {
                status,
                note: `UI verdict ${status}`,
            });
            const updated = r.data?.case;
            if (updated) {
                setCases((prev) => prev.map((c) => (c.id === caseId ? {...c, ...updated} : c)));
                setCaseDetail((prev) => (prev?.id === caseId ? {...prev, ...updated} : prev));
            }
            toast.success(`${caseId} → ${status}`);
            await loadCases();
            await loadBatches();
        } catch (err) {
            if (err?.response?.status === 404) {
                toast.error(
                    "Verdict API missing — restart backend so POST /qa/cases/{id}/verdict is registered",
                    {duration: 10000},
                );
            } else {
                toast.error(apiErrorMessage(err) || "Verdict failed");
            }
        }
    };

    const filteredHint = useMemo(() => {
        if (!caseStats) return `${cases.length} shown · catalog ${caseTotal || "—"}`;
        const st = caseStats;
        return (
            `${caseTotal} total · pass ${st.pass || 0} · fail ${st.fail || 0} · ` +
            `blocked ${st.blocked || 0} · skipped ${st.skipped || 0} · not_run ${st.not_run || 0} · showing ${cases.length}`
        );
    }, [caseStats, caseTotal, cases.length]);

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
                tipBody="Single source of truth for CI quality artifacts: JUnit results, code coverage vs 96% gate, and deterministic READY / NOT_READY."
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

            <Panel
                title="What works now (Phase 0)"
                tipTitle="Scope honesty"
                tipBody="Full enterprise TMS is multi-phase. This strip reflects live API capabilities."
                testid="qa-capability-strip"
            >
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs" data-testid="qa-capabilities">
                    <li className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-success" weight="fill"/> Overview KPIs + release readiness
                    </li>
                    <li className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-success" weight="fill"/> Suites / coverage ingest (Admin or CI token)
                    </li>
                    <li className="flex items-center gap-2">
                        {apiCaps.cases ? (
                            <CheckCircle size={14} className="text-success" weight="fill"/>
                        ) : (
                            <XCircle size={14} className="text-error"/>
                        )}
                        Use-case catalog ({caseTotal || "…"} TC-*) {apiCaps.cases ? "— API ready" : "— restart API for /qa/cases"}
                    </li>
                    <li className="flex items-center gap-2">
                        {isAdmin ? (
                            <CheckCircle size={14} className="text-success" weight="fill"/>
                        ) : (
                            <Warning size={14} className="text-warning"/>
                        )}
                        Run golden suite from UI {isAdmin ? "(admin)" : "(admin only)"}
                    </li>
                    <li className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-success" weight="fill"/>
                        API smoke for automation=auto · manual Pass/Fail verdict for UI/e2e
                    </li>
                    <li className="flex items-center gap-2 text-muted-foreground">
                        <Warning size={14}/> Not yet: RTM, security/ZAP dashboards, FE coverage, trends charts, PDF export
                    </li>
                </ul>
                {apiCaps.healthzPhase && (
                    <p className="text-[10px] font-mono text-muted-foreground mt-2">
                        API phase: {apiCaps.healthzPhase} · cases: {apiCaps.cases ? "yes" : "no"} · playwright:{" "}
                        {apiCaps.playwright == null ? "?" : apiCaps.playwright ? "yes" : "no"} · catalog: {caseTotal || 0}
                    </p>
                )}
                {isAdmin && (
                    <div className="flex flex-wrap gap-2 mt-3">
                        <DsButton
                            size="sm"
                            tooltip={
                                apiCaps.cases
                                    ? "Offline golden IR suite — updates golden-mapped use cases to pass/fail"
                                    : "Blocked: /qa/cases API missing — restart backend"
                            }
                            loading={running}
                            disabled={!apiCaps.cases}
                            onClick={() => onRunUseCases("golden")}
                            data-testid="qa-overview-run-golden"
                        >
                            <Play size={14}/>
                            Run golden suite
                        </DsButton>
                        <DsButton
                            size="sm"
                            variant="secondary"
                            tooltip="Open full use-case catalog"
                            onClick={() => setTab("usecases")}
                        >
                            <ListChecks size={14}/>
                            All use cases ({caseTotal || "…"})
                        </DsButton>
                    </div>
                )}
            </Panel>

            {!apiCaps.cases && (
                <AlertBanner variant="warning" title="Use-case routes not on this API process" testid="qa-cases-api-hint">
                    Restart the backend from this repo with FEATURE_QA_HEALTH_CENTER=1 so GET /qa/cases and POST /qa/usecases/run load.
                    Until then Run / Reseed buttons stay disabled and status cannot leave not_run. Core Overview / Suites / Coverage still work.
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
                            tipBody="Backend Cobertura line-rate percent. Org gate is 96% (.coveragerc / make coverage). Soft mode does not force NOT_READY alone."
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

                    {recommendations.length > 0 && (
                        <Panel
                            title="Top recommendations"
                            tipTitle="Advisory"
                            tipBody="Rule-based from coverage, suite failures, and catalog — never auto-blocks READY (KD-12)."
                            testid="qa-overview-recs"
                            actions={
                                <DsButton size="sm" variant="ghost" tooltip="Open recommendations tab" onClick={() => setTab("recommendations")}>
                                    View all
                                </DsButton>
                            }
                        >
                            <ul className="space-y-2 text-xs">
                                {recommendations.slice(0, 3).map((rec) => (
                                    <li key={rec.id} className="border border-border rounded px-2 py-1.5" data-testid={`qa-ov-rec-${rec.id}`}>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold">{rec.title}</span>
                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                risk {(Number(rec.risk_score) * 100).toFixed(0)}% · {rec.recommendation_type}
                                            </span>
                                            <StatusPill status={rec.status}/>
                                        </div>
                                        <p className="text-muted-foreground mt-0.5">{rec.explanation || rec.description}</p>
                                    </li>
                                ))}
                            </ul>
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
                                        disabled={!apiCaps.cases}
                                        tooltip={
                                            apiCaps.cases
                                                ? "ALL catalog: golden IR suite + API smoke. Does NOT run Playwright/browser."
                                                : "Blocked: restart backend so /qa/usecases/run exists"
                                        }
                                        onClick={() => onRunUseCases("all")}
                                        data-testid="qa-run-all"
                                    >
                                        <Play size={14}/>
                                        Run all (no browser)
                                    </DsButton>
                                    <DsButton
                                        size="sm"
                                        variant="secondary"
                                        loading={running}
                                        disabled={!apiCaps.cases}
                                        tooltip={
                                            apiCaps.cases
                                                ? "GOLDEN only: offline IR suite for runner=golden rows"
                                                : "Blocked: restart backend so /qa/usecases/run exists"
                                        }
                                        onClick={() => onRunUseCases("golden")}
                                        data-testid="qa-run-golden"
                                    >
                                        <Play size={14}/>
                                        Run golden only
                                    </DsButton>
                                    <DsButton
                                        size="sm"
                                        variant="secondary"
                                        loading={running}
                                        disabled={!apiCaps.cases}
                                        tooltip="E2E only: Playwright browser for TC-E2E-* + mapped UI. Does NOT run golden or API smoke. Needs SPA on :3000."
                                        onClick={() => onRunUseCases("e2e")}
                                        data-testid="qa-run-e2e"
                                    >
                                        <Play size={14}/>
                                        Run E2E only
                                    </DsButton>
                                    <DsButton
                                        size="sm"
                                        variant="secondary"
                                        loading={running}
                                        disabled={!apiCaps.cases || !selectedIds.size}
                                        tooltip="Selected rows via golden/API smoke (not Playwright). Use Run E2E only for browser."
                                        onClick={() => onRunUseCases("case", [...selectedIds])}
                                        data-testid="qa-run-selected"
                                    >
                                        <Play size={14}/>
                                        Run selected ({selectedIds.size})
                                    </DsButton>
                                    <DsButton
                                        size="sm"
                                        variant="secondary"
                                        disabled={!apiCaps.cases}
                                        tooltip="Refresh catalog definitions without wiping pass/fail status"
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
                                tooltip="Reload use case list and batch history"
                                onClick={() => {
                                    loadCases();
                                    loadBatches();
                                }}
                                data-testid="qa-reload-cases"
                            >
                                <ArrowClockwise size={14}/>
                                Reload
                            </DsButton>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" data-testid="qa-status-kpis">
                        <KpiCard label="Total" value={caseTotal || 0} tipTitle="Catalog" tipBody="All TC-* use cases." testid="qa-st-total"/>
                        <KpiCard label="Pass" value={caseStats?.pass ?? 0} tipTitle="Pass" tipBody="Golden suite + API smoke probes that passed." tone="success" testid="qa-st-pass"/>
                        <KpiCard label="Fail" value={caseStats?.fail ?? 0} tipTitle="Fail" tipBody="Automated runs that failed." tone="error" testid="qa-st-fail"/>
                        <KpiCard label="Blocked" value={caseStats?.blocked ?? 0} tipTitle="Blocked" tipBody="Needs manual Pass/Fail (UI/e2e or pure manual steps)." tone="warning" testid="qa-st-blocked"/>
                        <KpiCard label="Skipped" value={caseStats?.skipped ?? 0} tipTitle="Skipped" tipBody="Intentionally skipped (rare)." tone="warning" testid="qa-st-skip"/>
                        <KpiCard label="Not run" value={caseStats?.not_run ?? 0} tipTitle="Not run" tipBody="Never included in a UI run batch." testid="qa-st-notrun"/>
                    </div>
                    <div className="rounded border border-border bg-muted/20 px-3 py-2 text-[11px] space-y-1" data-testid="qa-scope-legend">
                        <p className="font-semibold text-foreground">Run scopes (separate engines)</p>
                        <ul className="text-muted-foreground space-y-0.5 list-disc pl-4">
                            <li>
                                <strong className="text-foreground">Run all (no browser)</strong> — full catalog:
                                golden IR + API smoke. Does <em>not</em> open Chromium.
                            </li>
                            <li>
                                <strong className="text-foreground">Run golden only</strong> — offline IR suite for{" "}
                                <code className="font-mono">runner=golden</code> rows only.
                            </li>
                            <li>
                                <strong className="text-foreground">Run E2E only</strong> — Playwright browser for{" "}
                                TC-E2E-* (+ mapped UI). Does <em>not</em> run golden or API smoke. Needs SPA on :3000.
                            </li>
                            <li>
                                <strong className="text-foreground">Blocked</strong> after all/selected = pure manual;
                                use Pass/Fail. Not the same as E2E.
                            </li>
                        </ul>
                    </div>

                    {(lastBatch || runProgress) && (
                        <Panel
                            title="Last run batch"
                            tipTitle="Batch tracking"
                            tipBody="Each button uses a different engine: all = golden+smoke; e2e = Playwright only; golden = IR suite only."
                            testid="qa-last-batch"
                        >
                            {running && (
                                <p className="text-xs text-primary font-medium mb-2" data-testid="qa-run-progress">
                                    {runProgress?.message || "Running…"}
                                </p>
                            )}
                            {lastBatch && (
                                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                    <div>
                                        <dt className="text-muted-foreground">Batch</dt>
                                        <dd className="font-mono text-[11px] truncate">{lastBatch.id || lastBatch.batch_id || "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">Scope</dt>
                                        <dd className="font-mono" data-testid="qa-last-batch-scope">
                                            {lastBatch.scope || "—"}
                                            {lastBatch.scope === "e2e"
                                                ? " · browser"
                                                : lastBatch.scope === "all"
                                                  ? " · no browser"
                                                  : lastBatch.scope === "golden"
                                                    ? " · IR only"
                                                    : ""}
                                        </dd>
                                    </div>
                                    {lastBatch.engines && (
                                        <div className="sm:col-span-2">
                                            <dt className="text-muted-foreground">Engines used</dt>
                                            <dd className="font-mono text-[11px]" data-testid="qa-last-batch-engines">
                                                {[
                                                    lastBatch.engines.golden && "golden",
                                                    lastBatch.engines.playwright && "playwright",
                                                    lastBatch.engines.api_smoke && "api_smoke",
                                                ]
                                                    .filter(Boolean)
                                                    .join(" + ") || "—"}
                                            </dd>
                                        </div>
                                    )}
                                    <div>
                                        <dt className="text-muted-foreground">Finished</dt>
                                        <dd>{fmtWhen(lastBatch.finished_at)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-muted-foreground">Results</dt>
                                        <dd className="font-mono">
                                            P{lastBatch.counts?.pass ?? 0}/F{lastBatch.counts?.fail ?? 0}
                                            /B{lastBatch.counts?.blocked ?? 0}/S{lastBatch.counts?.skipped ?? 0}
                                            {" · "}T{lastBatch.counts?.total ?? 0}
                                        </dd>
                                    </div>
                                </dl>
                            )}
                            {batches.length > 1 && (
                                <div className="mt-3 overflow-x-auto">
                                    <table className="w-full text-[11px]" data-testid="qa-batch-history">
                                        <thead className="text-muted-foreground text-left">
                                            <tr>
                                                <th className="p-1">When</th>
                                                <th className="p-1">Scope</th>
                                                <th className="p-1">Pass</th>
                                                <th className="p-1">Fail</th>
                                                <th className="p-1">Skip</th>
                                                <th className="p-1">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {batches.slice(0, 8).map((b) => (
                                                <tr key={b.id} className="border-t border-border">
                                                    <td className="p-1 whitespace-nowrap">{fmtWhen(b.finished_at)}</td>
                                                    <td className="p-1 font-mono">{b.scope}</td>
                                                    <td className="p-1 font-mono">{b.counts?.pass ?? 0}</td>
                                                    <td className="p-1 font-mono">{b.counts?.fail ?? 0}</td>
                                                    <td className="p-1 font-mono">{b.counts?.skipped ?? 0}</td>
                                                    <td className="p-1 font-mono">{b.counts?.total ?? 0}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Panel>
                    )}

                    <p className="text-xs text-muted-foreground" data-testid="qa-usecase-stats">
                        {filteredHint || `${cases.length} shown`}
                        {!isAdmin && " · Sign in as admin to run use cases"}
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
                        <label className="text-xs">
                            <span className="text-muted-foreground">Status</span>
                            <select
                                className="sbp-input mt-0.5 block rounded-md px-2 py-1.5 text-sm"
                                value={caseFilter.status}
                                onChange={(e) => setCaseFilter((f) => ({...f, status: e.target.value}))}
                                data-testid="qa-filter-status"
                            >
                                <option value="">All</option>
                                <option value="pass">pass</option>
                                <option value="fail">fail</option>
                                <option value="blocked">blocked</option>
                                <option value="skipped">skipped</option>
                                <option value="not_run">not_run</option>
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
                            title={apiCaps.cases ? "No use cases" : "Use-case API not available"}
                            description={
                                apiCaps.cases
                                    ? "Click Reseed catalog (admin) or ensure backend/data/qa_catalog_seed_v1.json is present."
                                    : "Restart the API process so GET /qa/cases is registered, then click Reload."
                            }
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
                                        <th className="p-2 font-medium">Runner</th>
                                        <th className="p-2 font-medium">Status</th>
                                        <th className="p-2 font-medium">Last run</th>
                                        <th className="p-2 font-medium">Runs</th>
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
                                            <td className="p-2 font-mono">{c.runner}</td>
                                            <td className="p-2"><StatusPill status={c.status}/></td>
                                            <td className="p-2 text-[11px] whitespace-nowrap text-muted-foreground">
                                                {fmtWhen(c.last_run_at)}
                                            </td>
                                            <td className="p-2 font-mono text-[11px]">{c.run_count ?? 0}</td>
                                            <td className="p-2">
                                                <div className="flex flex-wrap gap-1">
                                                    {isAdmin && (
                                                        <DsButton
                                                            size="sm"
                                                            variant="ghost"
                                                            disabled={!apiCaps.cases}
                                                            tooltip={
                                                                !apiCaps.cases
                                                                    ? "API missing — restart backend"
                                                                    : c.runner === "golden"
                                                                      ? `Execute golden suite for ${c.id}`
                                                                      : c.automation === "auto"
                                                                        ? `API smoke for ${c.id}`
                                                                        : `Probe / block ${c.id} for manual verdict`
                                                            }
                                                            loading={running}
                                                            onClick={() => onRunUseCases("case", [c.id])}
                                                        >
                                                            <Play size={12}/>
                                                            Run
                                                        </DsButton>
                                                    )}
                                                    {isAdmin && (
                                                        <>
                                                            <DsButton
                                                                size="sm"
                                                                variant="ghost"
                                                                tooltip={`Mark ${c.id} pass`}
                                                                onClick={() => onVerdict(c.id, "pass")}
                                                            >
                                                                Pass
                                                            </DsButton>
                                                            <DsButton
                                                                size="sm"
                                                                variant="ghost"
                                                                tooltip={`Mark ${c.id} fail`}
                                                                onClick={() => onVerdict(c.id, "fail")}
                                                            >
                                                                Fail
                                                            </DsButton>
                                                        </>
                                                    )}
                                                    <DsButton
                                                        size="sm"
                                                        variant="ghost"
                                                        tooltip="View steps / expected / history"
                                                        onClick={() => setCaseDetail(c)}
                                                    >
                                                        View
                                                    </DsButton>
                                                </div>
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
                            {isAdmin && (
                                <div className="flex flex-wrap gap-2 mb-3">
                                    <DsButton
                                        size="sm"
                                        tooltip="Mark this use case passed after manual review"
                                        onClick={() => onVerdict(caseDetail.id, "pass")}
                                        data-testid="qa-verdict-pass"
                                    >
                                        <CheckCircle size={14}/>
                                        Mark pass
                                    </DsButton>
                                    <DsButton
                                        size="sm"
                                        variant="secondary"
                                        tooltip="Mark this use case failed"
                                        onClick={() => onVerdict(caseDetail.id, "fail")}
                                        data-testid="qa-verdict-fail"
                                    >
                                        <XCircle size={14}/>
                                        Mark fail
                                    </DsButton>
                                    <DsButton
                                        size="sm"
                                        variant="ghost"
                                        tooltip="Blocked pending environment / data"
                                        onClick={() => onVerdict(caseDetail.id, "blocked")}
                                    >
                                        Mark blocked
                                    </DsButton>
                                    {apiCaps.cases && (
                                        <DsButton
                                            size="sm"
                                            variant="secondary"
                                            loading={running}
                                            tooltip="Re-run automated probe for this case"
                                            onClick={() => onRunUseCases("case", [caseDetail.id])}
                                        >
                                            <Play size={14}/>
                                            Re-run probe
                                        </DsButton>
                                    )}
                                </div>
                            )}
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                <div><dt className="text-muted-foreground">Module</dt><dd className="font-medium">{caseDetail.module}</dd></div>
                                <div><dt className="text-muted-foreground">Runner</dt><dd className="font-mono">{caseDetail.runner}</dd></div>
                                <div><dt className="text-muted-foreground">Automation</dt><dd className="font-mono">{caseDetail.automation}</dd></div>
                                <div><dt className="text-muted-foreground">Priority</dt><dd>{caseDetail.priority}</dd></div>
                                <div><dt className="text-muted-foreground">Status</dt><dd><StatusPill status={caseDetail.status}/></dd></div>
                                <div><dt className="text-muted-foreground">Last run</dt><dd>{fmtWhen(caseDetail.last_run_at)}</dd></div>
                                <div><dt className="text-muted-foreground">Run count</dt><dd className="font-mono">{caseDetail.run_count ?? 0}</dd></div>
                                <div className="sm:col-span-2"><dt className="text-muted-foreground">Steps</dt><dd className="mt-0.5">{caseDetail.description}</dd></div>
                                <div className="sm:col-span-2"><dt className="text-muted-foreground">Expected</dt><dd className="mt-0.5">{caseDetail.expected}</dd></div>
                                {caseDetail.actual_last && (
                                    <div className="sm:col-span-2"><dt className="text-muted-foreground">Last actual</dt><dd className="mt-0.5 font-mono text-[11px] whitespace-pre-wrap">{caseDetail.actual_last}</dd></div>
                                )}
                            </dl>
                            {Array.isArray(caseDetail.run_history) && caseDetail.run_history.length > 0 && (
                                <div className="mt-3">
                                    <SectionLabel tipTitle="History" tipBody="Last N runs for this use case (newest first).">
                                        Run history
                                    </SectionLabel>
                                    <ul className="mt-1 space-y-1 text-[11px] font-mono max-h-40 overflow-y-auto">
                                        {caseDetail.run_history.map((h, i) => (
                                            <li key={`${h.at}-${i}`} className="border-t border-border pt-1">
                                                {fmtWhen(h.at)} · {h.status} · batch {h.batch_id || "—"}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
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
                        <EmptyState
                            title="No suite runs"
                            description="Ingest JUnit XML from the Admin tab or CI (POST /qa/ingest). Golden UI runs also appear after Run golden."
                            testid="qa-empty-runs"
                            action={
                                isAdmin
                                    ? {label: "Open Admin ingest", onClick: () => setTab("admin")}
                                    : undefined
                            }
                        />
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
                        tipBody="Backend Cobertura root line-rate from last ingested snapshot (live pytest or CI upload). Gate 96%."
                    >
                        Code coverage
                    </SectionLabel>
                    {coverage?.available && (
                        <p className="text-[11px] text-muted-foreground font-mono" data-testid="qa-coverage-provenance">
                            source={coverage.source || "—"} · build={coverage.build?.id || "—"} · captured=
                            {coverage.captured_at ? String(coverage.captured_at).slice(0, 19) : "—"}
                            {String(coverage.source || "").includes("live")
                                ? " · LIVE measured"
                                : coverage.source === "lab"
                                  ? " · LAB/fixture (not production measure)"
                                  : ""}
                        </p>
                    )}
                    {!coverage?.available ? (
                        <EmptyState
                            title="No coverage snapshot"
                            description={coverage?.note || "Upload coverage.xml from make coverage / CI via Admin → Ingest."}
                            testid="qa-empty-coverage"
                            action={
                                isAdmin
                                    ? {label: "Open Admin ingest", onClick: () => setTab("admin")}
                                    : undefined
                            }
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
                                    label="Gap to 96%"
                                    value={coverage.backend?.gap_to_gate != null ? `${coverage.backend.gap_to_gate}` : "—"}
                                    tipTitle="Gate gap"
                                    tipBody="max(0, 96 − percent). Soft mode warns only."
                                    testid="qa-cov-gap"
                                />
                                <KpiCard
                                    label="Gate"
                                    value={coverage.backend?.gate_passed ? "PASS" : "BELOW"}
                                    tipTitle="Gate status"
                                    tipBody="Whether line percent ≥ gate (default 96%)."
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
                            <div className="flex flex-wrap gap-2">
                                <DsButton
                                    variant="primary"
                                    size="sm"
                                    loading={liveQualityRunning}
                                    tooltip="Run real pytest+coverage on API host and ingest (replaces fixtures)"
                                    onClick={onLiveQuality}
                                    data-testid="qa-release-live-quality"
                                >
                                    <Play size={14}/>
                                    Run live quality
                                </DsButton>
                                <DsButton
                                    variant="secondary"
                                    size="sm"
                                    tooltip="Re-run readiness against latest stored artifacts (no new tests)"
                                    onClick={onRecompute}
                                    data-testid="qa-recompute"
                                >
                                    Recompute
                                </DsButton>
                            </div>
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
                            <AlertBanner
                                variant="info"
                                title="Why unit_pass is often red"
                                testid="qa-unit-gate-hint"
                            >
                                <span className="text-xs">
                                    <code className="font-mono">unit_pass</code> /{" "}
                                    <code className="font-mono">unit_fresh</code> need a <strong>passed</strong>{" "}
                                    JUnit suite with <code className="font-mono">suite_type=unit</code>.
                                    Running golden from the UI only satisfies golden gates. Ingest{" "}
                                    <code className="font-mono">backend/tests/fixtures/qa/sample_junit_pass.xml</code>{" "}
                                    from Admin (or CI). Coverage gate is <strong>≥ 96%</strong> (not 100%); soft mode
                                    never alone forces NOT_READY.
                                </span>
                            </AlertBanner>
                            <Panel title="Checklist" tipTitle="Gates" tipBody="Hard gates block READY; soft items are warnings. Notes explain missing/failed evidence." testid="qa-checklist">
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

            {tab === "recommendations" && (
                <div className="space-y-4" data-testid="qa-panel-recommendations">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <SectionLabel
                            tipTitle="Test recommendations"
                            tipBody="TestRecommendationSignal → TestRecommendation. Advisory only (KD-12). Built from live coverage, JUnit, catalog, readiness."
                        >
                            Recommendations
                        </SectionLabel>
                        <div className="flex flex-wrap gap-2">
                            {isAdmin && (
                                <DsButton
                                    size="sm"
                                    loading={recLoading}
                                    tooltip="Rebuild signals from current Mongo QA artifacts"
                                    onClick={onRefreshRecommendations}
                                    data-testid="qa-recs-refresh"
                                >
                                    <ArrowClockwise size={14}/>
                                    Refresh from live data
                                </DsButton>
                            )}
                            <DsButton size="sm" variant="secondary" tooltip="Reload list" onClick={loadRecommendations}>
                                Reload
                            </DsButton>
                        </div>
                    </div>
                    <AlertBanner variant="info" title="Advisory only" testid="qa-recs-advisory">
                        Recommendations never force NOT_READY alone. They rank coverage gaps, failing tests, flaky suites,
                        and blocked catalog cases so you know what to fix next.
                    </AlertBanner>

                    {recLoading && !recommendations.length ? (
                        <ListState variant="loading" message="Loading recommendations…"/>
                    ) : !recommendations.length ? (
                        <EmptyState
                            title="No recommendations yet"
                            description="Click Refresh from live data (admin) after a live quality run or artifact ingest."
                            testid="qa-empty-recs"
                            action={
                                isAdmin
                                    ? {label: "Refresh from live data", onClick: onRefreshRecommendations}
                                    : undefined
                            }
                        />
                    ) : (
                        <div className="space-y-3" data-testid="qa-recs-list">
                            {recommendations.map((rec) => (
                                <Panel
                                    key={rec.id}
                                    title={rec.title}
                                    tipTitle={rec.recommendation_type}
                                    tipBody={rec.explanation || rec.description}
                                    testid={`qa-rec-${rec.id}`}
                                    actions={
                                        isAdmin ? (
                                            <div className="flex flex-wrap gap-1">
                                                <DsButton size="sm" variant="ghost" tooltip="Accept" onClick={() => onRecStatus(rec.id, "accepted")}>
                                                    Accept
                                                </DsButton>
                                                <DsButton size="sm" variant="ghost" tooltip="Reject" onClick={() => onRecStatus(rec.id, "rejected")}>
                                                    Reject
                                                </DsButton>
                                                <DsButton size="sm" variant="ghost" tooltip="Mark implemented" onClick={() => onRecStatus(rec.id, "implemented")}>
                                                    Done
                                                </DsButton>
                                            </div>
                                        ) : null
                                    }
                                >
                                    <div className="flex flex-wrap gap-2 text-[11px] font-mono mb-2">
                                        <StatusPill status={rec.status}/>
                                        <span>type={rec.recommendation_type}</span>
                                        <span>risk={(Number(rec.risk_score) * 100).toFixed(0)}%</span>
                                        <span>conf={(Number(rec.confidence) * 100).toFixed(0)}%</span>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{rec.description}</p>
                                    {rec.explanation && (
                                        <p className="text-xs mt-1">{rec.explanation}</p>
                                    )}
                                    {Array.isArray(rec.related_entities) && rec.related_entities.length > 0 && (
                                        <p className="text-[11px] font-mono text-muted-foreground mt-2 break-all">
                                            entities: {rec.related_entities.slice(0, 12).join(", ")}
                                            {rec.related_entities.length > 12 ? "…" : ""}
                                        </p>
                                    )}
                                    {Array.isArray(rec.suggested_test_cases) && rec.suggested_test_cases.length > 0 && (
                                        <ul className="mt-2 text-[11px] font-mono space-y-0.5 max-h-28 overflow-y-auto">
                                            {rec.suggested_test_cases.slice(0, 8).map((t, i) => (
                                                <li key={i} className="border-t border-border pt-0.5">
                                                    {t.nodeid || t.focus || t.action || JSON.stringify(t).slice(0, 120)}
                                                    {t.message ? ` — ${String(t.message).slice(0, 80)}` : ""}
                                                    {t.hint ? ` — ${t.hint}` : ""}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </Panel>
                            ))}
                        </div>
                    )}

                    {signals.length > 0 && (
                        <Panel
                            title={`Signals (${signals.length})`}
                            tipTitle="TestRecommendationSignal"
                            tipBody="Atomic inputs: coverage_gap, failure_rate, flakiness, blocked_manual, etc."
                            testid="qa-signals-panel"
                        >
                            <div className="overflow-x-auto max-h-64 overflow-y-auto">
                                <table className="w-full text-[11px]" data-testid="qa-signals-table">
                                    <thead className="text-muted-foreground text-left sticky top-0 bg-card">
                                        <tr>
                                            <th className="p-1">Type</th>
                                            <th className="p-1">Entity</th>
                                            <th className="p-1">Value</th>
                                            <th className="p-1">Source</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {signals.slice(0, 80).map((s) => (
                                            <tr key={s.id} className="border-t border-border">
                                                <td className="p-1 font-mono">{s.signal_type}</td>
                                                <td className="p-1 font-mono truncate max-w-[14rem]" title={s.entity_id}>
                                                    {s.entity_type}:{s.entity_id}
                                                </td>
                                                <td className="p-1 font-mono">{Number(s.value).toFixed(3)}</td>
                                                <td className="p-1 font-mono">{s.source}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    )}
                </div>
            )}

            {tab === "admin" && isAdmin && (
                <div className="space-y-4" data-testid="qa-panel-admin">
                    <SectionLabel
                        tipTitle="Live quality"
                        tipBody="Generate real pytest JUnit + Cobertura on this machine and ingest — replaces lab fixtures."
                    >
                        Real-time quality (measured)
                    </SectionLabel>
                    <Panel
                        title="Run live pytest + coverage"
                        tipTitle="Live quality"
                        tipBody="POST /qa/live-quality — real unit suite with pytest-cov. Not sample_coverage.xml. May take several minutes."
                        testid="qa-live-quality-panel"
                    >
                        <p className="text-xs text-muted-foreground mb-3">
                            This runs <strong>real</strong> backend tests and coverage on the API host, then updates
                            Suites / Coverage / Release. Prefer this over lab fixtures for honest numbers.
                            {coverageMeta?.source && (
                                <>
                                    {" "}Current stored coverage source:{" "}
                                    <code className="font-mono">{coverageMeta.source}</code>
                                    {coverageMeta.live ? " (live)" : " (may be fixture/CI upload)"}.
                                </>
                            )}
                        </p>
                        <DsButton
                            loading={liveQualityRunning}
                            tooltip="Run real pytest + pytest-cov and ingest (admin)"
                            onClick={onLiveQuality}
                            data-testid="qa-live-quality-run"
                        >
                            <Play size={14}/>
                            Run live unit + coverage
                        </DsButton>
                    </Panel>

                    <SectionLabel
                        tipTitle="Ingest"
                        tipBody="Upload JUnit XML and/or Cobertura coverage.xml. CI can POST with X-QA-Ingest-Token instead."
                    >
                        Artifact ingest (upload / CI)
                    </SectionLabel>
                    <Panel title="Upload" tipTitle="Admin upload" tipBody="Multipart same as POST /qa/ingest." testid="qa-ingest-panel">
                        <p className="text-xs text-muted-foreground mb-3">
                            Upload <strong>real</strong> CI artifacts (<code className="font-mono">reports/junit-unit.xml</code>,{" "}
                            <code className="font-mono">reports/coverage.xml</code>). Gate is <strong>≥ 96%</strong> line rate.
                            Soft mode warns only when below gate.
                        </p>
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
