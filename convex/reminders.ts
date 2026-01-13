import {
  query,
  mutation,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Id, Doc } from "./_generated/dataModel";

// Recurrence rule validator
const recurrenceRuleValidator = v.object({
  frequency: v.union(
    v.literal("daily"),
    v.literal("weekly"),
    v.literal("monthly"),
    v.literal("yearly"),
    v.literal("custom")
  ),
  interval: v.number(), // Every N frequency units
  daysOfWeek: v.optional(v.array(v.number())), // 0-6 for Sun-Sat
  dayOfMonth: v.optional(v.number()), // 1-31
  monthOfYear: v.optional(v.number()), // 1-12
  endDate: v.optional(v.number()), // When to stop recurring
});

// Full reminder validator for returns
const reminderValidator = v.object({
  _id: v.id("reminders"),
  _creationTime: v.number(),
  title: v.string(),
  taskId: v.optional(v.id("tasks")),
  noteId: v.optional(v.id("notes")),
  triggerAt: v.number(),
  isRecurring: v.boolean(),
  recurrenceRule: v.optional(recurrenceRuleValidator),
  isAlarm: v.boolean(),
  notified: v.boolean(),
  snoozedUntil: v.optional(v.number()),
  scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
  localNotificationId: v.optional(v.string()),
  createdAt: v.number(),
});

/**
 * List all reminders with optional filters.
 */
export const list = query({
  args: {
    includeNotified: v.optional(v.boolean()),
    taskId: v.optional(v.id("tasks")),
  },
  returns: v.array(reminderValidator),
  handler: async (ctx, args) => {
    let reminders;

    if (args.taskId) {
      reminders = await ctx.db
        .query("reminders")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId!))
        .collect();
    } else {
      reminders = await ctx.db.query("reminders").collect();
    }

    // Filter out already notified unless explicitly included
    if (!args.includeNotified) {
      reminders = reminders.filter((r) => !r.notified);
    }

    // Sort by trigger time
    return reminders.sort((a, b) => a.triggerAt - b.triggerAt);
  },
});

/**
 * List upcoming reminders (next N days).
 */
export const listUpcoming = query({
  args: {
    days: v.optional(v.number()),
  },
  returns: v.array(reminderValidator),
  handler: async (ctx, args) => {
    const daysAhead = args.days ?? 7;
    const now = Date.now();
    const futureDate = now + daysAhead * 24 * 60 * 60 * 1000;

    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_triggerAt")
      .collect();

    return reminders
      .filter(
        (r) =>
          !r.notified &&
          r.triggerAt >= now &&
          r.triggerAt <= futureDate &&
          (!r.snoozedUntil || r.snoozedUntil <= now)
      )
      .sort((a, b) => a.triggerAt - b.triggerAt);
  },
});

/**
 * Get a single reminder by ID.
 */
export const get = query({
  args: {
    id: v.id("reminders"),
  },
  returns: v.union(reminderValidator, v.null()),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    return reminder ?? null;
  },
});

/**
 * Create a new reminder.
 */
export const create = mutation({
  args: {
    title: v.string(),
    triggerAt: v.number(),
    taskId: v.optional(v.id("tasks")),
    noteId: v.optional(v.id("notes")),
    isRecurring: v.optional(v.boolean()),
    recurrenceRule: v.optional(recurrenceRuleValidator),
    isAlarm: v.optional(v.boolean()),
    localNotificationId: v.optional(v.string()),
  },
  returns: v.id("reminders"),
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate task exists if provided
    if (args.taskId) {
      const task = await ctx.db.get(args.taskId);
      if (!task) {
        throw new Error("Task not found");
      }
    }

    // Validate note exists if provided
    if (args.noteId) {
      const note = await ctx.db.get(args.noteId);
      if (!note) {
        throw new Error("Note not found");
      }
    }

    const reminderId = await ctx.db.insert("reminders", {
      title: args.title,
      taskId: args.taskId,
      noteId: args.noteId,
      triggerAt: args.triggerAt,
      isRecurring: args.isRecurring ?? false,
      recurrenceRule: args.recurrenceRule,
      isAlarm: args.isAlarm ?? false,
      notified: false,
      localNotificationId: args.localNotificationId,
      createdAt: now,
    });

    // Schedule the notification
    await ctx.scheduler.runAfter(0, internal.reminders.scheduleNotification, {
      reminderId,
    });

    return reminderId;
  },
});

/**
 * Update a reminder.
 */
export const update = mutation({
  args: {
    id: v.id("reminders"),
    title: v.optional(v.string()),
    triggerAt: v.optional(v.number()),
    isRecurring: v.optional(v.boolean()),
    recurrenceRule: v.optional(recurrenceRuleValidator),
    isAlarm: v.optional(v.boolean()),
    localNotificationId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    const updates: {
      title?: string;
      triggerAt?: number;
      isRecurring?: boolean;
      recurrenceRule?: Doc<"reminders">["recurrenceRule"];
      isAlarm?: boolean;
      localNotificationId?: string;
    } = {};

    if (args.title !== undefined) updates.title = args.title;
    if (args.triggerAt !== undefined) updates.triggerAt = args.triggerAt;
    if (args.isRecurring !== undefined) updates.isRecurring = args.isRecurring;
    if (args.recurrenceRule !== undefined)
      updates.recurrenceRule = args.recurrenceRule;
    if (args.isAlarm !== undefined) updates.isAlarm = args.isAlarm;
    if (args.localNotificationId !== undefined)
      updates.localNotificationId = args.localNotificationId;

    await ctx.db.patch(args.id, updates);

    // Re-schedule if trigger time changed
    if (args.triggerAt !== undefined) {
      await ctx.scheduler.runAfter(0, internal.reminders.scheduleNotification, {
        reminderId: args.id,
      });
    }

    return null;
  },
});

/**
 * Snooze a reminder for a specified duration.
 */
export const snooze = mutation({
  args: {
    id: v.id("reminders"),
    durationMinutes: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    const snoozedUntil = Date.now() + args.durationMinutes * 60 * 1000;

    await ctx.db.patch(args.id, {
      snoozedUntil,
      notified: false,
    });

    // Reschedule the notification for the snoozed time
    await ctx.scheduler.runAfter(0, internal.reminders.scheduleNotification, {
      reminderId: args.id,
    });

    return null;
  },
});

/**
 * Mark a reminder as notified (dismiss).
 */
export const dismiss = mutation({
  args: {
    id: v.id("reminders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    await ctx.db.patch(args.id, {
      notified: true,
      snoozedUntil: undefined,
    });

    // If recurring, create the next occurrence
    if (reminder.isRecurring && reminder.recurrenceRule) {
      await ctx.scheduler.runAfter(
        0,
        internal.reminders.createNextOccurrence,
        {
          reminderId: args.id,
        }
      );
    }

    return null;
  },
});

/**
 * Delete a reminder.
 */
export const remove = mutation({
  args: {
    id: v.id("reminders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.id);
    if (!reminder) {
      throw new Error("Reminder not found");
    }

    // Cancel any scheduled notification
    if (reminder.scheduledFunctionId) {
      try {
        await ctx.scheduler.cancel(reminder.scheduledFunctionId);
      } catch {
        // Ignore if already executed or cancelled
      }
    }

    await ctx.db.delete(args.id);
    return null;
  },
});

/**
 * Get reminders for a specific task.
 */
export const getForTask = query({
  args: {
    taskId: v.id("tasks"),
  },
  returns: v.array(reminderValidator),
  handler: async (ctx, args) => {
    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    return reminders.sort((a, b) => a.triggerAt - b.triggerAt);
  },
});

// ============================================
// Internal functions
// ============================================

/**
 * Internal: Get due reminders for cron job.
 */
export const getDueReminders = internalQuery({
  args: {},
  returns: v.array(reminderValidator),
  handler: async (ctx) => {
    const now = Date.now();

    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_notified", (q) => q.eq("notified", false))
      .collect();

    return reminders.filter((r) => {
      const triggerTime = r.snoozedUntil ?? r.triggerAt;
      return triggerTime <= now;
    });
  },
});

/**
 * Internal: Mark reminder as notified.
 */
export const markNotified = internalMutation({
  args: {
    reminderId: v.id("reminders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder) return null;

    await ctx.db.patch(args.reminderId, {
      notified: true,
      snoozedUntil: undefined,
    });

    // If recurring, create next occurrence
    if (reminder.isRecurring && reminder.recurrenceRule) {
      await ctx.scheduler.runAfter(
        0,
        internal.reminders.createNextOccurrence,
        {
          reminderId: args.reminderId,
        }
      );
    }

    return null;
  },
});

/**
 * Internal: Schedule the notification for a reminder.
 */
export const scheduleNotification = internalMutation({
  args: {
    reminderId: v.id("reminders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.notified) return null;

    // Cancel existing scheduled function if any
    if (reminder.scheduledFunctionId) {
      try {
        await ctx.scheduler.cancel(reminder.scheduledFunctionId);
      } catch {
        // Ignore if already executed
      }
    }

    const triggerTime = reminder.snoozedUntil ?? reminder.triggerAt;
    const delay = Math.max(0, triggerTime - Date.now());

    // Schedule the notification action
    const scheduledId = await ctx.scheduler.runAfter(
      delay,
      internal.notifications.sendReminderNotification,
      { reminderId: args.reminderId }
    );

    await ctx.db.patch(args.reminderId, {
      scheduledFunctionId: scheduledId,
    });

    return null;
  },
});

/**
 * Internal: Create the next occurrence of a recurring reminder.
 */
export const createNextOccurrence = internalMutation({
  args: {
    reminderId: v.id("reminders"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || !reminder.isRecurring || !reminder.recurrenceRule) {
      return null;
    }

    const rule = reminder.recurrenceRule;
    const currentTrigger = new Date(reminder.triggerAt);
    let nextTrigger: Date;

    switch (rule.frequency) {
      case "daily":
        nextTrigger = new Date(currentTrigger);
        nextTrigger.setDate(nextTrigger.getDate() + rule.interval);
        break;

      case "weekly":
        nextTrigger = new Date(currentTrigger);
        if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
          // Find next day of week in the list
          const currentDay = nextTrigger.getDay();
          const sortedDays = [...rule.daysOfWeek].sort((a, b) => a - b);
          const nextDayInWeek = sortedDays.find((d) => d > currentDay);

          if (nextDayInWeek !== undefined) {
            nextTrigger.setDate(
              nextTrigger.getDate() + (nextDayInWeek - currentDay)
            );
          } else {
            // Wrap to next week
            const daysUntilNextWeek = 7 - currentDay + sortedDays[0];
            nextTrigger.setDate(
              nextTrigger.getDate() + daysUntilNextWeek + (rule.interval - 1) * 7
            );
          }
        } else {
          nextTrigger.setDate(nextTrigger.getDate() + 7 * rule.interval);
        }
        break;

      case "monthly":
        nextTrigger = new Date(currentTrigger);
        nextTrigger.setMonth(nextTrigger.getMonth() + rule.interval);
        if (rule.dayOfMonth) {
          nextTrigger.setDate(
            Math.min(
              rule.dayOfMonth,
              new Date(
                nextTrigger.getFullYear(),
                nextTrigger.getMonth() + 1,
                0
              ).getDate()
            )
          );
        }
        break;

      case "yearly":
        nextTrigger = new Date(currentTrigger);
        nextTrigger.setFullYear(nextTrigger.getFullYear() + rule.interval);
        if (rule.monthOfYear) {
          nextTrigger.setMonth(rule.monthOfYear - 1);
        }
        if (rule.dayOfMonth) {
          nextTrigger.setDate(
            Math.min(
              rule.dayOfMonth,
              new Date(
                nextTrigger.getFullYear(),
                nextTrigger.getMonth() + 1,
                0
              ).getDate()
            )
          );
        }
        break;

      case "custom":
        // Custom uses interval as days
        nextTrigger = new Date(currentTrigger);
        nextTrigger.setDate(nextTrigger.getDate() + rule.interval);
        break;

      default:
        return null;
    }

    // Check if we've passed the end date
    if (rule.endDate && nextTrigger.getTime() > rule.endDate) {
      return null;
    }

    // Create the next reminder
    const newReminderId = await ctx.db.insert("reminders", {
      title: reminder.title,
      taskId: reminder.taskId,
      noteId: reminder.noteId,
      triggerAt: nextTrigger.getTime(),
      isRecurring: true,
      recurrenceRule: rule,
      isAlarm: reminder.isAlarm,
      notified: false,
      localNotificationId: reminder.localNotificationId,
      createdAt: Date.now(),
    });

    // Schedule the notification for the new reminder
    await ctx.scheduler.runAfter(0, internal.reminders.scheduleNotification, {
      reminderId: newReminderId,
    });

    return null;
  },
});

/**
 * Internal: Get reminder with task details for notifications.
 */
export const getReminderWithTask = internalQuery({
  args: {
    reminderId: v.id("reminders"),
  },
  returns: v.union(
    v.object({
      reminder: reminderValidator,
      task: v.union(
        v.object({
          _id: v.id("tasks"),
          title: v.string(),
          description: v.optional(v.string()),
        }),
        v.null()
      ),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder) return null;

    let task = null;
    if (reminder.taskId) {
      const taskDoc = await ctx.db.get(reminder.taskId);
      if (taskDoc) {
        task = {
          _id: taskDoc._id,
          title: taskDoc.title,
          description: taskDoc.description,
        };
      }
    }

    return { reminder, task };
  },
});
