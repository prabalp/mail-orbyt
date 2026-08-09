"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../cn";

export interface TableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
  selectedKeys?: Set<string>;
  onSelectRow?: (key: string, selected: boolean) => void;
  /**
   * Enables the header checkbox, which selects or clears every row currently
   * rendered. Selecting beyond the visible page is deliberately not this
   * component's job — the caller owns the filter and is the only thing that
   * can resolve "all matching" (see the leads table's select-all banner).
   */
  onSelectAllRows?: (selected: boolean) => void;
}

export function Table<T>({
  columns,
  rows,
  getRowKey,
  emptyState,
  onRowClick,
  selectedKeys,
  onSelectRow,
  onSelectAllRows,
}: TableProps<T>): React.ReactElement {
  const selectable = Boolean(onSelectRow);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const selectedOnPage = rows.filter((row) => selectedKeys?.has(getRowKey(row))).length;
  const allOnPageSelected = rows.length > 0 && selectedOnPage === rows.length;

  useEffect(() => {
    if (selectAllRef.current) {
      // Indeterminate is a DOM property, not an attribute — React can't set it
      // via JSX, so a partial page selection has to be applied imperatively.
      selectAllRef.current.indeterminate = selectedOnPage > 0 && !allOnPageSelected;
    }
  }, [selectedOnPage, allOnPageSelected]);

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className="overflow-x-auto rounded-md-md border border-outline/30">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-surface-container">
          <tr>
            {selectable ? (
              <th className="w-10 px-4 py-3">
                {onSelectAllRows ? (
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    aria-label="Select all rows"
                    checked={allOnPageSelected}
                    onChange={(event) => onSelectAllRows(event.target.checked)}
                  />
                ) : null}
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  "px-4 py-3 font-medium text-on-surface-variant",
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = getRowKey(row);
            return (
              <tr
                key={key}
                onClick={() => onRowClick?.(row)}
                className={cn(
                  "border-t border-outline/15",
                  onRowClick && "cursor-pointer hover:bg-primary-container/20",
                  selectedKeys?.has(key) && "bg-primary-container/30",
                )}
              >
                {selectable ? (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select row"
                      checked={selectedKeys?.has(key) ?? false}
                      onChange={(event) => onSelectRow?.(key, event.target.checked)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-3 text-on-surface",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
