/**
 * Client-side CSV export for enterprise tables.
 * Does not change API contracts — exports current UI rows only.
 */

function escapeCell(value) {
    if (value == null) return "";
    const s = String(value);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
}

/**
 * @param {string} filename
 * @param {string[]} headers
 * @param {Array<Array<string|number|null|undefined>>} rows
 */
export function downloadCsv(filename, headers, rows) {
    const lines = [
        headers.map(escapeCell).join(","),
        ...rows.map((row) => row.map(escapeCell).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], {type: "text/csv;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function incidentsToCsvRows(incidents) {
    const headers = [
        "id",
        "title",
        "severity",
        "status",
        "threat_score",
        "grounding",
        "techniques",
        "iocs",
        "created_at",
    ];
    const rows = (incidents || []).map((inc) => [
        inc.id,
        inc.title,
        inc.severity,
        inc.status,
        inc.threat_score,
        inc.playbook?.grounding_score ?? "",
        (inc.techniques || []).map((t) => t.technique_id).join(";"),
        (inc.iocs || []).map((i) => `${i.type || ""}:${i.value || ""}`).join(";"),
        inc.created_at,
    ]);
    return {headers, rows};
}
