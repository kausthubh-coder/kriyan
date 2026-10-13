// Civil dates and times. A date is "YYYY-MM-DD" in the person's own calendar, a time is
// minutes after midnight. Neither carries a time zone: "today" always comes from the
// person's zone (see `todayIn`), never from the server's UTC date.

export type CivilDate = string;
/** 0 = Monday ... 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY_MS = 86_400_000;

export function isCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = parts(value);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function parts(date: CivilDate): [year: number, month: number, day: number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))];
}

export function fromParts(year: number, month: number, day: number): CivilDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Days since 1970-01-01. */
export function toDayNumber(date: CivilDate): number {
  const [y, m, d] = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function fromDayNumber(n: number): CivilDate {
  const dt = new Date(n * DAY_MS);
  return fromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return fromDayNumber(toDayNumber(date) + days);
}

export function diffDays(a: CivilDate, b: CivilDate): number {
  return toDayNumber(a) - toDayNumber(b);
}

export function weekday(date: CivilDate): Weekday {
  // 1970-01-01 was a Thursday (3 when Monday is 0).
  return ((((toDayNumber(date) + 3) % 7) + 7) % 7) as Weekday;
}

export function startOfWeek(date: CivilDate): CivilDate {
  return addDays(date, -weekday(date));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Month arithmetic on (year, month) pairs; month is 1-12. */
export function addMonths(year: number, month: number, months: number): [number, number] {
  const index = year * 12 + (month - 1) + months;
  return [Math.floor(index / 12), (index % 12) + 1];
}

export function isLeapYear(year: number): boolean {
  return daysInMonth(year, 2) === 29;
}

/** "HH:MM" to minutes after midnight. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

export function formatClock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** The civil date and time-of-day of an instant in a time zone. */
export function zonedParts(instant: number, timeZone: string): { date: CivilDate; minutes: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(instant)).map((x) => [x.type, x.value]));
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

export function todayIn(timeZone: string, now: number = Date.now()): CivilDate {
  return zonedParts(now, timeZone).date;
}

/** The instant at which a civil date and time happen in a time zone. */
export function zonedInstant(date: CivilDate, minutes: number, timeZone: string): number {
  const [y, m, d] = parts(date);
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  // Guess with the offset at the wall time, then correct once for DST transitions.
  let guess = wall - offsetMs(wall, timeZone);
  guess = wall - offsetMs(guess, timeZone);
  return guess;
}

function offsetMs(instant: number, timeZone: string): number {
  const { date, minutes } = zonedParts(instant, timeZone);
  const [y, m, d] = parts(date);
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  return asUtc - Math.floor(instant / 60_000) * 60_000;
}
