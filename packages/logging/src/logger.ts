import { redact } from "./redact";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogContext {
  requestId?: string;
  correlationId?: string;
  jobId?: string;
  organisationId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

interface CreateLoggerOptions {
  level?: LogLevel;
  service: string;
  /** Injected for tests; defaults to process.stdout.write. */
  write?: (line: string) => void;
  /** Injected for tests; defaults to Date.now/new Date(). */
  now?: () => string;
}

function defaultWrite(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function createLogger(options: CreateLoggerOptions, bindings: LogContext = {}): Logger {
  const level = options.level ?? "info";
  const write = options.write ?? defaultWrite;
  const now = options.now ?? (() => new Date().toISOString());

  function log(logLevel: LogLevel, message: string, context: LogContext = {}): void {
    if (LEVEL_ORDER[logLevel] < LEVEL_ORDER[level]) return;
    const entry = {
      timestamp: now(),
      level: logLevel,
      service: options.service,
      message,
      ...(redact({ ...bindings, ...context }) as Record<string, unknown>),
    };
    write(JSON.stringify(entry));
  }

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, context) => log("error", message, context),
    child: (childBindings) => createLogger(options, { ...bindings, ...childBindings }),
  };
}
