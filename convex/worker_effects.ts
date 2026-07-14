import { canonicalContentHash } from '@kriyan/contracts'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { mutation, type MutationCtx } from './_generated/server'
import {
  advanceClientSnapshotRevision,
  assertExpectedRevision,
  assertId,
  assertTipTapJson,
} from './lib'
import { requireActiveLeasedJob } from './worker_fencing'

type Family = 'task' | 'reminder' | 'note' | 'source' | 'knowledge'
type EffectFailure = 'not_found' | 'stale_revision' | 'invalid_state'

const leaseArgs = {
  installationId: v.string(), jobId: v.string(), nodeId: v.string(),
  expectedJobRevision: v.number(), expectedLeaseToken: v.string(), effectId: v.string(),
}
const receiptValue = v.object({
  effectId: v.string(), jobId: v.string(),
  family: v.union(v.literal('task'), v.literal('reminder'), v.literal('note'), v.literal('source'), v.literal('knowledge')),
  action: v.string(), targetId: v.string(), inputHash: v.string(), targetRevision: v.number(),
  created: v.boolean(), createdAt: v.number(),
})
const effectResultValue = v.union(
  v.object({ ok: v.literal(true), duplicate: v.boolean(), receipt: receiptValue, jobRevision: v.number() }),
  v.object({ ok: v.literal(false), reason: v.union(v.literal('not_found'), v.literal('stale_revision'), v.literal('invalid_state')) }),
)

interface EffectArgs {
  installationId: string
  jobId: string
  nodeId: string
  expectedJobRevision: number
  expectedLeaseToken: string
  effectId: string
}

function receiptResult(receipt: Doc<'workerEffectReceipts'>) {
  return {
    effectId: receipt.effectId, jobId: receipt.jobId, family: receipt.family,
    action: receipt.action, targetId: receipt.targetId, inputHash: receipt.inputHash,
    targetRevision: receipt.targetRevision, created: receipt.created, createdAt: receipt.createdAt,
  }
}

async function commitEffect(
  ctx: MutationCtx,
  args: EffectArgs,
  family: Family,
  action: string,
  targetId: string,
  hashInput: unknown,
  apply: () => Promise<{ ok: true; revision: number; created: boolean } | { ok: false; reason: EffectFailure }>,
) {
  for (const [name, value] of Object.entries({ installationId: args.installationId, jobId: args.jobId, nodeId: args.nodeId, effectId: args.effectId, targetId })) assertId(value, name)
  assertExpectedRevision(args.expectedJobRevision)
  const job = await requireActiveLeasedJob(ctx, args)
  const inputHash = canonicalContentHash(JSON.stringify(hashInput))
  const existing = await ctx.db.query('workerEffectReceipts').withIndex('by_installation_effect', (q) =>
    q.eq('installationId', args.installationId).eq('effectId', args.effectId),
  ).unique()
  if (existing !== null) {
    if (existing.jobId !== args.jobId || existing.family !== family || existing.action !== action || existing.targetId !== targetId || existing.inputHash !== inputHash) throw new Error('effectId conflicts with a different effect')
    return { ok: true as const, duplicate: true, receipt: receiptResult(existing), jobRevision: job.revision }
  }
  if (job.revision !== args.expectedJobRevision) return { ok: false as const, reason: 'stale_revision' as const }
  const target = await apply()
  if (!target.ok) return target
  const createdAt = Date.now()
  const receiptId = await ctx.db.insert('workerEffectReceipts', {
    installationId: args.installationId, effectId: args.effectId, jobId: args.jobId,
    family, action, targetId, inputHash, targetRevision: target.revision,
    created: target.created, createdAt,
  })
  await ctx.db.patch(job._id, { effectCheckpoint: args.effectId, revision: job.revision + 1, updatedAt: createdAt })
  await advanceClientSnapshotRevision(ctx, args.installationId)
  const receipt = await ctx.db.get(receiptId)
  if (receipt === null) throw new Error('effect receipt did not persist')
  return { ok: true as const, duplicate: false, receipt: receiptResult(receipt), jobRevision: job.revision + 1 }
}

export const commitTaskEffect = mutation({
  args: {
    ...leaseArgs, action: v.union(v.literal('create'), v.literal('update'), v.literal('complete'), v.literal('tombstone')),
    taskId: v.string(), expectedTargetRevision: v.optional(v.number()), title: v.optional(v.string()),
    description: v.optional(v.string()), dueAt: v.optional(v.number()), idempotencyKey: v.optional(v.string()),
  },
  returns: effectResultValue,
  handler: async (ctx, args) => await commitEffect(ctx, args, 'task', args.action, args.taskId, { family: 'task', ...args, expectedJobRevision: undefined, expectedLeaseToken: undefined }, async () => {
    const existing = await ctx.db.query('tasks').withIndex('by_installation_task', (q) => q.eq('installationId', args.installationId).eq('taskId', args.taskId)).unique()
    if (args.action === 'create') {
      if (existing !== null) return { ok: false as const, reason: 'invalid_state' as const }
      if (args.title === undefined || args.idempotencyKey === undefined) throw new Error('task create requires title and idempotencyKey')
      const now = Date.now(); await ctx.db.insert('tasks', { installationId: args.installationId, taskId: args.taskId, idempotencyKey: args.idempotencyKey, title: args.title, description: args.description, tags: [], status: 'open', dueAt: args.dueAt, revision: 0, createdAt: now, updatedAt: now })
      return { ok: true as const, revision: 0, created: true }
    }
    if (existing === null) return { ok: false as const, reason: 'not_found' as const }
    if (existing.revision !== args.expectedTargetRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (existing.deletedAt !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now(); const revision = existing.revision + 1
    await ctx.db.patch(existing._id, args.action === 'tombstone'
      ? { deletedAt: now, revision, updatedAt: now }
      : { title: args.title ?? existing.title, description: args.description ?? existing.description, dueAt: args.dueAt ?? existing.dueAt, status: args.action === 'complete' ? 'completed' : existing.status, revision, updatedAt: now })
    return { ok: true as const, revision, created: false }
  }),
})

export const commitReminderEffect = mutation({
  args: {
    ...leaseArgs, action: v.union(v.literal('create'), v.literal('update'), v.literal('acknowledge'), v.literal('snooze'), v.literal('tombstone')),
    reminderId: v.string(), expectedTargetRevision: v.optional(v.number()), message: v.optional(v.string()),
    remindAt: v.optional(v.number()), timezone: v.optional(v.string()), idempotencyKey: v.optional(v.string()),
  },
  returns: effectResultValue,
  handler: async (ctx, args) => await commitEffect(ctx, args, 'reminder', args.action, args.reminderId, { family: 'reminder', ...args, expectedJobRevision: undefined, expectedLeaseToken: undefined }, async () => {
    const existing = await ctx.db.query('reminders').withIndex('by_installation_reminder', (q) => q.eq('installationId', args.installationId).eq('reminderId', args.reminderId)).unique()
    if (args.action === 'create') {
      if (existing !== null) return { ok: false as const, reason: 'invalid_state' as const }
      if (args.message === undefined || args.remindAt === undefined || args.timezone === undefined || args.idempotencyKey === undefined) throw new Error('reminder create requires message, remindAt, timezone, and idempotencyKey')
      const now = Date.now(); await ctx.db.insert('reminders', { installationId: args.installationId, reminderId: args.reminderId, idempotencyKey: args.idempotencyKey, message: args.message, remindAt: args.remindAt, timezone: args.timezone, deliveryPolicy: 'normal', status: 'scheduled', scheduleKey: args.idempotencyKey, fireCount: 0, revision: 0, createdAt: now, updatedAt: now })
      return { ok: true as const, revision: 0, created: true }
    }
    if (existing === null) return { ok: false as const, reason: 'not_found' as const }
    if (existing.revision !== args.expectedTargetRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (existing.deletedAt !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now(); const revision = existing.revision + 1
    await ctx.db.patch(existing._id, args.action === 'tombstone'
      ? { deletedAt: now, revision, updatedAt: now }
      : { message: args.message ?? existing.message, remindAt: args.remindAt ?? existing.remindAt, nextFireAt: args.action === 'snooze' ? args.remindAt : existing.nextFireAt, timezone: args.timezone ?? existing.timezone, status: args.action === 'acknowledge' ? 'acknowledged' : existing.status, acknowledgedAt: args.action === 'acknowledge' ? now : existing.acknowledgedAt, revision, updatedAt: now })
    return { ok: true as const, revision, created: false }
  }),
})

export const commitNoteEffect = mutation({
  args: {
    ...leaseArgs, action: v.union(v.literal('create'), v.literal('update'), v.literal('archive')),
    noteId: v.string(), expectedTargetRevision: v.optional(v.number()), title: v.optional(v.string()),
    contentJson: v.optional(v.string()), plainTextPreview: v.optional(v.string()), wordCount: v.optional(v.number()), idempotencyKey: v.optional(v.string()),
  },
  returns: effectResultValue,
  handler: async (ctx, args) => await commitEffect(ctx, args, 'note', args.action, args.noteId, { family: 'note', ...args, expectedJobRevision: undefined, expectedLeaseToken: undefined }, async () => {
    const existing = await ctx.db.query('notes').withIndex('by_installation_note', (q) => q.eq('installationId', args.installationId).eq('noteId', args.noteId)).unique()
    if (args.action === 'create') {
      if (existing !== null) return { ok: false as const, reason: 'invalid_state' as const }
      if (args.contentJson === undefined || args.plainTextPreview === undefined || args.wordCount === undefined || args.idempotencyKey === undefined) throw new Error('note create requires committed content and idempotencyKey')
      assertTipTapJson(args.contentJson); const now = Date.now(); const noteVersionId = `note-version:${args.noteId}:0`; const contentHash = canonicalContentHash(args.contentJson)
      await ctx.db.insert('noteVersions', { installationId: args.installationId, noteVersionId, noteId: args.noteId, version: 0, contentJson: args.contentJson, contentHash, plainTextPreview: args.plainTextPreview, wordCount: args.wordCount, authorOrigin: 'agent', createdAt: now })
      await ctx.db.insert('notes', { installationId: args.installationId, noteId: args.noteId, idempotencyKey: args.idempotencyKey, title: args.title, contentJson: args.contentJson, plainTextPreview: args.plainTextPreview, wordCount: args.wordCount, tags: [], currentVersionId: noteVersionId, contentHash, revision: 0, createdAt: now, updatedAt: now })
      return { ok: true as const, revision: 0, created: true }
    }
    if (existing === null) return { ok: false as const, reason: 'not_found' as const }
    if (existing.revision !== args.expectedTargetRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (existing.deletedAt !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now(); const revision = existing.revision + 1
    if (args.action === 'archive') await ctx.db.patch(existing._id, { deletedAt: now, revision, updatedAt: now })
    else {
      const contentJson = args.contentJson ?? existing.contentJson; assertTipTapJson(contentJson)
      const plainTextPreview = args.plainTextPreview ?? existing.plainTextPreview; const wordCount = args.wordCount ?? existing.wordCount
      const noteVersionId = `note-version:${args.noteId}:${revision}`; const contentHash = canonicalContentHash(contentJson)
      await ctx.db.insert('noteVersions', { installationId: args.installationId, noteVersionId, noteId: args.noteId, version: revision, contentJson, contentHash, plainTextPreview, wordCount, authorOrigin: 'agent', createdAt: now })
      await ctx.db.patch(existing._id, { title: args.title ?? existing.title, contentJson, plainTextPreview, wordCount, currentVersionId: noteVersionId, contentHash, revision, updatedAt: now })
    }
    return { ok: true as const, revision, created: false }
  }),
})

const sourceKinds = ['audio', 'video', 'document', 'web', 'git', 'calendar', 'email', 'chat', 'other'] as const
const knowledgeKinds = ['person', 'project', 'topic', 'organization', 'place', 'event', 'other'] as const

export const commitSourceEffect = mutation({
  args: { ...leaseArgs, action: v.union(v.literal('create'), v.literal('update'), v.literal('tombstone')), sourceRefId: v.string(), expectedTargetRevision: v.optional(v.number()), displayName: v.optional(v.string()), sourceKind: v.optional(v.string()), idempotencyKey: v.optional(v.string()) },
  returns: effectResultValue,
  handler: async (ctx, args) => await commitEffect(ctx, args, 'source', args.action, args.sourceRefId, { family: 'source', ...args, expectedJobRevision: undefined, expectedLeaseToken: undefined }, async () => {
    const existing = await ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q.eq('installationId', args.installationId).eq('sourceRefId', args.sourceRefId)).unique()
    if (args.action === 'create') {
      if (existing !== null) return { ok: false as const, reason: 'invalid_state' as const }
      if (args.displayName === undefined || args.sourceKind === undefined || args.idempotencyKey === undefined || !sourceKinds.includes(args.sourceKind as typeof sourceKinds[number])) throw new Error('source create requires valid kind, displayName, and idempotencyKey')
      const now = Date.now(); await ctx.db.insert('sourceRefs', { installationId: args.installationId, sourceRefId: args.sourceRefId, idempotencyKey: args.idempotencyKey, kind: args.sourceKind as typeof sourceKinds[number], displayName: args.displayName, syncState: 'pending', indexState: 'pending', provenanceIds: [], revision: 0, createdAt: now, updatedAt: now })
      return { ok: true as const, revision: 0, created: true }
    }
    if (existing === null) return { ok: false as const, reason: 'not_found' as const }
    if (existing.revision !== args.expectedTargetRevision) return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now(); const revision = existing.revision + 1; await ctx.db.patch(existing._id, args.action === 'tombstone' ? { deletedAt: now, revision, updatedAt: now } : { displayName: args.displayName ?? existing.displayName, revision, updatedAt: now })
    return { ok: true as const, revision, created: false }
  }),
})

export const commitKnowledgeEffect = mutation({
  args: { ...leaseArgs, action: v.union(v.literal('create'), v.literal('update'), v.literal('tombstone')), knowledgeDocumentId: v.string(), expectedTargetRevision: v.optional(v.number()), title: v.optional(v.string()), summary: v.optional(v.string()), knowledgeKind: v.optional(v.string()), idempotencyKey: v.optional(v.string()) },
  returns: effectResultValue,
  handler: async (ctx, args) => await commitEffect(ctx, args, 'knowledge', args.action, args.knowledgeDocumentId, { family: 'knowledge', ...args, expectedJobRevision: undefined, expectedLeaseToken: undefined }, async () => {
    const existing = await ctx.db.query('knowledgeDocuments').withIndex('by_installation_knowledge', (q) => q.eq('installationId', args.installationId).eq('knowledgeDocumentId', args.knowledgeDocumentId)).unique()
    if (args.action === 'create') {
      if (existing !== null) return { ok: false as const, reason: 'invalid_state' as const }
      if (args.title === undefined || args.summary === undefined || args.knowledgeKind === undefined || args.idempotencyKey === undefined || !knowledgeKinds.includes(args.knowledgeKind as typeof knowledgeKinds[number])) throw new Error('knowledge create requires valid kind, title, summary, and idempotencyKey')
      const now = Date.now(); await ctx.db.insert('knowledgeDocuments', { installationId: args.installationId, knowledgeDocumentId: args.knowledgeDocumentId, idempotencyKey: args.idempotencyKey, kind: args.knowledgeKind as typeof knowledgeKinds[number], title: args.title, summary: args.summary, tags: [], sourceRefIds: [], provenanceIds: [], syncState: 'pending', indexState: 'pending', revision: 0, createdAt: now, updatedAt: now })
      return { ok: true as const, revision: 0, created: true }
    }
    if (existing === null) return { ok: false as const, reason: 'not_found' as const }
    if (existing.revision !== args.expectedTargetRevision) return { ok: false as const, reason: 'stale_revision' as const }
    const now = Date.now(); const revision = existing.revision + 1; await ctx.db.patch(existing._id, args.action === 'tombstone' ? { deletedAt: now, revision, updatedAt: now } : { title: args.title ?? existing.title, summary: args.summary ?? existing.summary, revision, updatedAt: now })
    return { ok: true as const, revision, created: false }
  }),
})
