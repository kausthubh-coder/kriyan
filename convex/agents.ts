import {
  AGENT_CHAT_CAPABILITY,
  CONTRACT_VERSION,
  deterministicAssistantMessageId,
  deterministicTurnId,
  JOB_KINDS,
} from '@kriyan/contracts'
import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import { mutation, query, type MutationCtx } from './_generated/server'
import {
  advanceClientSnapshotRevision,
  assertBoundedString,
  assertExpectedRevision,
  assertId,
  assertOptionalId,
  assertPositiveInteger,
  assertShortText,
  assertStringList,
  MAX_PAGE_SIZE,
  withoutSystemFields,
} from './lib'
import {
  agentMessageValue,
  agentRevisionValue,
  agentThreadValue,
  agentValue,
  commandValue,
  jobValue,
  transitionResult,
} from './validators'

async function installationExists(ctx: MutationCtx, installationId: string): Promise<boolean> {
  return (await ctx.db.query('installations').withIndex('by_installation_id', (q) => q.eq('installationId', installationId)).unique()) !== null
}

export const create = mutation({
  args: {
    installationId: v.string(), agentId: v.string(), agentRevisionId: v.string(),
    displayName: v.string(), systemPrompt: v.string(), toolCapabilities: v.array(v.string()),
  },
  returns: v.object({ created: v.boolean(), agent: agentValue, revision: agentRevisionValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId'); assertId(args.agentId, 'agentId')
    assertId(args.agentRevisionId, 'agentRevisionId'); assertBoundedString(args.displayName, 'displayName', 256)
    assertBoundedString(args.systemPrompt, 'systemPrompt', 65_536); assertStringList(args.toolCapabilities, 'toolCapabilities', 128)
    if (!await installationExists(ctx, args.installationId)) throw new Error('installation not found')
    const existing = await ctx.db.query('agents').withIndex('by_installation_agent', (q) => q.eq('installationId', args.installationId).eq('agentId', args.agentId)).unique()
    if (existing !== null) {
      const revision = await ctx.db.query('agentRevisions').withIndex('by_installation_revision', (q) => q.eq('installationId', args.installationId).eq('agentRevisionId', existing.currentRevisionId)).unique()
      if (revision === null) throw new Error('agent is missing current revision')
      if (revision.agentRevisionId !== args.agentRevisionId || revision.displayName !== args.displayName || revision.systemPrompt !== args.systemPrompt || JSON.stringify(revision.toolCapabilities) !== JSON.stringify(args.toolCapabilities)) throw new Error('agentId conflicts with an existing agent')
      return { created: false, agent: withoutSystemFields(existing), revision: withoutSystemFields(revision) }
    }
    const now = Date.now()
    const revision = { installationId: args.installationId, agentRevisionId: args.agentRevisionId, agentId: args.agentId, ordinal: 0, displayName: args.displayName, systemPrompt: args.systemPrompt, toolCapabilities: args.toolCapabilities, createdAt: now }
    const agent = { installationId: args.installationId, agentId: args.agentId, displayName: args.displayName, currentRevisionId: args.agentRevisionId, revision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('agentRevisions', revision); await ctx.db.insert('agents', agent)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, agent, revision }
  },
})

export const revise = mutation({
  args: { installationId: v.string(), agentId: v.string(), agentRevisionId: v.string(), expectedRevision: v.number(), displayName: v.string(), systemPrompt: v.string(), toolCapabilities: v.array(v.string()) },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId'); assertId(args.agentId, 'agentId'); assertId(args.agentRevisionId, 'agentRevisionId'); assertExpectedRevision(args.expectedRevision)
    assertBoundedString(args.displayName, 'displayName', 256); assertBoundedString(args.systemPrompt, 'systemPrompt', 65_536); assertStringList(args.toolCapabilities, 'toolCapabilities', 128)
    const agent = await ctx.db.query('agents').withIndex('by_installation_agent', (q) => q.eq('installationId', args.installationId).eq('agentId', args.agentId)).unique()
    if (agent === null) return { ok: false as const, reason: 'not_found' as const }
    if (agent.revision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    const duplicate = await ctx.db.query('agentRevisions').withIndex('by_installation_revision', (q) => q.eq('installationId', args.installationId).eq('agentRevisionId', args.agentRevisionId)).unique()
    if (duplicate !== null) throw new Error('agentRevisionId already exists')
    const now = Date.now()
    await ctx.db.insert('agentRevisions', { installationId: args.installationId, agentRevisionId: args.agentRevisionId, agentId: args.agentId, ordinal: agent.revision + 1, displayName: args.displayName, systemPrompt: args.systemPrompt, toolCapabilities: args.toolCapabilities, createdAt: now })
    await ctx.db.patch(agent._id, { displayName: args.displayName, currentRevisionId: args.agentRevisionId, revision: agent.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: agent.revision + 1 }
  },
})

export const listDefinitions = query({
  args: { installationId: v.string() },
  returns: v.array(v.object({
    agent: agentValue,
    revisions: v.array(agentRevisionValue),
  })),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    const agents = await ctx.db
      .query('agents')
      .withIndex('by_installation_agent', (q) => q.eq('installationId', args.installationId))
      .take(MAX_PAGE_SIZE)
    return await Promise.all(agents
      .filter((agent) => agent.deletedAt === undefined)
      .map(async (agent) => {
        const revisions = await ctx.db
          .query('agentRevisions')
          .withIndex('by_installation_agent_ordinal', (q) => q
            .eq('installationId', args.installationId)
            .eq('agentId', agent.agentId))
          .order('desc')
          .take(MAX_PAGE_SIZE)
        return {
          agent: withoutSystemFields(agent),
          revisions: revisions.map(withoutSystemFields),
        }
      }))
  },
})

export const createThread = mutation({
  args: { installationId: v.string(), threadId: v.string(), agentId: v.string(), title: v.optional(v.string()), preferredNodeId: v.optional(v.string()) },
  returns: v.object({ created: v.boolean(), thread: agentThreadValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId'); assertId(args.threadId, 'threadId'); assertId(args.agentId, 'agentId')
    if (args.title !== undefined) assertShortText(args.title, 'title')
    assertOptionalId(args.preferredNodeId, 'preferredNodeId')
    const existing = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', args.installationId).eq('threadId', args.threadId)).unique()
    if (existing !== null) {
      if (existing.agentId !== args.agentId || existing.title !== args.title || existing.preferredNodeId !== args.preferredNodeId) throw new Error('threadId conflicts with an existing thread')
      return { created: false, thread: withoutSystemFields(existing) }
    }
    const agent = await ctx.db.query('agents').withIndex('by_installation_agent', (q) => q.eq('installationId', args.installationId).eq('agentId', args.agentId)).unique()
    if (agent === null || agent.deletedAt !== undefined) throw new Error('agent not found')
    const now = Date.now()
    const thread = { installationId: args.installationId, threadId: args.threadId, agentId: args.agentId, agentRevisionId: agent.currentRevisionId, title: args.title, nextTurnOrdinal: 1, preferredNodeId: args.preferredNodeId, sessionRevision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('agentThreads', thread)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, thread }
  },
})

export const renameThread = mutation({
  args: { installationId: v.string(), threadId: v.string(), title: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), thread: agentThreadValue }),
    v.object({ ok: v.literal(false), reason: v.literal('not_found') }),
  ),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.threadId, 'threadId')
    assertShortText(args.title, 'title')
    const thread = await ctx.db
      .query('agentThreads')
      .withIndex('by_installation_thread', (q) => q
        .eq('installationId', args.installationId)
        .eq('threadId', args.threadId))
      .unique()
    if (thread === null || thread.deletedAt !== undefined) {
      return { ok: false as const, reason: 'not_found' as const }
    }
    const now = Date.now()
    await ctx.db.patch(thread._id, { title: args.title, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return {
      ok: true as const,
      thread: withoutSystemFields({ ...thread, title: args.title, updatedAt: now }),
    }
  },
})

export const submitMessage = mutation({
  args: { installationId: v.string(), threadId: v.string(), commandId: v.string(), messageId: v.string(), idempotencyKey: v.string(), content: v.string(), maxAttempts: v.number() },
  returns: v.object({ created: v.boolean(), message: agentMessageValue, command: commandValue, job: jobValue }),
  handler: async (ctx, args) => {
    for (const [name, value] of Object.entries({ installationId: args.installationId, threadId: args.threadId, commandId: args.commandId, messageId: args.messageId, idempotencyKey: args.idempotencyKey })) assertId(value, name)
    assertBoundedString(args.content, 'content', 65_536); assertPositiveInteger(args.maxAttempts, 'maxAttempts', 10)
    const existingCommand = await ctx.db.query('commands').withIndex('by_installation_idempotency', (q) => q.eq('installationId', args.installationId).eq('idempotencyKey', args.idempotencyKey)).unique()
    if (existingCommand !== null) {
      if (
        existingCommand.commandId !== args.commandId
        || existingCommand.threadId !== args.threadId
        || existingCommand.input !== args.content
      ) throw new Error('idempotency key conflicts with an existing turn')
      const existingJob = await ctx.db.query('jobs').withIndex('by_installation_command', (q) => q.eq('installationId', args.installationId).eq('commandId', existingCommand.commandId)).unique()
      if (existingJob === null || existingJob.turnId === undefined) throw new Error('existing turn is incomplete')
      const messages = await ctx.db.query('agentMessages').withIndex('by_installation_turn_role', (q) => q.eq('installationId', args.installationId).eq('turnId', existingJob.turnId!).eq('role', 'user')).collect()
      const existingMessage = messages[0]
      if (
        existingMessage === undefined
        || existingMessage.messageId !== args.messageId
        || existingMessage.content !== args.content
        || existingJob.maxAttempts !== args.maxAttempts
      ) throw new Error('idempotency key conflicts with an existing turn')
      return { created: false, message: withoutSystemFields(existingMessage), command: withoutSystemFields(existingCommand), job: withoutSystemFields(existingJob) }
    }
    const thread = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', args.installationId).eq('threadId', args.threadId)).unique()
    if (thread === null || thread.deletedAt !== undefined) throw new Error('thread not found')
    const agent = await ctx.db.query('agents').withIndex('by_installation_agent', (q) => q.eq('installationId', args.installationId).eq('agentId', thread.agentId)).unique()
    if (agent === null || agent.deletedAt !== undefined) throw new Error('agent not found')
    const pinnedRevisionId = agent.currentRevisionId
    const duplicateCommand = await ctx.db.query('commands').withIndex('by_installation_command', (q) => q.eq('installationId', args.installationId).eq('commandId', args.commandId)).unique()
    const duplicateMessage = await ctx.db.query('agentMessages').withIndex('by_installation_message', (q) => q.eq('installationId', args.installationId).eq('messageId', args.messageId)).unique()
    if (duplicateCommand !== null || duplicateMessage !== null) throw new Error('commandId or messageId already exists')
    const ordinal = thread.nextTurnOrdinal
    const turnId = deterministicTurnId(args.threadId, ordinal)
    const assistantMessageId = deterministicAssistantMessageId(args.threadId, ordinal)
    if (args.messageId === assistantMessageId) throw new Error('messageId is reserved for the deterministic assistant result')
    const assistantCollision = await ctx.db.query('agentMessages').withIndex('by_installation_message', (q) => q.eq('installationId', args.installationId).eq('messageId', assistantMessageId)).unique()
    if (assistantCollision !== null) throw new Error('deterministic assistant messageId already exists')
    const now = Date.now()
    const common = { installationId: args.installationId, contractVersion: CONTRACT_VERSION, kind: JOB_KINDS.agentTurn, threadId: args.threadId, turnId, turnOrdinal: ordinal, agentRevisionId: pinnedRevisionId }
    const message = { installationId: args.installationId, messageId: args.messageId, threadId: args.threadId, turnId, turnOrdinal: ordinal, role: 'user' as const, state: thread.preferredNodeId === undefined ? 'queued' as const : 'waiting_for_node' as const, content: args.content, origin: 'client', agentRevisionId: pinnedRevisionId, createdAt: now, updatedAt: now }
    const command = { ...common, commandId: args.commandId, idempotencyKey: args.idempotencyKey, input: args.content, status: 'accepted' as const, revision: 0, createdAt: now, updatedAt: now }
    const job = { ...common, jobId: `job:${args.commandId}`, commandId: args.commandId, requiredCapabilities: [AGENT_CHAT_CAPABILITY], routingCapability: AGENT_CHAT_CAPABILITY, preferredNodeId: thread.preferredNodeId, assistantMessageId, sessionCheckpoint: thread.piSessionRef, sessionRevision: thread.sessionRevision, status: 'queued' as const, attempt: 0, maxAttempts: args.maxAttempts, revision: 0, createdAt: now, updatedAt: now }
    await ctx.db.insert('agentMessages', message); await ctx.db.insert('commands', command); await ctx.db.insert('jobs', job)
    await ctx.db.patch(thread._id, { agentRevisionId: pinnedRevisionId, nextTurnOrdinal: ordinal + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, message, command, job }
  },
})

export const listThreads = query({
  args: { installationId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(agentThreadValue),
  handler: async (ctx, args) => {
    assertPositiveInteger(args.paginationOpts.numItems, 'paginationOpts.numItems', MAX_PAGE_SIZE)
    const page = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', args.installationId)).paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const listMessages = query({
  args: { installationId: v.string(), threadId: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(agentMessageValue),
  handler: async (ctx, args) => {
    assertPositiveInteger(args.paginationOpts.numItems, 'paginationOpts.numItems', MAX_PAGE_SIZE)
    const page = await ctx.db.query('agentMessages').withIndex('by_installation_thread_ordinal', (q) => q.eq('installationId', args.installationId).eq('threadId', args.threadId)).paginate(args.paginationOpts)
    return { ...page, page: page.page.map(withoutSystemFields) }
  },
})

export const resetSession = mutation({
  args: { installationId: v.string(), threadId: v.string(), expectedRevision: v.number(), preferredNodeId: v.optional(v.string()) },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertOptionalId(args.preferredNodeId, 'preferredNodeId')
    const thread = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', args.installationId).eq('threadId', args.threadId)).unique()
    if (thread === null) return { ok: false as const, reason: 'not_found' as const }
    if (thread.sessionRevision !== args.expectedRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (thread.activeTurnId !== undefined) return { ok: false as const, reason: 'invalid_state' as const }
    const now = Date.now()
    await ctx.db.patch(thread._id, { preferredNodeId: args.preferredNodeId, piSessionRef: undefined, sessionRevision: thread.sessionRevision + 1, updatedAt: now })
    const jobs = await ctx.db.query('jobs').withIndex('by_installation_thread_ordinal', (q) => q.eq('installationId', args.installationId).eq('threadId', args.threadId)).collect()
    for (const job of jobs) if (job.status === 'queued') await ctx.db.patch(job._id, { preferredNodeId: args.preferredNodeId, sessionCheckpoint: undefined, sessionRevision: thread.sessionRevision + 1, revision: job.revision + 1, updatedAt: now })
    const messages = await ctx.db.query('agentMessages').withIndex('by_installation_thread_ordinal', (q) => q.eq('installationId', args.installationId).eq('threadId', args.threadId)).collect()
    const waitingState = args.preferredNodeId === undefined ? 'queued' as const : 'waiting_for_node' as const
    for (const message of messages) {
      if (
        message.role === 'user'
        && (message.state === 'queued' || message.state === 'waiting_for_node')
        && message.state !== waitingState
      ) await ctx.db.patch(message._id, { state: waitingState, updatedAt: now })
    }
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: thread.sessionRevision + 1 }
  },
})
