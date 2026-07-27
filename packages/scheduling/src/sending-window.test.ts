import { describe, expect, it } from "vitest";
import { isWithinSendingWindow, nextSendableTime } from "./sending-window";

const WEEKDAY_CONFIG = {
  timezone: "America/New_York",
  sendingDaysOfWeek: [1, 2, 3, 4, 5],
  sendingWindowStartMinute: 540, // 09:00
  sendingWindowEndMinute: 1020, // 17:00
};

describe("isWithinSendingWindow", () => {
  it("returns true for a weekday within the window", () => {
    // 2026-07-27 is a Monday. 14:00 UTC = 10:00 America/New_York (EDT, UTC-4).
    const date = new Date("2026-07-27T14:00:00Z");
    expect(isWithinSendingWindow(WEEKDAY_CONFIG, date)).toBe(true);
  });

  it("returns false before the window opens", () => {
    // 11:00 UTC = 07:00 America/New_York.
    const date = new Date("2026-07-27T11:00:00Z");
    expect(isWithinSendingWindow(WEEKDAY_CONFIG, date)).toBe(false);
  });

  it("returns false after the window closes", () => {
    // 22:00 UTC = 18:00 America/New_York.
    const date = new Date("2026-07-27T22:00:00Z");
    expect(isWithinSendingWindow(WEEKDAY_CONFIG, date)).toBe(false);
  });

  it("returns false on a weekend even during window hours", () => {
    // 2026-08-01 is a Saturday. 14:00 UTC = 10:00 America/New_York.
    const date = new Date("2026-08-01T14:00:00Z");
    expect(isWithinSendingWindow(WEEKDAY_CONFIG, date)).toBe(false);
  });
});

describe("nextSendableTime", () => {
  it("returns the same time when already inside the window", () => {
    const date = new Date("2026-07-27T14:00:00Z");
    const result = nextSendableTime(WEEKDAY_CONFIG, date);
    expect(result.getTime()).toBe(date.getTime());
  });

  it("jumps forward to the window start on the same day when too early", () => {
    const date = new Date("2026-07-27T11:00:00Z"); // 07:00 America/New_York
    const result = nextSendableTime(WEEKDAY_CONFIG, date);
    expect(isWithinSendingWindow(WEEKDAY_CONFIG, result)).toBe(true);
    // Should have moved forward, not backward.
    expect(result.getTime()).toBeGreaterThan(date.getTime());
  });

  it("jumps to the next weekday's window when scheduled on a weekend", () => {
    const saturday = new Date("2026-08-01T14:00:00Z");
    const result = nextSendableTime(WEEKDAY_CONFIG, saturday);
    expect(isWithinSendingWindow(WEEKDAY_CONFIG, result)).toBe(true);
    expect(result.getTime()).toBeGreaterThan(saturday.getTime());
  });

  it("jumps to the next day when past today's window close", () => {
    const lateMonday = new Date("2026-07-27T22:00:00Z"); // 18:00 America/New_York
    const result = nextSendableTime(WEEKDAY_CONFIG, lateMonday);
    expect(isWithinSendingWindow(WEEKDAY_CONFIG, result)).toBe(true);
    expect(result.getTime()).toBeGreaterThan(lateMonday.getTime());
  });
});
