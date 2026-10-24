// Web Push subscriptions: one per browser or Home Screen web app that turned reminders on.
// Every read goes through the owner index; an endpoint belongs to exactly one person.

import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Each person keeps at most this many browsers; the oldest goes when one more subscribes. */
export const MAX_SUBSCRIPTIONS = 20;

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export function checkSubscription(sub: SubscriptionInput): void {
  let url: URL;
  try {
    url = new URL(sub.endpoint);
  } catch {
    throw new ConvexError("That isn't a push subscription from a browser.");
  }
  if (url.protocol !== "https:" || sub.endpoint.length > 1000)
    throw new ConvexError("That isn't a push subscription from a browser.");
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(sub.p256dh) || !/^[A-Za-z0-9_-]{10,100}$/.test(sub.auth))
    throw new ConvexError("That push subscription is missing its keys.");
}

/** Saves this browser's subscription for the owner; the same endpoint moves to whoever saves it last. */
export async function saveSubscription(ctx: MutationCtx, ownerId: string, sub: SubscriptionInput): Promise<void> {
  checkSubscription(sub);
  const existing = await ctx.db
    .query("webPushSubscriptions")
    .withIndex("by_endpoint", (q) => q.eq("endpoint", sub.endpoint))
    .take(5);
  for (const row of existing) await ctx.db.delete(row._id);
  const mine = await ctx.db
    .query("webPushSubscriptions")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(MAX_SUBSCRIPTIONS + 1);
  const extra = mine.length - (MAX_SUBSCRIPTIONS - 1);
  if (extra > 0) for (const row of mine.sort((a, b) => a.createdAt - b.createdAt).slice(0, extra)) await ctx.db.delete(row._id);
  await ctx.db.insert("webPushSubscriptions", {
    ownerId,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    ...(sub.userAgent ? { userAgent: sub.userAgent.slice(0, 300) } : {}),
    createdAt: Date.now(),
  });
}

/** Removes the owner's subscription for this endpoint (turning reminders off, signing out). */
export async function removeSubscription(ctx: MutationCtx, ownerId: string, endpoint: string): Promise<void> {
  const rows = await ctx.db
    .query("webPushSubscriptions")
    .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
    .take(5);
  for (const row of rows) if (row.ownerId === ownerId) await ctx.db.delete(row._id);
}

export async function listSubscriptions(ctx: QueryCtx, ownerId: string) {
  return await ctx.db
    .query("webPushSubscriptions")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .take(MAX_SUBSCRIPTIONS);
}
