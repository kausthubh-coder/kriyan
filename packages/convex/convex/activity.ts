// The activity log: every change an agent (MCP, the CLI, an automation) or Ask makes goes
// through `run`, which snapshots the tasks it will touch, runs the operation in the same
// transaction, and records what changed with the tasks as they were. `undo` puts them back.
// Changes apply at once; the log, not an approval queue, is how the person keeps control.

import { ConvexError, v } from "convex/values";
import type { FunctionReference } from "convex/server";
import { addDays, todayIn } from "@kriyan/core/dates";
import { formatDay } from "@kriyan/core/format";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { getProfile, requireOwner } from "./model/owner";
import { scheduleReminders } from "./model/reminders";
import * as Tasks from "./model/tasks";

const actorV = v.object({ kind: v.union(v.literal("ask"), v.literal("agent")), name: v.string() });
type Actor = { kind: "ask" | "agent"; name: string };

/** Agent operations that change tasks, and so can be undone. Others are logged without Undo. */
const TASK_OPS = new Set([
  "add_task",
  "update_task",
  "complete_task",
  "reopen_task",
  "delete_task",
  "restore_task",
  "move_tasks",
  "close_day",
  "propose_plan",
]);

type AnyMutation = FunctionReference<"mutation", "internal">;
const ops = internal.agent as unknown as Record<string, AnyMutation>;

/** The ids an operation names in its arguments. */
function namedIds(args: Record<string, unknown>): Id<"tasks">[] {
  const one = typeof args.taskId === "string" ? [args.taskId as Id<"tasks">] : [];
  const many = Array.isArray(args.taskIds) ? (args.taskIds as Id<"tasks">[]) : [];
  return [...one, ...many];
}

/** Tasks still open on or before today: what close_day may move. */
async function closeDayCandidates(ctx: MutationCtx, ownerId: string): Promise<Id<"tasks">[]> {
  const today = todayIn((await getProfile(ctx, ownerId)).timeZone);
  const rows = await ctx.db
    .query("tasks")
    .withIndex("by_owner_and_date", (q) => q.eq("ownerId", ownerId).lte("date", today))
    .take(500);
  return rows.filter((t) => t.doneAt === undefined && t.deletedAt === undefined).map((t) => t._id);
}

/** Every id in a result: `taskId`, `taskIds`. */
function resultIds(result: unknown): Id<"tasks">[] {
  if (!result || typeof result !== "object") return [];
  const r = result as { taskId?: unknown; taskIds?: unknown };
  return [
    ...(typeof r.taskId === "string" ? [r.taskId as Id<"tasks">] : []),
    ...(Array.isArray(r.taskIds) ? (r.taskIds as Id<"tasks">[]) : []),
  ];
}

const quote = (title: string) => `“${title}”`;
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

function summarize(
  op: string,
  args: Record<string, unknown>,
  changes: { title: string; before: Doc<"tasks"> | null }[],
  today: string,
): string {
  const [first] = changes;
  const name = first ? quote(first.title) : "";
  const many = changes.length > 1 ? plural(changes.length, "task") : name;
  switch (op) {
    case "add_task":
      return `Added ${name}`;
    case "update_task":
      return `Changed ${name}`;
    case "complete_task":
      return `Finished ${name}`;
    case "reopen_task":
      return `Reopened ${name}`;
    case "delete_task":
      return `Deleted ${name}`;
    case "restore_task":
      return `Restored ${name}`;
    case "move_tasks": {
      const date = args.date as string | null;
      const where = date ? formatDay(date, today) : "no date";
      const time =
        typeof args.time === "number"
          ? ` at ${String(Math.floor(args.time / 60)).padStart(2, "0")}:${String(args.time % 60).padStart(2, "0")}`
          : "";
      return `Moved ${many} to ${where}${time}`;
    }
    case "close_day":
      return `Moved ${plural(changes.length, "task")} to ${formatDay(addDays(today, 1), today)}`;
    case "propose_plan":
      return `Planned ${plural(changes.length, "block")}`;
    case "add_space":
      return `Added the space ${quote(String(args.name ?? ""))}`;
    case "update_space":
      return "Changed a space";
    case "add_habit":
      return `Added the habit ${quote(String(args.title ?? ""))}`;
    case "check_habit":
      return args.done ? "Checked a habit" : "Unchecked a habit";
    case "add_goal":
      return `Added the goal ${quote(String(args.title ?? ""))}`;
    case "update_goal":
      return "Changed a goal";
    default:
      return op.replace(/_/g, " ");
  }
}

/** Runs one operation for `actor` and logs it. Returns the operation's result and the entry. */
export const run = internalMutation({
  args: { ownerId: v.string(), actor: actorV, op: v.string(), args: v.any() },
  handler: async (ctx, { ownerId, actor, op, args }) => {
    const ref = ops[op];
    if (!ref) throw new ConvexError(`There's no operation called "${op}".`);
    const input = (args ?? {}) as Record<string, unknown>;
    const ids = op === "close_day" ? await closeDayCandidates(ctx, ownerId) : namedIds(input);
    const before = new Map<string, Doc<"tasks">>();
    for (const id of ids) {
      const doc = await ctx.db.get(id);
      if (doc && doc.ownerId === ownerId) before.set(id, doc);
    }
    const result = await ctx.runMutation(ref, { ...input, ownerId });
    if (!TASK_OPS.has(op)) {
      const activityId = await record(ctx, ownerId, actor, op, input, []);
      return { result, activityId };
    }
    const touched = new Set<string>(op === "close_day" ? resultIds(result) : [...ids, ...resultIds(result)]);
    const changes = [];
    for (const id of touched) {
      const now = await ctx.db.get(id as Id<"tasks">);
      const was = before.get(id) ?? null;
      if (!now && !was) continue;
      changes.push({
        taskId: id as Id<"tasks">,
        title: (now ?? was)!.title,
        before: was,
        ...(op === "complete_task" && result && typeof result === "object" && "completionId" in result
          ? { completionId: (result as { completionId: Id<"completions"> }).completionId }
          : {}),
      });
    }
    const activityId = await record(ctx, ownerId, actor, op, input, changes);
    return { result, activityId };
  },
});

async function record(
  ctx: MutationCtx,
  ownerId: string,
  actor: Actor,
  op: string,
  args: Record<string, unknown>,
  changes: {
    taskId: Id<"tasks">;
    title: string;
    before: Doc<"tasks"> | null;
    completionId?: Id<"completions">;
  }[],
): Promise<Id<"activity">> {
  const today = todayIn((await getProfile(ctx, ownerId)).timeZone);
  const summary = summarize(op, args, changes, today);
  return ctx.db.insert("activity", {
    ownerId,
    at: Date.now(),
    actor: { kind: actor.kind, name: actor.name.trim().slice(0, 40) || "An agent" },
    op,
    summary,
    changes,
  });
}

/** Recent changes from agents and Ask, newest first. */
export const recent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const ownerId = await requireOwner(ctx);
    const rows = await ctx.db
      .query("activity")
      .withIndex("by_owner_and_at", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .take(Math.min(100, Math.max(1, limit ?? 30)));
    return rows.map((a) => ({
      _id: a._id,
      at: a.at,
      actor: a.actor,
      op: a.op,
      summary: a.summary,
      titles: a.changes.map((c) => c.title),
      canUndo: a.undoneAt === undefined && a.changes.length > 0,
      undone: a.undoneAt !== undefined,
    }));
  },
});

/**
 * Puts every task in an entry back as it was: a task this made is deleted (to Recently
 * deleted, so it can come back), a finished one is reopened with its completion removed, and
 * any other change is replaced by the task as it was.
 */
export const undo = mutation({
  args: { id: v.id("activity") },
  handler: async (ctx, { id }) => {
    const ownerId = await requireOwner(ctx);
    const entry = await ctx.db.get(id);
    if (!entry || entry.ownerId !== ownerId)
      throw new ConvexError("That change doesn't exist or isn't yours.");
    if (entry.undoneAt !== undefined) throw new ConvexError("That change is already undone.");
    for (const change of entry.changes) {
      const now = await ctx.db.get(change.taskId);
      if (!now || now.ownerId !== ownerId) continue;
      if (change.before === null) {
        if (now.deletedAt === undefined) await Tasks.deleteTask(ctx, ownerId, change.taskId);
        continue;
      }
      const was = change.before as Doc<"tasks">;
      if (change.completionId) {
        await Tasks.undoComplete(ctx, ownerId, change.taskId, {
          completionId: change.completionId,
          date: was.date ?? null,
        });
        continue;
      }
      const { _id, _creationTime, ...fields } = was;
      void _id;
      void _creationTime;
      await ctx.db.replace(change.taskId, fields);
      await scheduleReminders(ctx, change.taskId);
    }
    await ctx.db.patch(id, { undoneAt: Date.now() });
    return { undone: entry.changes.length };
  },
});
