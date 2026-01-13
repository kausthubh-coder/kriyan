import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Check if Google is connected (has valid tokens).
 */
export const isConnected = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const auth = await ctx.db.query("googleAuth").first();
    return auth !== null;
  },
});

/**
 * Get Google auth status with expiry info.
 */
export const getAuthStatus = query({
  args: {},
  returns: v.union(
    v.object({
      connected: v.literal(true),
      expiresAt: v.number(),
      isExpired: v.boolean(),
    }),
    v.object({
      connected: v.literal(false),
    })
  ),
  handler: async (ctx) => {
    const auth = await ctx.db.query("googleAuth").first();
    if (!auth) {
      return { connected: false as const };
    }
    return {
      connected: true as const,
      expiresAt: auth.expiresAt,
      isExpired: Date.now() >= auth.expiresAt,
    };
  },
});

/**
 * Internal: Store OAuth tokens.
 */
export const storeTokens = internalMutation({
  args: {
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresIn: v.number(),
    scope: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete existing auth
    const existing = await ctx.db.query("googleAuth").first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Store new tokens
    await ctx.db.insert("googleAuth", {
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      expiresAt: Date.now() + args.expiresIn * 1000,
      scope: args.scope,
    });

    return null;
  },
});

/**
 * Internal: Get current tokens (for use in other actions).
 */
export const getTokens = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      accessToken: v.string(),
      refreshToken: v.string(),
      expiresAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const auth = await ctx.db.query("googleAuth").first();
    if (!auth) return null;
    return {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: auth.expiresAt,
    };
  },
});

/**
 * Internal: Update access token after refresh.
 */
export const updateAccessToken = internalMutation({
  args: {
    accessToken: v.string(),
    expiresIn: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = await ctx.db.query("googleAuth").first();
    if (auth) {
      await ctx.db.patch(auth._id, {
        accessToken: args.accessToken,
        expiresAt: Date.now() + args.expiresIn * 1000,
      });
    }
    return null;
  },
});

/**
 * Disconnect Google account (remove tokens).
 */
export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const auth = await ctx.db.query("googleAuth").first();
    if (auth) {
      await ctx.db.delete(auth._id);
    }
    return null;
  },
});
