// Routines for the signed-in person. The rules live in model/routines.ts.

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwner } from "./model/owner";
import * as Routines from "./model/routines";
import { routinePartV } from "./validators";

export const add = mutation({
  args: {
    title: v.string(),
    spaceId: v.optional(v.id("spaces")),
    time: v.number(),
    parts: v.array(routinePartV),
  },
  handler: async (ctx, args) => Routines.createRoutine(ctx, await requireOwner(ctx), args),
});

export const update = mutation({
  args: {
    routineId: v.id("routines"),
    title: v.optional(v.string()),
    spaceId: v.optional(v.union(v.id("spaces"), v.null())),
    time: v.optional(v.number()),
    parts: v.optional(v.array(routinePartV)),
  },
  handler: async (ctx, { routineId, ...patch }) =>
    Routines.updateRoutine(ctx, await requireOwner(ctx), routineId, patch),
});

/** Archives it; ticks and habit checks stay. */
export const remove = mutation({
  args: { routineId: v.id("routines") },
  handler: async (ctx, { routineId }) => Routines.archiveRoutine(ctx, await requireOwner(ctx), routineId),
});

/** `date` is the day the routine showed on, from the person's calendar. */
export const tickPart = mutation({
  args: { routineId: v.id("routines"), index: v.number(), date: v.string(), done: v.boolean() },
  handler: async (ctx, args) => Routines.tickPart(ctx, await requireOwner(ctx), args),
});

export const tickAll = mutation({
  args: { routineId: v.id("routines"), date: v.string(), done: v.boolean() },
  handler: async (ctx, args) => Routines.tickAll(ctx, await requireOwner(ctx), args),
});
