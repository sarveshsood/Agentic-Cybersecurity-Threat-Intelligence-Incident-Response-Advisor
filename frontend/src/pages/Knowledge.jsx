import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {api, apiErrorMessage} from "../lib/api";
import {useAuth} from "../lib/auth";
import {toast} from "sonner";
import {
    ArrowsClockwise,
    Books,
    ChartBar,
    Check,
    Copy,
    Database,
    MagnifyingGlass,
    Timer,
    Trash,
    Warning,
} from "@phosphor-icons/react";
import {Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,} from "recharts";
import {HelpTip} from "../components/HelpTip";
import {ListState} from "../components/ListState";
import {loadUiPrefs} from "../lib/uiPrefs";
import {PageHeader, useChartTheme} from "../design-system";

const MODES = [
    {
        id: "hybrid",
        label: "Hybrid",
        detail: "BM25 + LanceDB (RRF)",
        body: "Default production path. Fuses lexical BM25 with dense ANN via reciprocal rank fusion. Best overall recall. Re-rank (Cohere/lexical) runs when enabled in Settings.",
    },
    {
        id: "bm25",
        label: "BM25 only",
        detail: "Lexical / offline-safe",
        body: "Always available. Keyword matching without vectors — use when LanceDB is down or for exact CVE/technique IDs.",
    },
    {
        id: "dense",
        label: "Dense only",
        detail: "LanceDB ANN",
        body: "Semantic nearest-neighbour only. Quality tracks embedder (hash offline vs sbert/lora). Fails soft to empty if vectors unhealthy.",
    },
];

/** Always-visible corpus chips in the left pane (filter applies after a search). */
const KNOWN_SOURCES = ["ALL", "MITRE", "NIST", "CISA", "Custom"];

const TOP_K_OPTIONS = [5, 8, 12, 20];

const MIN_SCORE_OPTIONS = [
    {id: "any", label: "Any score", min: 0},
    {id: "moderate", label: "≥ moderate", min: 0.35},
    {id: "high", label: "≥ high", min: 0.65},
];

const SORT_OPTIONS = [
    {id: "score", label: "Score (default)"},
    {id: "source", label: "Source A–Z"},
    {id: "title", label: "Title A–Z"},
];

function RetrieverBadge({retriever}) {
    const r = (retriever || "unknown").toLowerCase();
    let cls = "border-border text-muted-foreground";
    if (r.includes("hybrid")) cls = "border-primary/40 text-primary bg-primary/10";
    else if (r.includes("dense")) cls = "border-primary/40 text-primary bg-primary/10";
    else if (r.includes("bm25")) cls = "border-[var(--warning-border)] text-warning bg-[var(--warning-bg)]";
    return (
        <span
            className={`text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded border ${cls}`}
            title={`Retriever path: ${retriever || "unknown"}`}
        >
      {retriever || "—"}
    </span>
    );
}

function ConfidenceBadge({score, bm25Score, denseScore, rerankScore}) {
    if (typeof score !== "number" || Number.isNaN(score)) return null;

    let normalizedScore = score;
    if (score < 0.1 && (rerankScore > 0.5 || denseScore > 0.4 || bm25Score > 3.0)) {
        normalizedScore = rerankScore || denseScore || Math.min(1.0, bm25Score / 10);
    }

    let cls = "border-border text-muted-foreground";
    let label = "Low Match";

    if (normalizedScore >= 0.65) {
        cls = "border-[var(--success-border)] text-success bg-success-soft";
        label = "High Confidence";
    } else if (normalizedScore >= 0.35) {
        cls = "border-primary/40 text-primary bg-primary/10";
        label = "Moderate Match";
    }

    return (
        <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${cls}`}
            title={`Fused: ${score.toFixed(3)} | Normalized: ${normalizedScore.toFixed(2)} (${label})`}
        >
      score {score.toFixed(3)} ({label})
    </span>
    );
}

export default function Knowledge() {
    const {user} = useAuth();
    const isAdmin = user?.role === "admin";
    const prefs = loadUiPrefs();
    const chart = useChartTheme();
    const CHART_COLORS = [
        chart.chart.blue,
        chart.chart.gray,
        chart.chart.amber,
        chart.chart.green,
        chart.chart.slate,
        chart.primary,
    ];
    const [q, setQ] = useState("");
    const [mode, setMode] = useState(prefs.kb_default_mode || "hybrid");
    const [topK, setTopK] = useState(() => {
        const n = Number(prefs.kb_default_top_k);
        return TOP_K_OPTIONS.includes(n) ? n : 8;
    });
    const [results, setResults] = useState([]);
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [queryLatencyMs, setQueryLatencyMs] = useState(null);
    const [reindexBusy, setReindexBusy] = useState(false);
    const [loraBusy, setLoraBusy] = useState(false);
    const [ingestText, setIngestText] = useState("");
    const [ingestTitle, setIngestTitle] = useState("");
    const [ingestId, setIngestId] = useState("");
    const [ingestBusy, setIngestBusy] = useState(false);
    const [selectedSourceFilter, setSelectedSourceFilter] = useState("ALL");
    const [minScoreTier, setMinScoreTier] = useState("any");
    const [sortBy, setSortBy] = useState("score");
    const [copiedId, setCopiedId] = useState(null);
    const [customDocs, setCustomDocs] = useState([]);
    const [customBusy, setCustomBusy] = useState(false);

    const abortControllerRef = useRef(null);

    const [searchHistory, setSearchHistory] = useState(() => {
        try {
            const raw = localStorage.getItem("actira_kb_search_history_v1");
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.slice(0, 12) : [];
        } catch {
            return [];
        }
    });

    const loadStatus = useCallback(async () => {
        try {
            const r = await api.get("/kb/vector-status");
            setStatus(r.data);
        } catch (e) {
            if (e?.name !== "CanceledError" && e?.code !== "ERR_CANCELED") {
                setStatus(null);
            }
        }
    }, []);

    const loadCustomDocs = useCallback(async () => {
        if (!isAdmin) {
            setCustomDocs([]);
            return;
        }
        try {
            const r = await api.get("/kb/custom");
            const docs = Array.isArray(r.data?.docs) ? r.data.docs : Array.isArray(r.data) ? r.data : [];
            setCustomDocs(docs);
        } catch {
            setCustomDocs([]);
        }
    }, [isAdmin]);

    useEffect(() => {
        loadStatus();
        loadCustomDocs();
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [loadStatus, loadCustomDocs]);

    useEffect(() => {
        try {
            localStorage.setItem("actira_kb_search_history_v1", JSON.stringify(searchHistory.slice(0, 12)));
        } catch {
            /* private mode */
        }
    }, [searchHistory]);

    const search = async () => {
        if (!q.trim()) {
            toast.error("Please enter a search query");
            return;
        }
        setBusy(true);
        const startTime = performance.now();
        abortControllerRef.current = new AbortController();
        try {
            const r = await api.get(
                `/kb/search?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&top_k=${topK}`,
                {signal: abortControllerRef.current.signal}
            );
            const elapsed = Math.round(performance.now() - startTime);
            setQueryLatencyMs(elapsed);
            const hits = Array.isArray(r.data) ? r.data : [];
            setResults(hits);
            setSelectedSourceFilter("ALL");
            setSearchHistory((h) => [
                {q, mode, topK, n: hits.length, at: Date.now(), latencyMs: elapsed},
                ...h.filter((x) => x.q !== q || x.mode !== mode || x.topK !== topK),
            ].slice(0, 12));
        } catch (e) {
            if (e?.name !== "CanceledError" && e?.code !== "ERR_CANCELED") {
                toast.error(apiErrorMessage(e, "Search failed"));
                setResults([]);
                setQueryLatencyMs(null);
            }
        } finally {
            setBusy(false);
        }
    };

    const copyCitation = (item) => {
        const textToCopy = `[${item.id}] ${item.title}: ${item.text}`;
        navigator.clipboard.writeText(textToCopy);
        setCopiedId(item.id);
        toast.success(`Copied citation for ${item.id}`);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const ingest = async () => {
        if (!ingestText.trim() || ingestText.trim().length < 20) {
            toast.error("Document text must be at least 20 characters long");
            return;
        }
        setIngestBusy(true);
        try {
            const fd = new FormData();
            fd.append("text", ingestText);
            if (ingestTitle) fd.append("title", ingestTitle);
            if (ingestId) fd.append("doc_id", ingestId);
            fd.append("source", "Custom");
            const r = await api.post("/kb/ingest", fd);
            toast.success(`Successfully ingested ${r.data?.doc?.id || "document"}`);
            setIngestText("");
            setIngestTitle("");
            setIngestId("");
            loadStatus();
            loadCustomDocs();
        } catch (e) {
            toast.error(apiErrorMessage(e, "Ingest failed"));
        } finally {
            setIngestBusy(false);
        }
    };

    const deleteCustomDoc = async (docId) => {
        if (!isAdmin || !docId) return;
        if (!window.confirm(`Delete custom KB document ${docId}? This cannot be undone.`)) return;
        setCustomBusy(true);
        try {
            await api.delete(`/kb/custom/${encodeURIComponent(docId)}`);
            toast.success(`Deleted ${docId}`);
            loadCustomDocs();
            loadStatus();
        } catch (e) {
            toast.error(apiErrorMessage(e, "Delete failed"));
        } finally {
            setCustomBusy(false);
        }
    };

    const reindex = async () => {
        if (!isAdmin) return;
        setReindexBusy(true);
        try {
            const r = await api.post("/kb/reindex");
            if (r.data?.ok) {
                toast.success(`Reindexed ${r.data.rows ?? "?"} KB chunks (${r.data.embedder || "embedder"})`);
            } else {
                toast.error(r.data?.reason || "Reindex failed");
            }
            loadStatus();
        } catch (e) {
            toast.error(apiErrorMessage(e, "Reindex failed (admin only)"));
        } finally {
            setReindexBusy(false);
        }
    };

    const trainLora = async () => {
        if (!isAdmin) return;
        setLoraBusy(true);
        try {
            const r = await api.post("/kb/lora/train", {
                method: "linear_lora",
                epochs: 8,
                rank: 16,
                include_approved_incidents: true,
                activate: true,
                reindex: true,
            });
            const hit = r.data?.eval?.hit_at_k;
            toast.success(
                `Domain adapter trained (${r.data?.examples ?? "?"} pairs)` +
                (hit != null ? ` · dense hit@k=${hit}` : "") +
                (r.data?.activated ? " · activated + reindexed" : ""),
            );
            loadStatus();
        } catch (e) {
            toast.error(apiErrorMessage(e, "LoRA train failed (admin only)"));
        } finally {
            setLoraBusy(false);
        }
    };

    const sourceBars = useMemo(() => {
        const counts = {};
        for (const r of results) {
            const s = r.source || "Unknown";
            counts[s] = (counts[s] || 0) + 1;
        }
        return Object.entries(counts)
            .map(([source, count]) => ({source, count}))
            .sort((a, b) => b.count - a.count);
    }, [results]);

    const availableSources = useMemo(() => {
        const fromHits = new Set(results.map((r) => r.source || "Unknown"));
        const known = KNOWN_SOURCES.filter((s) => s === "ALL" || fromHits.has(s) || results.length === 0);
        const extra = Array.from(fromHits).filter((s) => !KNOWN_SOURCES.includes(s));
        return [...known, ...extra];
    }, [results]);

    const filteredResults = useMemo(() => {
        const tier = MIN_SCORE_OPTIONS.find((t) => t.id === minScoreTier) || MIN_SCORE_OPTIONS[0];
        const minScore = tier.min || 0;
        let list = results.filter((r) => {
            if (selectedSourceFilter !== "ALL" && (r.source || "Unknown") !== selectedSourceFilter) {
                return false;
            }
            if (minScore <= 0) return true;
            let sc = Number(r.score);
            if (Number.isNaN(sc)) sc = 0;
            if (sc < 0.1 && (r.rerank_score > 0.5 || r.dense_score > 0.4 || r.bm25_score > 3.0)) {
                sc = r.rerank_score || r.dense_score || Math.min(1.0, (r.bm25_score || 0) / 10);
            }
            return sc >= minScore;
        });
        if (sortBy === "source") {
            list = [...list].sort((a, b) =>
                String(a.source || "").localeCompare(String(b.source || "")),
            );
        } else if (sortBy === "title") {
            list = [...list].sort((a, b) =>
                String(a.title || a.id || "").localeCompare(String(b.title || b.id || "")),
            );
        }
        return list;
    }, [results, selectedSourceFilter, minScoreTier, sortBy]);

    const retrieverPie = useMemo(() => {
        const counts = {};
        for (const r of results) {
            const s = (r.retriever || "unknown").toLowerCase();
            counts[s] = (counts[s] || 0) + 1;
        }
        return Object.entries(counts).map(([name, value]) => ({name, value}));
    }, [results]);

    const scoreBars = useMemo(() => {
        return results.slice(0, 10).map((r, i) => ({
            id: r.id || `#${i + 1}`,
            score: typeof r.score === "number" ? Number(r.score.toFixed(3)) : 0,
        }));
    }, [results]);

    const confidenceSpread = useMemo(() => {
        let high = 0, moderate = 0, low = 0;
        for (const r of results) {
            const sc = typeof r.score === "number" ? r.score : parseFloat(r.score) || 0;
            let norm = sc;
            if (sc < 0.1 && (r.rerank_score > 0.5 || r.dense_score > 0.4 || r.bm25_score > 3.0)) {
                norm = r.rerank_score || r.dense_score || Math.min(1.0, r.bm25_score / 10);
            }
            if (norm >= 0.65) high++;
            else if (norm >= 0.35) moderate++;
            else low++;
        }
        return [
            {tier: "High (≥0.65)", count: high},
            {tier: "Moderate", count: moderate},
            {tier: "Low (<0.35)", count: low},
        ];
    }, [results]);

    const coverage = useMemo(() => {
        const kb = Number(status?.kb_rows) || 0;
        const inc = Number(status?.incident_rows) || 0;
        return [
            {label: "KB chunks", count: kb},
            {label: "Incident vectors", count: inc},
        ];
    }, [status]);

    const usageByMode = useMemo(() => {
        const counts = {};
        for (const h of searchHistory) {
            const m = h.mode || "hybrid";
            counts[m] = (counts[m] || 0) + 1;
        }
        return Object.entries(counts).map(([mode, count]) => ({mode, count}));
    }, [searchHistory]);

    const usageHitsTrend = useMemo(() => {
        return [...searchHistory]
            .reverse()
            .map((h, i) => ({
                step: i + 1,
                hits: h.n,
                mode: h.mode,
                q: (h.q || "").slice(0, 24),
            }));
    }, [searchHistory]);

    const meanHits = useMemo(() => {
        if (!searchHistory.length) return null;
        const s = searchHistory.reduce((a, h) => a + (h.n || 0), 0);
        return Math.round((s / searchHistory.length) * 10) / 10;
    }, [searchHistory]);

    return (
        <div data-testid="kb-page" className="space-y-4">
            <PageHeader
                testid="kb-header"
                title="Knowledge Base"
                icon={Books}
                tip={
                    <HelpTip
                        title="Knowledge Base"
                        body="Hybrid retrieval over MITRE ATT&CK, NIST SP 800-61, CISA KEV and internal SOC playbooks — BM25 + LanceDB vectors (RRF), optional Cohere re-rank. Charts below update from vector status and your session search history."
                        testid="tip-kb-page"
                    />
                }
                subtitle={
                    <>
                        Search the IR knowledge base and inspect coverage, category mix, and session usage metrics.
                        {meanHits != null ? ` · Session avg hits/query: ${meanHits}` : ""}
                    </>
                }
            />

            {/* Embedder honesty — default is offline hash, not SBERT semantic quality */}
            {(() => {
                const emb = String(status?.embedder || "hash").toLowerCase();
                const dim = status?.dim;
                const isHash = emb === "hash" || emb.includes("hash");
                const isSbert = emb.includes("sbert") || emb.includes("bge") || emb.includes("mini");
                const isLora = emb.includes("lora");
                const tone = isHash
                    ? "border-amber-500/40 bg-amber-500/10"
                    : "border-emerald-500/40 bg-emerald-500/10";
                const titleTone = isHash
                    ? "text-amber-800 dark:text-amber-200"
                    : "text-emerald-800 dark:text-emerald-200";
                return (
                    <div
                        className={`flex gap-2 rounded-lg border px-3 py-2 text-[12px] text-foreground ${tone}`}
                        data-testid="kb-embedder-banner"
                        role="note"
                    >
                        <Warning
                            size={16}
                            className={`shrink-0 mt-0.5 ${isHash ? "text-amber-600" : "text-emerald-600"}`}
                            weight="fill"
                            aria-hidden
                        />
                        <div className="min-w-0 leading-relaxed text-muted-foreground">
                            <p className={`m-0 font-semibold ${titleTone}`}>
                                {isHash
                                    ? "Default embedder: hash (offline) — not SBERT"
                                    : isLora
                                        ? `Active embedder: ${status?.embedder || emb} (hash + domain LoRA adapter)`
                                        : isSbert
                                            ? `Active embedder: ${status?.embedder || emb} (semantic SBERT path)`
                                            : `Active embedder: ${status?.embedder || emb}`}
                            </p>
                            <p className="m-0 mt-1 text-[11px]">
                                {isHash ? (
                                    <>
                                        Dense ANN uses deterministic n-gram hashing for offline demos and CI —{" "}
                                        <strong className="font-medium text-foreground">not</strong> sentence-transformers quality.
                                        Hybrid search still blends BM25 + vectors (RRF). For stronger semantic retrieval set{" "}
                                        <span className="font-mono text-foreground">ACTIRA_EMBEDDING_BACKEND=sbert</span> (or{" "}
                                        <span className="font-mono text-foreground">lora</span>) and reindex.
                                        {dim != null ? (
                                            <span className="font-mono"> · dim={dim}</span>
                                        ) : null}
                                    </>
                                ) : (
                                    <>
                                        Dense path is active with embedder{" "}
                                        <span className="font-mono text-foreground">{status?.embedder || emb}</span>
                                        {dim != null ? (
                                            <span className="font-mono"> · dim={dim}</span>
                                        ) : null}
                                        . BM25 remains the always-on lexical fallback. Reindex after switching backends.
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                );
            })()}

            {/* Analytics strip */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5" data-testid="kb-analytics">
                <div className="soc-card p-4">
                    <div className="soc-label flex items-center gap-1.5 mb-2">
                        <Books size={11}/> Knowledge coverage
                        <HelpTip title="Coverage"
                                 body="LanceDB row counts for static KB chunks vs embedded incident narratives. Reindex after changing embedder or ingesting docs."/>
                    </div>
                    {coverage.every((c) => !c.count) ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">Status unavailable</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={coverage}>
                                <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                <XAxis dataKey="label" tick={chart.tick}/>
                                <YAxis tick={chart.tick} width={36}/>
                                <Tooltip contentStyle={chart.contentStyle}/>
                                <Bar dataKey="count" fill={chart.chart.blue} radius={[3, 3, 0, 0]}/>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
                <div className="soc-card p-4">
                    <div className="soc-label flex items-center gap-1.5 mb-2">
                        <ChartBar size={11}/> Result sources (last search)
                        <HelpTip title="Category comparison"
                                 body="Distribution of KB sources among the current search hits (MITRE, NIST, CISA, Custom playbooks)."/>
                    </div>
                    {sourceBars.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">Run a search to populate</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={sourceBars} layout="vertical" margin={{left: 8}}>
                                <CartesianGrid strokeDasharray="2 4" stroke={chart.grid} horizontal={false}/>
                                <XAxis type="number" tick={chart.tick}/>
                                <YAxis dataKey="source" type="category" width={70} tick={{...chart.tick, fontSize: 9}}/>
                                <Tooltip contentStyle={chart.contentStyle}/>
                                <Bar dataKey="count" fill={chart.chart.gray} radius={[0, 3, 3, 0]}/>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
                <div className="soc-card p-4">
                    <div className="soc-label flex items-center gap-1.5 mb-2">
                        Retriever mix
                        <HelpTip title="Retriever mix"
                                 body="Which path contributed each hit (bm25 / dense / hybrid) for the last query."/>
                    </div>
                    {retrieverPie.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">Run a search to populate</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={140}>
                            <PieChart>
                                <Pie data={retrieverPie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                                     outerRadius={55} stroke="var(--shell-card)">
                                    {retrieverPie.map((_, i) => (
                                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={chart.contentStyle}/>
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Usage statistics (session) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5" data-testid="kb-usage-analytics">
                <div className="soc-card p-4">
                    <div className="soc-label flex items-center gap-1.5 mb-2">
                        Mode usage (this session)
                        <HelpTip title="Usage statistics"
                                 body="How often each retrieval mode was used during this browser session."/>
                    </div>
                    {usageByMode.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">Search history empty</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={usageByMode}>
                                <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                <XAxis dataKey="mode" tick={chart.tick}/>
                                <YAxis tick={chart.tick} width={28} allowDecimals={false}/>
                                <Tooltip contentStyle={chart.contentStyle}/>
                                <Bar dataKey="count" fill={chart.chart.green} radius={[3, 3, 0, 0]}/>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
                <div className="soc-card p-4">
                    <div className="soc-label flex items-center gap-1.5 mb-2">
                        Hits trend (recent searches)
                        <HelpTip title="Trend analysis"
                                 body="Result count returned for each successive search (persisted in this browser) — compare modes for coverage."/>
                    </div>
                    {usageHitsTrend.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-6 text-center">Search history empty — run a few
                            queries</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={140}>
                            <BarChart data={usageHitsTrend}>
                                <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                <XAxis dataKey="step" tick={chart.tick}/>
                                <YAxis tick={chart.tick} width={28} allowDecimals={false}/>
                                <Tooltip
                                    contentStyle={chart.contentStyle}
                                    formatter={(v, _n, p) => [v, `${p.payload.mode}: ${p.payload.q}`]}
                                />
                                <Bar dataKey="hits" fill={chart.chart.amber} radius={[3, 3, 0, 0]}/>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* Graphical Side Enhancement: Perfectly Aligned 2-Column Graph Panes */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
                <div className="soc-card p-4" data-testid="kb-score-chart">
                    <div className="soc-label mb-2 flex items-center gap-1.5">
                        Top hit scores
                        <HelpTip title="Hit scores"
                                 body="Relative ranking scores for the top results of the last search (higher is better for that mode)."/>
                    </div>
                    {scoreBars.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-10 text-center">Run a search to populate</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={scoreBars}>
                                <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                <XAxis dataKey="id" tick={{...chart.tick, fontSize: 9}} interval={0} angle={-20}
                                       textAnchor="end" height={50}/>
                                <YAxis tick={chart.tick}/>
                                <Tooltip contentStyle={chart.contentStyle}/>
                                <Bar dataKey="score" fill={chart.chart.green} radius={[3, 3, 0, 0]}/>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
                <div className="soc-card p-4" data-testid="kb-confidence-spread">
                    <div className="soc-label mb-2 flex items-center gap-1.5">
                        Confidence spread
                        <HelpTip title="Confidence Tiers"
                                 body="Breakdown of search hits categorized by normalized confidence tiers."/>
                    </div>
                    {results.length === 0 ? (
                        <div className="text-xs text-muted-foreground py-10 text-center">Run a search to populate</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={confidenceSpread}>
                                <CartesianGrid strokeDasharray="2 4" stroke={chart.grid}/>
                                <XAxis dataKey="tier" tick={{...chart.tick, fontSize: 9}}/>
                                <YAxis tick={chart.tick} width={24} allowDecimals={false}/>
                                <Tooltip contentStyle={chart.contentStyle}/>
                                <Bar dataKey="count" fill={chart.chart.blue} radius={[3, 3, 0, 0]}/>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>

            {/* LanceDB / vector status */}
            <div
                className="soc-card p-3 mb-5 flex flex-wrap items-center gap-2"
                data-testid="kb-vector-status"
            >
        <span className="soc-label flex items-center gap-1.5 text-primary/90">
          <Database size={12}/> Vector store
        </span>
                {status ? (
                    <>
            <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    status.ok
                        ? "border-[var(--success-border)] text-success"
                        : "border-[var(--error-border)] text-error"
                }`}
                title={status.ok ? "Vector store healthy" : "Vector store degraded"}
            >
              {status.ok ? "ok" : "degraded"}
            </span>
                        <span
                            className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground"
                            title="KB chunk rows in LanceDB">
              kb_rows={status.kb_rows ?? "—"}
            </span>
                        <span
                            className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground"
                            title="Embedded incident narratives">
              incidents={status.incident_rows ?? "—"}
            </span>
                        <span
                            className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground"
                            title="Embedding backend">
              embedder={status.embedder ?? "—"} dim={status.dim ?? "—"}
            </span>
                        {status.vector_ready != null && (
                            <span
                                className="text-[10px] font-mono px-2 py-0.5 rounded border border-border text-muted-foreground">
                ready={String(status.vector_ready)}
              </span>
                        )}
                        {status.error && (
                            <span className="text-[10px] text-error">{status.error}</span>
                        )}
                        {(status.embedder === "hash" || status.embedder === "none" || !status.ok) && (
                            <span
                                className="text-[10px] text-warning/90 max-w-xl leading-snug"
                                data-testid="kb-sbert-hint"
                                title="Set ACTIRA_EMBEDDING_BACKEND=sbert and pip install sentence-transformers"
                            >
                Prod tip: set <span className="font-mono">ACTIRA_EMBEDDING_BACKEND=sbert</span>
                                {" "}(model <span className="font-mono">BAAI/bge-small-en-v1.5</span>) then Reindex KB
                for real dense retrieval. Or train a domain LoRA adapter (admin) for offline fine-tune.
              </span>
                        )}
                        {status.lora && (
                            <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                                    status.lora.ok
                                        ? "border-primary/40 text-primary"
                                        : "border-border text-muted-foreground"
                                }`}
                                data-testid="kb-lora-status"
                                title={status.lora.ok ? "Domain adapter ready" : status.lora.error || "No adapter"}
                            >
                lora={status.lora.ok ? `ok r${status.lora.rank ?? "?"}` : "none"}
              </span>
                        )}
                    </>
                ) : (
                    <span className="text-[11px] text-muted-foreground">Loading status…</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        data-testid="kb-status-refresh"
                        onClick={loadStatus}
                        title="Refresh vector store status"
                        className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                    >
                        Refresh status
                    </button>
                    {isAdmin && (
                        <button
                            type="button"
                            data-testid="kb-lora-train"
                            disabled={loraBusy}
                            onClick={trainLora}
                            title="Train domain embedding adapter from golden Q→doc pairs + approved playbooks, activate, and reindex"
                            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                        >
                            <ChartBar size={12} className={loraBusy ? "animate-pulse" : ""}/>
                            {loraBusy ? "Training LoRA…" : "Train domain LoRA"}
                        </button>
                    )}
                    {isAdmin && (
                        <button
                            type="button"
                            data-testid="kb-reindex"
                            disabled={reindexBusy}
                            onClick={reindex}
                            title="Rebuild LanceDB index from static + custom KB docs"
                            className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                        >
                            <ArrowsClockwise size={12} className={reindexBusy ? "animate-spin" : ""}/>
                            {reindexBusy ? "Reindexing…" : "Reindex KB"}
                        </button>
                    )}
                </div>
            </div>

            {isAdmin && (
                <div className="soc-card p-4 mb-5 space-y-2" data-testid="kb-ingest-panel">
                    <div className="soc-label text-primary/90 flex items-center gap-1.5">
                        Ingest custom KB document (admin)
                        <HelpTip title="Custom ingest"
                                 body="Adds a custom playbook/note to the in-memory KB + LanceDB reindex. Stored in Mongo kb_docs."/>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Adds a custom playbook/note to the in-memory KB + LanceDB reindex. Stored in Mongo <span
                        className="font-mono">kb_docs</span>.
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <input
                            data-testid="kb-ingest-id"
                            value={ingestId}
                            onChange={(e) => setIngestId(e.target.value)}
                            placeholder="doc id e.g. CUSTOM-SOP-1"
                            title="Optional document id"
                            className="bg-background border border-border rounded px-2 py-1.5 text-xs font-mono w-48"
                        />
                        <input
                            data-testid="kb-ingest-title"
                            value={ingestTitle}
                            onChange={(e) => setIngestTitle(e.target.value)}
                            placeholder="Title"
                            title="Document title"
                            className="bg-background border border-border rounded px-2 py-1.5 text-xs flex-1 min-w-[160px]"
                        />
                    </div>
                    <textarea
                        data-testid="kb-ingest-text"
                        value={ingestText}
                        onChange={(e) => setIngestText(e.target.value)}
                        rows={4}
                        placeholder="Paste IR guidance, SOP text, or technique notes (min ~20 chars)…"
                        title="Document body text"
                        className="w-full bg-background border border-border rounded px-3 py-2 text-xs font-mono"
                    />
                    <button
                        type="button"
                        data-testid="kb-ingest-submit"
                        disabled={ingestBusy}
                        onClick={ingest}
                        title="Ingest into KB and reindex vectors"
                        className="text-[11px] px-3 py-1.5 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                    >
                        {ingestBusy ? "Ingesting…" : "Ingest to KB"}
                    </button>

                    <div className="pt-3 border-t border-border mt-3" data-testid="kb-custom-manager">
                        <div className="soc-label text-primary/90 flex items-center gap-1.5 mb-2">
                            Custom documents manager
                            <HelpTip
                                title="Custom KB docs"
                                body="Admin-only list of ingested custom documents (Mongo kb_docs + in-memory KB). Delete removes from both and reindexes vectors."
                                testid="tip-kb-custom-manager"
                            />
                        </div>
                        {customDocs.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground m-0" data-testid="kb-custom-empty">
                                No custom documents yet. Ingest above to add pilot SOPs / notes.
                            </p>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs" data-testid="kb-custom-table">
                                    <thead>
                                    <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                        <th className="py-1.5 pr-2 font-semibold">ID</th>
                                        <th className="py-1.5 pr-2 font-semibold">Title</th>
                                        <th className="py-1.5 pr-2 font-semibold">Source</th>
                                        <th className="py-1.5 font-semibold text-right">Actions</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                    {customDocs.map((d) => (
                                        <tr key={d.id} data-testid={`kb-custom-row-${d.id}`}>
                                            <td className="py-2 pr-2 font-mono text-primary whitespace-nowrap">{d.id}</td>
                                            <td className="py-2 pr-2 text-foreground max-w-[14rem] truncate" title={d.title}>
                                                {d.title || "—"}
                                            </td>
                                            <td className="py-2 pr-2 text-muted-foreground">{d.source || "Custom"}</td>
                                            <td className="py-2 text-right">
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-error/40 text-error hover:bg-error/10 disabled:opacity-50"
                                                    data-testid={`kb-custom-delete-${d.id}`}
                                                    disabled={customBusy}
                                                    onClick={() => deleteCustomDoc(d.id)}
                                                    title={`Delete ${d.id}`}
                                                >
                                                    <Trash size={12}/>
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <button
                            type="button"
                            className="mt-2 text-[10px] text-muted-foreground hover:text-primary underline"
                            data-testid="kb-custom-refresh"
                            onClick={loadCustomDocs}
                        >
                            Refresh list
                        </button>
                    </div>
                </div>
            )}

            {/* Search workspace: left options pane + results */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" data-testid="kb-search-workspace">
                <aside
                    className="lg:col-span-3 space-y-4"
                    data-testid="kb-search-left-pane"
                    aria-label="Knowledge search options"
                >
                    <div className="soc-card p-4 space-y-3">
                        <div className="soc-label flex items-center gap-1.5">
                            Retrieval mode
                            <HelpTip
                                title="Retrieval mode"
                                body="Choose how ACTIRA ranks KB chunks. Hybrid is default; BM25 is always offline-safe; dense depends on LanceDB + embedder quality."
                                testid="tip-kb-mode-pane"
                            />
                        </div>
                        <div className="space-y-1.5" role="radiogroup" aria-label="Retrieval mode" data-testid="kb-mode">
                            {MODES.map((m) => {
                                const active = mode === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        data-testid={`kb-mode-${m.id}`}
                                        title={m.body}
                                        onClick={() => setMode(m.id)}
                                        className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                                            active
                                                ? "border-primary bg-primary/10 text-foreground shadow-sm"
                                                : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                        }`}
                                    >
                                        <div className="text-[13px] font-semibold">{m.label}</div>
                                        <div className="text-[10px] font-mono mt-0.5 opacity-80">{m.detail}</div>
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                            {MODES.find((m) => m.id === mode)?.body}
                        </p>
                    </div>

                    <div className="soc-card p-4 space-y-2">
                        <div className="soc-label flex items-center gap-1.5">
                            Result limit (top_k)
                            <HelpTip
                                title="Top-K results"
                                body="How many ranked chunks to return. Higher values improve recall for broad queries; lower values speed demos."
                                testid="tip-kb-topk-pane"
                            />
                        </div>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Top K" data-testid="kb-topk">
                            {TOP_K_OPTIONS.map((k) => {
                                const active = topK === k;
                                return (
                                    <button
                                        key={k}
                                        type="button"
                                        data-testid={`kb-topk-${k}`}
                                        onClick={() => setTopK(k)}
                                        className={`min-w-[2.5rem] text-center text-[11px] font-mono px-2 py-1.5 rounded border transition-colors ${
                                            active
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-background text-muted-foreground border-border hover:border-primary/40"
                                        }`}
                                    >
                                        {k}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="soc-card p-4 space-y-2">
                        <div className="soc-label flex items-center gap-1.5">
                            Source corpus
                            <HelpTip
                                title="Source filters"
                                body="Narrow hits after search by corpus (MITRE, NIST, CISA, Custom). ALL shows every hit from the last query. Known corpora stay visible before search."
                                testid="tip-kb-source-pane"
                            />
                        </div>
                        <div className="flex flex-col gap-1" data-testid="kb-source-filters">
                            {availableSources.map((src) => {
                                const active = selectedSourceFilter === src;
                                const count = src === "ALL"
                                    ? results.length
                                    : results.filter((r) => (r.source || "Unknown") === src).length;
                                return (
                                    <button
                                        key={src}
                                        type="button"
                                        onClick={() => setSelectedSourceFilter(src)}
                                        disabled={results.length === 0 && src !== "ALL"}
                                        className={`text-left text-[11px] px-2.5 py-1.5 rounded border font-mono transition-colors ${
                                            active
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-background text-muted-foreground border-border hover:border-primary/40 disabled:opacity-50"
                                        }`}
                                    >
                                        {src}{results.length > 0 ? ` (${count})` : ""}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="soc-card p-4 space-y-2" data-testid="kb-min-score-pane">
                        <div className="soc-label flex items-center gap-1.5">
                            Min confidence
                            <HelpTip
                                title="Minimum score filter"
                                body="Client-side filter on the last result set. Uses fused score (or normalized BM25/dense/rerank when fused scores are tiny). Does not re-query the API."
                                testid="tip-kb-minscore-pane"
                            />
                        </div>
                        <div className="flex flex-col gap-1" role="group" aria-label="Minimum confidence">
                            {MIN_SCORE_OPTIONS.map((opt) => {
                                const active = minScoreTier === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        data-testid={`kb-minscore-${opt.id}`}
                                        onClick={() => setMinScoreTier(opt.id)}
                                        className={`text-left text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
                                            active
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-background text-muted-foreground border-border hover:border-primary/40"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="soc-card p-4 space-y-2" data-testid="kb-sort-pane">
                        <div className="soc-label flex items-center gap-1.5">
                            Sort results
                            <HelpTip
                                title="Result sort"
                                body="Reorder the current hits without a new search. Score keeps API rank; Source/Title sort alphabetically."
                                testid="tip-kb-sort-pane"
                            />
                        </div>
                        <div className="flex flex-col gap-1" role="group" aria-label="Sort results">
                            {SORT_OPTIONS.map((opt) => {
                                const active = sortBy === opt.id;
                                return (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        data-testid={`kb-sort-${opt.id}`}
                                        onClick={() => setSortBy(opt.id)}
                                        className={`text-left text-[11px] px-2.5 py-1.5 rounded border transition-colors ${
                                            active
                                                ? "bg-primary text-primary-foreground border-primary"
                                                : "bg-background text-muted-foreground border-border hover:border-primary/40"
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                        {results.length > 0 && filteredResults.length !== results.length && (
                            <p className="text-[10px] text-muted-foreground m-0">
                                Showing {filteredResults.length} of {results.length} hits
                            </p>
                        )}
                    </div>

                    <div className="soc-card p-4 space-y-2" data-testid="kb-vector-left">
                        <div className="soc-label flex items-center gap-1.5">
                            <Database size={11}/> Vector status
                            <HelpTip
                                title="Vector store"
                                body="LanceDB health, embedder honesty, and row counts. Dense mode quality tracks the embedder (hash vs sbert/lora)."
                                testid="tip-kb-vector-pane"
                            />
                        </div>
                        {status ? (
                            <dl className="space-y-1.5 text-[11px] font-mono">
                                <div className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">health</dt>
                                    <dd className={status.ok ? "text-success font-semibold" : "text-error font-semibold"}>
                                        {status.ok ? "ok" : "degraded"}
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">embedder</dt>
                                    <dd className="text-right break-all max-w-[60%]">{status.embedder ?? "—"}</dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">kb_rows</dt>
                                    <dd>{status.kb_rows ?? "—"}</dd>
                                </div>
                                <div className="flex justify-between gap-2">
                                    <dt className="text-muted-foreground">incidents</dt>
                                    <dd>{status.incident_rows ?? "—"}</dd>
                                </div>
                                {status.dim != null && (
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-muted-foreground">dim</dt>
                                        <dd>{status.dim}</dd>
                                    </div>
                                )}
                            </dl>
                        ) : (
                            <p className="text-[11px] text-muted-foreground m-0">Status unavailable</p>
                        )}
                        <button
                            type="button"
                            className="text-[10px] text-primary hover:underline font-medium"
                            onClick={loadStatus}
                            data-testid="kb-vector-refresh"
                        >
                            Refresh status
                        </button>
                    </div>

                    <div className="soc-card p-4 space-y-2" data-testid="kb-search-history">
                        <div className="flex items-center justify-between gap-2">
                            <div className="soc-label">Recent (this browser)</div>
                            {searchHistory.length > 0 && (
                                <button
                                    type="button"
                                    className="text-[10px] text-muted-foreground hover:text-error"
                                    data-testid="kb-history-clear"
                                    onClick={() => setSearchHistory([])}
                                    title="Clear session search history"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        {searchHistory.length === 0 ? (
                            <div className="text-[10px] text-muted-foreground py-2">No queries yet this session.</div>
                        ) : (
                            <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                                {searchHistory.map((h) => (
                                    <button
                                        key={`${h.q}-${h.mode}-${h.topK || 8}-${h.at}`}
                                        type="button"
                                        title={`${h.n} hits · ${h.mode}${h.topK ? ` · k=${h.topK}` : ""}${h.latencyMs ? ` · ${h.latencyMs}ms` : ""}`}
                                        className="text-left text-[10px] px-2 py-1.5 rounded border border-border text-muted-foreground hover:text-primary hover:border-primary/40"
                                        onClick={() => {
                                            setQ(h.q);
                                            setMode(h.mode || "hybrid");
                                            if (h.topK && TOP_K_OPTIONS.includes(h.topK)) setTopK(h.topK);
                                        }}
                                    >
                                        <span className="line-clamp-2">{h.q}</span>
                                        <span className="font-mono opacity-70">
                                            {" "}· {h.n} · {h.mode}{h.topK ? ` · k=${h.topK}` : ""}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>

                <div className="lg:col-span-9 space-y-4 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            data-testid="kb-query"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && search()}
                            placeholder="Search techniques, tactics, CVEs, playbook steps…"
                            title="Natural language or keyword query"
                            className="flex-1 min-w-[200px] bg-background border border-border rounded px-3 py-2 text-sm"
                        />
                        {/* Hidden select keeps form/test parity for mode */}
                        <select
                            className="sr-only"
                            tabIndex={-1}
                            aria-hidden
                            value={mode}
                            onChange={(e) => setMode(e.target.value)}
                        >
                            {MODES.map((m) => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                        </select>
                        <button
                            data-testid="kb-search"
                            onClick={search}
                            disabled={busy}
                            title="Run hybrid / BM25 / dense search"
                            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-5 py-2 rounded transition-colors disabled:opacity-60"
                        >
                            <MagnifyingGlass size={14} weight="bold"/>
                            {busy ? "Searching…" : "Search"}
                        </button>
                        {queryLatencyMs != null && (
                            <span
                                className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground bg-muted/50 px-2.5 py-2 rounded border border-border"
                                title="Query execution time"
                            >
                                <Timer size={13}/> {queryLatencyMs}ms
                            </span>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground border border-border rounded px-2 py-1.5">
                            mode={mode} · k={topK}
                        </span>
                    </div>

                    <div className="space-y-3">
                        {filteredResults.map((r) => (
                            <div key={r.id} className="soc-card p-4 relative group" data-testid={`kb-hit-${r.id}`}>
                                <div className="flex items-center justify-between mb-1 gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span
                                            className="inline-flex items-center gap-1.5 citation-chip px-2 py-0.5 rounded border border-border bg-muted/30 text-xs font-mono"
                                            title="Document id"
                                        >
                                            {r.id}
                                            <button
                                                type="button"
                                                onClick={() => copyCitation(r)}
                                                className="text-muted-foreground hover:text-foreground transition-colors p-0.5 inline-flex items-center justify-center"
                                                title="Copy citation snippet"
                                            >
                                                {copiedId === r.id ? <Check size={12} className="text-success"/> : <Copy size={12}/>}
                                            </button>
                                        </span>
                                        <span className="soc-label" title="Source corpus">{r.source}</span>
                                        <RetrieverBadge retriever={r.retriever}/>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {r.bm25_score != null && (
                                            <span className="font-mono text-[9px] text-muted-foreground" title="BM25 score">
                                                bm25 {Number(r.bm25_score).toFixed(2)}
                                            </span>
                                        )}
                                        {r.dense_score != null && (
                                            <span className="font-mono text-[9px] text-muted-foreground" title="Dense similarity">
                                                dense {Number(r.dense_score).toFixed(2)}
                                            </span>
                                        )}
                                        {r.rerank_score != null && (
                                            <span className="font-mono text-[9px] text-primary/80" title="Re-rank score">
                                                rerank {Number(r.rerank_score).toFixed(2)}
                                            </span>
                                        )}
                                        <ConfidenceBadge
                                            score={typeof r.score === "number" ? r.score : parseFloat(r.score)}
                                            bm25Score={r.bm25_score}
                                            denseScore={r.dense_score}
                                            rerankScore={r.rerank_score}
                                        />
                                    </div>
                                </div>
                                <div className="font-semibold text-[15px]">{r.title}</div>
                                <div className="text-[12px] text-muted-foreground mt-1.5 leading-relaxed">{r.text}</div>
                            </div>
                        ))}
                        {busy && (
                            <ListState variant="loading" message="Searching knowledge base…" testid="kb-search-loading"/>
                        )}
                        {filteredResults.length === 0 && results.length > 0 && !busy && (
                            <div className="text-xs text-muted-foreground py-4 text-center" role="status">
                                No results match the selected source filter ({selectedSourceFilter}).
                            </div>
                        )}
                        {results.length === 0 && !busy && (
                            <ListState
                                variant="empty"
                                message="Enter a query and search — hybrid uses LanceDB when the vector store is healthy. Pick BM25-only or dense-only in the left pane if needed."
                                testid="kb-search-empty"
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}