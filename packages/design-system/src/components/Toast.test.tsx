import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function TriggerButton({ message }: { message: string }): React.ReactElement {
  const { show } = useToast();
  return (
    <button type="button" onClick={() => show(message, "success")}>
      Show toast
    </button>
  );
}

describe("Toast", () => {
  it("renders a toast after show() is called", async () => {
    render(
      <ToastProvider>
        <TriggerButton message="Saved successfully" />
      </ToastProvider>,
    );
    expect(screen.queryByText("Saved successfully")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show toast" }));
    expect(screen.getByText("Saved successfully")).toBeInTheDocument();
  });

  it("throws when useToast is used outside a provider", () => {
    function Broken(): React.ReactElement {
      useToast();
      return <div />;
    }
    expect(() => render(<Broken />)).toThrow(/ToastProvider/);
  });
});
