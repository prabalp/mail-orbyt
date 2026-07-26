import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./Checkbox";

describe("Checkbox", () => {
  it("toggles checked state on click", async () => {
    render(<Checkbox label="Accept terms" onChange={vi.fn()} />);
    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("does not toggle when disabled", async () => {
    render(<Checkbox label="Accept terms" disabled onChange={vi.fn()} />);
    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });
});
