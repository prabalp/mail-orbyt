"use client";

import { useId } from "react";
import { cn } from "../cn";

/**
 * Thin abstraction over the underlying time input. Call sites depend only on
 * this API (24h `HH:mm` value strings in/out) so the native <input>
 * implementation can be swapped for a richer picker later without touching
 * callers.
 */
export interface TimePickerProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string;
  helperText?: string;
  hideLabel?: boolean;
  disabled?: boolean;
}

export function TimePicker({
  label,
  value,
  onChange,
  error,
  helperText,
  hideLabel = false,
  disabled,
}: TimePickerProps): React.ReactElement {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className={cn("text-sm font-medium text-on-surface-variant", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value || null)}
        aria-invalid={Boolean(error) || undefined}
        className={cn(
          "h-10 rounded-md-sm border bg-surface px-3 text-base text-on-surface",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface/38",
          error ? "border-error" : "border-outline",
        )}
      />
      {error ? (
        <p className="text-sm text-error">{error}</p>
      ) : helperText ? (
        <p className="text-sm text-on-surface-variant">{helperText}</p>
      ) : null}
    </div>
  );
}
