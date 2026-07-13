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
