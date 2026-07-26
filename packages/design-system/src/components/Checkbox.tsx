"use client";

import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  hideLabel?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, label, hideLabel = false, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2">
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className={cn(
          "h-5 w-5 rounded border-2 border-outline text-primary accent-[var(--md-primary)]",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:opacity-38",
          className,
        )}
        {...props}
      />
      <span className={cn("text-sm text-on-surface", hideLabel && "sr-only")}>{label}</span>
    </label>
  );
});
