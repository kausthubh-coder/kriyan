// The operations agents run through the HTTP API (and so MCP and the CLI). One internal
// function per entry in @kriyan/core/ops; http.ts routes to them after checking the token.
// Every function here takes the owner the caller was authenticated as, never one from the request body.

import { ConvexError, v } from "convex/values";
import { weekday, addDays, todayIn } from "@kriyan/core/dates";
import { internalMutation, internalQuery } from "./_generated/server";
import { getProfile } from "./model/owner";
import * as Progress from "./model/progress";
import * as Spaces from "./model/spaces";
import * as Tasks from "./model/tasks";
import * as Views from "./model/views";
import { colorV, reminderV, repeatV } from "./validators";

const owner = { ownerId: v.string() };
const read = { ...owner, today: v.string() };
const nullable = <T extends Parameters<typeof v.optional>[0]>(validator: T) =>
  v.optional(v.union(validator, v.null()));

export const timeZone = internalQuery({
  args: owner,
  handler: async (ctx, { ownerId }) => (await getProfile(ctx, ownerId)).timeZone,
});

export const get_today = internalQuery({
  args: { ...read, date: v.optional(v.string()) },
  handler: async (ctx, { ownerId, today, date }) => Views.todayView(ctx, ownerId, date ?? today),
});

export const get_week = internalQuery({
  args: { ...read, start: v.optional(v.string()) },
  handler: async (ctx, { ownerId, today, start }) =>
    Views.weekView(ctx, ownerId, start ?? addDays(today, -weekday(today)), today),
});

export const get_inbox = internalQuery({
  args: read,
  handler: async (ctx, { ownerId }) => Views.inboxView(ctx, ownerId),
});

export const get_space = internalQuery({
  args: { ...read, spaceId: v.id("spaces") },
  handler: async (ctx, { ownerId, today, spaceId }) => Views.spaceView(ctx, ownerId, spaceId, today),
});

export const list_spaces = internalQuery({
  args: read,
  handler: async (ctx, { ownerId }) => Spaces.spaceTree(await Spaces.listSpaces(ctx, ownerId)),
});

export const get_progress = internalQuery({
  args: read,
  handler: async (ctx, { ownerId, today }) => Views.progressView(ctx, ownerId, today),
});

const taskFields = {
  title: v.optional(v.string()),
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

export const add_task = internalMutation({
  args: { ...owner, text: v.optional(v.string()), ...taskFields },
  handler: async (ctx, { ownerId, text, title, ...fields }) => {
    if (text)
      return { taskId: await Tasks.addFromText(ctx, ownerId, text, { source: "agent", defaults: fields }) };
    if (!title) throw new ConvexError("Pass either text or a title.");
    return { taskId: await Tasks.createTask(ctx, ownerId, { ...fields, title }, { source: "agent" }) };
  },
});

export const update_task = internalMutation({
  args: {
    ...owner,
    taskId: v.id("tasks"),
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
  handler: async (ctx, { ownerId, taskId, ...patch }) => {
    await Tasks.updateTask(ctx, ownerId, taskId, patch);
    return { taskId };
  },
});

export const complete_task = internalMutation({
  args: { ...owner, taskId: v.id("tasks"), date: nullable(v.string()) },
  handler: async (ctx, { ownerId, taskId, date }) => {
    const done = await Tasks.completeTask(ctx, ownerId, taskId, date);
    return {
      taskId,
      finished: done.finished,
      next: done.next,
      completionId: done.completionId,
      date: done.date,
    };
  },
});

export const undo_complete = internalMutation({
  args: {
    ...owner,
    taskId: v.id("tasks"),
    completionId: v.id("completions"),
    date: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { ownerId, taskId, completionId, date }) => {
    await Tasks.undoComplete(ctx, ownerId, taskId, { completionId, date });
    return { taskId };
  },
});

export const reopen_task = internalMutation({
  args: { ...owner, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, taskId }) => {
    await Tasks.reopenTask(ctx, ownerId, taskId);
    return { taskId };
  },
});

export const delete_task = internalMutation({
  args: { ...owner, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, taskId }) => {
    await Tasks.deleteTask(ctx, ownerId, taskId);
    return { taskId };
  },
});

export const restore_task = internalMutation({
  args: { ...owner, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, taskId }) => {
    await Tasks.restoreTask(ctx, ownerId, taskId);
    return { taskId };
  },
});

export const move_tasks = internalMutation({
  args: {
    ...owner,
    taskIds: v.array(v.id("tasks")),
    date: v.union(v.string(), v.null()),
    time: nullable(v.number()),
  },
  handler: async (ctx, { ownerId, taskIds, date, time }) => {
    await Tasks.moveTasks(ctx, ownerId, taskIds, { date, ...(time !== undefined ? { time } : {}) });
    return { moved: taskIds.length };
  },
});

export const close_day = internalMutation({
  args: owner,
  handler: async (ctx, { ownerId }) => {
    const today = todayIn((await getProfile(ctx, ownerId)).timeZone);
    const moved = await Tasks.closeDay(ctx, ownerId, today);
    return { moved: moved.length, to: addDays(today, 1), taskIds: moved.map((t) => t._id) };
  },
});

export const add_space = internalMutation({
  args: { ...owner, name: v.string(), color: v.optional(colorV), parentId: v.optional(v.id("spaces")) },
  handler: async (ctx, { ownerId, ...input }) => ({ spaceId: await Spaces.createSpace(ctx, ownerId, input) }),
});

export const update_space = internalMutation({
  args: {
    ...owner,
    spaceId: v.id("spaces"),
    name: v.optional(v.string()),
    color: v.optional(colorV),
    parentId: nullable(v.id("spaces")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { ownerId, spaceId, ...patch }) => {
    await Spaces.updateSpace(ctx, ownerId, spaceId, patch);
    return { spaceId };
  },
});

export const add_habit = internalMutation({
  args: { ...owner, title: v.string(), target: v.number(), spaceId: v.optional(v.id("spaces")) },
  handler: async (ctx, { ownerId, ...input }) => ({
    habitId: await Progress.createHabit(ctx, ownerId, input),
  }),
});

export const check_habit = internalMutation({
  args: { ...owner, habitId: v.id("habits"), done: v.boolean(), date: v.optional(v.string()) },
  handler: async (ctx, { ownerId, habitId, done, date }) => {
    await Progress.checkHabit(ctx, ownerId, habitId, done, date);
    return { habitId, done };
  },
});

export const add_goal = internalMutation({
  args: {
    ...owner,
    title: v.string(),
    kind: v.union(v.literal("number"), v.literal("tasks")),
    target: v.number(),
    unit: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    spaceId: v.optional(v.id("spaces")),
  },
  handler: async (ctx, { ownerId, ...input }) => ({ goalId: await Progress.createGoal(ctx, ownerId, input) }),
});

export const update_goal = internalMutation({
  args: {
    ...owner,
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    target: v.optional(v.number()),
    current: v.optional(v.number()),
    unit: nullable(v.string()),
    dueDate: nullable(v.string()),
  },
  handler: async (ctx, { ownerId, goalId, ...patch }) => {
    await Progress.updateGoal(ctx, ownerId, goalId, patch);
    return { goalId };
  },
});

export const propose_plan = internalMutation({
  args: {
    ...owner,
    agent: v.string(),
    blocks: v.array(
      v.object({
        title: v.string(),
        date: v.string(),
        time: v.number(),
        length: v.optional(v.number()),
        spaceId: v.optional(v.id("spaces")),
        note: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, { ownerId, agent, blocks }) => {
    if (blocks.length > 50) throw new ConvexError("Propose at most 50 blocks at a time.");
    const profile = await getProfile(ctx, ownerId);
    const name = agent.trim().slice(0, 40) || "An agent";
    const ids = [];
    for (const block of blocks) {
      ids.push(
        await Tasks.createTask(ctx, ownerId, block, {
          source: "agent",
          ...(profile.agentsEditDirectly ? {} : { proposedBy: name }),
        }),
      );
    }
    return { taskIds: ids, proposed: !profile.agentsEditDirectly };
  },
});
