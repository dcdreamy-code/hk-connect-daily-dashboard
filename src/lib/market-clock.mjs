export const LIVE_REFRESH_INTERVAL_MS = 60_000;

function hongKongParts(now) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Hong_Kong",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    weekday: values.weekday,
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export function hongKongDate(now = new Date()) {
  return hongKongParts(now).date;
}

export function liveMarketPhase(now = new Date()) {
  const { weekday, time } = hongKongParts(now);
  if (weekday === "Sat" || weekday === "Sun") return "closed";
  if (time >= "09:30" && time < "12:00") return "trading";
  if (time >= "12:00" && time < "13:00") return "lunch";
  if (time >= "13:00" && time < "16:10") return "trading";
  return "closed";
}

export function shouldRefreshAtClose({ now = new Date(), enabled, visible, refreshedDate }) {
  const { weekday, date, time } = hongKongParts(now);
  return Boolean(enabled)
    && Boolean(visible)
    && weekday !== "Sat"
    && weekday !== "Sun"
    && time >= "16:10"
    && time <= "16:30"
    && refreshedDate !== date;
}

export function localRefreshSlot(now = new Date()) {
  const { weekday, time } = hongKongParts(now);
  if (weekday === "Sat" || weekday === "Sun" || time < "16:30") return null;
  return time < "16:45" ? "primary" : "fallback";
}

export function dataFreshness(timestampMs, now = new Date()) {
  if (!Number.isFinite(timestampMs)) return { state: "unknown", ageSeconds: null };
  const ageSeconds = Math.max(0, Math.floor((now.getTime() - timestampMs) / 1000));
  if (ageSeconds <= 90) return { state: "fresh", ageSeconds };
  if (ageSeconds <= 300) return { state: "delayed", ageSeconds };
  return { state: "stale", ageSeconds };
}

export function shouldRefreshLive({
  now = new Date(),
  enabled,
  visible,
  lastRefreshAt,
  intervalMs = LIVE_REFRESH_INTERVAL_MS,
}) {
  return Boolean(enabled)
    && Boolean(visible)
    && liveMarketPhase(now) === "trading"
    && now.getTime() - lastRefreshAt >= intervalMs;
}
