/**
 * H-07 incident comments (discussion) — distinct from workspace notes.
 */
import {useCallback, useEffect, useState} from "react";
import {api} from "../../lib/api";
import {toast} from "sonner";
import {useAuth} from "../../lib/auth";
import {HelpTip, Tip} from "../HelpTip";
import {formatDateTime} from "../../lib/uiPrefs";

export default function CommentsPanel({incidentId}) {
    const {user} = useAuth();
    const [items, setItems] = useState([]);
    const [body, setBody] = useState("");
    const [replyTo, setReplyTo] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await api.get(`/incidents/${incidentId}/comments`);
            setItems(Array.isArray(r.data) ? r.data : []);
        } catch {
            setItems([]);
        }
    }, [incidentId]);

    useEffect(() => {
        load();
    }, [load]);

    const submit = async () => {
        if (!body.trim()) return;
        setBusy(true);
        try {
            await api.post(`/incidents/${incidentId}/comments`, {
                body: body.trim(),
                parent_id: replyTo || undefined,
            });
            setBody("");
            setReplyTo(null);
            toast.success("Comment posted");
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Comment failed");
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id) => {
        try {
            await api.delete(`/incidents/${incidentId}/comments/${id}`);
            toast.success("Comment deleted");
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Delete failed");
        }
    };

    const roots = items.filter((c) => !c.parent_id);
    const replies = (pid) => items.filter((c) => c.parent_id === pid);

    return (
        <div className="soc-card p-4 space-y-3" data-testid="comments-panel">
            <div className="flex items-center gap-1.5">
                <div className="soc-label">Team discussion</div>
                <HelpTip
                    title="Comments vs notes"
                    body="Comments are team chat with @mentions. Investigation notebook notes (evidence, findings) stay on the Notes tab — do not mix them."
                    testid="tip-comments-panel"
                />
            </div>
            <div className="space-y-3 max-h-72 overflow-y-auto">
                {roots.length === 0 && (
                    <p className="text-[12px] text-muted-foreground m-0">No comments yet.</p>
                )}
                {roots.map((c) => (
                    <div key={c.id} className="border-b border-border/60 pb-2" data-testid={`comment-${c.id}`}>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold">
                                {c.author_name || c.author_email || "User"}
                            </span>
                            <span className="text-[10px] font-mono text-muted-foreground">
                                {formatDateTime(c.created_at, {showStandard: false})}
                            </span>
                        </div>
                        <p className="text-[13px] mt-1 whitespace-pre-wrap m-0">{c.body}</p>
                        <div className="flex gap-2 mt-1">
                            <button
                                type="button"
                                className="text-[10px] text-primary hover:underline"
                                onClick={() => setReplyTo(c.id)}
                            >
                                Reply
                            </button>
                            {(c.author_id === (user?.sub || user?.id) ||
                                user?.role === "admin" ||
                                user?.role === "senior_reviewer") && (
                                <button
                                    type="button"
                                    className="text-[10px] text-muted-foreground hover:text-error"
                                    onClick={() => remove(c.id)}
                                >
                                    Delete
                                </button>
                            )}
                        </div>
                        {replies(c.id).map((r) => (
                            <div key={r.id} className="ml-4 mt-2 pl-2 border-l-2 border-primary/30">
                                <div className="text-[11px] font-semibold">
                                    {r.author_name || r.author_email}
                                </div>
                                <p className="text-[12px] m-0 whitespace-pre-wrap">{r.body}</p>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            {replyTo && (
                <div className="text-[10px] text-muted-foreground">
                    Replying…{" "}
                    <button type="button" className="text-primary underline" onClick={() => setReplyTo(null)}>
                        cancel
                    </button>
                </div>
            )}
            <textarea
                className="soc-input w-full text-sm min-h-[4rem]"
                placeholder="Comment… use @email@domain.com to mention"
                value={body}
                data-testid="comment-body"
                onChange={(e) => setBody(e.target.value)}
            />
            <Tip content="Post team discussion comment">
                <button
                    type="button"
                    disabled={busy || !body.trim()}
                    data-testid="comment-submit"
                    className="text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
                    onClick={submit}
                >
                    Post comment
                </button>
            </Tip>
        </div>
    );
}
