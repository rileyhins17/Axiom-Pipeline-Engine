export const APP_TIME_ZONE = "America/Toronto";
export const APP_TIME_ZONE_LABEL = "Eastern Time";

type DateLike = string | Date | null | undefined;

function coerceDate(value: DateLike) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatAppDateTime(
  value: DateLike,
  options?: Intl.DateTimeFormatOptions,
  fallback = "—",
) {
  const parsed = coerceDate(value);
  if (!parsed) return fallback;

  return parsed.toLocaleString("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...options,
  });
}

export function formatAppDate(
  value: DateLike,
  options?: Intl.DateTimeFormatOptions,
  fallback = "—",
) {
  const parsed = coerceDate(value);
  if (!parsed) return fallback;

  return parsed.toLocaleDateString("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "short",
    day: "numeric",
    ...options,
  });
}

export function formatAppTime(
  value: DateLike,
  options?: Intl.DateTimeFormatOptions,
  fallback = "—",
) {
  const parsed = coerceDate(value);
  if (!parsed) return fallback;

  return parsed.toLocaleTimeString("en-CA", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    ...options,
  });
}

export function formatAppClock(hour: number, minute: number) {
  const safeHour = Math.max(0, Math.min(23, Math.trunc(Number(hour) || 0)));
  const safeMinute = Math.max(0, Math.min(59, Math.trunc(Number(minute) || 0)));
  const hour12 = safeHour % 12 || 12;
  const period = safeHour < 12 ? "a.m." : "p.m.";
  return `${hour12}:${String(safeMinute).padStart(2, "0")} ${period}`;
}
