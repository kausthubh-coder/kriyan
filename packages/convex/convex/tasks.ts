// Task mutations for the signed-in person. The rules live in model/tasks.ts.

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwner } from "./model/owner";
import * as Tasks from "./model/tasks";
import * as Focus from "./model/focus";
import { reminderV, repeatV, stepV } from "./validators";

const fields = {
  title: v.string(),
  spaceId: v.optional(v.id("spaces")),
  date: v.optional(v.string()),
  time: v.optional(v.number()),
  length: v.optional(v.number()),
  deadline: v.optional(v.string()),
  dueTime: v.optional(v.number()),
  repeat: v.optional(repeatV),
  reminders: v.optional(v.array(reminderV)),
  note: v.optional(v.string()),
  steps: v.optional(v.array(stepV)),
  event: v.optional(v.boolean()),
  goalId: v.optional(v.id("goals")),
  prepFor: v.optional(v.id("tasks")),
};

const nullable = <T extends Parameters<typeof v.optional>[0]>(validator: T) =>
  v.optional(v.union(validator, v.null()));

export const add = mutation({
  args: fields,
  handler: async (ctx, args) => Tasks.createTask(ctx, await requireOwner(ctx), args),
});

/** Quick add: one sentence, parsed on the server with the same grammar as everywhere else. */
export const addText = mutation({
  args: { text: v.string(), spaceId: v.optional(v.id("spaces")), date: v.optional(v.string()) },
  handler: async (ctx, { text, spaceId, date }) =>
    Tasks.addFromText(ctx, await requireOwner(ctx), text, {
      source: "app",
      defaults: { ...(spaceId ? { spaceId } : {}), ...(date ? { date } : {}) },
    }),
});

export const update = mutation({
  args: {
    id: v.id("tasks"),
    title: v.optional(v.string()),
    spaceId: nullable(v.id("spaces")),
    date: nullable(v.string()),
    time: nullable(v.number()),
    length: nullable(v.number()),
    deadline: nullable(v.string()),
    dueTime: nullable(v.number()),
    repeat: nullable(repeatV),
    reminders: nullable(v.array(reminderV)),
    note: nullable(v.string()),
    steps: nullable(v.array(stepV)),
    event: nullable(v.boolean()),
    goalId: nullable(v.id("goals")),
    prepFor: nullable(v.id("tasks")),
  },
  handler: async (ctx, { id, ...patch }) => Tasks.updateTask(ctx, await requireOwner(ctx), id, patch),
});

/** Records a Focus session when it ends; `date` is the person's today. */
export const logFocus = mutation({
  args: { taskId: v.optional(v.id("tasks")), minutes: v.number(), date: v.string() },
  handler: async (ctx, args) => Focus.logFocus(ctx, await requireOwner(ctx), args),
});

const completionV = v.object({
  date: v.union(v.string(), v.null()),
  completionId: v.id("completions"),
  finished: v.boolean(),
  next: v.union(v.string(), v.null()),
});

export const complete = mutation({
  // `date`: the date the row showed, so a second tap can't tick a repeat's next occurrence.
  args: { id: v.id("tasks"), date: nullable(v.string()) },
  returns: completionV,
  handler: async (ctx, { id, date }) => Tasks.completeTask(ctx, await requireOwner(ctx), id, date),
});

export const undoComplete = mutation({
  args: { id: v.id("tasks"), completion: completionV },
  handler: async (ctx, { id, completion }) =>
    Tasks.undoComplete(ctx, await requireOwner(ctx), id, completion),
});

export const skip = mutation({
  args: { id: v.id("tasks") },
  returns: v.object({ date: v.union(v.string(), v.null()), next: v.union(v.string(), v.null()) }),
  handler: async (ctx, { id }) => Tasks.skipOccurrence(ctx, await requireOwner(ctx), id),
});

export const reopen = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => Tasks.reopenTask(ctx, await requireOwner(ctx), id),
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => Tasks.deleteTask(ctx, await requireOwner(ctx), id),
});

export const restore = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, { id }) => Tasks.restoreTask(ctx, await requireOwner(ctx), id),
});

export const move = mutation({
  args: { ids: v.array(v.id("tasks")), date: v.union(v.string(), v.null()), time: nullable(v.number()) },
  handler: async (ctx, { ids, date, time }) =>
    Tasks.moveTasks(ctx, await requireOwner(ctx), ids, { date, ...(time !== undefined ? { time } : {}) }),
});

/** Moves what's still open today to tomorrow; returns where each was, for Undo. */
export const closeDay = mutation({
  args: { today: v.string() },
  handler: async (ctx, { today }) => Tasks.closeDay(ctx, await requireOwner(ctx), today),
});

export const settleProposals = mutation({
  args: { accept: v.boolean(), ids: v.optional(v.array(v.id("tasks"))) },
  handler: async (ctx, { accept, ids }) => Tasks.settleProposals(ctx, await requireOwner(ctx), accept, ids),
});
