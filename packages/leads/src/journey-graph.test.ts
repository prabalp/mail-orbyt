import { describe, expect, it } from "vitest";
import {
  graphNodeEdges,
  importedSequencesIn,
  parseJourneyGraph,
  renderJourneyTemplate,
  templateTokens,
} from "./journey-graph";

const GRAPH = {
  start: "intro",
  nodes: [
    {
      key: "intro",
      label: "Intro",
      subject: "Hi {{firstName}}",
      body: "About {{company}} and {{pain}}",
      x: 0,
      y: 0,
    },
    { key: "bump", label: "Bump", subject: "Bump", body: "Checking in", x: 200, y: 0 },
  ],
  edges: [
    { from: "intro", outcome: "no_reply", to: "bump", afterDays: 3 },
    { from: "bump", outcome: "no_reply", to: "END" },
  ],
  variables: { pain: { source: "fixed", value: "slow outbound" } },
};

describe("parseJourneyGraph", () => {
  it("accepts a valid graph", () => {
    expect(parseJourneyGraph(GRAPH).ok).toBe(true);
  });

  it("reports each structural problem", () => {
    const cases: [object, string][] = [
      [{ ...GRAPH, start: "nope" }, "starts with"],
      [
        { ...GRAPH, edges: [{ from: "intro", outcome: "no_reply", to: "ghost" }] },
        'unknown email "ghost"',
      ],
      [{ ...GRAPH, edges: [{ from: "x", outcome: "no_reply", to: "bump" }] }, 'unknown email "x"'],
      [
        {
          ...GRAPH,
          edges: [
            { from: "intro", outcome: "no_reply", to: "bump" },
            { from: "intro", outcome: "no_reply", to: "END" },
          ],
        },
        "two",
      ],
      [{ ...GRAPH, edges: [] }, "can't be reached"],
      [{ ...GRAPH, variables: {} }, "{{pain}} has no value"],
      [
        { ...GRAPH, nodes: [{ ...GRAPH.nodes[0], subject: "" }, GRAPH.nodes[1]] },
        "subject is empty",
      ],
    ];
    for (const [input, expected] of cases) {
      const result = parseJourneyGraph(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join("|")).toContain(expected);
    }
  });

  it("allows a cycle back to an earlier email", () => {
    const cyc = {
      ...GRAPH,
      edges: [...GRAPH.edges.slice(0, 1), { from: "bump", outcome: "no_reply", to: "intro" }],
    };
    expect(parseJourneyGraph(cyc).ok).toBe(true);
  });
});

describe("renderJourneyTemplate", () => {
  const lead = { firstName: "Jamie", company: "Acme", title: null };

  it("fills built-in tokens, fixed variables and mapped aliases", () => {
    const variables = {
      pain: { source: "fixed", value: "slow outbound" },
      name: { source: "lead", field: "firstName", fallback: "friend" },
    } as const;
    expect(renderJourneyTemplate("{{name}} at {{Company}}: {{pain}}", { ...variables }, lead)).toBe(
      "Jamie at Acme: slow outbound",
    );
  });

  it("falls back for a missing value and never leaves a raw token", () => {
    expect(renderJourneyTemplate("{{firstName}}", {}, {})).toBe("there");
    expect(renderJourneyTemplate("[{{title}}]", {}, lead)).toBe("[]");
    expect(
      renderJourneyTemplate(
        "{{role}}",
        { role: { source: "lead", field: "title", fallback: "leader" } },
        lead,
      ),
    ).toBe("leader");
  });
});

describe("helpers", () => {
  it("lists template tokens once, in order", () => {
    expect(templateTokens("{{a}} {{ b }} {{a}}")).toEqual(["a", "b"]);
  });

  it("returns a node's edges in engine shape", () => {
    const parsed = parseJourneyGraph(GRAPH);
    if (!parsed.ok) throw new Error("invalid");
    expect(graphNodeEdges(parsed.graph, "intro")).toEqual({
      no_reply: { to: "bump", afterDays: 3 },
    });
  });
});

describe("uploaded-email nodes", () => {
  const imported = {
    ...GRAPH,
    nodes: [
      { key: "intro", label: "Intro", subject: "", body: "", importedSequence: 2, x: 0, y: 0 },
      GRAPH.nodes[1],
    ],
    variables: {},
  };

  it("needs no subject or body, and skips variable checks on uploaded text", () => {
    const result = parseJourneyGraph(imported);
    expect(result.ok).toBe(true);
    if (result.ok) expect(importedSequencesIn(result.graph)).toEqual([2]);
  });

  it("rejects an out-of-range sequence number", () => {
    expect(
      parseJourneyGraph({
        ...imported,
        nodes: [{ ...imported.nodes[0], importedSequence: 0 }, GRAPH.nodes[1]],
      }).ok,
    ).toBe(false);
  });
});
