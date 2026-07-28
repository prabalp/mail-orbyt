import { Check } from "lucide-react";
import { cn } from "../cn";

export interface StepperStep {
  key: string;
  label: string;
}

export interface StepperProps {
  steps: StepperStep[];
  activeStep: string;
  completedSteps?: Set<string>;
}

export function Stepper({
  steps,
  activeStep,
  completedSteps = new Set(),
}: StepperProps): React.ReactElement {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((step, index) => {
        const isActive = step.key === activeStep;
        const isCompleted = completedSteps.has(step.key);
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                isCompleted
                  ? "bg-primary text-on-primary"
                  : isActive
                    ? "border-2 border-primary text-primary"
                    : "border border-outline text-on-surface-variant",
              )}
            >
              {isCompleted ? <Check size={14} aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                isActive ? "font-medium text-on-surface" : "text-on-surface-variant",
              )}
            >
              {step.label}
            </span>
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="mx-2 h-px w-6 bg-outline/40" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
