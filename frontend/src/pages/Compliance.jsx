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

/** Assumed product feature vs env-checked vs live-probed evidence. */
function verificationBadgeClass(v) {
    if (v === "verified") {
        return "text-success border-[var(--success-border)] bg-success-soft";
    }
    if (v === "env") {
        return "text-primary border-primary/40 bg-primary/10";
    }
    if (v === "mixed") {
        return "text-foreground border-border bg-muted/50";
    }
    // assumed (default)
    return "text-amber-800 dark:text-amber-200 border-amber-500/40 bg-amber-500/10";
}

function VerificationBadge({verification, label}) {
    const v = verification || "assumed";
    const text = label || {
        verified: "Live verified",
        env: "Config-checked",
        assumed: "Assumed",
        mixed: "Mixed",
    }[v] || v;
    return (
        <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border whitespace-nowrap ${verificationBadgeClass(v)}`}
            data-testid={`verification-badge-${v}`}
            title={
                v === "verified"
                    ? "Live-probed this request (audit chain and/or golden last run)"
                    : v === "env"
                        ? "Checked against process env / settings"
                        : v === "mixed"
                            ? "Mix of assumed, config, and/or live evidence keys"
                            : "Product capability assumed present — not live-probed this request"
            }
        >
            {text}
        </span>
    );
}

export default function Compliance() {
    const [report, setReport] = useState(null);
    const [gapsPayload, setGapsPayload] = useState(null);
    const [loading, setLoading] = useState(true);
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

    const downloadExecutiveSnapshot = async (format = "json") => {
        setExporting(true);
        try {
            const res = await api.get("/compliance/executive-export", {params: {_t: Date.now()}});
            const stamp = new Date().toISOString().slice(0, 10);
            if (format === "md") {
                const md = res.data?.markdown || "";
                const blob = new Blob([md], {type: "text/markdown"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `actira-executive-snapshot-${stamp}.md`;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                const blob = new Blob([JSON.stringify(res.data, null, 2)], {type: "application/json"});
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `actira-executive-snapshot-${stamp}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (e) {
            setError(e?.userMessage || e?.message || "Executive snapshot export failed");
        } finally {
            setExporting(false);
        }
    };

    const readiness = report?.readiness || "—";
    const gapCount = report?.gap_count ?? gapsPayload?.gap_count ?? 0;
    const gaps = gapsPayload?.gaps || report?.gaps_preview || [];
    const domains = report?.domains || [];
    const live = report?.live_signals || gapsPayload?.live_signals || {};
    const verificationSummary =
        report?.verification_summary || gapsPayload?.verification_summary || {};
    const verificationLegend =
        report?.verification_legend || gapsPayload?.verification_legend || {};

    return (
        <div className="space-y-6 pb-12" data-testid="compliance-page">
            <PageHeader
                title="Compliance & Governance"
                icon={ShieldCheck}
                subtitle="Live product-alignment score against ISO / SOC 2 / NIST CSF / CIS controls — not a certification claim."
                tip={
                    <HelpTip
                        title="Compliance score"
                        body="Weighted product-alignment checks against runtime evidence (RBAC, HiTL, audit trail, OIDC, vault, etc.). Gaps list remediations. Export the evidence pack for pilot GRC conversations."
                        how="Not ISO / SOC 2 / NIST certification — score maps catalog controls to product capabilities only."
                        testid="tip-compliance-page"
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
                            onClick={() => downloadExecutiveSnapshot("json")}
                            disabled={exporting || loading}
                            className="soc-btn-ghost !text-xs !h-9 inline-flex items-center gap-1.5"
                            data-testid="compliance-export-executive"
                            title="Board-ready score + gaps + audit volume"
                        >
                            <FileText size={14}/>
                            Executive snapshot
                        </button>
                        <button
                            type="button"
                            onClick={() => downloadExecutiveSnapshot("md")}
                            disabled={exporting || loading}
                            className="soc-btn-ghost !text-xs !h-9 inline-flex items-center gap-1.5"
                            data-testid="compliance-export-executive-md"
                            title="Markdown for board packs"
                        >
                            MD
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

            {/* Always-visible honesty banner — alignment score is not a certification. */}
            <div
                className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground"
                data-testid="compliance-disclaimer"
                role="note"
            >
                <Warning size={18} className="text-amber-600 shrink-0 mt-0.5" weight="fill" aria-hidden/>
                <div>
                    <p className="font-semibold text-amber-800 dark:text-amber-200">
                        Product alignment score — not a formal certification
                    </p>
                    <p className="text-muted-foreground text-[13px] mt-1 leading-relaxed">
                        {report?.disclaimer ||
                            "Scores map runtime product controls to ISO / SOC 2 / NIST CSF / CIS-style catalog items. They do not constitute ISO, SOC 2, or other third-party certification. Use gaps and evidence packs for pilot GRC conversations only. Most controls are assumed product features; only a subset are live-verified or config-checked each request."}
                    </p>
                </div>
            </div>

            {/* Assumed vs verified honesty — evidence provenance summary */}
            <div
                className="soc-card p-3 border border-border rounded-lg space-y-2"
                data-testid="compliance-verification-summary"
            >
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                        Evidence provenance
                        <HelpTip
                            title="Assumed vs verified"
                            body="Most catalog controls map to product features that are assumed present (RBAC routes, HiTL gate, etc.). A smaller set is config-checked from env/settings or live-verified this request (audit hash sample, golden last run)."
                            how="verification field on each control: assumed | env | verified | mixed."
                            testid="tip-compliance-verification"
                        />
                    </div>
                    <div className="flex flex-wrap gap-1.5" data-testid="compliance-verification-chips">
                        {["verified", "env", "assumed", "mixed"].map((k) => {
                            const n = verificationSummary[k];
                            if (n == null && !Object.keys(verificationSummary).length) return null;
                            return (
                                <span
                                    key={k}
                                    className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ${verificationBadgeClass(k)}`}
                                >
                                    {k} {n ?? 0}
                                </span>
                            );
                        })}
                        {!Object.keys(verificationSummary).length && (
                            <span className="text-[11px] text-muted-foreground">
                                {loading ? "Loading provenance…" : "No summary yet — refresh after API upgrade."}
                            </span>
                        )}
                    </div>
                </div>
                {(verificationLegend.assumed || verificationLegend.verified) && (
                    <ul className="m-0 pl-4 text-[11px] text-muted-foreground space-y-0.5 list-disc">
                        {verificationLegend.verified && (
                            <li><span className="font-medium text-foreground">Live verified:</span> {verificationLegend.verified}</li>
                        )}
                        {verificationLegend.env && (
                            <li><span className="font-medium text-foreground">Config-checked:</span> {verificationLegend.env}</li>
                        )}
                        {verificationLegend.assumed && (
                            <li><span className="font-medium text-foreground">Assumed:</span> {verificationLegend.assumed}</li>
                        )}
                        {verificationLegend.mixed && (
                            <li><span className="font-medium text-foreground">Mixed:</span> {verificationLegend.mixed}</li>
                        )}
                    </ul>
                )}
            </div>

            {/* Live runtime signals feeding audit integrity + golden last-run evidence */}
            {(live.audit_integrity_status || live.golden_last_ran_at !== undefined) && (
                <div
                    className="grid grid-cols-1 md:grid-cols-2 gap-3"
                    data-testid="compliance-live-signals"
                >
                    <div className="soc-card p-3 border border-border rounded-lg text-xs space-y-1">
                        <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            Live · Audit integrity
                            <HelpTip
                                title="Live audit integrity"
                                body="Sampled SHA-256 chain status from /audit/integrity. Mismatch or broken_chain demotes LOG-02 evidence."
                                how="apply_live_evidence → audit_service.integrity(sample=50)."
                                testid="tip-compliance-live-integrity"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-sm" data-testid="compliance-live-integrity">
                                {live.audit_integrity_status || "—"}
                            </span>
                            {live.audit_integrity_ok != null && (
                                <span className="text-muted-foreground">
                                    ok {live.audit_integrity_ok}
                                    {live.audit_integrity_mismatch != null
                                        ? ` · mismatch ${live.audit_integrity_mismatch}`
                                        : ""}
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground m-0">
                            Feeds LOG-02 control (fails only on mismatch / broken_chain).
                        </p>
                    </div>
                    <div className="soc-card p-3 border border-border rounded-lg text-xs space-y-1">
                        <div className="font-semibold text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                            Live · Golden last run
                            <HelpTip
                                title="Live golden last run"
                                body="Last stored golden benchmark pass/fail from Mongo. Failed last run demotes AI-02 (golden_eval_pass)."
                                how="golden_runs id=last · summary metrics shown when present."
                                testid="tip-compliance-live-golden"
                            />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span
                                className={`font-semibold text-sm ${
                                    live.golden_last_passed === false
                                        ? "text-error"
                                        : live.golden_last_passed
                                            ? "text-success"
                                            : "text-foreground"
                                }`}
                                data-testid="compliance-live-golden"
                            >
                                {live.golden_last_passed === true
                                    ? "PASSED"
                                    : live.golden_last_passed === false
                                        ? "FAILED"
                                        : live.golden_last_ran_at
                                            ? "recorded"
                                            : "no stored run"}
                            </span>
                            {live.golden_last_ran_at && live.golden_last_ran_at !== "unavailable" && (
                                <span className="font-mono text-muted-foreground text-[11px]">
                                    {String(live.golden_last_ran_at).slice(0, 19)}
                                </span>
                            )}
                        </div>
                        {live.golden_last_summary && (
                            <p className="text-[11px] text-muted-foreground m-0 font-mono">
                                cases {live.golden_last_summary.n_cases ?? "—"} · IoC F1{" "}
                                {live.golden_last_summary.mean_ioc_f1 ?? "—"} · tech R{" "}
                                {live.golden_last_summary.mean_technique_recall ?? "—"}
                            </p>
                        )}
                        <p className="text-[11px] text-muted-foreground m-0">
                            Feeds AI-02 control when a last golden run is stored.
                        </p>
                    </div>
                </div>
            )}

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
                    tip={
                        <HelpTip
                            title="Maturity score"
                            body="Weighted product-alignment score across catalog controls — not a formal ISO/SOC2 certification."
                            how="Passed control weights ÷ total weights × 100."
                        />
                    }
                    label="Maturity Score"
                    value={report != null ? `${report.score}%` : "—"}
                    sub="weighted controls"
                    icon={ShieldCheck}
                    tone={report != null && report.score >= 80 ? "success" : report != null && report.score >= 60 ? "warning" : "default"}
                />
                <KpiCard
                    testid="compliance-frameworks-kpi"
                    tip={
                        <HelpTip
                            title="Frameworks"
                            body="How many GRC-style frameworks have mapped controls in the ACTIRA catalog (ISO, SOC 2, NIST CSF, CIS)."
                        />
                    }
                    label="Frameworks Tracked"
                    value={report?.frameworks?.length ?? "—"}
                    sub="ISO · SOC2 · NIST · CIS"
                    icon={FileText}
                    tone="primary"
                />
                <KpiCard
                    testid="compliance-readiness-kpi"
                    tip={
                        <HelpTip
                            title="Audit readiness"
                            body="Label derived from overall score bands (Passing / Needs work / Critical gaps). Alignment only — not a certification."
                        />
                    }
                    label="Audit Readiness"
                    value={readiness}
                    sub={report?.disclaimer ? "alignment score" : "—"}
                    icon={CheckCircle}
                    tone={readinessTone(readiness)}
                />
                <KpiCard
                    testid="compliance-gaps-kpi"
                    tip={
                        <HelpTip
                            title="Open gaps"
                            body="Count of failed catalog controls. Open the gaps panel for remediation text and priority by weight."
                        />
                    }
                    label="Open Gaps"
                    value={gapCount}
                    sub="failed controls"
                    icon={gapCount > 0 ? Warning : CheckCircle}
                    tone={gapCount > 0 ? "warning" : "success"}
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Panel
                    title="Active Framework Status"
                    testid="compliance-frameworks-panel"
                    subtitle="Scores from mapped product controls"
                    tip={
                        <HelpTip
                            title="Framework status"
                            body="Per-framework alignment score (ISO / SOC 2 / NIST CSF / CIS). Status bands: Compliant ≥95, Passing ≥80, Review ≥60, else Gap."
                            how="Weighted passed controls within each framework_id."
                            testid="tip-compliance-frameworks"
                        />
                    }
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
                    tip={
                        <HelpTip
                            title="Domain scores"
                            body="Alignment by control domain (Identity, Logging, Response, etc.). Bars show weighted pass rate inside each domain."
                            testid="tip-compliance-domains"
                        />
                    }
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
                tip={
                    <HelpTip
                        title="Open gaps"
                        body="Failed catalog controls with remediations. Higher weight = higher priority for pilot GRC conversations. Not a formal audit finding list."
                        how="Controls whose evidence_keys are false after live demotion of audit_integrity / golden_eval_pass."
                        testid="tip-compliance-gaps"
                    />
                }
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
                                <th className="py-2 pr-3 font-semibold">Evidence</th>
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
                                    <td className="py-2.5 pr-3">
                                        <VerificationBadge
                                            verification={g.verification}
                                            label={g.verification_label}
                                        />
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
