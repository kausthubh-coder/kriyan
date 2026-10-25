// Routines: one block made of small parts (Brush teeth 5 min, Gym 45 min on Mon/Wed/Fri/Sat).
// A part can be a habit; ticking the part checks the habit, so it still counts toward the
// habit's weekly target and its goal. Every routine rule lives here.

import { ConvexError } from "convex/values";
import { addDays, isCivilDate, weekday, type CivilDate } from "@kriyan/core/dates";
import type { SpaceColor } from "@kriyan/core/tokens";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { owned } from "./owner";
import { checkHabit } from "./progress";

export interface RoutinePart {
  title: string;
  /** Minutes. Optional, never invented. */
  length?: number;
  habitId?: Id<"habits">;
  /** The weekdays it runs on, 0 Monday to 6 Sunday; unset is every day. */
  weekdays?: number[];
}

export interface RoutineFields {
  title: string;
  spaceId?: Id<"spaces">;
  /** Minutes after midnight. */
  time: number;
  parts: RoutinePart[];
}

export interface RoutinePartView {
  /** The part's place in the routine, which ticks are keyed by. */
  index: number;
  title: string;
  length: number | null;
  habitId: Id<"habits"> | null;
  done: boolean;
}

export interface RoutineView {
  _id: Id<"routines">;
  title: string;
  color: SpaceColor | null;
  spaceId: Id<"spaces"> | null;
  time: number;
  /** The day's parts' lengths added up; parts with no length add nothing. */
  length: number;
  parts: RoutinePartView[];
  /** Days in a row it was all done, today counted once it is. */
  streak: number;
  done: boolean;
}

const MAX_PARTS = 30;
/** How far back a streak is counted. */
const STREAK_DAYS = 366;

/** The parts that run on `date`, each with its index in the routine. */
export function partsOn(routine: Pick<Doc<"routines">, "parts">, date: CivilDate) {
  const day = weekday(date);
  return routine.parts
    .map((part, index) => ({ ...part, index }))
    .filter((part) => !part.weekdays || part.weekdays.includes(day));
}

function title(value: string, what: string): string {
  const t = value.trim();
  if (!t) throw new ConvexError(`Give the ${what} a title.`);
  if (t.length > 200) throw new ConvexError(`Keep the ${what} title under 200 characters.`);
  return t;
}

/** Checks a routine's parts and returns them as they're saved. */
async function cleanParts(
  ctx: MutationCtx,
  ownerId: string,
  parts: RoutinePart[],
  self?: Id<"routines">,
): Promise<RoutinePart[]> {
  if (parts.length === 0) throw new ConvexError("A routine needs at least one part.");
  if (parts.length > MAX_PARTS) throw new ConvexError(`A routine can have up to ${MAX_PARTS} parts.`);
  const habits = new Set<string>();
  const others = (await liveRoutines(ctx, ownerId)).filter((r) => r._id !== self);
  const out: RoutinePart[] = [];
  for (const part of parts) {
    if (
      part.length !== undefined &&
      (!Number.isInteger(part.length) || part.length < 1 || part.length > 1440)
    )
      throw new ConvexError("A part's length must be from 1 minute to 24 hours.");
    if (part.weekdays !== undefined) {
      if (part.weekdays.length === 0)
        throw new ConvexError("A part needs at least one weekday; leave weekdays out for every day.");
      if (part.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
        throw new ConvexError("Weekdays go from 0 (Monday) to 6 (Sunday).");
    }
    if (part.habitId) {
      const habit = owned(await ctx.db.get(part.habitId), ownerId, "habit");
      if (habit.archivedAt !== undefined) throw new ConvexError(`${habit.title} is archived.`);
      // One routine per habit, so ticking a part and the habit's own count can't disagree.
      const elsewhere = others.find((r) => r.parts.some((p) => p.habitId === part.habitId));
      if (habits.has(part.habitId) || elsewhere)
        throw new ConvexError(
          `${habit.title} is already part of ${elsewhere ? elsewhere.title : "this routine"}.`,
        );
      habits.add(part.habitId);
    }
    out.push({
      title: title(part.title, "part"),
      ...(part.length !== undefined ? { length: part.length } : {}),
      ...(part.habitId ? { habitId: part.habitId } : {}),
      ...(part.weekdays !== undefined ? { weekdays: [...new Set(part.weekdays)].sort((a, b) => a - b) } : {}),
    });
  }
  return out;
}

function checkTime(time: number) {
  if (!Number.isInteger(time) || time < 0 || time > 1439)
    throw new ConvexError("The time must be within the day, in minutes after midnight.");
}

/** The person's routines that aren't archived, in order. */
export async function liveRoutines(ctx: QueryCtx, ownerId: string): Promise<Doc<"routines">[]> {
  const rows = await ctx.db
    .query("routines")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(100);
  return rows.filter((r) => r.archivedAt === undefined).sort((a, b) => a.time - b.time || a.order - b.order);
}

export async function createRoutine(ctx: MutationCtx, ownerId: string, input: RoutineFields) {
  checkTime(input.time);
  if (input.spaceId) owned(await ctx.db.get(input.spaceId), ownerId, "space");
  const parts = await cleanParts(ctx, ownerId, input.parts);
  return await ctx.db.insert("routines", {
    ownerId,
    title: title(input.title, "routine"),
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    time: input.time,
    parts,
    order: Date.now(),
  });
}

export async function updateRoutine(
  ctx: MutationCtx,
  ownerId: string,
  id: Id<"routines">,
  patch: { title?: string; spaceId?: Id<"spaces"> | null; time?: number; parts?: RoutinePart[] },
) {
  const routine = owned(await ctx.db.get(id), ownerId, "routine");
  if (routine.archivedAt !== undefined) throw new ConvexError("That routine is archived.");
  if (patch.time !== undefined) checkTime(patch.time);
  if (patch.spaceId) owned(await ctx.db.get(patch.spaceId), ownerId, "space");
  // Ticks are keyed by a part's place, so a reordered routine keeps old days' ticks on the old
  // places. That only changes how past days read, never what's checked on a habit.
  await ctx.db.patch(id, {
    ...(patch.title !== undefined ? { title: title(patch.title, "routine") } : {}),
    ...(patch.spaceId !== undefined ? { spaceId: patch.spaceId ?? undefined } : {}),
    ...(patch.time !== undefined ? { time: patch.time } : {}),
    ...(patch.parts !== undefined ? { parts: await cleanParts(ctx, ownerId, patch.parts, id) } : {}),
  });
}

/** Archives a routine. Its ticks and its habits' checks stay; its habits show on their own again. */
export async function archiveRoutine(ctx: MutationCtx, ownerId: string, id: Id<"routines">) {
  owned(await ctx.db.get(id), ownerId, "routine");
  await ctx.db.patch(id, { archivedAt: Date.now() });
}

function civil(date: string): CivilDate {
  if (!isCivilDate(date)) throw new ConvexError("The date must look like 2026-10-13.");
  return date;
}

/** Ticks one part on a day, or takes the tick back. A part that's a habit checks the habit too. */
export async function tickPart(
  ctx: MutationCtx,
  ownerId: string,
  input: { routineId: Id<"routines">; index: number; date: string; done: boolean },
) {
  const routine = owned(await ctx.db.get(input.routineId), ownerId, "routine");
  const date = civil(input.date);
  const part = routine.parts[input.index];
  if (!Number.isInteger(input.index) || !part)
    throw new ConvexError(`${routine.title} has parts 0 to ${routine.parts.length - 1}.`);
  if (!partsOn(routine, date).some((p) => p.index === input.index))
    throw new ConvexError(`${part.title} isn't part of ${routine.title} on that day.`);
  const existing = (
    await ctx.db
      .query("routineTicks")
      .withIndex("by_owner_and_routineId_and_date", (q) =>
        q.eq("ownerId", ownerId).eq("routineId", routine._id).eq("date", date),
      )
      .take(MAX_PARTS * 2)
  ).filter((t) => t.index === input.index);
  if (input.done && existing.length === 0)
    await ctx.db.insert("routineTicks", { ownerId, routineId: routine._id, date, index: input.index });
  if (!input.done) for (const t of existing) await ctx.db.delete(t._id);
  if (part.habitId) await checkHabit(ctx, ownerId, part.habitId, input.done, date);
}

/** Ticks every part that runs on the day ("All done"), or takes them all back. */
export async function tickAll(
  ctx: MutationCtx,
  ownerId: string,
  input: { routineId: Id<"routines">; date: string; done: boolean },
) {
  const routine = owned(await ctx.db.get(input.routineId), ownerId, "routine");
  for (const part of partsOn(routine, civil(input.date)))
    await tickPart(ctx, ownerId, {
      routineId: routine._id,
      index: part.index,
      date: input.date,
      done: input.done,
    });
}

/**
 * The routines for one day, as Today shows them: only the parts that run that weekday, each done
 * when it was ticked or its habit was checked that day. A routine with no part that day is left out.
 */
export async function routineViews(
  ctx: QueryCtx,
  ownerId: string,
  date: CivilDate,
  colorOf: (spaceId: Id<"spaces"> | undefined) => SpaceColor | null,
): Promise<RoutineView[]> {
  const from = addDays(date, -STREAK_DAYS);
  const out: RoutineView[] = [];
  for (const routine of await liveRoutines(ctx, ownerId)) {
    const today = partsOn(routine, date);
    if (today.length === 0) continue;
    const ticks = await ctx.db
      .query("routineTicks")
      .withIndex("by_owner_and_routineId_and_date", (q) =>
        q.eq("ownerId", ownerId).eq("routineId", routine._id).gte("date", from).lte("date", date),
      )
      .take(STREAK_DAYS * MAX_PARTS);
    const ticked = new Set(ticks.map((t) => `${t.date}#${t.index}`));
    const checked = new Set<string>();
    for (const habitId of new Set(routine.parts.flatMap((p) => (p.habitId ? [p.habitId] : [])))) {
      const checks = await ctx.db
        .query("habitChecks")
        .withIndex("by_owner_and_habitId_and_date", (q) =>
          q.eq("ownerId", ownerId).eq("habitId", habitId).gte("date", from).lte("date", date),
        )
        .take(STREAK_DAYS + 1);
      for (const c of checks) checked.add(`${c.date}#${habitId}`);
    }
    const partDone = (part: { index: number; habitId?: Id<"habits"> }, day: CivilDate) =>
      ticked.has(`${day}#${part.index}`) ||
      (part.habitId !== undefined && checked.has(`${day}#${part.habitId}`));
    const doneOn = (day: CivilDate) => partsOn(routine, day).every((p) => partDone(p, day));
    const done = doneOn(date);
    out.push({
      _id: routine._id,
      title: routine.title,
      color: colorOf(routine.spaceId),
      spaceId: routine.spaceId ?? null,
      time: routine.time,
      length: today.reduce((sum, p) => sum + (p.length ?? 0), 0),
      parts: today.map((p) => ({
        index: p.index,
        title: p.title,
        length: p.length ?? null,
        habitId: p.habitId ?? null,
        done: partDone(p, date),
      })),
      streak: streak(routine, date, done, doneOn),
      done,
    });
  }
  return out;
}

/**
 * Days in a row the routine was all done, counting back from yesterday, plus today once it's done:
 * a morning that hasn't happened yet doesn't break the streak. Days with no part don't count either way.
 */
export function streak(
  routine: Pick<Doc<"routines">, "parts">,
  date: CivilDate,
  doneToday: boolean,
  doneOn: (day: CivilDate) => boolean,
): number {
  let count = doneToday ? 1 : 0;
  for (let i = 1; i <= STREAK_DAYS; i++) {
    const day = addDays(date, -i);
    if (partsOn(routine, day).length === 0) continue;
    if (!doneOn(day)) break;
    count++;
  }
  return count;
}

/** Which routine each habit is part of, for HabitView.routineId. */
export function routineOfHabit(routines: Doc<"routines">[]): Map<string, Id<"routines">> {
  const map = new Map<string, Id<"routines">>();
  for (const r of routines)
    for (const p of r.parts) if (p.habitId && !map.has(p.habitId)) map.set(p.habitId, r._id);
  return map;
}
