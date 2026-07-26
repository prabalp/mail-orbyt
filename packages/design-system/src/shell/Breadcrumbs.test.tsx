import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Breadcrumbs } from "./Breadcrumbs";

describe("Breadcrumbs", () => {
  it("renders intermediate items as links and the last as current page", () => {
    render(<Breadcrumbs items={[{ label: "Leads", href: "/leads" }, { label: "Jane Doe" }]} />);
    expect(screen.getByRole("link", { name: "Leads" })).toHaveAttribute("href", "/leads");
    expect(screen.getByText("Jane Doe")).toHaveAttribute("aria-current", "page");
  });
});
