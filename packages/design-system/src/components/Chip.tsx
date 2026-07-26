import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "../cn";

export interface ChipProps {
  children: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  disabled?: boolean;
  className?: string;
}

export function Chip({
  children,
  selected = false,
  onClick,
  onRemove,
  disabled = false,
  className,
}: ChipProps): React.ReactElement {
  const isInteractive = Boolean(onClick) && !disabled;

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (!isInteractive) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick?.();
    }
  }

  return (
    <span
      // A nested <button> (the remove control) inside another <button> is
      // invalid HTML, so the chip itself is a div/span with a synthetic
      // "button" role rather than a real <button> when it's interactive.
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-pressed={isInteractive ? selected : undefined}
      aria-disabled={disabled || undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "inline-flex items-center gap-1 rounded-md-sm border px-3 py-1 text-sm transition-colors",
        selected
          ? "border-primary bg-primary-container text-on-primary-container"
          : "border-outline bg-surface text-on-surface-variant",
        isInteractive && "cursor-pointer hover:bg-primary-container/40",
        isInteractive &&
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        disabled && "cursor-not-allowed opacity-38",
        className,
      )}
    >
      {children}
      {onRemove ? (
        <button
          type="button"
          aria-label="Remove"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          className="ml-1 rounded-full text-on-surface-variant hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-38"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
