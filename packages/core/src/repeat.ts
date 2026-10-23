// Repeat rules: one shape for every kind of repetition (classes on Tue and Thu, the last
// day of each month, the second Tuesday, a birthday, every 2 days after it's done).
// The web app, Android app, MCP server and CLI all read and write this shape.

import {
  addDays,
  addMonths,
  daysInMonth,
  diffDays,
  fromParts,
  isCivilDate,
  parts,
  startOfWeek,
  weekday,
  type CivilDate,
  type Weekday,
} from "./dates.ts";

export type Frequency = "day" | "week" | "month" | "year";

export type MonthlyRule =
  /** On this day of the month; 29-31 fall on the last day of shorter months. */
  | { kind: "day"; day: number }
  | { kind: "last" }
  /** The nth weekday of the month; n = -1 is the last one. */
  | { kind: "nth"; n: 1 | 2 | 3 | 4 | -1; weekday: Weekday };

export type RepeatEnd = { kind: "on"; date: CivilDate } | { kind: "count"; count: number };

export interface Repeat {
  freq: Frequency;
  /** Every `interval` days, weeks, months or years. At least 1. */
  interval: number;
  /** Weekly only. Defaults to the weekday of the first date. */
  weekdays?: Weekday[];
  /** Monthly only. Defaults to the day of the month of the first date. */
  monthly?: MonthlyRule;
  end?: RepeatEnd;
  /** Count the interval from when the task is done instead of from the schedule. */
  fromCompletion?: boolean;
}

const MAX_PERIODS = 100_000;

export function validateRepeat(rule: Repeat): string | null {
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > 999) {
    return "The interval must be a whole number from 1 to 999.";
  }
  if (rule.weekdays && rule.freq !== "week") return "Weekdays only apply to weekly repeats.";
  if (rule.weekdays && rule.weekdays.length === 0) return "Pick at least one day of the week.";
  if (rule.monthly && rule.freq !== "month") return "A day of the month only applies to monthly repeats.";
  // "After done" counts the interval from the tick, so it can't also land on chosen days.
  if (rule.fromCompletion && (rule.weekdays || rule.monthly))
    return "A repeat counted from when it's done can't also pick its days.";
  if (
    rule.monthly?.kind === "day" &&
    (!Number.isInteger(rule.monthly.day) || rule.monthly.day < 1 || rule.monthly.day > 31)
  ) {
    return "The day of the month must be from 1 to 31.";
  }
  if (rule.end?.kind === "count" && (!Number.isInteger(rule.end.count) || rule.end.count < 1)) {
    return "The number of times must be at least 1.";
  }
  if (rule.end?.kind === "on" && !isCivilDate(rule.end.date)) {
    return "The end date must be a date like 2026-12-11.";
  }
  return null;
}

/** True when two rules are the same rule, so saving one again changes nothing. */
export function sameRepeat(a: Repeat | undefined, b: Repeat | undefined): boolean {
  if (!a || !b) return a === b;
  const days = (r: Repeat) => [...new Set(r.weekdays ?? [])].sort((x, y) => x - y).join(",");
  const monthly = (m: MonthlyRule | undefined) =>
    !m ? "" : m.kind === "day" ? `day ${m.day}` : m.kind === "last" ? "last" : `nth ${m.n} ${m.weekday}`;
  const end = (e: RepeatEnd | undefined) => (!e ? "" : e.kind === "on" ? `on ${e.date}` : `count ${e.count}`);
  return (
    a.freq === b.freq &&
    a.interval === b.interval &&
    days(a) === days(b) &&
    monthly(a.monthly) === monthly(b.monthly) &&
    end(a.end) === end(b.end) &&
    Boolean(a.fromCompletion) === Boolean(b.fromCompletion)
  );
}

/** Every occurrence of `rule` started on `first`, in order, from `first` itself. */
export function* occurrences(rule: Repeat, first: CivilDate): Generator<CivilDate> {
  let emitted = 0;
  const end = rule.end;
  for (let k = 0; k < MAX_PERIODS; k++) {
    for (const date of periodDates(rule, first, k)) {
      if (date < first) continue;
      if (end?.kind === "on" && date > end.date) return;
      if (end?.kind === "count" && emitted >= end.count) return;
      emitted++;
      yield date;
    }
  }
}

/** Occurrences within [from, to], both inclusive. */
export function occurrencesBetween(
  rule: Repeat,
  first: CivilDate,
  from: CivilDate,
  to: CivilDate,
): CivilDate[] {
  const out: CivilDate[] = [];
  for (const date of occurrences(rule, first)) {
    if (date > to) break;
    if (date >= from) out.push(date);
  }
  return out;
}

/**
 * The next date a repeating task is due after it was done.
 * `current` is the occurrence that was done; `doneOn` is the person's today when they did it.
 * `timesDone` counts every time it has been done, this one included; "after done" repeats
 * need it to know when "N times" is up. Returns null when the repeat has ended.
 */
export function nextAfterDone(
  rule: Repeat,
  first: CivilDate,
  current: CivilDate,
  doneOn: CivilDate,
  timesDone?: number,
): CivilDate | null {
  if (rule.fromCompletion) {
    if (rule.end?.kind === "count" && timesDone !== undefined && timesDone >= rule.end.count) return null;
    // From the day it was done, early or late.
    const next = advance(rule, doneOn);
    if (rule.end?.kind === "on" && next > rule.end.date) return null;
    return next;
  }
  for (const date of occurrences(rule, first)) {
    if (date > current) return date;
  }
  return null;
}

/** How many occurrences, counted from `first`, come before `date`. */
export function occurrenceIndex(rule: Repeat, first: CivilDate, date: CivilDate): number {
  let i = 0;
  for (const d of occurrences(rule, first)) {
    if (d >= date) break;
    i++;
  }
  return i;
}

function advance(rule: Repeat, from: CivilDate): CivilDate {
  const [y, m, d] = parts(from);
  switch (rule.freq) {
    case "day":
      return addDays(from, rule.interval);
    case "week":
      return addDays(from, 7 * rule.interval);
    case "month": {
      const [ny, nm] = addMonths(y, m, rule.interval);
      return fromParts(ny, nm, Math.min(d, daysInMonth(ny, nm)));
    }
    case "year":
      return fromParts(y + rule.interval, m, Math.min(d, daysInMonth(y + rule.interval, m)));
  }
}

function periodDates(rule: Repeat, first: CivilDate, k: number): CivilDate[] {
  const [y, m, d] = parts(first);
  switch (rule.freq) {
    case "day":
      return [addDays(first, k * rule.interval)];
    case "week": {
      const days = [...new Set(rule.weekdays ?? [weekday(first)])].sort((a, b) => a - b);
      const weekStart = addDays(startOfWeek(first), 7 * k * rule.interval);
      return days.map((wd) => addDays(weekStart, wd));
    }
    case "month": {
      const [py, pm] = addMonths(y, m, k * rule.interval);
      return [monthDate(py, pm, rule.monthly ?? { kind: "day", day: d })];
    }
    case "year": {
      const py = y + k * rule.interval;
      return [fromParts(py, m, Math.min(d, daysInMonth(py, m)))];
    }
  }
}

export function monthDate(year: number, month: number, rule: MonthlyRule): CivilDate {
  const last = daysInMonth(year, month);
  if (rule.kind === "day") return fromParts(year, month, Math.min(rule.day, last));
  if (rule.kind === "last") return fromParts(year, month, last);
  if (rule.n === -1) {
    const lastDate = fromParts(year, month, last);
    const back = (weekday(lastDate) - rule.weekday + 7) % 7;
    return addDays(lastDate, -back);
  }
  const firstDate = fromParts(year, month, 1);
  const forward = (rule.weekday - weekday(firstDate) + 7) % 7;
  const date = addDays(firstDate, forward + 7 * (rule.n - 1));
  // A fifth week doesn't exist in every month; n is at most 4, so this never overflows.
  return date;
}

/** True when `date` is one of the rule's occurrences. */
export function isOccurrence(rule: Repeat, first: CivilDate, date: CivilDate): boolean {
  if (date < first) return false;
  if (rule.freq === "day" && !rule.end) return diffDays(date, first) % rule.interval === 0;
  for (const d of occurrences(rule, first)) {
    if (d === date) return true;
    if (d > date) return false;
  }
  return false;
}
