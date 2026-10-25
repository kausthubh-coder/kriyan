import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { actionKindV, colorV, reminderV, repeatV, sourceV, stepV, taskBeforeV } from "./validators";

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
    /** Minutes after midnight when "Review today" shows on Today. Unset means 20:00. */
    reviewTime: v.optional(v.number()),
    /** A soft sound when you finish or move something. Off unless turned on. */
    sounds: v.optional(v.boolean()),
    /** The semester's first and last days, for the time-left card on Goals. */
    semesterStart: v.optional(v.string()),
    semesterEnd: v.optional(v.string()),
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
    /** Minutes after midnight on the deadline when it's due ("23:55"); only with a deadline. */
    dueTime: v.optional(v.number()),
    repeat: v.optional(repeatV),
    /** First date of the repeat, so counts and "every 2 weeks" stay anchored. */
    repeatFirst: v.optional(v.string()),
    reminders: v.array(reminderV),
    /** Markdown. */
    note: v.optional(v.string()),
    /** A short checklist inside the task, in order. */
    steps: v.optional(v.array(stepV)),
    /** Something you attend (a class, a meeting) rather than tick off. */
    event: v.boolean(),
    goalId: v.optional(v.id("goals")),
    order: v.number(),
    doneAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    source: sourceV,
    /** Set while an agent's change waits for the person to accept it. */
    proposedBy: v.optional(v.string()),
    /** The agent that added it ("Codex"), shown as "from Codex". */
    addedBy: v.optional(v.string()),
    /**
     * The id an agent's source gives this task (a Moodle assignment's id), unique per owner, so a
     * sync that runs every morning updates the task instead of adding it again.
     */
    externalId: v.optional(v.string()),
  })
    .index("by_owner_and_date", ["ownerId", "date"])
    // Agents' search pages through a person's tasks newest first, by creation time.
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_externalId", ["ownerId", "externalId"])
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
    /** Why it matters, in the person's words ("Keeps the scholarship open"), shown under the title. */
    why: v.optional(v.string()),
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

  /** Time spent in Focus, one row per session; Review and Goals add these up. */
  focusSessions: defineTable({
    ownerId: v.string(),
    taskId: v.optional(v.id("tasks")),
    spaceId: v.optional(v.id("spaces")),
    goalId: v.optional(v.id("goals")),
    /** The person's today when the session ended. */
    date: v.string(),
    minutes: v.number(),
  })
    .index("by_owner_and_date", ["ownerId", "date"])
    // A task's tracked time, on its screen.
    .index("by_owner_and_task", ["ownerId", "taskId"]),

  /** One row per change an agent made through the API, so the app can list it and undo it. */
  agentActions: defineTable({
    ownerId: v.string(),
    /** The token's name, or the MCP client's ("Codex", "Claude"). */
    agent: v.string(),
    kind: actionKindV,
    taskId: v.optional(v.id("tasks")),
    /** What it was about, as the person would say it: the task's title, a space's name. */
    title: v.string(),
    /** What Undo puts back: the fields a change or move overwrote. */
    before: v.optional(taskBeforeV),
    /** For a tick: the completion Undo removes. */
    completion: v.optional(
      v.object({ completionId: v.id("completions"), date: v.union(v.string(), v.null()) }),
    ),
    undoneAt: v.optional(v.number()),
  }).index("by_owner", ["ownerId"]),

  /** A plain-language request from the Ask tab that Kriyan couldn't do itself, for an agent to answer. */
  asks: defineTable({
    ownerId: v.string(),
    text: v.string(),
    reply: v.optional(v.string()),
    /** Who replied: "Kriyan" when it did the request itself, else the agent's name. */
    agent: v.optional(v.string()),
    answeredAt: v.optional(v.number()),
    /** What Kriyan did itself, so Undo can take it back. */
    taskIds: v.optional(v.array(v.id("tasks"))),
    moved: v.optional(v.array(v.object({ taskId: v.id("tasks"), date: v.union(v.string(), v.null()) }))),
    undoneAt: v.optional(v.number()),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_and_answeredAt", ["ownerId", "answeredAt"]),

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

  /** A browser that asked for reminders through Web Push: its push service URL and keys. */
  webPushSubscriptions: defineTable({
    ownerId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  }).index("by_owner_and_endpoint", ["ownerId", "endpoint"]),

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
