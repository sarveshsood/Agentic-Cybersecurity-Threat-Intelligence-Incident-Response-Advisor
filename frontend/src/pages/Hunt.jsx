import {useCallback, useEffect, useState} from "react";
import {Link, useSearchParams} from "react-router-dom";
import {api} from "../lib/api";
import {PageHeader} from "../design-system";
import {HelpTip, Tip} from "../components/HelpTip";
import {SeverityBadge, StatusPill} from "../components/SeverityBadge";
import {ListState} from "../components/ListState";
import {MagnifyingGlass, Crosshair, Pulse, Warning} from "@phosphor-icons/react";
import {toast} from "sonner";

const SEV_OPTIONS = [
    {value: "", label: "All severities"},
    {value: "critical", label: "Critical"},
    {value: "high", label: "High"},
    {value: "medium", label: "Medium"},
    {value: "low", label: "Low"},
];

const STATUS_OPTIONS = [
    {value: "", label: "All statuses"},
    {value: "new", label: "New"},
    {value: "in_progress", label: "In progress"},
    {value: "pending_review", label: "Pending review"},
    {value: "approved", label: "Approved"},
    {value: "rejected", label: "Rejected"},
    {value: "closed", label: "Closed"},
];

export default function Hunt() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [q, setQ] = useState(searchParams.get("q") || "");
    const [severity, setSeverity] = useState(searchParams.get("severity") || "");
    const [status, setStatus] = useState(searchParams.get("status") || "");
    const [suggestions, setSuggestions] = useState([]);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hotspots, setHotspots] = useState(null);
    const [huntError, setHuntError] = useState(null);

    useEffect(() => {
        api
            .get("/hunt/suggestions")
            .then((r) => setSuggestions(r.data?.suggestions || []))
            .catch(() =>
                setSuggestions([
                    "Find suspicious PowerShell",
                    "Show lateral movement",
                    "Find ransomware indicators",
                    "Show suspicious DNS",
                    "Find persistence",
                ]),
            );
        api
            .get("/hunt/behavior?limit=8")
            .then((r) => setHotspots(r.data))
            .catch(() => setHotspots(null));
    }, []);

    // Deep-link: auto-run when ?q= present on mount / param change
    useEffect(() => {
        const initial = (searchParams.get("q") || "").trim();
        if (!initial) return;
        run(initial, {
            severity: searchParams.get("severity") || "",
            status: searchParams.get("status") || "",
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional deep-link once per q change
    }, [searchParams.get("q")]);

    const syncUrl = (query, sev, st) => {
        const next = new URLSearchParams();
        if (query?.trim()) next.set("q", query.trim());
        if (sev) next.set("severity", sev);
        if (st) next.set("status", st);
        setSearchParams(next, {replace: true});
    };

    const run = useCallback(
        async (query, overrides = {}) => {
            const text = (query ?? q).trim();
            const sev = overrides.severity !== undefined ? overrides.severity : severity;
            const st = overrides.status !== undefined ? overrides.status : status;
            if (!text) {
                toast.error("Enter a hunt query");
                return;
            }
            setQ(text);
            setLoading(true);
            setHuntError(null);
            syncUrl(text, sev, st);
            try {
                const params = {q: text, limit: 40};
                if (sev) params.severity = sev;
                if (st) params.status = st;
                const r = await api.get("/hunt", {params});
                setResult(r.data);
            } catch (e) {
                const msg = e?.userMessage || e?.response?.data?.detail || "Hunt failed";
                toast.error(msg);
                setHuntError(typeof msg === "string" ? msg : "Hunt failed");
                setResult(null);
            } finally {
                setLoading(false);
            }
        },
        [q, severity, status, setSearchParams],
    );

    return (
        <div className="space-y-6" data-testid="hunt-page">
            <PageHeader
                testid="hunt-header"
                title="Threat Hunting"
                subtitle="Natural-language hunt over recent incidents (rule-based intents + keyword scoring)"
                tip={
                    <HelpTip
                        title="Threat Hunting"
                        body="Ask in plain language (e.g. PowerShell, lateral movement). ACTIRA maps the query to rule-based intents and scores matching incidents — not a SIEM lake search (KQL/SPL)."
                        how="Intents + keyword scoring over up to 500 newest Mongo incidents (optional severity/status filters)."
                        testid="tip-hunt-page"
                    />
                }
            />

            <div
                className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-foreground"
                data-testid="hunt-honesty-banner"
                role="note"
            >
                <Warning size={16} className="text-amber-600 shrink-0 mt-0.5" weight="fill" aria-hidden/>
                <p className="m-0 leading-relaxed text-muted-foreground">
                    <span className="font-semibold text-amber-800 dark:text-amber-200">Case hunt, not SIEM. </span>
                    Scores the newest <span className="font-mono">≤500</span> incidents (with optional severity/status
                    filters). Does not query raw log lakes (KQL/SPL).
                </p>
            </div>

            <form
                className="soc-card p-4 space-y-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    run();
                }}
                data-testid="hunt-form"
            >
                <label className="soc-label inline-flex items-center gap-1.5" htmlFor="hunt-query">
                    Hunt query
                    <HelpTip
                        title="Hunt query"
                        body="Plain-language intent (e.g. PowerShell, lateral movement, ransomware). Mapped to rule-based intents + keyword scoring over recent incidents — not KQL/SPL lake search."
                        how="GET /hunt?q=…&severity=&status= scores incidents by IoCs, techniques, and text fields."
                        testid="tip-hunt-query"
                    />
                </label>
                <div className="flex flex-wrap gap-2">
                    <div className="relative flex-1 min-w-[220px]">
                        <MagnifyingGlass
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                        />
                        <input
                            id="hunt-query"
                            data-testid="hunt-query-input"
                            className="w-full pl-9 pr-3 py-2.5 text-sm border border-border rounded-lg bg-background"
                            placeholder="e.g. Find suspicious PowerShell or Show lateral movement"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                        />
                    </div>
                    <Tip content="Filter candidate pool by severity before scoring">
                        <select
                            className="text-xs border border-border rounded-lg px-2 py-2 bg-background"
                            value={severity}
                            onChange={(e) => setSeverity(e.target.value)}
                            data-testid="hunt-filter-severity"
                            aria-label="Severity filter"
                        >
                            {SEV_OPTIONS.map((o) => (
                                <option key={o.value || "all"} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </Tip>
                    <Tip content="Filter candidate pool by incident status">
                        <select
                            className="text-xs border border-border rounded-lg px-2 py-2 bg-background"
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            data-testid="hunt-filter-status"
                            aria-label="Status filter"
                        >
                            {STATUS_OPTIONS.map((o) => (
                                <option key={o.value || "all"} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </Tip>
                    <button
                        type="submit"
                        disabled={loading}
                        className="soc-btn-primary !px-4 inline-flex items-center gap-2 disabled:opacity-50"
                        data-testid="hunt-submit"
                    >
                        <Crosshair size={16}/>
                        {loading ? "Hunting…" : "Run hunt"}
                    </button>
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {suggestions.map((s) => (
                        <button
                            key={s}
                            type="button"
                            className="text-[11px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                            onClick={() => run(s)}
                            data-testid={`hunt-suggestion-${s.slice(0, 12)}`}
                        >
                            {s}
                        </button>
                    ))}
                </div>
            </form>

            {hotspots?.items?.length > 0 && (
                <div className="soc-card p-4 space-y-3" data-testid="behavior-hotspots">
                    <div className="flex items-center gap-2">
                        <Pulse size={16} className="text-primary"/>
                        <div>
                            <div className="soc-label inline-flex items-center gap-1.5">
                                Behavioral hotspots
                                <HelpTip
                                    title="Behavioral hotspots"
                                    body="Heuristic behavior flags across recent cases: beaconing intervals, login bursts, multi-host users, LOLBins, high DNS volume."
                                    how="GET /hunt/behavior ranks incidents with behavior_flags from the pipeline."
                                    testid="tip-hunt-hotspots"
                                />
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                Beaconing, login bursts, multi-host users, LOLBins, DNS volume
                            </div>
                        </div>
                    </div>
                    <ul className="space-y-2">
                        {hotspots.items.map((h) => (
                            <li
                                key={h.id}
                                className="flex flex-wrap items-center gap-2 border border-border rounded-lg px-3 py-2"
                                data-testid={`behavior-hotspot-${h.id}`}
                            >
                                <Link
                                    to={`/incidents/${h.id}?tab=case`}
                                    className="text-sm text-primary hover:underline font-medium flex-1 min-w-[140px]"
                                >
                                    {h.title || h.id}
                                </Link>
                                <SeverityBadge severity={h.severity}/>
                                <span className="text-[10px] font-mono text-primary">
                                    {h.risk} {h.risk_score}
                                </span>
                                <span className="text-[10px] text-muted-foreground max-w-xs truncate">
                                    {(h.signal_ids || []).join(", ")}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {loading && <ListState variant="loading" message="Scoring incidents…" testid="hunt-loading"/>}

            {!loading && huntError && (
                <ListState variant="error" message={huntError} testid="hunt-load-error"/>
            )}

            {!loading && result && (
                <div className="space-y-4" data-testid="hunt-results">
                    <div className="soc-card p-4">
                        <div className="soc-label mb-1 inline-flex items-center gap-1.5">
                            Intent
                            <HelpTip
                                title="Mapped hunt intent"
                                body="Rule-based intent matched from your query (keywords + patterns). Score ranks incidents by how well they fit — not a SIEM correlation engine."
                                testid="tip-hunt-intent"
                            />
                        </div>
                        <div className="text-sm text-foreground font-medium">{result.intent?.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 font-mono" data-testid="hunt-pool-meta">
                            id={result.intent?.id} · matches {result.total_matches} / {result.total_candidates} scanned
                            {result.pool_limit ? ` · pool_limit ${result.pool_limit}` : ""}
                            {result.pool_filters?.severity ? ` · severity=${result.pool_filters.severity}` : ""}
                            {result.pool_filters?.status ? ` · status=${result.pool_filters.status}` : ""}
                        </div>
                        {result.honesty && (
                            <p className="text-[11px] text-muted-foreground mt-2 m-0 leading-relaxed">
                                {result.honesty}
                            </p>
                        )}
                        {result.intent?.keywords?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {result.intent.keywords.slice(0, 12).map((k) => (
                                    <span
                                        key={k}
                                        className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted-foreground"
                                    >
                                        {k}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {result.hits?.length === 0 ? (
                        <ListState
                            variant="empty"
                            message="No incidents matched this hunt. Try another query, clear filters, or ingest more logs."
                            testid="hunt-empty"
                        />
                    ) : (
                        <div className="soc-card overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                                        <th className="px-4 py-2.5 font-semibold">Case</th>
                                        <th className="px-3 py-2.5 font-semibold">Severity</th>
                                        <th className="px-3 py-2.5 font-semibold">Status</th>
                                        <th className="px-3 py-2.5 font-semibold">Score</th>
                                        <th className="px-3 py-2.5 font-semibold">Why</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {result.hits.map((h) => (
                                        <tr
                                            key={h.id}
                                            className="border-b border-border/70 hover:bg-muted/40"
                                            data-testid={`hunt-hit-${h.id}`}
                                        >
                                            <td className="px-4 py-2.5">
                                                <Link
                                                    to={`/incidents/${h.id}?tab=case`}
                                                    className="text-primary hover:underline font-medium"
                                                >
                                                    {h.title || h.id}
                                                </Link>
                                                <div className="font-mono text-[10px] text-muted-foreground mt-0.5">
                                                    {h.id}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <SeverityBadge severity={h.severity}/>
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <StatusPill status={h.status}/>
                                            </td>
                                            <td className="px-3 py-2.5 font-mono text-primary">{h.score}</td>
                                            <td className="px-3 py-2.5 text-[11px] text-muted-foreground max-w-xs">
                                                {(h.reasons || []).slice(0, 4).join(" · ")}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
