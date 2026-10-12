// Profile, push tokens and access tokens for the signed-in person.

import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
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
