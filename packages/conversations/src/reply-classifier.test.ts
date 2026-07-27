import { describe, expect, it } from "vitest";
import { classifyReply } from "./reply-classifier";

describe("classifyReply", () => {
  it("classifies an unsubscribe request", () => {
    expect(classifyReply("Re: quick question", "Please unsubscribe me from this list.")).toBe(
      "UNSUBSCRIBE_REQUEST",
    );
  });

  it("classifies an out-of-office auto-reply", () => {
    expect(classifyReply("Automatic reply: Out of Office", "I am currently out of office.")).toBe(
      "OUT_OF_OFFICE",
    );
  });

  it("classifies a bounce notification", () => {
    expect(
      classifyReply(
        "Delivery Status Notification (Failure)",
        "Mail delivery failed for this address.",
      ),
    ).toBe("BOUNCE");
  });

  it("classifies a clear not-interested reply", () => {
    expect(classifyReply("Re: quick question", "Thanks but not interested at this time.")).toBe(
      "NOT_INTERESTED",
    );
  });

  it("classifies a clear interested reply", () => {
    expect(classifyReply("Re: quick question", "Sounds interesting, let's schedule a call.")).toBe(
      "INTERESTED",
    );
  });

  it("returns UNCLASSIFIED for ambiguous text rather than guessing", () => {
    expect(classifyReply("Re: quick question", "Can you tell me more about pricing?")).toBe(
      "UNCLASSIFIED",
    );
  });

  it("prioritizes bounce/unsubscribe detection over a coincidental interested-sounding phrase", () => {
    expect(
      classifyReply(
        "Automatic reply",
        "I am out of office, sounds interesting though, will reply later.",
      ),
    ).toBe("OUT_OF_OFFICE");
  });
});
