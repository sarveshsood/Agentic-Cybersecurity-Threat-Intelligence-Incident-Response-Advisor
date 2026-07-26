import {useCallback, useEffect, useState} from "react";
import {api} from "../../lib/api";
import {toast} from "sonner";
import {useAuth} from "../../lib/auth";
import {formatDateTime} from "../../lib/uiPrefs";

const KINDS = [
    {id: "", label: "All"},
    {id: "note", label: "Notes"},
    {id: "finding", label: "Findings"},
    {id: "recommendation", label: "Recommendations"},
];

export default function NotesNotebook({incidentId, kindFilter = null}) {
    const {user} = useAuth();
    const [notes, setNotes] = useState([]);
    const [filter, setFilter] = useState(kindFilter || "");
    const [loading, setLoading] = useState(true);
    const [body, setBody] = useState("");
    const [kind, setKind] = useState(kindFilter === "recommendation" ? "recommendation" : "note");
    const [title, setTitle] = useState("");
    const [busy, setBusy] = useState(false);

    const load = useCallback(() => {
        if (!incidentId) return;
        setLoading(true);
        const q = filter ? `?kind=${encodeURIComponent(filter)}` : "";
        api
            .get(`/incidents/${incidentId}/workspace/notes${q}`)
            .then((r) => setNotes(Array.isArray(r.data) ? r.data : []))
            .catch((e) => toast.error(e?.response?.data?.detail || "Failed to load notes"))
            .finally(() => setLoading(false));
    }, [incidentId, filter]);

    useEffect(() => {
        load();
    }, [load]);

    const create = async (e) => {
        e.preventDefault();
        if (!body.trim()) {
            toast.error("Note body is required");
            return;
        }
        setBusy(true);
        try {
            await api.post(`/incidents/${incidentId}/workspace/notes`, {
                body: body.trim(),
                kind,
                title: title.trim() || null,
            });
            setBody("");
            setTitle("");
            toast.success("Note added");
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Create failed");
        } finally {
            setBusy(false);
        }
    };

    const canEdit = (note) => {
        if (!user) return false;
        if (["admin", "senior_reviewer"].includes(user.role)) return true;
        return note.author_id === user.sub || note.author_id === user.id;
    };

    const remove = async (note) => {
        if (!window.confirm("Delete this note?")) return;
        try {
            await api.delete(`/incidents/${incidentId}/workspace/notes/${note.id}`);
            toast.success("Deleted");
            load();
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Delete failed");
        }
    };

    return (
        <div className="space-y-4" data-testid="notes-notebook">
            <form onSubmit={create} className="soc-card p-4 space-y-3" data-testid="notes-create-form">
                <div className="soc-label">Add {kind === "recommendation" ? "recommendation" : "note"}</div>
                <div className="flex flex-wrap gap-2">
                    <select
                        className="text-xs border border-border rounded px-2 py-1.5 bg-background"
                        value={kind}
                        onChange={(e) => setKind(e.target.value)}
                        data-testid="notes-kind-select"
                    >
                        <option value="note">Note</option>
                        <option value="finding">Finding</option>
                        <option value="recommendation">Recommendation</option>
                    </select>
                    <input
                        className="flex-1 min-w-[140px] text-xs border border-border rounded px-2 py-1.5 bg-background"
                        placeholder="Optional title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={200}
                        data-testid="notes-title-input"
                    />
                </div>
                <textarea
                    className="w-full text-sm border border-border rounded p-2.5 bg-background min-h-[88px]"
                    placeholder="Findings, commands run, analyst notes…"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={8192}
                    required
                    data-testid="notes-body-input"
                />
                <button
                    type="submit"
                    disabled={busy}
                    className="soc-btn-primary !text-xs !py-1.5 disabled:opacity-50"
                    data-testid="notes-submit-btn"
                >
                    {busy ? "Saving…" : "Add to notebook"}
                </button>
            </form>

            <div className="soc-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div className="soc-label">Notebook</div>
                    {!kindFilter && (
                        <div className="flex gap-1">
                            {KINDS.map((k) => (
                                <button
                                    key={k.id || "all"}
                                    type="button"
                                    onClick={() => setFilter(k.id)}
                                    className={`text-[10px] px-2 py-1 rounded border ${
                                        filter === k.id
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border text-muted-foreground"
                                    }`}
                                    data-testid={`notes-filter-${k.id || "all"}`}
                                >
                                    {k.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                {loading ? (
                    <p className="text-xs text-muted-foreground">Loading notes…</p>
                ) : notes.length === 0 ? (
                    <p className="text-xs text-muted-foreground" data-testid="notes-empty">No notes yet.</p>
                ) : (
                    <ul className="space-y-3">
                        {notes.map((n) => (
                            <li
                                key={n.id}
                                className="border border-border rounded-lg p-3"
                                data-testid={`note-item-${n.id}`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div>
                                        <span className="text-[10px] uppercase tracking-wide font-semibold text-primary">
                                            {n.kind}
                                        </span>
                                        {n.title && (
                                            <div className="text-sm font-medium text-foreground mt-0.5">{n.title}</div>
                                        )}
                                    </div>
                                    {canEdit(n) && (
                                        <button
                                            type="button"
                                            className="text-[10px] text-error hover:underline"
                                            onClick={() => remove(n)}
                                            data-testid={`note-delete-${n.id}`}
                                        >
                                            Delete
                                        </button>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground mt-1.5 whitespace-pre-wrap leading-relaxed">
                                    {n.body}
                                </p>
                                <div className="text-[10px] text-muted-foreground/80 font-mono mt-2">
                                    {n.author_email || n.author_id || "unknown"} ·{" "}
                                    {n.created_at ? formatDateTime(n.created_at) : ""}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

/** Recommendations tab: human rec notes + containment playbook steps */
export function RecommendationsPanel({incidentId, playbook}) {
    const containment = (playbook?.steps || []).filter((s) => s.phase === "containment").slice(0, 3);
    return (
        <div className="space-y-4" data-testid="recommendations-panel">
            <div className="soc-card p-4">
                <div className="soc-label mb-2">Playbook containment (read-only)</div>
                {containment.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No containment steps on this playbook.</p>
                ) : (
                    <ol className="space-y-2">
                        {containment.map((s) => (
                            <li key={s.order} className="text-sm flex gap-2" data-testid={`rec-step-${s.order}`}>
                                <span className="font-mono text-muted-foreground text-xs w-6">
                                    {String(s.order).padStart(2, "0")}
                                </span>
                                <span className="text-foreground leading-relaxed">{s.action}</span>
                            </li>
                        ))}
                    </ol>
                )}
            </div>
            <NotesNotebook incidentId={incidentId} kindFilter="recommendation"/>
        </div>
    );
}
