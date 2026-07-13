import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'
import { canonicalContentHash } from '@kriyan/contracts'

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
import { artifactValue, noteValue, noteVersionValue, transitionResult } from './validators'

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
        currentVersionId: existing.currentVersionId,
        contentHash: existing.contentHash,
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
    const contentHash = canonicalContentHash(args.contentJson)
    const noteVersionId = `note-version:${args.noteId}:0`
    const note = { ...args, currentVersionId: noteVersionId, contentHash, revision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('notes', note)
    await ctx.db.insert('noteVersions', {
      installationId: args.installationId, noteVersionId, noteId: args.noteId,
      version: 0, contentJson: args.contentJson, contentHash,
      plainTextPreview: args.plainTextPreview, wordCount: args.wordCount,
      authorOrigin: 'client', createdAt: now,
    })
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
    const nextContentJson = args.contentJson ?? note.contentJson
    const nextPreview = args.plainTextPreview ?? note.plainTextPreview
    const nextWordCount = args.wordCount ?? note.wordCount
    const contentHash = canonicalContentHash(nextContentJson)
    const noteVersionId = `note-version:${note.noteId}:${note.revision + 1}`
    await ctx.db.insert('noteVersions', {
      installationId: args.installationId, noteVersionId, noteId: note.noteId,
      version: note.revision + 1, contentJson: nextContentJson, contentHash,
      plainTextPreview: nextPreview, wordCount: nextWordCount,
      authorOrigin: 'client', createdAt: now,
    })
    await ctx.db.patch(note._id, {
      title: args.clearTitle ? undefined : (args.title ?? note.title),
      contentJson: args.contentJson ?? note.contentJson,
      plainTextPreview: args.plainTextPreview ?? note.plainTextPreview,
      wordCount: args.wordCount ?? note.wordCount,
      currentVersionId: noteVersionId,
      contentHash,
      tags: args.tags ?? note.tags,
      entityId: args.clearEntityId ? undefined : (args.entityId ?? note.entityId),
      revision: note.revision + 1,
      updatedAt: now,
    })
    return { ok: true as const, revision: note.revision + 1 }
  },
})

export const listVersions = query({
  args: { installationId: v.string(), noteId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(noteVersionValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId'); assertId(args.noteId, 'noteId')
    assertPositiveInteger(args.paginationOpts.numItems, 'paginationOpts.numItems', MAX_PAGE_SIZE)
    const page = await ctx.db.query('noteVersions').withIndex('by_installation_note_version', (q) => q.eq('installationId', args.installationId).eq('noteId', args.noteId)).paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const backfillLegacyVersions = mutation({
  args: { installationId: v.string(), cursor: v.union(v.null(), v.string()), numItems: v.number() },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), scanned: v.number(), created: v.number() }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId'); assertPositiveInteger(args.numItems, 'numItems', 100)
    const page = await ctx.db.query('notes').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId)).paginate({ cursor: args.cursor, numItems: args.numItems })
    let created = 0
    for (const note of page.page) {
      const noteVersionId = `note-version:${note.noteId}:0`
      const existing = await ctx.db.query('noteVersions').withIndex('by_installation_version', (q) => q.eq('installationId', args.installationId).eq('noteVersionId', noteVersionId)).unique()
      if (existing !== null) continue
      const contentHash = canonicalContentHash(note.contentJson)
      await ctx.db.insert('noteVersions', { installationId: args.installationId, noteVersionId, noteId: note.noteId, version: 0, contentJson: note.contentJson, contentHash, plainTextPreview: note.plainTextPreview, wordCount: note.wordCount, authorOrigin: 'd41-backfill', createdAt: note.createdAt })
      if (note.currentVersionId === undefined) await ctx.db.patch(note._id, { currentVersionId: noteVersionId, contentHash })
      created += 1
    }
    return { continueCursor: page.continueCursor, isDone: page.isDone, scanned: page.page.length, created }
  },
})

export const setCompatibilityMode = mutation({
  args: { installationId: v.string(), mode: v.union(v.literal('dual-read'), v.literal('canonical'), v.literal('rollback')) },
  returns: v.object({ ok: v.boolean(), mode: v.string() }),
  handler: async (ctx, args) => {
    const installation = await ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId)).unique()
    if (installation === null) return { ok: false, mode: args.mode }
    await ctx.db.patch(installation._id, { compatibilityMode: args.mode, contractVersion: 'kriyan.contracts.v1', updatedAt: Date.now() })
    return { ok: true, mode: args.mode }
  },
})

export const verifyBackfill = query({
  args: { installationId: v.string() },
  returns: v.object({ notes: v.number(), versionZero: v.number(), complete: v.boolean(), compatibilityMode: v.string() }),
  handler: async (ctx, args) => {
    const notes = await ctx.db.query('notes').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId)).collect()
    const versions = await ctx.db.query('noteVersions').withIndex('by_installation_note_version', (q) => q.eq('installationId', args.installationId)).collect()
    const installation = await ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId)).unique()
    const versionZero = versions.filter((item) => item.version === 0).length
    return { notes: notes.length, versionZero, complete: notes.every((note) => versions.some((item) => item.noteId === note.noteId && item.version === 0)), compatibilityMode: installation?.compatibilityMode ?? 'dual-read' }
  },
})

export const createArtifact = mutation({
  args: { installationId: v.string(), artifactId: v.string(), noteId: v.string(), noteVersionId: v.string(), slug: v.string() },
  returns: v.object({ created: v.boolean(), artifact: artifactValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId'); assertId(args.artifactId, 'artifactId'); assertId(args.noteId, 'noteId'); assertId(args.noteVersionId, 'noteVersionId')
    assertBoundedString(args.slug, 'slug', 256)
    const existing = await ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) => q.eq('installationId', args.installationId).eq('artifactId', args.artifactId)).unique()
    if (existing !== null) return { created: false, artifact: withoutSystemFields(existing) }
    const version = await ctx.db.query('noteVersions').withIndex('by_installation_version', (q) => q.eq('installationId', args.installationId).eq('noteVersionId', args.noteVersionId)).unique()
    if (version === null || version.noteId !== args.noteId) throw new Error('committed note version not found')
    const now = Date.now()
    const artifact = { ...args, projectionState: 'pending' as const, revision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('artifacts', artifact)
    return { created: true, artifact }
  },
})

export const completeMaterialization = mutation({
  args: { installationId: v.string(), artifactId: v.string(), noteVersionId: v.string(), expectedRevision: v.number(), expectedPriorHash: v.optional(v.string()), projectedHash: v.string(), projectedPath: v.string() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const artifact = await ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) => q.eq('installationId', args.installationId).eq('artifactId', args.artifactId)).unique()
    if (artifact === null) return { ok: false as const, reason: 'not_found' as const }
    if (artifact.noteVersionId === args.noteVersionId && artifact.projectionState === 'projected' && artifact.projectedHash === args.projectedHash && artifact.projectedPath === args.projectedPath) return { ok: true as const, revision: artifact.revision }
    if (artifact.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (artifact.noteVersionId !== args.noteVersionId || artifact.projectedHash !== args.expectedPriorHash || artifact.deletedAt !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    await ctx.db.patch(artifact._id, { projectionState: 'projected', projectedHash: args.projectedHash, projectedPath: args.projectedPath, lastError: undefined, revision: artifact.revision + 1, updatedAt: Date.now() })
    return { ok: true as const, revision: artifact.revision + 1 }
  },
})

export const failMaterialization = mutation({
  args: { installationId: v.string(), artifactId: v.string(), noteVersionId: v.string(), expectedRevision: v.number(), error: v.string() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const artifact = await ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) => q.eq('installationId', args.installationId).eq('artifactId', args.artifactId)).unique()
    if (artifact === null) return { ok: false as const, reason: 'not_found' as const }
    if (artifact.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (artifact.noteVersionId !== args.noteVersionId || artifact.deletedAt !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    await ctx.db.patch(artifact._id, { projectionState: 'failed', lastError: args.error, revision: artifact.revision + 1, updatedAt: Date.now() })
    return { ok: true as const, revision: artifact.revision + 1 }
  },
})

export const tombstoneMaterialization = mutation({
  args: { installationId: v.string(), artifactId: v.string(), noteVersionId: v.string(), expectedRevision: v.number(), expectedProjectedHash: v.optional(v.string()) },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const artifact = await ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) => q.eq('installationId', args.installationId).eq('artifactId', args.artifactId)).unique()
    if (artifact === null) return { ok: false as const, reason: 'not_found' as const }
    if (artifact.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (artifact.noteVersionId !== args.noteVersionId || artifact.projectedHash !== args.expectedProjectedHash) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now()
    await ctx.db.patch(artifact._id, { projectionState: 'tombstoned', deletedAt: now, revision: artifact.revision + 1, updatedAt: now })
    return { ok: true as const, revision: artifact.revision + 1 }
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
