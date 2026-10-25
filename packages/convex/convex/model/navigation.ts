// What the navigation shows beside each place (the menu, the desktop rail) and a space's page
// by day. A space counts what the spaces inside it hold, like its page does, so a parent whose
// tasks all live in its children never reads as empty.

import { addDays, type CivilDate } from "@kriyan/core/dates";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { descendants, rangeView, spaceMap, type TaskView } from "./views";

const LIMIT = 2000;

/** Open tasks per space, the spaces inside it included. Events and suggestions don't count. */
export async function openCounts(
  ctx: QueryCtx,
  ownerId: string,
): Promise<{ spaceId: Id<"spaces">; open: number }[]> {
  const { tree } = await spaceMap(ctx, ownerId);
  const open = await ctx.db
    .query("tasks")
    .withIndex("by_owner_and_deletedAt_and_doneAt_and_date", (q) =>
      q.eq("ownerId", ownerId).eq("deletedAt", undefined).eq("doneAt", undefined),
    )
    .take(LIMIT);
  const own = new Map<string, number>();
  for (const t of open) {
    if (!t.spaceId || t.event || t.proposedBy !== undefined) continue;
    own.set(t.spaceId, (own.get(t.spaceId) ?? 0) + 1);
  }
  return tree.map((s) => ({
    spaceId: s._id,
    open: [s._id, ...descendants(s._id, tree)].reduce((sum, id) => sum + (own.get(id) ?? 0), 0),
  }));
}

/** How many days a space's page looks ahead. */
export const SPACE_DAYS = 21;

/**
 * A space's next three weeks, one entry per day that has something: what's planned that day
 * (repeats on each of their days) and what's due that day with no day planned. Suggestions and
 * finished ones stay off.
 */
export async function spaceDays(
  ctx: QueryCtx,
  ownerId: string,
  spaceId: Id<"spaces">,
  today: CivilDate,
): Promise<{ date: CivilDate; items: (TaskView & { dueOnly: boolean })[] }[]> {
  const { tree } = await spaceMap(ctx, ownerId);
  const inside = new Set<string>([spaceId, ...descendants(spaceId, tree)]);
  const range = await rangeView(ctx, ownerId, today, addDays(today, SPACE_DAYS - 1), today);
  const mine = (t: TaskView) => t.spaceId !== null && inside.has(t.spaceId) && !t.done && !t.proposedBy;
  return range.days
    .map((d) => ({
      date: d.date,
      items: [
        ...[...d.scheduled, ...d.anytime].filter(mine).map((t) => ({ ...t, dueOnly: false })),
        ...d.deadlines.filter((t) => mine(t) && t.date === null).map((t) => ({ ...t, dueOnly: true })),
      ],
    }))
    .filter((d) => d.items.length > 0);
}
