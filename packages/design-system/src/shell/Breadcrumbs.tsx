import type { ComponentType } from "react";
import type { LinkComponentProps } from "./Sidebar";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  LinkComponent?: ComponentType<LinkComponentProps>;
}

function DefaultLink({ href, className, children }: LinkComponentProps): React.ReactElement {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

export function Breadcrumbs({
  items,
  LinkComponent = DefaultLink,
}: BreadcrumbsProps): React.ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5 text-sm text-on-surface-variant">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <LinkComponent href={item.href} className="hover:text-on-surface hover:underline">
                  {item.label}
                </LinkComponent>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={isLast ? "text-on-surface" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast ? <span aria-hidden="true">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
