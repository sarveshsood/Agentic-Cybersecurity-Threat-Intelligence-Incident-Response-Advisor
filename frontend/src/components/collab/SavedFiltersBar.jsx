/**
 * H-08 saved filters bar for Incidents list.
 */
import {useCallback, useEffect, useState} from "react";
import {api} from "../../lib/api";
import {toast} from "sonner";
import {HelpTip, Tip} from "../HelpTip";

export default function SavedFiltersBar({
    page = "incidents",
    currentFilter,
    onApply,
}) {
    const [items, setItems] = useState([]);
    const [name, setName] = useState("");

    const load = useCallback(async () => {
        try {
            const r = await api.get("/saved-filters", {params: {page}});
            setItems(Array.isArray(r.data?.items) ? r.data.items : []);
        } catch {
            setItems([]);
        }
    }, [page]);

    useEffect(() => {
        load();
    }, [load]);

    const save = async () => {
        if (!name.trim()) {
            toast.error("Name required");
            return;
        }
        try {
            await api.post("/saved-filters", {
                name: name.trim(),
                page,
                filter: currentFilter || {},
                is_default: false,
            });
            setName("");
            toast.success("Filter saved");
            await load();
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Save failed");
        }
    };

    const remove = async (id) => {
        try {
            await api.delete(`/saved-filters/${id}`);
            await load();
        } catch {
            toast.error("Delete failed");
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="saved-filters-bar">
            <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                    Saved views
                </span>
                <HelpTip
                    title="Saved filters"
                    body="Named filter sets for this page. Server fields (status, severity, technique, assignee) keep pagination. Free-text / min-threat / HiTL are client-only extras."
                    testid="tip-saved-filters"
                />
            </div>
            {items.map((f) => (
                <div key={f.id} className="inline-flex items-center gap-0.5">
                    <Tip content={JSON.stringify(f.filter || {})}>
                        <button
                            type="button"
                            data-testid={`saved-filter-${f.id}`}
                            className="text-[11px] px-2 py-1 rounded-md border theme-border theme-chip hover:border-primary/40"
                            onClick={() => onApply?.(f.filter || {}, f)}
                        >
                            {f.name}
                            {f.is_default ? " ★" : ""}
                        </button>
                    </Tip>
                    <button
                        type="button"
                        className="text-[10px] text-muted-foreground hover:text-error px-1"
                        title="Delete"
                        onClick={() => remove(f.id)}
                    >
                        ×
                    </button>
                </div>
            ))}
            <input
                className="soc-input h-8 text-[11px] w-32"
                placeholder="New view name"
                value={name}
                data-testid="saved-filter-name"
                onChange={(e) => setName(e.target.value)}
            />
            <button
                type="button"
                className="text-[11px] font-semibold text-primary"
                data-testid="saved-filter-save"
                onClick={save}
            >
                Save current
            </button>
        </div>
    );
}
