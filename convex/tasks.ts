import {
  query,
  mutation,
  internalMutation,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Task status type
const taskStatusValidator = v.union(
  v.literal("pending"),
  v.literal("completed"),
  v.literal("archived")
);

// Full task validator for returns
const taskValidator = v.object({
  _id: v.id("tasks"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  status: taskStatusValidator,
  tags: v.array(v.string()),
  dueDate: v.optional(v.number()),
  dueTime: v.optional(v.string()),
  parentTaskId: v.optional(v.id("tasks")),
  googleCalendarEventId: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
});

/**
 * List all tasks with optional filters.
 */
export const list = query({
  args: {
    status: v.optional(taskStatusValidator),
    includeArchived: v.optional(v.boolean()),
  },
  returns: v.array(taskValidator),
  handler: async (ctx, args) => {
    let tasks;

    if (args.status) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    } else {
      tasks = await ctx.db.query("tasks").collect();
    }

    // Filter out archived unless explicitly included
    if (!args.includeArchived) {
      tasks = tasks.filter((t) => t.status !== "archived");
    }

    // Filter to only top-level tasks (no parent)
    tasks = tasks.filter((t) => !t.parentTaskId);

    // Sort by due date (null dates at the end), then by creation time
    return tasks.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return b.createdAt - a.createdAt;
    });
  },
});

/**
 * List tasks due today.
 */
export const listToday = query({
  args: {},
  returns: v.array(taskValidator),
  handler: async (ctx) => {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_dueDate")
      .collect();

    return tasks.filter(
      (t) =>
        t.status !== "archived" &&
        t.dueDate &&
        t.dueDate >= startOfDay &&
        t.dueDate < endOfDay &&
        !t.parentTaskId
    );
  },
});

/**
 * List upcoming tasks (next 7 days).
 */
export const listUpcoming = query({
  args: {
    days: v.optional(v.number()),
  },
  returns: v.array(taskValidator),
  handler: async (ctx, args) => {
    const daysAhead = args.days ?? 7;
    const now = Date.now();
    const futureDate = now + daysAhead * 24 * 60 * 60 * 1000;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_dueDate")
      .collect();

    return tasks
      .filter(
        (t) =>
          t.status !== "archived" &&
          t.dueDate &&
          t.dueDate >= now &&
          t.dueDate <= futureDate &&
          !t.parentTaskId
      )
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
  },
});

/**
 * List overdue tasks.
 */
export const listOverdue = query({
  args: {},
  returns: v.array(taskValidator),
  handler: async (ctx) => {
    const now = Date.now();

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return tasks
      .filter((t) => t.dueDate && t.dueDate < now && !t.parentTaskId)
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));
  },
});

/**
 * Get a single task by ID.
 */
export const get = query({
  args: {
    id: v.id("tasks"),
  },
  returns: v.union(taskValidator, v.null()),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    return task ?? null;
  },
});

/**
 * Get subtasks for a parent task.
 */
export const getSubtasks = query({
  args: {
    parentTaskId: v.id("tasks"),
  },
  returns: v.array(taskValidator),
  handler: async (ctx, args) => {
    const subtasks = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", args.parentTaskId))
      .collect();

    return subtasks.sort((a, b) => a.createdAt - b.createdAt);
  },
});

/**
 * Create a new task.
 */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
    parentTaskId: v.optional(v.id("tasks")),
  },
  returns: v.id("tasks"),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate parent task exists if provided
    if (args.parentTaskId) {
      const parent = await ctx.db.get(args.parentTaskId);
      if (!parent) {
        throw new Error("Parent task not found");
      }
    }

    // Process tags
    const tags = args.tags ?? [];
    if (tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.incrementUsage, {
        tagNames: tags,
      });
    }

    const taskId = await ctx.db.insert("tasks", {
      title: args.title,
      description: args.description,
      status: "pending",
      tags,
      dueDate: args.dueDate,
      dueTime: args.dueTime,
      parentTaskId: args.parentTaskId,
      createdAt: now,
      updatedAt: now,
    });

    // Schedule RAG indexing
    await ctx.scheduler.runAfter(0, internal.tasks.indexInRag, { taskId });

    // Schedule Google Calendar sync if task has a due date
    if (args.dueDate) {
      await ctx.scheduler.runAfter(0, internal.calendar.syncTaskToCalendar, {
        taskId,
      });
    }

    return taskId;
  },
});

/**
 * Update a task.
 */
export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    const updates: {
      title?: string;
      description?: string;
      tags?: string[];
      dueDate?: number;
      dueTime?: string;
      updatedAt: number;
    } = {
      updatedAt: Date.now(),
    };

    if (args.title !== undefined) updates.title = args.title;
    if (args.description !== undefined) updates.description = args.description;
    if (args.dueDate !== undefined) updates.dueDate = args.dueDate;
    if (args.dueTime !== undefined) updates.dueTime = args.dueTime;

    // Handle tag changes
    if (args.tags !== undefined) {
      const oldTags = task.tags;
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

    // Re-index in RAG
    await ctx.scheduler.runAfter(0, internal.tasks.indexInRag, { taskId: args.id });

    // Sync to Google Calendar if due date/time changed or already synced
    const updatedTask = await ctx.db.get(args.id);
    if (
      updatedTask &&
      updatedTask.dueDate &&
      (args.dueDate !== undefined ||
        args.dueTime !== undefined ||
        args.title !== undefined ||
        args.description !== undefined ||
        updatedTask.googleCalendarEventId)
    ) {
      await ctx.scheduler.runAfter(0, internal.calendar.syncTaskToCalendar, {
        taskId: args.id,
      });
    }

    return null;
  },
});

/**
 * Complete a task.
 */
export const complete = mutation({
  args: {
    id: v.id("tasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    await ctx.db.patch(args.id, {
      status: "completed",
      updatedAt: Date.now(),
    });

    // Also complete all subtasks
    const subtasks = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", args.id))
      .collect();

    for (const subtask of subtasks) {
      if (subtask.status === "pending") {
        await ctx.db.patch(subtask._id, {
          status: "completed",
          updatedAt: Date.now(),
        });
      }
    }

    return null;
  },
});

/**
 * Uncomplete a task (set back to pending).
 */
export const uncomplete = mutation({
  args: {
    id: v.id("tasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    await ctx.db.patch(args.id, {
      status: "pending",
      updatedAt: Date.now(),
    });

    return null;
  },
});

/**
 * Archive a task.
 */
export const archive = mutation({
  args: {
    id: v.id("tasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: Date.now(),
    });

    // Also archive all subtasks
    const subtasks = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", args.id))
      .collect();

    for (const subtask of subtasks) {
      await ctx.db.patch(subtask._id, {
        status: "archived",
        updatedAt: Date.now(),
      });
    }

    return null;
  },
});

/**
 * Delete a task permanently.
 */
export const remove = mutation({
  args: {
    id: v.id("tasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.id);
    if (!task) {
      throw new Error("Task not found");
    }

    // Decrement tag usage
    if (task.tags.length > 0) {
      await ctx.scheduler.runAfter(0, internal.tags.decrementUsage, {
        tagNames: task.tags,
      });
    }

    // Delete all subtasks first
    const subtasks = await ctx.db
      .query("tasks")
      .withIndex("by_parent", (q) => q.eq("parentTaskId", args.id))
      .collect();

    for (const subtask of subtasks) {
      if (subtask.tags.length > 0) {
        await ctx.scheduler.runAfter(0, internal.tags.decrementUsage, {
          tagNames: subtask.tags,
        });
      }
      await ctx.db.delete(subtask._id);
    }

    // Delete associated reminders
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();

    for (const reminder of reminders) {
      await ctx.db.delete(reminder._id);
    }

    // Delete Google Calendar event if exists
    if (task.googleCalendarEventId) {
      await ctx.scheduler.runAfter(0, internal.calendar.deleteEvent, {
        eventId: task.googleCalendarEventId,
      });
    }

    await ctx.db.delete(args.id);

    return null;
  },
});

/**
 * Search tasks by title or description.
 */
export const search = query({
  args: {
    query: v.string(),
  },
  returns: v.array(taskValidator),
  handler: async (ctx, args) => {
    const searchTerm = args.query.toLowerCase().trim();
    if (!searchTerm) {
      return [];
    }

    const tasks = await ctx.db.query("tasks").collect();

    return tasks
      .filter(
        (t) =>
          t.status !== "archived" &&
          (t.title.toLowerCase().includes(searchTerm) ||
            (t.description && t.description.toLowerCase().includes(searchTerm)))
      )
      .slice(0, 20);
  },
});

/**
 * Get tasks by tag.
 */
export const getByTag = query({
  args: {
    tag: v.string(),
  },
  returns: v.array(taskValidator),
  handler: async (ctx, args) => {
    const normalizedTag = args.tag.toLowerCase().trim();

    const tasks = await ctx.db.query("tasks").collect();

    return tasks.filter(
      (t) => t.status !== "archived" && t.tags.includes(normalizedTag)
    );
  },
});

/**
 * Internal: Index task in RAG for semantic search.
 * This will be implemented when RAG component is set up.
 */
export const indexInRag = internalMutation({
  args: {
    taskId: v.id("tasks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // TODO: Implement RAG indexing when component is configured
    // For now, this is a placeholder
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    // RAG indexing will be added here
    // Example: await rag.insert(ctx, { content: task.title + " " + task.description, ... });

    return null;
  },
});

/**
 * Internal: Update Google Calendar event ID on task.
 */
export const setCalendarEventId = internalMutation({
  args: {
    taskId: v.id("tasks"),
    googleCalendarEventId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.taskId, {
      googleCalendarEventId: args.googleCalendarEventId,
      updatedAt: Date.now(),
    });
    return null;
  },
});
