/**
 * H-07 assignee picker — GET /users?q= (requires FEATURE_COLLAB_ASSIGN).
 */
import {useCallback, useEffect, useState} from "react";
import {api} from "../../lib/api";
import {HelpTip} from "../HelpTip";

export default function UserPicker({
    value,
    onChange,
    placeholder = "Search analysts…",
    testid = "user-picker",
    disabled = false,
    allowClear = true,
}) {
    const [q, setQ] = useState("");
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(false);
    const [open, setOpen] = useState(false);

    const search = useCallback(async (term) => {
        setBusy(true);
        try {
            const r = await api.get("/users", {params: {q: term || "", limit: 15}});
            setItems(Array.isArray(r.data?.items) ? r.data.items : []);
        } catch {
            setItems([]);
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        const t = setTimeout(() => search(q), 200);
        return () => clearTimeout(t);
    }, [q, open, search]);

    const selectedLabel = value?.email || value?.name || value?.id || "";

    return (
        <div className="relative" data-testid={testid}>
            <div className="flex items-center gap-1.5 mb-1">
                <label className="text-[11px] font-semibold text-muted-foreground">Assignee</label>
                <HelpTip
                    title="Assign owner"
                    body="Search by name or email. Primary owner is the IR lead. Analysts may only self-assign; seniors/admins may assign anyone."
                    testid={`${testid}-tip`}
                />
            </div>
            <button
                type="button"
                disabled={disabled}
                data-testid={`${testid}-trigger`}
                className="w-full text-left soc-input text-sm py-2 disabled:opacity-50"
                onClick={() => setOpen((v) => !v)}
            >
                {selectedLabel || placeholder}
            </button>
            {allowClear && value?.id && (
                <button
                    type="button"
                    className="text-[10px] text-muted-foreground hover:text-error mt-1"
                    data-testid={`${testid}-clear`}
                    onClick={() => onChange(null)}
                >
                    Clear assignee
                </button>
            )}
            {open && (
                <div className="absolute z-40 mt-1 w-full rounded-lg border theme-border bg-popover shadow-lg p-2 space-y-1">
                    <input
                        autoFocus
                        className="soc-input w-full text-sm"
                        placeholder="Type to search…"
                        value={q}
                        data-testid={`${testid}-input`}
                        onChange={(e) => setQ(e.target.value)}
                    />
                    {busy && <div className="text-[10px] text-muted-foreground px-1">Searching…</div>}
                    <ul className="max-h-48 overflow-y-auto">
                        {items.map((u) => (
                            <li key={u.id}>
                                <button
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 rounded hover:bg-muted/50 text-sm"
                                    data-testid={`${testid}-opt-${u.id}`}
                                    onClick={() => {
                                        onChange(u);
                                        setOpen(false);
                                    }}
                                >
                                    <div className="font-medium truncate">{u.name || u.email}</div>
                                    <div className="text-[10px] font-mono text-muted-foreground truncate">
                                        {u.email} · {u.role}
                                    </div>
                                </button>
                            </li>
                        ))}
                        {!busy && items.length === 0 && (
                            <li className="text-[11px] text-muted-foreground px-2 py-2">No users</li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
}
