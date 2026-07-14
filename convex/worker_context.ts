import { JOB_KINDS } from '@kriyan/contracts'
import { v } from 'convex/values'

import { query } from './_generated/server'
import { assertExpectedRevision, assertId, assertPositiveInteger, withoutSystemFields } from './lib'
import {
  commandValue,
  jobValue,
} from './validators'
import { requireLeaseFencedJob } from './worker_fencing'

const leaseArgs = {
  installationId: v.string(), jobId: v.string(), nodeId: v.string(),
  expectedJobRevision: v.number(), expectedLeaseToken: v.string(),
}

const agentRevisionContextValue = v.object({
  agentRevisionId: v.string(), agentId: v.string(), ordinal: v.number(),
  displayName: v.string(), systemPrompt: v.string(), toolCapabilities: v.array(v.string()),
  createdAt: v.number(),
})
const messageContextValue = v.object({
  messageId: v.string(), threadId: v.string(), turnId: v.string(), turnOrdinal: v.number(),
  role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system'), v.literal('tool')),
  state: v.union(v.literal('queued'), v.literal('active'), v.literal('completed'), v.literal('failed'), v.literal('cancelled'), v.literal('waiting_for_node')),
  content: v.string(), origin: v.string(), agentRevisionId: v.string(),
  createdAt: v.number(), updatedAt: v.number(), finalizedAt: v.optional(v.number()),
})
const effectReceiptValue = v.object({
  effectId: v.string(), jobId: v.string(),
  family: v.union(v.literal('task'), v.literal('reminder'), v.literal('note'), v.literal('source'), v.literal('knowledge')),
  action: v.string(), targetId: v.string(), inputHash: v.string(), targetRevision: v.number(),
  created: v.boolean(), createdAt: v.number(),
})
const noteVersionContextValue = v.object({
  noteVersionId: v.string(), noteId: v.string(), version: v.number(), contentJson: v.string(),
  contentHash: v.string(), plainTextPreview: v.string(), wordCount: v.number(),
  authorOrigin: v.string(), createdAt: v.number(),
})

function validateLeaseArgs(args: typeof leaseArgs extends never ? never : Record<string, unknown>): void {
  assertId(args.installationId as string, 'installationId')
  assertId(args.jobId as string, 'jobId')
  assertId(args.nodeId as string, 'nodeId')
  assertExpectedRevision(args.expectedJobRevision as number)
  assertId(args.expectedLeaseToken as string, 'expectedLeaseToken')
}

function receiptWithoutInstallation(receipt: {
  effectId: string; jobId: string; family: 'task' | 'reminder' | 'note' | 'source' | 'knowledge';
  action: string; targetId: string; inputHash: string; targetRevision: number; created: boolean; createdAt: number;
}) {
  return {
    effectId: receipt.effectId, jobId: receipt.jobId, family: receipt.family, action: receipt.action,
    targetId: receipt.targetId, inputHash: receipt.inputHash, targetRevision: receipt.targetRevision,
    created: receipt.created, createdAt: receipt.createdAt,
  }
}

export const readExecutionContext = query({
  args: { ...leaseArgs, maxMessages: v.number() },
  returns: v.object({
    command: commandValue,
    job: jobValue,
    agentRevision: agentRevisionContextValue,
    thread: v.object({
      threadId: v.string(), agentId: v.string(), preferredNodeId: v.optional(v.string()),
      piSessionRef: v.optional(v.string()), sessionRevision: v.number(),
    }),
    messages: v.array(messageContextValue), messagesTruncated: v.boolean(),
    effectReceipts: v.array(effectReceiptValue),
  }),
  handler: async (ctx, args) => {
    validateLeaseArgs(args); assertPositiveInteger(args.maxMessages, 'maxMessages', 128)
    const job = await requireLeaseFencedJob(ctx, args)
    if (job.threadId === undefined || job.agentRevisionId === undefined) throw new Error('job has no agent execution context')
    const [command, revision, thread, recentMessages, receipts] = await Promise.all([
      ctx.db.query('commands').withIndex('by_installation_command', (q) => q.eq('installationId', args.installationId).eq('commandId', job.commandId)).unique(),
      ctx.db.query('agentRevisions').withIndex('by_installation_revision', (q) => q.eq('installationId', args.installationId).eq('agentRevisionId', job.agentRevisionId!)).unique(),
      ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', args.installationId).eq('threadId', job.threadId!)).unique(),
      ctx.db.query('agentMessages').withIndex('by_installation_thread_ordinal', (q) => q.eq('installationId', args.installationId).eq('threadId', job.threadId!)).order('desc').take(args.maxMessages + 1),
      ctx.db.query('workerEffectReceipts').withIndex('by_installation_job', (q) => q.eq('installationId', args.installationId).eq('jobId', job.jobId)).order('desc').take(64),
    ])
    if (command === null || revision === null || thread === null) throw new Error('execution context is incomplete')
    if (command.agentRevisionId !== job.agentRevisionId || thread.agentRevisionId !== job.agentRevisionId) throw new Error('pinned agent revision mismatch')
    const messages = recentMessages.slice(0, args.maxMessages).reverse().map((message) => {
      const { installationId: _installationId, ...value } = withoutSystemFields(message)
      return value
    })
    const { installationId: _revisionInstallationId, ...agentRevision } = withoutSystemFields(revision)
    return {
      command: withoutSystemFields(command), job: withoutSystemFields(job), agentRevision,
      thread: { threadId: thread.threadId, agentId: thread.agentId, preferredNodeId: thread.preferredNodeId, piSessionRef: thread.piSessionRef, sessionRevision: thread.sessionRevision },
      messages, messagesTruncated: recentMessages.length > args.maxMessages,
      effectReceipts: receipts.reverse().map(receiptWithoutInstallation),
    }
  },
})

export const readNoteVersion = query({
  args: { ...leaseArgs, noteVersionId: v.string() },
  returns: noteVersionContextValue,
  handler: async (ctx, args) => {
    validateLeaseArgs(args); assertId(args.noteVersionId, 'noteVersionId')
    await requireLeaseFencedJob(ctx, args)
    const version = await ctx.db.query('noteVersions').withIndex('by_installation_version', (q) => q.eq('installationId', args.installationId).eq('noteVersionId', args.noteVersionId)).unique()
    if (version === null) throw new Error('not_found')
    const { installationId: _installationId, ...value } = withoutSystemFields(version)
    return value
  },
})

export const readArtifactWork = query({
  args: leaseArgs,
  returns: v.object({
    action: v.union(v.literal('materialize'), v.literal('tombstone')),
    artifactId: v.string(), noteId: v.string(), noteVersion: noteVersionContextValue,
    expectedArtifactRevision: v.number(), slug: v.string(), projectedPath: v.string(),
    priorProjectedHash: v.optional(v.string()), priorProjectedPath: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    validateLeaseArgs(args)
    const job = await requireLeaseFencedJob(ctx, args)
    if (job.kind !== JOB_KINDS.artifactMaterialize && job.kind !== JOB_KINDS.artifactTombstone) throw new Error('invalid artifact work kind')
    const command = await ctx.db.query('commands').withIndex('by_installation_command', (q) => q.eq('installationId', args.installationId).eq('commandId', job.commandId)).unique()
    if (command === null) throw new Error('artifact command not found')
    let intent: unknown
    try { intent = JSON.parse(command.input) } catch { throw new Error('invalid artifact work intent') }
    if (typeof intent !== 'object' || intent === null || Array.isArray(intent)) throw new Error('invalid artifact work intent')
    const value = intent as Record<string, unknown>
    const action = value.action
    if (action !== 'materialize' && action !== 'tombstone') throw new Error('invalid artifact action')
    for (const key of ['artifactId', 'noteId', 'noteVersionId', 'slug', 'projectedPath']) if (typeof value[key] !== 'string') throw new Error('invalid artifact work intent')
    if (typeof value.expectedArtifactRevision !== 'number') throw new Error('invalid artifact work intent')
    const artifact = await ctx.db.query('artifacts').withIndex('by_installation_artifact', (q) => q.eq('installationId', args.installationId).eq('artifactId', value.artifactId as string)).unique()
    if (artifact === null || artifact.revision !== value.expectedArtifactRevision) throw new Error('stale artifact work')
    const version = await ctx.db.query('noteVersions').withIndex('by_installation_version', (q) => q.eq('installationId', args.installationId).eq('noteVersionId', value.noteVersionId as string)).unique()
    if (version === null || version.noteId !== value.noteId) throw new Error('invalid artifact note version')
    const { installationId: _installationId, ...noteVersion } = withoutSystemFields(version)
    return {
      action: action as 'materialize' | 'tombstone', artifactId: value.artifactId as string, noteId: value.noteId as string,
      noteVersion, expectedArtifactRevision: value.expectedArtifactRevision,
      slug: value.slug as string, projectedPath: value.projectedPath as string,
      priorProjectedHash: typeof value.priorProjectedHash === 'string' ? value.priorProjectedHash : undefined,
      priorProjectedPath: typeof value.priorProjectedPath === 'string' ? value.priorProjectedPath : undefined,
    }
  },
})

export const readMemoryWork = query({
  args: leaseArgs,
  returns: v.object({
    kind: v.union(v.literal('project'), v.literal('reconcile'), v.literal('correction')),
    commandInput: v.string(), corrections: v.array(v.object({
      installationId: v.string(), correctionId: v.string(), targetKind: v.string(), targetId: v.string(),
      action: v.union(v.literal('retract'), v.literal('replace'), v.literal('restore')),
      replacement: v.optional(v.string()), reason: v.string(), actor: v.string(), origin: v.string(),
      expectedRevision: v.number(), state: v.union(v.literal('pending'), v.literal('applied'), v.literal('restored'), v.literal('conflict')),
      appliedRevision: v.optional(v.number()), conflict: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    validateLeaseArgs(args)
    const job = await requireLeaseFencedJob(ctx, args)
    const kind = job.kind === JOB_KINDS.memoryProject ? 'project' : job.kind === JOB_KINDS.memoryReconcile ? 'reconcile' : job.kind === JOB_KINDS.memoryCorrectionApply ? 'correction' : null
    if (kind === null) throw new Error('invalid Memory work kind')
    const command = await ctx.db.query('commands').withIndex('by_installation_command', (q) => q.eq('installationId', args.installationId).eq('commandId', job.commandId)).unique()
    if (command === null) throw new Error('Memory command not found')
    let intent: unknown
    try { intent = JSON.parse(command.input) } catch { throw new Error('invalid Memory work intent') }
    if (typeof intent !== 'object' || intent === null || Array.isArray(intent) || (intent as { kind?: unknown }).kind !== kind) throw new Error('invalid Memory work intent')
    const corrections = await ctx.db.query('memoryCorrections').withIndex('by_installation_correction', (q) => q.eq('installationId', args.installationId)).order('desc').take(64)
    return { kind: kind as 'project' | 'reconcile' | 'correction', commandInput: command.input, corrections: corrections.reverse().map(withoutSystemFields) }
  },
})
