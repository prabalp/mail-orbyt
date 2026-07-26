import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TextInput } from "./TextInput";

describe("TextInput", () => {
  it("associates the label with the input", () => {
    render(<TextInput label="Email" />);
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("accepts typed input", async () => {
    render(<TextInput label="Email" />);
    const input = screen.getByLabelText("Email");
    await userEvent.type(input, "jane@example.com");
    expect(input).toHaveValue("jane@example.com");
  });

  it("shows an error message and marks the field invalid", () => {
    render(<TextInput label="Email" error="Email is required" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Email is required")).toBeInTheDocument();
  });

  it("shows helper text when there is no error", () => {
    render(<TextInput label="Email" helperText="We'll never share this" />);
    expect(screen.getByText("We'll never share this")).toBeInTheDocument();
  });

  it("hides the visible label but keeps it accessible when hideLabel is set", () => {
    render(<TextInput label="Search" hideLabel />);
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });
});
