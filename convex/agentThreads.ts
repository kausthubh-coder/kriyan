import {
  query,
  mutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { kriyanAgent } from "./agentDefinition";

// ============================================
// Thread Management (Mutations/Queries)
// ============================================

/**
 * Create a new chat thread.
 */
export const createThread = mutation({
  args: {
    title: v.optional(v.string()),
  },
  returns: v.object({
    threadId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { threadId } = await kriyanAgent.createThread(ctx, {
      title: args.title,
    });
    return { threadId };
  },
});

/**
 * List all chat threads.
 */
export const listThreads = query({
  args: {
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.string(),
      title: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const threads = await kriyanAgent.listThreads(ctx, { limit });
    return threads.map((t) => ({
      _id: t._id,
      title: t.title,
      createdAt: t._creationTime,
      updatedAt: t.updatedAt ?? t._creationTime,
    }));
  },
});

/**
 * Get messages for a thread.
 */
export const getThreadMessages = query({
  args: {
    threadId: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.string(),
      role: v.string(),
      content: v.optional(v.string()),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const messages = await kriyanAgent.listMessages(ctx, {
      threadId: args.threadId as Id<"threads">,
      limit: args.limit ?? 100,
    });
    return messages.map((m) => ({
      _id: m._id,
      role: m.role,
      content: m.content,
      createdAt: m._creationTime,
    }));
  },
});

/**
 * Delete a thread.
 */
export const deleteThread = mutation({
  args: {
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await kriyanAgent.deleteThread(ctx, {
      threadId: args.threadId as Id<"threads">,
    });
    return null;
  },
});

/**
 * Update thread title.
 */
export const updateThreadTitle = mutation({
  args: {
    threadId: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await kriyanAgent.updateThread(ctx, {
      threadId: args.threadId as Id<"threads">,
      title: args.title,
    });
    return null;
  },
});

// ============================================
// Usage Tracking
// ============================================

/**
 * Get usage statistics.
 */
export const getUsageStats = query({
  args: {
    days: v.optional(v.number()),
  },
  returns: v.object({
    totalMessages: v.number(),
    totalTokens: v.number(),
    totalCost: v.number(),
  }),
  handler: async (ctx, args) => {
    const days = args.days ?? 30;
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    const usage = await kriyanAgent.getUsage(ctx, { since });
    
    return {
      totalMessages: usage.messageCount ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      totalCost: usage.totalCost ?? 0,
    };
  },
});

// ============================================
// Internal Functions for Agent Operations
// ============================================

/**
 * Internal: Get task by ID for agent context.
 */
export const getTaskForAgent = internalQuery({
  args: {
    taskId: v.id("tasks"),
  },
  returns: v.union(
    v.object({
      _id: v.id("tasks"),
      title: v.string(),
      description: v.optional(v.string()),
      status: v.string(),
      tags: v.array(v.string()),
      dueDate: v.optional(v.number()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;
    return {
      _id: task._id,
      title: task.title,
      description: task.description,
      status: task.status,
      tags: task.tags,
      dueDate: task.dueDate,
    };
  },
});

/**
 * Internal: Get note by ID for agent context.
 */
export const getNoteForAgent = internalQuery({
  args: {
    noteId: v.id("notes"),
  },
  returns: v.union(
    v.object({
      _id: v.id("notes"),
      title: v.string(),
      tags: v.array(v.string()),
      updatedAt: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) return null;
    return {
      _id: note._id,
      title: note.title,
      tags: note.tags,
      updatedAt: note.updatedAt,
    };
  },
});
