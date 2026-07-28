import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";

describe("Sidebar", () => {
  it("marks the active nav item as current", () => {
    render(<Sidebar activeKey="leads" collapsed={false} onToggleCollapsed={vi.fn()} />);
    expect(screen.getByText("Leads")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Overview")).not.toHaveAttribute("aria-current");
  });

  it("calls onToggleCollapsed when the collapse button is clicked", async () => {
    const onToggle = vi.fn();
    render(<Sidebar activeKey="leads" collapsed={false} onToggleCollapsed={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("visually hides labels when collapsed, keeping them screen-reader accessible", () => {
    render(<Sidebar activeKey="leads" collapsed onToggleCollapsed={vi.fn()} />);
    expect(screen.getByText("Leads")).toHaveClass("sr-only");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
});
