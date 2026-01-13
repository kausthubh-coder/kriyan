import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Full note validator for returns
const noteValidator = v.object({
  _id: v.id("notes"),
  _creationTime: v.number(),
  title: v.string(),
  tags: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/**
 * List all notes with optional filters.
 */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    const notes = await ctx.db
      .query("notes")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(limit);

    return notes;
  },
});

/**
 * Search notes by title.
 */
export const search = query({
  args: {
    query: v.string(),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase().trim();
    if (!searchTerm) {
      return [];
    }

    const notes = await ctx.db.query("notes").collect();

    return notes
      .filter((n) => n.title.toLowerCase().includes(searchTerm))
      .slice(0, 20);
  },
});

/**
 * Get notes by tag.
 */
export const getByTag = query({
  args: {
    tag: v.string(),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const normalizedTag = args.tag.toLowerCase().trim();

    const notes = await ctx.db.query("notes").collect();

    return notes.filter((n) => n.tags.includes(normalizedTag));
  },
});

/**
 * Get a single note by ID.
 */
export const get = query({
  args: {
    id: v.id("notes"),
  },
  returns: v.union(noteValidator, v.null()),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    return note ?? null;
  },
});

/**
 * Create a new note.
 * Content is managed separately via prosemirror-sync.
 */
export const create = mutation({
  args: {
    title: v.string(),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id("notes"),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Process tags
    const tags = args.tags ?? [];
    if (tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
        tagNames: tags,
      });
    }

    const noteId = await ctx.db.insert("notes", {
      title: args.title,
      tags,
      createdAt: now,
      updatedAt: now,
    });

    return noteId;
  },
});

/**
 * Update note metadata (title, tags).
 * Content updates are handled via prosemirror-sync.
 */
export const update = mutation({
  args: {
    id: v.id("notes"),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note) {
      throw new Error("Note not found");
    }

    const updates: {
      title?: string;
      tags?: string[];
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) updates.title = args.title;

    // Handle tag changes
    if (args.tags !== undefined) {
      const oldTags = note.tags;
      const newTags = args.tags;

      // Find removed tags
      const removedTags = oldTags.filter((t) => !newTags.includes(t));
      if (removedTags.length > 0) {
        await ctx.scheduler.runAfter(0, internal.tags.decrementUsage, {
          tagNames: removedTags,
        });
      }

      // Find added tags
      const addedTags = newTags.filter((t) => !oldTags.includes(t));
      if (addedTags.length > 0) {
        await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
          tagNames: addedTags,
        });
      }

      updates.tags = newTags;
    }

    await ctx.db.patch(args.id, updates);

    return null;
  },
});

/**
 * Delete a note and its associated images.
 */
export const remove = mutation({
  args: {
    id: v.id("notes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note) {
      throw new Error("Note not found");
    }

    // Decrement tag usage
    if (note.tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.decrementUsage, {
        tagNames: note.tags,
      });
    }

    // Delete associated images
    const images = await ctx.db
      .query("noteImages")
      .withIndex("by_noteId", (q) => q.eq("noteId", args.id))
      .collect();

    for (const image of images) {
      // Delete from storage
      await ctx.storage.delete(image.storageId);
      // Delete metadata
      await ctx.db.delete(image._id);
    }

    // Delete associated reminders
    const reminders = await ctx.db.query("reminders").collect();
    for (const reminder of reminders) {
      if (reminder.noteId === args.id) {
        await ctx.db.delete(reminder._id);
      }
    }

    await ctx.db.delete(args.id);

    return null;
  },
});

/**
 * Get recent notes.
 */
export const getRecent = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(noteValidator),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    return await ctx.db
      .query("notes")
      .withIndex("by_updatedAt")
      .order("desc")
      .take(limit);
  },
});

/**
 * Mark note as updated (touch updatedAt).
 * Called when note content changes via prosemirror-sync.
 */
export const touch = mutation({
  args: {
    id: v.id("notes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.id);
    if (!note) {
      throw new Error("Note not found");
    }

    await ctx.db.patch(args.id, {
      updatedAt: Date.now(),
    });

    return null;
  },
});

// ============================================
// Internal functions
// ============================================

/**
 * Internal: Index note content in RAG.
 * Called when note content is saved.
 */
export const indexInRag = internalMutation({
  args: {
    noteId: v.id("notes"),
    content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) return null;

    // TODO: Implement RAG indexing when component is configured
    // Example: await rag.insert(ctx, {
    //   content: note.title + "\n" + args.content,
    //   sourceType: "note",
    //   sourceId: args.noteId,
    //   tags: note.tags,
    // });

    return null;
  },
});

/**
 * Internal: Get note for sync operations.
 */
export const getForSync = internalQuery({
  args: {
    noteId: v.id("notes"),
  },
  returns: v.union(noteValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.noteId);
  },
});

/**
 * Internal: Update note timestamp from sync.
 */
export const updateFromSync = internalMutation({
  args: {
    noteId: v.id("notes"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) return null;

    await ctx.db.patch(args.noteId, {
      updatedAt: Date.now(),
    });

    return null;
  },
});
