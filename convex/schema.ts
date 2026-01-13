import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ============================================
  // Settings - Single row, no auth needed
  // ============================================
  settings: defineTable({
    expoPushToken: v.optional(v.string()),
    openrouterApiKey: v.optional(v.string()),
    defaultModel: v.optional(v.string()),
    theme: v.optional(v.union(v.literal("dark"), v.literal("light"))),
    favoriteModels: v.optional(v.array(v.string())),
    calendarSyncEnabled: v.optional(v.boolean()),
  }),

  // ============================================
  // Tags - Universal tagging system
  // ============================================
  tags: defineTable({
    name: v.string(),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    usageCount: v.number(),
  }).index("by_name", ["name"]),

  // ============================================
  // Tasks
  // ============================================
  tasks: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("completed"),
      v.literal("archived")
    ),
    tags: v.array(v.string()),
    dueDate: v.optional(v.number()), // Unix timestamp
    dueTime: v.optional(v.string()), // HH:mm format
    parentTaskId: v.optional(v.id("tasks")), // For subtasks
    googleCalendarEventId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status", ["status"])
    .index("by_dueDate", ["dueDate"])
    .index("by_parent", ["parentTaskId"]),

  // ============================================
  // Reminders
  // ============================================
  reminders: defineTable({
    title: v.string(),
    taskId: v.optional(v.id("tasks")),
    noteId: v.optional(v.id("notes")),
    triggerAt: v.number(), // Unix timestamp
    isRecurring: v.boolean(),
    recurrenceRule: v.optional(
      v.object({
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
      })
    ),
    isAlarm: v.boolean(), // High priority alarm vs regular reminder
    notified: v.boolean(),
    snoozedUntil: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.id("_scheduled_functions")),
    localNotificationId: v.optional(v.string()), // For expo-notifications
    createdAt: v.number(),
  })
    .index("by_triggerAt", ["triggerAt"])
    .index("by_notified", ["notified"])
    .index("by_task", ["taskId"]),

  // ============================================
  // Notes - Metadata only (content in prosemirror-sync)
  // ============================================
  notes: defineTable({
    title: v.string(),
    tags: v.array(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_updatedAt", ["updatedAt"]),

  // ============================================
  // Voice Notes
  // ============================================
  voiceNotes: defineTable({
    title: v.optional(v.string()),
    driveFileId: v.optional(v.string()), // Audio stored in Google Drive
    storageId: v.optional(v.id("_storage")), // Or Convex storage as fallback
    durationMs: v.optional(v.number()),
    transcription: v.optional(v.string()),
    transcriptionStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    tags: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  // ============================================
  // Files - Google Drive primary storage
  // ============================================
  files: defineTable({
    fileName: v.string(),
    mimeType: v.string(),
    fileSize: v.number(),
    driveFileId: v.string(), // Required - all files in Drive
    driveWebViewLink: v.optional(v.string()),
    textContent: v.optional(v.string()), // Extracted text
    extractionStatus: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed")
    ),
    sourceType: v.union(
      v.literal("upload"),
      v.literal("youtube"),
      v.literal("webpage"),
      v.literal("github")
    ),
    sourceUrl: v.optional(v.string()),
    tags: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_sourceType", ["sourceType"])
    .index("by_extractionStatus", ["extractionStatus"]),

  // ============================================
  // Note Images - Convex storage for note embeds
  // ============================================
  noteImages: defineTable({
    noteId: v.id("notes"),
    storageId: v.id("_storage"),
    fileName: v.string(),
    mimeType: v.string(),
    description: v.optional(v.string()), // From GPT-4o vision
    createdAt: v.number(),
  }).index("by_noteId", ["noteId"]),

  // ============================================
  // Google Auth - OAuth tokens
  // ============================================
  googleAuth: defineTable({
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(), // Unix timestamp
    scope: v.string(),
  }),

  // ============================================
  // Calendar Events - Sync tracking
  // ============================================
  calendarEvents: defineTable({
    googleEventId: v.string(),
    taskId: v.optional(v.id("tasks")),
    reminderId: v.optional(v.id("reminders")),
    title: v.string(),
    startTime: v.number(),
    endTime: v.optional(v.number()),
    synced: v.boolean(),
    lastSyncedAt: v.number(),
  })
    .index("by_googleEventId", ["googleEventId"])
    .index("by_task", ["taskId"])
    .index("by_reminder", ["reminderId"]),
});
