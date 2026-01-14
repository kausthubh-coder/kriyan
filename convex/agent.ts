"use node";

import { Agent, createTool } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { v } from "convex/values";
import { api, internal, components } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// ============================================
// Agent Tools
// ============================================

/**
 * Tool: Create a new task
 */
const createTaskTool = createTool({
  name: "createTask",
  description:
    "Create a new task for the user. Use this when the user wants to add a task, todo, or something they need to do.",
  args: v.object({
    title: v.string(),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const taskId = await ctx.runMutation(api.tasks.create, {
      title: args.title,
      description: args.description,
      tags: args.tags,
      dueDate: args.dueDate,
      dueTime: args.dueTime,
    });
    return {
      success: true,
      taskId,
      message: `Created task: "${args.title}"${args.dueDate ? ` due ${new Date(args.dueDate).toLocaleDateString()}` : ""}`,
    };
  },
});

/**
 * Tool: Update an existing task
 */
const updateTaskTool = createTool({
  name: "updateTask",
  description:
    "Update an existing task. Use this when the user wants to modify a task's title, description, tags, or due date.",
  args: v.object({
    taskId: v.id("tasks"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    await ctx.runMutation(api.tasks.update, {
      id: args.taskId,
      title: args.title,
      description: args.description,
      tags: args.tags,
      dueDate: args.dueDate,
      dueTime: args.dueTime,
    });
    return {
      success: true,
      message: `Updated task ${args.taskId}`,
    };
  },
});

/**
 * Tool: Complete a task
 */
const completeTaskTool = createTool({
  name: "completeTask",
  description:
    "Mark a task as completed. Use this when the user says they finished a task or wants to check it off.",
  args: v.object({
    taskId: v.id("tasks"),
  }),
  handler: async (ctx, args) => {
    await ctx.runMutation(api.tasks.complete, { id: args.taskId });
    return {
      success: true,
      message: `Marked task ${args.taskId} as completed`,
    };
  },
});

/**
 * Tool: Create a new note
 */
const createNoteTool = createTool({
  name: "createNote",
  description:
    "Create a new note. Use this when the user wants to save information, write something down, or create a document.",
  args: v.object({
    title: v.string(),
    tags: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args) => {
    const noteId = await ctx.runMutation(api.notes.create, {
      title: args.title,
      tags: args.tags,
    });
    return {
      success: true,
      noteId,
      message: `Created note: "${args.title}"`,
    };
  },
});

/**
 * Tool: Update note metadata
 */
const updateNoteTool = createTool({
  name: "updateNote",
  description: "Update a note's title or tags. Use this when the user wants to rename a note or change its tags.",
  args: v.object({
    noteId: v.id("notes"),
    title: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args) => {
    await ctx.runMutation(api.notes.update, {
      id: args.noteId,
      title: args.title,
      tags: args.tags,
    });
    return {
      success: true,
      message: `Updated note ${args.noteId}`,
    };
  },
});

/**
 * Tool: Set a reminder
 */
const setReminderTool = createTool({
  name: "setReminder",
  description:
    "Set a reminder for the user. Use this when the user wants to be reminded about something at a specific time.",
  args: v.object({
    title: v.string(),
    triggerAt: v.number(),
    taskId: v.optional(v.id("tasks")),
    noteId: v.optional(v.id("notes")),
    isRecurring: v.optional(v.boolean()),
    recurrenceFrequency: v.optional(
      v.union(
        v.literal("daily"),
        v.literal("weekly"),
        v.literal("monthly"),
        v.literal("yearly")
      )
    ),
    isAlarm: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const recurrenceRule = args.isRecurring && args.recurrenceFrequency
      ? {
          frequency: args.recurrenceFrequency,
          interval: 1,
        }
      : undefined;

    const reminderId = await ctx.runMutation(api.reminders.create, {
      title: args.title,
      triggerAt: args.triggerAt,
      taskId: args.taskId,
      noteId: args.noteId,
      isRecurring: args.isRecurring,
      recurrenceRule,
      isAlarm: args.isAlarm,
    });

    const triggerDate = new Date(args.triggerAt);
    return {
      success: true,
      reminderId,
      message: `Set reminder: "${args.title}" for ${triggerDate.toLocaleString()}`,
    };
  },
});

/**
 * Tool: Get upcoming tasks
 */
const getUpcomingTasksTool = createTool({
  name: "getUpcomingTasks",
  description:
    "Get the user's upcoming tasks. Use this to show what tasks are due soon or to help the user plan.",
  args: v.object({
    days: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const tasks = await ctx.runQuery(api.tasks.listUpcoming, {
      days: args.days ?? 7,
    });
    return {
      tasks: tasks.map((t) => ({
        id: t._id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : null,
        tags: t.tags,
      })),
      count: tasks.length,
    };
  },
});

/**
 * Tool: Get today's tasks
 */
const getTodayTasksTool = createTool({
  name: "getTodayTasks",
  description:
    "Get tasks due today. Use this when the user asks what they need to do today.",
  args: v.object({}),
  handler: async (ctx) => {
    const tasks = await ctx.runQuery(api.tasks.listToday, {});
    return {
      tasks: tasks.map((t) => ({
        id: t._id,
        title: t.title,
        description: t.description,
        status: t.status,
        dueTime: t.dueTime,
        tags: t.tags,
      })),
      count: tasks.length,
    };
  },
});

/**
 * Tool: Get overdue tasks
 */
const getOverdueTasksTool = createTool({
  name: "getOverdueTasks",
  description:
    "Get overdue tasks. Use this when the user asks about tasks they missed or are behind on.",
  args: v.object({}),
  handler: async (ctx) => {
    const tasks = await ctx.runQuery(api.tasks.listOverdue, {});
    return {
      tasks: tasks.map((t) => ({
        id: t._id,
        title: t.title,
        dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : null,
        tags: t.tags,
      })),
      count: tasks.length,
    };
  },
});

/**
 * Tool: Get upcoming reminders
 */
const getUpcomingRemindersTool = createTool({
  name: "getUpcomingReminders",
  description:
    "Get upcoming reminders. Use this to show what reminders are scheduled.",
  args: v.object({
    days: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const reminders = await ctx.runQuery(api.reminders.listUpcoming, {
      days: args.days ?? 7,
    });
    return {
      reminders: reminders.map((r) => ({
        id: r._id,
        title: r.title,
        triggerAt: new Date(r.triggerAt).toLocaleString(),
        isRecurring: r.isRecurring,
        isAlarm: r.isAlarm,
      })),
      count: reminders.length,
    };
  },
});

/**
 * Tool: Search content across all types
 */
const searchContentTool = createTool({
  name: "searchContent",
  description:
    "Search across tasks, notes, and files. Use this when the user is looking for something specific.",
  args: v.object({
    query: v.string(),
  }),
  handler: async (ctx, args) => {
    // Search tasks
    const tasks = await ctx.runQuery(api.tasks.search, { query: args.query });
    
    // Search notes
    const notes = await ctx.runQuery(api.notes.search, { query: args.query });
    
    // Search files
    const files = await ctx.runQuery(api.files.search, { query: args.query });

    return {
      tasks: tasks.slice(0, 5).map((t) => ({
        type: "task" as const,
        id: t._id,
        title: t.title,
        status: t.status,
      })),
      notes: notes.slice(0, 5).map((n) => ({
        type: "note" as const,
        id: n._id,
        title: n.title,
      })),
      files: files.slice(0, 5).map((f) => ({
        type: "file" as const,
        id: f._id,
        fileName: f.fileName,
        sourceType: f.sourceType,
      })),
      totalResults: tasks.length + notes.length + files.length,
    };
  },
});

/**
 * Tool: Get recent notes
 */
const getRecentNotesTool = createTool({
  name: "getRecentNotes",
  description:
    "Get recently updated notes. Use this when the user asks about their notes or recent work.",
  args: v.object({
    limit: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const notes = await ctx.runQuery(api.notes.getRecent, {
      limit: args.limit ?? 10,
    });
    return {
      notes: notes.map((n) => ({
        id: n._id,
        title: n.title,
        tags: n.tags,
        updatedAt: new Date(n.updatedAt).toLocaleDateString(),
      })),
      count: notes.length,
    };
  },
});

/**
 * Tool: List all tasks
 */
const listTasksTool = createTool({
  name: "listTasks",
  description:
    "List all tasks with optional status filter. Use this when the user wants to see all their tasks.",
  args: v.object({
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("completed"),
        v.literal("archived")
      )
    ),
    includeArchived: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const tasks = await ctx.runQuery(api.tasks.list, {
      status: args.status,
      includeArchived: args.includeArchived,
    });
    return {
      tasks: tasks.map((t) => ({
        id: t._id,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate ? new Date(t.dueDate).toLocaleDateString() : null,
        tags: t.tags,
      })),
      count: tasks.length,
    };
  },
});

// ============================================
// Agent Definition
// ============================================

const SYSTEM_PROMPT = `You are Kriyan, a personal AI assistant that helps users manage their tasks, notes, reminders, and files. You are part of the user's "second brain" - a personal productivity system.

Your capabilities:
- Create, update, and complete tasks
- Create and organize notes
- Set reminders for specific times
- Search across all content (tasks, notes, files)
- Show upcoming tasks and reminders

Guidelines:
1. Be concise and helpful. Don't over-explain.
2. When creating tasks/reminders, confirm the details clearly.
3. If a user mentions a date like "tomorrow" or "next week", calculate the appropriate timestamp.
4. Use tags to help organize content when appropriate.
5. When searching, summarize the results helpfully.
6. If you're unsure what the user wants, ask for clarification.
7. For dates/times, use the current date: ${new Date().toLocaleDateString()}

Today is ${new Date().toLocaleDateString()} (${new Date().toLocaleDateString("en-US", { weekday: "long" })}).`;

/**
 * The Kriyan AI Agent
 */
export const kriyanAgent = new Agent(components.agent, {
  chat: openai("gpt-4o"),
  textEmbedding: openai.embedding("text-embedding-3-small"),
  instructions: SYSTEM_PROMPT,
  tools: [
    createTaskTool,
    updateTaskTool,
    completeTaskTool,
    createNoteTool,
    updateNoteTool,
    setReminderTool,
    getUpcomingTasksTool,
    getTodayTasksTool,
    getOverdueTasksTool,
    getUpcomingRemindersTool,
    searchContentTool,
    getRecentNotesTool,
    listTasksTool,
  ],
});

// ============================================
// Thread Management
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
// Chat Actions
// ============================================

/**
 * Send a message and get a response (non-streaming).
 */
export const sendMessage = action({
  args: {
    threadId: v.string(),
    message: v.string(),
  },
  returns: v.object({
    response: v.string(),
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    const result = await kriyanAgent.generateText(ctx, {
      threadId: args.threadId as Id<"threads">,
      prompt: args.message,
    });

    return {
      response: result.text,
      messageId: result.messageId,
    };
  },
});

/**
 * Send a message with streaming response.
 * Returns the thread ID and message ID immediately,
 * while the response streams to the client.
 */
export const sendMessageStreaming = action({
  args: {
    threadId: v.string(),
    message: v.string(),
  },
  returns: v.object({
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { messageId } = await kriyanAgent.streamText(ctx, {
      threadId: args.threadId as Id<"threads">,
      prompt: args.message,
    });

    return { messageId };
  },
});

/**
 * Start a new conversation with streaming.
 * Creates a thread and sends the first message.
 */
export const startConversation = action({
  args: {
    message: v.string(),
    title: v.optional(v.string()),
  },
  returns: v.object({
    threadId: v.string(),
    response: v.string(),
    messageId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Create thread
    const { threadId } = await kriyanAgent.createThread(ctx, {
      title: args.title,
    });

    // Send message
    const result = await kriyanAgent.generateText(ctx, {
      threadId,
      prompt: args.message,
    });

    // Auto-generate title from first message if not provided
    if (!args.title && args.message.length > 0) {
      const titlePrompt = args.message.slice(0, 50) + (args.message.length > 50 ? "..." : "");
      await kriyanAgent.updateThread(ctx, {
        threadId,
        title: titlePrompt,
      });
    }

    return {
      threadId,
      response: result.text,
      messageId: result.messageId,
    };
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
