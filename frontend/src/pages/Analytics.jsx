import {useEffect, useMemo, useState} from "react";
import {api} from "../lib/api";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import {
    ChartBar,
    Database,
    DownloadSimple,
    Fingerprint,
    Globe,
    Scales,
    ShieldCheck,
    TrendUp,
    Warning,
} from "@phosphor-icons/react";
import {AttackTechniqueChart} from "../components/AttackTechniqueChart";
import {loadUiPrefs} from "../lib/uiPrefs";
import {DataTable, PageHeader, useChartTheme} from "../design-system";
import {HelpTip} from "../components/HelpTip";
import {toast} from "sonner";

const STAT_HELP = {
    incidents: {
        title: "Incidents",
        body: "Count of incidents created in the selected window. Each multi-file package or ingest job that produces an IR case counts as one.",
    },
    critical: {
        title: "Critical",
        body: "Incidents with severity critical — typically active exploitation, ransomware, or high-impact C2. Prioritize for HiTL and response.",
    },
    high: {
        title: "High",
        body: "High-severity incidents: strong indicators of compromise or successful attack stages that need prompt analyst attention.",
    },
    medium: {
        title: "Medium",
        body: "Medium-severity cases — suspicious activity that may be probing, partial compromise, or noisy detections needing triage.",
    },
    low: {
        title: "Low",
        body: "Low-severity incidents — often informational or low-confidence detections. Useful for baselining noise.",
    },
    pending_review: {
        title: "HiTL Pending",
        body: "Incidents waiting in the Human-in-the-Loop review queue (status pending_review). Senior reviewers approve, reject, or edit playbooks.",
    },
    events_processed: {
        title: "Events processed",
        body: "Sum of raw log events parsed across jobs in the window. Higher volume can inflate IoC uniqueness and technique counts.",
    },
    unique_source_ips: {
        title: "Unique src IPs",
        body: "Distinct source IP addresses seen on incidents in the window (from extracted IoCs / event fields).",
    },
    unique_iocs: {
        title: "Unique IoCs",
        body: "Distinct indicators of compromise (IPs, domains, hashes, etc.) extracted and enriched in the window.",
    },
    high_threat_iocs: {
        title: "High threat IoCs",
        body: "IoCs whose aggregated threat-intel score crossed the high-threat threshold (live APIs when keys are set; otherwise mock enrichment).",
    },
    multi_file_incidents: {
        title: "Multi-file incidents",
        body: "Incidents built from a multi-file or ZIP package upload rather than a single log file — useful for package-based IR drills.",
    },
    mean_grounding_score: {
        title: "Mean grounding",
        body: "Average playbook grounding score (cited steps / total steps) across incidents in the window. Higher means more KB-cited response steps.",
    },
};

const CHART_HELP = {
    retrieval: {
        title: "Retrieval comparison",
        body: "Offline golden IR queries scored with hit@k for BM25 (keyword), LanceDB dense vectors, hybrid RRF, and hybrid+lexical re-rank. Use this to see when dense/hybrid recovers docs that keyword search misses.",
    },
    timeline: {
        title: "Incident timeline",
        body: "Daily incident volume split by severity. Spikes often align with bulk uploads, exercise days, or attack campaigns.",
    },
    severity: {
        title: "Severity mix",
        body: "Share of incidents by severity in the window. A healthy SOC often has a pyramid (more low/medium than critical); a sudden critical-heavy mix warrants investigation.",
    },
    techniques: {
        title: "Top ATT&CK techniques",
        body: "Most frequent MITRE ATT&CK technique IDs inferred on incidents. Helps prioritize detections and playbook coverage.",
    },
    ioc_types: {
        title: "IoC type distribution",
        body: "Counts of extracted IoC types (ip, domain, hash, …). Skew toward one type can reflect log source mix (e.g. proxy → domains).",
    },
    top_ips: {
        title: "Top source IPs",
        body: "Most frequently observed source IPs across the window. Repeated high-count IPs are candidates for blocklists or deeper investigation.",
    },
    top_domains: {
        title: "Top domains",
        body: "Most frequently observed domains in IoCs. Useful for phishing / C2 domain hunting.",
    },
    top_hashes: {
        title: "Top file hashes",
        body: "Most frequently observed file hashes. Correlate with malware samples and VT/ThreatFox enrichment.",
    },
    status: {
        title: "Status distribution",
        body: "Where incidents sit in the IR lifecycle for this window — queue pressure shows as pending_review share.",
    },
    comparative: {
        title: "Severity vs volume comparison",
        body: "Daily total volume with critical overlay — compare spike composition (noise vs true critical).",
    },
};

const RETRIEVAL_MODE_HELP = {
    bm25: "Keyword/BM25 over the local knowledge base — strong on exact terms (CVE, tool names), weaker on paraphrase.",
    dense: "LanceDB dense ANN using embeddings — better semantic match, needs VECTOR_STORE + embedder.",
    hybrid: "Reciprocal Rank Fusion of BM25 + dense — usually best default for identification.",
    hybrid_rerank: "Hybrid results re-ordered with a lexical/cross-encoder re-ranker when available.",
};

function Card({children, className = "", testid}) {
    return (
        <div data-testid={testid} className={`soc-card p-4 ${className}`}>
            {children}
        </div>
    );
}

function StatCell({label, value, accent = "primary", testid, helpKey}) {
    const cls = {
        primary: "text-primary",
        info: "text-primary",
        red: "text-error",
        error: "text-error",
        amber: "text-warning",
        warning: "text-warning",
        success: "text-success",
        emerald: "text-success",
        muted: "text-muted-foreground",
        cyan: "text-primary",
        violet: "text-primary",
    }[accent] || "text-primary";
    const help = helpKey ? STAT_HELP[helpKey] : null;
    return (
        <Card testid={testid} className="hover:border-primary/40 transition-colors">
            <div className="soc-label flex items-center gap-1">
                <span>{label}</span>
                {help && (
                    <HelpTip title={help.title} testid={`tip-stat-${helpKey}`}>
                        <p>{help.body}</p>
                    </HelpTip>
                )}
            </div>
            <div className={`mt-1.5 font-mono text-2xl ${cls}`}>{value ?? "—"}</div>
        </Card>
    );
}

const MODE_HIT_COLOR = {
    true: "text-success bg-success-soft border-[var(--success-border)]",
    false: "text-error bg-error-soft border-[var(--error-border)]",
};

function HitBadge({ok, label}) {
    return (
        <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-mono text-[10px] ${
                MODE_HIT_COLOR[ok ? "true" : "false"]
            }`}
            title={label}
        >
      {ok ? "HIT" : "MISS"}
    </span>
    );
}

function ChipList({ids, empty = "—"}) {
    if (!ids?.length) return <span className="text-muted-foreground/80">{empty}</span>;
    return (
        <span className="flex flex-wrap gap-1">
      {ids.map((id) => (
          <span key={id} className="citation-chip text-[9px]">{id}</span>
      ))}
    </span>
    );
}

function TopTable({title, items, icon: Icon, accent, testid, helpKey}) {
    const colorMap = {
        primary: "text-primary",
        info: "text-primary",
        error: "text-error",
        warning: "text-warning",
        cyan: "text-primary",
        violet: "text-primary",
        rose: "text-error",
    };
    const help = helpKey ? CHART_HELP[helpKey] : null;
    return (
        <div data-testid={testid} className="soc-card p-4">
            <div className="soc-label mb-3 flex items-center gap-1.5">
                <Icon size={11}/> {title}
                {help && (
                    <HelpTip title={help.title} testid={`tip-${helpKey}`}>
                        <p>{help.body}</p>
                    </HelpTip>
                )}
            </div>
            {items.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-4">No data</div>
            ) : (
                <div className="space-y-1.5">
                    {items.slice(0, 8).map((e, i) => (
                        <div key={`${e.value}-${i}`} className="flex items-center justify-between text-[11px] gap-2">
                            <span className="soc-mono text-foreground/90 truncate">{e.value}</span>
                            <span className={`font-mono ${colorMap[accent]}`}>{e.count}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Analytics() {
    const prefs = loadUiPrefs();
    const chart = useChartTheme();
    const SEV_COLOR = chart.severity;
    const showRetrieval = prefs.analytics_show_retrieval !== false;
    const [data, setData] = useState(null);
    const [days, setDays] = useState(Number(prefs.analytics_default_days) || 30);
    const [retrieval, setRetrieval] = useState(null);
    const [retrievalErr, setRetrievalErr] = useState(null);
    const [retrievalBusy, setRetrievalBusy] = useState(false);
    const [topK, setTopK] = useState(5);
    const [showRetrievalPanel, setShowRetrievalPanel] = useState(showRetrieval);

    useEffect(() => {
        api.get(`/analytics?window_days=${days}`).then((r) => setData(r.data));
    }, [days]);

    const loadRetrievalCompare = () => {
        setRetrievalBusy(true);
        setRetrievalErr(null);
        api
            .get(`/analytics/retrieval-compare?top_k=${topK}`)
            .then((r) => setRetrieval(r.data))
            .catch((e) => {
                setRetrieval(null);
                setRetrievalErr(e?.response?.data?.detail || e.message || "Failed to load comparison");
            })
            .finally(() => setRetrievalBusy(false));
    };

    useEffect(() => {
        if (!showRetrievalPanel) return undefined;
        loadRetrievalCompare();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [topK, showRetrievalPanel]);

    const cumulativeTimeline = useMemo(() => {
        if (!data?.timeline?.length) return [];
        let total = 0;
        return data.timeline.map((row) => {
            const add = row.total != null
                ? Number(row.total) || 0
                : (Number(row.critical) || 0) +
                (Number(row.high) || 0) +
                (Number(row.medium) || 0) +
                (Number(row.low) || 0);
            total += add;
            return {...row, day_total: add, cumulative: total};
        });
    }, [data]);

    const exportAnalyticsReport = () => {
        try {
            const payload = JSON.stringify({
                window_days: days,
                totals: data?.totals,
                timestamp: new Date().toISOString()
            }, null, 2);
            const blob = new Blob([payload], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `soc-analytics-executive-report-${days}d.json`;
            link.click();
            URL.revokeObjectURL(url);
            toast.success("Executive telemetry package exported successfully.");
        } catch {
            toast.error("Failed to export telemetry snapshot.");
        }
    };

    if (!data) return <div className="text-muted-foreground text-sm p-6">Loading security analytics telemetry…</div>;

    const t = data.totals;
    const vs = retrieval?.vector_store;
    const critPct = t.incidents ? Math.round((100 * (t.critical || 0)) / t.incidents) : 0;
    const automationHealth = t.incidents ? Math.round(100 - (100 * (t.pending_review || 0)) / t.incidents) : 100;

    return (
        <div data-testid="analytics-page" className="space-y-4">
            <PageHeader
                testid="analytics-header"
                title="Security Analytics & Posture"
                icon={ChartBar}
                tip={
                    <HelpTip title="Security Analytics" testid="tip-analytics-page">
                        <p>Exploratory data analysis over incidents, IoCs, ATT&CK techniques, and retrieval quality for
                            the selected window.</p>
                        <p className="text-muted-foreground">Use the window selector to compare short- vs long-term
                            trends. Drill into ATT&CK tactics from the techniques chart.</p>
                    </HelpTip>
                }
                subtitle={
                    <>
                        Executive Reporting Window: Last {days} days · {t.incidents} total cases · {critPct}% critical
                        exposure
                    </>
                }
                actions={
                    <div className="flex items-center gap-3 flex-wrap">
            <span
                className="hidden lg:inline-flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
              Live Vector Stream Active
            </span>
                        <button
                            type="button"
                            onClick={exportAnalyticsReport}
                            className="soc-btn-secondary !text-xs !px-3 !py-1.5 !h-8 flex items-center gap-1"
                            title="Download executive JSON compliance snapshot"
                        >
                            <DownloadSimple size={14}/>
                            Export Snapshot
                        </button>
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                               title="Toggle retrieval comparison panel">
                            <input
                                type="checkbox"
                                data-testid="analytics-toggle-retrieval"
                                checked={showRetrievalPanel}
                                onChange={(e) => setShowRetrievalPanel(e.target.checked)}
                                className="rounded border-border"
                            />
                            Retrieval panel
                        </label>
                        <select
                            value={days}
                            onChange={(e) => setDays(parseInt(e.target.value))}
                            data-testid="analytics-window"
                            title="Analytics time window"
                            className="bg-background border border-border px-3 py-1.5 rounded text-xs"
                        >
                            {[7, 14, 30, 60, 90].map((d) => (
                                <option key={d} value={d}>Last {d} days</option>
                            ))}
                        </select>
                    </div>
                }
            />

            {/* CXO Risk Governance Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2">
                <div className="soc-card p-3 flex items-center justify-between border-l-4 border-l-primary bg-card">
                    <div>
                        <div className="text-[10px] uppercase font-mono text-muted-foreground">Automation Index</div>
                        <div className="text-lg font-mono font-bold text-primary mt-0.5">{automationHealth}% Handled
                        </div>
                    </div>
                    <ShieldCheck size={22} className="text-primary/80"/>
                </div>
                <div className="soc-card p-3 flex items-center justify-between border-l-4 border-l-warning bg-card">
                    <div>
                        <div className="text-[10px] uppercase font-mono text-muted-foreground">Queue Pressure (HiTL)
                        </div>
                        <div className="text-lg font-mono font-bold text-warning mt-0.5">{t.pending_review || 0} Cases
                            Awaiting
                        </div>
                    </div>
                    <Warning size={22} className="text-warning/80"/>
                </div>
                <div className="soc-card p-3 flex items-center justify-between border-l-4 border-l-destructive bg-card">
                    <div>
                        <div className="text-[10px] uppercase font-mono text-muted-foreground">Critical Exposure Ratio
                        </div>
                        <div className="text-lg font-mono font-bold text-error mt-0.5">{critPct}% of Total Volume</div>
                    </div>
                    <TrendUp size={22} className="text-error/80"/>
                </div>
            </div>

            {/* Retrieval comparison — BM25 vs LanceDB hybrid */}
            {showRetrievalPanel ? (
                <Card testid="retrieval-compare" className="mb-6 border-primary/20">
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                        <div>
                            <div className="soc-label flex items-center gap-1.5 text-primary/90">
                                <Scales size={12}/> Retrieval comparison
                                <HelpTip title={CHART_HELP.retrieval.title} testid="tip-retrieval-compare">
                                    <p>{CHART_HELP.retrieval.body}</p>
                                    <p className="text-muted-foreground">Exclusive rel = relevant KB docs found only by
                                        that mode (not the others).</p>
                                </HelpTip>
                            </div>
                            <h2 className="font-semibold text-[15px] mt-1">
                                BM25 vs LanceDB dense vs hybrid — identification
                            </h2>
                            <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">
                                Side-by-side hit@k on golden IR queries. Use this to see when keyword search alone
                                misses docs that dense/hybrid (LanceDB) recovers, and which relevant KB ids each path
                                finds.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                top-k
                                <select
                                    data-testid="retrieval-topk"
                                    value={topK}
                                    onChange={(e) => setTopK(parseInt(e.target.value, 10))}
                                    className="bg-background border border-border px-2 py-1 rounded text-xs font-mono"
                                >
                                    {[3, 5, 8, 10].map((k) => (
                                        <option key={k} value={k}>{k}</option>
                                    ))}
                                </select>
                            </label>
                            <button
                                type="button"
                                data-testid="retrieval-refresh"
                                disabled={retrievalBusy}
                                onClick={loadRetrievalCompare}
                                className="text-[11px] px-2.5 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                            >
                                {retrievalBusy ? "Running…" : "Refresh"}
                            </button>
                        </div>
                    </div>

                    {/* Vector store status chips */}
                    <div className="flex flex-wrap gap-2 mb-4" data-testid="vector-store-chips">
                        <span className="soc-label flex items-center gap-1"><Database size={10}/> LanceDB</span>
                        {vs ? (
                            <>
              <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded border ${vs.ok ? "border-[var(--success-border)] text-success" : "border-[var(--error-border)] text-error"}`}>
                {vs.ok ? "ok" : "not ok"}
              </span>
                                <span
                                    className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground">
                kb_rows={vs.kb_rows ?? "—"}
              </span>
                                <span
                                    className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground">
                incidents={vs.incident_rows ?? "—"}
              </span>
                                <span
                                    className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground">
                embedder={vs.embedder ?? "—"} dim={vs.dim ?? "—"}
              </span>
                                {vs.vector_ready != null && (
                                    <span
                                        className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground">
                  vector_ready={String(vs.vector_ready)}
                </span>
                                )}
                            </>
                        ) : (
                            <span
                                className="text-[11px] text-muted-foreground">{retrievalBusy ? "Loading vector status…" : "—"}</span>
                        )}
                    </div>

                    {retrievalErr && (
                        <div className="text-xs text-error mb-3" data-testid="retrieval-error">{retrievalErr}</div>
                    )}

                    {retrieval && (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                                {(retrieval.chart || []).map((row) => (
                                    <div
                                        key={row.mode}
                                        data-testid={`retrieval-stat-${row.mode}`}
                                        className="rounded border border-border bg-muted/50 p-3"
                                    >
                                        <div
                                            className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                                            {row.label}
                                            {RETRIEVAL_MODE_HELP[row.mode] && (
                                                <HelpTip title={row.label} testid={`tip-mode-${row.mode}`}>
                                                    <p>{RETRIEVAL_MODE_HELP[row.mode]}</p>
                                                    <p className="font-mono text-muted-foreground">hit@k = at least one
                                                        gold-relevant doc in top-k</p>
                                                </HelpTip>
                                            )}
                                        </div>
                                        <div className="font-mono text-xl text-primary mt-1">{row.hit_pct}%</div>
                                        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                            hit@{retrieval.top_k} {row.hits}/{row.pairs}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground/80 mt-1">
                                            exclusive rel: {retrieval.exclusive_relevant_counts?.[row.mode] ?? 0}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
                                <div className="xl:col-span-1" data-testid="retrieval-chart">
                                    <div className="text-[11px] text-muted-foreground mb-2">Hit rate by retriever</div>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={retrieval.chart || []} margin={{left: 0, right: 8}}>
                                            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                            <XAxis dataKey="label" tick={{...chart.tick, fontSize: 9}} interval={0}
                                                   angle={-15} textAnchor="end" height={50}/>
                                            <YAxis domain={[0, 100]} tick={chart.tick} unit="%"/>
                                            <Tooltip
                                                contentStyle={chart.contentStyle}
                                                formatter={(v) => [`${v}%`, "hit@k"]}
                                            />
                                            <Bar dataKey="hit_pct" fill={chart.chart.blue} radius={[3, 3, 0, 0]}/>
                                        </BarChart>
                                    </ResponsiveContainer>
                                    <div className="text-[10px] text-muted-foreground/80 space-y-0.5 mt-1">
                                        {Object.entries(retrieval.legend || {}).map(([k, v]) => (
                                            <div key={k}><span
                                                className="text-muted-foreground font-mono">{k}</span> — {v}</div>
                                        ))}
                                    </div>
                                </div>

                                <div className="xl:col-span-2" data-testid="retrieval-id-table">
                                    <div className="text-[11px] text-muted-foreground mb-2">
                                        Per-query identification ({retrieval.pair_count} golden pairs) — which path
                                        found relevant KB docs
                                    </div>
                                    <DataTable className="text-[11px]" maxHeight="22rem"
                                               aria-label="Retrieval identification">
                                        <thead>
                                        <tr>
                                            <th>Query</th>
                                            <th>BM25</th>
                                            <th>Dense</th>
                                            <th>Hybrid</th>
                                            <th>+Rerank</th>
                                            <th>Relevant found (hybrid)</th>
                                            <th>Preferred</th>
                                        </tr>
                                        </thead>
                                        <tbody>
                                        {(retrieval.identification || []).map((row) => (
                                            <tr key={row.id} className="align-top">
                                                <td className="max-w-[180px]">
                                                    <div className="text-foreground/90 leading-snug">{row.query}</div>
                                                    <div
                                                        className="text-[9px] text-muted-foreground/80 font-mono mt-0.5">{row.id}</div>
                                                </td>
                                                <td><HitBadge ok={row.bm25_hit} label="BM25"/></td>
                                                <td><HitBadge ok={row.dense_hit} label="Dense/LanceDB"/></td>
                                                <td><HitBadge ok={row.hybrid_hit} label="Hybrid RRF"/></td>
                                                <td><HitBadge ok={row.hybrid_rerank_hit} label="Hybrid+rerank"/></td>
                                                <td>
                                                    <ChipList ids={row.hybrid_found}/>
                                                    {row.missed_relevant?.length > 0 && (
                                                        <div className="text-[9px] text-error/80 mt-1">
                                                            missed: {row.missed_relevant.join(", ")}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                          <span className="font-mono text-[10px] text-primary/90">
                            {row.preferred_mode || "—"}
                          </span>
                                                </td>
                                            </tr>
                                        ))}
                                        </tbody>
                                    </DataTable>
                                </div>
                            </div>
                        </>
                    )}
                </Card>
            ) : null}

            {/* KPI Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                <StatCell testid="stat-incidents" label="Incidents" value={t.incidents} helpKey="incidents"/>
                <StatCell testid="stat-critical" label="Critical" value={t.critical} accent="error" helpKey="critical"/>
                <StatCell testid="stat-high" label="High" value={t.high} accent="warning" helpKey="high"/>
                <StatCell testid="stat-medium" label="Medium" value={t.medium} accent="warning" helpKey="medium"/>
                <StatCell testid="stat-low" label="Low" value={t.low} accent="info" helpKey="low"/>
                <StatCell testid="stat-pending" label="HiTL Pending" value={t.pending_review} accent="warning"
                          helpKey="pending_review"/>
                <StatCell testid="stat-events" label="Events processed" value={t.events_processed}
                          helpKey="events_processed"/>
                <StatCell testid="stat-ips" label="Unique src IPs" value={t.unique_source_ips}
                          helpKey="unique_source_ips"/>
                <StatCell testid="stat-iocs" label="Unique IoCs" value={t.unique_iocs} accent="primary"
                          helpKey="unique_iocs"/>
                <StatCell testid="stat-highthreat" label="High threat IoCs" value={t.high_threat_iocs} accent="error"
                          helpKey="high_threat_iocs"/>
                <StatCell testid="stat-multifile" label="Multi-file incidents" value={t.multi_file_incidents}
                          accent="primary" helpKey="multi_file_incidents"/>
                <StatCell testid="stat-grounding" label="Mean grounding" value={t.mean_grounding_score} accent="success"
                          helpKey="mean_grounding_score"/>
            </div>

            {/* Row 1: Timeline (span 2) + Severity donut */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">
                <Card testid="chart-timeline" className="xl:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <div className="soc-label flex items-center gap-1.5">
                                <TrendUp size={11}/> Incident timeline
                                <HelpTip title={CHART_HELP.timeline.title} testid="tip-chart-timeline">
                                    <p>{CHART_HELP.timeline.body}</p>
                                </HelpTip>
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">Daily incident volume by
                                severity
                            </div>
                        </div>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                        <LineChart data={data.timeline}>
                            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                            <XAxis dataKey="date" tick={chart.tick}/>
                            <YAxis tick={chart.tick}/>
                            <Tooltip contentStyle={chart.contentStyle}/>
                            <Line type="monotone" dataKey="critical" stroke={SEV_COLOR.critical} strokeWidth={2}
                                  dot={false}/>
                            <Line type="monotone" dataKey="high" stroke={SEV_COLOR.high} strokeWidth={2} dot={false}/>
                            <Line type="monotone" dataKey="medium" stroke={SEV_COLOR.medium} strokeWidth={1.5}
                                  dot={false}/>
                            <Line type="monotone" dataKey="low" stroke={SEV_COLOR.low} strokeWidth={1.5} dot={false}/>
                        </LineChart>
                    </ResponsiveContainer>
                </Card>

                <Card testid="chart-severity">
                    <div className="soc-label mb-3 flex items-center gap-1.5">
                        <Warning size={11}/> Severity mix
                        <HelpTip title={CHART_HELP.severity.title} testid="tip-chart-severity">
                            <p>{CHART_HELP.severity.body}</p>
                        </HelpTip>
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                            <Pie
                                data={data.severity_distribution}
                                dataKey="count"
                                nameKey="severity"
                                cx="50%" cy="50%"
                                innerRadius={55} outerRadius={90}
                                strokeWidth={1}
                                stroke="var(--shell-card)"
                            >
                                {data.severity_distribution.map((e) => (
                                    <Cell key={e.severity} fill={SEV_COLOR[e.severity] || chart.chart.gray}/>
                                ))}
                            </Pie>
                            <Tooltip contentStyle={chart.contentStyle}/>
                            <Legend wrapperStyle={{fontSize: 10, color: chart.axis}}/>
                        </PieChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            {/* Row 2: Top techniques (drill-down) + IoC types */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
                <Card testid="chart-techniques-card" className="flex flex-col">
                    <AttackTechniqueChart
                        topTechniques={data.top_techniques || []}
                        help={CHART_HELP.techniques}
                    />
                </Card>

                <Card testid="chart-ioctypes" className="flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                            <div className="soc-label flex items-center gap-1.5">
                                <Fingerprint size={11}/> IoC Type Distribution
                                <HelpTip title={CHART_HELP.ioc_types.title} testid="tip-chart-ioctypes">
                                    <p>{CHART_HELP.ioc_types.body}</p>
                                </HelpTip>
                            </div>
                        </div>
                        {/* Empty spacer matching the exact height of the technique breadcrumbs */}
                        <div
                            className="flex items-center gap-1.5 text-[10px] text-transparent mb-2 select-none pointer-events-none"
                            aria-hidden="true">
                            <span>Placeholder</span>
                        </div>
                    </div>
                    <div className="w-full">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart
                                data={data.ioc_type_distribution}
                                margin={{left: 10, right: 15, top: 10, bottom: 10}}
                            >
                                <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                <XAxis
                                    dataKey="type"
                                    tick={{...chart.tick, fontFamily: "IBM Plex Mono", fontSize: 10}}
                                    interval={0}
                                    axisLine={false}
                                    tickLine={false}
                                />
                                <YAxis
                                    tick={chart.tick}
                                    axisLine={false}
                                    tickLine={false}
                                    width={35}
                                />
                                <Tooltip contentStyle={chart.contentStyle}/>
                                <Bar
                                    dataKey="count"
                                    fill={chart.chart.gray}
                                    radius={[3, 3, 0, 0]}
                                    maxBarSize={32}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </Card>
            </div>

            {/* Comparative + cumulative */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
                <Card testid="chart-comparative">
                    <div className="soc-label mb-3 flex items-center gap-1.5">
                        <TrendUp size={11}/> Daily volume vs critical
                        <HelpTip title={CHART_HELP.comparative.title} testid="tip-chart-comparative">
                            <p>{CHART_HELP.comparative.body}</p>
                        </HelpTip>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={cumulativeTimeline}>
                            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                            <XAxis dataKey="date" tick={chart.tick}/>
                            <YAxis tick={chart.tick}/>
                            <Tooltip contentStyle={chart.contentStyle}/>
                            <Legend wrapperStyle={{fontSize: 10}}/>
                            <Area type="monotone" dataKey="day_total" name="Daily total" stroke={chart.chart.gray}
                                  fill={`${chart.chart.gray}33`} strokeWidth={2}/>
                            <Area type="monotone" dataKey="critical" name="Critical" stroke={SEV_COLOR.critical}
                                  fill={`${SEV_COLOR.critical}22`} strokeWidth={2}/>
                        </AreaChart>
                    </ResponsiveContainer>
                </Card>

                <Card testid="chart-cumulative">
                    <div className="soc-label mb-3 flex items-center gap-1.5">
                        <TrendUp size={11}/> Cumulative incident volume
                        <HelpTip title="Cumulative volume" testid="tip-chart-cumulative">
                            <p>Running total of incidents over the window — useful for exercise days vs steady-state
                                baselining.</p>
                        </HelpTip>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={cumulativeTimeline}>
                            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                            <XAxis dataKey="date" tick={chart.tick}/>
                            <YAxis tick={chart.tick}/>
                            <Tooltip contentStyle={chart.contentStyle}/>
                            <Area type="monotone" dataKey="cumulative" stroke={chart.chart.blue}
                                  fill={`${chart.chart.blue}33`} strokeWidth={2}/>
                            <Area type="monotone" dataKey="day_total" stroke={chart.chart.gray} fill="transparent"
                                  strokeWidth={1.5} strokeDasharray="4 3"/>
                        </AreaChart>
                    </ResponsiveContainer>
                </Card>
            </div>

            {/* Status distribution */}
            {(data.status_distribution || []).length > 0 && (
                <Card testid="chart-status" className="mb-4">
                    <div className="soc-label mb-3 flex items-center gap-1.5">
                        <Warning size={11}/> Lifecycle status mix
                        <HelpTip title={CHART_HELP.status.title} testid="tip-chart-status">
                            <p>{CHART_HELP.status.body}</p>
                        </HelpTip>
                    </div>
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={data.status_distribution}>
                            <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                            <XAxis dataKey="status" tick={chart.tick}/>
                            <YAxis tick={chart.tick}/>
                            <Tooltip contentStyle={chart.contentStyle}/>
                            <Bar dataKey="count" fill={chart.chart.amber} radius={[3, 3, 0, 0]}/>
                        </BarChart>
                    </ResponsiveContainer>
                </Card>
            )}

            {/* Row 3: Top-N tables */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <TopTable testid="top-ips" title="Top source IPs" icon={Globe} items={data.top_source_ips}
                          accent="primary" helpKey="top_ips"/>
                <TopTable testid="top-domains" title="Top domains" icon={Globe} items={data.top_domains}
                          accent="primary" helpKey="top_domains"/>
                <TopTable testid="top-hashes" title="Top file hashes" icon={Fingerprint} items={data.top_hashes}
                          accent="error" helpKey="top_hashes"/>
            </div>
        </div>
    );
}