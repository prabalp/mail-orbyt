import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

const baseProps = {
  activeNavKey: "overview",
  organisations: [{ id: "org-1", name: "Acme Inc" }],
  activeOrganisationId: "org-1",
  onSwitchOrganisation: vi.fn(),
  user: { name: "Jane Doe", email: "jane@example.com" },
  onProfile: vi.fn(),
  onSignOut: vi.fn(),
  notifications: [],
  onOpenNotification: vi.fn(),
};

describe("AppShell", () => {
  it("renders the active organisation, user initials, and page content", () => {
    render(
      <AppShell {...baseProps}>
        <p>Page content</p>
      </AppShell>,
    );
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("opens the mobile drawer from the menu button", async () => {
    render(
      <AppShell {...baseProps}>
        <p>Page content</p>
      </AppShell>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
  });

  it("shows an unread count badge when notifications are unread", () => {
    render(
      <AppShell {...baseProps} notifications={[{ id: "n1", message: "New reply", read: false }]}>
        <p>Page content</p>
      </AppShell>,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
