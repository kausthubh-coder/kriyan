// Ask, without a model: the requests people make most, understood locally and turned into a
// plan the backend applies (and logs, with Undo). Anything else goes to Claude when a key is
// set. Pure: it reads the day it's given and returns what to do, never touching data itself.

import { addDays, type CivilDate } from "./dates.ts";
import { parseClock, parseDate } from "./parse.ts";

export interface AskTask {
  id: string;
  title: string;
  date: CivilDate | null;
  /** Minutes after midnight, or null for anytime. */
  time: number | null;
  /** Minutes, or null: never invented. */
  length: number | null;
  event: boolean;
  done: boolean;
}

export interface AskContext {
  today: CivilDate;
  /** Minutes after midnight, in the person's time zone. */
  now: number;
  dayStart: number;
  dayEnd: number;
  /** Today's tasks and events, timed or not. */
  day: AskTask[];
  /** Tasks with no date. */
  inbox: AskTask[];
  /** Planned minutes finished this week, in total and by top-level space. */
  weekMinutes: number;
  bySpace: { name: string; minutes: number }[];
}

export interface Stretch {
  from: number;
  to: number;
}

export interface Placement {
  task: AskTask;
  at: number;
}

export type AskPlan =
  | { kind: "free"; stretches: Stretch[]; fits: Placement[] }
  | { kind: "move"; task: AskTask; date: CivilDate | null; time?: number | null }
  | { kind: "closeDay" }
  | { kind: "plan"; placements: Placement[]; unplaced: AskTask[] }
  | { kind: "stats"; minutes: number; space: string | null }
  | { kind: "add"; text: string }
  | { kind: "notFound"; query: string }
  | { kind: "unknown" };

/** A stretch shorter than this isn't worth offering. */
const MIN_STRETCH = 15;

/** Free stretches from now (or the day's start) to the day's end, around timed items. */
export function freeStretches(ctx: Pick<AskContext, "day" | "now" | "dayStart" | "dayEnd">): Stretch[] {
  const start = Math.max(ctx.now, ctx.dayStart);
  const busy = ctx.day
    .filter((t) => !t.done && t.time !== null && t.length)
    .map((t) => ({ from: t.time!, to: t.time! + t.length! }))
    .sort((a, b) => a.from - b.from);
  const out: Stretch[] = [];
  let cursor = start;
  for (const b of busy) {
    if (b.to <= cursor) continue;
    if (b.from > cursor && b.from - cursor >= MIN_STRETCH)
      out.push({ from: cursor, to: Math.min(b.from, ctx.dayEnd) });
    cursor = Math.max(cursor, b.to);
    if (cursor >= ctx.dayEnd) break;
  }
  if (ctx.dayEnd - cursor >= MIN_STRETCH) out.push({ from: cursor, to: ctx.dayEnd });
  return out.filter((s) => s.to - s.from >= MIN_STRETCH);
}

/**
 * Puts tasks that have a length into the free stretches, earliest first, each after the last.
 * Times snap to 5 minutes. Tasks without a length are never placed: their length isn't known.
 */
export function place(tasks: AskTask[], stretches: Stretch[]): { placed: Placement[]; unplaced: AskTask[] } {
  const free = stretches.map((s) => ({ ...s, from: Math.ceil(s.from / 5) * 5 }));
  const placed: Placement[] = [];
  const unplaced: AskTask[] = [];
  for (const task of tasks) {
    if (!task.length) {
      unplaced.push(task);
      continue;
    }
    const slot = free.find((s) => s.to - s.from >= task.length!);
    if (!slot) {
      unplaced.push(task);
      continue;
    }
    placed.push({ task, at: slot.from });
    slot.from += task.length;
  }
  return { placed, unplaced };
}

const STOP = new Set(["the", "my", "a", "an", "to", "for", "on", "of", "and", "with"]);
const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));

/** The task whose title shares the most words with `query`; today's win ties over the inbox. */
export function findTask(query: string, ctx: AskContext): AskTask | null {
  const want = words(query);
  if (!want.length) return null;
  let best: { task: AskTask; score: number } | null = null;
  for (const task of [...ctx.day.filter((t) => !t.done), ...ctx.inbox]) {
    const have = new Set(words(task.title));
    const score = want.filter((w) => have.has(w) || [...have].some((h) => h.startsWith(w))).length;
    if (score > 0 && (!best || score > best.score)) best = { task, score };
  }
  return best?.task ?? null;
}

/** Where "to …" points: a day, a time, or right after something on today's plan. */
function target(phrase: string, ctx: AskContext): { date: CivilDate | null; time?: number | null } | null {
  const p = phrase.trim().toLowerCase();
  const after = /^after\s+(.+)$/.exec(p);
  if (after) {
    const anchor = findTask(after[1]!, ctx);
    if (anchor && anchor.time !== null) return { date: ctx.today, time: anchor.time + (anchor.length ?? 0) };
    return null;
  }
  if (/^(the )?inbox$|^no date$/.test(p)) return { date: null, time: null };
  // "tomorrow at 9am": the day before "at", the time after it.
  const [dayPart = "", timePart] = p.split(/\s+at\s+/);
  const date = parseDate(dayPart, ctx.today);
  const clock = timePart !== undefined ? parseClock(timePart, true) : date ? null : parseClock(p);
  if (date) return { date, ...(clock !== null ? { time: clock } : {}) };
  if (clock !== null) return { date: ctx.today, time: clock };
  if (p === "later" || p === "next week") return { date: addDays(ctx.today, p === "later" ? 1 : 7) };
  return null;
}

export function interpretAsk(input: string, ctx: AskContext): AskPlan {
  const text = input.trim().replace(/[?.!]+$/, "");
  const t = text.toLowerCase();

  if (/\b(what (do|can) i (have )?time for|free time|when am i free|how much time do i have)\b/.test(t))
    return freeOf(ctx);

  if (
    /^(close (the|my) day|move (what'?s|everything) (left|still open|open)( today)?( to tomorrow)?)$/.test(t)
  )
    return { kind: "closeDay" };

  if (/^plan (my|the|today'?s)? ?(day|afternoon|evening|today)$/.test(t)) {
    const stretches = freeStretches(ctx);
    const todo = [...ctx.day.filter((x) => !x.done && x.time === null && !x.event), ...ctx.inbox];
    const { placed, unplaced } = place(todo, stretches);
    return { kind: "plan", placements: placed, unplaced };
  }

  const move = /^(?:move|push|shift|put|reschedule)\s+(.+?)\s+(?:to|until|till)\s+(.+)$/.exec(text);
  if (move) {
    const task = findTask(move[1]!, ctx);
    if (!task) return { kind: "notFound", query: move[1]! };
    const where = target(move[2]!, ctx);
    if (!where) return { kind: "unknown" };
    return { kind: "move", task, ...where };
  }

  const stats = /^how (much|long) (did|have) i (\w+)/.exec(t);
  if (stats) {
    const space = ctx.bySpace.find((s) => t.includes(s.name.toLowerCase())) ?? null;
    return { kind: "stats", minutes: space ? space.minutes : ctx.weekMinutes, space: space?.name ?? null };
  }

  const add = /^(?:add|new task:?|remind me to|i need to|todo:?)\s+(.+)$/i.exec(text);
  if (add) return { kind: "add", text: add[1]! };

  return { kind: "unknown" };
}

function freeOf(ctx: AskContext): AskPlan {
  const stretches = freeStretches(ctx);
  const { placed } = place(
    ctx.inbox.filter((x) => x.length),
    stretches,
  );
  return { kind: "free", stretches, fits: placed };
}
