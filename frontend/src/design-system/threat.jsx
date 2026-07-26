/**
 * Threat-intel presentation kit — IoC cards, timelines, CVE / MITRE chips.
 * Visual only; no data fetching.
 */
import {useState} from "react";
import {cn} from "../lib/utils";
import {
    Bug,
    CaretDown,
    CaretRight,
    Clock,
    Crosshair,
    Desktop,
    Globe,
    Hash,
    LinkSimple,
    ShieldWarning,
    UserFocus,
} from "@phosphor-icons/react";

const IOC_META = {
    ip: {Icon: Globe, label: "IP"},
    ipv4: {Icon: Globe, label: "IPv4"},
    ipv6: {Icon: Globe, label: "IPv6"},
    domain: {Icon: Globe, label: "Domain"},
    hostname: {Icon: Desktop, label: "Host"},
    host: {Icon: Desktop, label: "Host"},
    url: {Icon: LinkSimple, label: "URL"},
    hash: {Icon: Hash, label: "Hash"},
    md5: {Icon: Hash, label: "MD5"},
    sha1: {Icon: Hash, label: "SHA1"},
    sha256: {Icon: Hash, label: "SHA256"},
    email: {Icon: UserFocus, label: "Email"},
    cve: {Icon: Bug, label: "CVE"},
};

function scoreTone(score) {
    const n = Number(score);
    if (Number.isNaN(n)) return "text-muted-foreground";
    if (n >= 70) return "text-error";
    if (n >= 40) return "text-warning";
    return "text-success";
}

/** Single IoC with type, value, score, optional enrichment summary */
export function IocCard({
                            type,
                            value,
                            threatScore,
                            enrichment,
                            className,
                            testid,
                            onClick,
                        }) {
    const key = (type || "").toLowerCase();
    const meta = IOC_META[key] || {Icon: ShieldWarning, label: type || "IoC"};
    const Icon = meta.Icon;

    return (
        <div
            data-testid={testid}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            onClick={onClick}
            onKeyDown={onClick ? (e) => e.key === "Enter" && onClick(e) : undefined}
            className={cn(
                "soc-card p-3 transition-colors",
                onClick && "cursor-pointer hover:border-primary/30",
                className,
            )}
        >
            <div className="flex items-center justify-between gap-2">
        <span
            className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
          <Icon size={12} aria-hidden/>
            {meta.label}
        </span>
                {threatScore != null && (
                    <span className={cn("font-mono text-[11px] font-semibold tabular-nums", scoreTone(threatScore))}>
            {threatScore}
          </span>
                )}
            </div>
            <div className="ioc-chip mt-1.5 max-w-full truncate block" title={value}>
                {value}
            </div>
            {enrichment && (
                <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(enrichment)
                        .filter(([k]) => !["mode", "mock"].includes(k))
                        .slice(0, 6)
                        .map(([src, data]) => {
                            if (!data || typeof data !== "object") return null;
                            const mock = data.mock !== false;
                            return (
                                <span
                                    key={src}
                                    className="text-[9px] font-mono px-1.5 py-0.5 rounded-md border border-border bg-muted text-muted-foreground"
                                    title={mock ? `${src}: mock` : `${src}: live`}
                                >
                  {src.slice(0, 3).toUpperCase()}
                                    {data.score != null ? ` ${data.score}` : ""}
                                    {mock ? " ·m" : " ·●"}
                </span>
                            );
                        })}
                </div>
            )}
        </div>
    );
}

/** Compact MITRE technique chip */
export function MitreChip({techniqueId, name, confidence, onClick, className}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={name ? `${techniqueId} — ${name}` : techniqueId}
            className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md border border-primary/30 bg-primary/10 text-primary text-[11px] hover:border-primary/50 transition-colors",
                className,
            )}
            data-testid={techniqueId ? `tech-${techniqueId}` : undefined}
        >
            <Crosshair size={10} aria-hidden/>
            <span className="font-mono">{techniqueId}</span>
            {name ? <span className="opacity-80 truncate max-w-[10rem]">{name}</span> : null}
            {typeof confidence === "number" && (
                <span className="font-mono text-[9px] opacity-70">{Math.round(confidence * 100)}%</span>
            )}
        </button>
    );
}

/** CVE card */
export function CveCard({
                            cveId,
                            title,
                            severity,
                            cvss,
                            description,
                            published,
                            className,
                            testid,
                        }) {
    return (
        <article
            data-testid={testid || (cveId ? `cve-${cveId}` : "cve-card")}
            className={cn("soc-card p-4 space-y-2", className)}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div
                        className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                        <Bug size={12} aria-hidden/>
                        CVE
                    </div>
                    <h3 className="font-mono text-sm font-semibold text-primary mt-0.5">{cveId}</h3>
                    {title ? <p className="text-sm font-medium mt-0.5 truncate">{title}</p> : null}
                </div>
                <div className="text-right shrink-0">
                    {severity ? (
                        <span
                            className={cn("text-[10px] uppercase font-semibold", scoreTone(cvss ?? (severity === "CRITICAL" ? 90 : 50)))}>
              {severity}
            </span>
                    ) : null}
                    {cvss != null && (
                        <div className="font-mono text-xs text-muted-foreground mt-0.5">CVSS {cvss}</div>
                    )}
                </div>
            </div>
            {description ? (
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{description}</p>
            ) : null}
            {published ? (
                <div className="text-[10px] text-muted-foreground font-mono">{published}</div>
            ) : null}
        </article>
    );
}

/** Vertical timeline event */
export function TimelineEvent({
                                  time,
                                  title,
                                  description,
                                  severity,
                                  icon: Icon = Clock,
                                  children,
                                  defaultOpen = true,
                                  notes,
                                  className,
                              }) {
    const [open, setOpen] = useState(defaultOpen);
    const sev = (severity || "").toLowerCase();
    const sevBorder =
        sev === "critical" ? "border-[var(--sev-critical)]" :
            sev === "high" ? "border-[var(--sev-high)]" :
                sev === "medium" ? "border-[var(--sev-medium)]" :
                    sev === "low" ? "border-[var(--sev-low)]" :
                        "border-primary/40";

    return (
        <li className={cn("relative pl-6 pb-4 last:pb-0", className)}>
      <span
          className={cn(
              "absolute left-0 top-1 w-3 h-3 rounded-full border-2 bg-card",
              sevBorder,
          )}
          aria-hidden
      />
            <div className="flex items-start gap-2">
                <button
                    type="button"
                    className="flex items-start gap-2 text-left min-w-0 flex-1 group"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                >
                    {open ? <CaretDown size={12} className="mt-1 shrink-0 text-muted-foreground"/> :
                        <CaretRight size={12} className="mt-1 shrink-0 text-muted-foreground"/>}
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <Icon size={14} className="text-primary shrink-0" aria-hidden/>
                            <span className="text-sm font-semibold">{title}</span>
                            {severity ? (
                                <span
                                    className={cn("text-[9px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded-md border", sevBorder, "text-muted-foreground")}>
                  {severity}
                </span>
                            ) : null}
                        </div>
                        {time ? (
                            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">{time}</div>
                        ) : null}
                    </div>
                </button>
            </div>
            {open && (
                <div className="ml-5 mt-1.5 space-y-1.5">
                    {description ?
                        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p> : null}
                    {notes ? (
                        <div className="text-xs rounded-md border border-border bg-muted/50 px-2 py-1.5">
                            <span className="soc-label">Analyst note</span>
                            <p className="mt-0.5 text-muted-foreground">{notes}</p>
                        </div>
                    ) : null}
                    {children}
                </div>
            )}
        </li>
    );
}

/** Timeline list container */
export function Timeline({children, className, testid = "timeline"}) {
    return (
        <ol
            data-testid={testid}
            className={cn("relative border-l border-border ml-1.5 space-y-0", className)}
        >
            {children}
        </ol>
    );
}

/** Reputation strip for IP/domain */
export function ReputationStrip({sources = [], className}) {
    if (!sources?.length) return null;
    return (
        <div className={cn("grid grid-cols-2 sm:grid-cols-4 gap-1", className)}>
            {sources.map(({key, label, score, mock, failed}) => (
                <div
                    key={key || label}
                    className="text-center py-1 rounded-md bg-muted border border-border"
                    title={failed ? "Live call failed → mock" : mock ? "Mock (no key)" : "Live API"}
                >
                    <div className="text-[9px] text-muted-foreground uppercase tracking-wide">
                        {label}
                        <span className={mock ? "text-warning ml-0.5" : "text-success ml-0.5"}>
              {failed ? "⚠" : mock ? "m" : "●"}
            </span>
                    </div>
                    <div className="text-primary font-mono text-[11px]">{score ?? "—"}</div>
                </div>
            ))}
        </div>
    );
}

export default {
    IocCard,
    MitreChip,
    CveCard,
    Timeline,
    TimelineEvent,
    ReputationStrip,
};
