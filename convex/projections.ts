import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { mutation, query, type MutationCtx } from './_generated/server'
import {
  advanceClientSnapshotRevision,
  assertBoundedString,
  assertExpectedRevision,
  assertId,
  assertLongText,
  assertOptionalId,
  assertPositiveInteger,
  assertShortText,
  assertStringList,
  assertTimestamp,
  MAX_PAGE_SIZE,
  withoutSystemFields,
} from './lib'
import {
  reminderStatus,
  reminderDeliveryPolicy,
  reminderValue,
  taskStatus,
  taskPriority,
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
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    priority: v.optional(taskPriority),
    status: taskStatus,
    startAt: v.optional(v.number()),
    dueAt: v.optional(v.number()),
    projectId: v.optional(v.string()),
    entityId: v.optional(v.string()),
  },
  returns: v.object({ created: v.boolean(), task: taskValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.title, 'title', 1_024)
    if (args.description !== undefined)
      assertLongText(args.description, 'description')
    assertStringList(args.tags ?? [], 'tags')
    if (args.startAt !== undefined) assertTimestamp(args.startAt, 'startAt')
    if (args.dueAt !== undefined) assertTimestamp(args.dueAt, 'dueAt')
    assertOptionalId(args.projectId, 'projectId')
    assertOptionalId(args.entityId, 'entityId')
    if (
      args.startAt !== undefined &&
      args.dueAt !== undefined &&
      args.startAt > args.dueAt
    ) throw new Error('startAt must not be after dueAt')
    const tags = args.tags ?? []
    const now = Date.now()
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
        existing.description !== args.description ||
        JSON.stringify(existing.tags) !== JSON.stringify(tags) ||
        existing.priority !== args.priority ||
        existing.status !== args.status ||
        existing.startAt !== args.startAt ||
        existing.dueAt !== args.dueAt ||
        existing.projectId !== args.projectId ||
        existing.entityId !== args.entityId ||
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
      description: args.description,
      tags,
      priority: args.priority,
      status: args.status,
      startAt: args.startAt,
      dueAt: args.dueAt,
      projectId: args.projectId,
      entityId: args.entityId,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert('tasks', task)
    await advanceClientSnapshotRevision(ctx, args.installationId)
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
    description: v.optional(v.string()),
    clearDescription: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    priority: v.optional(taskPriority),
    clearPriority: v.optional(v.boolean()),
    startAt: v.optional(v.number()),
    clearStartAt: v.optional(v.boolean()),
    dueAt: v.optional(v.number()),
    clearDueAt: v.optional(v.boolean()),
    projectId: v.optional(v.string()),
    clearProjectId: v.optional(v.boolean()),
    entityId: v.optional(v.string()),
    clearEntityId: v.optional(v.boolean()),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertExpectedRevision(args.expectedRevision)
    if (args.title !== undefined)
      assertBoundedString(args.title, 'title', 1_024)
    if (args.description !== undefined)
      assertLongText(args.description, 'description')
    if (args.tags !== undefined) assertStringList(args.tags, 'tags')
    if (args.startAt !== undefined) assertTimestamp(args.startAt, 'startAt')
    if (args.dueAt !== undefined) assertTimestamp(args.dueAt, 'dueAt')
    assertOptionalId(args.projectId, 'projectId')
    assertOptionalId(args.entityId, 'entityId')
    const now = Date.now()
    if (args.dueAt !== undefined && args.clearDueAt) {
      throw new Error('dueAt and clearDueAt are mutually exclusive')
    }
    const exclusivePairs: Array<[unknown, boolean | undefined, string]> = [
      [args.description, args.clearDescription, 'description'],
      [args.priority, args.clearPriority, 'priority'],
      [args.startAt, args.clearStartAt, 'startAt'],
      [args.projectId, args.clearProjectId, 'projectId'],
      [args.entityId, args.clearEntityId, 'entityId'],
    ]
    for (const [value, clear, name] of exclusivePairs) {
      if (value !== undefined && clear) {
        throw new Error(`${name} and clear${name[0]!.toUpperCase()}${name.slice(1)} are mutually exclusive`)
      }
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
    const startAt = args.clearStartAt ? undefined : (args.startAt ?? task.startAt)
    const dueAt = args.clearDueAt ? undefined : (args.dueAt ?? task.dueAt)
    if (startAt !== undefined && dueAt !== undefined && startAt > dueAt) {
      throw new Error('startAt must not be after dueAt')
    }
    await ctx.db.patch(task._id, {
      title: args.title ?? task.title,
      description: args.clearDescription
        ? undefined
        : (args.description ?? task.description),
      tags: args.tags ?? task.tags,
      priority: args.clearPriority ? undefined : (args.priority ?? task.priority),
      startAt,
      dueAt,
      projectId: args.clearProjectId ? undefined : (args.projectId ?? task.projectId),
      entityId: args.clearEntityId ? undefined : (args.entityId ?? task.entityId),
      revision: task.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: task.revision + 1 }
  },
})

export const setTaskStatus = mutation({
  args: {
    installationId: v.string(),
    taskId: v.string(),
    expectedRevision: v.number(),
    status: taskStatus,
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertExpectedRevision(args.expectedRevision)
    const now = Date.now()
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
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: task.revision + 1 }
  },
})

export const tombstoneTask = mutation({
  args: {
    installationId: v.string(),
    taskId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertExpectedRevision(args.expectedRevision)
    const now = Date.now()
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
      deletedAt: now,
      revision: task.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
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
    nextFireAt: v.optional(v.number()),
    timezone: v.string(),
    deliveryPolicy: v.optional(reminderDeliveryPolicy),
    scheduleKey: v.optional(v.string()),
    linkedTaskId: v.optional(v.string()),
    entityId: v.optional(v.string()),
    status: reminderStatus,
  },
  returns: v.object({ created: v.boolean(), reminder: reminderValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.message, 'message', 4_096)
    assertTimestamp(args.remindAt, 'remindAt')
    if (args.nextFireAt !== undefined)
      assertTimestamp(args.nextFireAt, 'nextFireAt')
    assertShortText(args.timezone, 'timezone')
    const deliveryPolicy = args.deliveryPolicy ?? 'normal'
    const scheduleKey = args.scheduleKey ?? args.idempotencyKey
    assertId(scheduleKey, 'scheduleKey')
    assertOptionalId(args.linkedTaskId, 'linkedTaskId')
    assertOptionalId(args.entityId, 'entityId')
    const nextFireAt = args.nextFireAt ?? args.remindAt
    const now = Date.now()
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
    const bySchedule = await ctx.db
      .query('reminders')
      .withIndex('by_installation_schedule_key', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('scheduleKey', scheduleKey),
      )
      .unique()
    const existing = byId ?? byIdempotency ?? bySchedule
    if (existing !== null) {
      if (
        existing.reminderId !== args.reminderId ||
        existing.idempotencyKey !== args.idempotencyKey ||
        existing.message !== args.message ||
        existing.remindAt !== args.remindAt ||
        existing.nextFireAt !== nextFireAt ||
        existing.timezone !== args.timezone ||
        existing.deliveryPolicy !== deliveryPolicy ||
        existing.scheduleKey !== scheduleKey ||
        existing.linkedTaskId !== args.linkedTaskId ||
        existing.entityId !== args.entityId ||
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
      nextFireAt,
      timezone: args.timezone,
      deliveryPolicy,
      status: args.status,
      scheduleKey,
      fireCount: 0,
      linkedTaskId: args.linkedTaskId,
      entityId: args.entityId,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert('reminders', reminder)
    await advanceClientSnapshotRevision(ctx, args.installationId)
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
    nextFireAt: v.optional(v.number()),
    clearNextFireAt: v.optional(v.boolean()),
    timezone: v.optional(v.string()),
    deliveryPolicy: v.optional(reminderDeliveryPolicy),
    linkedTaskId: v.optional(v.string()),
    clearLinkedTaskId: v.optional(v.boolean()),
    entityId: v.optional(v.string()),
    clearEntityId: v.optional(v.boolean()),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
    if (args.message !== undefined)
      assertBoundedString(args.message, 'message', 4_096)
    if (args.remindAt !== undefined) assertTimestamp(args.remindAt, 'remindAt')
    if (args.nextFireAt !== undefined)
      assertTimestamp(args.nextFireAt, 'nextFireAt')
    if (args.timezone !== undefined) assertShortText(args.timezone, 'timezone')
    assertOptionalId(args.linkedTaskId, 'linkedTaskId')
    assertOptionalId(args.entityId, 'entityId')
    if (args.nextFireAt !== undefined && args.clearNextFireAt)
      throw new Error('nextFireAt and clearNextFireAt are mutually exclusive')
    const now = Date.now()
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
      nextFireAt: args.clearNextFireAt
        ? undefined
        : (args.nextFireAt ?? reminder.nextFireAt),
      timezone: args.timezone ?? reminder.timezone,
      deliveryPolicy: args.deliveryPolicy ?? reminder.deliveryPolicy,
      linkedTaskId: args.clearLinkedTaskId
        ? undefined
        : (args.linkedTaskId ?? reminder.linkedTaskId),
      entityId: args.clearEntityId
        ? undefined
        : (args.entityId ?? reminder.entityId),
      revision: reminder.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})

export const setReminderStatus = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    expectedRevision: v.number(),
    status: reminderStatus,
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
    const now = Date.now()
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
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})

export const listAttentionReminders = query({
  args: {
    installationId: v.string(),
    nextFireBefore: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(reminderValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    if (args.nextFireBefore !== undefined)
      assertTimestamp(args.nextFireBefore, 'nextFireBefore')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page = await ctx.db
      .query('reminders')
      .withIndex('by_installation_live_next_fire', (q) => {
        const scoped = q
          .eq('installationId', args.installationId)
          .eq('deletedAt', undefined)
          .gt('nextFireAt', undefined)
        return args.nextFireBefore === undefined
          ? scoped
          : scoped.lte('nextFireAt', args.nextFireBefore)
      })
      .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const markReminderFired = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
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
    if (reminder.deletedAt !== undefined || reminder.status !== 'scheduled')
      return { ok: false as const, reason: 'invalid_state' as const }
    if (reminder.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    await ctx.db.patch(reminder._id, {
      status: 'fired',
      nextFireAt: undefined,
      snoozedUntil: undefined,
      lastFiredAt: now,
      fireCount: reminder.fireCount + 1,
      revision: reminder.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})

export const acknowledgeReminder = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
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
    if (
      reminder.deletedAt !== undefined ||
      (reminder.status !== 'scheduled' && reminder.status !== 'fired')
    ) return { ok: false as const, reason: 'invalid_state' as const }
    if (reminder.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    await ctx.db.patch(reminder._id, {
      status: 'acknowledged',
      acknowledgedAt: now,
      nextFireAt: undefined,
      snoozedUntil: undefined,
      revision: reminder.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})

export const snoozeReminder = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    expectedRevision: v.number(),
    snoozedUntil: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.snoozedUntil, 'snoozedUntil')
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
    if (
      reminder.deletedAt !== undefined ||
      reminder.status === 'cancelled' ||
      reminder.status === 'dismissed'
    ) return { ok: false as const, reason: 'invalid_state' as const }
    if (reminder.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    if (args.snoozedUntil <= now) {
      throw new Error('snoozedUntil must be in the future')
    }
    await ctx.db.patch(reminder._id, {
      status: 'scheduled',
      nextFireAt: args.snoozedUntil,
      snoozedUntil: args.snoozedUntil,
      acknowledgedAt: undefined,
      revision: reminder.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})

export const tombstoneReminder = mutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertExpectedRevision(args.expectedRevision)
    const now = Date.now()
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
      deletedAt: now,
      revision: reminder.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: reminder.revision + 1 }
  },
})
