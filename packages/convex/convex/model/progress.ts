// Habits and goals.

import { ConvexError } from "convex/values";
import { isCivilDate, todayIn } from "@kriyan/core/dates";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getProfile, owned } from "./owner";

function unit(value: string): string {
  const u = value.trim();
  if (u.length > 20) throw new ConvexError("Keep the unit under 20 characters, like km or pages.");
  return u;
}

function title(value: string, what: string) {
  const t = value.trim();
  if (!t) throw new ConvexError(`Give the ${what} a title.`);
  if (t.length > 200) throw new ConvexError(`Keep the ${what} title under 200 characters.`);
  return t;
}

export async function createHabit(
  ctx: MutationCtx,
  ownerId: string,
  input: { title: string; target: number; spaceId?: Id<"spaces"> },
) {
  if (!Number.isInteger(input.target) || input.target < 1 || input.target > 7)
    throw new ConvexError("A habit's target is 1 to 7 times a week.");
  if (input.spaceId) owned(await ctx.db.get(input.spaceId), ownerId, "space");
  return await ctx.db.insert("habits", {
    ownerId,
    title: title(input.title, "habit"),
    target: input.target,
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    order: Date.now(),
  });
}

export async function updateHabit(
  ctx: MutationCtx,
  ownerId: string,
  id: Id<"habits">,
  patch: { title?: string; target?: number; spaceId?: Id<"spaces"> | null; archived?: boolean },
) {
  owned(await ctx.db.get(id), ownerId, "habit");
  if (
    patch.target !== undefined &&
    (!Number.isInteger(patch.target) || patch.target < 1 || patch.target > 7)
  ) {
    throw new ConvexError("A habit's target is 1 to 7 times a week.");
  }
  await ctx.db.patch(id, {
    ...(patch.title !== undefined ? { title: title(patch.title, "habit") } : {}),
    ...(patch.target !== undefined ? { target: patch.target } : {}),
    ...(patch.spaceId !== undefined ? { spaceId: patch.spaceId ?? undefined } : {}),
    ...(patch.archived !== undefined ? { archivedAt: patch.archived ? Date.now() : undefined } : {}),
  });
}

/** Marks a habit done or not done on a day (today by default). Missing a day never resets anything. */
export async function checkHabit(
  ctx: MutationCtx,
  ownerId: string,
  id: Id<"habits">,
  done: boolean,
  date?: string,
) {
  owned(await ctx.db.get(id), ownerId, "habit");
  const day = date ?? todayIn((await getProfile(ctx, ownerId)).timeZone);
  if (!isCivilDate(day)) throw new ConvexError("The date must look like 2026-10-13.");
  const existing = await ctx.db
    .query("habitChecks")
    .withIndex("by_habitId_and_date", (q) => q.eq("habitId", id).eq("date", day))
    .unique();
  if (done && !existing) await ctx.db.insert("habitChecks", { ownerId, habitId: id, date: day });
  if (!done && existing) await ctx.db.delete(existing._id);
}

export async function createGoal(
  ctx: MutationCtx,
  ownerId: string,
  input: {
    title: string;
    kind: "number" | "tasks";
    target: number;
    unit?: string;
    dueDate?: string;
    spaceId?: Id<"spaces">;
  },
) {
  if (!(input.target > 0)) throw new ConvexError("A goal's target must be more than 0.");
  if (input.dueDate && !isCivilDate(input.dueDate))
    throw new ConvexError("The due date must look like 2026-10-13.");
  if (input.spaceId) owned(await ctx.db.get(input.spaceId), ownerId, "space");
  return await ctx.db.insert("goals", {
    ownerId,
    title: title(input.title, "goal"),
    kind: input.kind,
    target: input.target,
    current: 0,
    ...(input.unit ? { unit: unit(input.unit) } : {}),
    startDate: todayIn((await getProfile(ctx, ownerId)).timeZone),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    ...(input.spaceId ? { spaceId: input.spaceId } : {}),
  });
}

export async function updateGoal(
  ctx: MutationCtx,
  ownerId: string,
  id: Id<"goals">,
  patch: {
    title?: string;
    target?: number;
    current?: number;
    unit?: string | null;
    dueDate?: string | null;
    archived?: boolean;
  },
) {
  owned(await ctx.db.get(id), ownerId, "goal");
  if (patch.target !== undefined && !(patch.target > 0))
    throw new ConvexError("A goal's target must be more than 0.");
  if (patch.current !== undefined && patch.current < 0) throw new ConvexError("Progress can't be below 0.");
  if (patch.dueDate && !isCivilDate(patch.dueDate))
    throw new ConvexError("The due date must look like 2026-10-13.");
  await ctx.db.patch(id, {
    ...(patch.title !== undefined ? { title: title(patch.title, "goal") } : {}),
    ...(patch.target !== undefined ? { target: patch.target } : {}),
    ...(patch.current !== undefined ? { current: patch.current } : {}),
    ...(patch.unit !== undefined ? { unit: patch.unit === null ? undefined : unit(patch.unit) } : {}),
    ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate ?? undefined } : {}),
    ...(patch.archived !== undefined ? { archivedAt: patch.archived ? Date.now() : undefined } : {}),
  });
}
