import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DropdownMenu } from "./DropdownMenu";

const trigger = <button type="button">Actions</button>;

describe("DropdownMenu", () => {
  it("opens the menu on trigger click and shows items", async () => {
    render(
      <DropdownMenu
        trigger={trigger}
        items={[
          { key: "edit", label: "Edit", onSelect: vi.fn() },
          { key: "delete", label: "Delete", onSelect: vi.fn(), destructive: true },
        ]}
      />,
    );
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("Actions"));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
  });

  it("calls onSelect and closes the menu when an item is chosen", async () => {
    const onSelect = vi.fn();
    render(<DropdownMenu trigger={trigger} items={[{ key: "edit", label: "Edit", onSelect }]} />);
    await userEvent.click(screen.getByText("Actions"));
    await userEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside", async () => {
    render(
      <div>
        <DropdownMenu
          trigger={trigger}
          items={[{ key: "edit", label: "Edit", onSelect: vi.fn() }]}
        />
        <button type="button">Outside</button>
      </div>,
    );
    await userEvent.click(screen.getByText("Actions"));
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    await userEvent.click(screen.getByText("Outside"));
    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("does not wrap the trigger in an extra interactive element", () => {
    render(
      <DropdownMenu
        trigger={trigger}
        items={[{ key: "edit", label: "Edit", onSelect: vi.fn() }]}
      />,
    );
    const button = screen.getByRole("button", { name: "Actions" });
    expect(button.tagName).toBe("BUTTON");
    expect(button.parentElement?.tagName).toBe("DIV");
  });
});
