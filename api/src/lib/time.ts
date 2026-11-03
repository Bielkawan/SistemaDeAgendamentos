/** Timezone helpers. All instants are stored in UTC; studio-local wall time is derived via Intl. */

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return { year: +get("year"), month: +get("month"), day: +get("day"), hour: +get("hour"), minute: +get("minute"), second: +get("second"), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")) };
}

/** Offset (ms) of the timezone at a given instant: local - UTC. */
function offsetAt(date: Date, timeZone: string) {
  const p = partsIn(date, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
}

/** Converts a local wall time (YYYY-MM-DD + minutes since midnight) in `timeZone` to a UTC Date. DST-safe. */
export function zonedToUtc(dateKey: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offsetAt(new Date(guess), timeZone);
  const second = guess - offsetAt(new Date(first), timeZone);
  return new Date(second);
}

export function dateKeyIn(date: Date, timeZone: string): string {
  const p = partsIn(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** [start, end) UTC instants covering the local day. */
export function dayRange(dateKey: string, timeZone: string) {
  return { start: zonedToUtc(dateKey, 0, timeZone), end: zonedToUtc(addDays(dateKey, 1), 0, timeZone) };
}

/** [start, end) UTC instants covering the local month "YYYY-MM". */
export function monthRange(month: string, timeZone: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { start: zonedToUtc(`${month}-01`, 0, timeZone), end: zonedToUtc(`${next}-01`, 0, timeZone) };
}

export function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

export const minutesToMs = (m: number) => m * 60_000;
