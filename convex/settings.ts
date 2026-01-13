import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get the current settings. Returns null if no settings exist yet.
 */
export const get = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("settings"),
      _creationTime: v.number(),
      expoPushToken: v.optional(v.string()),
      openrouterApiKey: v.optional(v.string()),
      defaultModel: v.optional(v.string()),
      theme: v.optional(v.union(v.literal("dark"), v.literal("light"))),
      favoriteModels: v.optional(v.array(v.string())),
      calendarSyncEnabled: v.optional(v.boolean()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    return settings ?? null;
  },
});

/**
 * Update settings. Creates the settings row if it doesn't exist.
 */
export const update = mutation({
  args: {
    expoPushToken: v.optional(v.string()),
    openrouterApiKey: v.optional(v.string()),
    defaultModel: v.optional(v.string()),
    theme: v.optional(v.union(v.literal("dark"), v.literal("light"))),
    favoriteModels: v.optional(v.array(v.string())),
    calendarSyncEnabled: v.optional(v.boolean()),
  },
  returns: v.id("settings"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("settings").first();

    if (existing) {
      // Only update fields that are provided (not undefined)
      const updates: Partial<typeof args> = {};
      if (args.expoPushToken !== undefined)
        updates.expoPushToken = args.expoPushToken;
      if (args.openrouterApiKey !== undefined)
        updates.openrouterApiKey = args.openrouterApiKey;
      if (args.defaultModel !== undefined)
        updates.defaultModel = args.defaultModel;
      if (args.theme !== undefined) updates.theme = args.theme;
      if (args.favoriteModels !== undefined)
        updates.favoriteModels = args.favoriteModels;
      if (args.calendarSyncEnabled !== undefined)
        updates.calendarSyncEnabled = args.calendarSyncEnabled;

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    } else {
      // Create new settings row
      return await ctx.db.insert("settings", {
        expoPushToken: args.expoPushToken,
        openrouterApiKey: args.openrouterApiKey,
        defaultModel: args.defaultModel ?? "anthropic/claude-3.5-sonnet",
        theme: args.theme ?? "dark",
        favoriteModels: args.favoriteModels ?? [],
        calendarSyncEnabled: args.calendarSyncEnabled ?? false,
      });
    }
  },
});

/**
 * Set the Expo push token for notifications.
 */
export const setExpoPushToken = mutation({
  args: {
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("settings").first();

    if (existing) {
      await ctx.db.patch(existing._id, { expoPushToken: args.token });
    } else {
      await ctx.db.insert("settings", {
        expoPushToken: args.token,
        theme: "dark",
      });
    }
    return null;
  },
});

/**
 * Add a model to favorites.
 */
export const addFavoriteModel = mutation({
  args: {
    model: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("settings").first();

    if (existing) {
      const favorites = existing.favoriteModels ?? [];
      if (!favorites.includes(args.model)) {
        await ctx.db.patch(existing._id, {
          favoriteModels: [...favorites, args.model],
        });
      }
    } else {
      await ctx.db.insert("settings", {
        favoriteModels: [args.model],
        theme: "dark",
      });
    }
    return null;
  },
});

/**
 * Remove a model from favorites.
 */
export const removeFavoriteModel = mutation({
  args: {
    model: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("settings").first();

    if (existing && existing.favoriteModels) {
      await ctx.db.patch(existing._id, {
        favoriteModels: existing.favoriteModels.filter((m) => m !== args.model),
      });
    }
    return null;
  },
});

/**
 * Internal: Get settings for internal functions.
 */
export const getInternal = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("settings"),
      _creationTime: v.number(),
      expoPushToken: v.optional(v.string()),
      openrouterApiKey: v.optional(v.string()),
      defaultModel: v.optional(v.string()),
      theme: v.optional(v.union(v.literal("dark"), v.literal("light"))),
      favoriteModels: v.optional(v.array(v.string())),
      calendarSyncEnabled: v.optional(v.boolean()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    return settings ?? null;
  },
});
