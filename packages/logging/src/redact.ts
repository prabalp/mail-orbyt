/**
 * Field names that must never appear in plaintext in structured logs.
 * Matched case-insensitively against object keys at any nesting depth.
 */
const SENSITIVE_KEY_PATTERNS: RegExp[] = [
  /password/i,
  /^token$/i,
  /accesstoken/i,
  /refreshtoken/i,
  /oauthcode/i,
  /^code$/i,
  /secret/i,
  /apikey/i,
  /authorization/i,
  /cookie/i,
  /^body$/i,
  /emailbody/i,
  /htmlbody/i,
  /plaintextbody/i,
  /sessiontoken/i,
];

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[MAX_DEPTH_EXCEEDED]";
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = isSensitiveKey(key) ? REDACTED : redact(val, depth + 1);
    }
    return result;
  }
  return value;
}
