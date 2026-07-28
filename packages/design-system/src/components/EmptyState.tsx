import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md-lg border border-dashed border-outline/40 px-6 py-12 text-center">
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-container text-on-primary-container [&_svg]:h-6 [&_svg]:w-6">
          {icon}
        </div>
      ) : null}
      <h3 className="text-lg font-medium text-on-surface">{title}</h3>
      {description ? (
        <p className="max-w-sm text-sm text-on-surface-variant">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
