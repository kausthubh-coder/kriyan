import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'
import {
  canonicalContentHash,
  CONTRACT_VERSION,
  JOB_KINDS,
  MEMORY_CORRECTION_CAPABILITY,
  MEMORY_PROJECT_CAPABILITY,
  MEMORY_RECONCILE_CAPABILITY,
} from '@kriyan/contracts'

import { mutation, query, type MutationCtx } from './_generated/server'
import {
  advanceClientSnapshotRevision,
  assertBoundedString,
  assertExpectedRevision,
  assertId,
  assertLongText,
  assertOptionalId,
  assertPositiveInteger,
  assertProvenanceIds,
  assertShortText,
  assertSourceUrl,
  assertStringList,
  assertTimestamp,
  MAX_PAGE_SIZE,
  valuesEqual,
  withoutSystemFields,
} from './lib'
import { computeMigrationManifest, migrationManifestValue } from './migration_manifest'
import {
  indexState,
  commandValue,
  jobValue,
  knowledgeDocumentValue,
  knowledgeKind,
  memoryCorrectionValue,
  projectionUpsertResult,
  sourceKind,
  sourceRefValue,
  syncState,
  taskValue,
  transitionResult,
} from './validators'

function publicChange(change: any): Record<string, unknown> {
  const value = withoutSystemFields(change) as Record<string, unknown>
  delete value.installationId
  delete value.primarySourceRefId
  delete value.revertPayload
  return value
}

function publicExcerpt(excerpt: any): Record<string, unknown> {
  const value = withoutSystemFields(excerpt) as Record<string, unknown>
  delete value.installationId
  delete value.sourceRefId
  delete value.createdAt
  return value
}

function publicExtraction(extraction: any): Record<string, unknown> {
  const value = withoutSystemFields(extraction) as Record<string, unknown>
  delete value.installationId
  delete value.sourceRefId
  delete value.createdAt
  return value
}

const transcriptExcerptPublicValue = v.object({
  excerptId: v.string(), text: v.string(), startOffset: v.number(), endOffset: v.number(),
  speaker: v.optional(v.string()), startAtMs: v.optional(v.number()), endAtMs: v.optional(v.number()),
})
const sourceExtractionPublicValue = v.object({
  extractionId: v.string(), kind: v.string(), label: v.string(), value: v.string(),
  confidence: v.optional(v.number()), provenanceIds: v.array(v.string()),
})
const reversibleChangePublicValue = v.object({
  changeId: v.string(), targetKind: v.string(), targetId: v.string(), action: v.string(),
  summary: v.string(), origin: v.string(), sourceRefIds: v.array(v.string()),
  provenanceIds: v.array(v.string()), beforeRevision: v.optional(v.number()),
  afterRevision: v.number(), reversible: v.boolean(), revertedAt: v.optional(v.number()),
  createdAt: v.number(),
})
const memoryFactPublicValue = v.object({
  factId: v.string(), entityId: v.string(), predicate: v.string(), value: v.string(),
  confidence: v.number(), sourceRefIds: v.array(v.string()), provenanceIds: v.array(v.string()),
  revision: v.number(), createdAt: v.number(), updatedAt: v.number(), deletedAt: v.optional(v.number()),
})
const memoryRelationPublicValue = v.object({
  relationId: v.string(), fromEntityId: v.string(), toEntityId: v.string(), relationType: v.string(),
  confidence: v.number(), provenanceIds: v.array(v.string()), revision: v.number(),
  createdAt: v.number(), updatedAt: v.number(), deletedAt: v.optional(v.number()),
})
const memoryProvenancePublicValue = v.object({
  provenanceLinkId: v.string(), targetKind: v.string(), targetId: v.string(), sourceRefId: v.string(),
  excerpt: v.optional(v.string()), locator: v.optional(v.string()), confidence: v.optional(v.number()),
  createdAt: v.number(), deletedAt: v.optional(v.number()),
})
const memoryCorrectionPublicValue = v.object({
  correctionId: v.string(), targetKind: v.string(), targetId: v.string(),
  action: v.union(v.literal('retract'), v.literal('replace'), v.literal('restore')),
  replacement: v.optional(v.string()), reason: v.string(), actor: v.string(), origin: v.string(),
  expectedRevision: v.number(), state: v.union(v.literal('pending'), v.literal('applied'), v.literal('restored'), v.literal('conflict')),
  appliedRevision: v.optional(v.number()), conflict: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
})

const memoryEnqueueResult = v.object({
  created: v.boolean(),
  command: commandValue,
  job: jobValue,
})

async function enqueueMemoryJob(
  ctx: MutationCtx,
  installationId: string,
  kind: typeof JOB_KINDS.memoryProject | typeof JOB_KINDS.memoryReconcile | typeof JOB_KINDS.memoryCorrectionApply,
  capability: typeof MEMORY_PROJECT_CAPABILITY | typeof MEMORY_RECONCILE_CAPABILITY | typeof MEMORY_CORRECTION_CAPABILITY,
  intent: Record<string, unknown>,
  maxAttempts: number,
): Promise<{ created: boolean; command: any; job: any }> {
  const input = JSON.stringify(intent)
  const identity = canonicalContentHash(input).slice('sha256:'.length, 'sha256:'.length + 32)
  const commandId = `command:${kind}:${identity}`
  const existing = await ctx.db
    .query('commands')
    .withIndex('by_installation_command', (q) =>
      q.eq('installationId', installationId).eq('commandId', commandId),
    )
    .unique()
  if (existing !== null) {
    if (existing.input !== input || existing.kind !== kind || existing.idempotencyKey !== commandId) {
      throw new Error('deterministic Memory command conflicts with existing work')
    }
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_installation_command', (q) =>
        q.eq('installationId', installationId).eq('commandId', commandId),
      )
      .unique()
    if (job === null) throw new Error('deterministic Memory command is missing its job')
    return { created: false, command: withoutSystemFields(existing), job: withoutSystemFields(job) }
  }
  const now = Date.now()
  const command = {
    installationId, commandId, idempotencyKey: commandId, input,
    contractVersion: CONTRACT_VERSION, kind, status: 'accepted' as const,
    revision: 0, createdAt: now, updatedAt: now,
  }
  const job = {
    installationId, jobId: `job:${commandId}`, commandId,
    contractVersion: CONTRACT_VERSION, kind,
    requiredCapabilities: [capability], routingCapability: capability,
    status: 'queued' as const, attempt: 0, maxAttempts,
    revision: 0, createdAt: now, updatedAt: now,
  }
  await ctx.db.insert('commands', command)
  await ctx.db.insert('jobs', job)
  return { created: true, command, job }
}

export const enqueueProject = mutation({
  args: { installationId: v.string(), sourceRefId: v.string(), sourceVersion: v.string(), maxAttempts: v.number() },
  returns: memoryEnqueueResult,
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    assertId(args.sourceRefId, 'sourceRefId')
    assertBoundedString(args.sourceVersion, 'sourceVersion', 512)
    assertPositiveInteger(args.maxAttempts, 'maxAttempts', 10)
    const source = await ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) =>
      q.eq('installationId', args.installationId).eq('sourceRefId', args.sourceRefId),
    ).unique()
    if (source === null || source.deletedAt !== undefined) throw new Error('source not found')
    const result = await enqueueMemoryJob(ctx, args.installationId, JOB_KINDS.memoryProject, MEMORY_PROJECT_CAPABILITY, {
      kind: 'project', sourceRefId: args.sourceRefId, sourceVersion: args.sourceVersion,
    }, args.maxAttempts)
    if (result.created) await advanceClientSnapshotRevision(ctx, args.installationId)
    return result
  },
})

export const enqueueReconcile = mutation({
  args: { installationId: v.string(), vaultId: v.string(), manifestHash: v.string(), maxAttempts: v.number() },
  returns: memoryEnqueueResult,
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    assertId(args.vaultId, 'vaultId')
    assertBoundedString(args.manifestHash, 'manifestHash', 512)
    assertPositiveInteger(args.maxAttempts, 'maxAttempts', 10)
    const result = await enqueueMemoryJob(ctx, args.installationId, JOB_KINDS.memoryReconcile, MEMORY_RECONCILE_CAPABILITY, {
      kind: 'reconcile', vaultId: args.vaultId, manifestHash: args.manifestHash,
    }, args.maxAttempts)
    if (result.created) await advanceClientSnapshotRevision(ctx, args.installationId)
    return result
  },
})

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

async function assertWritersEnabled(ctx: MutationCtx, installationId: string): Promise<void> {
  const installation = await ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', installationId)).unique()
  if (installation === null) throw new Error('installation not found')
  if (installation.compatibilityMode === 'rollback') throw new Error('canonical writers are disabled in rollback mode')
}

export const upsertSourceRef = mutation({
  args: {
    installationId: v.string(),
    sourceRefId: v.string(),
    idempotencyKey: v.string(),
    kind: sourceKind,
    displayName: v.string(),
    sourceUrl: v.optional(v.string()),
    externalId: v.optional(v.string()),
    contentHash: v.optional(v.string()),
    syncState,
    indexState,
    provenanceIds: v.array(v.string()),
    lastSyncedAt: v.optional(v.number()),
    expectedRevision: v.optional(v.number()),
  },
  returns: projectionUpsertResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.sourceRefId, 'sourceRefId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.displayName, 'displayName', 1_024)
    assertSourceUrl(args.sourceUrl)
    assertOptionalId(args.externalId, 'externalId')
    if (args.contentHash !== undefined)
      assertBoundedString(args.contentHash, 'contentHash', 256)
    assertProvenanceIds(args.provenanceIds)
    if (args.lastSyncedAt !== undefined)
      assertTimestamp(args.lastSyncedAt, 'lastSyncedAt')
    if (args.expectedRevision !== undefined)
      assertExpectedRevision(args.expectedRevision)
    await assertInstallation(ctx, args.installationId)
    await assertWritersEnabled(ctx, args.installationId)
    const byId = await ctx.db
      .query('sourceRefs')
      .withIndex('by_installation_source', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('sourceRefId', args.sourceRefId),
      )
      .unique()
    const byIdempotency = await ctx.db
      .query('sourceRefs')
      .withIndex('by_installation_idempotency', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    const existing = byId ?? byIdempotency
    const { expectedRevision: _expectedRevision, ...projection } = args
    if (existing === null) {
      if (args.expectedRevision !== undefined)
        return { ok: false as const, reason: 'not_found' as const }
      const now = Date.now()
      await ctx.db.insert('sourceRefs', {
        ...projection,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      })
      await advanceClientSnapshotRevision(ctx, args.installationId)
      return { ok: true as const, created: true, revision: 0 }
    }
    if (
      existing.sourceRefId !== args.sourceRefId ||
      existing.idempotencyKey !== args.idempotencyKey
    ) throw new Error('source ref id or idempotency key conflicts')
    if (existing.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    const currentProjection = {
      installationId: existing.installationId,
      sourceRefId: existing.sourceRefId,
      idempotencyKey: existing.idempotencyKey,
      kind: existing.kind,
      displayName: existing.displayName,
      sourceUrl: existing.sourceUrl,
      externalId: existing.externalId,
      contentHash: existing.contentHash,
      syncState: existing.syncState,
      indexState: existing.indexState,
      provenanceIds: existing.provenanceIds,
      lastSyncedAt: existing.lastSyncedAt,
    }
    if (valuesEqual(currentProjection, projection)) {
      return { ok: true as const, created: false, revision: existing.revision }
    }
    if (
      args.expectedRevision === undefined ||
      existing.revision !== args.expectedRevision
    ) return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(existing._id, {
      ...projection,
      revision: existing.revision + 1,
      updatedAt: Date.now(),
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return {
      ok: true as const,
      created: false,
      revision: existing.revision + 1,
    }
  },
})

export const upsertRelation = mutation({
  args: { installationId: v.string(), relationId: v.string(), fromId: v.string(), toId: v.string(), kind: v.string(), changeId: v.string(), confidence: v.number(), expectedRevision: v.optional(v.number()) },
  returns: projectionUpsertResult,
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    for (const [name, value] of Object.entries({ installationId: args.installationId, relationId: args.relationId, fromId: args.fromId, toId: args.toId, changeId: args.changeId })) assertId(value, name)
    if (!Number.isFinite(args.confidence) || args.confidence < 0 || args.confidence > 1) throw new Error('confidence must be between 0 and 1')
    const activeCorrections = (await ctx.db.query('memoryCorrections').withIndex('by_installation_correction', (q) => q.eq('installationId', args.installationId)).collect())
      .filter((correction) => correction.targetKind === 'relation' && correction.targetId === args.relationId && correction.state === 'applied' && correction.action !== 'restore')
    if (activeCorrections.length > 0) return { ok: false as const, reason: 'invalid_state' as const }
    const existing = await ctx.db.query('knowledgeRelations').withIndex('by_installation_relation', (q) => q.eq('installationId', args.installationId).eq('relationId', args.relationId)).unique()
    const now = Date.now()
    if (existing === null) {
      if (args.expectedRevision !== undefined) return { ok: false as const, reason: 'not_found' as const }
      await ctx.db.insert('knowledgeRelations', { installationId: args.installationId, relationId: args.relationId, fromId: args.fromId, toId: args.toId, kind: args.kind, changeId: args.changeId, confidence: args.confidence, revision: 0, createdAt: now, updatedAt: now })
      await advanceClientSnapshotRevision(ctx, args.installationId)
      return { ok: true as const, created: true, revision: 0 }
    }
    const same = existing.fromId === args.fromId && existing.toId === args.toId && existing.kind === args.kind && existing.changeId === args.changeId && existing.confidence === args.confidence && existing.deletedAt === undefined
    if (same) return { ok: true as const, created: false, revision: existing.revision }
    if (args.expectedRevision === undefined || existing.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(existing._id, { fromId: args.fromId, toId: args.toId, kind: args.kind, changeId: args.changeId, confidence: args.confidence, deletedAt: undefined, revision: existing.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, created: false, revision: existing.revision + 1 }
  },
})

export const upsertProvenance = mutation({
  args: { installationId: v.string(), provenanceLinkId: v.string(), targetKind: v.string(), targetId: v.string(), sourceRefId: v.string(), sourceVersion: v.string(), citation: v.string() },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    const existing = await ctx.db.query('provenanceLinks').withIndex('by_installation_provenance', (q) => q.eq('installationId', args.installationId).eq('provenanceLinkId', args.provenanceLinkId)).unique()
    if (existing !== null) {
      const same = existing.targetKind === args.targetKind && existing.targetId === args.targetId && existing.sourceRefId === args.sourceRefId && existing.sourceVersion === args.sourceVersion && existing.citation === args.citation
      if (!same) throw new Error('provenanceLinkId conflicts')
      return { created: false }
    }
    await ctx.db.insert('provenanceLinks', { ...args, createdAt: Date.now() })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true }
  },
})

export const advanceProjectionCursor = mutation({
  args: { installationId: v.string(), cursorId: v.string(), vaultId: v.string(), cursor: v.number(), documentHash: v.optional(v.string()), mode: v.string(), expectedRevision: v.optional(v.number()) },
  returns: projectionUpsertResult,
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    assertExpectedRevision(args.cursor)
    const existing = await ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', args.cursorId)).unique()
    const now = Date.now()
    if (existing === null) {
      if (args.expectedRevision !== undefined) return { ok: false as const, reason: 'not_found' as const }
      await ctx.db.insert('projectionCursors', { installationId: args.installationId, cursorId: args.cursorId, vaultId: args.vaultId, cursor: args.cursor, documentHash: args.documentHash, mode: args.mode, revision: 0, createdAt: now, updatedAt: now })
      await advanceClientSnapshotRevision(ctx, args.installationId)
      return { ok: true as const, created: true, revision: 0 }
    }
    if (existing.vaultId === args.vaultId && existing.cursor === args.cursor && existing.documentHash === args.documentHash && existing.mode === args.mode) {
      return { ok: true as const, created: false, revision: existing.revision }
    }
    if (args.expectedRevision === undefined || existing.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (args.cursor < existing.cursor) return { ok: false as const, reason: 'invalid_state' as const }
    await ctx.db.patch(existing._id, { cursor: args.cursor, documentHash: args.documentHash, mode: args.mode, revision: existing.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, created: false, revision: existing.revision + 1 }
  },
})

export const createCorrection = mutation({
  args: { installationId: v.string(), correctionId: v.string(), targetKind: v.string(), targetId: v.string(), action: v.union(v.literal('retract'), v.literal('replace'), v.literal('restore')), replacement: v.optional(v.string()), reason: v.string(), actor: v.string(), origin: v.string(), expectedRevision: v.number() },
  returns: v.object({ created: v.boolean(), correction: memoryCorrectionValue, command: commandValue, job: jobValue }),
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    const existing = await ctx.db.query('memoryCorrections').withIndex('by_installation_correction', (q) => q.eq('installationId', args.installationId).eq('correctionId', args.correctionId)).unique()
    if (existing !== null) {
      const same = existing.targetKind === args.targetKind && existing.targetId === args.targetId && existing.action === args.action && existing.replacement === args.replacement && existing.reason === args.reason && existing.actor === args.actor && existing.origin === args.origin && existing.expectedRevision === args.expectedRevision
      if (!same) throw new Error('correctionId conflicts with an existing correction')
      const work = await enqueueMemoryJob(ctx, args.installationId, JOB_KINDS.memoryCorrectionApply, MEMORY_CORRECTION_CAPABILITY, {
        kind: 'correction', correctionId: args.correctionId,
      }, 3)
      if (work.created) await advanceClientSnapshotRevision(ctx, args.installationId)
      return { created: false, correction: withoutSystemFields(existing), command: work.command, job: work.job }
    }
    if (args.action === 'replace' && args.replacement === undefined) throw new Error('replacement is required for replace')
    const now = Date.now(); const correction = { ...args, state: 'pending' as const, createdAt: now, updatedAt: now }
    await ctx.db.insert('memoryCorrections', correction)
    const work = await enqueueMemoryJob(ctx, args.installationId, JOB_KINDS.memoryCorrectionApply, MEMORY_CORRECTION_CAPABILITY, {
      kind: 'correction', correctionId: args.correctionId,
    }, 3)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, correction, command: work.command, job: work.job }
  },
})

async function transitionCorrection(ctx: MutationCtx, installationId: string, correctionId: string, state: 'applied' | 'restored' | 'conflict', appliedRevision?: number, conflict?: string): Promise<{ ok: true; revision: number } | { ok: false; reason: 'not_found' | 'invalid_state' }> {
  const correction = await ctx.db.query('memoryCorrections').withIndex('by_installation_correction', (q) => q.eq('installationId', installationId).eq('correctionId', correctionId)).unique()
  if (correction === null) return { ok: false, reason: 'not_found' }
  if (correction.state === state && correction.appliedRevision === appliedRevision && correction.conflict === conflict) return { ok: true, revision: appliedRevision ?? correction.expectedRevision }
  if (state === 'restored' && correction.state !== 'applied') return { ok: false, reason: 'invalid_state' }
  if (state !== 'restored' && correction.state !== 'pending') return { ok: false, reason: 'invalid_state' }
  await ctx.db.patch(correction._id, { state, appliedRevision, conflict, updatedAt: Date.now() })
  await advanceClientSnapshotRevision(ctx, installationId)
  return { ok: true, revision: appliedRevision ?? correction.expectedRevision }
}

export const applyCorrection = mutation({ args: { installationId: v.string(), correctionId: v.string(), appliedRevision: v.number() }, returns: transitionResult, handler: async (ctx, args) => transitionCorrection(ctx, args.installationId, args.correctionId, 'applied', args.appliedRevision) })
export const restoreCorrection = mutation({ args: { installationId: v.string(), correctionId: v.string(), appliedRevision: v.number() }, returns: transitionResult, handler: async (ctx, args) => transitionCorrection(ctx, args.installationId, args.correctionId, 'restored', args.appliedRevision) })
export const conflictCorrection = mutation({ args: { installationId: v.string(), correctionId: v.string(), conflict: v.string() }, returns: transitionResult, handler: async (ctx, args) => transitionCorrection(ctx, args.installationId, args.correctionId, 'conflict', undefined, args.conflict) })

export const getCorrection = query({
  args: { installationId: v.string(), correctionId: v.string() },
  returns: v.union(v.null(), memoryCorrectionValue),
  handler: async (ctx, args) => {
    const correction = await ctx.db.query('memoryCorrections').withIndex('by_installation_correction', (q) => q.eq('installationId', args.installationId).eq('correctionId', args.correctionId)).unique()
    return correction === null ? null : withoutSystemFields(correction)
  },
})

export const tombstoneReconciliationRelation = mutation({
  args: { installationId: v.string(), relationId: v.string(), expectedRevision: v.number() }, returns: transitionResult,
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    const relation = await ctx.db.query('knowledgeRelations').withIndex('by_installation_relation', (q) => q.eq('installationId', args.installationId).eq('relationId', args.relationId)).unique()
    if (relation === null) return { ok: false as const, reason: 'not_found' as const }
    if (relation.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (relation.deletedAt !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now(); await ctx.db.patch(relation._id, { deletedAt: now, revision: relation.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: relation.revision + 1 }
  },
})

export const backfillLegacyProjections = mutation({
  args: { installationId: v.string(), phase: v.union(v.literal('source'), v.literal('knowledge')), cursor: v.union(v.null(), v.string()), numItems: v.number() },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), scanned: v.number(), provenanceCreated: v.number() }),
  handler: async (ctx, args) => {
    assertPositiveInteger(args.numItems, 'numItems', 100)
    const batchId = `d41-backfill:${args.phase}:${canonicalContentHash(JSON.stringify({ cursor: args.cursor }))}`
    const replay = await ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', batchId)).unique()
    if (replay !== null) return { continueCursor: replay.pageCursor ?? '', isDone: replay.mode === 'verified', scanned: replay.scanned ?? 0, provenanceCreated: 0 }
    const page = args.phase === 'source'
      ? await ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId)).paginate({ cursor: args.cursor, numItems: args.numItems })
      : await ctx.db.query('knowledgeDocuments').withIndex('by_installation_knowledge', (q) => q.eq('installationId', args.installationId)).paginate({ cursor: args.cursor, numItems: args.numItems })
    let provenanceCreated = 0
    for (const projection of page.page) {
      const targetId = 'sourceRefId' in projection ? projection.sourceRefId : projection.knowledgeDocumentId
      for (const provenanceId of projection.provenanceIds) {
        const provenanceLinkId = `legacy-provenance:${args.phase}:${targetId}:${provenanceId}`
        const existing = await ctx.db.query('provenanceLinks').withIndex('by_installation_provenance', (q) => q.eq('installationId', args.installationId).eq('provenanceLinkId', provenanceLinkId)).unique()
        if (existing !== null) continue
        await ctx.db.insert('provenanceLinks', { installationId: args.installationId, provenanceLinkId, targetKind: args.phase, targetId, sourceRefId: args.phase === 'source' ? targetId : provenanceId, sourceVersion: 'd41', citation: provenanceId, createdAt: projection.createdAt })
        provenanceCreated += 1
      }
    }
    const cursorId = `d41-backfill:${args.phase}`
    const existingCursor = await ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', cursorId)).unique()
    const now = Date.now()
    const manifestHash = canonicalContentHash(JSON.stringify(page.page.map((projection) => 'sourceRefId' in projection ? { id: projection.sourceRefId, revision: projection.revision, deletedAt: projection.deletedAt, provenanceIds: projection.provenanceIds } : { id: projection.knowledgeDocumentId, revision: projection.revision, deletedAt: projection.deletedAt, provenanceIds: projection.provenanceIds })))
    const progressHash = canonicalContentHash(JSON.stringify({ prior: existingCursor?.documentHash ?? null, batch: manifestHash }))
    await ctx.db.insert('projectionCursors', { installationId: args.installationId, cursorId: batchId, vaultId: 'legacy:d41', cursor: page.page.length, pageCursor: page.continueCursor, scanned: page.page.length, createdCount: provenanceCreated, manifestHash, mode: page.isDone ? 'verified' : 'backfill', revision: 0, createdAt: now, updatedAt: now })
    if (existingCursor === null) await ctx.db.insert('projectionCursors', { installationId: args.installationId, cursorId, vaultId: 'legacy:d41', cursor: page.page.length, documentHash: progressHash, mode: page.isDone ? 'verified' : 'backfill', revision: 0, createdAt: now, updatedAt: now })
    else await ctx.db.patch(existingCursor._id, { cursor: existingCursor.cursor + page.page.length, documentHash: progressHash, mode: page.isDone ? 'verified' : 'backfill', revision: existingCursor.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { continueCursor: page.continueCursor, isDone: page.isDone, scanned: page.page.length, provenanceCreated }
  },
})

export const verifyProjectionBackfill = query({
  args: { installationId: v.string() },
  returns: v.object({ sources: v.number(), knowledge: v.number(), provenanceLinks: v.number(), sourceCursorVerified: v.boolean(), knowledgeCursorVerified: v.boolean() }),
  handler: async (ctx, args) => {
    const [sources, knowledge, links, sourceCursor, knowledgeCursor] = await Promise.all([
      ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId)).collect(),
      ctx.db.query('knowledgeDocuments').withIndex('by_installation_knowledge', (q) => q.eq('installationId', args.installationId)).collect(),
      ctx.db.query('provenanceLinks').withIndex('by_installation_provenance', (q) => q.eq('installationId', args.installationId)).collect(),
      ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', 'd41-backfill:source')).unique(),
      ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', 'd41-backfill:knowledge')).unique(),
    ])
    return {
      sources: sources.length,
      knowledge: knowledge.length,
      provenanceLinks: links.length,
      sourceCursorVerified: sourceCursor?.mode === 'verified' && sourceCursor.cursor === sources.length && sourceCursor.documentHash !== undefined,
      knowledgeCursorVerified: knowledgeCursor?.mode === 'verified' && knowledgeCursor.cursor === knowledge.length && knowledgeCursor.documentHash !== undefined,
    }
  },
})

export const upsertSourceExcerpt = mutation({
  args: {
    installationId: v.string(), excerptId: v.string(), sourceRefId: v.string(), text: v.string(),
    startOffset: v.number(), endOffset: v.number(), speaker: v.optional(v.string()),
    startAtMs: v.optional(v.number()), endAtMs: v.optional(v.number()),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    assertBoundedString(args.text, 'text', 8_192)
    if (!Number.isSafeInteger(args.startOffset) || !Number.isSafeInteger(args.endOffset) || args.startOffset < 0 || args.endOffset < args.startOffset) throw new Error('invalid excerpt offsets')
    const source = await ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId).eq('sourceRefId', args.sourceRefId)).unique()
    if (source === null || source.deletedAt !== undefined) throw new Error('source not found')
    const existing = await ctx.db.query('sourceTranscriptExcerpts').withIndex('by_installation_excerpt', (q) => q.eq('installationId', args.installationId).eq('excerptId', args.excerptId)).unique()
    if (existing !== null) {
      if (!valuesEqual(withoutSystemFields(existing), { ...args, createdAt: existing.createdAt })) throw new Error('excerptId conflicts with existing excerpt')
      return { created: false }
    }
    await ctx.db.insert('sourceTranscriptExcerpts', { ...args, createdAt: Date.now() })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true }
  },
})

export const upsertSourceExtraction = mutation({
  args: {
    installationId: v.string(), extractionId: v.string(), sourceRefId: v.string(), kind: v.string(),
    label: v.string(), value: v.string(), confidence: v.optional(v.number()), provenanceIds: v.array(v.string()),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    assertId(args.extractionId, 'extractionId')
    assertId(args.sourceRefId, 'sourceRefId')
    assertShortText(args.kind, 'kind')
    assertShortText(args.label, 'label')
    assertBoundedString(args.value, 'value', 8_192)
    assertStringList(args.provenanceIds, 'provenanceIds', 128)
    if (args.confidence !== undefined && (!Number.isFinite(args.confidence) || args.confidence < 0 || args.confidence > 1)) throw new Error('confidence must be between zero and one')
    const source = await ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId).eq('sourceRefId', args.sourceRefId)).unique()
    if (source === null || source.deletedAt !== undefined) throw new Error('source not found')
    const existing = await ctx.db.query('sourceExtractions').withIndex('by_installation_extraction', (q) => q.eq('installationId', args.installationId).eq('extractionId', args.extractionId)).unique()
    if (existing !== null) {
      if (!valuesEqual(withoutSystemFields(existing), { ...args, createdAt: existing.createdAt })) throw new Error('extractionId conflicts with existing extraction')
      return { created: false }
    }
    await ctx.db.insert('sourceExtractions', { ...args, createdAt: Date.now() })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true }
  },
})

export const recordReversibleChange = mutation({
  args: {
    installationId: v.string(), changeId: v.string(), targetKind: v.string(), targetId: v.string(),
    action: v.string(), summary: v.string(), origin: v.string(), sourceRefIds: v.array(v.string()),
    provenanceIds: v.array(v.string()), beforeRevision: v.optional(v.number()), afterRevision: v.number(),
    reversible: v.boolean(), revertPayload: v.optional(v.string()),
  },
  returns: v.object({ created: v.boolean(), change: reversibleChangePublicValue }),
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    assertId(args.changeId, 'changeId')
    assertShortText(args.targetKind, 'targetKind')
    assertId(args.targetId, 'targetId')
    assertShortText(args.action, 'action')
    assertBoundedString(args.summary, 'summary', 2_048)
    assertShortText(args.origin, 'origin')
    assertStringList(args.sourceRefIds, 'sourceRefIds', 128)
    assertStringList(args.provenanceIds, 'provenanceIds', 128)
    if (args.beforeRevision !== undefined) assertExpectedRevision(args.beforeRevision)
    assertExpectedRevision(args.afterRevision)
    if (args.reversible && args.revertPayload === undefined) throw new Error('reversible changes require a revertPayload')
    if (!args.reversible && args.revertPayload !== undefined) throw new Error('non-reversible changes cannot include a revertPayload')
    if (args.revertPayload !== undefined) assertBoundedString(args.revertPayload, 'revertPayload', 16_384)
    const existing = await ctx.db.query('reversibleChanges').withIndex('by_installation_change', (q) => q.eq('installationId', args.installationId).eq('changeId', args.changeId)).unique()
    if (existing !== null) {
      const expected = { ...args, primarySourceRefId: args.sourceRefIds[0], createdAt: existing.createdAt }
      if (!valuesEqual(withoutSystemFields(existing), expected)) throw new Error('changeId conflicts with existing change')
      return { created: false, change: publicChange(existing) as any }
    }
    const change = { ...args, primarySourceRefId: args.sourceRefIds[0], createdAt: Date.now() }
    await ctx.db.insert('reversibleChanges', change)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, change: publicChange(change) as any }
  },
})

export const upsertMemoryFact = mutation({
  args: {
    installationId: v.string(), factId: v.string(), entityId: v.string(), predicate: v.string(), value: v.string(),
    confidence: v.number(), sourceRefIds: v.array(v.string()), provenanceIds: v.array(v.string()),
    expectedRevision: v.optional(v.number()),
  },
  returns: projectionUpsertResult,
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    if (!Number.isFinite(args.confidence) || args.confidence < 0 || args.confidence > 1) throw new Error('confidence must be between zero and one')
    assertStringList(args.sourceRefIds, 'sourceRefIds', 128)
    assertStringList(args.provenanceIds, 'provenanceIds', 128)
    const existing = await ctx.db.query('memoryFacts').withIndex('by_installation_fact', (q) => q.eq('installationId', args.installationId).eq('factId', args.factId)).unique()
    const now = Date.now()
    const { expectedRevision: _expectedRevision, ...value } = args
    if (existing === null) {
      if (args.expectedRevision !== undefined) return { ok: false as const, reason: 'not_found' as const }
      await ctx.db.insert('memoryFacts', { ...value, revision: 0, createdAt: now, updatedAt: now })
      await advanceClientSnapshotRevision(ctx, args.installationId)
      return { ok: true as const, created: true, revision: 0 }
    }
    const same = existing.entityId === args.entityId && existing.predicate === args.predicate && existing.value === args.value && existing.confidence === args.confidence && valuesEqual(existing.sourceRefIds, args.sourceRefIds) && valuesEqual(existing.provenanceIds, args.provenanceIds) && existing.deletedAt === undefined
    if (same) return { ok: true as const, created: false, revision: existing.revision }
    if (args.expectedRevision === undefined || existing.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(existing._id, { ...value, deletedAt: undefined, revision: existing.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, created: false, revision: existing.revision + 1 }
  },
})

export const getSourceDetail = query({
  args: { installationId: v.string(), sourceRefId: v.string(), excerpts: v.number(), extractions: v.number(), derivedChanges: v.number() },
  returns: v.union(v.null(), v.object({
    source: sourceRefValue, transcriptPreview: v.optional(v.string()), transcriptTruncated: v.boolean(),
    excerpts: v.array(transcriptExcerptPublicValue), excerptsTruncated: v.boolean(),
    extractions: v.array(sourceExtractionPublicValue), extractionsTruncated: v.boolean(),
    derivedChanges: v.array(reversibleChangePublicValue), derivedChangesTruncated: v.boolean(),
  })),
  handler: async (ctx, args) => {
    for (const [name, limit] of Object.entries({ excerpts: args.excerpts, extractions: args.extractions, derivedChanges: args.derivedChanges })) assertPositiveInteger(limit, name, MAX_PAGE_SIZE)
    const source = await ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId).eq('sourceRefId', args.sourceRefId)).unique()
    if (source === null) return null
    const [excerptRows, extractionRows, changeRows] = await Promise.all([
      ctx.db.query('sourceTranscriptExcerpts').withIndex('by_installation_source_offset', (q) => q.eq('installationId', args.installationId).eq('sourceRefId', args.sourceRefId)).take(args.excerpts + 1),
      ctx.db.query('sourceExtractions').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId).eq('sourceRefId', args.sourceRefId)).take(args.extractions + 1),
      ctx.db.query('reversibleChanges').withIndex('by_installation_source_created', (q) => q.eq('installationId', args.installationId).eq('primarySourceRefId', args.sourceRefId)).order('desc').take(args.derivedChanges + 1),
    ])
    const excerpts = excerptRows.slice(0, args.excerpts)
    const transcriptPreview = excerpts.map((item) => item.text).join('\n').slice(0, 8_192) || undefined
    return {
      source: withoutSystemFields(source), transcriptPreview,
      transcriptTruncated: excerptRows.length > args.excerpts || excerpts.reduce((total, item) => total + item.text.length, 0) > 8_192,
      excerpts: excerpts.map(publicExcerpt) as any, excerptsTruncated: excerptRows.length > args.excerpts,
      extractions: extractionRows.slice(0, args.extractions).map(publicExtraction) as any, extractionsTruncated: extractionRows.length > args.extractions,
      derivedChanges: changeRows.slice(0, args.derivedChanges).map(publicChange) as any, derivedChangesTruncated: changeRows.length > args.derivedChanges,
    }
  },
})

export const listDerivedChanges = query({
  args: { installationId: v.string(), sourceRefId: v.string(), limit: v.number() },
  returns: v.array(reversibleChangePublicValue),
  handler: async (ctx, args) => {
    assertPositiveInteger(args.limit, 'limit', MAX_PAGE_SIZE)
    return (await ctx.db.query('reversibleChanges').withIndex('by_installation_source_created', (q) => q.eq('installationId', args.installationId).eq('primarySourceRefId', args.sourceRefId)).order('desc').take(args.limit)).map(publicChange) as any
  },
})

export const getMemoryEntity = query({
  args: { installationId: v.string(), entityId: v.string(), limit: v.number() },
  returns: v.union(v.null(), v.object({
    entityId: v.string(), facts: v.array(memoryFactPublicValue), relations: v.array(memoryRelationPublicValue),
    provenance: v.array(memoryProvenancePublicValue), corrections: v.array(memoryCorrectionPublicValue),
    conflicts: v.array(memoryCorrectionPublicValue),
  })),
  handler: async (ctx, args) => {
    assertPositiveInteger(args.limit, 'limit', MAX_PAGE_SIZE)
    const [document, facts, fromRelations, toRelations] = await Promise.all([
      ctx.db.query('knowledgeDocuments').withIndex('by_installation_knowledge', (q) => q.eq('installationId', args.installationId).eq('knowledgeDocumentId', args.entityId)).unique(),
      ctx.db.query('memoryFacts').withIndex('by_installation_entity', (q) => q.eq('installationId', args.installationId).eq('entityId', args.entityId)).order('desc').take(args.limit),
      ctx.db.query('knowledgeRelations').withIndex('by_installation_from', (q) => q.eq('installationId', args.installationId).eq('fromId', args.entityId)).order('desc').take(args.limit),
      ctx.db.query('knowledgeRelations').withIndex('by_installation_to', (q) => q.eq('installationId', args.installationId).eq('toId', args.entityId)).order('desc').take(args.limit),
    ])
    const relations = [...new Map([...fromRelations, ...toRelations].map((item) => [item.relationId, item])).values()].slice(0, args.limit)
    const targetPairs = [
      { kind: 'entity', id: args.entityId },
      ...facts.map((item) => ({ kind: 'fact', id: item.factId })),
      ...relations.map((item) => ({ kind: 'relation', id: item.relationId })),
    ]
    const [provenanceByTargetRows, correctionsByTargetRows] = await Promise.all([
      Promise.all(targetPairs.map((target) => ctx.db.query('provenanceLinks').withIndex('by_installation_target', (q) =>
        q.eq('installationId', args.installationId).eq('targetKind', target.kind).eq('targetId', target.id),
      ).take(args.limit))),
      Promise.all(targetPairs.map((target) => ctx.db.query('memoryCorrections').withIndex('by_installation_target', (q) =>
        q.eq('installationId', args.installationId).eq('targetKind', target.kind).eq('targetId', target.id),
      ).take(args.limit))),
    ])
    const provenance = [...new Map(provenanceByTargetRows.flat().map((item) => [item.provenanceLinkId, item])).values()].slice(0, args.limit)
    const corrections = [...new Map(correctionsByTargetRows.flat().map((item) => [item.correctionId, item])).values()].slice(0, args.limit)
    if (document === null && facts.length === 0 && relations.length === 0 && provenance.length === 0 && corrections.length === 0) return null
    const provenanceByTarget = new Map<string, string[]>()
    for (const item of provenance) provenanceByTarget.set(item.targetId, [...(provenanceByTarget.get(item.targetId) ?? []), item.provenanceLinkId])
    return {
      entityId: args.entityId,
      facts: facts.map((item) => { const value = withoutSystemFields(item) as any; delete value.installationId; return value }),
      relations: relations.map((item) => ({
        relationId: item.relationId, fromEntityId: item.fromId, toEntityId: item.toId,
        relationType: item.kind, confidence: item.confidence,
        provenanceIds: provenanceByTarget.get(item.relationId) ?? [], revision: item.revision,
        createdAt: item.createdAt, updatedAt: item.updatedAt, deletedAt: item.deletedAt,
      })),
      provenance: provenance.map((item) => ({
        provenanceLinkId: item.provenanceLinkId, targetKind: item.targetKind, targetId: item.targetId,
        sourceRefId: item.sourceRefId, excerpt: item.citation || undefined, locator: item.sourceVersion || undefined,
        createdAt: item.createdAt, deletedAt: item.deletedAt,
      })),
      corrections: corrections.filter((item) => item.state !== 'conflict').map((item) => { const value = withoutSystemFields(item) as any; delete value.installationId; return value }),
      conflicts: corrections.filter((item) => item.state === 'conflict').map((item) => { const value = withoutSystemFields(item) as any; delete value.installationId; return value }),
    }
  },
})

export const getTaskProvenance = query({
  args: { installationId: v.string(), taskId: v.string(), limit: v.number() },
  returns: v.union(v.null(), v.object({
    task: taskValue, origin: v.string(), sources: v.array(sourceRefValue),
    provenance: v.array(memoryProvenancePublicValue), changes: v.array(reversibleChangePublicValue),
  })),
  handler: async (ctx, args) => {
    assertPositiveInteger(args.limit, 'limit', MAX_PAGE_SIZE)
    const task = await ctx.db.query('tasks').withIndex('by_installation_task', (q) => q.eq('installationId', args.installationId).eq('taskId', args.taskId)).unique()
    if (task === null) return null
    const [changes, provenance] = await Promise.all([
      ctx.db.query('reversibleChanges').withIndex('by_installation_target_created', (q) => q.eq('installationId', args.installationId).eq('targetKind', 'task').eq('targetId', args.taskId)).order('desc').take(args.limit),
      ctx.db.query('provenanceLinks').withIndex('by_installation_target', (q) => q.eq('installationId', args.installationId).eq('targetKind', 'task').eq('targetId', args.taskId)).take(args.limit),
    ])
    const sourceIds = [...new Set([...changes.flatMap((item) => item.sourceRefIds), ...provenance.map((item) => item.sourceRefId)])]
    const sources = (await Promise.all(sourceIds.slice(0, args.limit).map((sourceRefId) => ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId).eq('sourceRefId', sourceRefId)).unique()))).filter((item) => item !== null)
    return {
      task: withoutSystemFields(task), origin: changes[0]?.origin ?? 'owner',
      sources: sources.map(withoutSystemFields), changes: changes.map(publicChange) as any,
      provenance: provenance.map((item) => ({
        provenanceLinkId: item.provenanceLinkId, targetKind: item.targetKind, targetId: item.targetId,
        sourceRefId: item.sourceRefId, excerpt: item.citation || undefined, locator: item.sourceVersion || undefined,
        createdAt: item.createdAt, deletedAt: item.deletedAt,
      })),
    }
  },
})

export const listTaskChanges = query({
  args: { installationId: v.string(), taskId: v.string(), limit: v.number() },
  returns: v.array(reversibleChangePublicValue),
  handler: async (ctx, args) => {
    assertPositiveInteger(args.limit, 'limit', MAX_PAGE_SIZE)
    return (await ctx.db.query('reversibleChanges').withIndex('by_installation_target_created', (q) => q.eq('installationId', args.installationId).eq('targetKind', 'task').eq('targetId', args.taskId)).order('desc').take(args.limit)).map(publicChange) as any
  },
})

export const revertChange = mutation({
  args: { installationId: v.string(), changeId: v.string(), expectedRevision: v.number() },
  returns: v.union(
    v.object({ ok: v.literal(true), change: reversibleChangePublicValue }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal('not_found'), v.literal('stale_revision'), v.literal('invalid_state')) }),
  ),
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    const change = await ctx.db.query('reversibleChanges').withIndex('by_installation_change', (q) => q.eq('installationId', args.installationId).eq('changeId', args.changeId)).unique()
    if (change === null) return { ok: false as const, reason: 'not_found' as const }
    if (change.afterRevision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (!change.reversible || change.revertedAt !== undefined || change.revertPayload === undefined) return { ok: false as const, reason: 'invalid_state' as const }
    if (change.targetKind !== 'task') return { ok: false as const, reason: 'invalid_state' as const }
    const task = await ctx.db.query('tasks').withIndex('by_installation_task', (q) => q.eq('installationId', args.installationId).eq('taskId', change.targetId)).unique()
    if (task === null) return { ok: false as const, reason: 'not_found' as const }
    if (task.revision !== change.afterRevision) return { ok: false as const, reason: 'stale_revision' as const }
    let payload: unknown
    try { payload = JSON.parse(change.revertPayload) } catch { return { ok: false as const, reason: 'invalid_state' as const } }
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return { ok: false as const, reason: 'invalid_state' as const }
    const record = payload as Record<string, unknown>
    const allowed = new Set(['title', 'description', 'tags', 'priority', 'status', 'startAt', 'dueAt', 'projectId', 'entityId'])
    if (Object.keys(record).some((key) => !allowed.has(key))) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now()
    await ctx.db.patch(task._id, { ...record, revision: task.revision + 1, updatedAt: now } as any)
    await ctx.db.patch(change._id, { revertedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, change: publicChange({ ...change, revertedAt: now }) as any }
  },
})

export const getSourceRef = query({
  args: { installationId: v.string(), sourceRefId: v.string(), includeDeleted: v.optional(v.boolean()) },
  returns: v.union(v.null(), sourceRefValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.sourceRefId, 'sourceRefId')
    const source = await ctx.db
      .query('sourceRefs')
      .withIndex('by_installation_source', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('sourceRefId', args.sourceRefId),
      )
      .unique()
    return source === null || (source.deletedAt !== undefined && !args.includeDeleted)
      ? null
      : withoutSystemFields(source)
  },
})

export const listSourceRefs = query({
  args: {
    installationId: v.string(),
    kind: v.optional(sourceKind),
    state: v.optional(syncState),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(sourceRefValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    if (args.kind !== undefined && args.state !== undefined)
      throw new Error('kind and state filters are mutually exclusive')
    const page = args.kind !== undefined
      ? await ctx.db
          .query('sourceRefs')
          .withIndex('by_installation_live_kind', (q) =>
            q
              .eq('installationId', args.installationId)
              .eq('deletedAt', undefined)
              .eq('kind', args.kind!),
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('sourceRefs')
          .withIndex('by_installation_live_sync', (q) => {
            const scoped = q
              .eq('installationId', args.installationId)
              .eq('deletedAt', undefined)
            return args.state === undefined
              ? scoped
              : scoped.eq('syncState', args.state)
          })
          .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const upsertKnowledgeDocument = mutation({
  args: {
    installationId: v.string(),
    knowledgeDocumentId: v.string(),
    idempotencyKey: v.string(),
    kind: knowledgeKind,
    title: v.string(),
    summary: v.string(),
    tags: v.array(v.string()),
    sourceRefIds: v.array(v.string()),
    provenanceIds: v.array(v.string()),
    syncState,
    indexState,
    expectedRevision: v.optional(v.number()),
  },
  returns: projectionUpsertResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.knowledgeDocumentId, 'knowledgeDocumentId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.title, 'title', 1_024)
    assertLongText(args.summary, 'summary')
    assertStringList(args.tags, 'tags')
    assertStringList(args.sourceRefIds, 'sourceRefIds', 128)
    for (const sourceRefId of args.sourceRefIds)
      assertId(sourceRefId, 'sourceRefId')
    assertProvenanceIds(args.provenanceIds)
    if (args.expectedRevision !== undefined)
      assertExpectedRevision(args.expectedRevision)
    await assertInstallation(ctx, args.installationId)
    await assertWritersEnabled(ctx, args.installationId)
    const byId = await ctx.db
      .query('knowledgeDocuments')
      .withIndex('by_installation_knowledge', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('knowledgeDocumentId', args.knowledgeDocumentId),
      )
      .unique()
    const byIdempotency = await ctx.db
      .query('knowledgeDocuments')
      .withIndex('by_installation_idempotency', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    const existing = byId ?? byIdempotency
    const { expectedRevision: _expectedRevision, ...projection } = args
    if (existing === null) {
      if (args.expectedRevision !== undefined)
        return { ok: false as const, reason: 'not_found' as const }
      const now = Date.now()
      await ctx.db.insert('knowledgeDocuments', {
        ...projection,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      })
      await advanceClientSnapshotRevision(ctx, args.installationId)
      return { ok: true as const, created: true, revision: 0 }
    }
    if (
      existing.knowledgeDocumentId !== args.knowledgeDocumentId ||
      existing.idempotencyKey !== args.idempotencyKey
    ) throw new Error('knowledge document id or idempotency key conflicts')
    if (existing.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    const currentProjection = {
      installationId: existing.installationId,
      knowledgeDocumentId: existing.knowledgeDocumentId,
      idempotencyKey: existing.idempotencyKey,
      kind: existing.kind,
      title: existing.title,
      summary: existing.summary,
      tags: existing.tags,
      sourceRefIds: existing.sourceRefIds,
      provenanceIds: existing.provenanceIds,
      syncState: existing.syncState,
      indexState: existing.indexState,
    }
    if (valuesEqual(currentProjection, projection)) {
      return { ok: true as const, created: false, revision: existing.revision }
    }
    if (
      args.expectedRevision === undefined ||
      existing.revision !== args.expectedRevision
    ) return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(existing._id, {
      ...projection,
      revision: existing.revision + 1,
      updatedAt: Date.now(),
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return {
      ok: true as const,
      created: false,
      revision: existing.revision + 1,
    }
  },
})

export const getKnowledgeDocument = query({
  args: { installationId: v.string(), knowledgeDocumentId: v.string(), includeDeleted: v.optional(v.boolean()) },
  returns: v.union(v.null(), knowledgeDocumentValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.knowledgeDocumentId, 'knowledgeDocumentId')
    const document = await ctx.db
      .query('knowledgeDocuments')
      .withIndex('by_installation_knowledge', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('knowledgeDocumentId', args.knowledgeDocumentId),
      )
      .unique()
    return document === null || (document.deletedAt !== undefined && !args.includeDeleted)
      ? null
      : withoutSystemFields(document)
  },
})

export const listKnowledgeDocuments = query({
  args: {
    installationId: v.string(),
    kind: v.optional(knowledgeKind),
    state: v.optional(syncState),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(knowledgeDocumentValue),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertPositiveInteger(
      args.paginationOpts.numItems,
      'paginationOpts.numItems',
      MAX_PAGE_SIZE,
    )
    if (args.kind !== undefined && args.state !== undefined)
      throw new Error('kind and state filters are mutually exclusive')
    const page = args.kind !== undefined
      ? await ctx.db
          .query('knowledgeDocuments')
          .withIndex('by_installation_live_kind', (q) =>
            q
              .eq('installationId', args.installationId)
              .eq('deletedAt', undefined)
              .eq('kind', args.kind!),
          )
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('knowledgeDocuments')
          .withIndex('by_installation_live_sync', (q) => {
            const scoped = q
              .eq('installationId', args.installationId)
              .eq('deletedAt', undefined)
            return args.state === undefined
              ? scoped
              : scoped.eq('syncState', args.state)
          })
          .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const tombstoneProjection = mutation({
  args: {
    installationId: v.string(),
    kind: v.union(v.literal('source'), v.literal('knowledge')),
    projectionId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.projectionId, 'projectionId')
    assertExpectedRevision(args.expectedRevision)
    await assertWritersEnabled(ctx, args.installationId)
    const projection = args.kind === 'source'
      ? await ctx.db
          .query('sourceRefs')
          .withIndex('by_installation_source', (q) =>
            q
              .eq('installationId', args.installationId)
              .eq('sourceRefId', args.projectionId),
          )
          .unique()
      : await ctx.db
          .query('knowledgeDocuments')
          .withIndex('by_installation_knowledge', (q) =>
            q
              .eq('installationId', args.installationId)
              .eq('knowledgeDocumentId', args.projectionId),
          )
          .unique()
    if (projection === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (projection.deletedAt !== undefined)
      return { ok: false as const, reason: 'invalid_state' as const }
    if (projection.revision !== args.expectedRevision)
      return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now()
    await ctx.db.patch(projection._id, {
      deletedAt: now,
      revision: projection.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: projection.revision + 1 }
  },
})

export const migrationManifest = query({
  args: { installationId: v.string() },
  returns: migrationManifestValue,
  handler: async (ctx, args) => computeMigrationManifest(ctx, args.installationId),
})

export const reconcileManifest = mutation({
  args: {
    installationId: v.string(), vaultId: v.string(), cursorId: v.string(), cursor: v.number(),
    expectedCursorRevision: v.optional(v.number()), knowledgeDocumentIds: v.array(v.string()),
    provenanceLinkIds: v.array(v.string()), manifestHash: v.string(),
  },
  returns: v.object({ ok: v.boolean(), tombstonedDocuments: v.number(), tombstonedProvenance: v.number(), reappliedCorrections: v.number(), cursorRevision: v.number() }),
  handler: async (ctx, args) => {
    await assertWritersEnabled(ctx, args.installationId)
    assertStringList(args.knowledgeDocumentIds, 'knowledgeDocumentIds', 10_000)
    assertStringList(args.provenanceLinkIds, 'provenanceLinkIds', 10_000)
    const cursor = await ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', args.cursorId)).unique()
    if (cursor !== null && cursor.cursor === args.cursor && cursor.manifestHash === args.manifestHash && cursor.mode === 'reconciled') return { ok: true, tombstonedDocuments: 0, tombstonedProvenance: 0, reappliedCorrections: 0, cursorRevision: cursor.revision }
    if ((cursor === null) !== (args.expectedCursorRevision === undefined) || (cursor !== null && cursor.revision !== args.expectedCursorRevision)) return { ok: false, tombstonedDocuments: 0, tombstonedProvenance: 0, reappliedCorrections: 0, cursorRevision: cursor?.revision ?? 0 }
    const now = Date.now(); let tombstonedDocuments = 0; let tombstonedProvenance = 0; let reappliedCorrections = 0
    const manifestDocuments = new Set(args.knowledgeDocumentIds)
    const documents = await ctx.db.query('knowledgeDocuments').withIndex('by_installation_knowledge', (q) => q.eq('installationId', args.installationId)).collect()
    for (const document of documents) if (document.deletedAt === undefined && !manifestDocuments.has(document.knowledgeDocumentId)) { await ctx.db.patch(document._id, { deletedAt: now, revision: document.revision + 1, updatedAt: now }); tombstonedDocuments += 1 }
    const manifestProvenance = new Set(args.provenanceLinkIds)
    const provenance = await ctx.db.query('provenanceLinks').withIndex('by_installation_provenance', (q) => q.eq('installationId', args.installationId)).collect()
    for (const link of provenance) if (link.deletedAt === undefined && !manifestProvenance.has(link.provenanceLinkId)) { await ctx.db.patch(link._id, { deletedAt: now }); tombstonedProvenance += 1 }
    const corrections = await ctx.db.query('memoryCorrections').withIndex('by_installation_correction', (q) => q.eq('installationId', args.installationId)).collect()
    for (const correction of corrections) if (correction.state === 'applied' && correction.targetKind === 'relation' && correction.action !== 'restore') {
      const relation = await ctx.db.query('knowledgeRelations').withIndex('by_installation_relation', (q) => q.eq('installationId', args.installationId).eq('relationId', correction.targetId)).unique()
      if (relation !== null && relation.deletedAt === undefined) { await ctx.db.patch(relation._id, { deletedAt: now, revision: relation.revision + 1, updatedAt: now }); reappliedCorrections += 1 }
    }
    if (cursor === null) await ctx.db.insert('projectionCursors', { installationId: args.installationId, cursorId: args.cursorId, vaultId: args.vaultId, cursor: args.cursor, documentHash: args.manifestHash, manifestHash: args.manifestHash, mode: 'reconciled', revision: 0, createdAt: now, updatedAt: now })
    else await ctx.db.patch(cursor._id, { cursor: args.cursor, documentHash: args.manifestHash, manifestHash: args.manifestHash, mode: 'reconciled', revision: cursor.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true, tombstonedDocuments, tombstonedProvenance, reappliedCorrections, cursorRevision: cursor === null ? 0 : cursor.revision + 1 }
  },
})
