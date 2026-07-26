import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Tabs } from "./Tabs";

describe("Tabs", () => {
  const tabs = [
    { key: "a", label: "Overview", content: <p>Overview content</p> },
    { key: "b", label: "Details", content: <p>Details content</p> },
  ];

  it("shows the first tab's content by default", () => {
    render(<Tabs tabs={tabs} />);
    expect(screen.getByText("Overview content")).toBeInTheDocument();
    expect(screen.queryByText("Details content")).not.toBeInTheDocument();
  });

  it("switches content when a tab is clicked", async () => {
    render(<Tabs tabs={tabs} />);
    await userEvent.click(screen.getByRole("tab", { name: "Details" }));
    expect(screen.getByText("Details content")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
  });

  it("does not activate a disabled tab", async () => {
    render(
      <Tabs
        tabs={[
          ...tabs,
          { key: "c", label: "Locked", content: <p>Locked content</p>, disabled: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("tab", { name: "Locked" }));
    expect(screen.queryByText("Locked content")).not.toBeInTheDocument();
  });
});
