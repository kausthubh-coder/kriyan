import { deterministicAssistantMessageId } from '@kriyan/contracts'

import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'

type TerminalMessageState = 'completed' | 'failed' | 'cancelled'

async function threadForJob(ctx: MutationCtx, job: Doc<'jobs'>): Promise<Doc<'agentThreads'> | null> {
  if (job.threadId === undefined) return null
  return await ctx.db
    .query('agentThreads')
    .withIndex('by_installation_thread', (q) =>
      q.eq('installationId', job.installationId).eq('threadId', job.threadId!),
    )
    .unique()
}

/** One transaction-local terminal path for every agent turn outcome. */
export async function finalizeAgentTurn(
  ctx: MutationCtx,
  job: Doc<'jobs'>,
  state: TerminalMessageState,
  now: number,
  assistantContent?: string,
): Promise<void> {
  if (
    job.threadId === undefined
    || job.turnId === undefined
    || job.turnOrdinal === undefined
    || job.agentRevisionId === undefined
  ) return

  if (state === 'completed') {
    if (assistantContent === undefined) throw new Error('assistant content is required to complete an agent turn')
    const messageId = job.assistantMessageId
      ?? deterministicAssistantMessageId(job.threadId, job.turnOrdinal)
    const existing = await ctx.db
      .query('agentMessages')
      .withIndex('by_installation_message', (q) =>
        q.eq('installationId', job.installationId).eq('messageId', messageId),
      )
      .unique()
    if (existing === null) {
      await ctx.db.insert('agentMessages', {
        installationId: job.installationId,
        messageId,
        threadId: job.threadId,
        turnId: job.turnId,
        turnOrdinal: job.turnOrdinal,
        role: 'assistant',
        state: 'completed',
        content: assistantContent,
        origin: 'node',
        agentRevisionId: job.agentRevisionId,
        createdAt: now,
        updatedAt: now,
        finalizedAt: now,
      })
    } else if (
      existing.role !== 'assistant'
      || existing.threadId !== job.threadId
      || existing.turnId !== job.turnId
      || existing.turnOrdinal !== job.turnOrdinal
      || existing.agentRevisionId !== job.agentRevisionId
      || existing.content !== assistantContent
      || existing.state !== 'completed'
    ) {
      throw new Error('assistant message identity conflicts with the completed turn')
    }
  }

  const users = await ctx.db
    .query('agentMessages')
    .withIndex('by_installation_turn_role', (q) =>
      q.eq('installationId', job.installationId).eq('turnId', job.turnId!).eq('role', 'user'),
    )
    .collect()
  for (const message of users) {
    if (message.state !== state || message.finalizedAt === undefined) {
      await ctx.db.patch(message._id, { state, updatedAt: now, finalizedAt: now })
    }
  }

  const thread = await threadForJob(ctx, job)
  if (thread?.activeTurnId === job.turnId) {
    await ctx.db.patch(thread._id, { activeTurnId: undefined, updatedAt: now })
  }
}

export async function releaseAgentTurnForRetry(
  ctx: MutationCtx,
  job: Doc<'jobs'>,
  now: number,
): Promise<void> {
  if (job.turnId === undefined) return
  const thread = await threadForJob(ctx, job)
  if (thread?.activeTurnId === job.turnId) {
    await ctx.db.patch(thread._id, { activeTurnId: undefined, updatedAt: now })
  }
  const users = await ctx.db
    .query('agentMessages')
    .withIndex('by_installation_turn_role', (q) =>
      q.eq('installationId', job.installationId).eq('turnId', job.turnId!).eq('role', 'user'),
    )
    .collect()
  for (const message of users) {
    if (message.state === 'active') await ctx.db.patch(message._id, { state: 'queued', updatedAt: now })
  }
}

export async function fenceQueuedThreadJobs(
  ctx: MutationCtx,
  installationId: string,
  threadId: string,
  nodeId: string,
  piSessionRef: string,
  sessionRevision: number,
  now: number,
): Promise<void> {
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_installation_thread_ordinal', (q) =>
      q.eq('installationId', installationId).eq('threadId', threadId),
    )
    .collect()
  for (const job of jobs) {
    if (
      job.status === 'queued'
      && (
        job.preferredNodeId !== nodeId
        || job.sessionCheckpoint !== piSessionRef
        || job.sessionRevision !== sessionRevision
      )
    ) {
      await ctx.db.patch(job._id, {
        preferredNodeId: nodeId,
        sessionCheckpoint: piSessionRef,
        sessionRevision,
        revision: job.revision + 1,
        updatedAt: now,
      })
    }
  }
}
