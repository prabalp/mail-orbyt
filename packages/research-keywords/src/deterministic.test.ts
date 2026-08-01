import { describe, expect, it } from "vitest";
import { extractKeywordsDeterministic } from "./deterministic";

describe("extractKeywordsDeterministic", () => {
  it("ranks repeated meaningful terms above stopwords and one-off words", () => {
    const text =
      "Acme Robotics builds robotics automation software. Our robotics platform " +
      "helps manufacturers automate robotics workflows with a friendly robotics team.";

    const result = extractKeywordsDeterministic(text);
    const keywords = result.map((r) => r.keyword);

    expect(keywords[0]).toBe("robotics");
    expect(keywords).not.toContain("the");
    expect(keywords).not.toContain("and");
  });

  it("scores the most frequent keyword at 1 and others relative to it", () => {
    const result = extractKeywordsDeterministic("apple apple apple banana banana cherry");
    expect(result[0]).toEqual({ keyword: "apple", score: 1 });
    expect(result[1].score).toBeCloseTo(2 / 3);
    expect(result[2].score).toBeCloseTo(1 / 3);
  });

  it("respects maxKeywords", () => {
    const text = "alpha beta gamma delta epsilon zeta eta theta";
    const result = extractKeywordsDeterministic(text, { maxKeywords: 3 });
    expect(result).toHaveLength(3);
  });

  it("returns an empty list for text with no meaningful tokens", () => {
    expect(extractKeywordsDeterministic("the a an of to")).toEqual([]);
  });
});
