import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../cn";

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  hideLabel?: boolean;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, label, error, helperText, hideLabel = false, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={cn("text-sm font-medium text-on-surface-variant", hideLabel && "sr-only")}
      >
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
        className={cn(
          "h-10 rounded-md-sm border bg-surface px-3 text-base text-on-surface",
          "placeholder:text-on-surface-variant/60",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
          "disabled:cursor-not-allowed disabled:bg-surface-container disabled:text-on-surface/38",
          error ? "border-error" : "border-outline",
          className,
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="text-sm text-error">
          {error}
        </p>
      ) : helperText ? (
        <p id={helperId} className="text-sm text-on-surface-variant">
          {helperText}
        </p>
      ) : null}
    </div>
  );
});
