import { v } from "convex/values";
import { todayIn } from "@kriyan/core/dates";
import { reminderBody } from "@kriyan/core/format";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { getProfile } from "./model/owner";
import { scheduleReminders } from "./model/reminders";

export const payload = internalQuery({
  args: { taskId: v.id("tasks"), fireAt: v.number(), date: v.optional(v.string()) },
  handler: async (ctx, { taskId, fireAt, date }) => {
    const task = await ctx.db.get(taskId);
    if (!task || task.deletedAt !== undefined || task.doneAt !== undefined) return null;
    const occurrence = date ?? task.date;
    if (!occurrence) return null;
    const { timeZone } = await getProfile(ctx, task.ownerId);
    const tokens = await ctx.db
      .query("pushTokens")
      .withIndex("by_owner", (q) => q.eq("ownerId", task.ownerId))
      .take(20);
    const web = await ctx.db
      .query("webPushSubscriptions")
      .withIndex("by_owner", (q) => q.eq("ownerId", task.ownerId))
      .take(20);
    return {
      title: task.title,
      body: reminderBody({ date: occurrence, time: task.time }, todayIn(timeZone, fireAt)),
      tokens: tokens.map((t) => t.token),
      web: web.map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth })),
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
    // That was the occurrence's last reminder: a repeating event's next occurrence gets its own.
    if (jobs.every((job) => job.fireAt === fireAt)) await scheduleReminders(ctx, taskId);
    for (const token of badTokens) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique();
      if (row) await ctx.db.delete(row._id);
    }
  },
});

/**
 * Sends one reminder through Expo's push service (the Android app) and Web Push (the web app on
 * an iPhone Home Screen, Android Chrome, desktop browsers). Both are best effort; a missed push
 * is not retried.
 */
export const fire = internalAction({
  // `date` is the occurrence the reminder is for. Jobs scheduled before it existed leave it
  // out and mean the task's own date.
  args: { taskId: v.id("tasks"), fireAt: v.number(), date: v.optional(v.string()) },
  handler: async (ctx, { taskId, fireAt, date }) => {
    const data = await ctx.runQuery(internal.reminders.payload, {
      taskId,
      fireAt,
      ...(date ? { date } : {}),
    });
    const badTokens: string[] = [];
    if (data && data.tokens.length) {
      try {
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
              // Android's default ("normal") can hold a push until a sleeping phone wakes.
              priority: "high",
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
      } catch (error) {
        // Forget the job anyway, so the next occurrence still gets its reminders.
        console.error(`Expo push failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (data && data.web.length) {
      try {
        await ctx.runAction(internal.webPushSend.send, {
          subscriptions: data.web,
          title: data.title,
          body: data.body,
          tag: `task-${taskId}`,
          url: `/task/${taskId}`,
        });
      } catch (error) {
        console.error(`Web push failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await ctx.runMutation(internal.reminders.forget, { taskId, fireAt, badTokens });
  },
});
