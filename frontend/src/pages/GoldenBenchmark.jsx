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
import {HoverCard, HoverCardContent, HoverCardTrigger,} from "../components/ui/hover-card";
import {DataTable, PageHeader} from "../design-system";
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
        body: "Use the success ratio segment bar and time-based color-coded latency distribution chart to instantly identify outliers and performance bounds.",
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

function HelpTip({title, children, side = "top", testid}) {
    return (
        <HoverCard openDelay={120} closeDelay={80}>
            <HoverCardTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                    aria-label={title ? `Help: ${title}` : "Help"}
                    data-testid={testid}
                >
                    <Info size={12} weight="bold"/>
                </button>
            </HoverCardTrigger>
            <HoverCardContent
                side={side}
                collisionPadding={16}
                className="w-80 max-w-[min(20rem,calc(100vw-1.5rem))] bg-background border border-border text-foreground p-3 shadow-xl z-[200] break-words"
            >
                {title && (
                    <div
                        className="text-[11px] font-semibold text-primary/90 mb-1.5 tracking-wide uppercase break-words">
                        {title}
                    </div>
                )}
                <div className="text-[11px] text-muted-foreground leading-relaxed space-y-1.5 break-words min-w-0">
                    {children}
                </div>
            </HoverCardContent>
        </HoverCard>
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

export default function GoldenBenchmark() {
    const [meta, setMeta] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState(false);
    const [runElapsed, setRunElapsed] = useState(0);
    const [sortKey, setSortKey] = useState("ioc_f1");
    const [filterWeak, setFilterWeak] = useState(false);
    const [guideOpen, setGuideOpen] = useState(true);
    const [liveLlm, setLiveLlm] = useState(false);
    const runStartedAt = useRef(null);

    const loadMeta = useCallback(async () => {
        setLoading(true);
        try {
            const r = await api.get("/eval/golden-benchmark");
            setMeta(r.data);
            if (r.data?.last_run) setResult(r.data.last_run);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not load golden benchmark meta");
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
            setResult(r.data);
            const secs = r.data?.elapsed_s != null ? ` in ${r.data.elapsed_s}s` : "";
            const modeLabel = liveLlm || r.data?.mode === "live_llm_sample" ? " (live LLM sample)" : "";
            toast.success(
                r.data.passed
                    ? `Benchmark PASSED all gates${modeLabel}${secs}`
                    : `Benchmark finished — gates failed${modeLabel}${secs}`,
            );
            loadMeta();
        } catch (e) {
            toast.error(e?.userMessage || apiErrorMessage(e, "Benchmark run failed"));
        } finally {
            setRunning(false);
            setRunElapsed(0);
            runStartedAt.current = null;
        }
    };

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

    const cases = useMemo(() => {
        let list = [...(result?.cases || [])];
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
    }, [result, filterWeak, sortKey, thresholds]);

    const distributionStats = useMemo(() => {
        if (!result?.cases || result.cases.length === 0) return {
            passedCount: 0,
            failedCount: 0,
            total: 0,
            passPct: 100
        };
        const total = result.cases.length;
        const failedCount = result.cases.filter(
            (c) =>
                c.error ||
                (c.ioc_f1 ?? 1) < (thresholds.min_ioc_f1 ?? 0.85) ||
                (c.technique_recall ?? 1) < (thresholds.min_technique_recall ?? 0.8)
        ).length;
        const passedCount = total - failedCount;
        const passPct = Math.round((passedCount / total) * 100);
        return {passedCount, failedCount, total, passPct};
    }, [result?.cases, thresholds]);

    const latencyDistribution = useMemo(() => {
        if (!result?.cases || result.cases.length === 0) return {max: 10, items: []};
        const items = result.cases.map(c => ({id: c.id, latency: c.latency_s || 0}));
        const max = Math.max(...items.map(i => i.latency), 8);
        return {max, items};
    }, [result?.cases]);

    if (loading && !meta) {
        return <div className="text-muted-foreground text-sm">Loading golden benchmark…</div>;
    }

    return (
        <div data-testid="golden-benchmark-page">
            <PageHeader
                testid="golden-header"
                title="Real-Time Golden Benchmark & Scorecards"
                icon={Flask}
                subtitle={
                    <>
                        Execute real-time pipeline validation against frozen golden dataset fixtures
                        ({meta?.dataset?.n_cases ?? "—"} cases) and review independent benchmark scorecards.
                    </>
                }
                actions={
                    <div className="flex flex-wrap gap-2 shrink-0 items-center">
                        {/* Download Golden Dataset */}
                        <a
                            href={`${api.defaults.baseURL || "/api"}/eval/golden-dataset/download`}
                            download="dataset.json"
                            className="soc-btn-secondary !text-xs !h-9 inline-flex items-center gap-1.5"
                            title="Download current golden dataset.json"
                            data-testid="golden-download"
                        >
                            <Download size={14}/>
                            Download
                        </a>

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

            {/* Independent Reference Scorecards Widget */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <Card>
                    <div className="soc-label flex items-center gap-1.5">
                        <ChartBar size={11}/> CTI-Bench (CVE)
                    </div>
                    <div className="mt-1 font-mono text-xl text-success">97.5% Hit@5</div>
                    <div className="text-[11px] text-muted-foreground mt-1">1,000 real CVEs tested.</div>
                </Card>
                <Card>
                    <div className="soc-label flex items-center gap-1.5">
                        <ChartBar size={11}/> AnnoCTR (ATT&CK)
                    </div>
                    <div className="mt-1 font-mono text-xl text-primary">40.2% Hit@5</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Real analyst-report text.</div>
                </Card>
                <Card>
                    <div className="soc-label flex items-center gap-1.5">
                        <ChartBar size={11}/> AthenaBench-Mini
                    </div>
                    <div className="mt-1 font-mono text-xl text-foreground">84.0% Hit@5</div>
                    <div className="text-[11px] text-muted-foreground mt-1">100 cleaner synthetic scenarios.</div>
                </Card>
                <Card>
                    <div className="soc-label flex items-center gap-1.5">
                        <ChartBar size={11}/> CyberSOCEval
                    </div>
                    <div className="mt-1 font-mono text-xl text-warning">9.7% vs 4.5%</div>
                    <div className="text-[11px] text-muted-foreground mt-1">Retrieval doubles accuracy.</div>
                </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <Card testid="golden-dataset-meta">
                    <div className="soc-label flex items-center gap-1.5">
                        <ListChecks size={11}/> Dataset
                    </div>
                    <div className="mt-1 font-mono text-xl text-foreground">{meta?.dataset?.n_cases ?? "—"} cases</div>
                    <div
                        className="text-[11px] text-muted-foreground mt-1 font-mono break-all">{meta?.dataset?.path}</div>
                </Card>
                <Card>
                    <div className="soc-label flex items-center gap-1.5">
                        <ShieldCheck size={11}/> Execution Mode
                    </div>
                    <div className="mt-1 text-sm text-foreground">
                        {result?.mode === "live_llm_sample" || (liveLlm && running)
                            ? "live_llm_sample"
                            : "offline_template"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                        Real-time evaluation on server process
                    </div>
                </Card>
                <Card testid="golden-last-run-meta">
                    <div className="soc-label flex items-center gap-1.5">
                        <Timer size={11}/> Last Run Timestamp
                    </div>
                    <div className="mt-1 text-sm text-foreground font-mono">
                        {result?.ran_at ? formatDateTime(result.ran_at) : "Not run this session"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
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
                        value={summary.mean_latency_s != null ? Number(summary.mean_latency_s).toFixed(3) : "—"}
                        threshold={thresholds.max_mean_latency_s}
                        unit="s"
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

            {/* Graphical Trend Representation: Pass/Fail Ratio & Time-Based Color-Coded Latency Distribution */}
            {result?.cases && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                    {/* Test Case Success Distribution Bar */}
                    <Card testid="golden-success-distribution">
                        <div className="soc-label flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5">
                <CheckCircle size={14} className="text-success"/> Test Case Gate Compliance Ratio
              </span>
                            <span className="font-mono text-xs text-foreground font-semibold">
                {distributionStats.passPct}% Passing ({distributionStats.passedCount}/{distributionStats.total})
              </span>
                        </div>
                        <div className="w-full bg-muted/60 h-3 rounded-full overflow-hidden flex mb-3">
                            <div
                                className="bg-success h-full transition-all duration-300"
                                style={{width: `${distributionStats.passPct}%`}}
                                title="Passing cases meeting all thresholds"
                            />
                            <div
                                className="bg-error h-full transition-all duration-300"
                                style={{width: `${100 - distributionStats.passPct}%`}}
                                title="Cases failing F1, recall, or error thresholds"
                            />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><span
                                className="w-2 h-2 rounded-full bg-success"/> Compliant Cases: {distributionStats.passedCount}</span>
                            <span className="inline-flex items-center gap-1"><span
                                className="w-2 h-2 rounded-full bg-error"/> Non-compliant / Weak Cases: {distributionStats.failedCount}</span>
                        </div>
                    </Card>

                    {/* Per-Case Latency Distribution Chart */}
                    <Card testid="golden-latency-chart">
                        <div className="soc-label flex items-center justify-between mb-3">
              <span className="flex items-center gap-1.5 text-foreground uppercase tracking-wider font-semibold">
                <ChartBar size={14} className="text-primary"/> Per-Case Latency Distribution (Time-Based Color-Coded)
              </span>
                            <span className="text-[10px] font-mono text-muted-foreground uppercase">
                Gate: ≤ {thresholds.max_mean_latency_s}s
              </span>
                        </div>

                        <div className="space-y-2 max-h-40 overflow-y-auto pr-2 mb-3">
                            {latencyDistribution.items.map((item) => {
                                const widthPct = Math.min(100, (item.latency / latencyDistribution.max) * 100);
                                const barColor = item.latency > (thresholds.max_mean_latency_s || 7.0)
                                    ? "bg-error"
                                    : item.latency <= 3.0
                                        ? "bg-success"
                                        : "bg-warning";

                                return (
                                    <div key={item.id} className="grid grid-cols-12 items-center gap-2 text-[11px]">
                                        <span className="col-span-2 font-mono text-muted-foreground truncate uppercase"
                                              title={item.id}>{item.id}</span>
                                        <div
                                            className="col-span-8 bg-muted/60 h-2.5 rounded-full overflow-hidden relative">
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                                style={{width: `${widthPct}%`}}
                                                title={`Latency: ${item.latency.toFixed(3)}s`}
                                            />
                                        </div>
                                        <span
                                            className={`col-span-2 font-mono text-right font-semibold ${item.latency > 7.0 ? "text-error" : "text-foreground"}`}>
                      {item.latency.toFixed(3)}s
                    </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="pt-2 border-t border-border flex justify-between text-[10px] font-mono">
                            <span className="text-success inline-flex items-center gap-1">■ 0.0s - 3.0s (Fast)</span>
                            <span className="text-warning inline-flex items-center gap-1">■ 3.1s - 7.0s (Target)</span>
                            <span className="text-error inline-flex items-center gap-1">■ 7.1s+ (Exceeds Gate)</span>
                        </div>
                    </Card>
                </div>
            )}

            {result?.cases && (
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
                                    <td className="py-1.5 px-2 font-mono text-muted-foreground">{c.latency_s != null ? Number(c.latency_s).toFixed(3) : "—"}</td>
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