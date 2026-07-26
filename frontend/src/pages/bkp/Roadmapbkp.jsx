import {useCallback, useEffect, useMemo, useState} from "react";
import {api} from "../lib/api";
import {useAuth} from "../lib/auth";
import {toast} from "sonner";
import {
    ArrowClockwise,
    CaretDown,
    CheckCircle,
    Circle,
    Code,
    Gauge,
    Hourglass,
    LinkSimple,
    ListChecks,
    MapTrifold,
    NotePencil,
    Plus,
    Rocket,
    Target,
    User,
} from "@phosphor-icons/react";
import {KpiCard, PageHeader} from "../design-system";

const STATUS_META = {
    planned: {
        label: "Planned",
        color: "text-muted-foreground border-border bg-muted/50",
        icon: Circle,
    },
    in_progress: {
        label: "In progress",
        color: "text-warning border-[var(--warning-border)] bg-[var(--warning-bg)]",
        icon: Hourglass,
    },
    completed: {
        label: "Completed",
        color: "text-success border-[var(--success-border)] bg-success-soft",
        icon: CheckCircle,
    },
    future: {
        label: "Future",
        color: "text-primary border-primary/30 bg-primary/10",
        icon: Rocket,
    },
};

const PRIORITY_LABEL = {
    p0: "P0 · Critical",
    p1: "P1 · High",
    p2: "P2 · Medium",
    p3: "P3 · Low",
};

const EFFORT_LABEL = {
    xs: "XS (~1d)",
    s: "S (~2–3d)",
    m: "M (~1w)",
    l: "L (~2–3w)",
    xl: "XL (multi-sprint)",
};

/** Task/status/notes updates — matches backend require_roles(admin, senior_reviewer) */
const CAN_EDIT_ROLES = ["admin", "senior_reviewer"];
/** Create item + reseed — admin-only on API */
const CAN_ADMIN_ROLES = ["admin"];

function StatusBadge({status}) {
    const meta = STATUS_META[status] || STATUS_META.planned;
    const Icon = meta.icon;
    return (
        <span
            className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${meta.color}`}>
      <Icon size={11} weight="fill"/>
            {meta.label}
    </span>
    );
}

function ProgressBar({value}) {
    const v = Math.max(0, Math.min(100, Number(value) || 0));
    return (
        <div className="h-1.5 rounded-full bg-background border border-border overflow-hidden">
            <div
                className="h-full rounded-full bg-primary transition-all"
                style={{width: `${v}%`}}
            />
        </div>
    );
}

function TaskRow({task, canEdit, onToggle, onStatus}) {
    return (
        <div className="flex items-start gap-2 py-1.5 border-b border-border/60 last:border-0">
            <button
                type="button"
                disabled={!canEdit}
                onClick={() => onToggle?.(task)}
                className={`mt-0.5 shrink-0 ${canEdit ? "cursor-pointer" : "cursor-default"}`}
                title={canEdit ? "Toggle done" : undefined}
                data-testid={`task-toggle-${task.id}`}
            >
                {task.done || task.status === "done" ? (
                    <CheckCircle size={16} className="text-success" weight="fill"/>
                ) : (
                    <Circle size={16} className="text-muted-foreground/80"/>
                )}
            </button>
            <div className="flex-1 min-w-0">
                <div
                    className={`text-[12px] leading-snug ${task.done || task.status === "done" ? "text-muted-foreground line-through" : "text-foreground/90"}`}>
                    {task.title}
                </div>
            </div>
            {canEdit && (
                <select
                    className="text-[10px] bg-background border border-border rounded px-1.5 py-0.5 text-muted-foreground"
                    value={task.status || (task.done ? "done" : "todo")}
                    onChange={(e) => onStatus?.(task, e.target.value)}
                    data-testid={`task-status-${task.id}`}
                >
                    {["todo", "in_progress", "done", "blocked"].map((s) => (
                        <option key={s} value={s}>{s}</option>
                    ))}
                </select>
            )}
        </div>
    );
}

function RoadmapCard({item, canEdit, onRefresh}) {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [notes, setNotes] = useState(item.implementation_notes || "");
    const [owner, setOwner] = useState(item.owner || "");
    const [newTask, setNewTask] = useState("");

    useEffect(() => {
        setNotes(item.implementation_notes || "");
        setOwner(item.owner || "");
    }, [item.id, item.implementation_notes, item.owner]);

    const patch = async (body) => {
        setBusy(true);
        try {
            await api.patch(`/roadmap/${item.id}`, body);
            toast.success("Roadmap item updated");
            onRefresh?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Update failed");
        } finally {
            setBusy(false);
        }
    };

    const toggleTask = async (task) => {
        const done = !(task.done || task.status === "done");
        setBusy(true);
        try {
            await api.patch(`/roadmap/${item.id}/tasks/${task.id}`, {
                done,
                status: done ? "done" : "todo",
            });
            onRefresh?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Task update failed");
        } finally {
            setBusy(false);
        }
    };

    const setTaskStatus = async (task, status) => {
        setBusy(true);
        try {
            await api.patch(`/roadmap/${item.id}/tasks/${task.id}`, {status});
            onRefresh?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Task update failed");
        } finally {
            setBusy(false);
        }
    };

    const addTask = async () => {
        const title = newTask.trim();
        if (!title) return;
        setBusy(true);
        try {
            await api.post(`/roadmap/${item.id}/tasks`, {title, status: "todo"});
            setNewTask("");
            toast.success("Task added");
            onRefresh?.();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not add task");
        } finally {
            setBusy(false);
        }
    };

    const generateTasks = async () => {
        setBusy(true);
        try {
            const r = await api.post(`/roadmap/${item.id}/generate-tasks`);
            const n = (r.data?.added || []).length;
            toast.success(n ? `Generated ${n} starter task(s)` : "Tasks already present");
            onRefresh?.();
            setOpen(true);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Generate failed");
        } finally {
            setBusy(false);
        }
    };

    const tasks = item.tasks || [];
    const doneCount = tasks.filter((t) => t.done || t.status === "done").length;

    return (
        <div
            className="soc-card p-4 space-y-3"
            data-testid={`roadmap-item-${item.id}`}
        >
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={item.status}/>
                        <span
                            className="text-[10px] font-mono text-warning px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/5">
              {PRIORITY_LABEL[item.priority] || item.priority}
            </span>
                        {item.category && (
                            <span
                                className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded border border-border">
                {item.category}
              </span>
                        )}
                        {item.week && (
                            <span className="text-[10px] text-muted-foreground/80">{item.week}</span>
                        )}
                        {item.target_release && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary/80">
                <Target size={11}/>
                                {item.target_release}
              </span>
                        )}
                    </div>
                    <h3 className="text-[15px] font-semibold text-foreground leading-snug">
                        {item.title}
                    </h3>
                    <p className="text-[12px] text-muted-foreground leading-relaxed">
                        {item.summary || item.description}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Gauge size={11}/>
                {EFFORT_LABEL[item.effort] || item.effort || "—"}
            </span>
                        <span className="inline-flex items-center gap-1">
              <User size={11}/>
                            {item.owner || "Unassigned"}
            </span>
                        <span className="inline-flex items-center gap-1">
              <ListChecks size={11}/>
                            {doneCount}/{tasks.length} tasks
            </span>
                    </div>
                    <div className="space-y-1 pt-0.5">
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>Progress</span>
                            <span className="font-mono text-muted-foreground">{item.progress ?? 0}%</span>
                        </div>
                        <ProgressBar value={item.progress}/>
                    </div>
                </div>
                <div className="flex sm:flex-col gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        className="inline-flex items-center gap-1 text-[11px] px-3 py-1.5 rounded border border-border text-foreground/90 hover:border-primary/40 hover:text-primary transition-colors"
                        data-testid={`roadmap-expand-${item.id}`}
                    >
                        <CaretDown size={12}
                                   className={open ? "rotate-180 transition-transform" : "transition-transform"}/>
                        {open ? "Hide detail" : "Detail & tasks"}
                    </button>
                    {canEdit && (
                        <button
                            type="button"
                            disabled={busy}
                            onClick={generateTasks}
                            className="inline-flex items-center gap-1 text-[11px] px-3 py-1.5 rounded border border-[var(--success-border)] text-success/90 hover:bg-success-soft transition-colors disabled:opacity-50"
                            data-testid={`roadmap-gen-tasks-${item.id}`}
                            title="Convert roadmap item into starter development tasks"
                        >
                            <ListChecks size={12}/>
                            Gen tasks
                        </button>
                    )}
                </div>
            </div>

            {open && (
                <div className="border-t border-border pt-3 space-y-4">
                    {item.description && item.description !== item.summary && (
                        <div>
                            <div
                                className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Description
                            </div>
                            <p className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                                {item.description}
                            </p>
                        </div>
                    )}

                    {item.architecture_notes && (
                        <div className="rounded-md border border-primary/15 bg-primary/5 px-3 py-2">
                            <div className="text-[10px] uppercase tracking-wider text-primary/80 mb-1">Architecture
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">{item.architecture_notes}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <div
                                className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                <Code size={11}/> Related modules
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {(item.modules || []).length ? (
                                    (item.modules || []).map((m) => (
                                        <span key={m}
                                              className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground bg-background/80">
                      {m}
                    </span>
                                    ))
                                ) : (
                                    <span className="text-[11px] text-muted-foreground/80">—</span>
                                )}
                            </div>
                        </div>
                        <div>
                            <div
                                className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                                <LinkSimple size={11}/> Docs / links
                            </div>
                            <ul className="space-y-1">
                                {(item.docs || []).length ? (
                                    (item.docs || []).map((d) => (
                                        <li key={d} className="text-[11px] text-primary/80 break-all font-mono">
                                            {d.startsWith("http") ? (
                                                <a href={d} target="_blank" rel="noreferrer"
                                                   className="hover:underline">
                                                    {d}
                                                </a>
                                            ) : (
                                                d
                                            )}
                                        </li>
                                    ))
                                ) : (
                                    <li className="text-[11px] text-muted-foreground/80">—</li>
                                )}
                            </ul>
                        </div>
                    </div>

                    {canEdit && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="soc-label flex items-center gap-1">
                                    <User size={11}/> Owner
                                </label>
                                <div className="flex gap-2 mt-1">
                                    <input
                                        className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-sm"
                                        value={owner}
                                        onChange={(e) => setOwner(e.target.value)}
                                        placeholder="e.g. Ana Analyst"
                                        data-testid={`roadmap-owner-${item.id}`}
                                    />
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => patch({owner})}
                                        className="text-[11px] px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                                    >
                                        Save
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="soc-label">Status · Priority · Progress</label>
                                <div className="flex flex-wrap gap-2 mt-1">
                                    <select
                                        className="bg-background border border-border rounded px-2 py-1.5 text-[12px]"
                                        value={item.status}
                                        disabled={busy}
                                        onChange={(e) => patch({status: e.target.value})}
                                        data-testid={`roadmap-status-${item.id}`}
                                    >
                                        {Object.keys(STATUS_META).map((s) => (
                                            <option key={s} value={s}>{STATUS_META[s].label}</option>
                                        ))}
                                    </select>
                                    <select
                                        className="bg-background border border-border rounded px-2 py-1.5 text-[12px]"
                                        value={item.priority}
                                        disabled={busy}
                                        onChange={(e) => patch({priority: e.target.value})}
                                    >
                                        {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                                            <option key={k} value={k}>{v}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        className="w-20 bg-background border border-border rounded px-2 py-1.5 text-[12px] font-mono"
                                        defaultValue={item.progress ?? 0}
                                        disabled={busy}
                                        onBlur={(e) => {
                                            const v = parseInt(e.target.value, 10);
                                            if (Number.isFinite(v) && v !== item.progress) patch({progress: v});
                                        }}
                                        title="Progress %"
                                    />
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="soc-label flex items-center gap-1">
                                    <NotePencil size={11}/> Implementation notes
                                </label>
                                <textarea
                                    className="mt-1 w-full bg-background border border-border rounded px-2 py-1.5 text-[12px] text-foreground/90 min-h-[72px]"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Progress notes, blockers, PR links…"
                                    data-testid={`roadmap-notes-${item.id}`}
                                />
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => patch({implementation_notes: notes})}
                                    className="mt-1.5 text-[11px] px-3 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-50"
                                >
                                    Save notes
                                </button>
                            </div>
                        </div>
                    )}

                    {!canEdit && item.implementation_notes && (
                        <div>
                            <div
                                className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Implementation
                                notes
                            </div>
                            <p className="text-[12px] text-muted-foreground whitespace-pre-wrap">{item.implementation_notes}</p>
                        </div>
                    )}

                    <div>
                        <div
                            className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                            <ListChecks size={11}/> Development tasks
                        </div>
                        <div className="rounded-md border border-border bg-background/50 px-3 py-1">
                            {tasks.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground/80 py-2">
                                    No tasks yet.
                                    {canEdit && " Use “Gen tasks” to create a starter checklist from this item."}
                                </p>
                            ) : (
                                tasks.map((t) => (
                                    <TaskRow
                                        key={t.id}
                                        task={t}
                                        canEdit={canEdit && !busy}
                                        onToggle={toggleTask}
                                        onStatus={setTaskStatus}
                                    />
                                ))
                            )}
                        </div>
                        {canEdit && (
                            <div className="flex gap-2 mt-2">
                                <input
                                    className="flex-1 bg-background border border-border rounded px-2 py-1.5 text-[12px]"
                                    placeholder="Add actionable task…"
                                    value={newTask}
                                    onChange={(e) => setNewTask(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && addTask()}
                                    data-testid={`roadmap-new-task-${item.id}`}
                                />
                                <button
                                    type="button"
                                    disabled={busy || !newTask.trim()}
                                    onClick={addTask}
                                    className="inline-flex items-center gap-1 text-[11px] px-3 py-1.5 rounded bg-primary/15 border border-primary/40 text-primary disabled:opacity-50"
                                >
                                    <Plus size={12}/>
                                    Add
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function Roadmap() {
    const {user} = useAuth();
    const canEdit = CAN_EDIT_ROLES.includes(user?.role) || user?.role === "admin";
    const canAdmin = CAN_ADMIN_ROLES.includes(user?.role) || user?.role === "admin";
    const [data, setData] = useState(null);
    const [statusFilter, setStatusFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [q, setQ] = useState("");
    const [busy, setBusy] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [createForm, setCreateForm] = useState({
        title: "",
        summary: "",
        priority: "p2",
        status: "planned",
        target_release: "v0.3",
        category: "General",
    });

    const load = useCallback(async () => {
        try {
            const params = {};
            if (statusFilter !== "all") params.status = statusFilter;
            if (priorityFilter !== "all") params.priority = priorityFilter;
            if (q.trim()) params.q = q.trim();
            const r = await api.get("/roadmap", {params});
            setData(r.data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Failed to load roadmap");
        }
    }, [statusFilter, priorityFilter, q]);

    useEffect(() => {
        load();
    }, [load]);

    const reseed = async () => {
        if (!window.confirm("Re-sync seed items from weekly discussions? Custom items and task progress are preserved where possible.")) {
            return;
        }
        setBusy(true);
        try {
            await api.post("/roadmap/seed", null, {params: {force: true}});
            toast.success("Roadmap seed synced");
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Seed failed");
        } finally {
            setBusy(false);
        }
    };

    const createItem = async () => {
        if (!createForm.title.trim()) {
            toast.error("Title required");
            return;
        }
        setBusy(true);
        try {
            await api.post("/roadmap", createForm);
            toast.success("Roadmap item created");
            setShowCreate(false);
            setCreateForm({
                title: "",
                summary: "",
                priority: "p2",
                status: "planned",
                target_release: "v0.3",
                category: "General",
            });
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Create failed");
        } finally {
            setBusy(false);
        }
    };

    const items = useMemo(() => data?.items || [], [data?.items]);
    const counts = data?.counts || {};

    const grouped = useMemo(() => {
        const order = ["in_progress", "planned", "future", "completed"];
        const map = Object.fromEntries(order.map((s) => [s, []]));
        for (const it of items) {
            const s = map[it.status] ? it.status : "planned";
            map[s].push(it);
        }
        return order.map((s) => ({status: s, items: map[s]})).filter((g) => g.items.length);
    }, [items]);

    if (!data) {
        return <div className="text-muted-foreground text-sm">Loading roadmap…</div>;
    }

    return (
        <div data-testid="roadmap-page" className="space-y-6">
            <PageHeader
                testid="roadmap-header"
                title="Product Roadmap"
                icon={MapTrifold}
                subtitle={
                    <>
                        Track weekly-discussion initiatives as actionable work: status, priority, ownership,
                        effort, target release, module links, and development tasks. Seeded from{" "}
                        <span className="font-mono text-muted-foreground">memory/WEEKLY_DISCUSSIONS.md</span>
                        {" "}({data.source}).
                    </>
                }
                actions={
                    canAdmin ? (
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                data-testid="roadmap-create-btn"
                                onClick={() => setShowCreate((v) => !v)}
                                className="soc-btn-secondary !text-xs !h-9"
                            >
                                <Plus size={14}/>
                                New item
                            </button>
                            <button
                                type="button"
                                data-testid="roadmap-reseed-btn"
                                disabled={busy}
                                onClick={reseed}
                                className="soc-btn-ghost !text-xs !h-9 disabled:opacity-50"
                            >
                                <ArrowClockwise size={14}/>
                                Sync seed
                            </button>
                        </div>
                    ) : null
                }
            />

            {/* Counts */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(STATUS_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    const tone =
                        key === "completed"
                            ? "success"
                            : key === "in_progress"
                                ? "warning"
                                : key === "future"
                                    ? "primary"
                                    : "muted";
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setStatusFilter((s) => (s === key ? "all" : key))}
                            className={`text-left rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                                statusFilter === key ? "ring-1 ring-primary/40" : ""
                            }`}
                            data-testid={`roadmap-count-${key}`}
                        >
                            <KpiCard
                                label={meta.label}
                                value={counts[key] ?? 0}
                                icon={Icon}
                                tone={tone}
                                className="p-3"
                            />
                        </button>
                    );
                })}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
                <input
                    className="bg-background border border-border rounded px-3 py-1.5 text-sm min-w-[12rem] flex-1 max-w-md"
                    placeholder="Search title, modules, owner…"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    data-testid="roadmap-search"
                />
                <select
                    className="bg-background border border-border rounded px-2 py-1.5 text-[12px]"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">All statuses</option>
                    {Object.entries(STATUS_META).map(([k, v]) => (
                        <option key={k} value={k}>{v.label}</option>
                    ))}
                </select>
                <select
                    className="bg-background border border-border rounded px-2 py-1.5 text-[12px]"
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                >
                    <option value="all">All priorities</option>
                    {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                    ))}
                </select>
                <span className="text-[11px] text-muted-foreground/80 ml-auto">
          {items.length} shown · {data.total} total
        </span>
            </div>

            {showCreate && canAdmin && (
                <div className="soc-card p-4 space-y-3 border border-primary/25" data-testid="roadmap-create-form">
                    <div className="text-[13px] font-medium text-primary">New roadmap item</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                            className="md:col-span-2 bg-background border border-border rounded px-3 py-2 text-sm"
                            placeholder="Title"
                            value={createForm.title}
                            onChange={(e) => setCreateForm((f) => ({...f, title: e.target.value}))}
                        />
                        <input
                            className="md:col-span-2 bg-background border border-border rounded px-3 py-2 text-sm"
                            placeholder="One-line summary"
                            value={createForm.summary}
                            onChange={(e) => setCreateForm((f) => ({...f, summary: e.target.value}))}
                        />
                        <select
                            className="bg-background border border-border rounded px-2 py-2 text-sm"
                            value={createForm.status}
                            onChange={(e) => setCreateForm((f) => ({...f, status: e.target.value}))}
                        >
                            {Object.keys(STATUS_META).map((s) => (
                                <option key={s} value={s}>{STATUS_META[s].label}</option>
                            ))}
                        </select>
                        <select
                            className="bg-background border border-border rounded px-2 py-2 text-sm"
                            value={createForm.priority}
                            onChange={(e) => setCreateForm((f) => ({...f, priority: e.target.value}))}
                        >
                            {Object.entries(PRIORITY_LABEL).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                        <input
                            className="bg-background border border-border rounded px-3 py-2 text-sm"
                            placeholder="Target release (e.g. v0.3)"
                            value={createForm.target_release}
                            onChange={(e) => setCreateForm((f) => ({...f, target_release: e.target.value}))}
                        />
                        <input
                            className="bg-background border border-border rounded px-3 py-2 text-sm"
                            placeholder="Category"
                            value={createForm.category}
                            onChange={(e) => setCreateForm((f) => ({...f, category: e.target.value}))}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={createItem}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-[12px] px-4 py-2 rounded disabled:opacity-50"
                        >
                            Create item
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowCreate(false)}
                            className="text-[12px] px-3 py-2 rounded border border-border text-muted-foreground"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* Guidance */}
            <div
                className="rounded-lg border border-border bg-background/40 px-4 py-3 text-[11px] text-muted-foreground leading-relaxed">
                <span className="text-muted-foreground font-medium">How to use: </span>
                Filter by status/priority → open <span className="text-muted-foreground">Detail & tasks</span> →
                update ownership and notes → check off tasks (progress auto-updates) → use{" "}
                <span className="text-success">Gen tasks</span> to convert an item into a starter
                implementation checklist. Admins can <span className="text-muted-foreground">New item</span> /{" "}
                <span className="text-muted-foreground">Sync seed</span> after weekly discussion updates.
                Senior reviewers can update status, tasks, and notes.
            </div>

            {items.length === 0 ? (
                <div className="text-muted-foreground text-sm py-12 text-center">
                    No roadmap items match filters.
                </div>
            ) : (
                <div className="space-y-8">
                    {grouped.map(({status, items: groupItems}) => (
                        <section key={status} data-testid={`roadmap-section-${status}`}>
                            <div className="flex items-center gap-2 mb-3">
                                <StatusBadge status={status}/>
                                <span className="text-[12px] text-muted-foreground">{groupItems.length} item(s)</span>
                            </div>
                            <div className="space-y-3">
                                {groupItems.map((item) => (
                                    <RoadmapCard
                                        key={item.id}
                                        item={item}
                                        canEdit={canEdit}
                                        onRefresh={load}
                                    />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
