// Reminders are sent from the server, so a task added on the web or by an agent still
// rings the phone. Each task keeps scheduled jobs for one occurrence at a time; they are
// rescheduled whenever the task changes, is done, or moves to its next repeat.

import { addDays, todayIn, type CivilDate } from "@kriyan/core/dates";
import { reminderInstants } from "@kriyan/core/reminders";
import { occurrences } from "@kriyan/core/repeat";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getProfile } from "./owner";

export async function cancelReminders(ctx: MutationCtx, taskId: Id<"tasks">): Promise<void> {
  const jobs = await ctx.db
    .query("reminderJobs")
    .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
    .take(50);
  for (const job of jobs) {
    const scheduled = await ctx.db.system.get(job.jobId);
    if (scheduled && scheduled.state.kind === "pending") await ctx.scheduler.cancel(job.jobId);
    await ctx.db.delete(job._id);
  }
}

/**
 * The occurrence whose reminders ring next, and when: the task's own date while it still has
 * one to ring. A repeat's date only moves when it's ticked off, and events never are, so once
 * that date's reminders have rung the next occurrence on the schedule gets its own.
 */
export function nextReminders(
  task: Pick<Doc<"tasks">, "date" | "time" | "reminders" | "repeat" | "repeatFirst">,
  timeZone: string,
  now: number,
): { date: CivilDate; instants: number[] } | null {
  if (!task.date || task.reminders.length === 0) return null;
  const ringing = (date: CivilDate) =>
    reminderInstants({ date, time: task.time }, task.reminders, timeZone).filter((at) => at > now);
  const own = ringing(task.date);
  if (own.length) return { date: task.date, instants: own };
  // "After done" repeats have no next date until this one is done.
  if (!task.repeat || task.repeat.fromCompletion) return null;
  // A reminder rings on its occurrence's day at the latest, so earlier days have none left.
  const from = addDays(todayIn(timeZone, now), -1);
  for (const date of occurrences(task.repeat, task.repeatFirst ?? task.date)) {
    if (date <= task.date || date < from) continue;
    const instants = ringing(date);
    if (instants.length) return { date, instants };
  }
  return null;
}

export async function scheduleReminders(ctx: MutationCtx, taskId: Id<"tasks">): Promise<void> {
  await cancelReminders(ctx, taskId);
  const task = await ctx.db.get(taskId);
  if (!task || task.deletedAt !== undefined || task.doneAt !== undefined || task.proposedBy !== undefined)
    return;
  const profile = await getProfile(ctx, task.ownerId);
  const next = nextReminders(task, profile.timeZone, Date.now());
  if (!next) return;
  for (const fireAt of next.instants) {
    const jobId = await ctx.scheduler.runAt(fireAt, internal.reminders.fire, {
      taskId,
      fireAt,
      date: next.date,
    });
    await ctx.db.insert("reminderJobs", { ownerId: task.ownerId, taskId, fireAt, jobId });
  }
}
