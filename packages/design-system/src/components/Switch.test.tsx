import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Switch } from "./Switch";

describe("Switch", () => {
  it("exposes a switch role and toggles on click", async () => {
    render(<Switch label="Active" onChange={vi.fn()} />);
    const toggle = screen.getByRole("switch", { name: "Active" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    expect(toggle).toBeChecked();
  });
});
