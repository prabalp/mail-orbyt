import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Chip } from "./Chip";

describe("Chip", () => {
  it("renders as non-interactive when there is no onClick", () => {
    render(<Chip>Static</Chip>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("fires onClick and supports keyboard activation when interactive", async () => {
    const onClick = vi.fn();
    render(<Chip onClick={onClick}>Filter</Chip>);
    const chip = screen.getByRole("button", { name: "Filter" });
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
    chip.focus();
    await userEvent.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("never nests a <button> inside a <button> when both onClick and onRemove are set", () => {
    render(
      <Chip onClick={vi.fn()} onRemove={vi.fn()}>
        Removable
      </Chip>,
    );
    const removeButton = screen.getByRole("button", { name: "Remove" });
    expect(removeButton.parentElement?.closest("button")).toBeNull();
  });

  it("calls onRemove without triggering onClick", async () => {
    const onClick = vi.fn();
    const onRemove = vi.fn();
    render(
      <Chip onClick={onClick} onRemove={onRemove}>
        Removable
      </Chip>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
