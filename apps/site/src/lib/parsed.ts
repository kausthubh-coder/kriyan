// What a quick-add sentence was read as, in the words the app uses. Shared by the landing page demo
// and the quick-add docs, so both show exactly what @kriyan/core/parse returns.

import type { ParsedTask } from "@kriyan/core/parse";
import { describeReminder, describeRepeat, formatDay, formatDuration, formatTime } from "@kriyan/core/format";

export interface ParsedPart {
  label: string;
  value: string;
}

export function describeParsed(parsed: ParsedTask, today: string): ParsedPart[] {
  const parts: ParsedPart[] = [];
  if (parsed.spaceName) parts.push({ label: "Space", value: parsed.spaceName });
  if (parsed.date) parts.push({ label: "Date", value: formatDay(parsed.date, today) });
  if (parsed.time !== undefined) parts.push({ label: "Time", value: formatTime(parsed.time) });
  if (parsed.length !== undefined) parts.push({ label: "Length", value: formatDuration(parsed.length) });
  if (parsed.repeat && parsed.date)
    parts.push({ label: "Repeats", value: describeRepeat(parsed.repeat, parsed.date, today) });
  for (const reminder of parsed.reminders) parts.push({ label: "Reminder", value: describeReminder(reminder) });
  if (parsed.deadline) parts.push({ label: "Due", value: formatDay(parsed.deadline, today) });
  return parts;
}
