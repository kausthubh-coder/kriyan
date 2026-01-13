import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/**
 * List all tags ordered by usage count (most used first).
 */
export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("tags"),
      _creationTime: v.number(),
      name: v.string(),
      color: v.optional(v.string()),
      icon: v.optional(v.string()),
      usageCount: v.number(),
    })
  ),
  handler: async (ctx) => {
    const tags = await ctx.db.query("tags").collect();
    // Sort by usageCount descending
    return tags.sort((a, b) => b.usageCount - a.usageCount);
  },
});

/**
 * Search tags by name prefix for autocomplete.
 */
export const search = query({
  args: {
    query: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("tags"),
      _creationTime: v.number(),
      name: v.string(),
      color: v.optional(v.string()),
      icon: v.optional(v.string()),
      usageCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase().trim();
    if (!searchTerm) {
      // Return top tags by usage
      const tags = await ctx.db.query("tags").collect();
      return tags.sort((a, b) => b.usageCount - a.usageCount).slice(0, 10);
    }

    const tags = await ctx.db.query("tags").collect();
    const filtered = tags.filter((tag) =>
      tag.name.toLowerCase().includes(searchTerm)
    );
    return filtered.sort((a, b) => b.usageCount - a.usageCount).slice(0, 10);
  },
});

/**
 * Get a tag by name.
 */
export const getByName = query({
  args: {
    name: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id("tags"),
      _creationTime: v.number(),
      name: v.string(),
      color: v.optional(v.string()),
      icon: v.optional(v.string()),
      usageCount: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const tag = await ctx.db
      .query("tags")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    return tag ?? null;
  },
});

/**
 * Create a new tag. Returns existing tag if name already exists.
 */
export const create = mutation({
  args: {
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  returns: v.id("tags"),
  handler: async (ctx, args) => {
    const normalizedName = args.name.toLowerCase().trim();

    // Check if tag already exists
    const existing = await ctx.db
      .query("tags")
      .withIndex("by_name", (q) => q.eq("name", normalizedName))
      .unique();

    if (existing) {
      return existing._id;
    }

    return await ctx.db.insert("tags", {
      name: normalizedName,
      color: args.color,
      icon: args.icon,
      usageCount: 0,
    });
  },
});

/**
 * Update a tag's color or icon.
 */
export const update = mutation({
  args: {
    id: v.id("tags"),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.id);
    if (!tag) {
      throw new Error("Tag not found");
    }

    const updates: { color?: string; icon?: string } = {};
    if (args.color !== undefined) updates.color = args.color;
    if (args.icon !== undefined) updates.icon = args.icon;

    await ctx.db.patch(args.id, updates);
    return null;
  },
});

/**
 * Delete a tag.
 */
export const remove = mutation({
  args: {
    id: v.id("tags"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const tag = await ctx.db.get(args.id);
    if (!tag) {
      throw new Error("Tag not found");
    }

    await ctx.db.delete(args.id);
    return null;
  },
});

/**
 * Internal: Increment usage count for tags. Called when adding tags to entities.
 */
export const incrementUsage = internalMutation({
  args: {
    tagNames: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const name of args.tagNames) {
      const normalizedName = name.toLowerCase().trim();
      const tag = await ctx.db
        .query("tags")
        .withIndex("by_name", (q) => q.eq("name", normalizedName))
        .unique();

      if (tag) {
        await ctx.db.patch(tag._id, { usageCount: tag.usageCount + 1 });
      } else {
        // Create tag if it doesn't exist
        await ctx.db.insert("tags", {
          name: normalizedName,
          usageCount: 1,
        });
      }
    }
    return null;
  },
});

/**
 * Internal: Decrement usage count for tags. Called when removing tags from entities.
 */
export const decrementUsage = internalMutation({
  args: {
    tagNames: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const name of args.tagNames) {
      const normalizedName = name.toLowerCase().trim();
      const tag = await ctx.db
        .query("tags")
        .withIndex("by_name", (q) => q.eq("name", normalizedName))
        .unique();

      if (tag && tag.usageCount > 0) {
        await ctx.db.patch(tag._id, { usageCount: tag.usageCount - 1 });
      }
    }
    return null;
  },
});

/**
 * Ensure tags exist and increment their usage. Used when creating/updating entities.
 * Returns the normalized tag names.
 */
export const ensureAndIncrement = mutation({
  args: {
    tagNames: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const normalized: Array<string> = [];

    for (const name of args.tagNames) {
      const normalizedName = name.toLowerCase().trim();
      if (!normalizedName) continue;

      normalized.push(normalizedName);

      const tag = await ctx.db
        .query("tags")
        .withIndex("by_name", (q) => q.eq("name", normalizedName))
        .unique();

      if (tag) {
        await ctx.db.patch(tag._id, { usageCount: tag.usageCount + 1 });
      } else {
        await ctx.db.insert("tags", {
          name: normalizedName,
          usageCount: 1,
        });
      }
    }

    return normalized;
  },
});
