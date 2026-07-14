import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import {
  ARTIFACT_MATERIALIZATION_CAPABILITY,
  CONTRACT_VERSION,
  JOB_KINDS,
  canonicalContentHash,
} from '@kriyan/contracts'

import { mutation, query, type MutationCtx, type QueryCtx } from './_generated/server'
import {
  advanceClientSnapshotRevision,
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
import { artifactValue, noteLinkValue, noteValue, noteVersionValue, transitionResult } from './validators'
import { computeMigrationManifest } from './migration_manifest'

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

async function compatibilityMode(ctx: MutationCtx | QueryCtx, installationId: string): Promise<'dual-read' | 'canonical' | 'rollback'> {
  const installation = await ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', installationId)).unique()
  if (installation === null) throw new Error('installation not found')
  return installation.compatibilityMode ?? 'dual-read'
}

async function assertWritersEnabled(ctx: MutationCtx, installationId: string): Promise<void> {
  if (await compatibilityMode(ctx, installationId) === 'rollback') {
    throw new Error('canonical writers are disabled in rollback mode')
  }
}

async function readCompatibleNote(ctx: MutationCtx | QueryCtx, note: any): Promise<any> {
  const mode = await compatibilityMode(ctx, note.installationId)
  if (mode === 'rollback' || note.currentVersionId !== undefined) return withoutSystemFields(note)
  const version = await ctx.db.query('noteVersions').withIndex('by_installation_note_version', (q) => q.eq('installationId', note.installationId).eq('noteId', note.noteId).eq('version', 0)).unique()
  if (version === null) return mode === 'canonical' ? null : withoutSystemFields(note)
  return { ...withoutSystemFields(note), currentVersionId: version.noteVersionId, contentHash: version.contentHash }
}

async function queueArtifactJob(
  ctx: MutationCtx,
  artifact: {
    installationId: string; artifactId: string; noteId: string; noteVersionId: string;
    slug: string; revision: number; projectedHash?: string; projectedPath?: string;
    priorProjectedHash?: string; priorProjectedPath?: string;
    projectionState?: 'pending' | 'projected' | 'failed' | 'tombstoned';
    updatedAt?: number;
  },
  kind: typeof JOB_KINDS.artifactMaterialize | typeof JOB_KINDS.artifactTombstone,
  now: number,
): Promise<void> {
  const action = kind === JOB_KINDS.artifactMaterialize ? 'materialize' : 'tombstone'
  const commandId = `command:${kind}:${artifact.artifactId}:${artifact.revision}`
  const existing = await ctx.db.query('commands').withIndex('by_installation_command', (q) => q.eq('installationId', artifact.installationId).eq('commandId', commandId)).unique()
  if (existing !== null) return
  const input = JSON.stringify({
    action, artifactId: artifact.artifactId, noteId: artifact.noteId,
    noteVersionId: artifact.noteVersionId, expectedArtifactRevision: artifact.revision,
    slug: artifact.slug, projectedPath: `artifacts/${artifact.slug}.md`,
    priorProjectedHash: artifact.priorProjectedHash ?? artifact.projectedHash,
    priorProjectedPath: artifact.priorProjectedPath ?? artifact.projectedPath,
  })
  await ctx.db.insert('commands', {
    installationId: artifact.installationId, commandId, idempotencyKey: commandId,
    input, contractVersion: CONTRACT_VERSION, kind, status: 'accepted',
    revision: 0, createdAt: now, updatedAt: now,
  })
  await ctx.db.insert('jobs', {
    installationId: artifact.installationId, jobId: `job:${commandId}`, commandId,
    contractVersion: CONTRACT_VERSION, kind,
    requiredCapabilities: [ARTIFACT_MATERIALIZATION_CAPABILITY], status: 'queued',
    attempt: 0, maxAttempts: 3, revision: 0, createdAt: now, updatedAt: now,
  })
}

async function assertArtifactSlugAvailable(
  ctx: MutationCtx,
  installationId: string,
  slug: string,
  artifactId: string,
): Promise<void> {
  const artifacts = await ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) =>
    q.eq('installationId', installationId),
  ).collect()
  if (artifacts.some((artifact) => artifact.artifactId !== artifactId && artifact.slug === slug && artifact.deletedAt === undefined)) {
    throw new Error('artifact slug conflicts with an active artifact path')
  }
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
    await assertWritersEnabled(ctx, args.installationId)
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
    await advanceClientSnapshotRevision(ctx, args.installationId)
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
    return await readCompatibleNote(ctx, note)
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
    const compatible = await Promise.all(page.page.map((note) => readCompatibleNote(ctx as any, note)))
    return { ...page, page: compatible.filter((note) => note !== null) }
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
    await assertWritersEnabled(ctx, args.installationId)
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
    const artifacts = await ctx.db.query('artifacts').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId).eq('noteId', note.noteId)).collect()
    for (const artifact of artifacts) {
      if (artifact.deletedAt !== undefined) continue
      await ctx.db.patch(artifact._id, {
        noteVersionId, projectionState: 'pending', priorProjectedHash: artifact.projectedHash,
        priorProjectedPath: artifact.projectedPath, lastError: undefined,
        revision: artifact.revision + 1, updatedAt: now,
      })
      await queueArtifactJob(ctx, {
        ...withoutSystemFields(artifact), noteVersionId, projectionState: 'pending',
        priorProjectedHash: artifact.projectedHash, priorProjectedPath: artifact.projectedPath,
        revision: artifact.revision + 1, updatedAt: now,
      }, JOB_KINDS.artifactMaterialize, now)
    }
    await advanceClientSnapshotRevision(ctx, args.installationId)
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
    const batchId = `d41-backfill:notes:${canonicalContentHash(JSON.stringify({ cursor: args.cursor }))}`
    const replay = await ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', batchId)).unique()
    if (replay !== null) return { continueCursor: replay.pageCursor ?? '', isDone: replay.mode === 'verified', scanned: replay.scanned ?? 0, created: 0 }
    const page = await ctx.db.query('notes').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId)).paginate({ cursor: args.cursor, numItems: args.numItems })
    let created = 0
    for (const note of page.page) {
      const noteVersionId = `note-version:${note.noteId}:0`
      const existing = await ctx.db.query('noteVersions').withIndex('by_installation_version', (q) => q.eq('installationId', args.installationId).eq('noteVersionId', noteVersionId)).unique()
      if (existing !== null) continue
      const contentHash = canonicalContentHash(note.contentJson)
      await ctx.db.insert('noteVersions', { installationId: args.installationId, noteVersionId, noteId: note.noteId, version: 0, contentJson: note.contentJson, contentHash, plainTextPreview: note.plainTextPreview, wordCount: note.wordCount, authorOrigin: 'd41-backfill', createdAt: note.createdAt })
      created += 1
    }
    const now = Date.now()
    const manifestHash = canonicalContentHash(JSON.stringify(page.page.map((note) => ({ noteId: note.noteId, contentJson: note.contentJson, revision: note.revision, deletedAt: note.deletedAt }))))
    const cursorId = 'd41-backfill:notes'
    const progress = await ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', cursorId)).unique()
    const progressHash = canonicalContentHash(JSON.stringify({ prior: progress?.documentHash ?? null, batch: manifestHash }))
    await ctx.db.insert('projectionCursors', { installationId: args.installationId, cursorId: batchId, vaultId: 'legacy:d41', cursor: page.page.length, pageCursor: page.continueCursor, scanned: page.page.length, createdCount: created, manifestHash, mode: page.isDone ? 'verified' : 'backfill', revision: 0, createdAt: now, updatedAt: now })
    if (progress === null) await ctx.db.insert('projectionCursors', { installationId: args.installationId, cursorId, vaultId: 'legacy:d41', cursor: page.page.length, documentHash: progressHash, mode: page.isDone ? 'verified' : 'backfill', revision: 0, createdAt: now, updatedAt: now })
    else await ctx.db.patch(progress._id, { cursor: progress.cursor + page.page.length, documentHash: progressHash, mode: page.isDone ? 'verified' : 'backfill', revision: progress.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { continueCursor: page.continueCursor, isDone: page.isDone, scanned: page.page.length, created }
  },
})

export const setCompatibilityMode = mutation({
  args: { installationId: v.string(), mode: v.union(v.literal('dual-read'), v.literal('canonical'), v.literal('rollback')), expectedManifestHash: v.string() },
  returns: v.object({ ok: v.boolean(), mode: v.string(), manifestHash: v.string(), reason: v.optional(v.string()) }),
  handler: async (ctx, args) => {
    const installation = await ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId)).unique()
    if (installation === null) return { ok: false, mode: args.mode, manifestHash: '', reason: 'not_found' }
    const manifest = await computeMigrationManifest(ctx, args.installationId)
    if (manifest.aggregateHash !== args.expectedManifestHash) {
      return { ok: false, mode: args.mode, manifestHash: manifest.aggregateHash, reason: 'manifest_mismatch' }
    }
    if (args.mode === 'canonical') {
      const [notes, versions, sources, knowledge, sourceCursor, knowledgeCursor] = await Promise.all([
        ctx.db.query('notes').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId)).collect(),
        ctx.db.query('noteVersions').withIndex('by_installation_note_version', (q) => q.eq('installationId', args.installationId)).collect(),
        ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId)).collect(),
        ctx.db.query('knowledgeDocuments').withIndex('by_installation_knowledge', (q) => q.eq('installationId', args.installationId)).collect(),
        ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', 'd41-backfill:source')).unique(),
        ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', 'd41-backfill:knowledge')).unique(),
      ])
      if (!notes.every((note) => versions.some((version) => version.noteId === note.noteId && version.version === 0))) return { ok: false, mode: args.mode, manifestHash: manifest.aggregateHash, reason: 'notes_backfill_incomplete' }
      if ((sources.length > 0 && sourceCursor?.mode !== 'verified') || (knowledge.length > 0 && knowledgeCursor?.mode !== 'verified')) return { ok: false, mode: args.mode, manifestHash: manifest.aggregateHash, reason: 'projection_backfill_incomplete' }
    }
    await ctx.db.patch(installation._id, { compatibilityMode: args.mode, contractVersion: CONTRACT_VERSION, updatedAt: Date.now() })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true, mode: args.mode, manifestHash: manifest.aggregateHash }
  },
})

export const verifyBackfill = query({
  args: { installationId: v.string() },
  returns: v.object({ notes: v.number(), versionZero: v.number(), complete: v.boolean(), cursorVerified: v.boolean(), compatibilityMode: v.string() }),
  handler: async (ctx, args) => {
    const notes = await ctx.db.query('notes').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId)).collect()
    const versions = await ctx.db.query('noteVersions').withIndex('by_installation_note_version', (q) => q.eq('installationId', args.installationId)).collect()
    const installation = await ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', args.installationId)).unique()
    const cursor = await ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', 'd41-backfill:notes')).unique()
    const versionZero = versions.filter((item) => item.version === 0).length
    return { notes: notes.length, versionZero, complete: notes.every((note) => versions.some((item) => item.noteId === note.noteId && item.version === 0)), cursorVerified: cursor?.mode === 'verified' && cursor.cursor <= notes.length && cursor.documentHash !== undefined, compatibilityMode: installation?.compatibilityMode ?? 'dual-read' }
  },
})

export const createArtifact = mutation({
  args: { installationId: v.string(), artifactId: v.string(), noteId: v.string(), noteVersionId: v.string(), slug: v.string() },
  returns: v.object({ created: v.boolean(), artifact: artifactValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId'); assertId(args.artifactId, 'artifactId'); assertId(args.noteId, 'noteId'); assertId(args.noteVersionId, 'noteVersionId')
    assertBoundedString(args.slug, 'slug', 256)
    const existing = await ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) => q.eq('installationId', args.installationId).eq('artifactId', args.artifactId)).unique()
    if (existing !== null) {
      if (existing.noteId !== args.noteId || existing.noteVersionId !== args.noteVersionId || existing.slug !== args.slug || existing.deletedAt !== undefined) throw new Error('artifactId conflicts with an existing artifact')
      return { created: false, artifact: withoutSystemFields(existing) }
    }
    await assertArtifactSlugAvailable(ctx, args.installationId, args.slug, args.artifactId)
    const version = await ctx.db.query('noteVersions').withIndex('by_installation_version', (q) => q.eq('installationId', args.installationId).eq('noteVersionId', args.noteVersionId)).unique()
    if (version === null || version.noteId !== args.noteId) throw new Error('committed note version not found')
    const now = Date.now()
    const artifact = { ...args, projectionState: 'pending' as const, revision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('artifacts', artifact)
    await queueArtifactJob(ctx, artifact, JOB_KINDS.artifactMaterialize, now)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, artifact }
  },
})

export const advanceArtifact = mutation({
  args: { installationId: v.string(), artifactId: v.string(), noteVersionId: v.string(), slug: v.string(), expectedRevision: v.number(), expectedProjectedHash: v.optional(v.string()) },
  returns: transitionResult,
  handler: async (ctx, args) => {
    const artifact = await ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) => q.eq('installationId', args.installationId).eq('artifactId', args.artifactId)).unique()
    if (artifact === null) return { ok: false as const, reason: 'not_found' as const }
    if (artifact.noteVersionId === args.noteVersionId && artifact.slug === args.slug && artifact.projectionState === 'pending') return { ok: true as const, revision: artifact.revision }
    if (artifact.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (artifact.deletedAt !== undefined || artifact.projectedHash !== args.expectedProjectedHash) return { ok: false as const, reason: 'invalid_state' as const }
    const version = await ctx.db.query('noteVersions').withIndex('by_installation_version', (q) => q.eq('installationId', args.installationId).eq('noteVersionId', args.noteVersionId)).unique()
    if (version === null || version.noteId !== artifact.noteId) return { ok: false as const, reason: 'invalid_state' as const }
    await assertArtifactSlugAvailable(ctx, args.installationId, args.slug, args.artifactId)
    const now = Date.now()
    await ctx.db.patch(artifact._id, { noteVersionId: args.noteVersionId, slug: args.slug, projectionState: 'pending', priorProjectedHash: artifact.projectedHash, priorProjectedPath: artifact.projectedPath, lastError: undefined, revision: artifact.revision + 1, updatedAt: now })
    await queueArtifactJob(ctx, {
      ...withoutSystemFields(artifact), noteVersionId: args.noteVersionId, slug: args.slug,
      projectionState: 'pending', priorProjectedHash: artifact.projectedHash,
      priorProjectedPath: artifact.projectedPath, revision: artifact.revision + 1, updatedAt: now,
    }, JOB_KINDS.artifactMaterialize, now)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: artifact.revision + 1 }
  },
})

export const createLink = mutation({
  args: { installationId: v.string(), noteLinkId: v.string(), idempotencyKey: v.string(), noteId: v.string(), targetKind: v.string(), targetId: v.string(), relation: v.string(), provenanceIds: v.array(v.string()) },
  returns: v.object({ created: v.boolean(), link: noteLinkValue }),
  handler: async (ctx, args) => {
    for (const [name, value] of Object.entries({ installationId: args.installationId, noteLinkId: args.noteLinkId, idempotencyKey: args.idempotencyKey, noteId: args.noteId, targetId: args.targetId })) assertId(value, name)
    assertStringList(args.provenanceIds, 'provenanceIds', 128)
    const byId = await ctx.db.query('noteLinks').withIndex('by_installation_link', (q) => q.eq('installationId', args.installationId).eq('noteLinkId', args.noteLinkId)).unique()
    const byKey = await ctx.db.query('noteLinks').withIndex('by_installation_link_idempotency', (q) => q.eq('installationId', args.installationId).eq('idempotencyKey', args.idempotencyKey)).unique()
    const existing = byId ?? byKey
    if (existing !== null) {
      const same = existing.noteLinkId === args.noteLinkId && existing.idempotencyKey === args.idempotencyKey && existing.noteId === args.noteId && existing.targetKind === args.targetKind && existing.targetId === args.targetId && existing.relation === args.relation && valuesEqual(existing.provenanceIds, args.provenanceIds) && existing.deletedAt === undefined
      if (!same) throw new Error('note link id or idempotency key conflicts')
      return { created: false, link: withoutSystemFields(existing) }
    }
    const note = await ctx.db.query('notes').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId).eq('noteId', args.noteId)).unique()
    if (note === null || note.deletedAt !== undefined) throw new Error('note not found')
    const now = Date.now(); const link = { ...args, revision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('noteLinks', link)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, link }
  },
})

export const listLinks = query({
  args: { installationId: v.string(), noteId: v.string(), includeDeleted: v.optional(v.boolean()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(noteLinkValue),
  handler: async (ctx, args) => {
    const page = await ctx.db.query('noteLinks').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId).eq('noteId', args.noteId)).paginate(args.paginationOpts)
    return { ...page, page: page.page.filter((link) => args.includeDeleted || link.deletedAt === undefined).map(withoutSystemFields) }
  },
})

export const tombstoneLink = mutation({
  args: { installationId: v.string(), noteLinkId: v.string(), expectedRevision: v.number() }, returns: transitionResult,
  handler: async (ctx, args) => {
    const link = await ctx.db.query('noteLinks').withIndex('by_installation_link', (q) => q.eq('installationId', args.installationId).eq('noteLinkId', args.noteLinkId)).unique()
    if (link === null) return { ok: false as const, reason: 'not_found' as const }
    if (link.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (link.deletedAt !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now(); await ctx.db.patch(link._id, { deletedAt: now, revision: link.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: link.revision + 1 }
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
    await advanceClientSnapshotRevision(ctx, args.installationId)
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
    await advanceClientSnapshotRevision(ctx, args.installationId)
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
    await advanceClientSnapshotRevision(ctx, args.installationId)
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
    await assertWritersEnabled(ctx, args.installationId)
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
    const artifacts = await ctx.db.query('artifacts').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId).eq('noteId', note.noteId)).collect()
    for (const artifact of artifacts) if (artifact.deletedAt === undefined) await queueArtifactJob(ctx, withoutSystemFields(artifact), JOB_KINDS.artifactTombstone, now)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: note.revision + 1 }
  },
})
