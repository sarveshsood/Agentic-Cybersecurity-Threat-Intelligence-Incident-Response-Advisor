/**
 * Read-only product feature flags panel (Settings → Feature flags).
 * Source: GET /api/meta/features — env-driven; not runtime toggles.
 */
import {useCallback, useEffect, useState} from "react";
import {ArrowClockwise, CheckCircle, Flag, Warning, XCircle} from "@phosphor-icons/react";
import {api, apiErrorMessage} from "../lib/api";
import {loadFeatures} from "../lib/features";
import {AlertBanner, DsButton, EmptyState, LoadingState, Panel, SectionLabel} from "../design-system";
import {HelpTip} from "./HelpTip";

function OnOff({on}) {
    return on ? (
        <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-success-soft text-success border-[var(--success-border)]"
            data-testid="flag-on"
        >
            <CheckCircle size={12} weight="fill"/>
            On
        </span>
    ) : (
        <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border bg-muted text-muted-foreground border-border"
            data-testid="flag-off"
        >
            <XCircle size={12}/>
            Off
        </span>
    );
}

function FlagRow({row, testid}) {
    const enabled = Boolean(row.enabled);
    return (
        <tr className="border-t border-border" data-testid={testid || `flag-row-${row.key}`}>
            <td className="p-2.5 align-top">
                <div className="font-medium text-sm">{row.title || row.key}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug max-w-md">
                    {row.description}
                </div>
            </td>
            <td className="p-2.5 align-top font-mono text-[11px] whitespace-nowrap">
                {row.env}
            </td>
            <td className="p-2.5 align-top">
                <OnOff on={enabled}/>
                {row.value != null && row.value !== "" && typeof row.value !== "boolean" && (
                    <div className="text-[10px] font-mono text-muted-foreground mt-1">
                        value: {String(row.value)}
                    </div>
                )}
            </td>
            <td className="p-2.5 align-top text-[11px] text-muted-foreground">
                {(row.ui || []).map((u) => (
                    <div key={u} className="leading-snug">
                        {u}
                    </div>
                ))}
            </td>
        </tr>
    );
}

export default function FeatureFlagsPanel() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [data, setData] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const r = await api.get("/meta/features", {params: {_t: Date.now()}});
            setData(r.data || {});
            // Keep SPA isFeatureEnabled cache in sync
            await loadFeatures({force: true});
        } catch (e) {
            setError(apiErrorMessage(e) || "Failed to load feature flags");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const onRefresh = () => load();
        window.addEventListener("actira-refresh-feature-flags", onRefresh);
        return () => window.removeEventListener("actira-refresh-feature-flags", onRefresh);
    }, [load]);

    if (loading && !data) {
        return <LoadingState message="Loading feature flags…" testid="feature-flags-loading"/>;
    }

    if (error && !data) {
        return (
            <div className="space-y-3" data-testid="feature-flags-error">
                <AlertBanner variant="error" title="Could not load flags">
                    {error}
                </AlertBanner>
                <DsButton size="sm" variant="secondary" tooltip="Retry" onClick={load}>
                    Retry
                </DsButton>
            </div>
        );
    }

    const catalog = Array.isArray(data?.catalog) ? data.catalog : [];
    const related = Array.isArray(data?.related) ? data.related : [];
    const summary = data?.summary || {};
    const onN = summary.product_flags_on ?? catalog.filter((c) => c.enabled).length;
    const totalN = summary.product_flags_total ?? catalog.length;

    // Fallback if old API only returns flat booleans
    const flatOnly =
        catalog.length === 0 &&
        data &&
        Object.keys(data).some((k) => typeof data[k] === "boolean");

    return (
        <div className="space-y-6" data-testid="feature-flags-panel">
            <AlertBanner variant="info" title="Env-only · read-only" testid="feature-flags-honesty">
                {summary.note ||
                    "Product flags are set in backend/.env (FEATURE_*). Restart the API after changes. This panel does not toggle flags at runtime."}
            </AlertBanner>

            <div className="flex flex-wrap items-center justify-between gap-2">
                <SectionLabel
                    tipTitle="Product feature flags"
                    tipBody="Gated surfaces return 404 from the API when off. SPA hides nav/UI via isFeatureEnabled after loadFeatures()."
                >
                    Product flags ({onN}/{totalN} on)
                </SectionLabel>
                <DsButton
                    size="sm"
                    variant="secondary"
                    tooltip="Reload GET /meta/features and refresh SPA cache"
                    onClick={load}
                    loading={loading}
                    data-testid="feature-flags-refresh"
                >
                    <ArrowClockwise size={14} className={loading ? "animate-spin" : ""}/>
                    Refresh
                </DsButton>
            </div>

            {flatOnly ? (
                <Panel
                    title="Flag snapshot"
                    tipTitle="Legacy response"
                    tipBody="API returned flat booleans only. Upgrade backend for full catalog metadata."
                    testid="feature-flags-flat"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="text-muted-foreground text-left">
                                <tr>
                                    <th className="p-2">Key</th>
                                    <th className="p-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(data)
                                    .filter(([, v]) => typeof v === "boolean")
                                    .map(([k, v]) => (
                                        <tr key={k} className="border-t border-border">
                                            <td className="p-2 font-mono">{k}</td>
                                            <td className="p-2">
                                                <OnOff on={v}/>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            ) : catalog.length === 0 ? (
                <EmptyState
                    title="No catalog"
                    description="GET /meta/features did not include a catalog array."
                    testid="feature-flags-empty"
                />
            ) : (
                <Panel
                    title="Gated product features"
                    tipTitle="FEATURE_* map"
                    tipBody="Each row maps SPA key → env var. Enable with FEATURE_X=1 in backend/.env then restart."
                    testid="feature-flags-catalog"
                    icon={Flag}
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs" data-testid="feature-flags-table">
                            <thead className="bg-muted/40 text-left text-muted-foreground">
                                <tr>
                                    <th className="p-2.5 font-medium">
                                        <span className="inline-flex items-center gap-1">
                                            Feature
                                            <HelpTip title="Feature" body="Product surface gated by env flag." testid="tip-ff-feature"/>
                                        </span>
                                    </th>
                                    <th className="p-2.5 font-medium">Env var</th>
                                    <th className="p-2.5 font-medium">Status</th>
                                    <th className="p-2.5 font-medium">UI when on</th>
                                </tr>
                            </thead>
                            <tbody>
                                {catalog.map((row) => (
                                    <FlagRow key={row.key} row={row}/>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
                        Example:{" "}
                        <code className="font-mono bg-muted px-1 rounded">FEATURE_QA_HEALTH_CENTER=1</code> then
                        restart uvicorn → Admin → <strong>QA Health</strong>.
                    </p>
                </Panel>
            )}

            {related.length > 0 && (
                <Panel
                    title="Related configuration"
                    tipTitle="Related knobs"
                    tipBody="Adjacent env settings that affect security, tenancy, embeddings, and judges — not all use FEATURE_* names."
                    testid="feature-flags-related"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/40 text-left text-muted-foreground">
                                <tr>
                                    <th className="p-2.5 font-medium">Setting</th>
                                    <th className="p-2.5 font-medium">Env</th>
                                    <th className="p-2.5 font-medium">Status</th>
                                    <th className="p-2.5 font-medium">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {related.map((row) => (
                                    <FlagRow key={row.key} row={row} testid={`related-row-${row.key}`}/>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}

            <div className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Warning size={14} className="shrink-0 mt-0.5 text-warning"/>
                <p>
                    Changing flags requires editing <code className="font-mono">backend/.env</code> (or deploy
                    secrets) and restarting the API process. Values here reflect the live process environment.
                </p>
            </div>
        </div>
    );
}
