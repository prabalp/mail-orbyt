import { describe, expect, it } from "vitest";
import { extractVisibleText } from "./page-text";

describe("extractVisibleText", () => {
  it("strips the doctype declaration, scripts, and styles, keeping only visible text", () => {
    const html =
      "<!doctype html><html><head><title>t</title>" +
      "<style>.a{color:red}</style></head><body>" +
      "<script>var x = 1;</script><p>Hello world</p></body></html>";

    expect(extractVisibleText(html)).toBe("tHello world");
  });

  it("collapses whitespace", () => {
    const html = "<p>Hello   \n\n  world</p>";
    expect(extractVisibleText(html)).toBe("Hello world");
  });
});
