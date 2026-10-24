// The operations agents run through the HTTP API (and so MCP and the CLI). One internal
// function per entry in @kriyan/core/ops; http.ts routes to them after checking the token.
// Every function here takes the owner the caller was authenticated as, never one from the request body.
// Every write also takes the agent's name from the HTTP layer and records what it changed in
// agentActions, so the person can see it and undo it.

import { ConvexError, v } from "convex/values";
import { weekday, addDays, todayIn } from "@kriyan/core/dates";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import * as Asks from "./model/asks";
import * as Activity from "./model/activity";
import { getProfile, owned } from "./model/owner";
import * as Progress from "./model/progress";
import * as Spaces from "./model/spaces";
import * as Tasks from "./model/tasks";
import * as Views from "./model/views";
import { colorV, reminderV, repeatV, stepV } from "./validators";

const owner = { ownerId: v.string() };
/** Writes: the owner and the agent's name, both from the HTTP layer. */
const writer = { ownerId: v.string(), agent: v.string() };
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

export const get_task = internalQuery({
  args: { ...read, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, taskId }) => Views.oneTask(ctx, ownerId, taskId),
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
  steps: v.optional(v.array(stepV)),
  event: v.optional(v.boolean()),
  goalId: v.optional(v.id("goals")),
};

export const add_task = internalMutation({
  args: { ...writer, text: v.optional(v.string()), ...taskFields },
  handler: async (ctx, { ownerId, agent, text, title, ...fields }) => {
    if (!text && !title) throw new ConvexError("Pass either text or a title.");
    const addedBy = Activity.agentName(agent);
    const taskId = text
      ? await Tasks.addFromText(ctx, ownerId, text, { source: "agent", defaults: fields, addedBy })
      : await Tasks.createTask(ctx, ownerId, { ...fields, title: title! }, { source: "agent", addedBy });
    const task = await Views.oneTask(ctx, ownerId, taskId);
    await Activity.record(ctx, ownerId, agent, { kind: "add", taskId, title: task.title });
    // The task as saved, so the agent sees what its sentence became.
    return { taskId, task };
  },
});

export const update_task = internalMutation({
  args: {
    ...writer,
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
    steps: nullable(v.array(stepV)),
    event: nullable(v.boolean()),
    goalId: nullable(v.id("goals")),
  },
  handler: async (ctx, { ownerId, agent, taskId, ...patch }) => {
    const was = owned(await ctx.db.get(taskId), ownerId, "task");
    const keys = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined);
    await Tasks.updateTask(ctx, ownerId, taskId, patch);
    const onlyWhen = keys.every((k) => k === "date" || k === "time");
    await Activity.record(ctx, ownerId, agent, {
      kind: onlyWhen ? "move" : "change",
      taskId,
      title: was.title,
      before: Activity.beforePatch(was, keys),
    });
    return { taskId, task: await Views.oneTask(ctx, ownerId, taskId) };
  },
});

export const complete_task = internalMutation({
  args: { ...writer, taskId: v.id("tasks"), date: nullable(v.string()) },
  handler: async (ctx, { ownerId, agent, taskId, date }) => {
    const done = await Tasks.completeTask(ctx, ownerId, taskId, date);
    await Activity.record(ctx, ownerId, agent, {
      kind: "done",
      taskId,
      title: owned(await ctx.db.get(taskId), ownerId, "task").title,
      completion: { completionId: done.completionId, date: done.date },
    });
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
    ...writer,
    taskId: v.id("tasks"),
    completionId: v.id("completions"),
    date: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { ownerId, agent, taskId, completionId, date }) => {
    await Tasks.undoComplete(ctx, ownerId, taskId, { completionId, date });
    await Activity.record(ctx, ownerId, agent, { kind: "reopen", taskId, title: await titleOf(ctx, taskId) });
    return { taskId };
  },
});

export const reopen_task = internalMutation({
  args: { ...writer, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, agent, taskId }) => {
    await Tasks.reopenTask(ctx, ownerId, taskId);
    await Activity.record(ctx, ownerId, agent, { kind: "reopen", taskId, title: await titleOf(ctx, taskId) });
    return { taskId };
  },
});

export const delete_task = internalMutation({
  args: { ...writer, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, agent, taskId }) => {
    await Tasks.deleteTask(ctx, ownerId, taskId);
    await Activity.record(ctx, ownerId, agent, { kind: "delete", taskId, title: await titleOf(ctx, taskId) });
    return { taskId };
  },
});

export const restore_task = internalMutation({
  args: { ...writer, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, agent, taskId }) => {
    await Tasks.restoreTask(ctx, ownerId, taskId);
    await Activity.record(ctx, ownerId, agent, { kind: "restore", taskId, title: await titleOf(ctx, taskId) });
    return { taskId };
  },
});

export const move_tasks = internalMutation({
  args: {
    ...writer,
    taskIds: v.array(v.id("tasks")),
    date: v.union(v.string(), v.null()),
    time: nullable(v.number()),
  },
  handler: async (ctx, { ownerId, agent, taskIds, date, time }) => {
    const keys = time !== undefined ? ["date", "time"] : ["date"];
    const was = await Promise.all(taskIds.map(async (id) => owned(await ctx.db.get(id), ownerId, "task")));
    await Tasks.moveTasks(ctx, ownerId, taskIds, { date, ...(time !== undefined ? { time } : {}) });
    for (const task of was)
      await Activity.record(ctx, ownerId, agent, {
        kind: "move",
        taskId: task._id,
        title: task.title,
        before: Activity.beforePatch(task, keys),
      });
    return { moved: taskIds.length };
  },
});

export const close_day = internalMutation({
  args: writer,
  handler: async (ctx, { ownerId, agent }) => {
    const today = todayIn((await getProfile(ctx, ownerId)).timeZone);
    const moved = await Tasks.closeDay(ctx, ownerId, today);
    for (const t of moved)
      await Activity.record(ctx, ownerId, agent, {
        kind: "move",
        taskId: t._id,
        title: t.title,
        before: { date: t.date },
      });
    return { moved: moved.length, to: addDays(today, 1), taskIds: moved.map((t) => t._id) };
  },
});

export const add_space = internalMutation({
  args: { ...writer, name: v.string(), color: v.optional(colorV), parentId: v.optional(v.id("spaces")) },
  handler: async (ctx, { ownerId, agent, ...input }) => {
    const spaceId = await Spaces.createSpace(ctx, ownerId, input);
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `New space ${input.name.trim()}` });
    return { spaceId };
  },
});

export const update_space = internalMutation({
  args: {
    ...writer,
    spaceId: v.id("spaces"),
    name: v.optional(v.string()),
    color: v.optional(colorV),
    parentId: nullable(v.id("spaces")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { ownerId, agent, spaceId, ...patch }) => {
    await Spaces.updateSpace(ctx, ownerId, spaceId, patch);
    const space = await ctx.db.get(spaceId);
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `Space ${space?.name ?? ""}`.trim() });
    return { spaceId };
  },
});

export const add_habit = internalMutation({
  args: { ...writer, title: v.string(), target: v.number(), spaceId: v.optional(v.id("spaces")) },
  handler: async (ctx, { ownerId, agent, ...input }) => {
    const habitId = await Progress.createHabit(ctx, ownerId, input);
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `New habit ${input.title.trim()}` });
    return { habitId };
  },
});

export const check_habit = internalMutation({
  args: { ...writer, habitId: v.id("habits"), done: v.boolean(), date: v.optional(v.string()) },
  handler: async (ctx, { ownerId, agent, habitId, done, date }) => {
    await Progress.checkHabit(ctx, ownerId, habitId, done, date);
    const habit = await ctx.db.get(habitId);
    await Activity.record(ctx, ownerId, agent, {
      kind: "other",
      title: `${done ? "Checked" : "Unchecked"} ${habit?.title ?? "a habit"}`,
    });
    return { habitId, done };
  },
});

export const add_goal = internalMutation({
  args: {
    ...writer,
    title: v.string(),
    kind: v.union(v.literal("number"), v.literal("tasks")),
    target: v.number(),
    unit: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    spaceId: v.optional(v.id("spaces")),
  },
  handler: async (ctx, { ownerId, agent, ...input }) => {
    const goalId = await Progress.createGoal(ctx, ownerId, input);
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `New goal ${input.title.trim()}` });
    return { goalId };
  },
});

export const update_goal = internalMutation({
  args: {
    ...writer,
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    target: v.optional(v.number()),
    current: v.optional(v.number()),
    unit: nullable(v.string()),
    dueDate: nullable(v.string()),
  },
  handler: async (ctx, { ownerId, agent, goalId, ...patch }) => {
    await Progress.updateGoal(ctx, ownerId, goalId, patch);
    const goal = await ctx.db.get(goalId);
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `Goal ${goal?.title ?? ""}`.trim() });
    return { goalId };
  },
});

export const propose_plan = internalMutation({
  args: {
    ...writer,
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
    const name = Activity.agentName(agent);
    const ids = [];
    for (const block of blocks) {
      const taskId = await Tasks.createTask(ctx, ownerId, block, {
        source: "agent",
        addedBy: name,
        ...(profile.agentsEditDirectly ? {} : { proposedBy: name }),
      });
      ids.push(taskId);
      // A proposal waits for a yes in the app, so only what went straight into the plan is listed.
      if (profile.agentsEditDirectly)
        await Activity.record(ctx, ownerId, name, { kind: "add", taskId, title: block.title });
    }
    return { taskIds: ids, proposed: !profile.agentsEditDirectly };
  },
});

export const get_asks = internalQuery({
  args: read,
  handler: async (ctx, { ownerId }) => Asks.waiting(ctx, ownerId),
});

export const answer_ask = internalMutation({
  args: { ...writer, askId: v.id("asks"), reply: v.string() },
  handler: async (ctx, { ownerId, agent, askId, reply }) => {
    await Asks.answer(ctx, ownerId, askId, Activity.agentName(agent), reply);
    return { askId };
  },
});

async function titleOf(ctx: QueryCtx, taskId: Id<"tasks">): Promise<string> {
  return (await ctx.db.get(taskId))?.title ?? "A task";
}
