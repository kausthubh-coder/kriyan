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
  assertOptionalId,
  assertPositiveInteger,
  assertStringList,
  assertTipTapJson,
  MAX_PAGE_SIZE,
  valuesEqual,
  withoutSystemFields,
} from './lib'
import { noteValue, transitionResult } from './validators'

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

function assertPreview(value: string): void {
  if (value.length > 4_096) {
    throw new Error('plainTextPreview must contain at most 4096 characters')
  }
}

function assertWordCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error('wordCount must be an integer between 0 and 1000000')
  }
}

export const create = mutation({
  args: {
    installationId: v.string(),
    noteId: v.string(),
    idempotencyKey: v.string(),
    title: v.optional(v.string()),
    contentJson: v.string(),
    plainTextPreview: v.string(),
    wordCount: v.number(),
    tags: v.array(v.string()),
    entityId: v.optional(v.string()),
  },
  returns: v.object({ created: v.boolean(), note: noteValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.noteId, 'noteId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    if (args.title !== undefined)
      assertBoundedString(args.title, 'title', 1_024)
    assertTipTapJson(args.contentJson)
    assertPreview(args.plainTextPreview)
    assertWordCount(args.wordCount)
    assertStringList(args.tags, 'tags')
    assertOptionalId(args.entityId, 'entityId')
    await assertInstallation(ctx, args.installationId)
    const byId = await ctx.db
      .query('notes')
      .withIndex('by_installation_note', (q) =>
        q.eq('installationId', args.installationId).eq('noteId', args.noteId),
      )
      .unique()
    const byIdempotency = await ctx.db
      .query('notes')
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
      ) throw new Error('note id or idempotency key conflicts')
      return { created: false, note: withoutSystemFields(existing) }
    }
    const now = Date.now()
    const note = { ...args, revision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('notes', note)
    return { created: true, note }
  },
})

export const get = query({
  args: {
    installationId: v.string(),
    noteId: v.string(),
    includeDeleted: v.optional(v.boolean()),
  },
  returns: v.union(v.null(), noteValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.noteId, 'noteId')
    const note = await ctx.db
      .query('notes')
      .withIndex('by_installation_note', (q) =>
        q.eq('installationId', args.installationId).eq('noteId', args.noteId),
      )
      .unique()
    if (note === null || (note.deletedAt !== undefined && !args.includeDeleted))
      return null
    return withoutSystemFields(note)
  },
})

export const list = query({
  args: {
    installationId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(noteValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    const page = await ctx.db
      .query('notes')
      .withIndex('by_installation_live_updated', (q) =>
        q.eq('installationId', args.installationId).eq('deletedAt', undefined),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const update = mutation({
  args: {
    installationId: v.string(),
    noteId: v.string(),
    expectedRevision: v.number(),
    title: v.optional(v.string()),
    clearTitle: v.optional(v.boolean()),
    contentJson: v.optional(v.string()),
    plainTextPreview: v.optional(v.string()),
    wordCount: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
    entityId: v.optional(v.string()),
    clearEntityId: v.optional(v.boolean()),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.noteId, 'noteId')
    assertExpectedRevision(args.expectedRevision)
    if (args.title !== undefined)
      assertBoundedString(args.title, 'title', 1_024)
    if (args.title !== undefined && args.clearTitle)
      throw new Error('title and clearTitle are mutually exclusive')
    if (args.contentJson !== undefined) assertTipTapJson(args.contentJson)
    if (args.plainTextPreview !== undefined)
      assertPreview(args.plainTextPreview)
    if (args.wordCount !== undefined) assertWordCount(args.wordCount)
    if (args.tags !== undefined) assertStringList(args.tags, 'tags')
    assertOptionalId(args.entityId, 'entityId')
    if (args.entityId !== undefined && args.clearEntityId)
      throw new Error('entityId and clearEntityId are mutually exclusive')
    const note = await ctx.db
      .query('notes')
      .withIndex('by_installation_note', (q) =>
        q.eq('installationId', args.installationId).eq('noteId', args.noteId),
      )
      .unique()
    if (note === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (note.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (note.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    await ctx.db.patch(note._id, {
      title: args.clearTitle ? undefined : (args.title ?? note.title),
      contentJson: args.contentJson ?? note.contentJson,
      plainTextPreview: args.plainTextPreview ?? note.plainTextPreview,
      wordCount: args.wordCount ?? note.wordCount,
      tags: args.tags ?? note.tags,
      entityId: args.clearEntityId ? undefined : (args.entityId ?? note.entityId),
      revision: note.revision + 1,
      updatedAt: now,
    })
    return { ok: true as const, revision: note.revision + 1 }
  },
})

export const tombstone = mutation({
  args: {
    installationId: v.string(),
    noteId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.noteId, 'noteId')
    assertExpectedRevision(args.expectedRevision)
    const note = await ctx.db
      .query('notes')
      .withIndex('by_installation_note', (q) =>
        q.eq('installationId', args.installationId).eq('noteId', args.noteId),
      )
      .unique()
    if (note === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (note.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (note.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    await ctx.db.patch(note._id, {
      deletedAt: now,
      revision: note.revision + 1,
      updatedAt: now,
    })
    return { ok: true as const, revision: note.revision + 1 }
  },
})
