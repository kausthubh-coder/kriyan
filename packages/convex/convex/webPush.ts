"use node";

// web-push signs and encrypts with Node's crypto, so sending lives in the Node runtime.

import { v } from "convex/values";
import webpush from "web-push";
import { internalAction } from "./_generated/server";

/** Sends one reminder to each browser. Best effort, like Expo: a failed push is not retried. */
export const send = internalAction({
  args: {
    subscriptions: v.array(v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() })),
    title: v.string(),
    body: v.string(),
    taskId: v.id("tasks"),
    /** The same reminder sent again replaces the shown notification instead of stacking. */
    tag: v.string(),
  },
  handler: async (_ctx, { subscriptions, title, body, taskId, tag }): Promise<{ gone: string[] }> => {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return { gone: [] };
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const message = JSON.stringify({ title, body, taskId, tag });
    const results = await Promise.allSettled(
      subscriptions.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          message,
          {
            // A browser that's offline gets it when it's back: a reminder a few hours late still
            // helps, but one from yesterday is noise, so the push service drops it after 4 hours.
            TTL: 4 * 60 * 60,
            // Without it a phone's browser may hold the push until the phone wakes.
            urgency: "high",
          },
        ),
      ),
    );
    const gone: string[] = [];
    results.forEach((result, i) => {
      if (result.status === "fulfilled") return;
      const status = statusOf(result.reason);
      // 404 and 410 mean the browser unsubscribed or the subscription expired: it never comes back.
      if (status === 404 || status === 410) gone.push(subscriptions[i]!.endpoint);
      // The endpoint and keys identify a person's browser, so only the status is logged.
      else console.error(`Web push failed with ${status ?? "no response"}`);
    });
    return { gone };
  },
});

function statusOf(error: unknown): number | undefined {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const { statusCode } = error;
    if (typeof statusCode === "number") return statusCode;
  }
  return undefined;
}
