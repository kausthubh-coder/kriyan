// Queries for the app's screens. Each takes the person's today, since queries can't read the clock.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireOwner } from "./model/owner";
import { listSpaces, spaceTree } from "./model/spaces";
import * as Focus from "./model/focus";
import * as Views from "./model/views";

export const today = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => Views.todayView(ctx, await requireOwner(ctx), today),
});

export const week = query({
  args: { start: v.string(), today: v.string() },
  handler: async (ctx, { start, today }) => Views.weekView(ctx, await requireOwner(ctx), start, today),
});

/** Open things due on each day of a range (Today's month and week dots), and how many have no day. */
export const due = query({
  args: { start: v.string(), end: v.string(), today: v.string() },
  handler: async (ctx, { start, end, today }) =>
    Views.dueView(ctx, await requireOwner(ctx), start, end, today),
});

export const inbox = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => Views.inboxView(ctx, await requireOwner(ctx), today),
});

export const goals = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => Views.goalsList(ctx, await requireOwner(ctx), today),
});

export const trash = query({
  args: {},
  handler: async (ctx) => Views.trashView(ctx, await requireOwner(ctx)),
});

export const space = query({
  args: { id: v.id("spaces"), today: v.string() },
  handler: async (ctx, { id, today }) => Views.spaceView(ctx, await requireOwner(ctx), id, today),
});

export const progress = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => Views.progressView(ctx, await requireOwner(ctx), today),
});

/** Focused minutes today and this week, by day and by goal. */
export const focus = query({
  args: { today: v.string() },
  handler: async (ctx, { today }) => Focus.focusSummary(ctx, await requireOwner(ctx), today),
});

export const spaces = query({
  args: {},
  handler: async (ctx) => spaceTree(await listSpaces(ctx, await requireOwner(ctx))),
});

export const task = query({
  // A string, not v.id: the id comes from a link, and a mistyped link should read as "not
  // found" (null), not throw a validator error into the screen.
  args: { id: v.string() },
  handler: async (ctx, { id: raw }) => {
    const ownerId = await requireOwner(ctx);
    const id = ctx.db.normalizeId("tasks", raw);
    if (!id) return null;
    const task = await ctx.db.get(id);
    if (!task || task.ownerId !== ownerId || task.deletedAt !== undefined) return null;
    const tree = spaceTree(await listSpaces(ctx, ownerId));
    const space = tree.find((s) => s._id === task.spaceId);
    const tracked = await Focus.trackedMinutes(ctx, ownerId, task._id);
    // A study session's test, for the sheet's "CSC 316 exam 2 in 7 days".
    const test = task.prepFor ? await ctx.db.get(task.prepFor) : null;
    const prepTest =
      test && test.ownerId === ownerId && test.deletedAt === undefined
        ? { title: test.title, date: test.date ?? null }
        : null;
    return { ...task, spacePath: space?.path ?? null, color: space?.color ?? null, tracked, prepTest };
  },
});
