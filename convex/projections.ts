import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { mutation, query, type MutationCtx } from './_generated/server'
import {
  assertBoundedString,
  assertExpectedRevision,
  assertId,
  assertPositiveInteger,
  assertShortText,
  assertTimestamp,
  MAX_PAGE_SIZE,
  withoutSystemFields,
} from './lib'
import {
  reminderStatus,
  reminderValue,
  taskStatus,
  taskValue,
  transitionResult,
} from './validators'

async function assertInstallation(
  ctx: MutationCtx,
  installationId: string,
): Promise<void> {
  const installation = await ctx.db
    .query('installations')
    .withIndex('by_installation_id', (q) =>
      q.eq('installationId', installationId),
    )
    .unique()
  if (installation === null) throw new Error('installation not found')
}

export const createTask = mutation({
  args: {
    installationId: v.string(),
    taskId: v.string(),
    idempotencyKey: v.string(),
    title: v.string(),
    status: taskStatus,
    dueAt: v.optional(v.number()),
    now: v.number(),
  },
  returns: v.object({ created: v.boolean(), task: taskValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.title, 'title', 1_024)
    if (args.dueAt !== undefined) assertTimestamp(args.dueAt, 'dueAt')
    assertTimestamp(args.now, 'now')
    await assertInstallation(ctx, args.installationId)
    const byId = await ctx.db
      .query('tasks')
      .withIndex('by_installation_task', (q) =>
        q.eq('installationId', args.installationId).eq('taskId', args.taskId),
      )
      .unique()
    const byIdempotency = await ctx.db
      .query('tasks')
      .withIndex('by_installation_idempotency', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    const existing = byId ?? byIdempotency
    if (existing !== null) {
      if (
        existing.taskId !== args.taskId ||
        existing.idempotencyKey !== args.idempotencyKey ||
        existing.title !== args.title ||
        existing.status !== args.status ||
        existing.dueAt !== args.dueAt ||
        existing.deletedAt !== undefined
      ) {
        throw new Error(
          'taskId or idempotencyKey conflicts with an existing task',
        )
      }
      return { created: false, task: withoutSystemFields(existing) }
    }
    const task = {
      installationId: args.installationId,
      taskId: args.taskId,
      idempotencyKey: args.idempotencyKey,
      title: args.title,
      status: args.status,
      dueAt: args.dueAt,
      revision: 0,
      createdAt: args.now,
      updatedAt: args.now,
    }
    await ctx.db.insert('tasks', task)
    return { created: true, task }
  },
})

export const getTask = query({
  args: {
    installationId: v.string(),
    taskId: v.string(),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), taskValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_installation_task', (q) =>
        q.eq('installationId', args.installationId).eq('taskId', args.taskId),
      )
      .unique()
    if (task === null || (task.deletedAt !== undefined && !args.includeDeleted))
      return null
    return withoutSystemFields(task)
  },
})

export const listTasks = query({
  args: {
    installationId: v.string(),
    status: v.optional(taskStatus),
    dueBefore: v.optional(v.number()),
    includeDeleted: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(taskValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    if (args.dueBefore !== undefined)
      assertTimestamp(args.dueBefore, 'dueBefore')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page = args.includeDeleted
      ? args.status !== undefined
        ? await ctx.db
            .query('tasks')
            .withIndex('by_installation_status_due', (q) => {
              const scoped = q
                .eq('installationId', args.installationId)
                .eq('status', args.status!)
              return args.dueBefore === undefined
                ? scoped
                : scoped.gt('dueAt', undefined).lte('dueAt', args.dueBefore)
            })
            .paginate(args.paginationOpts)
        : args.dueBefore !== undefined
          ? await ctx.db
              .query('tasks')
              .withIndex('by_installation_due', (q) =>
                q
                  .eq('installationId', args.installationId)
                  .gt('dueAt', undefined)
                  .lte('dueAt', args.dueBefore!),
              )
              .paginate(args.paginationOpts)
          : await ctx.db
              .query('tasks')
              .withIndex('by_installation_task', (q) =>
                q.eq('installationId', args.installationId),
              )
              .paginate(args.paginationOpts)
      : args.status !== undefined
        ? await ctx.db
            .query('tasks')
            .withIndex('by_installation_live_status_due', (q) => {
              const scoped = q
                .eq('installationId', args.installationId)
                .eq('deletedAt', undefined)
                .eq('status', args.status!)
              return args.dueBefore === undefined
                ? scoped
                : scoped.gt('dueAt', undefined).lte('dueAt', args.dueBefore)
            })
            .paginate(args.paginationOpts)
        : args.dueBefore !== undefined
          ? await ctx.db
              .query('tasks')
              .withIndex('by_installation_live_due', (q) =>
                q
                  .eq('installationId', args.installationId)
                  .eq('deletedAt', undefined)
                  .gt('dueAt', undefined)
                  .lte('dueAt', args.dueBefore!),
              )
              .paginate(args.paginationOpts)
          : await ctx.db
              .query('tasks')
              .withIndex('by_installation_live_task', (q) =>
                q
                  .eq('installationId', args.installationId)
                  .eq('deletedAt', undefined),
              )
              .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const updateTask = mutation({
  args: {
    installationId: v.string(),
    taskId: v.string(),
    expectedRevision: v.number(),
    title: v.optional(v.string()),
    dueAt: v.optional(v.number()),
    clearDueAt: v.optional(v.boolean()),
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertExpectedRevision(args.expectedRevision)
    if (args.title !== undefined)
      assertBoundedString(args.title, 'title', 1_024)
    if (args.dueAt !== undefined) assertTimestamp(args.dueAt, 'dueAt')
    assertTimestamp(args.now, 'now')
    if (args.dueAt !== undefined && args.clearDueAt) {
      throw new Error('dueAt and clearDueAt are mutually exclusive')
    }
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_installation_task', (q) =>
        q.eq('installationId', args.installationId).eq('taskId', args.taskId),
      )
      .unique()
    if (task === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (task.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (task.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(task._id, {
      title: args.title ?? task.title,
      dueAt: args.clearDueAt ? undefined : (args.dueAt ?? task.dueAt),
      revision: task.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: task.revision + 1 }
  },
})

export const setTaskStatus = mutation({
  args: {
    installationId: v.string(),
    taskId: v.string(),
    expectedRevision: v.number(),
    status: taskStatus,
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.now, 'now')
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_installation_task', (q) =>
        q.eq('installationId', args.installationId).eq('taskId', args.taskId),
      )
      .unique()
    if (task === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (task.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (task.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(task._id, {
      status: args.status,
      revision: task.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: task.revision + 1 }
  },
})

export const tombstoneTask = mutation({
  args: {
    installationId: v.string(),
    taskId: v.string(),
    expectedRevision: v.number(),
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.now, 'now')
    const task = await ctx.db
      .query('tasks')
      .withIndex('by_installation_task', (q) =>
        q.eq('installationId', args.installationId).eq('taskId', args.taskId),
      )
      .unique()
    if (task === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (task.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (task.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(task._id, {
      status: 'cancelled',
      deletedAt: args.now,
      revision: task.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: task.revision + 1 }
  },
})

export const createReminder = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    idempotencyKey: v.string(),
    message: v.string(),
    remindAt: v.number(),
    timezone: v.string(),
    status: reminderStatus,
    now: v.number(),
  },
  returns: v.object({ created: v.boolean(), reminder: reminderValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.message, 'message', 4_096)
    assertTimestamp(args.remindAt, 'remindAt')
    assertShortText(args.timezone, 'timezone')
    assertTimestamp(args.now, 'now')
    await assertInstallation(ctx, args.installationId)
    const byId = await ctx.db
      .query('reminders')
      .withIndex('by_installation_reminder', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('reminderId', args.reminderId),
      )
      .unique()
    const byIdempotency = await ctx.db
      .query('reminders')
      .withIndex('by_installation_idempotency', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    const existing = byId ?? byIdempotency
    if (existing !== null) {
      if (
        existing.reminderId !== args.reminderId ||
        existing.idempotencyKey !== args.idempotencyKey ||
        existing.message !== args.message ||
        existing.remindAt !== args.remindAt ||
        existing.timezone !== args.timezone ||
        existing.status !== args.status ||
        existing.deletedAt !== undefined
      ) {
        throw new Error(
          'reminderId or idempotencyKey conflicts with an existing reminder',
        )
      }
      return { created: false, reminder: withoutSystemFields(existing) }
    }
    const reminder = {
      installationId: args.installationId,
      reminderId: args.reminderId,
      idempotencyKey: args.idempotencyKey,
      message: args.message,
      remindAt: args.remindAt,
      timezone: args.timezone,
      status: args.status,
      revision: 0,
      createdAt: args.now,
      updatedAt: args.now,
    }
    await ctx.db.insert('reminders', reminder)
    return { created: true, reminder }
  },
})

export const getReminder = query({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), reminderValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    const reminder = await ctx.db
      .query('reminders')
      .withIndex('by_installation_reminder', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('reminderId', args.reminderId),
      )
      .unique()
    if (
      reminder === null ||
      (reminder.deletedAt !== undefined && !args.includeDeleted)
    )
      return null
    return withoutSystemFields(reminder)
  },
})

export const listReminders = query({
  args: {
    installationId: v.string(),
    status: v.optional(reminderStatus),
    remindBefore: v.optional(v.number()),
    includeDeleted: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(reminderValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    if (args.remindBefore !== undefined)
      assertTimestamp(args.remindBefore, 'remindBefore')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page = args.includeDeleted
      ? args.status !== undefined
        ? await ctx.db
            .query('reminders')
            .withIndex('by_installation_status_time', (q) => {
              const scoped = q
                .eq('installationId', args.installationId)
                .eq('status', args.status!)
              return args.remindBefore === undefined
                ? scoped
                : scoped.lte('remindAt', args.remindBefore)
            })
            .paginate(args.paginationOpts)
        : args.remindBefore !== undefined
          ? await ctx.db
              .query('reminders')
              .withIndex('by_installation_time', (q) =>
                q
                  .eq('installationId', args.installationId)
                  .lte('remindAt', args.remindBefore!),
              )
              .paginate(args.paginationOpts)
          : await ctx.db
              .query('reminders')
              .withIndex('by_installation_reminder', (q) =>
                q.eq('installationId', args.installationId),
              )
              .paginate(args.paginationOpts)
      : args.status !== undefined
        ? await ctx.db
            .query('reminders')
            .withIndex('by_installation_live_status_time', (q) => {
              const scoped = q
                .eq('installationId', args.installationId)
                .eq('deletedAt', undefined)
                .eq('status', args.status!)
              return args.remindBefore === undefined
                ? scoped
                : scoped.lte('remindAt', args.remindBefore)
            })
            .paginate(args.paginationOpts)
        : args.remindBefore !== undefined
          ? await ctx.db
              .query('reminders')
              .withIndex('by_installation_live_time', (q) =>
                q
                  .eq('installationId', args.installationId)
                  .eq('deletedAt', undefined)
                  .lte('remindAt', args.remindBefore!),
              )
              .paginate(args.paginationOpts)
          : await ctx.db
              .query('reminders')
              .withIndex('by_installation_live_reminder', (q) =>
                q
                  .eq('installationId', args.installationId)
                  .eq('deletedAt', undefined),
              )
              .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const updateReminder = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    expectedRevision: v.number(),
    message: v.optional(v.string()),
    remindAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
    if (args.message !== undefined)
      assertBoundedString(args.message, 'message', 4_096)
    if (args.remindAt !== undefined) assertTimestamp(args.remindAt, 'remindAt')
    if (args.timezone !== undefined) assertShortText(args.timezone, 'timezone')
    assertTimestamp(args.now, 'now')
    const reminder = await ctx.db
      .query('reminders')
      .withIndex('by_installation_reminder', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('reminderId', args.reminderId),
      )
      .unique()
    if (reminder === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (reminder.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (reminder.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(reminder._id, {
      message: args.message ?? reminder.message,
      remindAt: args.remindAt ?? reminder.remindAt,
      timezone: args.timezone ?? reminder.timezone,
      revision: reminder.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})

export const setReminderStatus = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    expectedRevision: v.number(),
    status: reminderStatus,
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.now, 'now')
    const reminder = await ctx.db
      .query('reminders')
      .withIndex('by_installation_reminder', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('reminderId', args.reminderId),
      )
      .unique()
    if (reminder === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (reminder.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (reminder.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(reminder._id, {
      status: args.status,
      revision: reminder.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})

export const tombstoneReminder = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    expectedRevision: v.number(),
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.now, 'now')
    const reminder = await ctx.db
      .query('reminders')
      .withIndex('by_installation_reminder', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('reminderId', args.reminderId),
      )
      .unique()
    if (reminder === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (reminder.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (reminder.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(reminder._id, {
      status: 'cancelled',
      deletedAt: args.now,
      revision: reminder.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})
