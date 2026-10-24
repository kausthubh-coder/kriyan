// The web app's side of Web Push: save or forget this browser's subscription, read the public
// key, and send a test reminder. Delivery itself is webPushSend.ts (Node, the web-push package).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { requireOwner } from "./model/owner";
import { listSubscriptions, removeSubscription, saveSubscription } from "./model/webPush";

/** The VAPID public key browsers subscribe with, or null when this backend has none. */
export const publicKey = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async () => env.VAPID_PUBLIC_KEY ?? null,
});

export const subscribe = mutation({
  args: { endpoint: v.string(), p256dh: v.string(), auth: v.string(), userAgent: v.optional(v.string()) },
  handler: async (ctx, sub) => saveSubscription(ctx, await requireOwner(ctx), sub),
});

export const unsubscribe = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => removeSubscription(ctx, await requireOwner(ctx), endpoint),
});

/** Sends "This is how reminders look" to this browser now, from Settings. */
export const sendTest = mutation({
  args: { endpoint: v.string() },
  handler: async (ctx, { endpoint }) => {
    const ownerId = await requireOwner(ctx);
    const subs = (await listSubscriptions(ctx, ownerId)).filter((s) => s.endpoint === endpoint);
    if (!subs.length) return false;
    await ctx.scheduler.runAfter(0, internal.webPushSend.send, {
      subscriptions: subs.map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth })),
      title: "Kriyan",
      body: "This is how reminders look on this device.",
      tag: "kriyan-test",
      url: "/today",
    });
    return true;
  },
});

export const forOwner = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) =>
    (await listSubscriptions(ctx, ownerId)).map(({ endpoint, p256dh, auth }) => ({ endpoint, p256dh, auth })),
});

/** Push services answer 404 or 410 for a subscription that's gone; forget those. */
export const forget = internalMutation({
  args: { endpoints: v.array(v.string()) },
  handler: async (ctx, { endpoints }) => {
    for (const endpoint of endpoints) {
      const rows = await ctx.db
        .query("webPushSubscriptions")
        .withIndex("by_endpoint", (q) => q.eq("endpoint", endpoint))
        .take(5);
      for (const row of rows) await ctx.db.delete(row._id);
    }
  },
});
