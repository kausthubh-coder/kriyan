// Reminders are sent from the server, so a task added on the web or by an agent still
// rings the phone. Each task keeps scheduled jobs for its next occurrence only; they are
// rescheduled whenever the task changes, is done, or moves to its next repeat.

import { reminderInstants } from "@kriyan/core/reminders";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
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

export async function scheduleReminders(ctx: MutationCtx, taskId: Id<"tasks">): Promise<void> {
  await cancelReminders(ctx, taskId);
  const task = await ctx.db.get(taskId);
  if (!task || task.deletedAt !== undefined || task.doneAt !== undefined || task.proposedBy !== undefined)
    return;
  if (!task.date || task.reminders.length === 0) return;
  const profile = await getProfile(ctx, task.ownerId);
  const now = Date.now();
  const instants = reminderInstants(
    { date: task.date, time: task.time },
    task.reminders,
    profile.timeZone,
  ).filter((at) => at > now);
  for (const fireAt of instants) {
    const jobId = await ctx.scheduler.runAt(fireAt, internal.reminders.fire, { taskId, fireAt });
    await ctx.db.insert("reminderJobs", { ownerId: task.ownerId, taskId, fireAt, jobId });
  }
}
