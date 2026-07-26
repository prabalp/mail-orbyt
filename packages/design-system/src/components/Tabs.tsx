import { useState, type ReactNode } from "react";
import { cn } from "../cn";

export interface TabItem {
  key: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabItem[];
  defaultTab?: string;
  onChange?: (key: string) => void;
  className?: string;
}

export function Tabs({ tabs, defaultTab, onChange, className }: TabsProps): React.ReactElement {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.key);

  function select(key: string) {
    setActive(key);
    onChange?.(key);
  }

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const enabled = tabs.filter((tab) => !tab.disabled);
    if (event.key === "ArrowRight") {
      const next =
        enabled[(enabled.findIndex((t) => t.key === tabs[index]?.key) + 1) % enabled.length];
      if (next) select(next.key);
    } else if (event.key === "ArrowLeft") {
      const currentIndex = enabled.findIndex((t) => t.key === tabs[index]?.key);
      const prev = enabled[(currentIndex - 1 + enabled.length) % enabled.length];
      if (prev) select(prev.key);
    }
  }

  const activeTab = tabs.find((tab) => tab.key === active);

  return (
    <div className={className}>
      <div role="tablist" className="flex gap-1 border-b border-outline/20">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            role="tab"
            type="button"
            disabled={tab.disabled}
            aria-selected={tab.key === active}
            tabIndex={tab.key === active ? 0 : -1}
            onClick={() => select(tab.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab.key === active
                ? "border-primary text-primary"
                : "border-transparent text-on-surface-variant hover:text-on-surface",
              tab.disabled && "cursor-not-allowed opacity-38",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="pt-4">
        {activeTab?.content}
      </div>
    </div>
  );
}
