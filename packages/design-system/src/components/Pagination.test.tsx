import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("disables Previous on the first page", () => {
    render(<Pagination page={1} pageSize={25} totalItems={100} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("disables Next on the last page", () => {
    render(<Pagination page={4} pageSize={25} totalItems={100} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("calls onPageChange with the next page number", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} pageSize={25} totalItems={100} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("renders a sane single page when there are no items", () => {
    render(<Pagination page={1} pageSize={25} totalItems={0} onPageChange={vi.fn()} />);
    expect(screen.getByText(/Page 1 of 1/)).toBeInTheDocument();
  });
});
