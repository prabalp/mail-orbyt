import { describe, expect, it, vi } from "vitest";
import { createHttpDecider } from "./journey-decider";

const CONFIG = {
  apiKey: "key",
  url: "https://decider.example/decisions",
  model: "typesafe/jev-1.14",
  minConfidence: 0.6,
  timeoutMs: 1000,
};
const INPUT = {
  state: { reply: { text: "sounds good" } },
  options: { interested: "wants to talk", not_interested: "declines" },
};

function respond(body: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => body });
}

describe("createHttpDecider", () => {
  it("sends a choice question over the supplied options plus a none-of-the-above escape", async () => {
    const fetchImpl = respond({
      outcome: { type: "choice", choice: "interested", confidence: 0.9 },
    });
    const result = await createHttpDecider(CONFIG, fetchImpl).decide(INPUT);
    expect(result).toEqual({ outcome: "interested", confidence: 0.9 });

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(CONFIG.url);
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer key");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("typesafe/jev-1.14");
    expect(body.state).toEqual(INPUT.state);
    expect(body.questions.outcome.type).toBe("choice");
    expect(Object.keys(body.questions.outcome.criteria)).toEqual([
      "interested",
      "not_interested",
      "none_of_the_above",
    ]);
  });

  it("returns null below the confidence floor", async () => {
    const fetchImpl = respond({ outcome: { choice: "interested", confidence: 0.4 } });
    expect(await createHttpDecider(CONFIG, fetchImpl).decide(INPUT)).toBeNull();
  });

  it("returns null for none_of_the_above or an option it was not given", async () => {
    for (const choice of ["none_of_the_above", "book_demo"]) {
      const fetchImpl = respond({ outcome: { choice, confidence: 0.99 } });
      expect(await createHttpDecider(CONFIG, fetchImpl).decide(INPUT)).toBeNull();
    }
  });

  it("returns null on HTTP errors, network failures and malformed bodies", async () => {
    expect(await createHttpDecider(CONFIG, respond({}, false)).decide(INPUT)).toBeNull();
    expect(
      await createHttpDecider(CONFIG, vi.fn().mockRejectedValue(new Error("boom"))).decide(INPUT),
    ).toBeNull();
    expect(await createHttpDecider(CONFIG, respond({ nope: 1 })).decide(INPUT)).toBeNull();
  });

  it("does not call the model when there are no options", async () => {
    const fetchImpl = respond({});
    expect(
      await createHttpDecider(CONFIG, fetchImpl).decide({ state: {}, options: {} }),
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
