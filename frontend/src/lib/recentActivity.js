/**
 * Client-side recent activity (incidents visited). Non-breaking UX polish.
 * Stored only in localStorage — no API contract change.
 */

const KEY = "actira_recent_incidents_v1";
const MAX = 12;

export function getRecentIncidents() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/**
 * @param {{ id: string, title?: string, severity?: string }} item
 */
export function pushRecentIncident(item) {
    if (!item?.id) return;
    try {
        const prev = getRecentIncidents().filter((x) => x.id !== item.id);
        const next = [
            {
                id: item.id,
                title: (item.title || item.id).slice(0, 120),
                severity: item.severity || "",
                at: new Date().toISOString(),
            },
            ...prev,
        ].slice(0, MAX);
        localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
        /* private mode */
    }
}

export function clearRecentIncidents() {
    try {
        localStorage.removeItem(KEY);
    } catch {
        /* ignore */
    }
}
