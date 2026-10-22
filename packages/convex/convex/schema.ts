import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { colorV, reminderV, repeatV, sourceV } from "./validators";

// Every row belongs to one person: `ownerId` is their identity's tokenIdentifier.
// Every query reads through an index that starts with ownerId.

export default defineSchema({
  profiles: defineTable({
    ownerId: v.string(),
    name: v.optional(v.string()),
    timeZone: v.string(),
    /** Minutes after midnight; free time is counted until dayEnd. */
    dayStart: v.number(),
    dayEnd: v.number(),
    /** Minutes of planned work a day can hold, for the load bars. */
    dailyCapacity: v.number(),
    /** Added to new tasks that have a time. */
    defaultReminders: v.array(reminderV),
    onboardedAt: v.optional(v.number()),
    /** Let agents change the plan directly instead of proposing. */
    agentsEditDirectly: v.boolean(),
  }).index("by_owner", ["ownerId"]),

  spaces: defineTable({
    ownerId: v.string(),
    name: v.string(),
    color: colorV,
    parentId: v.optional(v.id("spaces")),
    order: v.number(),
    /** Markdown. */
    note: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_parentId", ["ownerId", "parentId"]),

  tasks: defineTable({
    ownerId: v.string(),
    title: v.string(),
    spaceId: v.optional(v.id("spaces")),
    /** Civil date (YYYY-MM-DD) it is planned for. For a repeating task, the next occurrence. */
    date: v.optional(v.string()),
    /** Minutes after midnight. */
    time: v.optional(v.number()),
    /** Minutes. Optional, never invented. */
    length: v.optional(v.number()),
    deadline: v.optional(v.string()),
    repeat: v.optional(repeatV),
    /** First date of the repeat, so counts and "every 2 weeks" stay anchored. */
    repeatFirst: v.optional(v.string()),
    reminders: v.array(reminderV),
    /** Markdown. */
    note: v.optional(v.string()),
    /** Something you attend (a class, a meeting) rather than tick off. */
    event: v.boolean(),
    goalId: v.optional(v.id("goals")),
    order: v.number(),
    doneAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    source: sourceV,
    /** Set while an agent's change waits for the person to accept it. */
    proposedBy: v.optional(v.string()),
  })
    .index("by_owner_and_date", ["ownerId", "date"])
    // Lists of open tasks read through these, so done and deleted rows, which pile up with
    // use, can never crowd an open task out of a bounded read.
    .index("by_owner_and_deletedAt_and_doneAt_and_date", ["ownerId", "deletedAt", "doneAt", "date"])
    .index("by_owner_and_spaceId_and_deletedAt_and_doneAt", ["ownerId", "spaceId", "deletedAt", "doneAt"])
    .index("by_owner_and_deletedAt_and_doneAt_and_repeatFirst", [
      "ownerId",
      "deletedAt",
      "doneAt",
      "repeatFirst",
    ])
    .index("by_owner_and_deadline", ["ownerId", "deadline"])
    // Maintenance only (emptying the Trash), never read for a person.
    .index("by_deletedAt", ["deletedAt"])
    .index("by_owner_and_proposedBy", ["ownerId", "proposedBy"]),

  /** One row per occurrence done: a single task, or one date of a repeating one. */
  completions: defineTable({
    ownerId: v.string(),
    taskId: v.id("tasks"),
    spaceId: v.optional(v.id("spaces")),
    /** The occurrence's date. */
    date: v.string(),
    /** The person's today when they did it. */
    doneOn: v.string(),
    /** Planned minutes, counted on the Progress heatmap. */
    minutes: v.number(),
  })
    .index("by_owner_and_doneOn", ["ownerId", "doneOn"])
    .index("by_owner_and_date", ["ownerId", "date"])
    .index("by_taskId_and_date", ["taskId", "date"]),

  habits: defineTable({
    ownerId: v.string(),
    title: v.string(),
    spaceId: v.optional(v.id("spaces")),
    /** Times a week. */
    target: v.number(),
    order: v.number(),
    archivedAt: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  habitChecks: defineTable({
    ownerId: v.string(),
    habitId: v.id("habits"),
    date: v.string(),
  })
    .index("by_owner_and_date", ["ownerId", "date"])
    .index("by_habitId_and_date", ["habitId", "date"]),

  goals: defineTable({
    ownerId: v.string(),
    title: v.string(),
    spaceId: v.optional(v.id("spaces")),
    /** "number": track a value (km, pages); "tasks": count linked tasks done. */
    kind: v.union(v.literal("number"), v.literal("tasks")),
    target: v.number(),
    current: v.number(),
    unit: v.optional(v.string()),
    startDate: v.string(),
    dueDate: v.optional(v.string()),
    archivedAt: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  reminderJobs: defineTable({
    ownerId: v.string(),
    taskId: v.id("tasks"),
    fireAt: v.number(),
    jobId: v.id("_scheduled_functions"),
  }).index("by_taskId", ["taskId"]),

  pushTokens: defineTable({
    ownerId: v.string(),
    token: v.string(),
    platform: v.string(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_token", ["token"]),

  /** Personal access tokens for the CLI and MCP clients. Only a hash is stored. */
  accessTokens: defineTable({
    ownerId: v.string(),
    name: v.string(),
    hash: v.string(),
    /** First characters, to tell tokens apart in Settings. */
    hint: v.string(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_hash", ["hash"]),
});
