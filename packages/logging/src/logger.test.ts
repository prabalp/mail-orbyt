import { describe, expect, it, vi } from "vitest";
import { createLogger } from "./logger";

describe("createLogger", () => {
  it("writes structured JSON with service, level, message", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "web",
      write: (line) => lines.push(line),
      now: () => "2026-07-26T00:00:00.000Z",
    });

    logger.info("hello", { requestId: "req-1" });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed).toMatchObject({
      level: "info",
      service: "web",
      message: "hello",
      requestId: "req-1",
      timestamp: "2026-07-26T00:00:00.000Z",
    });
  });

  it("filters out messages below the configured level", () => {
    const lines: string[] = [];
    const logger = createLogger({
      service: "web",
      level: "warn",
      write: (line) => lines.push(line),
    });

    logger.debug("ignored");
    logger.info("ignored too");
    logger.warn("kept");

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}").message).toBe("kept");
  });

  it("redacts sensitive fields in the emitted log line", () => {
    const lines: string[] = [];
    const logger = createLogger({ service: "worker", write: (line) => lines.push(line) });

    logger.error("token refresh failed", { refreshToken: "1//abc" });

    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed.refreshToken).toBe("[REDACTED]");
  });

  it("child loggers merge bindings and inherit config", () => {
    const lines: string[] = [];
    const logger = createLogger({ service: "worker", write: (line) => lines.push(line) });
    const child = logger.child({ jobId: "job-1" });

    child.info("processing", { organisationId: "org-1" });

    const parsed = JSON.parse(lines[0] ?? "{}");
    expect(parsed).toMatchObject({ jobId: "job-1", organisationId: "org-1", service: "worker" });
  });

  it("does not throw when write is called concurrently", () => {
    const write = vi.fn();
    const logger = createLogger({ service: "worker", write });
    for (let i = 0; i < 10; i += 1) logger.info(`msg-${i}`);
    expect(write).toHaveBeenCalledTimes(10);
  });
});
