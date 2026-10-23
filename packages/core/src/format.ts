// How dates, times, lengths, repeats and reminders read to people.
// Dates read "Tue 13 Oct" or "Today", times "14:30", lengths "1 h 30 min".

import { addDays, diffDays, formatClock, parts, weekday, type CivilDate, type Weekday } from "./dates.ts";
import type { Repeat } from "./repeat.ts";
import type { Reminder } from "./reminders.ts";

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;
export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "Tue 13 Oct", with the year only when it isn't this year. */
export function formatDate(date: CivilDate, today?: CivilDate): string {
  const [y, m, d] = parts(date);
  const base = `${WEEKDAY_SHORT[weekday(date)]} ${d} ${MONTH_SHORT[m - 1]}`;
  return today && parts(today)[0] !== y ? `${base} ${y}` : base;
}

/** "Today", "Tomorrow", "Yesterday", or "Tue 13 Oct". */
export function formatDay(date: CivilDate, today: CivilDate): string {
  const diff = diffDays(date, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return formatDate(date, today);
}

export const formatTime = formatClock;

export function formatTimeRange(start: number, length: number | undefined): string {
  return length ? `${formatClock(start)}–${formatClock(start + length)}` : formatClock(start);
}

/** "15 min", "1 h", "1 h 30 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${n}${s}`;
}

const NTH = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" } as const;

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function sameDays(a: Weekday[], b: Weekday[]): boolean {
  return a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i]);
}

/** "Every Tue and Thu, until Fri 11 Dec", "Every month on the last day", "Every 2 days after done". */
export function describeRepeat(rule: Repeat, first: CivilDate, today?: CivilDate): string {
  const n = rule.interval;
  const unit = { day: "day", week: "week", month: "month", year: "year" }[rule.freq];
  const every = n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`;
  let text: string;
  switch (rule.freq) {
    case "day":
      text = every;
      break;
    case "week": {
      const days = [...new Set(rule.weekdays ?? [weekday(first)])].sort((a, b) => a - b);
      if (n === 1 && sameDays(days, [0, 1, 2, 3, 4])) text = "Every weekday";
      else if (n === 1 && days.length === 7) text = "Every day";
      else if (n === 1) text = `Every ${joinAnd(days.map((d) => WEEKDAY_SHORT[d]))}`;
      else text = `${every} on ${joinAnd(days.map((d) => WEEKDAY_SHORT[d]))}`;
      break;
    }
    case "month": {
      const m = rule.monthly ?? { kind: "day" as const, day: parts(first)[2] };
      const on =
        m.kind === "day"
          ? `the ${ordinal(m.day)}`
          : m.kind === "last"
            ? "the last day"
            : `the ${NTH[m.n]} ${WEEKDAY_LONG[m.weekday]}`;
      text = `${every} on ${on}`;
      break;
    }
    case "year": {
      const [, mo, d] = parts(first);
      text = `${every} on ${d} ${MONTH_SHORT[mo - 1]}`;
      break;
    }
  }
  if (rule.fromCompletion) text += " after done";
  if (rule.end?.kind === "on") text += `, until ${formatDate(rule.end.date, today)}`;
  if (rule.end?.kind === "count") text += rule.end.count === 1 ? ", once" : `, ${rule.end.count} times`;
  return text;
}

/** "10 min before", "1 h before", "At the start", "Day before at 20:00", "On the day at 09:00". */
export function describeReminder(reminder: Reminder): string {
  if (reminder.kind === "before") {
    if (reminder.minutes === 0) return "At the start";
    if (reminder.minutes % 1440 === 0) {
      const days = reminder.minutes / 1440;
      return days === 1 ? "1 day before" : `${days} days before`;
    }
    return `${formatDuration(reminder.minutes)} before`;
  }
  const at = formatClock(reminder.time);
  if (reminder.offset === 0) return `On the day at ${at}`;
  if (reminder.offset === -1) return `Day before at ${at}`;
  return `${-reminder.offset} days before at ${at}`;
}

/**
 * The line under a reminder's title, said from the day it rings: "Starts at 14:30" on the
 * day, "Tomorrow at 09:00" or "Tomorrow" the evening before, "Fri 16 Oct" further ahead.
 */
export function reminderBody(
  occurrence: { date: CivilDate; time?: number | null },
  ringsOn: CivilDate,
): string {
  const day = formatDay(occurrence.date, ringsOn);
  if (occurrence.time === undefined || occurrence.time === null) return day;
  const at = formatClock(occurrence.time);
  return occurrence.date === ringsOn ? `Starts at ${at}` : `${day} at ${at}`;
}

/** The dates of the week containing `date`, Monday first. */
export function weekOf(date: CivilDate): CivilDate[] {
  const start = addDays(date, -weekday(date));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

const WD_TYPED = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const NTH_TYPED = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" } as const;

/**
 * The rule written in the quick-add grammar ("every tue and thu until dec 11"), so the repeat
 * editor's text field can show the current rule and `parseTask` reads it back unchanged.
 */
export function repeatPhrase(rule: Repeat, first: CivilDate): string {
  const n = rule.interval;
  let text: string;
  switch (rule.freq) {
    case "day":
      text = n === 1 ? "every day" : `every ${n} days`;
      break;
    case "week": {
      const days = [...new Set(rule.weekdays ?? [weekday(first)])].sort((a, b) => a - b);
      const list = joinAnd(days.map((d) => WD_TYPED[d]));
      if (n === 1 && sameDays(days, [0, 1, 2, 3, 4])) text = "every weekday";
      else if (n === 1 && sameDays(days, [5, 6])) text = "every weekend";
      else if (n === 1) text = `every ${list}`;
      else text = `every ${n} weeks on ${list}`;
      break;
    }
    case "month": {
      const m = rule.monthly;
      if (n !== 1 || !m) text = n === 1 ? "every month" : `every ${n} months`;
      else if (m.kind === "day") text = `every ${ordinal(m.day)}`;
      else if (m.kind === "last") text = "every last day";
      else text = `every ${NTH_TYPED[m.n]} ${WD_TYPED[m.weekday]}`;
      break;
    }
    case "year":
      text = n === 1 ? "every year" : `every ${n} years`;
      break;
  }
  if (rule.fromCompletion) text += " after done";
  if (rule.end?.kind === "on") {
    const [, mo, d] = parts(rule.end.date);
    text += ` until ${MONTH_SHORT[mo - 1]!.toLowerCase()} ${d}`;
  }
  if (rule.end?.kind === "count") text += ` for ${rule.end.count} times`;
  return text;
}
