import { cn } from "../cn";

export interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
}: PaginationProps): React.ReactElement {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4">
      <p className="text-sm text-on-surface-variant">
        Page {page} of {totalPages} &middot; {totalItems} total
      </p>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={!canGoPrevious}
          onClick={() => onPageChange(page - 1)}
          className={cn(
            "rounded-md-sm border border-outline px-3 py-1.5 text-sm text-on-surface",
            "hover:bg-on-surface/8 disabled:cursor-not-allowed disabled:opacity-38",
          )}
        >
          Previous
        </button>
        <button
          type="button"
          disabled={!canGoNext}
          onClick={() => onPageChange(page + 1)}
          className={cn(
            "rounded-md-sm border border-outline px-3 py-1.5 text-sm text-on-surface",
            "hover:bg-on-surface/8 disabled:cursor-not-allowed disabled:opacity-38",
          )}
        >
          Next
        </button>
      </div>
    </nav>
  );
}
