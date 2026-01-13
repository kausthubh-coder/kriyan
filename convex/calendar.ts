"use node";

import { internalAction, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

interface CalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  reminders?: {
    useDefault: boolean;
    overrides?: Array<{
      method: "email" | "popup";
      minutes: number;
    }>;
  };
}

/**
 * Create a Google Calendar event for a task.
 */
export const createEventForTask = internalAction({
  args: {
    taskId: v.id("tasks"),
    title: v.string(),
    description: v.optional(v.string()),
    dueDate: v.number(), // Unix timestamp
    dueTime: v.optional(v.string()), // HH:mm format
  },
  returns: v.object({
    success: v.boolean(),
    eventId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Check if calendar sync is enabled
    const settings = await ctx.runQuery(api.settings.get, {});
    if (!settings?.calendarSyncEnabled) {
      return { success: false, error: "Calendar sync is disabled" };
    }

    // Get valid access token
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );
    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;

    // Build the event
    const startDate = new Date(args.dueDate);
    let event: CalendarEvent;

    if (args.dueTime) {
      // Specific time - use dateTime
      const [hours, minutes] = args.dueTime.split(":").map(Number);
      startDate.setHours(hours, minutes, 0, 0);

      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + 1); // Default 1 hour duration

      event = {
        summary: args.title,
        description: args.description,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 30 }],
        },
      };
    } else {
      // All-day event
      const dateStr = startDate.toISOString().split("T")[0];
      const nextDate = new Date(startDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const endDateStr = nextDate.toISOString().split("T")[0];

      event = {
        summary: args.title,
        description: args.description,
        start: { date: dateStr },
        end: { date: endDateStr },
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 480 }], // 8 hours before
        },
      };
    }

    try {
      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/primary/events`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Calendar API error: ${error}` };
      }

      const result = (await response.json()) as { id: string };

      // Store the event ID on the task
      await ctx.runMutation(internal.tasks.setCalendarEventId, {
        taskId: args.taskId,
        googleCalendarEventId: result.id,
      });

      // Also store in calendarEvents table for tracking
      await ctx.runMutation(internal.calendar.storeCalendarEvent, {
        googleEventId: result.id,
        taskId: args.taskId,
        title: args.title,
        startTime: args.dueDate,
      });

      return { success: true, eventId: result.id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Update a Google Calendar event.
 */
export const updateEvent = internalAction({
  args: {
    eventId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    dueDate: v.optional(v.number()),
    dueTime: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );
    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;

    // First get the existing event
    const getResponse = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/primary/events/${args.eventId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!getResponse.ok) {
      return { success: false, error: "Event not found" };
    }

    const existingEvent = (await getResponse.json()) as CalendarEvent;

    // Build updates
    const updates: Partial<CalendarEvent> = {};

    if (args.title !== undefined) {
      updates.summary = args.title;
    }
    if (args.description !== undefined) {
      updates.description = args.description;
    }

    if (args.dueDate !== undefined) {
      const startDate = new Date(args.dueDate);

      if (args.dueTime) {
        const [hours, minutes] = args.dueTime.split(":").map(Number);
        startDate.setHours(hours, minutes, 0, 0);

        const endDate = new Date(startDate);
        endDate.setHours(endDate.getHours() + 1);

        updates.start = {
          dateTime: startDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        updates.end = {
          dateTime: endDate.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      } else {
        const dateStr = startDate.toISOString().split("T")[0];
        const nextDate = new Date(startDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const endDateStr = nextDate.toISOString().split("T")[0];

        updates.start = { date: dateStr };
        updates.end = { date: endDateStr };
      }
    }

    const updatedEvent = { ...existingEvent, ...updates };

    try {
      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/primary/events/${args.eventId}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedEvent),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error: `Calendar update error: ${error}` };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Delete a Google Calendar event.
 */
export const deleteEvent = internalAction({
  args: {
    eventId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );
    if (!tokenResult.success) {
      return { success: false, error: tokenResult.error };
    }

    const accessToken = tokenResult.accessToken;

    try {
      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/primary/events/${args.eventId}`,
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      // 204 No Content or 410 Gone are both acceptable
      if (!response.ok && response.status !== 204 && response.status !== 410) {
        const error = await response.text();
        return { success: false, error: `Calendar delete error: ${error}` };
      }

      // Remove from tracking table
      await ctx.runMutation(internal.calendar.removeCalendarEvent, {
        googleEventId: args.eventId,
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Check calendar connection status.
 */
export const checkConnection = action({
  args: {},
  returns: v.object({
    connected: v.boolean(),
    hasCalendarAccess: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const tokenResult = await ctx.runAction(
      internal.googleActions.getValidAccessToken,
      {}
    );

    if (!tokenResult.success) {
      return {
        connected: false,
        hasCalendarAccess: false,
        error: tokenResult.error,
      };
    }

    const accessToken = tokenResult.accessToken;

    try {
      // Try to list calendars to verify access
      const response = await fetch(
        `${GOOGLE_CALENDAR_API}/users/me/calendarList?maxResults=1`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (response.ok) {
        return { connected: true, hasCalendarAccess: true };
      } else if (response.status === 403) {
        return {
          connected: true,
          hasCalendarAccess: false,
          error: "No calendar access permission",
        };
      } else {
        return {
          connected: true,
          hasCalendarAccess: false,
          error: `API error: ${response.status}`,
        };
      }
    } catch (error) {
      return {
        connected: false,
        hasCalendarAccess: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Sync a task to Google Calendar (create or update).
 */
export const syncTaskToCalendar = internalAction({
  args: {
    taskId: v.id("tasks"),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Get the task
    const task = await ctx.runQuery(internal.calendar.getTask, {
      taskId: args.taskId,
    });

    if (!task) {
      return { success: false, error: "Task not found" };
    }

    // Only sync tasks with due dates
    if (!task.dueDate) {
      return { success: false, error: "Task has no due date" };
    }

    // Check if already synced
    if (task.googleCalendarEventId) {
      // Update existing event
      const result = await ctx.runAction(internal.calendar.updateEvent, {
        eventId: task.googleCalendarEventId,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
      });
      return result;
    } else {
      // Create new event
      const result = await ctx.runAction(internal.calendar.createEventForTask, {
        taskId: args.taskId,
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
      });
      return { success: result.success, error: result.error };
    }
  },
});

// ============================================
// Internal mutations for calendar tracking
// ============================================

/**
 * Internal: Store a calendar event in the tracking table.
 */
export const storeCalendarEvent = internalMutation({
  args: {
    googleEventId: v.string(),
    taskId: v.optional(v.id("tasks")),
    reminderId: v.optional(v.id("reminders")),
    title: v.string(),
    startTime: v.number(),
    endTime: v.optional(v.number()),
  },
  returns: v.id("calendarEvents"),
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("calendarEvents", {
      googleEventId: args.googleEventId,
      taskId: args.taskId,
      reminderId: args.reminderId,
      title: args.title,
      startTime: args.startTime,
      endTime: args.endTime,
      synced: true,
      lastSyncedAt: now,
    });
  },
});

/**
 * Internal: Remove a calendar event from tracking.
 */
export const removeCalendarEvent = internalMutation({
  args: {
    googleEventId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("calendarEvents")
      .withIndex("by_googleEventId", (q) =>
        q.eq("googleEventId", args.googleEventId)
      )
      .unique();

    if (event) {
      await ctx.db.delete(event._id);
    }

    return null;
  },
});

/**
 * Internal: Get task for calendar sync.
 */
export const getTask = internalQuery({
  args: {
    taskId: v.id("tasks"),
  },
  returns: v.union(
    v.object({
      _id: v.id("tasks"),
      title: v.string(),
      description: v.optional(v.string()),
      dueDate: v.optional(v.number()),
      dueTime: v.optional(v.string()),
      googleCalendarEventId: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) return null;

    return {
      _id: task._id,
      title: task.title,
      description: task.description,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      googleCalendarEventId: task.googleCalendarEventId,
    };
  },
});

/**
 * Internal: Update calendar event sync status.
 */
export const markEventSynced = internalMutation({
  args: {
    googleEventId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("calendarEvents")
      .withIndex("by_googleEventId", (q) =>
        q.eq("googleEventId", args.googleEventId)
      )
      .unique();

    if (event) {
      await ctx.db.patch(event._id, {
        synced: true,
        lastSyncedAt: Date.now(),
      });
    }

    return null;
  },
});
