// Read models: the exact shapes the screens (and agents) read. Queries can't read the clock,
// so callers pass the person's today.

import { ConvexError } from "convex/values";
import { addDays, diffDays, isCivilDate, weekday, type CivilDate } from "@kriyan/core/dates";
import { describeRepeat } from "@kriyan/core/format";
import { occurrencesBetween } from "@kriyan/core/repeat";
import type { SpaceColor } from "@kriyan/core/tokens";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { getProfile, owned } from "./owner";
import { listSpaces, spaceTree, type SpaceNode } from "./spaces";

export interface TaskView {
  _id: Id<"tasks">;
  title: string;
  spaceId: Id<"spaces"> | null;
  /** The space's colour, or null for the inbox. */
  color: SpaceColor | null;
  spacePath: string | null;
  /** The date this view of the task falls on (a repeat's occurrence). */
  date: CivilDate | null;
  time: number | null;
  length: number | null;
  deadline: CivilDate | null;
  /** Minutes after midnight on the deadline when it's due. */
  dueTime: number | null;
  repeat: Doc<"tasks">["repeat"] | null;
  repeatFirst: CivilDate | null;
  repeatText: string | null;
  reminders: Doc<"tasks">["reminders"];
  /** Lists only say whether there's a note; notes run to 50,000 characters, so get_task reads one. */
  hasNote: boolean;
  /** The checklist inside the task, in order; rows say "2 of 5 steps". */
  steps: NonNullable<Doc<"tasks">["steps"]>;
  event: boolean;
  goalId: Id<"goals"> | null;
  done: boolean;
  /** True for future occurrences of a repeat, which can't be ticked off yet. */
  projected: boolean;
  proposedBy: string | null;
  /** The agent that added it, for the row's "from Codex". */
  addedBy: string | null;
  /** The agent's source id, for syncs (upsert_tasks). */
  externalId: string | null;
}

const LIMIT = 500;

function view(task: Doc<"tasks">, spaces: Map<string, SpaceNode>, at?: CivilDate, done = false): TaskView {
  const space = task.spaceId ? spaces.get(task.spaceId) : undefined;
  const date = at ?? task.date ?? null;
  return {
    _id: task._id,
    title: task.title,
    spaceId: task.spaceId ?? null,
    color: space?.color ?? null,
    spacePath: space?.path ?? null,
    date,
    time: task.time ?? null,
    length: task.length ?? null,
    deadline: task.deadline ?? null,
    dueTime: task.dueTime ?? null,
    repeat: task.repeat ?? null,
    repeatFirst: task.repeatFirst ?? null,
    repeatText: task.repeat
      ? describeRepeat(task.repeat, task.repeatFirst ?? task.date ?? date ?? "1970-01-01")
      : null,
    reminders: task.reminders,
    hasNote: Boolean(task.note),
    steps: task.steps ?? [],
    event: task.event,
    goalId: task.goalId ?? null,
    done: done || task.doneAt !== undefined,
    projected: Boolean(at && task.date && at > task.date),
    proposedBy: task.proposedBy ?? null,
    addedBy: task.addedBy ?? null,
    externalId: task.externalId ?? null,
  };
}

export type TaskStatus = "open" | "done" | "deleted";

/**
 * A task in a line, for agents' search and batch replies: enough to recognise it and act on it
 * by id, without the reminders, steps and repeat rule a full view carries.
 */
export interface TaskRow {
  taskId: Id<"tasks">;
  title: string;
  status: TaskStatus;
  spaceId: Id<"spaces"> | null;
  spacePath: string | null;
  date: CivilDate | null;
  time: number | null;
  length: number | null;
  deadline: CivilDate | null;
  dueTime: number | null;
  event: boolean;
  repeatText: string | null;
  hasNote: boolean;
  addedBy: string | null;
  proposedBy: string | null;
  externalId: string | null;
}

export function taskRow(task: Doc<"tasks">, spaces: Map<string, SpaceNode>): TaskRow {
  const space = task.spaceId ? spaces.get(task.spaceId) : undefined;
  return {
    taskId: task._id,
    title: task.title,
    status: task.deletedAt !== undefined ? "deleted" : task.doneAt !== undefined ? "done" : "open",
    spaceId: task.spaceId ?? null,
    spacePath: space?.path ?? null,
    date: task.date ?? null,
    time: task.time ?? null,
    length: task.length ?? null,
    deadline: task.deadline ?? null,
    dueTime: task.dueTime ?? null,
    event: task.event,
    repeatText: task.repeat
      ? describeRepeat(task.repeat, task.repeatFirst ?? task.date ?? "1970-01-01")
      : null,
    hasNote: Boolean(task.note),
    addedBy: task.addedBy ?? null,
    proposedBy: task.proposedBy ?? null,
    externalId: task.externalId ?? null,
  };
}

export async function spaceMap(ctx: QueryCtx, ownerId: string) {
  const tree = spaceTree(await listSpaces(ctx, ownerId));
  return { tree, map: new Map(tree.map((s) => [s._id as string, s])) };
}

const live = (t: Doc<"tasks">) => t.deletedAt === undefined;

async function datedBetween(ctx: QueryCtx, ownerId: string, from: CivilDate, to: CivilDate) {
  return (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId).gte("date", from).lte("date", to))
      .take(LIMIT)
  ).filter(live);
}

async function repeating(ctx: QueryCtx, ownerId: string) {
  return await ctx.db
    .query("tasks")
    .withIndex("by_owner_and_deletedAt_and_doneAt_and_repeatFirst", (q) =>
      q.eq("ownerId", ownerId).eq("deletedAt", undefined).eq("doneAt", undefined).gt("repeatFirst", ""),
    )
    .take(LIMIT);
}

/** Open tasks with no date, oldest first: the Inbox and the week's tray. Past the limit, the newest stay. */
async function openUndated(ctx: QueryCtx, ownerId: string) {
  const newest = await ctx.db
    .query("tasks")
    .withIndex("by_owner_and_deletedAt_and_doneAt_and_date", (q) =>
      q.eq("ownerId", ownerId).eq("deletedAt", undefined).eq("doneAt", undefined).eq("date", undefined),
    )
    .order("desc")
    .take(LIMIT);
  return newest.reverse();
}

/** Open tasks in one space. */
async function openInSpace(ctx: QueryCtx, ownerId: string, spaceId: Id<"spaces">) {
  return await ctx.db
    .query("tasks")
    .withIndex("by_owner_and_spaceId_and_deletedAt_and_doneAt", (q) =>
      q.eq("ownerId", ownerId).eq("spaceId", spaceId).eq("deletedAt", undefined).eq("doneAt", undefined),
    )
    .take(LIMIT);
}

/** Every task falling on each day of [from, to], with repeats projected forward. */
async function plan(
  ctx: QueryCtx,
  ownerId: string,
  from: CivilDate,
  to: CivilDate,
  spaces: Map<string, SpaceNode>,
) {
  const byDay = new Map<CivilDate, TaskView[]>();
  const push = (d: CivilDate, t: TaskView) => byDay.set(d, [...(byDay.get(d) ?? []), t]);
  // A finished repeat's last date shows through its completion, below, like the others.
  for (const t of await datedBetween(ctx, ownerId, from, to)) if (!t.repeat) push(t.date!, view(t, spaces));
  for (const t of await repeating(ctx, ownerId)) {
    if (!t.date || t.date > to) continue;
    // The pending date shows even when it was moved off the rule's usual days; later
    // occurrences follow the rule. Earlier ones are either done or "from earlier".
    if (t.date >= from) push(t.date, view(t, spaces, t.date));
    const after = t.date >= from ? t.date : from;
    for (const d of occurrencesBetween(t.repeat!, t.repeatFirst ?? t.date, after, to)) {
      if (d > t.date) push(d, view(t, spaces, d));
    }
  }
  // Repeats done in the range show as done on their own day, however late they were ticked.
  const done = await ctx.db
    .query("completions")
    .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId).gte("date", from).lte("date", to))
    .take(LIMIT);
  const tasks = new Map<Id<"tasks">, Doc<"tasks"> | null>();
  for (const c of done) {
    if (!tasks.has(c.taskId)) tasks.set(c.taskId, await ctx.db.get(c.taskId));
    const task = tasks.get(c.taskId);
    if (!task || !live(task) || !task.repeat) continue;
    push(c.date, view(task, spaces, c.date, true));
  }
  const sort = (a: TaskView, b: TaskView) =>
    (a.time ?? 1e9) - (b.time ?? 1e9) || a.title.localeCompare(b.title);
  for (const list of byDay.values()) list.sort(sort);
  return byDay;
}

export interface HabitView {
  _id: Id<"habits">;
  title: string;
  color: SpaceColor | null;
  target: number;
  doneToday: boolean;
  thisWeek: number;
}

async function habitViews(
  ctx: QueryCtx,
  ownerId: string,
  today: CivilDate,
  spaces: Map<string, SpaceNode>,
): Promise<HabitView[]> {
  const habits = (
    await ctx.db
      .query("habits")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(100)
  ).filter((h) => h.archivedAt === undefined);
  const weekStart = addDays(today, -weekday(today));
  const checks = await ctx.db
    .query("habitChecks")
    .withIndex("by_owner_and_date", (q) =>
      q.eq("ownerId", ownerId).gte("date", weekStart).lte("date", addDays(weekStart, 6)),
    )
    .take(1000);
  return habits
    .sort((a, b) => a.order - b.order)
    .map((h) => ({
      _id: h._id,
      title: h.title,
      color: h.spaceId ? (spaces.get(h.spaceId)?.color ?? null) : null,
      target: h.target,
      doneToday: checks.some((c) => c.habitId === h._id && c.date === today),
      thisWeek: checks.filter((c) => c.habitId === h._id).length,
    }));
}

/** Dates come from callers (an agent's "date", the app's today): refuse anything that isn't one. */
function civil(value: string, what: string): CivilDate {
  if (!isCivilDate(value)) throw new ConvexError(`The ${what} must look like 2026-10-13.`);
  return value;
}

export async function todayView(ctx: QueryCtx, ownerId: string, today: CivilDate) {
  civil(today, "date");
  const profile = await getProfile(ctx, ownerId);
  const { map, tree } = await spaceMap(ctx, ownerId);
  const day = (await plan(ctx, ownerId, today, today, map)).get(today) ?? [];
  const earlier = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_deletedAt_and_doneAt_and_date", (q) =>
        q
          .eq("ownerId", ownerId)
          .eq("deletedAt", undefined)
          .eq("doneAt", undefined)
          .gte("date", "0000")
          .lt("date", today),
      )
      .take(LIMIT)
  ).filter((t) => !t.event);
  // Due on an earlier day and planned for none: without this it showed nowhere on Today.
  const missed = (await openUndated(ctx, ownerId)).filter(
    (t) => !t.event && t.proposedBy === undefined && t.deadline !== undefined && t.deadline < today,
  );
  // Due today but planned for no day, or a later one: today's list is where they belong.
  const due = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_deadline", (q) => q.eq("ownerId", ownerId).eq("deadline", today))
      .take(LIMIT)
  ).filter(
    (t) =>
      live(t) &&
      t.doneAt === undefined &&
      t.proposedBy === undefined &&
      (t.date === undefined || t.date > today),
  );
  return {
    date: today,
    profile: {
      timeZone: profile.timeZone,
      dayStart: profile.dayStart,
      dayEnd: profile.dayEnd,
      dailyCapacity: profile.dailyCapacity,
    },
    scheduled: day.filter((t) => t.time !== null),
    anytime: day.filter((t) => t.time === null && !t.done),
    done: day.filter((t) => t.time === null && t.done),
    due: due.map((t) => view(t, map)),
    earlier: [...earlier, ...missed].map((t) => view(t, map)),
    habits: await habitViews(ctx, ownerId, today, map),
    proposals: day.filter((t) => t.proposedBy !== null).length,
    spaces: tree,
  };
}

/** Each day from start to end, as the week shows them: blocks, anytime tasks, deadlines and load. */
async function days(
  ctx: QueryCtx,
  ownerId: string,
  start: CivilDate,
  end: CivilDate,
  today: CivilDate,
  map: Map<string, SpaceNode>,
) {
  const profile = await getProfile(ctx, ownerId);
  const byDay = await plan(ctx, ownerId, start, end, map);
  const deadlines = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_deadline", (q) =>
        q.eq("ownerId", ownerId).gte("deadline", start).lte("deadline", end),
      )
      .take(LIMIT)
  )
    .filter((t) => live(t) && t.doneAt === undefined)
    // What's due first comes first; a deadline with no time keeps its place after the timed ones.
    .sort((a, b) => (a.dueTime ?? 1e9) - (b.dueTime ?? 1e9));
  return Array.from({ length: diffDays(end, start) + 1 }, (_, i) => {
    const date = addDays(start, i);
    const items = byDay.get(date) ?? [];
    return {
      date,
      isToday: date === today,
      scheduled: items.filter((t) => t.time !== null),
      anytime: items.filter((t) => t.time === null),
      deadlines: deadlines.filter((t) => t.deadline === date).map((t) => view(t, map)),
      plannedMinutes: items.filter((t) => !t.event).reduce((sum, t) => sum + (t.length ?? 0), 0),
      capacity: profile.dailyCapacity,
    };
  });
}

export async function weekView(ctx: QueryCtx, ownerId: string, start: CivilDate, today: CivilDate) {
  civil(start, "start");
  civil(today, "date");
  const { map } = await spaceMap(ctx, ownerId);
  const week = await days(ctx, ownerId, start, addDays(start, 6), today, map);
  const undated = await openUndated(ctx, ownerId);
  return {
    start,
    days: week,
    inbox: undated.filter((t) => !t.spaceId).map((t) => view(t, map)),
    unscheduled: undated.filter((t) => t.spaceId).map((t) => view(t, map)),
    proposals: week.flatMap((d) => d.scheduled.concat(d.anytime)).filter((t) => t.proposedBy !== null).length,
  };
}

export const MAX_RANGE_DAYS = 62;

/** Any run of days up to 62 (a month or two), each as the week shows it. */
export async function rangeView(
  ctx: QueryCtx,
  ownerId: string,
  start: CivilDate,
  end: CivilDate,
  today: CivilDate,
) {
  civil(start, "start");
  civil(end, "end");
  civil(today, "date");
  if (end < start) throw new ConvexError("The end must be on or after the start.");
  if (diffDays(end, start) + 1 > MAX_RANGE_DAYS)
    throw new ConvexError(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`);
  const { map } = await spaceMap(ctx, ownerId);
  const list = await days(ctx, ownerId, start, end, today, map);
  return {
    start,
    end,
    days: list,
    proposals: list.flatMap((d) => d.scheduled.concat(d.anytime)).filter((t) => t.proposedBy !== null).length,
  };
}

/** One task as the lists show it, note included: what an agent reads back after a write. */
export async function oneTask(
  ctx: QueryCtx,
  ownerId: string,
  id: Id<"tasks">,
): Promise<TaskView & { note: string | null }> {
  const task = owned(await ctx.db.get(id), ownerId, "task");
  if (task.deletedAt !== undefined)
    throw new ConvexError("That task is deleted; restore_task brings it back.");
  const { map } = await spaceMap(ctx, ownerId);
  return { ...view(task, map), note: task.note ?? null };
}

/** The person's open goals, for the task editor's Goal field, without Progress's year of history. */
export async function goalsList(ctx: QueryCtx, ownerId: string, today: CivilDate) {
  civil(today, "date");
  const goals = await ctx.db
    .query("goals")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(200);
  return await goalViews(
    ctx,
    ownerId,
    goals.filter((g) => g.archivedAt === undefined),
    today,
  );
}

/** Deleted tasks, newest first. They stay until maintenance.emptyTrash removes them after 30 days. */
export async function trashView(ctx: QueryCtx, ownerId: string) {
  const { map } = await spaceMap(ctx, ownerId);
  const deleted = await ctx.db
    .query("tasks")
    .withIndex("by_owner_and_deletedAt_and_doneAt_and_date", (q) =>
      q.eq("ownerId", ownerId).gt("deletedAt", 0),
    )
    .order("desc")
    .take(LIMIT);
  return deleted.map((t) => {
    const space = t.spaceId ? map.get(t.spaceId) : undefined;
    return {
      _id: t._id,
      title: t.title,
      deletedAt: t.deletedAt ?? 0,
      date: t.date ?? null,
      time: t.time ?? null,
      repeatText: t.repeat ? describeRepeat(t.repeat, t.repeatFirst ?? t.date ?? "1970-01-01") : null,
      color: space?.color ?? null,
      spacePath: space?.path ?? null,
    };
  });
}

export async function inboxView(ctx: QueryCtx, ownerId: string) {
  const { map } = await spaceMap(ctx, ownerId);
  const undated = (await openUndated(ctx, ownerId)).filter((t) => !t.spaceId);
  return undated.sort((a, b) => b.order - a.order).map((t) => view(t, map));
}

/** Every space inside this one, at any depth. `tree` lists parents before their children. */
export function descendants(spaceId: Id<"spaces">, tree: SpaceNode[]): Id<"spaces">[] {
  const found = new Set<string>([spaceId]);
  const out: Id<"spaces">[] = [];
  for (const s of tree)
    if (s.parentId && found.has(s.parentId)) {
      found.add(s._id);
      out.push(s._id);
    }
  return out;
}

export async function spaceView(ctx: QueryCtx, ownerId: string, spaceId: Id<"spaces">, today: CivilDate) {
  civil(today, "date");
  const space = owned(await ctx.db.get(spaceId), ownerId, "space");
  const { map, tree } = await spaceMap(ctx, ownerId);
  const node = map.get(spaceId);
  // A parent space holds what its spaces hold: Work lists and counts Kriyan's tasks too, so a
  // space with everything in its children never looks empty.
  const subtree = (id: Id<"spaces">) => [id, ...descendants(id, tree)];
  const openIn = async (ids: Id<"spaces">[]) =>
    (await Promise.all(ids.map((id) => openInSpace(ctx, ownerId, id))))
      .flat()
      .filter((t) => t.proposedBy === undefined);
  const inside = new Set<string>(subtree(spaceId));
  const tasks = await openIn([...inside] as Id<"spaces">[]);
  const children = tree.filter((s) => s.parentId === spaceId);
  const childCounts = await Promise.all(
    children.map(async (c) => ({ ...c, open: (await openIn(subtree(c._id))).length })),
  );
  const monthStart = `${today.slice(0, 8)}01`;
  const weekStart = addDays(today, -weekday(today));
  const completions = await ctx.db
    .query("completions")
    .withIndex("by_owner_and_doneOn", (q) =>
      q
        .eq("ownerId", ownerId)
        .gte("doneOn", monthStart < weekStart ? monthStart : weekStart)
        .lte("doneOn", today),
    )
    .take(2000);
  const mine = completions.filter((c) => c.spaceId !== undefined && inside.has(c.spaceId));
  const goals = (
    await ctx.db
      .query("goals")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(200)
  ).filter((g) => g.spaceId === spaceId && g.archivedAt === undefined);
  const dated = tasks
    .filter((t) => t.date)
    .sort((a, b) => a.date!.localeCompare(b.date!) || (a.time ?? 1e9) - (b.time ?? 1e9));
  return {
    space: {
      _id: space._id,
      name: space.name,
      color: space.color,
      note: space.note ?? "",
      path: node?.path ?? space.name,
      parentId: space.parentId ?? null,
    },
    breadcrumb: ancestors(spaceId, map),
    next: dated.map((t) => view(t, map)),
    later: tasks.filter((t) => !t.date).map((t) => view(t, map)),
    children: childCounts,
    goals: await goalViews(ctx, ownerId, goals, today),
    stats: {
      open: tasks.length,
      doneThisMonth: mine.filter((c) => c.doneOn >= monthStart).length,
      minutesThisWeek: mine.filter((c) => c.doneOn >= weekStart).reduce((s, c) => s + c.minutes, 0),
    },
  };
}

export function goalView(g: Doc<"goals">, today: CivilDate) {
  const progress = g.target > 0 ? Math.min(1, g.current / g.target) : 0;
  let pace: number | null = null;
  const total = g.dueDate ? Math.max(1, diffDays(g.dueDate, g.startDate)) : 0;
  const age = diffDays(today, g.startDate);
  // A goal starts with whatever progress it already had, so in its first days that head start
  // would read as far ahead of a pace that has barely begun: no pace until it has run a week,
  // or a quarter of its span when that's shorter.
  if (g.dueDate && age >= Math.min(7, Math.ceil(total / 4))) pace = Math.min(1, Math.max(0, age / total));
  return {
    _id: g._id,
    title: g.title,
    why: g.why ?? null,
    kind: g.kind,
    target: g.target,
    current: g.current,
    unit: g.unit ?? null,
    dueDate: g.dueDate ?? null,
    spaceId: g.spaceId ?? null,
    progress,
    /** Where you'd be today at a steady pace, 0 to 1; null without a due date or in its first days. */
    pace,
  };
}

/**
 * Goals as Progress, a space and the task editor show them, each with its next step: the soonest open
 * task linked to it (by date, then time; undated ones after), or null when none is.
 */
async function goalViews(ctx: QueryCtx, ownerId: string, goals: Doc<"goals">[], today: CivilDate) {
  if (goals.length === 0) return [];
  const open = await ctx.db
    .query("tasks")
    .withIndex("by_owner_and_deletedAt_and_doneAt_and_date", (q) =>
      q.eq("ownerId", ownerId).eq("deletedAt", undefined).eq("doneAt", undefined),
    )
    .take(LIMIT * 4);
  const linked = open
    .filter((t) => t.goalId !== undefined && t.proposedBy === undefined)
    .sort(
      (a, b) =>
        (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
        (a.time ?? 1e9) - (b.time ?? 1e9) ||
        a._creationTime - b._creationTime,
    );
  const next = new Map<string, { _id: Id<"tasks">; title: string }>();
  for (const t of linked) if (!next.has(t.goalId!)) next.set(t.goalId!, { _id: t._id, title: t.title });
  return goals.map((g) => ({ ...goalView(g, today), next: next.get(g._id) ?? null }));
}

export async function progressView(ctx: QueryCtx, ownerId: string, today: CivilDate) {
  civil(today, "date");
  const { map } = await spaceMap(ctx, ownerId);
  const yearStart = addDays(today, -364);
  const completions = await ctx.db
    .query("completions")
    .withIndex("by_owner_and_doneOn", (q) =>
      q.eq("ownerId", ownerId).gte("doneOn", yearStart).lte("doneOn", today),
    )
    .take(10_000);
  // Only real minutes count: a task done without a length adds to the day's count of tasks
  // done, never to its time, because Kriyan never invents a task's length.
  const perDay = new Map<string, { minutes: number; done: number }>();
  for (const c of completions) {
    const day = perDay.get(c.doneOn) ?? { minutes: 0, done: 0 };
    perDay.set(c.doneOn, { minutes: day.minutes + (c.minutes ?? 0), done: day.done + 1 });
  }
  const weekStart = addDays(today, -weekday(today));
  const bySpace = new Map<string, number>();
  for (const c of completions) {
    if (!c.minutes) continue;
    const root = c.spaceId ? rootOf(c.spaceId, map) : "none";
    bySpace.set(root, (bySpace.get(root) ?? 0) + c.minutes);
  }
  const goals = (
    await ctx.db
      .query("goals")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(200)
  ).filter((g) => g.archivedAt === undefined);
  const habits = await habitViews(ctx, ownerId, today, map);
  const habitChecks = await ctx.db
    .query("habitChecks")
    .withIndex("by_owner_and_date", (q) =>
      q.eq("ownerId", ownerId).gte("date", addDays(today, -181)).lte("date", today),
    )
    .take(10_000);
  return {
    today,
    heat: Array.from({ length: 365 }, (_, i) => {
      const date = addDays(yearStart, i);
      const day = perDay.get(date);
      /** `done` counts tasks finished that day, with or without a length. */
      return { date, minutes: day?.minutes ?? 0, done: day?.done ?? 0 };
    }),
    weekMinutes: completions.filter((c) => c.doneOn >= weekStart).reduce((s, c) => s + (c.minutes ?? 0), 0),
    weekDone: completions.filter((c) => c.doneOn >= weekStart).length,
    yearMinutes: [...perDay.values()].reduce((a, b) => a + b.minutes, 0),
    yearDone: completions.length,
    bySpace: [...bySpace.entries()]
      .map(([id, minutes]) => ({
        spaceId: id === "none" ? null : id,
        name: map.get(id)?.name ?? "No space",
        color: map.get(id)?.color ?? null,
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes),
    goals: await goalViews(ctx, ownerId, goals, today),
    habits: habits.map((h) => ({
      ...h,
      days: Array.from({ length: 182 }, (_, i) => {
        const date = addDays(today, i - 181);
        return { date, done: habitChecks.some((c) => c.habitId === h._id && c.date === date) };
      }),
    })),
  };
}

/** Parents of a space, outermost first. */
function ancestors(spaceId: string, map: Map<string, SpaceNode>): SpaceNode[] {
  const out: SpaceNode[] = [];
  let node = map.get(spaceId);
  while (node?.parentId && map.get(node.parentId)) {
    node = map.get(node.parentId)!;
    out.unshift(node);
  }
  return out;
}

function rootOf(spaceId: string, map: Map<string, SpaceNode>): string {
  let node = map.get(spaceId);
  while (node?.parentId && map.get(node.parentId)) node = map.get(node.parentId);
  return node?._id ?? spaceId;
}
