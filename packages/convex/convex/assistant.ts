// The Ask tab and what agents did, for the signed-in person. The rules live in model/asks.ts
// and model/activity.ts.

import { ConvexError, v } from "convex/values";
import { addDays, isCivilDate } from "@kriyan/core/dates";
import { mutation, query } from "./_generated/server";
import * as Activity from "./model/activity";
import * as Asks from "./model/asks";
import { getProfile, requireOwner } from "./model/owner";

export const asks = query({
  args: {},
  handler: async (ctx) => Asks.list(ctx, await requireOwner(ctx)),
});

export const send = mutation({
  args: { text: v.string() },
  handler: async (ctx, { text }) => Asks.send(ctx, await requireOwner(ctx), text),
});

export const undoAsk = mutation({
  args: { id: v.id("asks") },
  handler: async (ctx, { id }) => Asks.undo(ctx, await requireOwner(ctx), id),
});

export const clearAsks = mutation({
  args: {},
  handler: async (ctx) => Asks.clear(ctx, await requireOwner(ctx)),
});

/** What agents did from `days` ago until now, newest first; Today reads one day, Ask a week. */
export const activity = query({
  args: { today: v.string(), days: v.number() },
  handler: async (ctx, { today, days }) => {
    const ownerId = await requireOwner(ctx);
    if (!isCivilDate(today)) throw new ConvexError("Send today as YYYY-MM-DD.");
    if (!Number.isInteger(days) || days < 1 || days > 31) throw new ConvexError("Ask for 1 to 31 days.");
    const { timeZone } = await getProfile(ctx, ownerId);
    return Activity.recent(ctx, ownerId, Activity.startOfDay(addDays(today, 1 - days), timeZone), 500);
  },
});

export const undoAction = mutation({
  args: { id: v.id("agentActions") },
  handler: async (ctx, { id }) => Activity.undo(ctx, await requireOwner(ctx), id),
});
