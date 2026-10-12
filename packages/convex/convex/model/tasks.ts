// The task operations. The app's mutations and the agent API both call these, so a rule
// lives in one place: validation, repeats, reminders, completion and undo.

import { ConvexError } from "convex/values";
import { isCivilDate, todayIn } from "@kriyan/core/dates";
import { firstOccurrence, parseTask } from "@kriyan/core/parse";
import { nextAfterDone, validateRepeat, type Repeat } from "@kriyan/core/repeat";
import { validateReminder, type Reminder } from "@kriyan/core/reminders";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getProfile, owned } from "./owner";
import { scheduleReminders, cancelReminders } from "./reminders";
import { resolveSpacePath } from "./spaces";

export interface TaskFields {
  title: string;
  spaceId?: Id<"spaces">;
  date?: string;
  time?: number;
  length?: number;
  deadline?: string;
  repeat?: Repeat;
  reminders?: Reminder[];
  note?: string;
  event?: boolean;
  goalId?: Id<"goals">;
}

/** A patch: `null` clears a field, `undefined` leaves it alone. */
export type TaskPatch = { [K in keyof TaskFields]?: TaskFields[K] | null };

const MAX_REMINDERS = 10;

function check(fields: Partial<TaskFields>) {
  if (fields.title !== undefined) {
    if (!fields.title.trim()) throw new ConvexError("Give the task a title.");
    if (fields.title.length > 500) throw new ConvexError("Keep the title under 500 characters.");
  }
  for (const key of ["date", "deadline"] as const) {
    const value = fields[key];
    if (value !== undefined && !isCivilDate(value))
      throw new ConvexError(`The ${key} must be a date like 2026-10-13.`);
  }
  if (
    fields.time !== undefined &&
    (!Number.isInteger(fields.time) || fields.time < 0 || fields.time > 1439)
  ) {
    throw new ConvexError("The time must be within the day.");
  }
  if (
    fields.length !== undefined &&
    (!Number.isInteger(fields.length) || fields.length < 1 || fields.length > 1440)
  ) {
    throw new ConvexError("The length must be from 1 minute to 24 hours.");
  }
  if (fields.repeat) {
    const problem = validateRepeat(fields.repeat);
    if (problem) throw new ConvexError(problem);
  }
  if (fields.reminders) {
    if (fields.reminders.length > MAX_REMINDERS)
      throw new ConvexError(`A task can have up to ${MAX_REMINDERS} reminders.`);
    for (const r of fields.reminders) {
      const problem = validateReminder(r);
      if (problem) throw new ConvexError(problem);
    }
  }
  if (fields.note !== undefined && fields.note.length > 50_000)
    throw new ConvexError("Notes can be up to 50,000 characters.");
}

async function checkRefs(
  ctx: MutationCtx,
  ownerId: string,
  fields: { spaceId?: Id<"spaces"> | null; goalId?: Id<"goals"> | null },
) {
  if (fields.spaceId) owned(await ctx.db.get(fields.spaceId), ownerId, "space");
  if (fields.goalId) owned(await ctx.db.get(fields.goalId), ownerId, "goal");
}

export async function createTask(
  ctx: MutationCtx,
  ownerId: string,
  fields: TaskFields,
  options: { source: "app" | "agent"; proposedBy?: string } = { source: "app" },
): Promise<Id<"tasks">> {
  check(fields);
  await checkRefs(ctx, ownerId, fields);
  const profile = await getProfile(ctx, ownerId);
  let date = fields.date;
  if (fields.repeat && !date) date = firstOccurrence(fields.repeat, todayIn(profile.timeZone));
  const reminders = fields.reminders ?? (fields.time !== undefined ? profile.defaultReminders : []);
  const id = await ctx.db.insert("tasks", {
    ownerId,
    title: fields.title.trim(),
    ...(fields.spaceId ? { spaceId: fields.spaceId } : {}),
    ...(date ? { date } : {}),
    ...(fields.time !== undefined ? { time: fields.time } : {}),
    ...(fields.length !== undefined ? { length: fields.length } : {}),
    ...(fields.deadline ? { deadline: fields.deadline } : {}),
    ...(fields.repeat ? { repeat: fields.repeat, repeatFirst: date } : {}),
    reminders,
    ...(fields.note ? { note: fields.note } : {}),
    event: fields.event ?? false,
    ...(fields.goalId ? { goalId: fields.goalId } : {}),
    order: Date.now(),
    source: options.source,
    ...(options.proposedBy ? { proposedBy: options.proposedBy } : {}),
  });
  await scheduleReminders(ctx, id);
  return id;
}

/** Quick add: one sentence becomes a task, creating the #space if it doesn't exist yet. */
export async function addFromText(
  ctx: MutationCtx,
  ownerId: string,
  text: string,
  options: { source: "app" | "agent"; defaults?: Partial<TaskFields> } = { source: "app" },
): Promise<Id<"tasks">> {
  const profile = await getProfile(ctx, ownerId);
  const parsed = parseTask(text, todayIn(profile.timeZone));
  const spaceId = parsed.spaceName
    ? await resolveSpacePath(ctx, ownerId, parsed.spaceName)
    : options.defaults?.spaceId;
  return await createTask(
    ctx,
    ownerId,
    {
      ...options.defaults,
      title: parsed.title || text.trim(),
      ...(spaceId ? { spaceId } : {}),
      ...(parsed.date ? { date: parsed.date } : {}),
      ...(parsed.time !== undefined ? { time: parsed.time } : {}),
      ...(parsed.length !== undefined ? { length: parsed.length } : {}),
      ...(parsed.deadline ? { deadline: parsed.deadline } : {}),
      ...(parsed.repeat ? { repeat: parsed.repeat } : {}),
      ...(parsed.reminders.length ? { reminders: parsed.reminders } : {}),
    },
    { source: options.source },
  );
}

export async function updateTask(
  ctx: MutationCtx,
  ownerId: string,
  id: Id<"tasks">,
  patch: TaskPatch,
): Promise<void> {
  const task = owned(await ctx.db.get(id), ownerId, "task");
  const set: Partial<TaskFields> = {};
  for (const [k, v] of Object.entries(patch))
    if (v !== null && v !== undefined) (set as Record<string, unknown>)[k] = v;
  check(set);
  await checkRefs(ctx, ownerId, patch);
  const next: Partial<Doc<"tasks">> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (next as Record<string, unknown>)[k] = v === null ? undefined : k === "title" ? String(v).trim() : v;
  }
  const repeat = patch.repeat === null ? undefined : (patch.repeat ?? task.repeat);
  const date = patch.date === null ? undefined : (patch.date ?? task.date);
  if (repeat && !date) throw new ConvexError("A repeating task needs a date.");
  // A new rule starts on the task's date. Moving a repeating task moves only this occurrence:
  // the rule keeps its anchor, so the next one still lands on its usual day.
  if (patch.repeat !== undefined || (repeat && !task.repeatFirst))
    next.repeatFirst = repeat ? date : undefined;
  await ctx.db.patch(id, next);
  await scheduleReminders(ctx, id);
}

export interface Completion {
  /** The occurrence that was done, so undo can put it back. */
  date: string | null;
  completionId: Id<"completions">;
  finished: boolean;
  /** Where a repeating task moved to; null when it finished. */
  next: string | null;
}

/** Ticks a task off. A repeating task moves to its next date; it finishes when the repeat ends. */
export async function completeTask(ctx: MutationCtx, ownerId: string, id: Id<"tasks">): Promise<Completion> {
  const task = owned(await ctx.db.get(id), ownerId, "task");
  if (task.doneAt !== undefined) throw new ConvexError("That task is already done.");
  const profile = await getProfile(ctx, ownerId);
  const today = todayIn(profile.timeZone);
  const date = task.date ?? today;
  const completionId = await ctx.db.insert("completions", {
    ownerId,
    taskId: id,
    ...(task.spaceId ? { spaceId: task.spaceId } : {}),
    date,
    doneOn: today,
    minutes: task.length ?? 0,
  });
  const next = task.repeat ? nextAfterDone(task.repeat, task.repeatFirst ?? date, date, today) : null;
  if (next) await ctx.db.patch(id, { date: next });
  else await ctx.db.patch(id, { doneAt: Date.now() });
  if (task.goalId) {
    const goal = await ctx.db.get(task.goalId);
    if (goal && goal.kind === "tasks") await ctx.db.patch(goal._id, { current: goal.current + 1 });
  }
  await scheduleReminders(ctx, id);
  return { date: task.date ?? null, completionId, finished: !next, next };
}

/** Undoes `completeTask`. */
export async function undoComplete(
  ctx: MutationCtx,
  ownerId: string,
  id: Id<"tasks">,
  completion: Completion,
): Promise<void> {
  const task = owned(await ctx.db.get(id), ownerId, "task");
  const row = await ctx.db.get(completion.completionId);
  if (row && row.ownerId === ownerId && row.taskId === id) await ctx.db.delete(row._id);
  await ctx.db.patch(id, { doneAt: undefined, date: completion.date ?? undefined });
  if (task.goalId) {
    const goal = await ctx.db.get(task.goalId);
    if (goal && goal.kind === "tasks")
      await ctx.db.patch(goal._id, { current: Math.max(0, goal.current - 1) });
  }
  await scheduleReminders(ctx, id);
}

/** Reopens a finished task (from the Done list, not as an undo). */
export async function reopenTask(ctx: MutationCtx, ownerId: string, id: Id<"tasks">): Promise<void> {
  const task = owned(await ctx.db.get(id), ownerId, "task");
  if (task.doneAt === undefined) return;
  await ctx.db.patch(id, { doneAt: undefined });
  await scheduleReminders(ctx, id);
}

/** Deletes at once; `restoreTask` brings it back (the app shows Undo). */
export async function deleteTask(ctx: MutationCtx, ownerId: string, id: Id<"tasks">): Promise<void> {
  owned(await ctx.db.get(id), ownerId, "task");
  await ctx.db.patch(id, { deletedAt: Date.now() });
  await cancelReminders(ctx, id);
}

export async function restoreTask(ctx: MutationCtx, ownerId: string, id: Id<"tasks">): Promise<void> {
  const task = await ctx.db.get(id);
  if (!task || task.ownerId !== ownerId) throw new ConvexError("That task doesn't exist or isn't yours.");
  await ctx.db.patch(id, { deletedAt: undefined });
  await scheduleReminders(ctx, id);
}

/** Moves tasks to a day (and optionally a time). Moving a repeating task moves the series. */
export async function moveTasks(
  ctx: MutationCtx,
  ownerId: string,
  ids: Id<"tasks">[],
  to: { date: string | null; time?: number | null },
): Promise<void> {
  for (const id of ids) {
    await updateTask(ctx, ownerId, id, {
      date: to.date,
      ...(to.time !== undefined ? { time: to.time } : {}),
    });
  }
}

/** Accepts or discards an agent's proposed tasks. */
export async function settleProposals(
  ctx: MutationCtx,
  ownerId: string,
  accept: boolean,
  ids?: Id<"tasks">[],
): Promise<number> {
  const rows = ids
    ? (await Promise.all(ids.map((id) => ctx.db.get(id)))).filter(
        (t): t is Doc<"tasks"> => !!t && t.ownerId === ownerId && t.proposedBy !== undefined,
      )
    : (
        await ctx.db
          .query("tasks")
          .withIndex("by_owner_and_proposedBy", (q) => q.eq("ownerId", ownerId).gt("proposedBy", ""))
          .take(200)
      ).filter((t) => t.deletedAt === undefined);
  for (const t of rows) {
    if (accept) await ctx.db.patch(t._id, { proposedBy: undefined });
    else await ctx.db.patch(t._id, { deletedAt: Date.now() });
  }
  return rows.length;
}
