import { describe, expect, it } from "vitest";
import {
  factsFromJsonLdNodes,
  factsFromMetaTags,
  factsFromOpenGraph,
  factsFromOrganizationJsonLd,
  factsFromPersonJsonLd,
} from "./facts-from-document";

describe("factsFromPersonJsonLd", () => {
  it("maps alumniOf, worksFor, award, and knowsAbout to allowed categories", () => {
    const facts = factsFromPersonJsonLd({
      "@type": "Person",
      alumniOf: "MIT",
      worksFor: { name: "Acme Inc" },
      award: ["Top 40 Under 40"],
      knowsAbout: ["Sales enablement", "B2B SaaS"],
    });

    expect(facts).toContainEqual(
      expect.objectContaining({ category: "relevant_education", value: "MIT" }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({ category: "companies_worked_for", value: "Acme Inc" }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({ category: "awards", value: "Top 40 Under 40" }),
    );
    expect(facts).toContainEqual(
      expect.objectContaining({ category: "professional_topics", value: "Sales enablement" }),
    );
  });

  it("returns an empty array for a node with no mappable fields", () => {
    expect(factsFromPersonJsonLd({ "@type": "Person", name: "Jane" })).toEqual([]);
  });
});

describe("factsFromOrganizationJsonLd", () => {
  it("maps description and award to allowed categories", () => {
    const facts = factsFromOrganizationJsonLd({
      "@type": "Organization",
      description: "Acme makes widgets for the enterprise",
      award: "Best Workplace 2025",
    });

    expect(facts).toContainEqual(
      expect.objectContaining({ category: "company_description", extractionMethod: "JSON_LD" }),
    );
    expect(facts).toContainEqual(expect.objectContaining({ category: "awards" }));
  });
});

describe("factsFromJsonLdNodes", () => {
  it("only extracts Person nodes for LEAD subjects", () => {
    const nodes = [
      { "@type": "Organization", description: "Acme" },
      { "@type": "Person", worksFor: { name: "Acme" } },
    ];
    const facts = factsFromJsonLdNodes(nodes, "LEAD");
    expect(facts.every((f) => f.category !== "company_description")).toBe(true);
  });

  it("only extracts Organization nodes for COMPANY subjects", () => {
    const nodes = [
      { "@type": "Organization", description: "Acme" },
      { "@type": "Person", worksFor: { name: "Acme" } },
    ];
    const facts = factsFromJsonLdNodes(nodes, "COMPANY");
    expect(facts.every((f) => f.category !== "companies_worked_for")).toBe(true);
  });
});

describe("factsFromOpenGraph", () => {
  it("maps og:description to company_description for COMPANY", () => {
    const facts = factsFromOpenGraph({ "og:description": "We make widgets" }, "COMPANY");
    expect(facts).toEqual([
      expect.objectContaining({ category: "company_description", extractionMethod: "OPEN_GRAPH" }),
    ]);
  });

  it("maps og:description to professional_topics for LEAD", () => {
    const facts = factsFromOpenGraph({ "og:description": "Sales leader" }, "LEAD");
    expect(facts[0]?.category).toBe("professional_topics");
  });

  it("returns an empty array when there is no og:description", () => {
    expect(factsFromOpenGraph({}, "COMPANY")).toEqual([]);
  });
});

describe("factsFromMetaTags", () => {
  it("maps the meta description with lower confidence than JSON-LD/OG", () => {
    const facts = factsFromMetaTags({ description: "We make widgets" }, "COMPANY");
    expect(facts[0]?.confidence).toBeLessThan(0.5);
  });
});
