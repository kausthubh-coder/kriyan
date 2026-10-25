// The one thing a v5 row says on the right (docs/design/v5 prototype legend): "13:30–14:45" for
// something at a time, "Due 23:59" for what's due that day, "Due Fri 6 Nov" for something planned
// before it's due, nothing otherwise. Repeats and reminders are glyphs, not words.

import { formatClock, type CivilDate } from "@kriyan/core/dates";
import { formatDate, formatTimeRange } from "@kriyan/core/format";
import type { TaskView } from "@/data/views";

export function rowMeta(t: TaskView, day: CivilDate, today: CivilDate): string | undefined {
  if (t.time !== null) return formatTimeRange(t.time, t.length ?? undefined);
  if (t.deadline === day) return t.dueTime !== null ? `Due ${formatClock(t.dueTime)}` : "Due";
  if (t.deadline && t.deadline > day) return `Due ${formatDate(t.deadline, today)}`;
  return undefined;
}
