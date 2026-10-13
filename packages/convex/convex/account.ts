// Profile, push tokens and access tokens for the signed-in person.

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { cancelReminders } from "./model/reminders";
import { DEFAULT_PROFILE, getProfile, requireOwner } from "./model/owner";
import * as Tokens from "./model/tokens";
import { reminderV } from "./validators";

export const profile = query({
  args: {},
  handler: async (ctx) => getProfile(ctx, await requireOwner(ctx)),
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
    if (!row)
      await ctx.db.insert("profiles", { ownerId, ...DEFAULT_PROFILE, timeZone, ...(name ? { name } : {}) });
    else if (row.timeZone !== timeZone) await ctx.db.patch(row._id, { timeZone });
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
    if (dayStart < 0 || dayEnd > 1440 || dayEnd <= dayStart)
      throw new ConvexError("Your day must end after it starts.");
    const { onboarded, ...rest } = patch;
    await ctx.db.patch(row._id, { ...rest, ...(onboarded ? { onboardedAt: Date.now() } : {}) });
  },
});

export const registerPush = mutation({
  args: { token: v.string(), platform: v.string() },
  handler: async (ctx, { token, platform }) => {
    const ownerId = await requireOwner(ctx);
    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (existing && existing.ownerId === ownerId) return;
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("pushTokens", { ownerId, token, platform });
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
