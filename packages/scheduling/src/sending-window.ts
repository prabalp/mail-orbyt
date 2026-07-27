export interface SendingWindowConfig {
  timezone: string;
  /** 0 (Sunday) - 6 (Saturday). */
  sendingDaysOfWeek: number[];
  sendingWindowStartMinute: number;
  sendingWindowEndMinute: number;
}

const WEEKDAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Computes a date's day-of-week and minutes-since-midnight AS OBSERVED IN the given IANA timezone — the only reliable way to do timezone-aware scheduling without a date library, since Intl.DateTimeFormat already has the tz database. */
function getZonedParts(
  date: Date,
  timeZone: string,
): { dayOfWeek: number; minutesSinceMidnight: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";

  // Some locales render midnight as "24" under hour12:false.
  const hour = Number(hourStr) % 24;
  const minute = Number(minuteStr);

  return { dayOfWeek: WEEKDAY_ORDER.indexOf(weekday), minutesSinceMidnight: hour * 60 + minute };
}

export function isWithinSendingWindow(config: SendingWindowConfig, date: Date): boolean {
  const { dayOfWeek, minutesSinceMidnight } = getZonedParts(date, config.timezone);
  if (!config.sendingDaysOfWeek.includes(dayOfWeek)) return false;
  return (
    minutesSinceMidnight >= config.sendingWindowStartMinute &&
    minutesSinceMidnight < config.sendingWindowEndMinute
  );
}

const MAX_DAYS_AHEAD = 8;

/**
 * Finds the next Date (at or after `fromDate`) that falls within the
 * campaign's sending days/window. Jumps day-by-day rather than
 * minute-by-minute for efficiency; the jump to "tomorrow" is approximated
 * as +24h, which can be off by an hour across a DST transition — acceptable
 * for a scheduling granularity of days/hours, not something a caller should
 * rely on for second-level precision.
 */
export function nextSendableTime(config: SendingWindowConfig, fromDate: Date): Date {
  let candidate = fromDate;

  for (let day = 0; day < MAX_DAYS_AHEAD; day++) {
    const { dayOfWeek, minutesSinceMidnight } = getZonedParts(candidate, config.timezone);

    if (config.sendingDaysOfWeek.includes(dayOfWeek)) {
      if (minutesSinceMidnight < config.sendingWindowStartMinute) {
        return new Date(
          candidate.getTime() + (config.sendingWindowStartMinute - minutesSinceMidnight) * 60_000,
        );
      }
      if (minutesSinceMidnight < config.sendingWindowEndMinute) {
        return candidate;
      }
    }

    candidate = new Date(candidate.getTime() + (1440 - minutesSinceMidnight) * 60_000);
  }

  throw new Error(
    `No sendable time found for timezone=${config.timezone} within ${MAX_DAYS_AHEAD} days — check sendingDaysOfWeek/window configuration.`,
  );
}
