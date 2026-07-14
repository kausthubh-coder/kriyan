import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
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
  assertSourceUrl,
  assertTimestamp,
  MAX_PAGE_SIZE,
  valuesEqual,
  withoutSystemFields,
} from './lib'
import {
  calendarEventStatus,
  calendarEventValue,
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

function assertEventRange(startAt: number, endAt: number): void {
  assertTimestamp(startAt, 'startAt')
  assertTimestamp(endAt, 'endAt')
  if (endAt <= startAt) throw new Error('endAt must be after startAt')
}

export const create = mutation({
  args: {
    installationId: v.string(),
    calendarEventId: v.string(),
    idempotencyKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.number(),
    timezone: v.string(),
    allDay: v.boolean(),
    location: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    status: calendarEventStatus,
    sourceProvider: v.optional(v.string()),
    externalCalendarId: v.optional(v.string()),
    externalEventId: v.optional(v.string()),
    recurrenceRule: v.optional(v.string()),
    recurringEventId: v.optional(v.string()),
    originalStartAt: v.optional(v.number()),
    sourceRefId: v.optional(v.string()),
  },
  returns: v.object({ created: v.boolean(), event: calendarEventValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.calendarEventId, 'calendarEventId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.title, 'title', 1_024)
    if (args.description !== undefined)
      assertLongText(args.description, 'description')
    assertEventRange(args.startAt, args.endAt)
    assertShortText(args.timezone, 'timezone')
    if (args.location !== undefined)
      assertBoundedString(args.location, 'location', 2_048)
    assertSourceUrl(args.sourceUrl)
    if (args.sourceProvider !== undefined)
      assertShortText(args.sourceProvider, 'sourceProvider')
    assertOptionalId(args.externalCalendarId, 'externalCalendarId')
    assertOptionalId(args.externalEventId, 'externalEventId')
    if (args.recurrenceRule !== undefined)
      assertBoundedString(args.recurrenceRule, 'recurrenceRule', 2_048)
    assertOptionalId(args.recurringEventId, 'recurringEventId')
    if (args.originalStartAt !== undefined)
      assertTimestamp(args.originalStartAt, 'originalStartAt')
    assertOptionalId(args.sourceRefId, 'sourceRefId')
    await assertInstallation(ctx, args.installationId)
    const byId = await ctx.db
      .query('calendarEvents')
      .withIndex('by_installation_event', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('calendarEventId', args.calendarEventId),
      )
      .unique()
    const byIdempotency = await ctx.db
      .query('calendarEvents')
      .withIndex('by_installation_idempotency', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    const existing = byId ?? byIdempotency
    if (existing !== null) {
      const comparable = {
        ...args,
        revision: existing.revision,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      }
      if (
        existing.deletedAt !== undefined ||
        !valuesEqual(withoutSystemFields(existing), comparable)
      ) throw new Error('calendar event id or idempotency key conflicts')
      return { created: false, event: withoutSystemFields(existing) }
    }
    const now = Date.now()
    const event = { ...args, revision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('calendarEvents', event)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, event }
  },
})

export const get = query({
  args: {
    installationId: v.string(),
    calendarEventId: v.string(),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), calendarEventValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.calendarEventId, 'calendarEventId')
    const event = await ctx.db
      .query('calendarEvents')
      .withIndex('by_installation_event', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('calendarEventId', args.calendarEventId),
      )
      .unique()
    if (event === null || (event.deletedAt !== undefined && !args.includeDeleted))
      return null
    return withoutSystemFields(event)
  },
})

export const list = query({
  args: {
    installationId: v.string(),
    status: v.optional(calendarEventStatus),
    startsAfter: v.optional(v.number()),
    startsBefore: v.optional(v.number()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(calendarEventValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    if (args.startsAfter !== undefined)
      assertTimestamp(args.startsAfter, 'startsAfter')
    if (args.startsBefore !== undefined)
      assertTimestamp(args.startsBefore, 'startsBefore')
    if (
      args.startsAfter !== undefined &&
      args.startsBefore !== undefined &&
      args.startsAfter > args.startsBefore
    ) throw new Error('startsAfter must not be after startsBefore')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page = args.status === undefined
      ? await ctx.db
          .query('calendarEvents')
          .withIndex('by_installation_live_start', (q) => {
            const range = q
              .eq('installationId', args.installationId)
              .eq('deletedAt', undefined)
            if (
              args.startsAfter !== undefined &&
              args.startsBefore !== undefined
            ) return range
              .gte('startAt', args.startsAfter)
              .lte('startAt', args.startsBefore)
            if (args.startsAfter !== undefined)
              return range.gte('startAt', args.startsAfter)
            if (args.startsBefore !== undefined)
              return range.lte('startAt', args.startsBefore)
            return range
          })
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('calendarEvents')
          .withIndex('by_installation_live_status_start', (q) => {
            const range = q
              .eq('installationId', args.installationId)
              .eq('deletedAt', undefined)
              .eq('status', args.status!)
            if (
              args.startsAfter !== undefined &&
              args.startsBefore !== undefined
            ) return range
              .gte('startAt', args.startsAfter)
              .lte('startAt', args.startsBefore)
            if (args.startsAfter !== undefined)
              return range.gte('startAt', args.startsAfter)
            if (args.startsBefore !== undefined)
              return range.lte('startAt', args.startsBefore)
            return range
          })
          .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const update = mutation({
  args: {
    installationId: v.string(),
    calendarEventId: v.string(),
    expectedRevision: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    startAt: v.optional(v.number()),
    endAt: v.optional(v.number()),
    timezone: v.optional(v.string()),
    allDay: v.optional(v.boolean()),
    location: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    status: v.optional(calendarEventStatus),
    recurrenceRule: v.optional(v.string()),
    sourceRefId: v.optional(v.string()),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.calendarEventId, 'calendarEventId')
    assertExpectedRevision(args.expectedRevision)
    if (args.title !== undefined)
      assertBoundedString(args.title, 'title', 1_024)
    if (args.description !== undefined)
      assertLongText(args.description, 'description')
    if (args.timezone !== undefined) assertShortText(args.timezone, 'timezone')
    if (args.location !== undefined)
      assertBoundedString(args.location, 'location', 2_048)
    assertSourceUrl(args.sourceUrl)
    if (args.recurrenceRule !== undefined)
      assertBoundedString(args.recurrenceRule, 'recurrenceRule', 2_048)
    assertOptionalId(args.sourceRefId, 'sourceRefId')
    const event = await ctx.db
      .query('calendarEvents')
      .withIndex('by_installation_event', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('calendarEventId', args.calendarEventId),
      )
      .unique()
    if (event === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (event.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (event.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    assertEventRange(args.startAt ?? event.startAt, args.endAt ?? event.endAt)
    const now = Date.now()
    await ctx.db.patch(event._id, {
      title: args.title ?? event.title,
      description: args.description ?? event.description,
      startAt: args.startAt ?? event.startAt,
      endAt: args.endAt ?? event.endAt,
      timezone: args.timezone ?? event.timezone,
      allDay: args.allDay ?? event.allDay,
      location: args.location ?? event.location,
      sourceUrl: args.sourceUrl ?? event.sourceUrl,
      status: args.status ?? event.status,
      recurrenceRule: args.recurrenceRule ?? event.recurrenceRule,
      sourceRefId: args.sourceRefId ?? event.sourceRefId,
      revision: event.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: event.revision + 1 }
  },
})

export const tombstone = mutation({
  args: {
    installationId: v.string(),
    calendarEventId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.calendarEventId, 'calendarEventId')
    assertExpectedRevision(args.expectedRevision)
    const event = await ctx.db
      .query('calendarEvents')
      .withIndex('by_installation_event', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('calendarEventId', args.calendarEventId),
      )
      .unique()
    if (event === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (event.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (event.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    await ctx.db.patch(event._id, {
      status: 'cancelled',
      deletedAt: now,
      revision: event.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: event.revision + 1 }
  },
})
