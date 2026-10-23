// The one-sentence day at the top of Today: "Good morning, Kausthubh. You have 3 events,
// 6 tasks and 2 habits today. You're mostly free after 18:00." It comes back as parts so a
// screen can set the counts and the free time strong and the rest quiet, with a glyph per kind.

import { formatClock } from "./dates.ts";

export interface SummaryItem {
  /** Minutes after midnight, or null for anytime. */
  time: number | null;
  /** Minutes, or null when the person gave no length. */
  length: number | null;
  done: boolean;
  event: boolean;
}

export interface SummaryInput {
  name?: string | null;
  /** Minutes after midnight, in the person's time zone. */
  now: number;
  dayEnd: number;
  /** Today's items with or without a time. Done ones are left out of the counts. */
  items: SummaryItem[];
  habitsDue: number;
}

export type SummaryPart =
  { text: string; strong?: boolean } | { kind: "event" | "task" | "habit"; text: string; strong: true };

export function greeting(now: number): string {
  if (now < 12 * 60) return "Good morning";
  if (now < 18 * 60) return "Good afternoon";
  return "Good evening";
}

/**
 * When the day frees up: the earliest point (now, or the end of something planned) after which
 * what's still planned fills at most a fifth of the time left before the day ends. Joi's
 * "mostly free after 4 pm". An item with no length weighs 15 minutes here, only to count it;
 * nothing shows that number, and Kriyan never invents a length.
 * Returns "now" when the day is already light, a time, or null when it stays full to the end.
 */
export function freeAfter(items: SummaryItem[], now: number, dayEnd: number): number | "now" | null {
  const open = items.filter((i) => !i.done && i.time !== null) as (SummaryItem & { time: number })[];
  const ends = open.map((i) => i.time + (i.length ?? 0)).filter((e) => e > now);
  const candidates = [now, ...[...new Set(ends)].sort((a, b) => a - b)];
  for (const from of candidates) {
    const span = dayEnd - from;
    if (span <= 0) break;
    const load = open.reduce((sum, i) => {
      const start = Math.max(i.time, from);
      const finish = Math.min(i.time + (i.length ?? LENGTHLESS_WEIGHT), dayEnd);
      return sum + Math.max(0, finish - start);
    }, 0);
    if (load <= span * LIGHT) return from === now ? "now" : from;
  }
  return null;
}

/** A stretch counts as free when plans fill at most this share of it. */
const LIGHT = 0.2;
const LENGTHLESS_WEIGHT = 15;

/** When the last thing still planned today ends; used when the day stays full. */
export function busyUntil(items: SummaryItem[], now: number): number | null {
  let end: number | null = null;
  for (const item of items) {
    if (item.done || item.time === null) continue;
    const finish = item.time + (item.length ?? 0);
    if (finish <= now) continue;
    if (end === null || finish > end) end = finish;
  }
  return end;
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

export function daySummary(input: SummaryInput): SummaryPart[] {
  const open = input.items.filter((i) => !i.done);
  const events = open.filter((i) => i.event).length;
  const tasks = open.filter((i) => !i.event).length;
  const parts: SummaryPart[] = [];

  const name = input.name?.trim();
  parts.push({ text: `${greeting(input.now)}${name ? ", " : "."}` });
  if (name) parts.push({ text: `${name}.`, strong: true });

  const counts: SummaryPart[] = [];
  if (events) counts.push({ kind: "event", text: plural(events, "event"), strong: true });
  if (tasks) counts.push({ kind: "task", text: plural(tasks, "task"), strong: true });
  if (input.habitsDue) counts.push({ kind: "habit", text: plural(input.habitsDue, "habit"), strong: true });

  if (counts.length === 0) {
    parts.push({ text: " Nothing is planned today." });
    return parts;
  }
  parts.push({ text: " You have " });
  counts.forEach((part, i) => {
    if (i > 0) parts.push({ text: i === counts.length - 1 ? " and " : ", " });
    parts.push(part);
  });
  parts.push({ text: " today." });

  const anything = busyUntil(open, input.now) !== null;
  const free = freeAfter(open, input.now, input.dayEnd);
  if (!anything) {
    parts.push({ text: " You're " }, { text: "free", strong: true }, { text: " for the rest of the day." });
  } else if (free === "now") {
    parts.push({ text: " You're " }, { text: "mostly free", strong: true }, { text: " today." });
  } else if (free !== null) {
    parts.push(
      { text: " You're " },
      { text: "mostly free", strong: true },
      { text: ` after ${formatClock(free)}.` },
    );
  } else {
    parts.push(
      { text: " Your day is " },
      { text: "full", strong: true },
      { text: ` until ${formatClock(busyUntil(open, input.now) ?? input.dayEnd)}.` },
    );
  }
  return parts;
}

/** The sentence as plain text, for screen readers and notifications. */
export function summaryText(parts: SummaryPart[]): string {
  return parts.map((p) => p.text).join("");
}
