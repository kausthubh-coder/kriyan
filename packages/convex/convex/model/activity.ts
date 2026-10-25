// What agents did through the API. Each change an agent makes is written here with what Undo
// needs, so Today can say "Codex added 3 at 07:00" and Ask can list each change with Undo.

import { ConvexError, type Infer } from "convex/values";
import { groupRuns, runSummary } from "@kriyan/core/activity";
import { zonedInstant, type CivilDate } from "@kriyan/core/dates";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { actionKindV, taskBeforeV } from "../validators";
import * as Tasks from "./tasks";

export type ActionKind = Infer<typeof actionKindV>;
export type TaskBefore = Infer<typeof taskBeforeV>;

/** How agents are named when the caller gave no name. */
export const UNNAMED = "An agent";

/** An agent's name as people see it: trimmed, at most 40 characters. */
export function agentName(raw: string | undefined | null): string {
  return raw?.trim().replace(/\s+/g, " ").slice(0, 40) || UNNAMED;
}

export async function record(
  ctx: MutationCtx,
  ownerId: string,
  agent: string,
  entry: {
    kind: ActionKind;
    title: string;
    taskId?: Id<"tasks">;
    before?: TaskBefore;
    completion?: Doc<"agentActions">["completion"];
  },
): Promise<void> {
  await ctx.db.insert("agentActions", {
    ownerId,
    agent: agentName(agent),
    kind: entry.kind,
    title: entry.title.slice(0, 200),
    ...(entry.taskId ? { taskId: entry.taskId } : {}),
    ...(entry.before ? { before: entry.before } : {}),
    ...(entry.completion ? { completion: entry.completion } : {}),
  });
}

/** The fields a patch is about to overwrite, as they are now; null for the ones that are empty. */
export function beforePatch(task: Doc<"tasks">, keys: string[]): TaskBefore {
  const before: Record<string, unknown> = {};
  for (const key of keys) {
    if (key === "title") before.title = task.title;
    else before[key] = (task as Record<string, unknown>)[key] ?? null;
  }
  return before as TaskBefore;
}

export interface ActionView {
  _id: Id<"agentActions">;
  agent: string;
  kind: ActionKind;
  title: string;
  taskId: Id<"tasks"> | null;
  at: number;
  undone: boolean;
  /** Whether Undo can put it back. */
  undoable: boolean;
}

const UNDOABLE: ActionKind[] = ["add", "change", "move", "done", "delete", "restore"];

function view(row: Doc<"agentActions">): ActionView {
  return {
    _id: row._id,
    agent: row.agent,
    kind: row.kind,
    title: row.title,
    taskId: row.taskId ?? null,
    at: row._creationTime,
    undone: row.undoneAt !== undefined,
    undoable: UNDOABLE.includes(row.kind) && row.undoneAt === undefined,
  };
}

/** The newest actions first, back to `since` (an instant), at most `limit`. */
export async function recent(
  ctx: QueryCtx,
  ownerId: string,
  since: number,
  limit = 200,
): Promise<ActionView[]> {
  const rows = await ctx.db
    .query("agentActions")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId).gte("_creationTime", since))
    .order("desc")
    .take(limit);
  return rows.map(view);
}

/** The start of `date` in the person's zone, as an instant. */
export function startOfDay(date: CivilDate, timeZone: string): number {
  return zonedInstant(date, 0, timeZone);
}

/** Puts back what one agent action changed. Undoing twice changes nothing the second time. */
export async function undo(ctx: MutationCtx, ownerId: string, id: Id<"agentActions">): Promise<void> {
  const row = await ctx.db.get(id);
  if (!row || row.ownerId !== ownerId) throw new ConvexError("That change doesn't exist or isn't yours.");
  if (row.undoneAt !== undefined) return;
  if (!UNDOABLE.includes(row.kind) || !row.taskId)
    throw new ConvexError("That change can't be undone from here.");
  const task = await ctx.db.get(row.taskId);
  if (!task || task.ownerId !== ownerId) throw new ConvexError("That task no longer exists.");
  switch (row.kind) {
    case "add":
      if (task.deletedAt === undefined) await Tasks.deleteTask(ctx, ownerId, row.taskId);
      break;
    case "change":
    case "move":
      if (task.deletedAt !== undefined)
        throw new ConvexError("That task was deleted since; restore it first.");
      if (row.before) await Tasks.updateTask(ctx, ownerId, row.taskId, row.before);
      break;
    case "done":
      if (!row.completion) throw new ConvexError("That tick can't be undone from here.");
      await Tasks.undoComplete(ctx, ownerId, row.taskId, row.completion);
      break;
    case "delete":
      await Tasks.restoreTask(ctx, ownerId, row.taskId);
      break;
    case "restore":
      if (task.deletedAt === undefined) await Tasks.deleteTask(ctx, ownerId, row.taskId);
      break;
  }
  await ctx.db.patch(id, { undoneAt: Date.now() });
}

/** How far back an agent can list and undo changes, like Ask's longest list. */
export const CHANGES_DAYS = 31;

export interface ChangeRun {
  /** The run's first change; undo_changes takes it to undo the whole run. */
  runId: Id<"agentActions">;
  agent: string;
  /** When the run started, as an ISO instant. */
  at: string;
  /** "added 31 and changed 2", counting what wasn't undone. */
  summary: string;
  changes: {
    actionId: Id<"agentActions">;
    kind: ActionKind;
    title: string;
    taskId: Id<"tasks"> | null;
    undone: boolean;
    undoable: boolean;
  }[];
}

/** Agents' changes since an instant, grouped into runs the way Ask shows them, newest run first. */
export async function runs(
  ctx: QueryCtx,
  ownerId: string,
  since: number,
  agent?: string,
): Promise<ChangeRun[]> {
  const wanted = agent?.trim().toLowerCase();
  const actions = (await recent(ctx, ownerId, since, 500)).filter(
    (a) => wanted === undefined || a.agent.toLowerCase() === wanted,
  );
  return groupRuns(actions).map((run) => ({
    runId: run.actions[0]!._id,
    agent: run.agent,
    at: new Date(run.at).toISOString(),
    summary: runSummary(run.actions),
    changes: run.actions.map((a) => ({
      actionId: a._id,
      kind: a.kind,
      title: a.title,
      taskId: a.taskId,
      undone: a.undone,
      undoable: a.undoable,
    })),
  }));
}
