// Reminders follow their task: when the task moves or repeats, every reminder moves with it.
// A task can have any number of them.

import { addDays, zonedInstant, type CivilDate } from "./dates.ts";

export type Reminder =
  /** Minutes before the task starts. For a task with no time, before `defaultTime` on its day. */
  | { kind: "before"; minutes: number }
  /** A clock time on the task's day (offset 0) or a day before it (offset -1, -2, ...). */
  | { kind: "day"; offset: number; time: number };

/** When a task has a date but no time, "before" reminders count back from this time (09:00). */
export const DEFAULT_REMINDER_TIME = 9 * 60;

export function validateReminder(r: Reminder): string | null {
  if (r.kind === "before") {
    return Number.isInteger(r.minutes) && r.minutes >= 0 && r.minutes <= 60 * 24 * 30
      ? null
      : "A reminder can be from 0 minutes to 30 days before.";
  }
  if (!Number.isInteger(r.offset) || r.offset > 0 || r.offset < -30)
    return "A reminder can be up to 30 days before.";
  return Number.isInteger(r.time) && r.time >= 0 && r.time < 1440
    ? null
    : "The reminder time must be within the day.";
}

/** Instants (ms since epoch) at which the reminders fire for one occurrence of a task. */
export function reminderInstants(
  occurrence: { date: CivilDate; time?: number | undefined },
  reminders: Reminder[],
  timeZone: string,
): number[] {
  const start = occurrence.time ?? DEFAULT_REMINDER_TIME;
  return reminders
    .map((r) =>
      r.kind === "before"
        ? zonedInstant(occurrence.date, start, timeZone) - r.minutes * 60_000
        : zonedInstant(addDays(occurrence.date, r.offset), r.time, timeZone),
    )
    .sort((a, b) => a - b);
}

/** Two reminders that fire at the same moment for every occurrence are the same reminder. */
export function sameReminder(a: Reminder, b: Reminder): boolean {
  return a.kind === "before" && b.kind === "before"
    ? a.minutes === b.minutes
    : a.kind === "day" && b.kind === "day" && a.offset === b.offset && a.time === b.time;
}
