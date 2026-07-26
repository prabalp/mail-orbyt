import { useId } from "react";
import { cn } from "../cn";

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  label: string;
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  hideLabel?: boolean;
  className?: string;
}

export function RadioGroup({
  name,
  label,
  options,
  value,
  onChange,
  hideLabel = false,
  className,
}: RadioGroupProps): React.ReactElement {
  const groupId = useId();

  return (
    <fieldset className={cn("flex flex-col gap-2", className)}>
      <legend className={cn("text-sm font-medium text-on-surface-variant", hideLabel && "sr-only")}>
        {label}
      </legend>
      {options.map((option) => {
        const optionId = `${groupId}-${option.value}`;
        return (
          <label key={option.value} htmlFor={optionId} className="inline-flex items-center gap-2">
            <input
              id={optionId}
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange?.(option.value)}
              className={cn(
                "h-5 w-5 border-2 border-outline text-primary accent-[var(--md-primary)]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                "disabled:cursor-not-allowed disabled:opacity-38",
              )}
            />
            <span className="text-sm text-on-surface">{option.label}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
