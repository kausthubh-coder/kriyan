import { internalAction, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

// Expo Push Service URL
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  priority?: "default" | "normal" | "high";
  categoryId?: string;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: {
    error?: string;
  };
}

/**
 * Send a push notification for a reminder.
 */
export const sendReminderNotification = internalAction({
  args: {
    reminderId: v.id("reminders"),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Get reminder with task details
    const data = await ctx.runQuery(internal.reminders.getReminderWithTask, {
      reminderId: args.reminderId,
    });

    if (!data) {
      return { success: false, error: "Reminder not found" };
    }

    const { reminder, task } = data;

    // Get Expo push token from settings
    const settings = await ctx.runQuery(api.settings.get, {});
    if (!settings?.expoPushToken) {
      // No push token, mark as notified anyway
      await ctx.runMutation(internal.reminders.markNotified, {
        reminderId: args.reminderId,
      });
      return { success: false, error: "No Expo push token configured" };
    }

    // Build notification message
    const title = reminder.isAlarm ? `⏰ ${reminder.title}` : reminder.title;
    let body = "";

    if (task) {
      body = task.description ?? `Task: ${task.title}`;
    } else {
      body = "Reminder triggered";
    }

    // Send push notification
    const result = await sendExpoPushNotification({
      to: settings.expoPushToken,
      title,
      body,
      data: {
        type: "reminder",
        reminderId: args.reminderId,
        taskId: reminder.taskId ?? null,
        noteId: reminder.noteId ?? null,
      },
      sound: reminder.isAlarm ? "default" : null,
      priority: reminder.isAlarm ? "high" : "default",
      categoryId: "reminder",
    });

    // Mark reminder as notified
    await ctx.runMutation(internal.reminders.markNotified, {
      reminderId: args.reminderId,
    });

    return result;
  },
});

/**
 * Send a generic push notification.
 */
export const sendPushNotification = internalAction({
  args: {
    title: v.string(),
    body: v.string(),
    data: v.optional(v.any()),
    isAlarm: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const settings = await ctx.runQuery(internal.settings.get, {});
    if (!settings?.expoPushToken) {
      return { success: false, error: "No Expo push token configured" };
    }

    return await sendExpoPushNotification({
      to: settings.expoPushToken,
      title: args.title,
      body: args.body,
      data: args.data as Record<string, unknown> | undefined,
      sound: args.isAlarm ? "default" : null,
      priority: args.isAlarm ? "high" : "default",
    });
  },
});

/**
 * Helper function to send Expo push notification.
 */
async function sendExpoPushNotification(
  message: ExpoPushMessage
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = (await response.json()) as { data: ExpoPushTicket };
    const ticket = result.data;

    if (ticket.status === "error") {
      return {
        success: false,
        error: ticket.message ?? ticket.details?.error ?? "Unknown push error",
      };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Send multiple push notifications in batch.
 */
export const sendBatchNotifications = internalAction({
  args: {
    notifications: v.array(
      v.object({
        title: v.string(),
        body: v.string(),
        data: v.optional(v.any()),
      })
    ),
  },
  returns: v.object({
    success: v.boolean(),
    sent: v.number(),
    failed: v.number(),
  }),
  handler: async (ctx, args) => {
    const settings = await ctx.runQuery(internal.notifications.getExpoPushToken, {});
    if (!settings?.expoPushToken) {
      return { success: false, sent: 0, failed: args.notifications.length };
    }

    const messages: ExpoPushMessage[] = args.notifications.map((n) => ({
      to: settings.expoPushToken!,
      title: n.title,
      body: n.body,
      data: n.data as Record<string, unknown> | undefined,
    }));

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });

      if (!response.ok) {
        return { success: false, sent: 0, failed: messages.length };
      }

      const result = (await response.json()) as { data: ExpoPushTicket[] };
      const tickets = result.data;

      let sent = 0;
      let failed = 0;

      for (const ticket of tickets) {
        if (ticket.status === "ok") {
          sent++;
        } else {
          failed++;
        }
      }

      return { success: true, sent, failed };
    } catch {
      return { success: false, sent: 0, failed: messages.length };
    }
  },
});

/**
 * Internal: Get Expo push token from settings.
 */
export const getExpoPushToken = internalQuery({
  args: {},
  returns: v.union(
    v.object({
      expoPushToken: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").first();
    if (!settings) return null;
    return { expoPushToken: settings.expoPushToken };
  },
});
