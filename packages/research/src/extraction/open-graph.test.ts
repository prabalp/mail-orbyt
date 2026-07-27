import { describe, expect, it } from "vitest";
import { extractMetaTags, extractOpenGraph } from "./open-graph";

describe("extractOpenGraph", () => {
  it("extracts og: meta properties", () => {
    const html = `
      <head>
        <meta property="og:title" content="Acme Inc" />
        <meta property="og:description" content="We make widgets" />
        <meta name="not-og" content="ignored" />
      </head>
    `;
    expect(extractOpenGraph(html)).toEqual({
      "og:title": "Acme Inc",
      "og:description": "We make widgets",
    });
  });

  it("returns an empty object when there are no og tags", () => {
    expect(extractOpenGraph("<head></head>")).toEqual({});
  });
});

describe("extractMetaTags", () => {
  it("extracts the title and meta description", () => {
    const html = `<head><title> Acme Inc </title><meta name="description" content="We make widgets" /></head>`;
    expect(extractMetaTags(html)).toEqual({ title: "Acme Inc", description: "We make widgets" });
  });

  it("omits fields that are absent", () => {
    expect(extractMetaTags("<head></head>")).toEqual({});
  });
});
