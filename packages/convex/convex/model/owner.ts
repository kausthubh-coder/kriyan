import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** The signed-in person's id. Every public function calls this first. */
export async function requireOwner(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Sign in to continue.");
  return identity.tokenIdentifier;
}

export type Profile = Omit<Doc<"profiles">, "_id" | "_creationTime">;

export const DEFAULT_PROFILE: Omit<Profile, "ownerId"> = {
  timeZone: "UTC",
  dayStart: 8 * 60,
  dayEnd: 22 * 60,
  dailyCapacity: 7 * 60,
  defaultReminders: [{ kind: "before", minutes: 10 }],
  agentsEditDirectly: false,
};

export async function getProfile(ctx: QueryCtx | MutationCtx, ownerId: string): Promise<Profile> {
  const row = await ctx.db
    .query("profiles")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
  return row ?? { ownerId, ...DEFAULT_PROFILE };
}

/** Throws unless the row exists, belongs to `ownerId` and isn't deleted. */
export function owned<T extends { ownerId: string; deletedAt?: number }>(
  row: T | null,
  ownerId: string,
  what: string,
): T {
  if (!row || row.ownerId !== ownerId || row.deletedAt !== undefined)
    throw new ConvexError(`That ${what} doesn't exist or isn't yours.`);
  return row;
}
