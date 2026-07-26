"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../cn";

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hideLabel?: boolean;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, label, hideLabel = false, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2">
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          role="switch"
          className={cn("peer sr-only", className)}
          {...props}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-0 rounded-full bg-on-surface/20 transition-colors",
            "peer-checked:bg-primary",
            "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
            "peer-disabled:opacity-38",
          )}
        />
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-md-1 transition-transform",
            "peer-checked:translate-x-5",
          )}
        />
      </span>
      <span className={cn("text-sm text-on-surface", hideLabel && "sr-only")}>{label}</span>
    </label>
  );
});
