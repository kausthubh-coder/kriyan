// The operations agents run through the HTTP API (and so MCP and the CLI). One internal
// function per entry in @kriyan/core/ops; http.ts routes to them after checking the token.
// Every function here takes the owner the caller was authenticated as, never one from the request body.
// Every write also takes the agent's name from the HTTP layer and records what it changed in
// agentActions, so the person can see it and undo it.

import { ConvexError, v } from "convex/values";
import { weekday, addDays, todayIn } from "@kriyan/core/dates";
import { formatDay } from "@kriyan/core/format";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import * as Asks from "./model/asks";
import * as Activity from "./model/activity";
import { getProfile, owned } from "./model/owner";
import * as Profile from "./model/profile";
import * as Routines from "./model/routines";
import * as Progress from "./model/progress";
import * as Search from "./model/search";
import * as Spaces from "./model/spaces";
import * as Tasks from "./model/tasks";
import * as Views from "./model/views";
import { colorV, earlierWindowV, reminderV, repeatV, routinePartV, stepV, todayLayoutV } from "./validators";

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
  handler: async (ctx, { ownerId, today }) => Views.inboxView(ctx, ownerId, today),
});

export const get_space = internalQuery({
  args: { ...read, spaceId: v.id("spaces") },
  handler: async (ctx, { ownerId, today, spaceId }) => Views.spaceView(ctx, ownerId, spaceId, today),
});

export const get_task = internalQuery({
  args: { ...read, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, today, taskId }) => Views.oneTask(ctx, ownerId, taskId, today),
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
  dueTime: v.optional(v.number()),
  repeat: v.optional(repeatV),
  reminders: v.optional(v.array(reminderV)),
  note: v.optional(v.string()),
  steps: v.optional(v.array(stepV)),
  event: v.optional(v.boolean()),
  goalId: v.optional(v.id("goals")),
  externalId: v.optional(v.string()),
  prepFor: v.optional(v.id("tasks")),
};

/** A patch's fields; null clears one. */
const patchFields = {
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
  externalId: nullable(v.string()),
  prepFor: nullable(v.id("tasks")),
};

type NewTask = Omit<Tasks.TaskFields, "title"> & { title?: string; text?: string };

/** Adds one task from a sentence or from fields, and lists it under the agent. */
async function addOne(ctx: MutationCtx, ownerId: string, agent: string, input: NewTask) {
  const { text, title, ...fields } = input;
  if (!text && !title) throw new ConvexError("Pass either text or a title.");
  const addedBy = Activity.agentName(agent);
  const taskId = text
    ? await Tasks.addFromText(ctx, ownerId, text, { source: "agent", defaults: fields, addedBy })
    : await Tasks.createTask(ctx, ownerId, { ...fields, title: title! }, { source: "agent", addedBy });
  const task = owned(await ctx.db.get(taskId), ownerId, "task");
  await Activity.record(ctx, ownerId, agent, { kind: "add", taskId, title: task.title });
  return task;
}

/** Changes one task and lists the change with what Undo puts back. */
async function updateOne(
  ctx: MutationCtx,
  ownerId: string,
  agent: string,
  taskId: Id<"tasks">,
  patch: Tasks.TaskPatch,
) {
  const was = owned(await ctx.db.get(taskId), ownerId, "task");
  const keys = Object.keys(patch).filter((k) => patch[k as keyof typeof patch] !== undefined);
  await Tasks.updateTask(ctx, ownerId, taskId, patch);
  // Clearing the deadline clears the due time with it, so Undo must bring both back.
  if (patch.deadline === null && patch.dueTime === undefined && was.dueTime !== undefined)
    keys.push("dueTime");
  const onlyWhen = keys.every((k) => k === "date" || k === "time");
  await Activity.record(ctx, ownerId, agent, {
    kind: onlyWhen ? "move" : "change",
    taskId,
    title: was.title,
    before: Activity.beforePatch(was, keys),
  });
}

async function completeOne(
  ctx: MutationCtx,
  ownerId: string,
  agent: string,
  taskId: Id<"tasks">,
  date: string | null | undefined,
) {
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
}

async function deleteOne(ctx: MutationCtx, ownerId: string, agent: string, taskId: Id<"tasks">) {
  await Tasks.deleteTask(ctx, ownerId, taskId);
  await Activity.record(ctx, ownerId, agent, { kind: "delete", taskId, title: await titleOf(ctx, taskId) });
}

async function restoreOne(ctx: MutationCtx, ownerId: string, agent: string, taskId: Id<"tasks">) {
  await Tasks.restoreTask(ctx, ownerId, taskId);
  await Activity.record(ctx, ownerId, agent, { kind: "restore", taskId, title: await titleOf(ctx, taskId) });
}

export const add_task = internalMutation({
  args: { ...writer, text: v.optional(v.string()), ...taskFields },
  handler: async (ctx, { ownerId, agent, ...input }) => {
    const { _id: taskId } = await addOne(ctx, ownerId, agent, input);
    // The task as saved, so the agent sees what its sentence became.
    return { taskId, task: await Views.oneTask(ctx, ownerId, taskId, await todayOf(ctx, ownerId)) };
  },
});

export const update_task = internalMutation({
  args: { ...writer, taskId: v.id("tasks"), ...patchFields },
  handler: async (ctx, { ownerId, agent, taskId, ...patch }) => {
    await updateOne(ctx, ownerId, agent, taskId, patch);
    return { taskId, task: await Views.oneTask(ctx, ownerId, taskId, await todayOf(ctx, ownerId)) };
  },
});

export const complete_task = internalMutation({
  args: { ...writer, taskId: v.id("tasks"), date: nullable(v.string()) },
  handler: async (ctx, { ownerId, agent, taskId, date }) => completeOne(ctx, ownerId, agent, taskId, date),
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
    await deleteOne(ctx, ownerId, agent, taskId);
    return { taskId };
  },
});

export const restore_task = internalMutation({
  args: { ...writer, taskId: v.id("tasks") },
  handler: async (ctx, { ownerId, agent, taskId }) => {
    await restoreOne(ctx, ownerId, agent, taskId);
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
  args: {
    ...writer,
    title: v.string(),
    target: v.number(),
    spaceId: v.optional(v.id("spaces")),
    goalId: v.optional(v.id("goals")),
  },
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
    why: v.optional(v.string()),
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
    why: nullable(v.string()),
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

/** The person's today, for a write's reply. */
async function todayOf(ctx: QueryCtx, ownerId: string) {
  return todayIn((await getProfile(ctx, ownerId)).timeZone);
}

async function titleOf(ctx: QueryCtx, taskId: Id<"tasks">): Promise<string> {
  return (await ctx.db.get(taskId))?.title ?? "A task";
}

// Batches, sync, search, ranges and undo. A batch runs in one transaction; an item Kriyan refuses
// (a bad date, a task that isn't there) is reported in its place and the rest still go through.

const MAX_BATCH = 100;

type Outcome<R> = ({ index: number; ok: true } & R) | { index: number; ok: false; error: string };

async function each<T, R extends object>(items: T[], run: (item: T) => Promise<R>): Promise<Outcome<R>[]> {
  if (items.length > MAX_BATCH) throw new ConvexError(`Send at most ${MAX_BATCH} items at a time.`);
  const out: Outcome<R>[] = [];
  for (const [index, item] of items.entries()) {
    try {
      out.push({ index, ok: true, ...(await run(item)) });
    } catch (error) {
      // Only Kriyan's own refusals are an item's fault; anything else is a bug and fails the call.
      if (!(error instanceof ConvexError)) throw error;
      out.push({ index, ok: false, error: String(error.data) });
    }
  }
  return out;
}

const failed = (results: Outcome<object>[]) => results.filter((r) => !r.ok).length;

/**
 * Ids inside batch items arrive as plain strings, so one mistyped id fails its own item with a
 * message instead of failing the whole batch at the validator.
 */
function idIn<T extends TableNames>(ctx: QueryCtx, table: T, raw: string, what: string): Id<T> {
  const id = ctx.db.normalizeId(table, raw);
  if (!id) throw new ConvexError(`That ${what} doesn't exist or isn't yours.`);
  return id;
}

function refsIn<T extends { spaceId?: string | null; goalId?: string | null; prepFor?: string | null }>(
  ctx: QueryCtx,
  item: T,
) {
  const { spaceId, goalId, prepFor, ...rest } = item;
  return {
    ...rest,
    ...(prepFor === undefined
      ? {}
      : { prepFor: prepFor === null ? null : idIn(ctx, "tasks", prepFor, "task to prepare for") }),
    ...(spaceId === undefined
      ? {}
      : { spaceId: spaceId === null ? null : idIn(ctx, "spaces", spaceId, "space") }),
    ...(goalId === undefined ? {} : { goalId: goalId === null ? null : idIn(ctx, "goals", goalId, "goal") }),
  };
}

/** One task to add in add_tasks: add_task's input, with ids as strings. */
const newTaskV = v.object({
  ...taskFields,
  text: v.optional(v.string()),
  spaceId: v.optional(v.string()),
  goalId: v.optional(v.string()),
  prepFor: v.optional(v.string()),
});

/** One patch in update_tasks or upsert_tasks: update_task's fields, with ids as strings. */
const patchItem = {
  ...patchFields,
  spaceId: nullable(v.string()),
  goalId: nullable(v.string()),
  prepFor: nullable(v.string()),
};

export const add_tasks = internalMutation({
  args: { ...writer, tasks: v.array(newTaskV) },
  handler: async (ctx, { ownerId, agent, tasks }) => {
    const { map } = await Views.spaceMap(ctx, ownerId);
    const results = await each(tasks, async (item) => {
      const task = await addOne(ctx, ownerId, agent, refsIn(ctx, item) as NewTask);
      return { task: Views.taskRow(task, map) };
    });
    return { added: results.length - failed(results), failed: failed(results), results };
  },
});

export const update_tasks = internalMutation({
  args: { ...writer, updates: v.array(v.object({ taskId: v.string(), ...patchItem })) },
  handler: async (ctx, { ownerId, agent, updates }) => {
    const { map } = await Views.spaceMap(ctx, ownerId);
    const results = await each(updates, async ({ taskId: raw, ...item }) => {
      const taskId = idIn(ctx, "tasks", raw, "task");
      await updateOne(ctx, ownerId, agent, taskId, refsIn(ctx, item) as Tasks.TaskPatch);
      return { task: Views.taskRow(owned(await ctx.db.get(taskId), ownerId, "task"), map) };
    });
    return { updated: results.length - failed(results), failed: failed(results), results };
  },
});

export const complete_tasks = internalMutation({
  args: { ...writer, tasks: v.array(v.object({ taskId: v.string(), date: nullable(v.string()) })) },
  handler: async (ctx, { ownerId, agent, tasks }) => {
    const results = await each(tasks, async ({ taskId, date }) =>
      completeOne(ctx, ownerId, agent, idIn(ctx, "tasks", taskId, "task"), date),
    );
    return { completed: results.length - failed(results), failed: failed(results), results };
  },
});

export const delete_tasks = internalMutation({
  args: { ...writer, taskIds: v.array(v.string()) },
  handler: async (ctx, { ownerId, agent, taskIds }) => {
    const results = await each(taskIds, async (raw) => {
      const taskId = idIn(ctx, "tasks", raw, "task");
      await deleteOne(ctx, ownerId, agent, taskId);
      return { taskId };
    });
    return { deleted: results.length - failed(results), failed: failed(results), results };
  },
});

export const restore_tasks = internalMutation({
  args: { ...writer, taskIds: v.array(v.string()) },
  handler: async (ctx, { ownerId, agent, taskIds }) => {
    const results = await each(taskIds, async (raw) => {
      const taskId = idIn(ctx, "tasks", raw, "task");
      await restoreOne(ctx, ownerId, agent, taskId);
      return { taskId };
    });
    return { restored: results.length - failed(results), failed: failed(results), results };
  },
});

/** Sorted keys, so a repeat rule sent with its keys in another order still reads as the same. */
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}

/** What a field reads as once saved: an empty list or a switched-off event is the same as none. */
function saved(key: string, value: unknown): unknown {
  if (value === undefined || value === null)
    return key === "event" ? false : key === "reminders" || key === "steps" ? [] : null;
  if (key === "title" || key === "externalId") return String(value).trim();
  if (key === "steps")
    return (value as Tasks.Step[]).map((st) => ({ title: st.title.trim(), done: st.done }));
  return value;
}

type UpsertItem = Tasks.TaskPatch & { externalId: string };

/** Creates the task with this externalId, or changes only the fields that differ, or leaves it. */
async function upsertOne(ctx: MutationCtx, ownerId: string, agent: string, item: UpsertItem) {
  const existing = await Tasks.findByExternalId(ctx, ownerId, item.externalId);
  if (!existing) {
    const fields = Object.fromEntries(Object.entries(item).filter(([, v]) => v !== null)) as NewTask;
    if (!fields.title) throw new ConvexError("A new task needs a title.");
    const task = await addOne(ctx, ownerId, agent, fields);
    return { status: "created" as const, task };
  }
  // The person deleted it; a morning sync shouldn't bring it back behind their back.
  if (existing.deletedAt !== undefined) return { status: "skipped" as const, task: existing };
  const differs = (key: string, value: unknown) =>
    stable(saved(key, value)) !== stable(saved(key, (existing as Record<string, unknown>)[key]));
  const sameRule = item.repeat === undefined || !differs("repeat", item.repeat);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (value === undefined || key === "externalId" || !differs(key, value)) continue;
    // A repeat's date moves on as occurrences pass; a sync sending the series' first date again
    // under the same rule isn't asking to move it back.
    if (key === "date" && existing.repeat && sameRule && value === existing.repeatFirst) continue;
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) return { status: "unchanged" as const, task: existing };
  await updateOne(ctx, ownerId, agent, existing._id, patch as Tasks.TaskPatch);
  return { status: "updated" as const, task: owned(await ctx.db.get(existing._id), ownerId, "task") };
}

export const upsert_tasks = internalMutation({
  args: { ...writer, tasks: v.array(v.object({ ...patchItem, externalId: v.string() })) },
  handler: async (ctx, { ownerId, agent, tasks }) => {
    const { map } = await Views.spaceMap(ctx, ownerId);
    const counts = { created: 0, updated: 0, unchanged: 0, skipped: 0 };
    const results = await each(tasks, async (item) => {
      const { status, task } = await upsertOne(ctx, ownerId, agent, refsIn(ctx, item) as UpsertItem);
      counts[status]++;
      return { status, task: Views.taskRow(task, map) };
    });
    return { ...counts, failed: failed(results), results };
  },
});

export const search_tasks = internalQuery({
  args: {
    ...read,
    text: v.optional(v.string()),
    spaceId: v.optional(v.id("spaces")),
    includeChildSpaces: v.optional(v.boolean()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    deadlineFrom: v.optional(v.string()),
    deadlineTo: v.optional(v.string()),
    status: v.optional(v.union(v.literal("open"), v.literal("done"), v.literal("deleted"), v.literal("any"))),
    kind: v.optional(v.union(v.literal("event"), v.literal("task"))),
    addedBy: v.optional(v.string()),
    externalId: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, { ownerId, today: _today, ...filters }) => Search.searchTasks(ctx, ownerId, filters),
});

export const get_range = internalQuery({
  args: { ...read, start: v.string(), end: v.string() },
  handler: async (ctx, { ownerId, today, start, end }) => Views.rangeView(ctx, ownerId, start, end, today),
});

export const list_changes = internalQuery({
  // `by`, not `agent`: the HTTP layer takes `agent` as the caller's own name.
  args: { ...read, days: v.optional(v.number()), by: v.optional(v.string()) },
  handler: async (ctx, { ownerId, today, days = 7, by }) => {
    if (!Number.isInteger(days) || days < 1 || days > Activity.CHANGES_DAYS)
      throw new ConvexError(`Ask for 1 to ${Activity.CHANGES_DAYS} days.`);
    const { timeZone } = await getProfile(ctx, ownerId);
    const since = Activity.startOfDay(addDays(today, 1 - days), timeZone);
    return { runs: await Activity.runs(ctx, ownerId, since, by) };
  },
});

export const undo_changes = internalMutation({
  args: { ...writer, runId: v.optional(v.string()), actionIds: v.optional(v.array(v.string())) },
  handler: async (ctx, { ownerId, runId, actionIds }) => {
    if ((runId === undefined) === (actionIds === undefined))
      throw new ConvexError("Pass either runId (a whole run from list_changes) or actionIds.");
    let ids: string[] = actionIds ?? [];
    if (runId !== undefined) {
      const { timeZone } = await getProfile(ctx, ownerId);
      const since = Activity.startOfDay(addDays(todayIn(timeZone), 1 - Activity.CHANGES_DAYS), timeZone);
      const run = (await Activity.runs(ctx, ownerId, since)).find((r) => r.runId === runId);
      if (!run)
        throw new ConvexError("There's no run with that id in the last 31 days; list_changes lists them.");
      // Newest first, so a change made after another is taken back before it.
      ids = run.changes
        .filter((c) => c.undoable)
        .map((c) => c.actionId)
        .reverse();
    }
    const results = await each(ids, async (raw) => {
      const actionId = idIn(ctx, "agentActions", raw, "change");
      await Activity.undo(ctx, ownerId, actionId);
      return { actionId };
    });
    return { undone: results.length - failed(results), failed: failed(results), results };
  },
});

export const delete_space = internalMutation({
  args: { ...writer, spaceId: v.id("spaces") },
  handler: async (ctx, { ownerId, agent, spaceId }) => {
    const space = owned(await ctx.db.get(spaceId), ownerId, "space");
    const open = await ctx.db
      .query("tasks")
      .withIndex("by_owner_and_spaceId_and_deletedAt_and_doneAt", (q) =>
        q.eq("ownerId", ownerId).eq("spaceId", spaceId).eq("deletedAt", undefined).eq("doneAt", undefined),
      )
      .take(1000);
    const children = await ctx.db
      .query("spaces")
      .withIndex("by_owner_and_parentId", (q) => q.eq("ownerId", ownerId).eq("parentId", spaceId))
      .take(500);
    await Spaces.archiveSpace(ctx, ownerId, spaceId);
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `Archived space ${space.name}` });
    return {
      spaceId,
      archived: true,
      openTasksKept: open.length,
      spacesMovedToTop: children.filter((c) => c.archivedAt === undefined).length,
    };
  },
});

export const update_habit = internalMutation({
  args: {
    ...writer,
    habitId: v.id("habits"),
    title: v.optional(v.string()),
    target: v.optional(v.number()),
    spaceId: nullable(v.id("spaces")),
    goalId: nullable(v.id("goals")),
  },
  handler: async (ctx, { ownerId, agent, habitId, ...patch }) => {
    await Progress.updateHabit(ctx, ownerId, habitId, patch);
    const habit = owned(await ctx.db.get(habitId), ownerId, "habit");
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `Habit ${habit.title}` });
    return { habitId };
  },
});

export const delete_habit = internalMutation({
  args: { ...writer, habitId: v.id("habits") },
  handler: async (ctx, { ownerId, agent, habitId }) => {
    await Progress.updateHabit(ctx, ownerId, habitId, { archived: true });
    const habit = owned(await ctx.db.get(habitId), ownerId, "habit");
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `Archived habit ${habit.title}` });
    return { habitId, archived: true };
  },
});

export const delete_goal = internalMutation({
  args: { ...writer, goalId: v.id("goals") },
  handler: async (ctx, { ownerId, agent, goalId }) => {
    await Progress.updateGoal(ctx, ownerId, goalId, { archived: true });
    const goal = owned(await ctx.db.get(goalId), ownerId, "goal");
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `Archived goal ${goal.title}` });
    return { goalId, archived: true };
  },
});

export const skip_occurrence = internalMutation({
  args: { ...writer, taskId: v.id("tasks"), date: nullable(v.string()) },
  handler: async (ctx, { ownerId, agent, taskId, date }) => {
    const was: Doc<"tasks"> = owned(await ctx.db.get(taskId), ownerId, "task");
    // Like a tick: a retried call must not skip the next occurrence too.
    if (date !== undefined && date !== (was.date ?? null))
      throw new ConvexError(
        was.date
          ? `That task is on ${formatDay(was.date, todayIn((await getProfile(ctx, ownerId)).timeZone))} now, so nothing was skipped.`
          : "That task has no date now, so nothing was skipped.",
      );
    const skipped = await Tasks.skipOccurrence(ctx, ownerId, taskId);
    // The last occurrence has nothing after it and goes to the trash; Undo restores it.
    await Activity.record(
      ctx,
      ownerId,
      agent,
      skipped.next
        ? { kind: "move", taskId, title: was.title, before: { date: was.date ?? null } }
        : { kind: "delete", taskId, title: was.title },
    );
    return { taskId, skipped: skipped.date, next: skipped.next };
  },
});

export const get_settings = internalQuery({
  args: read,
  handler: async (ctx, { ownerId }) => Profile.settingsView(ctx, ownerId),
});

export const update_settings = internalMutation({
  args: {
    ...writer,
    dayStart: v.optional(v.number()),
    dayEnd: v.optional(v.number()),
    dailyCapacity: v.optional(v.number()),
    defaultReminders: v.optional(v.array(reminderV)),
    reviewTime: v.optional(v.number()),
    semesterStart: nullable(v.string()),
    semesterEnd: nullable(v.string()),
    todayLayout: v.optional(todayLayoutV),
    earlierWindow: v.optional(earlierWindowV),
    showSpace: v.optional(v.boolean()),
    hideDone: v.optional(v.boolean()),
    nowBadge: v.optional(v.boolean()),
  },
  handler: async (ctx, { ownerId, agent, ...patch }) => {
    await Profile.updateSettings(ctx, ownerId, patch);
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: "Changed settings" });
    return { settings: await Profile.settingsView(ctx, ownerId) };
  },
});

// Routines and goal logs. Like habits and goals, they're listed for the person as "other"
// changes, which Undo in the app doesn't take back.

export const list_routines = internalQuery({
  args: read,
  handler: async (ctx, { ownerId }) => ({ routines: await Routines.routineList(ctx, ownerId) }),
});

export const add_routine = internalMutation({
  args: {
    ...writer,
    title: v.string(),
    time: v.number(),
    parts: v.array(routinePartV),
    spaceId: v.optional(v.id("spaces")),
  },
  handler: async (ctx, { ownerId, agent, ...input }) => {
    const routineId = await Routines.createRoutine(ctx, ownerId, input);
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `New routine ${input.title.trim()}` });
    return { routineId };
  },
});

export const update_routine = internalMutation({
  args: {
    ...writer,
    routineId: v.id("routines"),
    title: v.optional(v.string()),
    time: v.optional(v.number()),
    parts: v.optional(v.array(routinePartV)),
    spaceId: nullable(v.id("spaces")),
  },
  handler: async (ctx, { ownerId, agent, routineId, ...patch }) => {
    await Routines.updateRoutine(ctx, ownerId, routineId, patch);
    const routine = owned(await ctx.db.get(routineId), ownerId, "routine");
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `Routine ${routine.title}` });
    return { routineId };
  },
});

export const delete_routine = internalMutation({
  args: { ...writer, routineId: v.id("routines") },
  handler: async (ctx, { ownerId, agent, routineId }) => {
    await Routines.archiveRoutine(ctx, ownerId, routineId);
    const routine = owned(await ctx.db.get(routineId), ownerId, "routine");
    await Activity.record(ctx, ownerId, agent, { kind: "other", title: `Archived routine ${routine.title}` });
    return { routineId, archived: true };
  },
});

export const tick_routine = internalMutation({
  args: {
    ...writer,
    routineId: v.id("routines"),
    index: v.optional(v.number()),
    done: v.boolean(),
    date: v.optional(v.string()),
  },
  handler: async (ctx, { ownerId, agent, routineId, index, done, date }) => {
    const day = date ?? (await todayOf(ctx, ownerId));
    if (index === undefined) await Routines.tickAll(ctx, ownerId, { routineId, date: day, done });
    else await Routines.tickPart(ctx, ownerId, { routineId, index, date: day, done });
    const routine = owned(await ctx.db.get(routineId), ownerId, "routine");
    const what = index === undefined ? routine.title : `${routine.parts[index]!.title} in ${routine.title}`;
    await Activity.record(ctx, ownerId, agent, {
      kind: "other",
      title: `${done ? "Ticked" : "Unticked"} ${what}`,
    });
    const [view] = (await Routines.routineViews(ctx, ownerId, day, () => null)).filter(
      (r) => r._id === routineId,
    );
    return {
      routineId,
      date: day,
      done: view?.done ?? false,
      streak: view?.streak ?? 0,
      parts: view?.parts ?? [],
    };
  },
});

export const log_goal = internalMutation({
  args: { ...writer, goalId: v.id("goals"), value: v.number(), date: v.optional(v.string()) },
  handler: async (ctx, { ownerId, agent, ...input }) => {
    await Progress.logGoal(ctx, ownerId, input);
    const goal = owned(await ctx.db.get(input.goalId), ownerId, "goal");
    await Activity.record(ctx, ownerId, agent, {
      kind: "other",
      title: `Logged ${goal.title}: ${input.value}${goal.unit ? ` ${goal.unit}` : ""}`,
    });
    return { goalId: goal._id, current: goal.current };
  },
});
