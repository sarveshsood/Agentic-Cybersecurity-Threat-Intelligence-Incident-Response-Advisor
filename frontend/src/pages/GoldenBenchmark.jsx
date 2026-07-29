import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {api, apiErrorMessage} from "../lib/api";
import {toast} from "sonner";
import {
    ArrowClockwise,
    BookOpenText,
    CaretDown,
    ChartBar,
    CheckCircle,
    Download,
    Flask,
    Info,
    Lightning,
    ListChecks,
    Play,
    Question,
    ShieldCheck,
    Timer,
    Upload,
    Warning,
    XCircle,
} from "@phosphor-icons/react";
import {DataTable, PageHeader} from "../design-system";
import {HelpTip} from "../components/HelpTip";
import {ListState} from "../components/ListState";
import {formatDateTime} from "../lib/uiPrefs";

/** Metric + column help — keep in sync with backend/golden_eval.py */
const METRIC_HELP = {
    n_cases: {
        label: "Cases",
        short: "How many golden fixtures ran successfully (errors excluded from means).",
        detail: "CI requires at least min_cases (default 30). The dataset ships with synthetic IR log snippets.",
        good: "At or above the gate — dataset is large enough for a stable check.",
        bad: "Below the gate — regenerate or restore backend/tests/golden/dataset.json.",
    },
    mean_ioc_f1: {
        label: "Mean IoC F1",
        short: "Balance of precision & recall on extracted IoCs vs gold labels.",
        detail: "Each case compares predicted (type, value) pairs to expected IoCs (case-insensitive). Gate default ≥ 0.85.",
        good: "Extractor is finding the right IPs/domains/hashes/CVEs without flooding false positives.",
        bad: "Regression in ioc_extractor, private-IP filters, or gold labels out of date.",
    },
    mean_technique_recall: {
        label: "Mean tech recall",
        short: "Share of expected MITRE ATT&CK techniques the pipeline recovered.",
        detail: "Recall = |predicted ∩ gold| / |gold| over technique IDs (e.g. T1110). Gate default ≥ 0.80.",
        good: "Keyword → ATT&CK mapping still hits the labeled techniques for each scenario.",
        bad: "infer_techniques heuristics or KB technique map regressed.",
    },
    mean_grounding: {
        label: "Mean grounding",
        short: "Fraction of playbook steps that cite a KB document.",
        detail: "On the offline path the playbook is the deterministic template fallback. Gate default ≥ 0.50.",
        good: "Template playbook still attaches citations from BM25 / technique docs.",
        bad: "RAG retrieval or fallback playbook steps lost citation_ids.",
    },
    full_phase_fraction: {
        label: "Full phase frac",
        short: "Share of cases that include all required IR phases.",
        detail: "Required phases: containment, eradication, recovery, lessons_learned. Gate default ≥ 1.0.",
        good: "Every case’s playbook covers the full IR lifecycle.",
        bad: "Template playbook phases incomplete or renamed — CI will fail.",
    },
    mean_latency_s: {
        label: "Mean latency",
        short: "Average wall time for the offline slice per case (seconds).",
        detail: "Measures extract → mock enrich → techniques → template playbook only. Gate default ≤ 7.0s mean.",
        good: "Offline path stays snappy under the CI budget.",
        bad: "Unexpected slowdown in extract/enrich/RAG on this host.",
    },
    n_errors: {
        label: "Case errors",
        short: "Cases that threw during evaluation.",
        detail: "Any exception while running a fixture counts as an error. Gate requires 0 errors.",
        good: "Every fixture completed.",
        bad: "Code path crash or bad fixture — fix before trusting other means.",
    },
};

const COLUMN_HELP = {
    id: "Stable fixture id from dataset.json.",
    name: "Human-readable scenario name.",
    ioc_f1: "Per-case IoC F1 vs gold.",
    technique_recall: "Per-case ATT&CK technique recall.",
    grounding_score: "Template playbook grounding for this case.",
    phase_coverage: "Share of required IR phases present.",
    latency_s: "Seconds for this case’s offline pipeline slice.",
    severity: "Heuristic severity from mock threat scores + technique count.",
    techniques: "Predicted MITRE technique IDs for this run.",
};

const INTERPRET_STEPS = [
    {
        title: "Real-Time Execution",
        body: "Clicking 'Run validation' triggers an immediate live execution of all golden fixtures against the backend pipeline, computing live metrics on demand.",
    },
    {
        title: "Graphical Distributions",
        body: "Use the pass/fail ratio bar and per-case latency chart (slowest first, colors vs CI gate) to spot outliers and bound performance.",
    },
    {
        title: "Dataset Management",
        body: "Download the current golden dataset or upload/append new JSON test fixtures directly from the header controls.",
    },
    {
        title: "Troubleshooting",
        body: "If gates fail, inspect per-case rows highlighted in red or use the 'Weak / failed only' filter to isolate regressions.",
    },
];

function Card({children, className = "", testid}) {
    return (
        <div data-testid={testid} className={`soc-card p-4 ${className}`}>
            {children}
        </div>
    );
}

function MetricCard({metricKey, value, threshold, pass, unit = "", invert = false, testid}) {
    const help = METRIC_HELP[metricKey] || {label: metricKey, short: "", detail: "", good: "", bad: ""};
    const thrLabel = invert ? `≤ ${threshold}${unit}` : `≥ ${threshold}${unit}`;
    const ok = pass !== false && pass !== true ? null : pass;
    return (
        <Card testid={testid} className="hover:border-primary/30 transition-colors">
            <div className="soc-label flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1">
          {help.label}
            <HelpTip title={help.label} testid={`help-metric-${metricKey}`}>
            <p>{help.short}</p>
            <p>{help.detail}</p>
            <p className="text-success"><span className="text-success">Good:</span> {help.good}</p>
            <p className="text-error/80"><span className="text-error">Bad:</span> {help.bad}</p>
            <p className="font-mono text-muted-foreground">CI gate {thrLabel}</p>
          </HelpTip>
        </span>
                {ok === true && <CheckCircle size={14} className="text-success" weight="fill" title="Gate passed"/>}
                {ok === false && <XCircle size={14} className="text-error" weight="fill" title="Gate failed"/>}
            </div>
            <div
                className={`mt-1.5 font-mono text-2xl ${ok === false ? "text-error" : ok === true ? "text-success" : "text-primary"}`}>
                {value ?? "—"}{unit && value != null ?
                <span className="text-sm text-muted-foreground ml-0.5">{unit}</span> : null}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1 font-mono">gate {thrLabel}</div>
        </Card>
    );
}

function Th({children, helpKey}) {
    return (
        <th className="py-2 px-2 font-medium">
      <span className="inline-flex items-center gap-1">
        {children}
          {helpKey && COLUMN_HELP[helpKey] && (
              <HelpTip title={String(children)} side="top" testid={`help-col-${helpKey}`}>
                  <p>{COLUMN_HELP[helpKey]}</p>
              </HelpTip>
          )}
      </span>
        </th>
    );
}

function pct(v) {
    if (v == null || Number.isNaN(Number(v))) return "—";
    return Number(v).toFixed(3);
}

/** Format seconds: ms when sub-second (offline path is often 1–5ms). */
function formatLatency(seconds) {
    if (seconds == null || !Number.isFinite(Number(seconds))) return "—";
    const s = Number(seconds);
    if (s < 1) return `${(s * 1000).toFixed(1)}ms`;
    return `${s.toFixed(3)}s`;
}

function gatePass(summary, thresholds) {
    if (!summary || !thresholds) return {};
    return {
        n_cases: (summary.n_cases ?? 0) >= (thresholds.min_cases ?? 0),
        mean_ioc_f1: (summary.mean_ioc_f1 ?? 0) >= (thresholds.min_ioc_f1 ?? 0),
        mean_technique_recall: (summary.mean_technique_recall ?? 0) >= (thresholds.min_technique_recall ?? 0),
        mean_grounding: (summary.mean_grounding ?? 0) >= (thresholds.min_mean_grounding ?? 0),
        full_phase_fraction: (summary.full_phase_fraction ?? 0) >= (thresholds.min_phase_coverage ?? 0),
        mean_latency_s: (summary.mean_latency_s ?? 999) <= (thresholds.max_mean_latency_s ?? 999),
        n_errors: (summary.n_errors ?? 0) === 0,
    };
}

/** Solid theme colors (bg-success etc. are not defined as fill utilities). */
const LAT_COLORS = {
    fast: "var(--success)",
    mid: "var(--warning)",
    slow: "var(--error)",
    track: "var(--muted)",
    border: "var(--border)",
};

function latencyBand(lat, gateS, fastS) {
    if (lat == null || !Number.isFinite(lat)) return "mid";
    if (lat > gateS) return "slow";
    if (lat <= fastS) return "fast";
    return "mid";
}

export default function GoldenBenchmark() {
    const [meta, setMeta] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [running, setRunning] = useState(false);
    const [runElapsed, setRunElapsed] = useState(0);
    const [sortKey, setSortKey] = useState("ioc_f1");
    const [filterWeak, setFilterWeak] = useState(false);
    const [guideOpen, setGuideOpen] = useState(true);
    const [liveLlm, setLiveLlm] = useState(false);
    const runStartedAt = useRef(null);

    const loadMeta = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const r = await api.get("/eval/golden-benchmark");
            setMeta(r.data);
            if (r.data?.last_run) setResult(r.data.last_run);
            setLoadError(null);
        } catch (e) {
            const msg = e?.userMessage || e?.response?.data?.detail || "Could not load golden benchmark meta";
            setLoadError(msg);
            toast.error(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMeta();
    }, [loadMeta]);

    useEffect(() => {
        if (!running) return undefined;
        runStartedAt.current = Date.now();
        setRunElapsed(0);
        const t = setInterval(() => {
            if (runStartedAt.current) {
                setRunElapsed(Math.floor((Date.now() - runStartedAt.current) / 1000));
            }
        }, 250);
        return () => clearInterval(t);
    }, [running]);

    const run = async () => {
        if (liveLlm) {
            const ok = window.confirm(
                "Live LLM sample runs the first 5 golden cases with real playbook generation.\n\n" +
                "This uses your configured LLM API keys and may incur cost. Mock TI still applies.\n\n" +
                "Continue?",
            );
            if (!ok) return;
        }
        setRunning(true);
        try {
            const r = await api.post("/eval/golden-benchmark", null, {
                params: liveLlm ? {live_llm: true} : undefined,
                timeout: liveLlm ? 600000 : 300000,
                silentError: true,
            });
            // Prefer response body (includes cases); refresh meta history without wiping cases
            setResult(r.data);
            const secs = r.data?.elapsed_s != null ? ` in ${r.data.elapsed_s}s` : "";
            const modeLabel = liveLlm || r.data?.mode === "live_llm_sample" ? " (live LLM sample)" : "";
            toast.success(
                r.data.passed
                    ? `Benchmark PASSED all gates${modeLabel}${secs}`
                    : `Benchmark finished — gates failed${modeLabel}${secs}`,
            );
            // Soft-refresh meta (history strip) without blanking current result
            api.get("/eval/golden-benchmark").then((mr) => {
                setMeta(mr.data);
            }).catch(() => {});
        } catch (e) {
            toast.error(e?.userMessage || apiErrorMessage(e, "Benchmark run failed"));
        } finally {
            setRunning(false);
            setRunElapsed(0);
            runStartedAt.current = null;
        }
    };

    const downloadDataset = async () => {
        try {
            const r = await api.get("/eval/golden-dataset/download", {responseType: "blob"});
            const blob = r.data instanceof Blob ? r.data : new Blob([r.data], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "dataset.json";
            a.click();
            URL.revokeObjectURL(url);
            toast.success("Golden dataset downloaded");
        } catch (e) {
            toast.error(apiErrorMessage(e, "Dataset download failed"));
        }
    };

    // Chronological (oldest→newest) + sparkline series for trend strip
    const historyTrend = useMemo(() => {
        const history = meta?.history || [];
        const chrono = [...history].reverse();
        const f1Series = chrono
            .map((h) => Number(h?.summary?.mean_ioc_f1))
            .filter((n) => Number.isFinite(n));
        const recallSeries = chrono
            .map((h) => Number(h?.summary?.mean_technique_recall))
            .filter((n) => Number.isFinite(n));
        const sparkPoints = (series, w = 120, h = 28, pad = 2) => {
            if (series.length < 2) return "";
            const min = Math.min(...series);
            const max = Math.max(...series);
            const span = max - min || 0.01;
            return series
                .map((v, i) => {
                    const x = pad + (i * (w - pad * 2)) / (series.length - 1);
                    const y = pad + (1 - (v - min) / span) * (h - pad * 2);
                    return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ");
        };
        const delta = (series) => {
            if (series.length < 2) return null;
            return series[series.length - 1] - series[series.length - 2];
        };
        return {
            chrono,
            f1Series,
            recallSeries,
            f1Pts: sparkPoints(f1Series),
            recallPts: sparkPoints(recallSeries),
            f1Delta: delta(f1Series),
            rDelta: delta(recallSeries),
        };
    }, [meta?.history]);
    const summary = result?.summary;
    const thresholds = useMemo(
        () =>
            result?.thresholds ||
            meta?.thresholds || {
                min_cases: 30,
                min_ioc_f1: 0.85,
                min_technique_recall: 0.80,
                min_mean_grounding: 0.50,
                min_phase_coverage: 1.0,
                max_mean_latency_s: 7.0,
            },
        [result?.thresholds, meta?.thresholds],
    );
    const gates = useMemo(() => gatePass(summary, thresholds), [summary, thresholds]);

    // Normalize cases from slim payload (cases) or raw benchmark (results)
    const allCases = useMemo(() => {
        const raw = result?.cases || result?.results || [];
        return Array.isArray(raw) ? raw : [];
    }, [result]);

    const cases = useMemo(() => {
        let list = [...allCases];
        if (filterWeak) {
            list = list.filter(
                (c) =>
                    c.error ||
                    (c.ioc_f1 ?? 1) < (thresholds.min_ioc_f1 ?? 0.85) ||
                    (c.technique_recall ?? 1) < (thresholds.min_technique_recall ?? 0.8) ||
                    (c.phase_coverage ?? 1) < 1,
            );
        }
        list.sort((a, b) => {
            const av = a[sortKey] ?? 0;
            const bv = b[sortKey] ?? 0;
            if (sortKey === "latency_s") return bv - av;
            if (sortKey === "name" || sortKey === "id") return String(a[sortKey] || "").localeCompare(String(b[sortKey] || ""));
            return av - bv;
        });
        return list;
    }, [allCases, filterWeak, sortKey, thresholds]);

    const distributionStats = useMemo(() => {
        if (!allCases.length) {
            return {passedCount: 0, failedCount: 0, total: 0, passPct: 100};
        }
        const total = allCases.length;
        const failedCount = allCases.filter(
            (c) =>
                c.error ||
                (c.ioc_f1 ?? 1) < (thresholds.min_ioc_f1 ?? 0.85) ||
                (c.technique_recall ?? 1) < (thresholds.min_technique_recall ?? 0.8),
        ).length;
        const passedCount = total - failedCount;
        const passPct = Math.round((passedCount / total) * 100);
        return {passedCount, failedCount, total, passPct};
    }, [allCases, thresholds]);

    const latencyDistribution = useMemo(() => {
        const gate = Number(thresholds?.max_mean_latency_s);
        const gateS = Number.isFinite(gate) && gate > 0 ? gate : 7;
        // Fast band for offline micro-latencies: 50th of gate is useless (3.5s);
        // use adaptive band from data so colors still differentiate when all << gate.
        const items = allCases
            .map((c) => {
                const n = c.latency_s == null || c.latency_s === "" ? null : Number(c.latency_s);
                return {
                    id: c.id,
                    name: c.name,
                    latency: Number.isFinite(n) ? Math.max(0, n) : null,
                };
            })
            .sort((a, b) => (b.latency ?? -1) - (a.latency ?? -1));

        const measured = items.map((i) => i.latency).filter((n) => n != null);
        const dataMax = measured.length ? Math.max(...measured) : 0;
        const dataMin = measured.length ? Math.min(...measured) : 0;
        // End-to-end scale = data max only (never force 7s axis — that left bars at ~0%)
        const scaleMax = Math.max(dataMax, 1e-9);

        let mean = summary?.mean_latency_s != null ? Number(summary.mean_latency_s) : null;
        let p50 = summary?.p50_latency_s != null ? Number(summary.p50_latency_s) : null;
        let p95 = summary?.p95_latency_s != null ? Number(summary.p95_latency_s) : null;
        if (measured.length) {
            const sorted = [...measured].sort((a, b) => a - b);
            if (mean == null || !Number.isFinite(mean)) {
                mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
            }
            if (p50 == null) p50 = sorted[Math.floor((sorted.length - 1) * 0.5)];
            if (p95 == null) p95 = sorted[Math.floor((sorted.length - 1) * 0.95)];
        }

        // Color bands: relative to this run's distribution when all under gate
        // (otherwise every offline bar is "fast green" and looks broken)
        const allUnderGate = measured.length > 0 && dataMax <= gateS;
        const fastS = allUnderGate
            ? (p50 != null ? p50 : dataMax * 0.5)
            : Math.min(3, gateS * 0.5);
        const midS = allUnderGate ? scaleMax : gateS;

        // Histogram bins (equal-width on data range) for true "distribution"
        const binCount = Math.min(8, Math.max(4, measured.length > 0 ? 6 : 0));
        const bins = [];
        if (measured.length && binCount > 0) {
            const lo = dataMin;
            const hi = dataMax <= lo ? lo + 1e-6 : dataMax;
            const step = (hi - lo) / binCount;
            for (let i = 0; i < binCount; i++) {
                const from = lo + i * step;
                const to = i === binCount - 1 ? hi + 1e-12 : lo + (i + 1) * step;
                const count = measured.filter((v) => v >= from && v < to).length;
                bins.push({from, to, count, i});
            }
            // fix last bin inclusive
            if (bins.length) {
                const last = bins[bins.length - 1];
                last.count = measured.filter((v) => v >= last.from && v <= dataMax + 1e-12).length;
            }
        }
        const binMax = bins.reduce((m, b) => Math.max(m, b.count), 0) || 1;

        return {
            scaleMax,
            gateS,
            fastS,
            midS,
            allUnderGate,
            items,
            mean,
            p50,
            p95,
            nMeasured: measured.length,
            dataMax,
            dataMin,
            bins,
            binMax,
        };
    }, [allCases, thresholds?.max_mean_latency_s, summary]);

    if (loading && !meta) {
        return (
            <div data-testid="golden-benchmark-page" className="p-1">
                <ListState variant="loading" testid="golden-loading" message="Loading golden benchmark…"/>
            </div>
        );
    }

    if (loadError && !meta) {
        return (
            <div data-testid="golden-benchmark-page" className="p-1 space-y-3">
                <ListState variant="error" testid="golden-load-error" message={loadError}/>
                <button type="button" className="soc-btn-secondary !text-xs" onClick={loadMeta}>
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div data-testid="golden-benchmark-page">
            <PageHeader
                testid="golden-header"
                title="Real-Time Golden Benchmark & Scorecards"
                icon={Flask}
                tip={
                    <HelpTip
                        title="Golden benchmark"
                        body="Admin quality gate: run the frozen offline IR suite (parse → mock TI → ATT&CK → metrics). Pass/fail is deterministic CI-style — not a live SOC score."
                        how="POST /eval/golden-benchmark · fixtures in backend/tests/golden/dataset.json · thresholds from meta."
                        testid="tip-golden-page"
                    />
                }
                subtitle={
                    <>
                        Execute real-time pipeline validation against frozen golden dataset fixtures
                        ({meta?.dataset?.n_cases ?? "—"} cases) and review independent benchmark scorecards.
                    </>
                }
                actions={
                    <div className="flex flex-wrap gap-2 shrink-0 items-center">
                        <button
                            type="button"
                            onClick={downloadDataset}
                            className="soc-btn-secondary !text-xs !h-9 inline-flex items-center gap-1.5"
                            title="Download current golden dataset.json (authenticated)"
                            data-testid="golden-download"
                        >
                            <Download size={14}/>
                            Download
                        </button>

                        {/* Upload & Append Dataset */}
                        <label
                            className="soc-btn-secondary !text-xs !h-9 inline-flex items-center gap-1.5 cursor-pointer"
                            title="Upload and append fixtures to dataset.json"
                            data-testid="golden-upload-label"
                        >
                            <Upload size={14}/>
                            <span>Append JSON</span>
                            <input
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    const formData = new FormData();
                                    formData.append("file", file);
                                    try {
                                        const r = await api.post("/eval/golden-dataset/append", formData, {
                                            headers: {"Content-Type": "multipart/form-data"},
                                        });
                                        toast.success(`Appended fixtures successfully. Total cases: ${r.data.total_cases}`);
                                        loadMeta();
                                    } catch (err) {
                                        toast.error(apiErrorMessage(err, "Failed to append dataset"));
                                    } finally {
                                        e.target.value = "";
                                    }
                                }}
                            />
                        </label>

                        <label
                            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer px-2 py-1.5 rounded border border-border hover:border-[var(--warning-border)]"
                            title="A-G1: first 5 cases with real playbook LLM (costs tokens; mock TI)."
                            data-testid="golden-live-llm-toggle"
                        >
                            <input
                                type="checkbox"
                                checked={liveLlm}
                                onChange={(e) => setLiveLlm(e.target.checked)}
                                disabled={running}
                                className="rounded border-border"
                            />
                            <span className={liveLlm ? "text-warning" : ""}>Live LLM sample</span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setGuideOpen((o) => !o)}
                            className="soc-btn-secondary !text-xs !h-9"
                            data-testid="golden-toggle-guide"
                            title="Show or hide how to interpret results"
                        >
                            <BookOpenText size={14}/>
                            {guideOpen ? "Hide guide" : "How to interpret"}
                            <CaretDown size={12}
                                       className={guideOpen ? "rotate-180 transition-transform" : "transition-transform"}/>
                        </button>
                        <button
                            type="button"
                            onClick={loadMeta}
                            disabled={running}
                            className="soc-btn-secondary !text-xs !h-9 disabled:opacity-50"
                            data-testid="golden-refresh"
                            title="Reload dataset meta and last run from this server process"
                        >
                            <ArrowClockwise size={14}/>
                            Refresh
                        </button>
                        <button
                            type="button"
                            onClick={run}
                            disabled={running}
                            className={`inline-flex items-center gap-1.5 text-[12px] px-4 py-2 rounded-lg border transition-colors disabled:opacity-50 font-semibold ${
                                liveLlm
                                    ? "border-[var(--warning-border)] bg-[var(--warning-bg)] text-warning hover:brightness-95"
                                    : "soc-btn-primary !text-xs"
                            }`}
                            data-testid="golden-run"
                            title="Run all golden cases offline in real time"
                        >
                            {running ? (
                                <>
                                    <Timer size={14} className="animate-pulse"/>
                                    Running… {runElapsed}s
                                </>
                            ) : (
                                <>
                                    <Play size={14} weight="fill"/>
                                    {liveLlm ? "Run live sample" : "Run validation"}
                                </>
                            )}
                        </button>
                    </div>
                }
            />

            {running && (
                <div
                    className="mb-4 rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-[12px] text-foreground/90"
                    data-testid="golden-running-banner"
                >
                    <div className="flex items-center gap-2 font-medium text-primary">
                        <Timer size={16} className="animate-pulse"/>
                        Real-time evaluation in progress — {runElapsed}s elapsed
                    </div>
                    <p className="mt-1 text-muted-foreground leading-relaxed">
                        Executing live parse, mock enrichment, and ATT&amp;CK mapping across all golden fixtures.
                    </p>
                </div>
            )}

            {historyTrend.chrono.length > 0 && (
                <Card className="mb-4" testid="golden-history-strip">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                        <div>
                            <div className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5">
                                <ChartBar size={16} className="text-primary"/>
                                Recent run history
                                <HelpTip
                                    title="Run history & trend"
                                    body="Slim history of prior golden runs (pass/fail, F1, technique recall). Sparklines need ≥2 stored runs. Capped server-side — not a full MLOps board."
                                    how="Mongo golden_runs history docs · GET /eval/golden-benchmark returns last 12."
                                    testid="tip-golden-history"
                                />
                            </div>
                            <p className="text-[11px] text-muted-foreground m-0 mt-0.5">
                                Newest on the right · last {historyTrend.chrono.length} stored run
                                {historyTrend.chrono.length === 1 ? "" : "s"} (server-side, capped)
                            </p>
                        </div>
                        {historyTrend.f1Series.length >= 2 && (
                            <div
                                className="flex items-center gap-4 text-[11px]"
                                data-testid="golden-history-trend"
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground font-medium">IoC F1</span>
                                    <svg width="120" height="28" className="overflow-visible" aria-hidden>
                                        <polyline
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="1.5"
                                            className="text-primary"
                                            points={historyTrend.f1Pts}
                                        />
                                    </svg>
                                    <span
                                        className={`font-mono font-semibold ${
                                            historyTrend.f1Delta > 0.001
                                                ? "text-success"
                                                : historyTrend.f1Delta < -0.001
                                                    ? "text-error"
                                                    : "text-muted-foreground"
                                        }`}
                                    >
                                        {historyTrend.f1Delta == null
                                            ? "—"
                                            : `${historyTrend.f1Delta >= 0 ? "+" : ""}${historyTrend.f1Delta.toFixed(3)}`}
                                    </span>
                                </div>
                                {historyTrend.recallSeries.length >= 2 && (
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground font-medium">Tech R</span>
                                        <svg width="120" height="28" className="overflow-visible" aria-hidden>
                                            <polyline
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="1.5"
                                                className="text-success"
                                                points={historyTrend.recallPts}
                                            />
                                        </svg>
                                        <span
                                            className={`font-mono font-semibold ${
                                                historyTrend.rDelta > 0.001
                                                    ? "text-success"
                                                    : historyTrend.rDelta < -0.001
                                                        ? "text-error"
                                                        : "text-muted-foreground"
                                            }`}
                                        >
                                            {historyTrend.rDelta == null
                                                ? "—"
                                                : `${historyTrend.rDelta >= 0 ? "+" : ""}${historyTrend.rDelta.toFixed(3)}`}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {historyTrend.chrono.map((h, idx) => {
                            const s = h.summary || {};
                            const ok = h.passed === true;
                            const prev = idx > 0 ? historyTrend.chrono[idx - 1] : null;
                            const prevF1 = prev?.summary?.mean_ioc_f1;
                            const curF1 = s.mean_ioc_f1;
                            let f1Arrow = null;
                            if (
                                prevF1 != null &&
                                curF1 != null &&
                                Number.isFinite(Number(prevF1)) &&
                                Number.isFinite(Number(curF1))
                            ) {
                                const d = Number(curF1) - Number(prevF1);
                                if (d > 0.001) f1Arrow = "↑";
                                else if (d < -0.001) f1Arrow = "↓";
                                else f1Arrow = "→";
                            }
                            return (
                                <div
                                    key={h.id || h.ran_at}
                                    className={`shrink-0 min-w-[9.5rem] rounded-lg border px-2.5 py-2 text-[11px] ${
                                        ok
                                            ? "border-success/40 bg-success/5"
                                            : "border-error/40 bg-error/5"
                                    }`}
                                    data-testid={`golden-hist-${h.id || "row"}`}
                                    title={(h.failures || []).join("; ") || undefined}
                                >
                                    <div className="flex items-center justify-between gap-1">
                                        <div className={`font-semibold ${ok ? "text-success" : "text-error"}`}>
                                            {ok ? "PASS" : "FAIL"}
                                        </div>
                                        {h.mode && (
                                            <span className="text-[9px] uppercase tracking-wide text-muted-foreground font-mono">
                                                {String(h.mode).includes("live") ? "live" : "off"}
                                            </span>
                                        )}
                                    </div>
                                    <div className="font-mono text-muted-foreground mt-0.5">
                                        {h.ran_at ? String(h.ran_at).slice(0, 16).replace("T", " ") : "—"}
                                    </div>
                                    <div className="mt-1 font-mono text-foreground/80">
                                        F1 {s.mean_ioc_f1 != null ? Number(s.mean_ioc_f1).toFixed(3) : "—"}
                                        {f1Arrow && (
                                            <span
                                                className={`ml-1 ${
                                                    f1Arrow === "↑"
                                                        ? "text-success"
                                                        : f1Arrow === "↓"
                                                            ? "text-error"
                                                            : "text-muted-foreground"
                                                }`}
                                                aria-hidden
                                            >
                                                {f1Arrow}
                                            </span>
                                        )}
                                    </div>
                                    <div className="font-mono text-muted-foreground">
                                        R {s.mean_technique_recall != null ? Number(s.mean_technique_recall).toFixed(3) : "—"}
                                        {s.n_cases != null ? ` · n=${s.n_cases}` : ""}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 m-0">
                        Sparklines compare IoC F1 and technique recall across stored runs — regression radar, not a full MLOps board.
                    </p>
                </Card>
            )}

            {guideOpen && (
                <Card className="mb-4 border-primary/20 bg-primary/[0.03]" testid="golden-interpret-guide">
                    <div className="flex items-start gap-2 mb-3">
                        <Question size={18} className="text-primary mt-0.5 shrink-0" weight="duotone"/>
                        <div>
                            <div className="text-sm font-semibold text-foreground">Guide & Graphical Representation
                                Trends
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Hover the <Info size={10} className="inline text-muted-foreground"/> icons for field
                                details.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        {INTERPRET_STEPS.map((s) => (
                            <div key={s.title} className="rounded-md border border-border bg-muted/50 px-3 py-2.5">
                                <div className="text-[11px] font-semibold text-primary/90 mb-1">{s.title}</div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{s.body}</p>
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {/* Industry literature context — static, not ACTIRA live scores */}
            <Card className="mb-4 border-dashed" testid="golden-industry-context">
                <div className="text-sm font-semibold text-foreground inline-flex items-center gap-1.5 mb-1">
                    <ChartBar size={16} className="text-muted-foreground"/>
                    Industry benchmark context
                    <HelpTip
                        title="Not product metrics"
                        body="Published figures from external research suites for viva context only. They are not computed by this ACTIRA deployment. Use the Run validation results below for live product gates."
                        testid="tip-golden-industry"
                    />
                </div>
                <p className="text-[11px] text-muted-foreground m-0 mb-2">
                    Static literature references (CTI-Bench / AnnoCTR / AthenaBench / CyberSOCEval) — do not treat as this run’s scorecard.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
                        <div className="text-muted-foreground font-medium">CTI-Bench (CVE)</div>
                        <div className="font-mono">~97.5% Hit@5 <span className="text-muted-foreground">ref</span></div>
                    </div>
                    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
                        <div className="text-muted-foreground font-medium">AnnoCTR (ATT&CK)</div>
                        <div className="font-mono">~40.2% Hit@5 <span className="text-muted-foreground">ref</span></div>
                    </div>
                    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
                        <div className="text-muted-foreground font-medium">AthenaBench-Mini</div>
                        <div className="font-mono">~84.0% Hit@5 <span className="text-muted-foreground">ref</span></div>
                    </div>
                    <div className="rounded border border-border bg-muted/30 px-2 py-1.5">
                        <div className="text-muted-foreground font-medium">CyberSOCEval</div>
                        <div className="font-mono">~9.7% vs 4.5% <span className="text-muted-foreground">ref</span></div>
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 items-stretch">
                <Card testid="golden-dataset-meta" className="h-full flex flex-col">
                    <div className="soc-label flex items-center gap-1.5">
                        <ListChecks size={11}/> Dataset
                        <HelpTip
                            title="Golden dataset"
                            body="Frozen fixtures used for offline IR quality gates. Append JSON only when labels are human-approved."
                            how="Path and n_cases from GET /eval/golden-benchmark meta.dataset."
                            testid="tip-golden-dataset"
                        />
                    </div>
                    <div className="mt-1 font-mono text-xl text-foreground">{meta?.dataset?.n_cases ?? "—"} cases</div>
                    <div className="text-[11px] text-muted-foreground mt-auto pt-2 font-mono break-all line-clamp-2">
                        {meta?.dataset?.path}
                    </div>
                </Card>
                <Card className="h-full flex flex-col">
                    <div className="soc-label flex items-center gap-1.5">
                        <ShieldCheck size={11}/> Execution Mode
                        <HelpTip
                            title="Execution mode"
                            body="offline_template = deterministic pipeline with mock TI. live_llm_sample = first N cases call real playbook LLM (costs tokens)."
                            testid="tip-golden-mode"
                        />
                    </div>
                    <div className="mt-1 text-sm font-mono text-foreground">
                        {result?.mode === "live_llm_sample" || (liveLlm && running)
                            ? "live_llm_sample"
                            : "offline_template"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-auto pt-2">
                        Real-time evaluation on server process
                    </div>
                </Card>
                <Card testid="golden-last-run-meta" className="h-full flex flex-col">
                    <div className="soc-label flex items-center gap-1.5">
                        <Timer size={11}/> Last Run Timestamp
                        <HelpTip
                            title="Last run"
                            body="When this process (or Mongo last store) last finished a golden evaluation. Feeds Compliance AI-02 when a stored pass/fail exists."
                            testid="tip-golden-last-run"
                        />
                    </div>
                    <div className="mt-1 text-sm text-foreground font-mono">
                        {result?.ran_at ? formatDateTime(result.ran_at) : "Not run this session"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-auto pt-2">
                        {result?.ran_by?.email ? `by ${result.ran_by.email}` : "Click Run validation to execute"}
                    </div>
                </Card>
            </div>

            {result && (
                <div
                    data-testid="golden-verdict"
                    className={`mb-4 rounded-lg border px-4 py-3 flex flex-wrap items-center gap-3 ${
                        result.passed
                            ? "border-[var(--success-border)] bg-success-soft"
                            : "border-[var(--error-border)] bg-error-soft"
                    }`}
                >
                    {result.passed ? (
                        <CheckCircle size={22} className="text-success" weight="fill"/>
                    ) : (
                        <XCircle size={22} className="text-error" weight="fill"/>
                    )}
                    <div className="flex-1 min-w-0">
                        <div
                            className={`text-sm font-semibold flex items-center gap-2 ${result.passed ? "text-success" : "text-error"}`}>
                            {result.passed ? "REAL-TIME EVALUATION PASSED — all CI thresholds met" : "REAL-TIME EVALUATION FAILED — one or more CI gates"}
                        </div>
                        {!result.passed && (result.failures || []).length > 0 && (
                            <ul className="mt-1 space-y-0.5" data-testid="golden-failures">
                                {(result.failures || []).map((f) => (
                                    <li key={f} className="text-[11px] font-mono text-error flex items-start gap-1.5">
                                        <Warning size={12} className="mt-0.5 shrink-0"/> {f}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}

            {/* Real-Time Computed Aggregate Metric Cards */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 mb-6">
                    <MetricCard
                        testid="metric-n-cases"
                        metricKey="n_cases"
                        value={summary.n_cases}
                        threshold={thresholds.min_cases}
                        pass={gates.n_cases}
                    />
                    <MetricCard
                        testid="metric-ioc-f1"
                        metricKey="mean_ioc_f1"
                        value={pct(summary.mean_ioc_f1)}
                        threshold={thresholds.min_ioc_f1}
                        pass={gates.mean_ioc_f1}
                    />
                    <MetricCard
                        testid="metric-tech-recall"
                        metricKey="mean_technique_recall"
                        value={pct(summary.mean_technique_recall)}
                        threshold={thresholds.min_technique_recall}
                        pass={gates.mean_technique_recall}
                    />
                    <MetricCard
                        testid="metric-grounding"
                        metricKey="mean_grounding"
                        value={pct(summary.mean_grounding)}
                        threshold={thresholds.min_mean_grounding}
                        pass={gates.mean_grounding}
                    />
                    <MetricCard
                        testid="metric-phases"
                        metricKey="full_phase_fraction"
                        value={pct(summary.full_phase_fraction)}
                        threshold={thresholds.min_phase_coverage}
                        pass={gates.full_phase_fraction}
                    />
                    <MetricCard
                        testid="metric-latency"
                        metricKey="mean_latency_s"
                        value={summary.mean_latency_s != null ? formatLatency(summary.mean_latency_s) : "—"}
                        threshold={thresholds.max_mean_latency_s}
                        unit=""
                        invert
                        pass={gates.mean_latency_s}
                    />
                    <MetricCard
                        testid="metric-errors"
                        metricKey="n_errors"
                        value={summary.n_errors ?? 0}
                        threshold={0}
                        invert
                        pass={gates.n_errors}
                    />
                </div>
            )}

            {/* Unified run-insights board — full width, balanced hierarchy */}
            {allCases.length > 0 && (
                <Card
                    className="mb-6 !p-0 overflow-hidden border border-border"
                    testid="golden-insights-board"
                >
                    {/* Board header */}
                    <div className="px-4 py-3 border-b border-border bg-muted/25 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <ChartBar size={18} className="text-primary shrink-0"/>
                            <div>
                                <div className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                                    Run insights
                                    <HelpTip
                                        title="Run insights"
                                        body="Single board for this evaluation: gate compliance, latency distribution, and slowest cases. Bars fill left→right relative to the slowest case."
                                        testid="tip-golden-insights"
                                    />
                                </div>
                                <p className="text-[11px] text-muted-foreground m-0">
                                    {allCases.length} fixtures · CI mean gate ≤ {latencyDistribution.gateS}s
                                    {latencyDistribution.allUnderGate ? " · offline (all under gate)" : ""}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[11px] font-mono">
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card">
                                <span className="w-2 h-2 rounded-full" style={{backgroundColor: LAT_COLORS.fast}}/>
                                faster
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card">
                                <span className="w-2 h-2 rounded-full" style={{backgroundColor: LAT_COLORS.mid}}/>
                                mid
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-card">
                                <span className="w-2 h-2 rounded-full" style={{backgroundColor: LAT_COLORS.slow}}/>
                                over gate
                            </span>
                        </div>
                    </div>

                    <div className="p-4 space-y-5">
                        {/* Row 1: compliance + latency KPI chips — equal height strip */}
                        <div
                            className="grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch"
                            data-testid="golden-success-distribution"
                        >
                            <div className="md:col-span-5 rounded-xl border border-border bg-muted/20 p-4 flex flex-col justify-center gap-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                        <CheckCircle size={14} className="text-success"/> Gate compliance
                                    </span>
                                    <span
                                        className={`font-mono text-2xl font-bold tabular-nums ${
                                            distributionStats.passPct >= 100 ? "text-success" : distributionStats.passPct >= 80 ? "text-warning" : "text-error"
                                        }`}
                                    >
                                        {distributionStats.passPct}%
                                    </span>
                                </div>
                                <div
                                    className="w-full h-3.5 rounded-full overflow-hidden flex"
                                    style={{background: LAT_COLORS.track, direction: "ltr"}}
                                >
                                    <div
                                        style={{
                                            width: `${distributionStats.passPct}%`,
                                            height: "100%",
                                            backgroundColor: LAT_COLORS.fast,
                                            flexShrink: 0,
                                        }}
                                    />
                                    <div
                                        style={{
                                            width: `${100 - distributionStats.passPct}%`,
                                            height: "100%",
                                            backgroundColor: LAT_COLORS.slow,
                                            flexShrink: 0,
                                        }}
                                    />
                                </div>
                                <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                                    <span className="text-success">{distributionStats.passedCount} pass</span>
                                    <span className="text-error">{distributionStats.failedCount} weak</span>
                                    <span>{distributionStats.total} total</span>
                                </div>
                            </div>

                            <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    {label: "Mean", value: latencyDistribution.mean, testid: "lat-kpi-mean"},
                                    {label: "P50", value: latencyDistribution.p50, testid: "lat-kpi-p50"},
                                    {label: "P95", value: latencyDistribution.p95, testid: "lat-kpi-p95"},
                                    {label: "Max", value: latencyDistribution.dataMax, testid: "lat-kpi-max"},
                                ].map((k) => (
                                    <div
                                        key={k.label}
                                        data-testid={k.testid}
                                        className="rounded-xl border border-border bg-card px-3 py-3 flex flex-col justify-center min-h-[5.5rem]"
                                    >
                                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                                            {k.label} latency
                                        </div>
                                        <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                                            {formatLatency(k.value)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground mt-0.5">this run</div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Row 2: histogram full width */}
                        {latencyDistribution.bins?.length > 0 && (
                            <div
                                className="rounded-xl border border-border bg-muted/15 px-4 py-3"
                                data-testid="golden-latency-histogram"
                            >
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                        Latency distribution
                                    </div>
                                    <div className="text-[10px] font-mono text-muted-foreground">
                                        {formatLatency(latencyDistribution.dataMin)} → {formatLatency(latencyDistribution.dataMax)}
                                    </div>
                                </div>
                                <div className="flex items-end gap-1.5 h-24 w-full" style={{direction: "ltr"}}>
                                    {latencyDistribution.bins.map((b) => {
                                        const hPct = Math.max(6, (b.count / latencyDistribution.binMax) * 100);
                                        const mid = (b.from + b.to) / 2;
                                        const band = latencyBand(mid, latencyDistribution.midS, latencyDistribution.fastS);
                                        return (
                                            <div
                                                key={b.i}
                                                className="flex-1 flex flex-col justify-end items-stretch min-w-0 group"
                                                title={`${formatLatency(b.from)}–${formatLatency(b.to)}: ${b.count} case(s)`}
                                            >
                                                <div className="text-[9px] font-mono text-center text-muted-foreground mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {b.count}
                                                </div>
                                                <div
                                                    className="w-full rounded-t-md transition-all"
                                                    style={{
                                                        height: `${hPct}%`,
                                                        minHeight: b.count ? 8 : 3,
                                                        backgroundColor: LAT_COLORS[band] || LAT_COLORS.mid,
                                                        opacity: b.count ? 0.95 : 0.2,
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Row 3: per-case bars full width — compact one-line rows */}
                        <div data-testid="golden-latency-chart">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                    Per-case latency
                                    <HelpTip
                                        title="Per-case latency"
                                        body="Each row is one fixture. The colored bar starts at the left and grows right; slowest case = full width. Offline runs are usually milliseconds — that is expected."
                                        testid="tip-golden-latency-chart"
                                    />
                                </div>
                                <span className="text-[10px] font-mono text-muted-foreground">
                                    sorted slowest → fastest · n={latencyDistribution.nMeasured}
                                </span>
                            </div>

                            {latencyDistribution.items.length === 0 ? (
                                <p className="text-xs text-muted-foreground py-4 text-center m-0">No case latencies.</p>
                            ) : (
                                <div
                                    className="rounded-xl border border-border overflow-hidden"
                                    data-testid="golden-latency-bars"
                                    style={{direction: "ltr"}}
                                >
                                    <div className="max-h-72 overflow-y-auto divide-y divide-border/80">
                                        {latencyDistribution.items.map((item, idx) => {
                                            const lat = item.latency;
                                            const hasLat = lat != null && Number.isFinite(lat);
                                            const widthPct = hasLat
                                                ? Math.min(100, Math.max(2, (lat / latencyDistribution.scaleMax) * 100))
                                                : 0;
                                            const band = hasLat
                                                ? latencyBand(lat, latencyDistribution.midS, latencyDistribution.fastS)
                                                : null;
                                            const fill = band ? LAT_COLORS[band] : "transparent";
                                            const rank = idx + 1;

                                            return (
                                                <div
                                                    key={item.id}
                                                    data-testid={`golden-latency-row-${item.id}`}
                                                    className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
                                                    style={{direction: "ltr"}}
                                                >
                                                    <span className="w-6 shrink-0 text-[10px] font-mono text-muted-foreground tabular-nums text-right">
                                                        {rank}
                                                    </span>
                                                    <span
                                                        className="w-[4.5rem] shrink-0 font-mono text-[11px] text-foreground/90 truncate"
                                                        title={item.name ? `${item.id} — ${item.name}` : item.id}
                                                    >
                                                        {item.id}
                                                    </span>
                                                    <div
                                                        data-testid={`golden-latency-bar-${item.id}`}
                                                        className="flex-1 min-w-0"
                                                        style={{
                                                            display: "flex",
                                                            flexDirection: "row",
                                                            justifyContent: "flex-start",
                                                            height: 12,
                                                            borderRadius: 6,
                                                            overflow: "hidden",
                                                            background: LAT_COLORS.track,
                                                            border: `1px solid ${LAT_COLORS.border}`,
                                                            direction: "ltr",
                                                        }}
                                                    >
                                                        {hasLat ? (
                                                            <div
                                                                style={{
                                                                    width: `${widthPct}%`,
                                                                    height: "100%",
                                                                    backgroundColor: fill,
                                                                    flexShrink: 0,
                                                                    borderRadius: 5,
                                                                }}
                                                                title={`${item.id}: ${formatLatency(lat)}`}
                                                            />
                                                        ) : null}
                                                    </div>
                                                    <span
                                                        className="w-[4.25rem] shrink-0 text-right font-mono text-[11px] font-semibold tabular-nums"
                                                        style={{color: fill !== "transparent" ? fill : undefined}}
                                                    >
                                                        {hasLat ? formatLatency(lat) : "—"}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {allCases.length > 0 && (
                <Card testid="golden-cases-table">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="soc-label flex items-center gap-1.5">
                                <Lightning size={11}/> Real-Time Per-Case Results
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                {cases.length} fixtures evaluated in real time
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <label
                                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={filterWeak}
                                    onChange={(e) => setFilterWeak(e.target.checked)}
                                    className="rounded border-border"
                                    data-testid="golden-filter-weak"
                                />
                                Weak / failed only
                            </label>
                            <select
                                value={sortKey}
                                onChange={(e) => setSortKey(e.target.value)}
                                className="bg-background border border-border px-2 py-1 rounded text-[11px] text-foreground/90"
                                data-testid="golden-sort"
                            >
                                <option value="ioc_f1">Sort: IoC F1</option>
                                <option value="technique_recall">Sort: tech recall</option>
                                <option value="grounding_score">Sort: grounding</option>
                                <option value="phase_coverage">Sort: phases</option>
                                <option value="latency_s">Sort: latency</option>
                                <option value="name">Sort: name</option>
                            </select>
                        </div>
                    </div>

                    <DataTable className="text-[11px] min-w-[720px]" maxHeight="28rem" aria-label="Golden cases">
                        <thead>
                        <tr>
                            <Th helpKey="id"><span className="font-mono">ID</span></Th>
                            <Th helpKey="name">Name</Th>
                            <Th helpKey="ioc_f1"><span className="font-mono">IoC F1</span></Th>
                            <Th helpKey="technique_recall"><span className="font-mono">Tech rec</span></Th>
                            <Th helpKey="grounding_score"><span className="font-mono">Ground</span></Th>
                            <Th helpKey="phase_coverage"><span className="font-mono">Phases</span></Th>
                            <Th helpKey="latency_s"><span className="font-mono">Lat s</span></Th>
                            <Th helpKey="severity">Sev</Th>
                            <Th helpKey="techniques">Techniques</Th>
                        </tr>
                        </thead>
                        <tbody>
                        {cases.map((c) => {
                            const weak =
                                c.error ||
                                (c.ioc_f1 ?? 1) < (thresholds.min_ioc_f1 ?? 0.85) ||
                                (c.technique_recall ?? 1) < (thresholds.min_technique_recall ?? 0.8);
                            return (
                                <tr
                                    key={c.id}
                                    data-testid={`golden-case-${c.id}`}
                                    className={`border-b border-border ${weak ? "bg-error-soft" : ""}`}
                                >
                                    <td className="py-1.5 px-2 font-mono text-primary/90 whitespace-nowrap">{c.id}</td>
                                    <td className="py-1.5 px-2 text-foreground/90 max-w-[180px] truncate"
                                        title={c.name}>{c.name}</td>
                                    <td className="py-1.5 px-2 font-mono">{pct(c.ioc_f1)}</td>
                                    <td className="py-1.5 px-2 font-mono">{pct(c.technique_recall)}</td>
                                    <td className="py-1.5 px-2 font-mono">{pct(c.grounding_score)}</td>
                                    <td className="py-1.5 px-2 font-mono">{pct(c.phase_coverage)}</td>
                                    <td className="py-1.5 px-2 font-mono text-muted-foreground">{formatLatency(c.latency_s)}</td>
                                    <td className="py-1.5 px-2 text-muted-foreground uppercase text-[10px]">{c.severity || "—"}</td>
                                    <td className="py-1.5 px-2 font-mono text-muted-foreground max-w-[160px] truncate">
                                        {c.error ? <span
                                            className="text-error">{c.error}</span> : (c.predicted_techniques || []).join(", ") || "—"}
                                    </td>
                                </tr>
                            );
                        })}
                        </tbody>
                    </DataTable>
                </Card>
            )}
        </div>
    );
}