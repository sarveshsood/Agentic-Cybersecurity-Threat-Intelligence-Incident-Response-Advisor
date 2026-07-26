import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {api, apiErrorMessage} from "../lib/api";
import {toast} from "sonner";
import {
    ArrowClockwise,
    BookOpenText,
    CaretDown,
    CheckCircle,
    Flask,
    Info,
    Lightning,
    ListChecks,
    Play,
    Question,
    ShieldCheck,
    Target,
    Timer,
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
        detail:
            "CI requires at least min_cases (default 30). The dataset ships with 32 synthetic IR log snippets. Fewer cases usually means the dataset file is missing or load failed.",
        good: "At or above the gate — dataset is large enough for a stable check.",
        bad: "Below the gate — regenerate or restore backend/tests/golden/dataset.json.",
    },
    mean_ioc_f1: {
        label: "Mean IoC F1",
        short: "Balance of precision & recall on extracted IoCs vs gold labels.",
        detail:
            "Each case compares predicted (type, value) pairs to expected IoCs (case-insensitive). F1 = harmonic mean of precision and recall. Mean is the average F1 across cases. Gate default ≥ 0.85.",
        good: "Extractor is finding the right IPs/domains/hashes/CVEs without flooding false positives.",
        bad: "Regression in ioc_extractor, private-IP filters, or gold labels out of date after intentional changes.",
    },
    mean_technique_recall: {
        label: "Mean tech recall",
        short: "Share of expected MITRE ATT&CK techniques the pipeline recovered.",
        detail:
            "Recall = |predicted ∩ gold| / |gold| over technique IDs (e.g. T1110). Extra predicted techniques do not lower this score. Gate default ≥ 0.80. This does not measure precision of techniques.",
        good: "Keyword → ATT&CK mapping still hits the labeled techniques for each scenario.",
        bad: "infer_techniques heuristics or KB technique map regressed; or gold technique_ids need a rebuild.",
    },
    mean_grounding: {
        label: "Mean grounding",
        short: "Fraction of playbook steps that cite a KB document.",
        detail:
            "On the offline path the playbook is the deterministic template fallback (not live Claude). Grounding = cited steps / total steps. Gate default ≥ 0.50. High grounding here does NOT prove live LLM citation quality.",
        good: "Template playbook still attaches citations from BM25 / technique docs.",
        bad: "RAG retrieval or fallback playbook steps lost citation_ids.",
    },
    full_phase_fraction: {
        label: "Full phase frac",
        short: "Share of cases that include all required IR phases.",
        detail:
            "Required phases: containment, eradication, recovery, lessons_learned. full_phase_fraction = fraction of cases with phase_coverage = 1.0. Gate default ≥ 1.0 (every case must be complete).",
        good: "Every case’s playbook covers the full IR lifecycle.",
        bad: "Template playbook phases incomplete or renamed — CI will fail.",
    },
    mean_latency_s: {
        label: "Mean latency",
        short: "Average wall time for the offline slice per case (seconds).",
        detail:
            "Measures extract → mock enrich → techniques → template playbook only (no Mongo, no LLM API). Gate default ≤ 5.0s mean. Spikes usually mean machine load, not production ingest SLAs.",
        good: "Offline path stays snappy under the CI budget.",
        bad: "Unexpected slowdown in extract/enrich/RAG on this host.",
    },
    n_errors: {
        label: "Case errors",
        short: "Cases that threw during evaluation.",
        detail:
            "Any exception while running a fixture counts as an error. Gate requires 0 errors. Open the per-case table (error column / red rows) for the message.",
        good: "Every fixture completed.",
        bad: "Code path crash or bad fixture — fix before trusting other means.",
    },
};

const COLUMN_HELP = {
    id: "Stable fixture id from dataset.json.",
    name: "Human-readable scenario name (SSH brute, Log4Shell, phishing, …).",
    ioc_f1: "Per-case IoC F1 vs gold. Red if below the aggregate min_ioc_f1 gate.",
    technique_recall: "Per-case ATT&CK technique recall. Red if below min_technique_recall.",
    grounding_score: "Template playbook grounding for this case (cited steps / steps).",
    phase_coverage: "Share of required IR phases present (1.0 = all four). Amber if incomplete.",
    latency_s: "Seconds for this case’s offline pipeline slice.",
    severity: "Heuristic severity from mock threat scores + technique count (offline).",
    techniques: "Predicted MITRE technique IDs for this run (not the gold list).",
};

const INTERPRET_STEPS = [
    {
        title: "What this is",
        body: "A regression check for the offline pipeline, not a live SOC quality score. It freezes known log snippets and expected IoCs/techniques, then runs extract → mock threat intel → ATT&CK inference → template playbook — the same path as GitHub Actions golden-ci and pytest.",
    },
    {
        title: "What PASSED means",
        body: "Every aggregate gate passed: enough cases, mean IoC F1, technique recall, grounding, full IR phase coverage, latency, and zero case errors. Your extractor/mapping/template playbook still match the frozen labels within CI thresholds.",
    },
    {
        title: "What it does NOT mean",
        body: "It does not call Anthropic/OpenAI, write incidents to Mongo, or validate live enrichment keys. A green result does not prove production playbooks or HiTL decisions are correct for real customer logs.",
    },
    {
        title: "When something fails",
        body: "Read the red failure lines under the verdict, then sort the table by the weak metric or enable “Weak / failed only”. If you intentionally changed extractors or gold labels, regenerate fixtures with tests/golden/build_dataset.py and re-run. If you did not, treat red as a regression to fix before merge.",
    },
    {
        title: "Color legend",
        body: "Green metric / check = gate met. Red metric / row tint = below gate or case error. Amber phase cell = incomplete IR phases on that case. Weak filter highlights rows under F1/recall gates or with errors.",
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
    const abortControllerRef = useRef(null);

    const loadMeta = useCallback(async () => {
        setLoading(true);
        abortControllerRef.current = new AbortController();
        try {
            const r = await api.get("/eval/golden-benchmark", {
                signal: abortControllerRef.current.signal,
            });
            setMeta(r.data);
            if (r.data?.last_run) setResult(r.data.last_run);
        } catch (e) {
            if (e?.name !== "CanceledError" && e?.code !== "ERR_CANCELED") {
                toast.error(e?.response?.data?.detail || "Could not load golden benchmark meta");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMeta();
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [loadMeta]);

    // Live elapsed timer while the offline suite is in flight
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
        abortControllerRef.current = new AbortController();
        try {
            const r = await api.post("/eval/golden-benchmark", null, {
                params: liveLlm ? {live_llm: true} : undefined,
                timeout: liveLlm ? 600000 : 300000,
                silentError: true,
                signal: abortControllerRef.current.signal,
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
            if (e?.name !== "CanceledError" && e?.code !== "ERR_CANCELED") {
                toast.error(e?.userMessage || apiErrorMessage(e, "Benchmark run failed"));
            }
        } finally {
            setRunning(false);
            setRunElapsed(0);
            runStartedAt.current = null;
        }
    };

    const summary = result?.summary;
    const thresholds = useMemo(
        () => result?.thresholds || meta?.thresholds || {},
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

    if (loading && !meta) {
        return <div className="text-muted-foreground text-sm p-6">Loading golden benchmark…</div>;
    }

    return (
        <div data-testid="golden-benchmark-page" className="space-y-4">
            <PageHeader
                testid="golden-header"
                title="Golden benchmark"
                icon={Flask}
                subtitle={
                    <>
                        Validate the offline IR pipeline against the frozen golden dataset
                        ({meta?.dataset?.n_cases ?? "—"} cases) — same gates as CI (
                        <span className="font-mono text-muted-foreground">pytest</span> / GitHub Actions).
                        No Mongo writes · no live LLM · template playbook path.
                    </>
                }
                actions={
                    <div className="flex flex-wrap gap-2 shrink-0 items-center">
                        <label
                            className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer px-2 py-1.5 rounded border border-border hover:border-[var(--warning-border)]"
                            title="A-G1: first 5 cases with real playbook LLM (costs tokens; mock TI). Not used in CI."
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
                            title={
                                liveLlm
                                    ? "Run first 5 cases with live playbook LLM (costs tokens)"
                                    : "Run all golden cases offline (same as CI; mock enrich, usually under ~10s)"
                            }
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
                        Offline benchmark in progress — {runElapsed}s elapsed
                    </div>
                    <p className="mt-1 text-muted-foreground leading-relaxed">
                        Evaluating {meta?.dataset?.n_cases ?? "all"} golden cases (parse → mock enrich → ATT&amp;CK →
                        template playbook).
                        No live LLM. Should finish in a few seconds on a fixed server; if this sits past ~60s,
                        restart the backend so it picks up mock-only enrichment (old builds can hit TI timeouts).
                    </p>
                </div>
            )}

            {/* How to interpret */}
            {guideOpen && (
                <Card className="mb-4 border-primary/20 bg-primary/[0.03]" testid="golden-interpret-guide">
                    <div className="flex items-start gap-2 mb-3">
                        <Question size={18} className="text-primary mt-0.5 shrink-0" weight="duotone"/>
                        <div>
                            <div className="text-sm font-semibold text-foreground">How to interpret this page</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Hover the <Info size={10} className="inline text-muted-foreground"/> icons on metrics
                                and table headers for field-level detail.
                            </p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {INTERPRET_STEPS.map((s) => (
                            <div key={s.title} className="rounded-md border border-border bg-muted/50 px-3 py-2.5">
                                <div className="text-[11px] font-semibold text-primary/90 mb-1">{s.title}</div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">{s.body}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><span
                            className="w-2 h-2 rounded-full bg-[var(--success)]"/> Gate met</span>
                        <span className="inline-flex items-center gap-1"><span
                            className="w-2 h-2 rounded-full bg-[var(--error)]"/> Gate failed / weak case</span>
                        <span className="inline-flex items-center gap-1"><span
                            className="w-2 h-2 rounded-full bg-[var(--warning)]"/> Incomplete phases</span>
                        <span className="inline-flex items-center gap-1 font-mono text-muted-foreground/80">
              CLI: pytest tests/test_golden_benchmark.py · python -m golden_eval
            </span>
                    </div>
                </Card>
            )}

            {/* Dataset + mode */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                <Card testid="golden-dataset-meta">
                    <div className="soc-label flex items-center gap-1.5">
                        <ListChecks size={11}/> Dataset
                        <HelpTip title="Golden dataset">
                            <p>Frozen log snippets + expected IoCs and MITRE technique IDs under
                                backend/tests/golden/dataset.json.</p>
                            <p>Rebuild after intentional extractor/keyword changes: python
                                tests/golden/build_dataset.py</p>
                        </HelpTip>
                    </div>
                    <div className="mt-1 font-mono text-xl text-foreground">{meta?.dataset?.n_cases ?? "—"} cases</div>
                    <div
                        className="text-[11px] text-muted-foreground mt-1 font-mono break-all">{meta?.dataset?.path}</div>
                </Card>
                <Card>
                    <div className="soc-label flex items-center gap-1.5">
                        <ShieldCheck size={11}/> Mode
                        <HelpTip title="Benchmark mode">
                            <p>
                                Default offline_template: force_template_playbook=True — deterministic playbook,
                                no Anthropic/OpenAI call. Same as CI.
                            </p>
                            <p>
                                Live LLM sample (toggle): first 5 cases with real playbook generation. Costs tokens.
                                Still uses mock TI. Never the CI path.
                            </p>
                        </HelpTip>
                    </div>
                    <div className="mt-1 text-sm text-foreground">
                        {result?.mode === "live_llm_sample" || (liveLlm && running)
                            ? "live_llm_sample"
                            : "offline_template"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                        {liveLlm
                            ? "Experimental: first 5 cases · real LLM playbook · mock TI"
                            : "Deterministic extract → mock TI → ATT&CK → fallback playbook"}
                    </div>
                </Card>
                <Card testid="golden-last-run-meta">
                    <div className="soc-label flex items-center gap-1.5">
                        <Timer size={11}/> Last run
                        <HelpTip title="Session cache">
                            <p>Results are kept in the backend process memory until restart. Refresh reloads that cache;
                                Run validation executes again.</p>
                        </HelpTip>
                    </div>
                    <div className="mt-1 text-sm text-foreground font-mono">
                        {result?.ran_at ? formatDateTime(result.ran_at) : "Not run this session"}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">
                        {result?.ran_by?.email ? `by ${result.ran_by.email}` : "Click Run validation to execute"}
                    </div>
                </Card>
            </div>

            {/* Pass / fail banner */}
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
                            {result.passed ? "PASSED — all CI thresholds met" : "FAILED — one or more CI gates"}
                            <HelpTip title="Verdict">
                                <p>
                                    {result.passed
                                        ? "Aggregates meet every DEFAULT_THRESHOLDS gate in golden_eval.py. Safe signal that offline pipeline regressions are not present relative to the frozen set."
                                        : "At least one gate failed. Expand failures below, then inspect weak cases. Do not treat partial green metrics as overall pass."}
                                </p>
                            </HelpTip>
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
                        {result.passed && (
                            <p className="text-[11px] text-success mt-1">
                                Offline regression check only — not a substitute for reviewing live incidents or LLM
                                playbooks.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Aggregate metrics */}
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

            {!result && (
                <Card className="mb-6 border-dashed border-primary/20">
                    <div className="flex items-start gap-3">
                        <Target size={20} className="text-primary/70 mt-0.5"/>
                        <div>
                            <div className="text-sm text-foreground/90">No run yet in this server process</div>
                            <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">
                                Press <strong className="text-muted-foreground">Run validation</strong> to execute all
                                golden cases
                                and compare aggregates against CI thresholds (F1 ≥ 0.85, tech recall ≥ 0.80, grounding ≥
                                0.50,
                                full phases, latency ≤ 5s). Use <strong className="text-muted-foreground">How to
                                interpret</strong> above
                                if the metrics are unfamiliar.
                            </p>
                        </div>
                    </div>
                </Card>
            )}

            {/* Per-case table */}
            {result?.cases && (
                <Card testid="golden-cases-table">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <div>
                            <div className="soc-label flex items-center gap-1.5">
                                <Lightning size={11}/> Per-case results
                                <HelpTip title="Per-case table">
                                    <p>Drill into fixtures when aggregates fail or you want the weakest cases first.</p>
                                    <p>Red tint = F1/recall under gate or error. Techniques column shows predictions,
                                        not gold labels.</p>
                                </HelpTip>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                {cases.length} shown · default sort is weakest scores first
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <label
                                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer"
                                title="Show only cases under IoC F1 / tech recall gates, incomplete phases, or errors"
                            >
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
                                title="Sort cases by metric (scores: low first; latency: high first)"
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
                                    title={weak ? "Weak vs CI gates or error — inspect metrics" : undefined}
                                >
                                    <td className="py-1.5 px-2 font-mono text-primary/90 whitespace-nowrap">{c.id}</td>
                                    <td className="py-1.5 px-2 text-foreground/90 max-w-[180px] truncate"
                                        title={c.name}>{c.name}</td>
                                    <td
                                        className={`py-1.5 px-2 font-mono ${(c.ioc_f1 ?? 1) < (thresholds.min_ioc_f1 ?? 0.85) ? "text-error" : "text-foreground"}`}
                                        title={`IoC F1 ${pct(c.ioc_f1)} (P ${pct(c.ioc_precision)} · R ${pct(c.ioc_recall)})`}
                                    >
                                        {pct(c.ioc_f1)}
                                    </td>
                                    <td
                                        className={`py-1.5 px-2 font-mono ${(c.technique_recall ?? 1) < (thresholds.min_technique_recall ?? 0.8) ? "text-error" : "text-foreground"}`}
                                        title={`Technique recall ${pct(c.technique_recall)}`}
                                    >
                                        {pct(c.technique_recall)}
                                    </td>
                                    <td className="py-1.5 px-2 font-mono text-foreground"
                                        title={`Grounding ${pct(c.grounding_score)}`}>
                                        {pct(c.grounding_score)}
                                    </td>
                                    <td
                                        className={`py-1.5 px-2 font-mono ${(c.phase_coverage ?? 1) < 1 ? "text-warning" : "text-foreground"}`}
                                        title={`Phase coverage ${pct(c.phase_coverage)} (need containment, eradication, recovery, lessons_learned)`}
                                    >
                                        {pct(c.phase_coverage)}
                                    </td>
                                    <td className="py-1.5 px-2 font-mono text-muted-foreground"
                                        title="Offline slice latency (seconds)">
                                        {c.latency_s != null ? Number(c.latency_s).toFixed(3) : "—"}
                                    </td>
                                    <td className="py-1.5 px-2 text-muted-foreground uppercase text-[10px]"
                                        title="Offline heuristic severity">
                                        {c.severity || "—"}
                                    </td>
                                    <td className="py-1.5 px-2 font-mono text-muted-foreground max-w-[160px] truncate"
                                        title={(c.predicted_techniques || []).join(", ")}>
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