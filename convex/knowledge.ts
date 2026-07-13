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
import {
  indexState,
  knowledgeDocumentValue,
  knowledgeKind,
  memoryCorrectionValue,
  projectionUpsertResult,
  sourceKind,
  sourceRefValue,
  syncState,
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
      return { ok: true as const, created: true, revision: 0 }
    }
    if (args.expectedRevision === undefined || existing.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    await ctx.db.patch(existing._id, { fromId: args.fromId, toId: args.toId, kind: args.kind, changeId: args.changeId, confidence: args.confidence, deletedAt: undefined, revision: existing.revision + 1, updatedAt: now })
    return { ok: true as const, created: false, revision: existing.revision + 1 }
  },
})

export const upsertProvenance = mutation({
  args: { installationId: v.string(), provenanceLinkId: v.string(), targetKind: v.string(), targetId: v.string(), sourceRefId: v.string(), sourceVersion: v.string(), citation: v.string() },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('provenanceLinks').withIndex('by_installation_provenance', (q) => q.eq('installationId', args.installationId).eq('provenanceLinkId', args.provenanceLinkId)).unique()
    if (existing !== null) {
      const same = existing.targetKind === args.targetKind && existing.targetId === args.targetId && existing.sourceRefId === args.sourceRefId && existing.sourceVersion === args.sourceVersion && existing.citation === args.citation
      if (!same) throw new Error('provenanceLinkId conflicts')
      return { created: false }
    }
    await ctx.db.insert('provenanceLinks', { ...args, createdAt: Date.now() })
    return { created: true }
  },
})

export const advanceProjectionCursor = mutation({
  args: { installationId: v.string(), cursorId: v.string(), vaultId: v.string(), cursor: v.number(), documentHash: v.optional(v.string()), mode: v.string(), expectedRevision: v.optional(v.number()) },
  returns: projectionUpsertResult,
  handler: async (ctx, args) => {
    assertExpectedRevision(args.cursor)
    const existing = await ctx.db.query('projectionCursors').withIndex('by_installation_cursor', (q) => q.eq('installationId', args.installationId).eq('cursorId', args.cursorId)).unique()
    const now = Date.now()
    if (existing === null) {
      if (args.expectedRevision !== undefined) return { ok: false as const, reason: 'not_found' as const }
      await ctx.db.insert('projectionCursors', { installationId: args.installationId, cursorId: args.cursorId, vaultId: args.vaultId, cursor: args.cursor, documentHash: args.documentHash, mode: args.mode, revision: 0, createdAt: now, updatedAt: now })
      return { ok: true as const, created: true, revision: 0 }
    }
    if (args.expectedRevision === undefined || existing.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (args.cursor < existing.cursor) return { ok: false as const, reason: 'invalid_state' as const }
    await ctx.db.patch(existing._id, { cursor: args.cursor, documentHash: args.documentHash, mode: args.mode, revision: existing.revision + 1, updatedAt: now })
    return { ok: true as const, created: false, revision: existing.revision + 1 }
  },
})

export const createCorrection = mutation({
  args: { installationId: v.string(), correctionId: v.string(), targetKind: v.string(), targetId: v.string(), action: v.union(v.literal('retract'), v.literal('replace'), v.literal('restore')), replacement: v.optional(v.string()), reason: v.string(), actor: v.string(), origin: v.string(), expectedRevision: v.number() },
  returns: v.object({ created: v.boolean(), correction: memoryCorrectionValue }),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query('memoryCorrections').withIndex('by_installation_correction', (q) => q.eq('installationId', args.installationId).eq('correctionId', args.correctionId)).unique()
    if (existing !== null) return { created: false, correction: withoutSystemFields(existing) }
    if (args.action === 'replace' && args.replacement === undefined) throw new Error('replacement is required for replace')
    const now = Date.now(); const correction = { ...args, state: 'pending' as const, createdAt: now, updatedAt: now }
    await ctx.db.insert('memoryCorrections', correction)
    return { created: true, correction }
  },
})

async function transitionCorrection(ctx: MutationCtx, installationId: string, correctionId: string, state: 'applied' | 'restored' | 'conflict', appliedRevision?: number, conflict?: string): Promise<{ ok: true; revision: number } | { ok: false; reason: 'not_found' | 'invalid_state' }> {
  const correction = await ctx.db.query('memoryCorrections').withIndex('by_installation_correction', (q) => q.eq('installationId', installationId).eq('correctionId', correctionId)).unique()
  if (correction === null) return { ok: false, reason: 'not_found' }
  if (state === 'restored' && correction.state !== 'applied') return { ok: false, reason: 'invalid_state' }
  if (state !== 'restored' && correction.state !== 'pending') return { ok: false, reason: 'invalid_state' }
  await ctx.db.patch(correction._id, { state, appliedRevision, conflict, updatedAt: Date.now() })
  return { ok: true, revision: appliedRevision ?? correction.expectedRevision }
}

export const applyCorrection = mutation({ args: { installationId: v.string(), correctionId: v.string(), appliedRevision: v.number() }, returns: transitionResult, handler: async (ctx, args) => transitionCorrection(ctx, args.installationId, args.correctionId, 'applied', args.appliedRevision) })
export const restoreCorrection = mutation({ args: { installationId: v.string(), correctionId: v.string(), appliedRevision: v.number() }, returns: transitionResult, handler: async (ctx, args) => transitionCorrection(ctx, args.installationId, args.correctionId, 'restored', args.appliedRevision) })
export const conflictCorrection = mutation({ args: { installationId: v.string(), correctionId: v.string(), conflict: v.string() }, returns: transitionResult, handler: async (ctx, args) => transitionCorrection(ctx, args.installationId, args.correctionId, 'conflict', undefined, args.conflict) })

export const tombstoneReconciliationRelation = mutation({
  args: { installationId: v.string(), relationId: v.string(), expectedRevision: v.number() }, returns: transitionResult,
  handler: async (ctx, args) => {
    const relation = await ctx.db.query('knowledgeRelations').withIndex('by_installation_relation', (q) => q.eq('installationId', args.installationId).eq('relationId', args.relationId)).unique()
    if (relation === null) return { ok: false as const, reason: 'not_found' as const }
    if (relation.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (relation.deletedAt !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now(); await ctx.db.patch(relation._id, { deletedAt: now, revision: relation.revision + 1, updatedAt: now })
    return { ok: true as const, revision: relation.revision + 1 }
  },
})

export const backfillLegacyProjections = mutation({
  args: { installationId: v.string(), phase: v.union(v.literal('source'), v.literal('knowledge')), cursor: v.union(v.null(), v.string()), numItems: v.number() },
  returns: v.object({ continueCursor: v.string(), isDone: v.boolean(), scanned: v.number(), provenanceCreated: v.number() }),
  handler: async (ctx, args) => {
    assertPositiveInteger(args.numItems, 'numItems', 100)
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
    if (existingCursor === null) await ctx.db.insert('projectionCursors', { installationId: args.installationId, cursorId, vaultId: 'legacy:d41', cursor: page.page.length, mode: page.isDone ? 'verified' : 'backfill', revision: 0, createdAt: now, updatedAt: now })
    else await ctx.db.patch(existingCursor._id, { cursor: existingCursor.cursor + page.page.length, mode: page.isDone ? 'verified' : 'backfill', revision: existingCursor.revision + 1, updatedAt: now })
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
    return { sources: sources.length, knowledge: knowledge.length, provenanceLinks: links.length, sourceCursorVerified: sourceCursor?.mode === 'verified', knowledgeCursorVerified: knowledgeCursor?.mode === 'verified' }
  },
})

export const getSourceRef = query({
  args: { installationId: v.string(), sourceRefId: v.string() },
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
    return source === null || source.deletedAt !== undefined
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
    return {
      ok: true as const,
      created: false,
      revision: existing.revision + 1,
    }
  },
})

export const getKnowledgeDocument = query({
  args: { installationId: v.string(), knowledgeDocumentId: v.string() },
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
    return document === null || document.deletedAt !== undefined
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
    return { ok: true as const, revision: projection.revision + 1 }
  },
})
