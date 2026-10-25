// Agents' search: find tasks by words, space, dates, status, kind, the agent that added them or
// their source id, without reading whole views. Pages run newest first by creation, and a cursor
// carries on where the last page stopped.

import { ConvexError } from "convex/values";
import { isCivilDate } from "@kriyan/core/dates";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { owned } from "./owner";
import { findByExternalId } from "./tasks";
import { descendants, spaceMap, taskRow, type TaskRow, type TaskStatus } from "./views";

export interface SearchFilters {
  /** Every word must appear in the title or the note, in any case. */
  text?: string;
  spaceId?: Id<"spaces">;
  /** On by default: a parent space holds what its spaces hold. */
  includeChildSpaces?: boolean;
  dateFrom?: string;
  dateTo?: string;
  deadlineFrom?: string;
  deadlineTo?: string;
  status?: TaskStatus | "any";
  kind?: "event" | "task";
  addedBy?: string;
  externalId?: string;
  limit?: number;
  cursor?: string;
}

export interface SearchResult {
  tasks: TaskRow[];
  /** Pass it back to read the next page; null when there's nothing more. */
  cursor: string | null;
}

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
/**
 * Rows read per call at most. A narrow search over years of tasks may fill less than a page
 * before this; the cursor then carries on, so nothing is missed.
 */
const SCAN = 1000;

function civil(value: string | undefined, what: string): string | undefined {
  if (value !== undefined && !isCivilDate(value))
    throw new ConvexError(`The ${what} must be a date like 2026-10-13.`);
  return value;
}

const inRange = (value: string | undefined, from?: string, to?: string) =>
  (from === undefined && to === undefined) ||
  (value !== undefined && (from === undefined || value >= from) && (to === undefined || value <= to));

export async function searchTasks(
  ctx: QueryCtx,
  ownerId: string,
  filters: SearchFilters,
): Promise<SearchResult> {
  const limit = filters.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
    throw new ConvexError(`The limit is 1 to ${MAX_LIMIT}.`);
  const dateFrom = civil(filters.dateFrom, "dateFrom");
  const dateTo = civil(filters.dateTo, "dateTo");
  const deadlineFrom = civil(filters.deadlineFrom, "deadlineFrom");
  const deadlineTo = civil(filters.deadlineTo, "deadlineTo");
  let before: number | undefined;
  if (filters.cursor !== undefined) {
    before = Number(filters.cursor);
    if (!Number.isFinite(before)) throw new ConvexError("That cursor isn't one search_tasks gave.");
  }
  const { map, tree } = await spaceMap(ctx, ownerId);
  let spaces: Set<string> | null = null;
  if (filters.spaceId) {
    owned(await ctx.db.get(filters.spaceId), ownerId, "space");
    spaces = new Set<string>([
      filters.spaceId,
      ...(filters.includeChildSpaces === false ? [] : descendants(filters.spaceId, tree)),
    ]);
  }
  const words = (filters.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const status = filters.status ?? "open";
  const addedBy = filters.addedBy?.trim().toLowerCase();

  const matches = (t: Doc<"tasks">): boolean => {
    const row = t.deletedAt !== undefined ? "deleted" : t.doneAt !== undefined ? "done" : "open";
    if (status !== "any" && row !== status) return false;
    if (spaces && (!t.spaceId || !spaces.has(t.spaceId))) return false;
    if (filters.kind && t.event !== (filters.kind === "event")) return false;
    if (addedBy !== undefined && t.addedBy?.toLowerCase() !== addedBy) return false;
    if (!inRange(t.date, dateFrom, dateTo)) return false;
    if (!inRange(t.deadline, deadlineFrom, deadlineTo)) return false;
    if (words.length) {
      const haystack = `${t.title}\n${t.note ?? ""}`.toLowerCase();
      if (!words.every((w) => haystack.includes(w))) return false;
    }
    return true;
  };

  // A source id names one task: read it through its index, not a scan.
  if (filters.externalId !== undefined) {
    const task = await findByExternalId(ctx, ownerId, filters.externalId);
    return { tasks: task && matches(task) ? [taskRow(task, map)] : [], cursor: null };
  }

  const found: { row: TaskRow; at: number }[] = [];
  let scanned = 0;
  let last: number | undefined;
  const rows = ctx.db
    .query("tasks")
    .withIndex("by_owner", (q) =>
      before === undefined ? q.eq("ownerId", ownerId) : q.eq("ownerId", ownerId).lt("_creationTime", before),
    )
    .order("desc");
  for await (const task of rows) {
    scanned++;
    last = task._creationTime;
    if (matches(task)) found.push({ row: taskRow(task, map), at: task._creationTime });
    // One more than a page tells whether another page exists, without returning it.
    if (found.length > limit || scanned >= SCAN) break;
  }
  if (found.length > limit) {
    const page = found.slice(0, limit);
    return { tasks: page.map((f) => f.row), cursor: String(page.at(-1)!.at) };
  }
  return {
    tasks: found.map((f) => f.row),
    cursor: scanned >= SCAN && last !== undefined ? String(last) : null,
  };
}
