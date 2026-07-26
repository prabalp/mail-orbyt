import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
  it("is hidden when closed and visible when open", () => {
    const { rerender } = render(
      <Dialog open={false} onClose={vi.fn()} title="Confirm">
        Are you sure?
      </Dialog>,
    );
    expect(screen.queryByText("Are you sure?")).not.toBeVisible();

    rerender(
      <Dialog open onClose={vi.fn()} title="Confirm">
        Are you sure?
      </Dialog>,
    );
    expect(screen.getByText("Are you sure?")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Confirm" })).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Confirm">
        Are you sure?
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders footer content when provided", () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Confirm"
        footer={<button type="button">Confirm</button>}
      >
        Are you sure?
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
});
