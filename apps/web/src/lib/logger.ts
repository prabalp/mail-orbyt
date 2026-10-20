import { createLogger, type LogLevel } from "@mail-orbyt/logging";

const LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);

function logLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL;
  return raw && LEVELS.has(raw as LogLevel) ? (raw as LogLevel) : "info";
}

function write(line: string): void {
  if (typeof process !== "undefined" && typeof process.stdout?.write === "function") {
    process.stdout.write(`${line}\n`);
    return;
  }
  console.log(line);
}

export const logger = createLogger({ service: "web", level: logLevel(), write });
