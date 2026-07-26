import {useCallback, useMemo, useState} from "react";

/**
 * Client-side multi-type sort for table rows.
 * @param {Array} items
 * @param {{ key: string, dir: 'asc'|'desc' }|null} initial
 * @param {Record<string, (row) => any>} accessors - optional value extractors per key
 */
export function useSortableData(items, initial = null, accessors = {}) {
    const [sort, setSort] = useState(initial);

    const toggleSort = useCallback((key) => {
        setSort((prev) => {
            if (!prev || prev.key !== key) return {key, dir: "asc"};
            if (prev.dir === "asc") return {key, dir: "desc"};
            return null; // third click clears
        });
    }, []);

    const sorted = useMemo(() => {
        const list = Array.isArray(items) ? [...items] : [];
        if (!sort?.key) return list;
        const acc = accessors[sort.key] || ((row) => row?.[sort.key]);
        const dir = sort.dir === "desc" ? -1 : 1;
        list.sort((a, b) => {
            let va = acc(a);
            let vb = acc(b);
            if (va == null && vb == null) return 0;
            if (va == null) return 1;
            if (vb == null) return -1;
            if (typeof va === "string") va = va.toLowerCase();
            if (typeof vb === "string") vb = vb.toLowerCase();
            if (va < vb) return -1 * dir;
            if (va > vb) return 1 * dir;
            return 0;
        });
        return list;
    }, [items, sort, accessors]);

    return {sorted, sort, setSort, toggleSort};
}
