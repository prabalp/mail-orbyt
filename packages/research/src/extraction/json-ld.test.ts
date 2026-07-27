import { describe, expect, it } from "vitest";
import { extractJsonLd, findByType } from "./json-ld";

describe("extractJsonLd", () => {
  it("parses a single JSON-LD script block", () => {
    const html = `<html><head><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script></head></html>`;
    const nodes = extractJsonLd(html);
    expect(nodes).toEqual([{ "@type": "Organization", name: "Acme" }]);
  });

  it("parses multiple script blocks", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
      <script type="application/ld+json">{"@type":"Person","name":"Jane"}</script>
    `;
    const nodes = extractJsonLd(html);
    expect(nodes).toHaveLength(2);
  });

  it("flattens an @graph array", () => {
    const html = `<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"Acme"},{"@type":"Person","name":"Jane"}]}</script>`;
    const nodes = extractJsonLd(html);
    expect(nodes).toHaveLength(2);
  });

  it("handles a top-level array of JSON-LD objects", () => {
    const html = `<script type="application/ld+json">[{"@type":"Organization","name":"Acme"},{"@type":"Person","name":"Jane"}]</script>`;
    const nodes = extractJsonLd(html);
    expect(nodes).toHaveLength(2);
  });

  it("skips malformed JSON-LD without throwing", () => {
    const html = `<script type="application/ld+json">{not valid json</script><script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>`;
    const nodes = extractJsonLd(html);
    expect(nodes).toEqual([{ "@type": "Organization", name: "Acme" }]);
  });

  it("returns an empty array when there is no JSON-LD", () => {
    expect(extractJsonLd("<html><body>Hello</body></html>")).toEqual([]);
  });
});

describe("findByType", () => {
  it("filters nodes by @type string", () => {
    const nodes = [{ "@type": "Organization" }, { "@type": "Person" }];
    expect(findByType(nodes, "Person")).toEqual([{ "@type": "Person" }]);
  });

  it("matches when @type is an array", () => {
    const nodes = [{ "@type": ["Person", "LocalBusiness"] }];
    expect(findByType(nodes, "Person")).toHaveLength(1);
  });
});
