// Task mutations for the signed-in person. The rules live in model/tasks.ts.

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwner } from "./model/owner";
import * as Tasks from "./model/tasks";
import { reminderV, repeatV } from "./validators";

const fields = {
  title: v.string(),
  spaceId: v.optional(v.id("spaces")),
  date: v.optional(v.string()),
  time: v.optional(v.number()),
  length: v.optional(v.number()),
  deadline: v.optional(v.string()),
  repeat: v.optional(repeatV),
  reminders: v.optional(v.array(reminderV)),
  note: v.optional(v.string()),
  event: v.optional(v.boolean()),
  goalId: v.optional(v.id("goals")),
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
    repeat: nullable(repeatV),
    reminders: nullable(v.array(reminderV)),
    note: nullable(v.string()),
    event: nullable(v.boolean()),
    goalId: nullable(v.id("goals")),
  },
  handler: async (ctx, { id, ...patch }) => Tasks.updateTask(ctx, await requireOwner(ctx), id, patch),
});

const completionV = v.object({
  date: v.union(v.string(), v.null()),
  completionId: v.id("completions"),
  finished: v.boolean(),
  next: v.union(v.string(), v.null()),
});

export const complete = mutation({
  args: { id: v.id("tasks") },
  returns: completionV,
  handler: async (ctx, { id }) => Tasks.completeTask(ctx, await requireOwner(ctx), id),
});

export const undoComplete = mutation({
  args: { id: v.id("tasks"), completion: completionV },
  handler: async (ctx, { id, completion }) =>
    Tasks.undoComplete(ctx, await requireOwner(ctx), id, completion),
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

export const settleProposals = mutation({
  args: { accept: v.boolean(), ids: v.optional(v.array(v.id("tasks"))) },
  handler: async (ctx, { accept, ids }) => Tasks.settleProposals(ctx, await requireOwner(ctx), accept, ids),
});
