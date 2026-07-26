import {CaretDown, CaretUp, CaretUpDown} from "@phosphor-icons/react";
import {HelpTip, Tip} from "./HelpTip";

/**
 * Clickable table header with asc/desc/clear sort + optional help tip.
 * Help tip is outside the sort button so clicks do not toggle sort.
 */
export function SortableTh({
                               label,
                               sortKey,
                               sort,
                               onSort,
                               align = "left",
                               help,
                               className = "",
                               testid,
                           }) {
    const active = sort?.key === sortKey;
    const dir = active ? sort.dir : null;
    const tip = active
        ? dir === "asc"
            ? `Sorted ascending by ${label}. Click for descending.`
            : `Sorted descending by ${label}. Click to clear sort.`
        : `Sort by ${label} (asc → desc → clear)`;

    return (
        <th
            className={`soc-label px-3 py-2 select-none ${align === "right" ? "text-right" : "text-left"} ${className}`}
            data-testid={testid || `sort-th-${sortKey}`}
            aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
        >
            <div
                className={`inline-flex items-center gap-1 max-w-full ${
                    align === "right" ? "justify-end w-full" : ""
                }`}
            >
                <Tip content={tip}>
                    <button
                        type="button"
                        onClick={() => onSort(sortKey)}
                        className={`inline-flex items-center gap-1 group hover:text-primary transition-colors ${
                            active ? "text-primary" : "text-muted-foreground"
                        }`}
                    >
                        <span className="truncate">{label}</span>
                        <span className="inline-flex opacity-70 group-hover:opacity-100 shrink-0" aria-hidden>
              {!active && <CaretUpDown size={12}/>}
                            {active && dir === "asc" && <CaretUp size={12} weight="bold"/>}
                            {active && dir === "desc" && <CaretDown size={12} weight="bold"/>}
            </span>
                    </button>
                </Tip>
                {help && (
                    <HelpTip
                        title={help.title || label}
                        body={help.body}
                        how={help.how}
                        side="bottom"
                        testid={help.testid || `tip-col-${sortKey}`}
                        className="ml-0.5"
                    />
                )}
            </div>
        </th>
    );
}

export function PlainTh({label, align = "left", help, className = ""}) {
    return (
        <th className={`soc-label px-3 py-2 ${align === "right" ? "text-right" : "text-left"} ${className}`}>
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "justify-end w-full" : ""}`}>
        {label}
          {help && (
              <HelpTip title={help.title || label} body={help.body} how={help.how} side="bottom"/>
          )}
      </span>
        </th>
    );
}

// re-export Tip for convenience
export {Tip};
