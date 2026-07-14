import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { mutation, query, type MutationCtx } from './_generated/server'
import {
  advanceClientSnapshotRevision,
  assertBoundedString,
  assertError,
  assertExpectedRevision,
  assertId,
  assertOptionalId,
  assertPositiveInteger,
  assertTimestamp,
  MAX_PAGE_SIZE,
  withoutSystemFields,
} from './lib'
import {
  notificationIntentLifecycle,
  notificationIntentValue,
  reminderDeliveryPolicy,
  transitionResult,
} from './validators'

async function assertInstallationAndReminder(
  ctx: MutationCtx,
  installationId: string,
  reminderId: string,
): Promise<void> {
  const [installation, reminder] = await Promise.all([
    ctx.db
      .query('installations')
      .withIndex('by_installation_id', (q) =>
        q.eq('installationId', installationId),
      )
      .unique(),
    ctx.db
      .query('reminders')
      .withIndex('by_installation_reminder', (q) =>
        q
          .eq('installationId', installationId)
          .eq('reminderId', reminderId),
      )
      .unique(),
  ])
  if (installation === null) throw new Error('installation not found')
  if (reminder === null || reminder.deletedAt !== undefined)
    throw new Error('reminder not found')
}

async function intentById(
  ctx: MutationCtx,
  installationId: string,
  notificationIntentId: string,
) {
  return await ctx.db
    .query('notificationIntents')
    .withIndex('by_installation_intent', (q) =>
      q
        .eq('installationId', installationId)
        .eq('notificationIntentId', notificationIntentId),
    )
    .unique()
}

export const create = mutation({
  args: {
    installationId: v.string(),
    notificationIntentId: v.string(),
    reminderId: v.string(),
    scheduledFor: v.number(),
    deliveryPolicy: reminderDeliveryPolicy,
    dedupeKey: v.string(),
    targetDeviceId: v.optional(v.string()),
  },
  returns: v.object({
    created: v.boolean(),
    intent: notificationIntentValue,
  }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.notificationIntentId, 'notificationIntentId')
    assertId(args.reminderId, 'reminderId')
    assertTimestamp(args.scheduledFor, 'scheduledFor')
    assertId(args.dedupeKey, 'dedupeKey')
    assertOptionalId(args.targetDeviceId, 'targetDeviceId')
    await assertInstallationAndReminder(ctx, args.installationId, args.reminderId)
    const byId = await intentById(
      ctx,
      args.installationId,
      args.notificationIntentId,
    )
    const byDedupe = await ctx.db
      .query('notificationIntents')
      .withIndex('by_installation_dedupe', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('dedupeKey', args.dedupeKey),
      )
      .unique()
    const existing = byId ?? byDedupe
    if (existing !== null) {
      if (
        existing.deletedAt !== undefined ||
        existing.notificationIntentId !== args.notificationIntentId ||
        existing.reminderId !== args.reminderId ||
        existing.scheduledFor !== args.scheduledFor ||
        existing.deliveryPolicy !== args.deliveryPolicy ||
        existing.dedupeKey !== args.dedupeKey ||
        existing.targetDeviceId !== args.targetDeviceId
      ) throw new Error('notification intent id or dedupe key conflicts')
      return { created: false, intent: withoutSystemFields(existing) }
    }
    const now = Date.now()
    const intent = {
      ...args,
      lifecycle: 'queued' as const,
      attempt: 0,
      escalationLevel: 0,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert('notificationIntents', intent)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, intent }
  },
})

export const get = query({
  args: { installationId: v.string(), notificationIntentId: v.string() },
  returns: v.union(v.null(), notificationIntentValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.notificationIntentId, 'notificationIntentId')
    const intent = await ctx.db
      .query('notificationIntents')
      .withIndex('by_installation_intent', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('notificationIntentId', args.notificationIntentId),
      )
      .unique()
    return intent === null || intent.deletedAt !== undefined
      ? null
      : withoutSystemFields(intent)
  },
})

export const list = query({
  args: {
    installationId: v.string(),
    lifecycle: v.optional(notificationIntentLifecycle),
    scheduledBefore: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(notificationIntentValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    if (args.scheduledBefore !== undefined)
      assertTimestamp(args.scheduledBefore, 'scheduledBefore')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page = args.lifecycle === undefined
      ? await ctx.db
          .query('notificationIntents')
          .withIndex('by_installation_live_schedule', (q) => {
            const scoped = q
              .eq('installationId', args.installationId)
              .eq('deletedAt', undefined)
            return args.scheduledBefore === undefined
              ? scoped
              : scoped.lte('scheduledFor', args.scheduledBefore)
          })
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('notificationIntents')
          .withIndex('by_installation_live_lifecycle_schedule', (q) => {
            const scoped = q
              .eq('installationId', args.installationId)
              .eq('deletedAt', undefined)
              .eq('lifecycle', args.lifecycle!)
            return args.scheduledBefore === undefined
              ? scoped
              : scoped.lte('scheduledFor', args.scheduledBefore)
          })
          .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const markDispatched = mutation({
  args: {
    installationId: v.string(),
    notificationIntentId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.notificationIntentId, 'notificationIntentId')
    assertExpectedRevision(args.expectedRevision)
    const intent = await intentById(ctx, args.installationId, args.notificationIntentId)
    if (intent === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (intent.deletedAt !== undefined || intent.lifecycle !== 'queued')
      return { ok: false as const, reason: 'invalid_state' as const }
    if (intent.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    await ctx.db.patch(intent._id, {
      lifecycle: 'dispatched',
      attempt: intent.attempt + 1,
      lastAttemptAt: now,
      lastError: undefined,
      revision: intent.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: intent.revision + 1 }
  },
})

export const acknowledge = mutation({
  args: {
    installationId: v.string(),
    notificationIntentId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.notificationIntentId, 'notificationIntentId')
    assertExpectedRevision(args.expectedRevision)
    const intent = await intentById(ctx, args.installationId, args.notificationIntentId)
    if (intent === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (intent.deletedAt !== undefined || intent.lifecycle !== 'dispatched')
      return { ok: false as const, reason: 'invalid_state' as const }
    if (intent.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(intent._id, {
      lifecycle: 'acknowledged',
      revision: intent.revision + 1,
      updatedAt: Date.now(),
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: intent.revision + 1 }
  },
})

export const fail = mutation({
  args: {
    installationId: v.string(),
    notificationIntentId: v.string(),
    expectedRevision: v.number(),
    error: v.string(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.notificationIntentId, 'notificationIntentId')
    assertExpectedRevision(args.expectedRevision)
    assertError(args.error)
    const intent = await intentById(ctx, args.installationId, args.notificationIntentId)
    if (intent === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (
      intent.deletedAt !== undefined ||
      (intent.lifecycle !== 'queued' && intent.lifecycle !== 'dispatched')
    ) return { ok: false as const, reason: 'invalid_state' as const }
    if (intent.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(intent._id, {
      lifecycle: 'failed',
      lastError: args.error,
      revision: intent.revision + 1,
      updatedAt: Date.now(),
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: intent.revision + 1 }
  },
})

export const requeue = mutation({
  args: {
    installationId: v.string(),
    notificationIntentId: v.string(),
    expectedRevision: v.number(),
    scheduledFor: v.number(),
    escalationLevel: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.notificationIntentId, 'notificationIntentId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.scheduledFor, 'scheduledFor')
    assertPositiveInteger(args.escalationLevel, 'escalationLevel', 32)
    const intent = await intentById(ctx, args.installationId, args.notificationIntentId)
    if (intent === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (intent.deletedAt !== undefined || intent.lifecycle !== 'failed')
      return { ok: false as const, reason: 'invalid_state' as const }
    if (intent.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    if (args.escalationLevel <= intent.escalationLevel)
      throw new Error('escalationLevel must increase')
    await ctx.db.patch(intent._id, {
      lifecycle: 'queued',
      scheduledFor: args.scheduledFor,
      escalationLevel: args.escalationLevel,
      lastError: undefined,
      revision: intent.revision + 1,
      updatedAt: Date.now(),
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: intent.revision + 1 }
  },
})

export const cancel = mutation({
  args: {
    installationId: v.string(),
    notificationIntentId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.notificationIntentId, 'notificationIntentId')
    assertExpectedRevision(args.expectedRevision)
    const intent = await intentById(ctx, args.installationId, args.notificationIntentId)
    if (intent === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (
      intent.deletedAt !== undefined ||
      intent.lifecycle === 'acknowledged' ||
      intent.lifecycle === 'cancelled'
    ) return { ok: false as const, reason: 'invalid_state' as const }
    if (intent.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    await ctx.db.patch(intent._id, {
      lifecycle: 'cancelled',
      revision: intent.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: intent.revision + 1 }
  },
})
