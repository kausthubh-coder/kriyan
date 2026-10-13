import { v } from "convex/values";
import { formatClock } from "@kriyan/core/dates";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";

export const payload = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.deletedAt !== undefined || task.doneAt !== undefined) return null;
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_owner", (q) => q.eq("ownerId", task.ownerId))
      .take(20);
    return {
      title: task.title,
      body: task.time !== undefined ? `Starts at ${formatClock(task.time)}` : "Today",
      tokens: tokens.map((t) => t.token),
    };
  },
});

export const forget = internalMutation({
  args: { taskId: v.id("tasks"), fireAt: v.number(), badTokens: v.array(v.string()) },
  handler: async (ctx, { taskId, fireAt, badTokens }) => {
    const jobs = await ctx.db
      .query("reminderJobs")
      .withIndex("by_taskId", (q) => q.eq("taskId", taskId))
      .take(50);
    for (const job of jobs) if (job.fireAt === fireAt) await ctx.db.delete(job._id);
    for (const token of badTokens) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
  },
});

/** Sends one reminder through Expo's push service. Expo is best effort; a missed push is not retried. */
export const fire = internalAction({
  args: { taskId: v.id("tasks"), fireAt: v.number() },
  handler: async (ctx, { taskId, fireAt }) => {
    const data = await ctx.runQuery(internal.reminders.payload, { taskId });
    const badTokens: string[] = [];
    if (data && data.tokens.length) {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(
          data.tokens.map((to) => ({
            to,
            title: data.title,
            body: data.body,
            sound: "default",
            channelId: "reminders",
            data: { taskId },
          })),
        ),
      });
      if (response.ok) {
        const result = (await response.json()) as {
          data?: { status: string; details?: { error?: string } }[];
        };
        result.data?.forEach((r, i) => {
          if (r.details?.error === "DeviceNotRegistered") badTokens.push(data.tokens[i]!);
        });
      } else {
        console.error(`Expo push failed with ${response.status}`);
      }
    }
    await ctx.runMutation(internal.reminders.forget, { taskId, fireAt, badTokens });
  },
});
