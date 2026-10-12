// Read models: the exact shapes the screens (and agents) read. Queries can't read the clock,
// so callers pass the person's today.

import { addDays, diffDays, weekday, type CivilDate } from "@kriyan/core/dates";
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
  repeat: Doc<"tasks">["repeat"] | null;
  repeatFirst: CivilDate | null;
  repeatText: string | null;
  reminders: Doc<"tasks">["reminders"];
  note: string | null;
  event: boolean;
  goalId: Id<"goals"> | null;
  done: boolean;
  /** True for future occurrences of a repeat, which can't be ticked off yet. */
  projected: boolean;
  proposedBy: string | null;
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
    repeat: task.repeat ?? null,
    repeatFirst: task.repeatFirst ?? null,
    repeatText: task.repeat
      ? describeRepeat(task.repeat, task.repeatFirst ?? task.date ?? date ?? "1970-01-01")
      : null,
    reminders: task.reminders,
    note: task.note ?? null,
    event: task.event,
    goalId: task.goalId ?? null,
    done: done || task.doneAt !== undefined,
    projected: Boolean(at && task.date && at > task.date),
    proposedBy: task.proposedBy ?? null,
  };
}

async function spaceMap(ctx: QueryCtx, ownerId: string) {
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
  return (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_repeatFirst", (q) => q.eq("ownerId", ownerId).gt("repeatFirst", ""))
      .take(LIMIT)
  ).filter((t) => live(t) && t.doneAt === undefined);
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
  for (const t of await datedBetween(ctx, ownerId, from, to))
    if (!t.repeat || t.doneAt !== undefined) push(t.date!, view(t, spaces));
  for (const t of await repeating(ctx, ownerId)) {
    if (!t.date || t.date > to) continue;
    // From the task's pending date onwards; earlier occurrences are either done or "from earlier".
    const start = t.date > from ? t.date : from;
    for (const d of occurrencesBetween(t.repeat!, t.repeatFirst ?? t.date, start, to))
      push(d, view(t, spaces, d));
  }
  // Repeats done earlier in the range show as done on their day.
  const done = await ctx.db
    .query("completions")
    .withIndex("by_owner_and_doneOn", (q) =>
      q.eq("ownerId", ownerId).gte("doneOn", addDays(from, -1)).lte("doneOn", addDays(to, 1)),
    )
    .take(LIMIT);
  for (const c of done) {
    if (c.date < from || c.date > to) continue;
    const task = await ctx.db.get(c.taskId);
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

export async function todayView(ctx: QueryCtx, ownerId: string, today: CivilDate) {
  const profile = await getProfile(ctx, ownerId);
  const { map, tree } = await spaceMap(ctx, ownerId);
  const day = (await plan(ctx, ownerId, today, today, map)).get(today) ?? [];
  const earlier = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId).gte("date", "0000").lt("date", today))
      .take(LIMIT)
  ).filter((t) => live(t) && t.doneAt === undefined && !t.event);
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
    earlier: earlier.map((t) => view(t, map)),
    habits: await habitViews(ctx, ownerId, today, map),
    proposals: day.filter((t) => t.proposedBy !== null).length,
    spaces: tree,
  };
}

export async function weekView(ctx: QueryCtx, ownerId: string, start: CivilDate, today: CivilDate) {
  const profile = await getProfile(ctx, ownerId);
  const { map } = await spaceMap(ctx, ownerId);
  const end = addDays(start, 6);
  const byDay = await plan(ctx, ownerId, start, end, map);
  const deadlines = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_deadline", (q) =>
        q.eq("ownerId", ownerId).gte("deadline", start).lte("deadline", end),
      )
      .take(LIMIT)
  ).filter((t) => live(t) && t.doneAt === undefined);
  const days = Array.from({ length: 7 }, (_, i) => {
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
  const undated = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId).eq("date", undefined))
      .take(LIMIT)
  ).filter((t) => live(t) && t.doneAt === undefined);
  return {
    start,
    days,
    inbox: undated.filter((t) => !t.spaceId).map((t) => view(t, map)),
    unscheduled: undated.filter((t) => t.spaceId).map((t) => view(t, map)),
    proposals: days.flatMap((d) => d.scheduled.concat(d.anytime)).filter((t) => t.proposedBy !== null).length,
  };
}

export async function inboxView(ctx: QueryCtx, ownerId: string) {
  const { map } = await spaceMap(ctx, ownerId);
  const undated = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId).eq("date", undefined))
      .take(LIMIT)
  ).filter((t) => live(t) && t.doneAt === undefined && !t.spaceId);
  return undated.sort((a, b) => b.order - a.order).map((t) => view(t, map));
}

export async function spaceView(ctx: QueryCtx, ownerId: string, spaceId: Id<"spaces">, today: CivilDate) {
  const space = owned(await ctx.db.get(spaceId), ownerId, "space");
  const { map, tree } = await spaceMap(ctx, ownerId);
  const node = map.get(spaceId);
  const tasks = (
    await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_spaceId", (q) => q.eq("ownerId", ownerId).eq("spaceId", spaceId))
      .take(LIMIT)
  ).filter((t) => live(t) && t.doneAt === undefined && t.proposedBy === undefined);
  const children = tree.filter((s) => s.parentId === spaceId);
  const childCounts = await Promise.all(
    children.map(async (c) => {
      const open = (
        await ctx.db
          .query("tasks")
          .withIndex("by_owner_and_spaceId", (q) => q.eq("ownerId", ownerId).eq("spaceId", c._id))
          .take(LIMIT)
      ).filter((t) => live(t) && t.doneAt === undefined).length;
      return { ...c, open };
    }),
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
  const mine = completions.filter((c) => c.spaceId === spaceId);
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
    goals: goals.map((g) => goalView(g, today)),
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
  if (g.dueDate) {
    const total = Math.max(1, diffDays(g.dueDate, g.startDate));
    pace = Math.min(1, Math.max(0, diffDays(today, g.startDate) / total));
  }
  return {
    _id: g._id,
    title: g.title,
    kind: g.kind,
    target: g.target,
    current: g.current,
    unit: g.unit ?? null,
    dueDate: g.dueDate ?? null,
    spaceId: g.spaceId ?? null,
    progress,
    /** Where you'd be today at a steady pace, 0 to 1; null without a due date. */
    pace,
  };
}

export async function progressView(ctx: QueryCtx, ownerId: string, today: CivilDate) {
  const { map } = await spaceMap(ctx, ownerId);
  const yearStart = addDays(today, -364);
  const completions = await ctx.db
    .query("completions")
    .withIndex("by_owner_and_doneOn", (q) =>
      q.eq("ownerId", ownerId).gte("doneOn", yearStart).lte("doneOn", today),
    )
    .take(10_000);
  const perDay = new Map<string, number>();
  // A done task with no length still counts, as 15 minutes, so the heatmap shows the day.
  for (const c of completions) perDay.set(c.doneOn, (perDay.get(c.doneOn) ?? 0) + (c.minutes || 15));
  const weekStart = addDays(today, -weekday(today));
  const bySpace = new Map<string, number>();
  for (const c of completions) {
    const root = c.spaceId ? rootOf(c.spaceId, map) : "none";
    bySpace.set(root, (bySpace.get(root) ?? 0) + (c.minutes || 15));
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
      return { date, minutes: perDay.get(date) ?? 0 };
    }),
    weekMinutes: completions.filter((c) => c.doneOn >= weekStart).reduce((s, c) => s + (c.minutes || 15), 0),
    yearMinutes: [...perDay.values()].reduce((a, b) => a + b, 0),
    bySpace: [...bySpace.entries()]
      .map(([id, minutes]) => ({
        spaceId: id === "none" ? null : id,
        name: map.get(id)?.name ?? "No space",
        color: map.get(id)?.color ?? null,
        minutes,
      }))
      .sort((a, b) => b.minutes - a.minutes),
    goals: goals.map((g) => goalView(g, today)),
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
