// Profile, push tokens and access tokens for the signed-in person.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { cancelReminders, scheduleReminders } from "./model/reminders";
import { DEFAULT_PROFILE, getProfile, requireOwner } from "./model/owner";
import { checkReminders } from "./model/tasks";
import * as Tokens from "./model/tokens";
import { reminderV } from "./validators";

export const profile = query({
  args: {},
  handler: async (ctx) => getProfile(ctx, await requireOwner(ctx)),
});

/**
 * Whether to show onboarding: only to someone who has never finished it and has nothing yet
 * (no task, no space). People who used Kriyan before onboarding existed have no onboardedAt,
 * but they have tasks, so they never see it.
 */
export const onboarding = query({
  args: {},
  returns: v.object({ needed: v.boolean() }),
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const row = await ctx.db
      .query("profiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (row?.onboardedAt !== undefined) return { needed: false };
    const task = await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId))
      .first();
    if (task) return { needed: false };
    const space = await ctx.db
      .query("spaces")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .first();
    return { needed: space === null };
  },
});

/** Creates the profile on first sign-in and keeps the time zone current. */
export const ensureProfile = mutation({
  args: { timeZone: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { timeZone, name }) => {
    const ownerId = await requireOwner(ctx);
    try {
      new Intl.DateTimeFormat("en", { timeZone });
    } catch {
      throw new ConvexError("That time zone isn't recognised.");
    }
    const row = await ctx.db
      .query("profiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (!row) {
      const shown = name?.trim().slice(0, 100);
      await ctx.db.insert("profiles", {
        ownerId,
        ...DEFAULT_PROFILE,
        timeZone,
        ...(shown ? { name: shown } : {}),
      });
      // Reminders on anything an agent added before the first sign-in were placed on UTC's clock.
      if (timeZone !== DEFAULT_PROFILE.timeZone)
        await ctx.scheduler.runAfter(0, internal.account.rescheduleReminders, { ownerId, cursor: null });
    } else if (row.timeZone !== timeZone) {
      await ctx.db.patch(row._id, { timeZone });
      // A reminder rings at a clock time where the person is, so a new zone places them all again.
      await ctx.scheduler.runAfter(0, internal.account.rescheduleReminders, { ownerId, cursor: null });
    }
  },
});

/** Schedules every open task's reminders again, 100 tasks at a time. */
export const rescheduleReminders = internalMutation({
  args: { ownerId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { ownerId, cursor }) => {
    const page = await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_deletedAt_and_doneAt_and_date", (q) =>
        q.eq("ownerId", ownerId).eq("deletedAt", undefined).eq("doneAt", undefined).gte("date", "0000"),
      )
      .paginate({ numItems: 100, cursor });
    for (const task of page.page) if (task.reminders.length) await scheduleReminders(ctx, task._id);
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.account.rescheduleReminders, {
        ownerId,
        cursor: page.continueCursor,
      });
  },
});

export const updateProfile = mutation({
  args: {
    dayStart: v.optional(v.number()),
    dayEnd: v.optional(v.number()),
    dailyCapacity: v.optional(v.number()),
    defaultReminders: v.optional(v.array(reminderV)),
    agentsEditDirectly: v.optional(v.boolean()),
    onboarded: v.optional(v.boolean()),
  },
  handler: async (ctx, patch) => {
    const ownerId = await requireOwner(ctx);
    const row = await ctx.db
      .query("profiles")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .unique();
    if (!row) throw new ConvexError("Open the app once to create your profile.");
    const dayStart = patch.dayStart ?? row.dayStart;
    const dayEnd = patch.dayEnd ?? row.dayEnd;
    if (
      !Number.isInteger(dayStart) ||
      !Number.isInteger(dayEnd) ||
      dayStart < 0 ||
      dayEnd > 1440 ||
      dayEnd <= dayStart
    )
      throw new ConvexError("Your day must end after it starts.");
    if (
      patch.dailyCapacity !== undefined &&
      (!Number.isInteger(patch.dailyCapacity) || patch.dailyCapacity < 0 || patch.dailyCapacity > 1440)
    )
      throw new ConvexError("A day can hold from 0 to 24 hours of planned work.");
    // Every new timed task copies these, so they get the same checks as a task's own.
    if (patch.defaultReminders) checkReminders(patch.defaultReminders);
    const { onboarded, ...rest } = patch;
    await ctx.db.patch(row._id, { ...rest, ...(onboarded ? { onboardedAt: Date.now() } : {}) });
  },
});

/** Expo's push token shapes: ExponentPushToken[...], ExpoPushToken[...], or a bare id. */
const PUSH_TOKEN = /^(?:Expo(?:nent)?PushToken\[[A-Za-z0-9_-]{1,200}\]|[A-Za-z0-9-]{10,200})$/;
const MAX_DEVICES = 20;

export const registerPush = mutation({
  args: { token: v.string(), platform: v.string() },
  handler: async (ctx, { token, platform }) => {
    const ownerId = await requireOwner(ctx);
    if (!PUSH_TOKEN.test(token)) throw new ConvexError("That isn't a push token from this app.");
    if (platform !== "android" && platform !== "ios") throw new ConvexError("Reminders ring on phones only.");
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing && existing.ownerId === ownerId) return;
    // The phone signed in to another account: it rings for this one now.
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("pushTokens", { ownerId, token, platform });
    const devices = await ctx.db
      .query("pushTokens")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(MAX_DEVICES + 10);
    for (const old of devices.slice(0, Math.max(0, devices.length - MAX_DEVICES)))
      await ctx.db.delete(old._id);
  },
});

/** On sign-out: this phone stops ringing for the account it leaves. */
export const unregisterPush = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const ownerId = await requireOwner(ctx);
    const row = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (row && row.ownerId === ownerId) await ctx.db.delete(row._id);
  },
});

export const tokens = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    const rows = await ctx.db
      .query("accessTokens")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .take(50);
    return rows.map((t) => ({
      _id: t._id,
      name: t.name,
      hint: t.hint,
      createdAt: t._creationTime,
      lastUsedAt: t.lastUsedAt ?? null,
    }));
  },
});

export const createToken = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => Tokens.createToken(ctx, await requireOwner(ctx), name),
});

export const revokeToken = mutation({
  args: { id: v.id("accessTokens") },
  handler: async (ctx, { id }) => Tokens.revokeToken(ctx, await requireOwner(ctx), id),
});

/**
 * Deletes everything the signed-in person owns: tasks (and their pending reminders), spaces,
 * habits, goals, history, devices, tokens and the profile. Runs in batches until done.
 * The Clerk account itself is deleted by the app through Clerk.
 */
export const deleteMyData = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx);
    await ctx.scheduler.runAfter(0, internal.account.deleteDataBatch, { ownerId });
  },
});

const BATCH = 200;

export const deleteDataBatch = internalMutation({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    let left = BATCH;
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId))
      .take(left);
    for (const t of tasks) {
      await cancelReminders(ctx, t._id);
      await ctx.db.delete(t._id);
    }
    left -= tasks.length;
    // Explicit per table: every index here starts with ownerId.
    const batches = [
      () =>
        ctx.db
          .query("completions")
          .withIndex("by_owner_and_doneOn", (q) => q.eq("ownerId", ownerId))
          .take(left),
      () =>
        ctx.db
          .query("habitChecks")
          .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId))
          .take(left),
      () =>
        ctx.db
          .query("habits")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
          .take(left),
      () =>
        ctx.db
          .query("goals")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
          .take(left),
      () =>
        ctx.db
          .query("spaces")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
          .take(left),
      () =>
        ctx.db
          .query("pushTokens")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
          .take(left),
      () =>
        ctx.db
          .query("accessTokens")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
          .take(left),
      () =>
        ctx.db
          .query("profiles")
          .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
          .take(left),
    ];
    for (const next of batches) {
      if (left <= 0) break;
      const rows = await next();
      for (const row of rows) await ctx.db.delete(row._id);
      left -= rows.length;
    }
    if (left <= 0) await ctx.scheduler.runAfter(0, internal.account.deleteDataBatch, { ownerId });
  },
});
