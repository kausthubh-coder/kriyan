// Goals for the signed-in person. Adding and changing them is in organize.ts; the rules are in model/progress.ts.

import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireOwner } from "./model/owner";
import * as Progress from "./model/progress";

/** Where a number goal stands now (a money goal is a number goal in $): sets current and adds an entry. */
export const log = mutation({
  args: { goalId: v.id("goals"), value: v.number(), date: v.optional(v.string()) },
  handler: async (ctx, args) => Progress.logGoal(ctx, await requireOwner(ctx), args),
});
