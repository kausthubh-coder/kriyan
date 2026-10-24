// The day's timed items in order, with what sits between them: the now line, free stretches
// worth planning into, and the "Review today" card at the review time (b2.html `listHTML` and
// `timelineHTML`). The list and the spine both draw from this, so they always agree.

import type { TaskView } from "@/data/views";

export type DayRow =
  | { kind: "task"; key: string; at: number; task: TaskView & { time: number } }
  | { kind: "gap"; key: string; at: number; minutes: number }
  | { kind: "now"; key: string; at: number; next: TaskView | null }
  | { kind: "review"; key: string; at: number };

/** A free stretch shorter than this isn't worth offering. */
export const MIN_GAP = 30;

export function dayRows(
  items: TaskView[],
  opts: {
    /** Minutes now when the day is today, else null (no now line, every gap offered). */
    now: number | null;
    /** Free time starts no earlier than this (the person's day start). */
    dayStart?: number;
    /** Where the "Review today" card goes, or null for none. */
    reviewAt?: number | null;
  },
): DayRow[] {
  const { now, dayStart = 0, reviewAt = null } = opts;
  const timed = items
    .filter((t): t is TaskView & { time: number } => t.time !== null)
    .sort((a, b) => a.time - b.time);
  const rows: DayRow[] = [];
  // On another day every stretch can be planned; today, only what's still ahead.
  let ahead = now === null;
  let prevEnd: number | null = null;
  let reviewDone = reviewAt === null;

  const gap = (from: number, to: number) => {
    if (to - from >= MIN_GAP) rows.push({ kind: "gap", key: `gap-${from}`, at: from, minutes: to - from });
  };

  for (const t of timed) {
    if (!ahead && now !== null && t.time > now) {
      rows.push({ kind: "now", key: "now", at: now, next: t });
      ahead = true;
      prevEnd = Math.max(prevEnd ?? 0, now, dayStart);
    }
    if (!reviewDone && reviewAt !== null && t.time >= reviewAt) {
      if (ahead && prevEnd !== null && prevEnd < reviewAt) {
        gap(prevEnd, reviewAt);
        prevEnd = reviewAt;
      }
      rows.push({ kind: "review", key: "review", at: reviewAt });
      reviewDone = true;
    }
    if (ahead && prevEnd !== null) gap(prevEnd, t.time);
    rows.push({ kind: "task", key: `${t._id}:${t.date}`, at: t.time, task: t });
    const end = t.time + (t.length ?? 0);
    if (prevEnd === null || end > prevEnd) prevEnd = end;
  }
  if (!ahead && now !== null) rows.push({ kind: "now", key: "now", at: now, next: null });
  if (!reviewDone && reviewAt !== null) rows.push({ kind: "review", key: "review", at: reviewAt });
  return rows;
}
