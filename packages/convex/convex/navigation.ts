// The navigation's counts and a space's page by day. The rules live in model/navigation.ts.

import { v } from "convex/values";
import { query } from "./_generated/server";
import * as Navigation from "./model/navigation";
import { owned, requireOwner } from "./model/owner";

export const counts = query({
  args: {},
  handler: async (ctx) => Navigation.openCounts(ctx, await requireOwner(ctx)),
});

export const spaceDays = query({
  args: { id: v.id("spaces"), today: v.string() },
  handler: async (ctx, { id, today }) => {
    const ownerId = await requireOwner(ctx);
    owned(await ctx.db.get(id), ownerId, "space");
    return Navigation.spaceDays(ctx, ownerId, id, today);
  },
});
