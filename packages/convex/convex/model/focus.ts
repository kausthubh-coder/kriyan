// Time spent in Focus. Each session that ends writes one row; Review shows today's total and
// Goals shows the week's, by day and by goal.

import { ConvexError } from "convex/values";
import { addDays, weekday, type CivilDate } from "@kriyan/core/dates";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { owned } from "./owner";

/** A session longer than a day is a clock left running, not focus. */
const MAX_MINUTES = 12 * 60;

export async function logFocus(
  ctx: MutationCtx,
  ownerId: string,
  input: { taskId?: Id<"tasks">; minutes: number; date: CivilDate },
): Promise<Id<"focusSessions"> | null> {
  if (!Number.isFinite(input.minutes) || input.minutes < 0)
    throw new ConvexError("Focus time can't be negative.");
  const minutes = Math.min(MAX_MINUTES, Math.round(input.minutes));
  // Under a minute isn't worth a row: a Focus opened and closed again.
  if (minutes < 1) return null;
  const task = input.taskId ? owned(await ctx.db.get(input.taskId), ownerId, "task") : null;
  return await ctx.db.insert("focusSessions", {
    ownerId,
    date: input.date,
    minutes,
    ...(task ? { taskId: task._id } : {}),
    ...(task?.spaceId ? { spaceId: task.spaceId } : {}),
    ...(task?.goalId ? { goalId: task.goalId } : {}),
  });
}

/** Every minute focused on one task, across all its sessions ("Tracked 25m of 1h 30m"). */
export async function trackedMinutes(ctx: QueryCtx, ownerId: string, taskId: Id<"tasks">): Promise<number> {
  const rows = await ctx.db
    .query("focusSessions")
    .withIndex("by_owner_and_task", (q) => q.eq("ownerId", ownerId).eq("taskId", taskId))
    .take(2000);
  return rows.reduce((sum, r) => sum + r.minutes, 0);
}

export interface FocusSummary {
  today: number;
  week: number;
  /** Monday to Sunday of this week. */
  byDay: { date: CivilDate; minutes: number }[];
  byGoal: { goalId: Id<"goals">; minutes: number }[];
}

export async function focusSummary(ctx: QueryCtx, ownerId: string, today: CivilDate): Promise<FocusSummary> {
  const weekStart = addDays(today, -weekday(today));
  const rows = await ctx.db
    .query("focusSessions")
    .withIndex("by_owner_and_date", (q) =>
      q.eq("ownerId", ownerId).gte("date", weekStart).lte("date", addDays(weekStart, 6)),
    )
    .take(2000);
  const byGoal = new Map<Id<"goals">, number>();
  for (const r of rows) if (r.goalId) byGoal.set(r.goalId, (byGoal.get(r.goalId) ?? 0) + r.minutes);
  return {
    today: rows.filter((r) => r.date === today).reduce((s, r) => s + r.minutes, 0),
    week: rows.reduce((s, r) => s + r.minutes, 0),
    byDay: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return { date, minutes: rows.filter((r) => r.date === date).reduce((s, r) => s + r.minutes, 0) };
    }),
    byGoal: [...byGoal.entries()].map(([goalId, minutes]) => ({ goalId, minutes })),
  };
}
