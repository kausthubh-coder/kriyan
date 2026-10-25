// Today's rules (docs/design/v5): which items make the day's time blocks and where the free
// stretches fall, what still needs a time ("To fit in"), what a row says on its right, and the
// sentence the pull-down summary reads. The app draws these; the rules live here, once.

import { addDays, diffDays, formatClock, weekday, type CivilDate } from "./dates.ts";
import { formatDate, WEEKDAY_SHORT } from "./format.ts";
import type { SpaceColor } from "./tokens.ts";

/** How tall a block is: about 1.05 px a minute, never under 58 px so its title and line fit. */
export const BLOCK_PX_PER_MINUTE = 1.05;
export const BLOCK_MIN_HEIGHT = 58;
export function blockHeight(minutes: number): number {
  return Math.max(BLOCK_MIN_HEIGHT, Math.round(minutes * BLOCK_PX_PER_MINUTE));
}

/** "45 min", "2 h", "2 h 50": v5's lengths, as a person says them. */
export function formatSpan(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m}` : `${h} h`;
}

/** One thing on the day, whatever it came from (a task, an event, a routine, a habit). */
export interface DayItem {
  id: string;
  title: string;
  kind: "task" | "event" | "routine" | "habit";
  /** Minutes after midnight, or null for no time. */
  time: number | null;
  /** Minutes, or null when the person gave none. A routine's is its parts' lengths summed. */
  length: number | null;
  spaceId: string | null;
  /** The space's name, for "Next in CSC 316" and the grey label. */
  spaceName: string | null;
  /** The space's colour token name, or null. */
  color: SpaceColor | null;
  done: boolean;
  /** Suggested by an agent and waiting for the person. */
  proposed: boolean;
  /** A yearly date, like a birthday: it sits at the top, not in the hours. */
  yearly: boolean;
  date: CivilDate | null;
  deadline: CivilDate | null;
  dueTime: number | null;
}

export type Anchor = "wake" | "review" | "wind";

export type TimelineEntry =
  | { kind: "anchor"; anchor: Anchor; time: number }
  | { kind: "item"; item: DayItem; time: number; length: number }
  | { kind: "gap"; from: number; to: number; now: boolean };

export interface TimelineInput {
  /** Items with a time; the rest are not part of the hours. */
  items: DayItem[];
  /** Wake up. */
  dayStart: number;
  /** Wind down. */
  dayEnd: number;
  /** Where "Review today" sits; null hides it (a past day, or a day already closed). */
  reviewTime: number | null;
  /** Minutes after midnight on today, or null on any other day (no now, no hidden gaps). */
  now: number | null;
}

/** A free stretch shorter than this isn't worth a row. */
const MIN_GAP = 15;

/** Morning routines start before noon; night routines from 21:00. */
const NOON = 12 * 60;
const NIGHT = 21 * 60;

/** The order on the day: time, but a morning routine right after Wake up and a night one right before Wind down. */
function order(e: { time: number; anchor?: Anchor; routine?: "morning" | "night" }): number {
  if (e.anchor === "wake") return -2;
  if (e.routine === "morning") return -1;
  if (e.anchor === "wind") return 1e6 + 1;
  if (e.routine === "night") return 1e6;
  return e.time;
}

/**
 * The day from Wake up to Wind down: blocks for what has a length, thin rows for what doesn't,
 * the anchors, and the free stretches between them. Today, stretches already over are left out
 * and the one you're in starts now.
 */
export function timeline({ items, dayStart, dayEnd, reviewTime, now }: TimelineInput): TimelineEntry[] {
  type Entry = { time: number; anchor?: Anchor; routine?: "morning" | "night"; item?: DayItem };
  const entries: Entry[] = [
    { time: dayStart, anchor: "wake" },
    { time: dayEnd, anchor: "wind" },
    ...(reviewTime !== null ? [{ time: reviewTime, anchor: "review" as const }] : []),
    ...items
      .filter((i) => i.time !== null && !i.yearly)
      .map((item) => ({
        time: item.time!,
        item,
        ...(item.kind === "routine"
          ? item.time! < NOON
            ? { routine: "morning" as const }
            : item.time! >= NIGHT
              ? { routine: "night" as const }
              : {}
          : {}),
      })),
  ];
  entries.sort((a, b) => order(a) - order(b) || (a.item?.title ?? "").localeCompare(b.item?.title ?? ""));
  const out: TimelineEntry[] = [];
  let cursor = dayStart;
  const gap = (from: number, to: number) => {
    if (now !== null && to <= now) return;
    const inside = now !== null && now >= from && now < to;
    const start = inside ? now : from;
    if (to - start < MIN_GAP) return;
    out.push({ kind: "gap", from: start, to, now: inside });
  };
  for (const e of entries) {
    if (e.time > cursor) gap(cursor, e.time);
    if (e.anchor) {
      out.push({ kind: "anchor", anchor: e.anchor, time: e.time });
      cursor = Math.max(cursor, e.time);
      continue;
    }
    const item = e.item!;
    const length = item.length ?? 0;
    out.push({ kind: "item", item, time: e.time, length });
    cursor = Math.max(cursor, e.time + length);
  }
  return out;
}

/** Whether `now` falls inside an item with a length (the red now line, "● Now"). */
export function isLive(item: Pick<DayItem, "time" | "length">, now: number | null): boolean {
  if (now === null || item.time === null) return false;
  return now >= item.time && now < item.time + (item.length || 15);
}

/** A class (an event) a task is due during: same space, the due time inside the class. */
export function dueDuring(task: DayItem, events: DayItem[], day: CivilDate): DayItem | null {
  if (task.deadline !== day || task.dueTime === null || !task.spaceId) return null;
  return (
    events.find(
      (e) =>
        e.kind === "event" &&
        e.time !== null &&
        e.length &&
        e.spaceId === task.spaceId &&
        task.dueTime! >= e.time &&
        task.dueTime! <= e.time + e.length,
    ) ?? null
  );
}

/**
 * A time block for a space ("Work on Kriyan"): an event that is time set aside for its space's
 * work rather than a class or meeting. Until items carry that as a field, the title says it.
 */
export function isSpaceBlock(item: Pick<DayItem, "kind" | "spaceId" | "title" | "spaceName">): boolean {
  if (item.kind !== "event" || !item.spaceId) return false;
  const t = item.title.trim().toLowerCase();
  return t.startsWith("work on ") || t.startsWith("time for ") || t === item.spaceName?.toLowerCase();
}

export type EarlierWindow = "none" | "week" | "month" | "all";

/** Whether something left from `ageDays` ago still shows on Today. */
export function inEarlierWindow(ageDays: number, window: EarlierWindow): boolean {
  if (window === "all") return true;
  if (window === "week") return ageDays <= 7;
  if (window === "month") return ageDays <= 31;
  return false;
}

export interface FitChip {
  item: DayItem;
  /** "due 23:59", "due today", "3 days ago", "yesterday", "due Fri 6 Nov", "any time". */
  note: string;
}

/** How long ago a task left from earlier was meant for: its day, else its due date. */
export function ageDays(item: Pick<DayItem, "date" | "deadline">, today: CivilDate): number {
  const from = item.date ?? item.deadline;
  return from ? diffDays(today, from) : 0;
}

/** "Due Fri", "Due Fri 6 Nov": the weekday alone within a week. */
export function dueDayWord(deadline: CivilDate, day: CivilDate): string {
  const k = diffDays(deadline, day);
  return k > 0 && k < 7 ? WEEKDAY_SHORT[weekday(deadline)] : formatDate(deadline, day);
}

/**
 * "To fit in": what still needs a time. Due that day with no time yet and not due during a
 * class; left from earlier (today only, within the window); planned that day with no time.
 */
export function fitIn({
  day,
  isToday,
  due,
  untimed,
  earlier,
  events,
  window,
}: {
  day: CivilDate;
  isToday: boolean;
  /** Due that day and planned for no day (or a later one). */
  due: DayItem[];
  /** Planned that day with no time. */
  untimed: DayItem[];
  /** Planned for, or due on, an earlier day and still open. */
  earlier: DayItem[];
  /** That day's events, for "due during a class". */
  events: DayItem[];
  window: EarlierWindow;
}): FitChip[] {
  const open = (i: DayItem) => !i.done && !i.proposed && i.kind === "task" && !i.yearly;
  const dueNote = (i: DayItem) => (i.dueTime !== null ? `due ${formatClock(i.dueTime)}` : "due today");
  const dueToday = [...due, ...untimed.filter((i) => i.deadline === day)].filter(
    (i) => open(i) && !dueDuring(i, events, day),
  );
  const left = isToday
    ? earlier
        .filter((i) => open(i) && inEarlierWindow(ageDays(i, day), window))
        .sort((a, b) => ageDays(a, day) - ageDays(b, day))
    : [];
  const planned = untimed.filter((i) => open(i) && i.deadline !== day);
  const seen = new Set<string>();
  const out: FitChip[] = [];
  const push = (item: DayItem, note: string) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    out.push({ item, note });
  };
  for (const i of dueToday.sort((a, b) => (a.dueTime ?? 1e9) - (b.dueTime ?? 1e9))) push(i, dueNote(i));
  for (const i of left) {
    const k = ageDays(i, day);
    push(i, k === 1 ? "yesterday" : `${k} days ago`);
  }
  for (const i of planned) push(i, i.deadline ? `due ${dueDayWord(i.deadline, day)}` : "any time");
  return out;
}

/** The first free stretch of at least 30 minutes, from now (to the next 15) or Wake up, to Wind down. */
export function nextGap(
  items: Pick<DayItem, "time" | "length">[],
  dayStart: number,
  dayEnd: number,
  now: number | null,
): [number, number] | null {
  const busy = items
    .filter((i) => i.time !== null)
    .map((i) => [i.time!, i.time! + (i.length ?? 0)] as const)
    .sort((a, b) => a[0] - b[0]);
  let cur = Math.max(dayStart, now !== null ? Math.ceil(now / 15) * 15 : dayStart);
  for (const [a, b] of busy) {
    if (a - cur >= 30) return [cur, a];
    cur = Math.max(cur, b);
  }
  return dayEnd - cur >= 30 ? [cur, dayEnd] : null;
}

/** The lengths Fill offers for a stretch: never more than it holds, never a guess. */
export function fillLengths(room: number): number[] {
  return [30, 45, 60, 90, 120].filter((x) => x <= room);
}

/** What a list row says on its right, one fact: a time, Now, a due, how long ago, a count. */
export function rowFact(
  item: DayItem,
  { day, now, left, habit }: { day: CivilDate; now: number | null; left?: boolean; habit?: { done: number; target: number } },
): { text: string; now?: boolean } | null {
  if (item.done && item.kind !== "habit") return null;
  if (item.yearly) return null;
  if (habit) return item.done || habit.target === 7 ? null : { text: `${habit.done} of ${habit.target}` };
  if (left) {
    const k = ageDays(item, day);
    return { text: k === 1 ? "Yesterday" : `${k} days ago` };
  }
  if (item.time !== null) {
    if (isLive(item, now)) return { text: "Now", now: true };
    return {
      text: item.length
        ? `${formatClock(item.time)}–${formatClock(item.time + item.length)}`
        : formatClock(item.time),
    };
  }
  if (item.deadline) {
    if (item.deadline === day)
      return { text: item.dueTime !== null ? `Due ${formatClock(item.dueTime)}` : "Due today" };
    return { text: `Due ${dueDayWord(item.deadline, day)}` };
  }
  return null;
}

/** Whether the grey space name after a title adds anything: not when the title already says it. */
export function showsSpaceName(title: string, spaceName: string | null): boolean {
  if (!spaceName) return false;
  const squash = (s: string) => s.replace(/\s/g, "").toLowerCase();
  return !squash(title).includes(squash(spaceName));
}

/** A length inside a sentence: "an hour", "half an hour", else "1 h 30". */
function spoken(minutes: number): string {
  if (minutes === 60) return "an hour";
  if (minutes === 30) return "half an hour";
  return formatSpan(minutes);
}

export type SentencePart = { text: string; strong?: boolean };

/**
 * The pull-down summary: "Good morning. You have 2 classes, 3 things due and 2 habits today.
 * 2 from this week still open. You're free until 13:30."
 */
export function daySentence({
  now,
  classes,
  due,
  study,
  habits,
  block,
  left,
  freeUntil,
}: {
  now: number;
  classes: number;
  due: number;
  /** The day's first open study session: the test it prepares for and its length. */
  study: { test: string; length: number } | null;
  habits: number;
  /** The space of the day's first time block, like "Kriyan", and its length. */
  block: { space: string; length: number } | null;
  left: number;
  /** When the next planned thing starts; null when nothing more is planned. */
  freeUntil: number | null;
}): SentencePart[] {
  const part = now < 12 * 60 ? "Good morning." : now < 17 * 60 ? "Good afternoon." : "Good evening.";
  const bits: SentencePart[][] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (classes) bits.push([{ text: plural(classes, "class", "classes"), strong: true }]);
  if (due) bits.push([{ text: plural(due, "thing", "things") + " due", strong: true }]);
  if (study) bits.push([{ text: `${spoken(study.length)} of study`, strong: true }, { text: ` for ${study.test}` }]);
  if (habits) bits.push([{ text: plural(habits, "habit", "habits"), strong: true }]);
  if (block) bits.push([{ text: `${spoken(block.length)} on ${block.space}`, strong: true }]);
  const out: SentencePart[] = [{ text: part, strong: true }];
  if (bits.length) {
    out.push({ text: " You have " });
    bits.forEach((b, i) => {
      if (i > 0) out.push({ text: i === bits.length - 1 ? " and " : ", " });
      out.push(...b);
    });
    out.push({ text: " today." });
  } else out.push({ text: " Nothing planned today." });
  if (left) out.push({ text: " " }, { text: `${left} from this week`, strong: true }, { text: " still open." });
  if (freeUntil !== null)
    out.push({ text: " You're " }, { text: `free until ${formatClock(freeUntil)}`, strong: true }, { text: "." });
  else out.push({ text: " The rest of the day is " }, { text: "yours", strong: true }, { text: "." });
  return out;
}

/** Monday to Sunday of the week holding `date`. */
export function weekDays(date: CivilDate): CivilDate[] {
  return Array.from({ length: 7 }, (_, i) => addDays(date, i - weekday(date)));
}
