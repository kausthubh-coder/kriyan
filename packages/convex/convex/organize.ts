// Spaces, habits and goals for the signed-in person.

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwner } from "./model/owner";
import * as Progress from "./model/progress";
import * as Spaces from "./model/spaces";
import { colorV } from "./validators";

export const addSpace = mutation({
  args: { name: v.string(), color: v.optional(colorV), parentId: v.optional(v.id("spaces")) },
  handler: async (ctx, args) => Spaces.createSpace(ctx, await requireOwner(ctx), args),
});

export const updateSpace = mutation({
  args: {
    id: v.id("spaces"),
    name: v.optional(v.string()),
    color: v.optional(colorV),
    parentId: v.optional(v.union(v.id("spaces"), v.null())),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...patch }) => Spaces.updateSpace(ctx, await requireOwner(ctx), id, patch),
});

export const archiveSpace = mutation({
  args: { id: v.id("spaces") },
  handler: async (ctx, { id }) => Spaces.archiveSpace(ctx, await requireOwner(ctx), id),
});

export const addHabit = mutation({
  args: { title: v.string(), target: v.number(), spaceId: v.optional(v.id("spaces")) },
  handler: async (ctx, args) => Progress.createHabit(ctx, await requireOwner(ctx), args),
});

export const updateHabit = mutation({
  args: {
    id: v.id("habits"),
    title: v.optional(v.string()),
    target: v.optional(v.number()),
    spaceId: v.optional(v.union(v.id("spaces"), v.null())),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => Progress.updateHabit(ctx, await requireOwner(ctx), id, patch),
});

export const checkHabit = mutation({
  args: { id: v.id("habits"), done: v.boolean(), date: v.optional(v.string()) },
  handler: async (ctx, { id, done, date }) =>
    Progress.checkHabit(ctx, await requireOwner(ctx), id, done, date),
});

export const addGoal = mutation({
  args: {
    title: v.string(),
    kind: v.union(v.literal("number"), v.literal("tasks")),
    target: v.number(),
    unit: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    spaceId: v.optional(v.id("spaces")),
  },
  handler: async (ctx, args) => Progress.createGoal(ctx, await requireOwner(ctx), args),
});

export const updateGoal = mutation({
  args: {
    id: v.id("goals"),
    title: v.optional(v.string()),
    target: v.optional(v.number()),
    current: v.optional(v.number()),
    unit: v.optional(v.union(v.string(), v.null())),
    dueDate: v.optional(v.union(v.string(), v.null())),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...patch }) => Progress.updateGoal(ctx, await requireOwner(ctx), id, patch),
});
