"use node";
// Sends Web Push messages with the web-push package (VAPID). Best effort, like Expo push: a
// failed send is logged, and a subscription the push service says is gone is forgotten.

import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { env, internalAction } from "./_generated/server";

const subscriptionV = v.object({ endpoint: v.string(), p256dh: v.string(), auth: v.string() });

export const send = internalAction({
  args: {
    subscriptions: v.array(subscriptionV),
    title: v.string(),
    body: v.string(),
    /** One notification per task: a later reminder for it replaces the earlier one. */
    tag: v.string(),
    /** Where tapping the notification opens. */
    url: v.string(),
  },
  handler: async (ctx, { subscriptions, title, body, tag, url }) => {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !subscriptions.length) return;
    const options = {
      vapidDetails: {
        subject: VAPID_SUBJECT ?? "mailto:hello@kriyan.app",
        publicKey: VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY,
      },
      TTL: 60 * 60,
      urgency: "high" as const,
    };
    const payload = JSON.stringify({ title, body, tag, url });
    const gone: string[] = [];
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            options,
          );
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(sub.endpoint);
          else console.error(`Web push failed${status ? ` with ${status}` : ""}`);
        }
      }),
    );
    if (gone.length) await ctx.runMutation(internal.webPush.forget, { endpoints: gone });
  },
});
