import {useCallback, useEffect, useState} from "react";
import {api} from "../lib/api";
import {
    ArrowClockwise,
    CheckCircle,
    DownloadSimple,
    FileText,
    ShieldCheck,
    Warning,
    XCircle,
} from "@phosphor-icons/react";
import {KpiCard, PageHeader, Panel} from "../design-system";
import {HelpTip} from "../components/HelpTip";
import {ListState} from "../components/ListState";

function readinessTone(readiness) {
    if (readiness === "Passing") return "success";
    if (readiness === "Needs work") return "warning";
    return "critical";
}

function statusBadgeClass(status) {
    if (status === "Compliant" || status === "Passing" || status === "pass") {
        return "text-success border-[var(--success-border)] bg-success-soft";
    }
    if (status === "Review") {
        return "text-warning border-[var(--warning-border)] bg-[var(--warning-bg)]";
    }
    return "text-error border-[var(--error-border,var(--sev-critical-border))] bg-[var(--sev-critical-bg)]";
}

export default function Compliance() {
    const [report, setReport] = useState(null);
    const [gapsPayload, setGapsPayload] = useState(null);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState(null);

    const fetchCompliance = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [statusRes, gapsRes] = await Promise.all([
                api.get("/compliance/status", {params: {_t: Date.now()}}),
                api.get("/compliance/gaps", {params: {_t: Date.now()}}),
            ]);
            setReport(statusRes.data);
            setGapsPayload(gapsRes.data);
        } catch (e) {
            setError(e?.userMessage || e?.message || "Compliance API unavailable");
            setReport(null);
            setGapsPayload(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCompliance();
    }, [fetchCompliance]);

    const downloadEvidencePack = async () => {
        setExporting(true);
        try {
            const res = await api.get("/compliance/evidence-pack", {params: {_t: Date.now()}});
            const blob = new Blob([JSON.stringify(res.data, null, 2)], {type: "application/json"});
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            const stamp = new Date().toISOString().slice(0, 10);
            a.href = url;
            a.download = `actira-compliance-evidence-${stamp}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            setError(e?.userMessage || e?.message || "Evidence pack export failed");
        } finally {
            setExporting(false);
        }
    };

    const readiness = report?.readiness || "—";
    const gapCount = report?.gap_count ?? gapsPayload?.gap_count ?? 0;
    const gaps = gapsPayload?.gaps || report?.gaps_preview || [];
    const domains = report?.domains || [];

    return (
        <div className="space-y-6 pb-12" data-testid="compliance-page">
            <PageHeader
                title="Compliance & Governance"
                icon={ShieldCheck}
                subtitle="Live product-alignment score against ISO / SOC 2 / NIST CSF / CIS controls — not a certification claim."
                tip={
                    <HelpTip
                        title="Compliance score"
                        body="Weighted control checks against runtime evidence (RBAC, HiTL, audit trail, OIDC, vault, etc.). Gaps list remediations. Export the evidence pack for GRC tools."
                    />
                }
                actions={
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            type="button"
                            onClick={downloadEvidencePack}
                            disabled={exporting || loading}
                            className="soc-btn-ghost !text-xs !h-9 inline-flex items-center gap-1.5"
                            data-testid="compliance-export-evidence"
                        >
                            <DownloadSimple size={14}/>
                            {exporting ? "Exporting…" : "Evidence pack"}
                        </button>
                        <button
                            type="button"
                            onClick={fetchCompliance}
                            disabled={loading}
                            className="soc-btn-ghost !text-xs !h-9 inline-flex items-center gap-1.5"
                            data-testid="compliance-refresh"
                        >
                            <ArrowClockwise size={14} className={loading ? "animate-spin" : ""}/>
                            Refresh
                        </button>
                    </div>
                }
            />

            {error && (
                <ListState
                    variant="error"
                    testid="compliance-load-error"
                    message={error}
                />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <KpiCard
                    testid="compliance-score-kpi"
                    label="Maturity Score"
                    value={report != null ? `${report.score}%` : "—"}
                    sub="weighted controls"
                    icon={ShieldCheck}
                    tone={report != null && report.score >= 80 ? "success" : report != null && report.score >= 60 ? "warning" : "default"}
                />
                <KpiCard
                    testid="compliance-frameworks-kpi"
                    label="Frameworks Tracked"
                    value={report?.frameworks?.length ?? "—"}
                    sub="ISO · SOC2 · NIST · CIS"
                    icon={FileText}
                    tone="primary"
                />
                <KpiCard
                    testid="compliance-readiness-kpi"
                    label="Audit Readiness"
                    value={readiness}
                    sub={report?.disclaimer ? "alignment score" : "—"}
                    icon={CheckCircle}
                    tone={readinessTone(readiness)}
                />
                <KpiCard
                    testid="compliance-gaps-kpi"
                    label="Open Gaps"
                    value={gapCount}
                    sub="failed controls"
                    icon={gapCount > 0 ? Warning : CheckCircle}
                    tone={gapCount > 0 ? "warning" : "success"}
                />
            </div>

            {report?.disclaimer && (
                <p className="text-[11px] text-muted-foreground border border-border rounded-lg px-3 py-2 bg-muted/30" data-testid="compliance-disclaimer">
                    {report.disclaimer}
                </p>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Panel
                    title="Active Framework Status"
                    testid="compliance-frameworks-panel"
                    subtitle="Scores from mapped product controls"
                >
                    <div className="divide-y divide-border">
                        {(report?.frameworks || []).length === 0 && (
                            <p className="text-sm text-muted-foreground py-4">
                                {loading ? "Loading frameworks…" : "No framework data yet."}
                            </p>
                        )}
                        {(report?.frameworks || []).map((fw) => (
                            <div
                                key={fw.framework_id || fw.name}
                                className="py-3 flex items-center justify-between gap-3 first:pt-0 last:pb-0"
                                data-testid={`compliance-fw-${fw.framework_id || fw.name}`}
                            >
                                <div className="min-w-0">
                                    <div className="text-sm font-medium text-foreground">{fw.name}</div>
                                    <div className="text-xs text-muted-foreground font-mono">
                                        Passing controls: {fw.controls}
                                        {fw.score != null ? ` · ${fw.score}%` : ""}
                                    </div>
                                </div>
                                <span className={`text-xs px-2.5 py-1 rounded border shrink-0 ${statusBadgeClass(fw.status)}`}>
                                    {fw.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </Panel>

                <Panel
                    title="Domain scores"
                    testid="compliance-domains-panel"
                    subtitle="Identity, logging, response, detect, assets, network"
                >
                    {domains.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">
                            {loading ? "Loading domains…" : "No domain breakdown yet."}
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {domains.map((d) => {
                                const pct = Number(d.score) || 0;
                                return (
                                    <div key={d.domain} data-testid={`compliance-domain-${d.domain}`}>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-sm font-medium text-foreground">{d.domain}</span>
                                            <span className="text-xs font-mono text-muted-foreground">
                                                {d.passed}/{d.total} · {pct}%
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${
                                                    pct >= 80 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-rose-500"
                                                }`}
                                                style={{width: `${Math.min(100, Math.max(0, pct))}%`}}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Panel>
            </div>

            <Panel
                title="Open gaps & remediation"
                testid="compliance-gaps-panel"
                subtitle={gapCount ? `${gapCount} control(s) need attention (priority by weight)` : "No open gaps"}
                actions={
                    gapCount > 0 ? (
                        <span className="text-[10px] font-mono text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            {gapCount} open
                        </span>
                    ) : null
                }
            >
                {gaps.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-success py-2">
                        <CheckCircle size={16} weight="fill"/>
                        All scored controls are currently passing for this deployment profile.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="compliance-gaps-table">
                            <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b border-border">
                                <th className="py-2 pr-3 font-semibold">ID</th>
                                <th className="py-2 pr-3 font-semibold">Control</th>
                                <th className="py-2 pr-3 font-semibold">Framework</th>
                                <th className="py-2 pr-3 font-semibold">Remediation</th>
                                <th className="py-2 font-semibold text-right">Weight</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                            {gaps.map((g) => (
                                <tr key={g.id} className="align-top" data-testid={`compliance-gap-${g.id}`}>
                                    <td className="py-2.5 pr-3 font-mono text-xs text-primary whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1">
                                            <XCircle size={12} className="text-error shrink-0"/>
                                            {g.id}
                                        </span>
                                    </td>
                                    <td className="py-2.5 pr-3 font-medium text-foreground max-w-[14rem]">
                                        {g.title}
                                        {g.missing_evidence?.length ? (
                                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                                missing: {g.missing_evidence.join(", ")}
                                            </div>
                                        ) : null}
                                    </td>
                                    <td className="py-2.5 pr-3 text-xs text-muted-foreground whitespace-nowrap">
                                        {g.framework}
                                    </td>
                                    <td className="py-2.5 pr-3 text-xs text-muted-foreground max-w-md">
                                        {g.remediation || "—"}
                                    </td>
                                    <td className="py-2.5 text-right font-mono text-xs tabular-nums">
                                        {g.weight}
                                    </td>
                                </tr>
                            ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Panel>
        </div>
    );
}
