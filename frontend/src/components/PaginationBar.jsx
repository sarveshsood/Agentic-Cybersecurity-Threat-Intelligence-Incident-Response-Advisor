/**
 * Simple client-side pagination controls for enterprise tables.
 */
import {CaretLeft, CaretRight} from "@phosphor-icons/react";
import {cn} from "../lib/utils";

export function PaginationBar({
                                  page,
                                  pageSize,
                                  total,
                                  onPageChange,
                                  className,
                                  testid = "pagination",
                              }) {
    const totalPages = Math.max(1, Math.ceil((total || 0) / Math.max(1, pageSize)));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
    const to = Math.min(total, safePage * pageSize);

    if (total <= pageSize) {
        return (
            <div
                className={cn("flex items-center justify-between gap-3 text-[12px] text-muted-foreground px-1 py-2", className)}
                data-testid={testid}
            >
        <span>
          {total} row{total === 1 ? "" : "s"}
        </span>
            </div>
        );
    }

    return (
        <div
            className={cn(
                "flex flex-wrap items-center justify-between gap-3 text-[12px] text-muted-foreground px-1 py-2 border-t border-border",
                className,
            )}
            data-testid={testid}
        >
      <span>
        Showing <span className="font-mono text-foreground">{from}</span>–
        <span className="font-mono text-foreground">{to}</span> of{" "}
          <span className="font-mono text-foreground">{total}</span>
      </span>
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    className="soc-btn-secondary !px-2 !py-1 !text-xs !h-8"
                    disabled={safePage <= 1}
                    onClick={() => onPageChange(safePage - 1)}
                    aria-label="Previous page"
                    data-testid={`${testid}-prev`}
                >
                    <CaretLeft size={14} weight="bold"/>
                    Prev
                </button>
                <span className="font-mono tabular-nums px-2 text-foreground" data-testid={`${testid}-page`}>
          {safePage} / {totalPages}
        </span>
                <button
                    type="button"
                    className="soc-btn-secondary !px-2 !py-1 !text-xs !h-8"
                    disabled={safePage >= totalPages}
                    onClick={() => onPageChange(safePage + 1)}
                    aria-label="Next page"
                    data-testid={`${testid}-next`}
                >
                    Next
                    <CaretRight size={14} weight="bold"/>
                </button>
            </div>
        </div>
    );
}

export default PaginationBar;
