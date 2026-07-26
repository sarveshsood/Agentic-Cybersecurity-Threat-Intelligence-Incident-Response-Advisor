import {useCallback, useEffect, useState} from "react";
import {Link} from "react-router-dom";
import {api} from "../lib/api";
import {PageHeader} from "../design-system";
import {SeverityBadge, StatusPill} from "../components/SeverityBadge";
import {ListState} from "../components/ListState";
import {MagnifyingGlass, Crosshair, Pulse} from "@phosphor-icons/react";
import {toast} from "sonner";

export default function Hunt() {
    const [q, setQ] = useState("");
    const [suggestions, setSuggestions] = useState([]);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [hotspots, setHotspots] = useState(null);

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
                ])
            );
        api
            .get("/hunt/behavior?limit=8")
            .then((r) => setHotspots(r.data))
            .catch(() => setHotspots(null));
    }, []);

    const run = useCallback(
        async (query) => {
            const text = (query ?? q).trim();
            if (!text) {
                toast.error("Enter a hunt query");
                return;
            }
            setQ(text);
            setLoading(true);
            try {
                const r = await api.get(`/hunt?q=${encodeURIComponent(text)}&limit=40`);
                setResult(r.data);
            } catch (e) {
                toast.error(e?.response?.data?.detail || "Hunt failed");
                setResult(null);
            } finally {
                setLoading(false);
            }
        },
        [q]
    );

    return (
        <div className="space-y-6" data-testid="hunt-page">
            <PageHeader
                testid="hunt-header"
                title="Threat Hunting"
                subtitle="Natural-language hunt over recent incidents (rule-based intents + keyword scoring)"
            />

            <form
                className="soc-card p-4 space-y-3"
                onSubmit={(e) => {
                    e.preventDefault();
                    run();
                }}
                data-testid="hunt-form"
            >
                <label className="soc-label" htmlFor="hunt-query">
                    Hunt query
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
                            <div className="soc-label">Behavioral hotspots</div>
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

            {!loading && result && (
                <div className="space-y-4" data-testid="hunt-results">
                    <div className="soc-card p-4">
                        <div className="soc-label mb-1">Intent</div>
                        <div className="text-sm text-foreground font-medium">{result.intent?.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 font-mono">
                            id={result.intent?.id} · matches {result.total_matches} / {result.total_candidates} scanned
                        </div>
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
                            message="No incidents matched this hunt. Try another query or ingest more logs."
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
