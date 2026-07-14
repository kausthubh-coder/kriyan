import { v } from 'convex/values'
import { REMINDER_CAPABILITY } from '@kriyan/contracts'

import type { Doc } from './_generated/dataModel'
import { internalMutation, mutation, type MutationCtx } from './_generated/server'
import {
  fenceQueuedThreadJobs,
  finalizeAgentTurn,
  releaseAgentTurnForRetry,
} from './agent_turns'
import {
  advanceClientSnapshotRevision,
  assertCapabilities,
  assertError,
  assertEventData,
  assertExpectedRevision,
  assertId,
  assertPositiveInteger,
  assertShortText,
  MAX_EVENT_BATCH_DATA,
  MAX_EVENT_BATCH_SIZE,
  MAX_LEASE_DURATION_MS,
  NODE_HEARTBEAT_TIMEOUT_MS,
  withoutSystemFields,
} from './lib'
import {
  jobValue,
  nodeValue,
  runEventType,
  runEventValue,
  runValue,
  transitionResult,
} from './validators'

const OWNED_WORK_RELEASE_LIMIT = 32
const CLAIM_QUEUE_READ_LIMIT = 256
const CLAIM_ACTIVE_READ_LIMIT = 64

type NodeFailure = 'inactive_node' | 'stale_heartbeat' | 'missing_capability'

async function collectActiveJobs(
  ctx: MutationCtx,
  installationId: string,
): Promise<Doc<'jobs'>[]> {
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_installation_lease', (q) =>
      q.eq('installationId', installationId).gt('leaseExpiresAt', 0),
    )
    .take(CLAIM_ACTIVE_READ_LIMIT)
  return jobs.filter((job) => job.status === 'leased' || job.status === 'running')
}

async function collectQueuedJobs(
  ctx: MutationCtx,
  installationId: string,
): Promise<Doc<'jobs'>[]> {
  return await ctx.db
    .query('jobs')
    .withIndex('by_installation_status_created', (q) =>
      q.eq('installationId', installationId).eq('status', 'queued'),
    )
    .take(CLAIM_QUEUE_READ_LIMIT)
}

async function recordClaimTransactionMetrics(ctx: MutationCtx): Promise<void> {
  try {
    const metrics = await ctx.meta.getTransactionMetrics()
    console.info(JSON.stringify({
      event: 'claimJob.transactionMetrics',
      queuedJobReadLimit: CLAIM_QUEUE_READ_LIMIT,
      activeJobReadLimit: CLAIM_ACTIVE_READ_LIMIT,
      documentsRead: metrics.documentsRead,
      bytesRead: metrics.bytesRead,
      databaseQueries: metrics.databaseQueries,
    }))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('getTransactionMetrics')
      || message.includes('Unknown async operation')
    ) return
    throw error
  }
}

const claimedJobResult = v.union(
  v.null(),
  v.object({ job: jobValue, reclaimed: v.boolean() }),
)

const startRunResult = v.union(
  v.object({
    ok: v.literal(true),
    created: v.boolean(),
    job: jobValue,
    run: runValue,
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal('not_found'),
      v.literal('stale_revision'),
      v.literal('invalid_state'),
      v.literal('lease_expired'),
      v.literal('not_lease_owner'),
      v.literal('inactive_node'),
      v.literal('stale_heartbeat'),
      v.literal('missing_capability'),
    ),
  }),
)

const eventInput = v.object({
  eventId: v.string(),
  sequence: v.number(),
  type: runEventType,
  data: v.string(),
})

const revocationResult = v.union(
  v.object({
    ok: v.literal(true),
    revision: v.number(),
    releasedWork: v.number(),
    cleanupPending: v.boolean(),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal('not_found'),
      v.literal('stale_revision'),
      v.literal('invalid_state'),
    ),
  }),
)

const cleanupResult = v.union(
  v.object({
    ok: v.literal(true),
    releasedWork: v.number(),
    cleanupPending: v.boolean(),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(v.literal('not_found'), v.literal('invalid_state')),
  }),
)

const eventBatchResult = v.union(
  v.object({
    ok: v.literal(true),
    duplicate: v.boolean(),
    events: v.array(runEventValue),
    revision: v.number(),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal('not_found'),
      v.literal('stale_revision'),
      v.literal('invalid_state'),
      v.literal('lease_expired'),
      v.literal('not_lease_owner'),
      v.literal('out_of_order'),
      v.literal('inactive_node'),
      v.literal('stale_heartbeat'),
      v.literal('missing_capability'),
    ),
  }),
)

async function getInstallation(
  ctx: MutationCtx,
  installationId: string,
): Promise<Doc<'installations'> | null> {
  return await ctx.db
    .query('installations')
    .withIndex('by_installation_id', (q) =>
      q.eq('installationId', installationId),
    )
    .unique()
}

async function getNode(
  ctx: MutationCtx,
  installationId: string,
  nodeId: string,
): Promise<Doc<'nodes'> | null> {
  return await ctx.db
    .query('nodes')
    .withIndex('by_installation_node', (q) =>
      q.eq('installationId', installationId).eq('nodeId', nodeId),
    )
    .unique()
}

function nodeFailure(
  node: Doc<'nodes'> | null,
  now: number,
  capabilities: readonly string[],
): NodeFailure | null {
  if (node === null || node.status !== 'online') return 'inactive_node'
  if (
    now < node.lastHeartbeatAt ||
    now - node.lastHeartbeatAt > NODE_HEARTBEAT_TIMEOUT_MS
  ) {
    return 'stale_heartbeat'
  }
  if (!capabilities.every((capability) => node.capabilities.includes(capability))) {
    return 'missing_capability'
  }
  return null
}

function requiredCapabilities(job: Doc<'jobs'>): readonly string[] {
  return job.requiredCapabilities ?? [REMINDER_CAPABILITY]
}

async function closeActiveRun(
  ctx: MutationCtx,
  job: Doc<'jobs'>,
  now: number,
  error: string,
): Promise<void> {
  if (job.attempt === 0) return
  const run = await ctx.db
    .query('runs')
    .withIndex('by_installation_job_attempt', (q) =>
      q
        .eq('installationId', job.installationId)
        .eq('jobId', job.jobId)
        .eq('attempt', job.attempt),
    )
    .unique()
  if (run?.status === 'running') {
    await ctx.db.patch(run._id, {
      status: 'failed',
      error,
      revision: run.revision + 1,
      finishedAt: now,
    })
  }
}

async function updateCommandStatus(
  ctx: MutationCtx,
  job: Doc<'jobs'>,
  status: 'accepted' | 'completed' | 'failed' | 'cancelled',
  now: number,
): Promise<void> {
  const command = await ctx.db
    .query('commands')
    .withIndex('by_installation_command', (q) =>
      q.eq('installationId', job.installationId).eq('commandId', job.commandId),
    )
    .unique()
  if (command === null) throw new Error('job is missing its command')
  if (command.status !== status) {
    await ctx.db.patch(command._id, {
      status,
      revision: command.revision + 1,
      updatedAt: now,
    })
  }
}

async function releaseOwnedWork(
  ctx: MutationCtx,
  installationId: string,
  nodeId: string,
  now: number,
  error: string,
): Promise<{ releasedWork: number; cleanupPending: boolean }> {
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_installation_lease_owner', (q) =>
      q.eq('installationId', installationId).eq('leaseOwnerNodeId', nodeId),
    )
    .take(OWNED_WORK_RELEASE_LIMIT + 1)
  const batch = jobs.slice(0, OWNED_WORK_RELEASE_LIMIT)
  for (const job of batch) {
    if (job.status !== 'leased' && job.status !== 'running') continue
    await closeActiveRun(ctx, job, now, error)
    const exhausted = job.attempt >= job.maxAttempts
    await ctx.db.patch(job._id, {
      status: exhausted ? 'failed' : 'queued',
      lastError: error,
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: now,
    })
    await updateCommandStatus(ctx, job, exhausted ? 'failed' : 'accepted', now)
    if (exhausted) await finalizeAgentTurn(ctx, job, 'failed', now)
    else await releaseAgentTurnForRetry(ctx, job, now)
  }
  return {
    releasedWork: batch.length,
    cleanupPending: jobs.length > OWNED_WORK_RELEASE_LIMIT,
  }
}

async function validateNode(
  ctx: MutationCtx,
  installationId: string,
  nodeId: string,
  now: number,
  capabilities: readonly string[] = [REMINDER_CAPABILITY],
): Promise<NodeFailure | null> {
  if ((await getInstallation(ctx, installationId)) === null) {
    return 'inactive_node'
  }
  const node = await getNode(ctx, installationId, nodeId)
  const failure = nodeFailure(node, now, capabilities)
  if (failure === 'inactive_node' || failure === 'stale_heartbeat') {
    await releaseOwnedWork(ctx, installationId, nodeId, now, failure)
  }
  return failure
}

async function getJob(
  ctx: MutationCtx,
  installationId: string,
  jobId: string,
): Promise<Doc<'jobs'> | null> {
  return await ctx.db
    .query('jobs')
    .withIndex('by_installation_job', (q) =>
      q.eq('installationId', installationId).eq('jobId', jobId),
    )
    .unique()
}

async function getRun(
  ctx: MutationCtx,
  installationId: string,
  runId: string,
): Promise<Doc<'runs'> | null> {
  return await ctx.db
    .query('runs')
    .withIndex('by_installation_run', (q) =>
      q.eq('installationId', installationId).eq('runId', runId),
    )
    .unique()
}

function leaseFailure(
  job: Doc<'jobs'>,
  nodeId: string,
  now: number,
  expectedLeaseToken?: string,
): 'not_lease_owner' | 'lease_expired' | null {
  if (job.leaseOwnerNodeId !== nodeId) return 'not_lease_owner'
  if (
    (expectedLeaseToken !== undefined && job.leaseToken !== expectedLeaseToken)
    || (job.requiredCapabilities !== undefined && job.leaseToken !== expectedLeaseToken)
  ) return 'not_lease_owner'
  if (job.leaseExpiresAt === undefined || job.leaseExpiresAt <= now) {
    return 'lease_expired'
  }
  return null
}

async function terminalizeExhaustedJob(
  ctx: MutationCtx,
  job: Doc<'jobs'>,
  now: number,
  error: string,
): Promise<void> {
  await closeActiveRun(ctx, job, now, error)
  await ctx.db.patch(job._id, {
    status: 'failed',
    lastError: error,
    leaseOwnerNodeId: undefined,
    leaseExpiresAt: undefined,
    revision: job.revision + 1,
    updatedAt: now,
  })
  await updateCommandStatus(ctx, job, 'failed', now)
  await finalizeAgentTurn(ctx, job, 'failed', now)
}

async function agentJobIsHeadOfLine(
  ctx: MutationCtx,
  job: Doc<'jobs'>,
  nodeId: string,
): Promise<boolean> {
  if (job.threadId === undefined || job.turnId === undefined || job.turnOrdinal === undefined) return true
  const thread = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', job.installationId).eq('threadId', job.threadId!)).unique()
  const preferredNodeId = thread?.preferredNodeId ?? job.preferredNodeId
  if (preferredNodeId !== undefined && preferredNodeId !== nodeId) {
    const message = await ctx.db.query('agentMessages').withIndex('by_installation_turn_role', (q) => q.eq('installationId', job.installationId).eq('turnId', job.turnId!).eq('role', 'user')).first()
    if (message?.state === 'queued') await ctx.db.patch(message._id, { state: 'waiting_for_node', updatedAt: Date.now() })
    return false
  }
  if (thread === null || thread.deletedAt !== undefined) return false
  if (thread.activeTurnId !== undefined && thread.activeTurnId !== job.turnId) return false
  const activeStatuses = ['queued', 'leased', 'running'] as const
  const heads = await Promise.all(activeStatuses.map(async (status) =>
    await ctx.db.query('jobs').withIndex('by_installation_thread_status_ordinal', (q) => q
      .eq('installationId', job.installationId)
      .eq('threadId', job.threadId)
      .eq('status', status)).first()))
  const head = heads.filter((candidate) => candidate !== null)
    .sort((left, right) => left.turnOrdinal! - right.turnOrdinal! || left.jobId.localeCompare(right.jobId))[0]
  return head?._id === job._id
}

async function activateAgentTurn(ctx: MutationCtx, job: Doc<'jobs'>, now: number): Promise<void> {
  if (job.threadId === undefined || job.turnId === undefined) return
  const thread = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', job.installationId).eq('threadId', job.threadId!)).unique()
  if (thread === null) throw new Error('agent job is missing its thread')
  if (thread.activeTurnId !== undefined && thread.activeTurnId !== job.turnId) throw new Error('agent thread already has an active turn')
  await ctx.db.patch(thread._id, { activeTurnId: job.turnId, updatedAt: now })
  const message = await ctx.db.query('agentMessages').withIndex('by_installation_turn_role', (q) => q.eq('installationId', job.installationId).eq('turnId', job.turnId!).eq('role', 'user')).first()
  if (message?.state === 'queued' || message?.state === 'waiting_for_node') await ctx.db.patch(message._id, { state: 'active', updatedAt: now })
}

export const registerNode = mutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
    displayName: v.string(),
    capabilities: v.array(v.string()),
    protocolVersion: v.string(),
  },
  returns: v.object({ created: v.boolean(), node: nodeValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    assertShortText(args.displayName, 'displayName')
    assertCapabilities(args.capabilities)
    assertShortText(args.protocolVersion, 'protocolVersion')
    const now = Date.now()
    const installation = await getInstallation(ctx, args.installationId)
    if (installation === null) throw new Error('installation not found')
    if (installation.protocolVersion !== args.protocolVersion) {
      throw new Error('node protocolVersion does not match installation')
    }
    const existing = await getNode(ctx, args.installationId, args.nodeId)
    if (existing !== null) {
      if (existing.status === 'revoked') throw new Error('node is revoked')
      const sameCapabilities =
        existing.capabilities.length === args.capabilities.length &&
        existing.capabilities.every(
          (value, index) => value === args.capabilities[index],
        )
      if (
        existing.displayName !== args.displayName ||
        existing.protocolVersion !== args.protocolVersion ||
        !sameCapabilities
      ) {
        throw new Error(
          'nodeId already exists with different registration data',
        )
      }
      return { created: false, node: withoutSystemFields(existing) }
    }
    const node = {
      installationId: args.installationId,
      nodeId: args.nodeId,
      displayName: args.displayName,
      capabilities: args.capabilities,
      protocolVersion: args.protocolVersion,
      status: 'online' as const,
      lastHeartbeatAt: now,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    }
    await ctx.db.insert('nodes', node)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { created: true, node }
  },
})

export const heartbeatNode = mutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
    expectedRevision: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedRevision)
    const now = Date.now()
    if ((await getInstallation(ctx, args.installationId)) === null) {
      return { ok: false as const, reason: 'inactive_node' as const }
    }
    const node = await getNode(ctx, args.installationId, args.nodeId)
    if (node === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (node.status === 'revoked')
      return { ok: false as const, reason: 'inactive_node' as const }
    if (node.revision !== args.expectedRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    await ctx.db.patch(node._id, {
      status: 'online',
      lastHeartbeatAt: now,
      updatedAt: now,
      revision: node.revision + 1,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: node.revision + 1 }
  },
})

export const revokeNode = internalMutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
    expectedRevision: v.number(),
  },
  returns: revocationResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedRevision)
    const now = Date.now()
    const node = await getNode(ctx, args.installationId, args.nodeId)
    if (node === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (node.revision !== args.expectedRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (node.status === 'revoked')
      return { ok: false as const, reason: 'invalid_state' as const }
    await ctx.db.patch(node._id, {
      status: 'revoked',
      revision: node.revision + 1,
      updatedAt: now,
    })
    const cleanup = await releaseOwnedWork(
      ctx,
      args.installationId,
      args.nodeId,
      now,
      'node revoked',
    )
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: node.revision + 1, ...cleanup }
  },
})

export const continueNodeRevocationCleanup = internalMutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
  },
  returns: cleanupResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    const node = await getNode(ctx, args.installationId, args.nodeId)
    if (node === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (node.status !== 'revoked') {
      return { ok: false as const, reason: 'invalid_state' as const }
    }
    const cleanup = await releaseOwnedWork(
      ctx,
      args.installationId,
      args.nodeId,
      Date.now(),
      'node revoked',
    )
    if (cleanup.releasedWork > 0) await advanceClientSnapshotRevision(ctx, args.installationId)
    return {
      ok: true as const,
      ...cleanup,
    }
  },
})

export const claimJob = mutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
    leaseDurationMs: v.number(),
  },
  returns: claimedJobResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    const now = Date.now()
    assertPositiveInteger(
      args.leaseDurationMs,
      'leaseDurationMs',
      MAX_LEASE_DURATION_MS,
    )
    const failure = await validateNode(
      ctx,
      args.installationId,
      args.nodeId,
      now,
      [],
    )
    if (failure !== null) throw new Error(`worker rejected: ${failure}`)

    const node = await getNode(ctx, args.installationId, args.nodeId)
    if (node === null) throw new Error('worker rejected: inactive_node')
    const queued = await collectQueuedJobs(
      ctx,
      args.installationId,
    )
    const active = await collectActiveJobs(ctx, args.installationId)
    const reclaimable: Doc<'jobs'>[] = []
    const owners = new Map<string, Doc<'nodes'> | null>()
    for (const job of active) {
      const expired =
        job.leaseExpiresAt !== undefined && job.leaseExpiresAt <= now
      let owner: Doc<'nodes'> | null = null
      if (!expired && job.leaseOwnerNodeId !== undefined) {
        owner = owners.get(job.leaseOwnerNodeId) ?? null
        if (!owners.has(job.leaseOwnerNodeId)) {
          owner = await getNode(ctx, args.installationId, job.leaseOwnerNodeId)
          owners.set(job.leaseOwnerNodeId, owner)
        }
      }
      if (expired || nodeFailure(owner, now, requiredCapabilities(job)) !== null) {
        reclaimable.push(job)
      }
    }
    const candidates = [
      ...new Map(
        [...queued, ...reclaimable].map((job) => [job._id, job]),
      ).values(),
    ].sort((left, right) =>
      left.createdAt === right.createdAt
        ? left.jobId.localeCompare(right.jobId)
        : left.createdAt - right.createdAt,
    )
    const compatible = candidates.filter((job) => nodeFailure(node, now, requiredCapabilities(job)) === null)
    if (compatible.length === 0) {
      if (queued.length > 0 || reclaimable.length > 0) {
        throw new Error('worker rejected: missing_capability')
      }
    }
    let terminalized = false
    for (const job of compatible) {
      if (!await agentJobIsHeadOfLine(ctx, job, args.nodeId)) continue
      const reclaimed = job.status !== 'queued'
      if (job.attempt >= job.maxAttempts) {
        await terminalizeExhaustedJob(ctx, job, now, 'attempts exhausted')
        terminalized = true
        continue
      }
      if (reclaimed) await closeActiveRun(ctx, job, now, 'lease reclaimed')
      const claimed = {
        ...withoutSystemFields(job),
        status: 'leased' as const,
        attempt: job.attempt + 1,
        leaseOwnerNodeId: args.nodeId,
        leaseExpiresAt: now + args.leaseDurationMs,
        leaseToken: `${job.jobId}:${job.revision + 1}:${now}:${args.nodeId}`,
        lastError: undefined,
        revision: job.revision + 1,
        updatedAt: now,
      }
      await activateAgentTurn(ctx, job, now)
      await ctx.db.patch(job._id, claimed)
      await advanceClientSnapshotRevision(ctx, args.installationId)
      await recordClaimTransactionMetrics(ctx)
      return { job: claimed, reclaimed }
    }
    if (terminalized) await advanceClientSnapshotRevision(ctx, args.installationId)
    await recordClaimTransactionMetrics(ctx)
    return null
  },
})

export const renewLease = mutation({
  args: {
    installationId: v.string(),
    jobId: v.string(),
    nodeId: v.string(),
    expectedRevision: v.number(),
    expectedLeaseToken: v.optional(v.string()),
    leaseDurationMs: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedRevision)
    const now = Date.now()
    assertPositiveInteger(
      args.leaseDurationMs,
      'leaseDurationMs',
      MAX_LEASE_DURATION_MS,
    )
    const job = await getJob(ctx, args.installationId, args.jobId)
    if (job === null)
      return { ok: false as const, reason: 'not_found' as const }
    const nodeFailure = await validateNode(ctx, args.installationId, args.nodeId, now, requiredCapabilities(job))
    if (nodeFailure !== null) return { ok: false as const, reason: nodeFailure }
    if (job.revision !== args.expectedRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (job.status !== 'leased' && job.status !== 'running') {
      return { ok: false as const, reason: 'invalid_state' as const }
    }
    const failure = leaseFailure(job, args.nodeId, now, args.expectedLeaseToken)
    if (failure !== null) return { ok: false as const, reason: failure }
    await ctx.db.patch(job._id, {
      leaseExpiresAt: now + args.leaseDurationMs,
      revision: job.revision + 1,
      updatedAt: now,
    })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: job.revision + 1 }
  },
})

export const startRun = mutation({
  args: {
    installationId: v.string(),
    jobId: v.string(),
    nodeId: v.string(),
    expectedJobRevision: v.number(),
    expectedLeaseToken: v.optional(v.string()),
  },
  returns: startRunResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedJobRevision)
    const now = Date.now()
    const job = await getJob(ctx, args.installationId, args.jobId)
    if (job === null)
      return { ok: false as const, reason: 'not_found' as const }
    const nodeFailure = await validateNode(ctx, args.installationId, args.nodeId, now, requiredCapabilities(job))
    if (nodeFailure !== null) return { ok: false as const, reason: nodeFailure }
    const failure = leaseFailure(job, args.nodeId, now, args.expectedLeaseToken)
    if (failure !== null) return { ok: false as const, reason: failure }
    const existingRun = await ctx.db
      .query('runs')
      .withIndex('by_installation_job_attempt', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('jobId', job.jobId)
          .eq('attempt', job.attempt),
      )
      .unique()
    if (
      job.status === 'running' &&
      job.leaseOwnerNodeId === args.nodeId &&
      existingRun?.status === 'running'
    ) {
      return {
        ok: true as const,
        created: false,
        job: withoutSystemFields(job),
        run: withoutSystemFields(existingRun),
      }
    }
    if (job.revision !== args.expectedJobRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (job.status !== 'leased')
      return { ok: false as const, reason: 'invalid_state' as const }
    const runId = `run:${job.jobId}:${job.attempt}`
    assertId(runId, 'derived runId')
    const updatedJob = {
      ...withoutSystemFields(job),
      status: 'running' as const,
      revision: job.revision + 1,
      updatedAt: now,
    }
    const run = {
      installationId: args.installationId,
      runId,
      jobId: job.jobId,
      attempt: job.attempt,
      nodeId: args.nodeId,
      threadId: job.threadId,
      turnId: job.turnId,
      turnOrdinal: job.turnOrdinal,
      agentRevisionId: job.agentRevisionId,
      assistantMessageId: job.assistantMessageId,
      status: 'running' as const,
      revision: 0,
      startedAt: now,
    }
    await ctx.db.patch(job._id, updatedJob)
    await ctx.db.insert('runs', run)
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, created: true, job: updatedJob, run }
  },
})

export const appendRunEvents = mutation({
  args: {
    installationId: v.string(),
    jobId: v.string(),
    runId: v.string(),
    nodeId: v.string(),
    expectedJobRevision: v.number(),
    expectedRunRevision: v.number(),
    expectedLeaseToken: v.optional(v.string()),
    events: v.array(eventInput),
  },
  returns: eventBatchResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.runId, 'runId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedJobRevision)
    assertExpectedRevision(args.expectedRunRevision)
    const now = Date.now()
    assertPositiveInteger(
      args.events.length,
      'events.length',
      MAX_EVENT_BATCH_SIZE,
    )
    let totalData = 0
    for (const event of args.events) {
      assertId(event.eventId, 'eventId')
      assertPositiveInteger(event.sequence, 'sequence', Number.MAX_SAFE_INTEGER)
      assertEventData(event.data)
      totalData += event.data.length
    }
    if (totalData > MAX_EVENT_BATCH_DATA) {
      throw new Error(
        `event batch data must contain at most ${MAX_EVENT_BATCH_DATA} characters`,
      )
    }
    const job = await getJob(ctx, args.installationId, args.jobId)
    const run = await getRun(ctx, args.installationId, args.runId)
    if (job === null || run === null)
      return { ok: false as const, reason: 'not_found' as const }
    const nodeFailure = await validateNode(ctx, args.installationId, args.nodeId, now, requiredCapabilities(job))
    if (nodeFailure !== null) return { ok: false as const, reason: nodeFailure }
    if (job.revision !== args.expectedJobRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (
      job.status !== 'running' ||
      run.status !== 'running' ||
      run.jobId !== job.jobId
    ) {
      return { ok: false as const, reason: 'invalid_state' as const }
    }
    if (run.nodeId !== args.nodeId)
      return { ok: false as const, reason: 'not_lease_owner' as const }
    const lease = leaseFailure(job, args.nodeId, now, args.expectedLeaseToken)
    if (lease !== null) return { ok: false as const, reason: lease }

    const duplicates: Doc<'runEvents'>[] = []
    for (const event of args.events) {
      const duplicate = await ctx.db
        .query('runEvents')
        .withIndex('by_installation_event', (q) =>
          q
            .eq('installationId', args.installationId)
            .eq('eventId', event.eventId),
        )
        .unique()
      if (duplicate !== null) {
        if (
          duplicate.runId !== args.runId ||
          duplicate.sequence !== event.sequence ||
          duplicate.type !== event.type ||
          duplicate.data !== event.data
        ) {
          throw new Error('eventId conflicts with an existing event')
        }
        duplicates.push(duplicate)
      }
    }
    if (duplicates.length === args.events.length) {
      return {
        ok: true as const,
        duplicate: true,
        events: duplicates.map(withoutSystemFields),
        revision: run.revision,
      }
    }
    if (duplicates.length !== 0) {
      throw new Error('event batch must be entirely new or an exact retry')
    }
    if (run.revision !== args.expectedRunRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    const latest = await ctx.db
      .query('runEvents')
      .withIndex('by_installation_run_sequence', (q) =>
        q.eq('installationId', args.installationId).eq('runId', args.runId),
      )
      .order('desc')
      .first()
    const expectedFirstSequence = (latest?.sequence ?? 0) + 1
    if (args.events[0]?.sequence !== expectedFirstSequence) {
      return { ok: false as const, reason: 'out_of_order' as const }
    }
    for (let index = 1; index < args.events.length; index += 1) {
      if (args.events[index]?.sequence !== expectedFirstSequence + index) {
        return { ok: false as const, reason: 'out_of_order' as const }
      }
    }
    const events = args.events.map((event) => ({
      installationId: args.installationId,
      runId: args.runId,
      ...event,
      createdAt: now,
    }))
    for (const event of events) await ctx.db.insert('runEvents', event)
    await ctx.db.patch(run._id, { revision: run.revision + events.length })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return {
      ok: true as const,
      duplicate: false,
      events,
      revision: run.revision + events.length,
    }
  },
})

async function finishRun(
  ctx: MutationCtx,
  args: {
    installationId: string
    jobId: string
    runId: string
    nodeId: string
    expectedJobRevision: number
    expectedRunRevision: number
    expectedLeaseToken?: string
    assistantContent?: string
  },
  outcome:
    | { status: 'succeeded' }
    | { status: 'failed'; error: string; retryable: boolean },
): Promise<
  | { ok: true; revision: number }
  | {
      ok: false
      reason:
        | 'not_found'
        | 'stale_revision'
        | 'invalid_state'
        | 'lease_expired'
        | 'not_lease_owner'
        | NodeFailure
    }
> {
  const now = Date.now()
  const job = await getJob(ctx, args.installationId, args.jobId)
  const run = await getRun(ctx, args.installationId, args.runId)
  if (job === null || run === null)
    return { ok: false as const, reason: 'not_found' as const }
  const activeFailure = await validateNode(ctx, args.installationId, args.nodeId, now, requiredCapabilities(job))
  if (activeFailure !== null) return { ok: false as const, reason: activeFailure }
  if (
    outcome.status === 'succeeded' &&
    job.status === 'succeeded' &&
    run.status === 'succeeded'
  ) {
    if (job.threadId !== undefined) await finalizeAgentTurn(ctx, job, 'completed', now, args.assistantContent)
    return { ok: true as const, revision: job.revision }
  }
  if (
    job.revision !== args.expectedJobRevision ||
    run.revision !== args.expectedRunRevision
  ) {
    return { ok: false as const, reason: 'stale_revision' as const }
  }
  if (
    job.status !== 'running' ||
    run.status !== 'running' ||
    run.jobId !== job.jobId
  ) {
    return { ok: false as const, reason: 'invalid_state' as const }
  }
  if (run.nodeId !== args.nodeId)
    return { ok: false as const, reason: 'not_lease_owner' as const }
  const lease = leaseFailure(job, args.nodeId, now, args.expectedLeaseToken)
  if (lease !== null) return { ok: false as const, reason: lease }
  if (outcome.status === 'succeeded') {
    if (job.threadId !== undefined && args.assistantContent === undefined) return { ok: false as const, reason: 'invalid_state' as const }
    await finalizeAgentTurn(ctx, job, 'completed', now, args.assistantContent)
    await ctx.db.patch(run._id, {
      status: 'succeeded',
      revision: run.revision + 1,
      finishedAt: now,
    })
    await ctx.db.patch(job._id, {
      status: 'succeeded',
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: now,
    })
    await updateCommandStatus(ctx, job, 'completed', now)
  } else {
    const shouldRetry = outcome.retryable && job.attempt < job.maxAttempts
    await ctx.db.patch(run._id, {
      status: 'failed',
      error: outcome.error,
      revision: run.revision + 1,
      finishedAt: now,
    })
    await ctx.db.patch(job._id, {
      status: shouldRetry ? 'queued' : 'failed',
      lastError: outcome.error,
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: now,
    })
    await updateCommandStatus(
      ctx,
      job,
      shouldRetry ? 'accepted' : 'failed',
      now,
    )
  }
  if (outcome.status === 'failed') {
    if (!outcome.retryable || job.attempt >= job.maxAttempts) await finalizeAgentTurn(ctx, job, 'failed', now)
    else await releaseAgentTurnForRetry(ctx, job, now)
  }
  await advanceClientSnapshotRevision(ctx, args.installationId)
  return { ok: true as const, revision: job.revision + 1 }
}

export const completeRun = mutation({
  args: {
    installationId: v.string(),
    jobId: v.string(),
    runId: v.string(),
    nodeId: v.string(),
    expectedJobRevision: v.number(),
    expectedRunRevision: v.number(),
    expectedLeaseToken: v.optional(v.string()),
    assistantContent: v.optional(v.string()),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.runId, 'runId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedJobRevision)
    assertExpectedRevision(args.expectedRunRevision)
    if (args.assistantContent !== undefined) assertEventData(args.assistantContent)
    return await finishRun(ctx, args, { status: 'succeeded' })
  },
})

export const failRun = mutation({
  args: {
    installationId: v.string(),
    jobId: v.string(),
    runId: v.string(),
    nodeId: v.string(),
    error: v.string(),
    retryable: v.boolean(),
    expectedJobRevision: v.number(),
    expectedRunRevision: v.number(),
    expectedLeaseToken: v.optional(v.string()),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.runId, 'runId')
    assertId(args.nodeId, 'nodeId')
    assertError(args.error)
    assertExpectedRevision(args.expectedJobRevision)
    assertExpectedRevision(args.expectedRunRevision)
    return await finishRun(ctx, args, {
      status: 'failed',
      error: args.error,
      retryable: args.retryable,
    })
  },
})

export const checkpointEffect = mutation({
  args: { installationId: v.string(), jobId: v.string(), nodeId: v.string(), expectedJobRevision: v.number(), expectedLeaseToken: v.optional(v.string()), checkpoint: v.string() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertEventData(args.checkpoint)
    const now = Date.now(); const job = await getJob(ctx, args.installationId, args.jobId)
    if (job === null) return { ok: false as const, reason: 'not_found' as const }
    if (job.revision !== args.expectedJobRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (job.status !== 'running') return { ok: false as const, reason: 'invalid_state' as const }
    const failure = leaseFailure(job, args.nodeId, now, args.expectedLeaseToken); if (failure !== null) return { ok: false as const, reason: failure }
    await ctx.db.patch(job._id, { effectCheckpoint: args.checkpoint, revision: job.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: job.revision + 1 }
  },
})

export const checkpointSession = mutation({
  args: { installationId: v.string(), jobId: v.string(), nodeId: v.string(), expectedJobRevision: v.number(), expectedLeaseToken: v.optional(v.string()), expectedSessionRevision: v.optional(v.number()), piSessionRef: v.string() },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertShortText(args.piSessionRef, 'piSessionRef')
    if (/[\\/\s]/.test(args.piSessionRef)) throw new Error('piSessionRef must be an opaque identifier, not a path or session content')
    const now = Date.now(); const job = await getJob(ctx, args.installationId, args.jobId)
    if (job === null) return { ok: false as const, reason: 'not_found' as const }
    if (job.revision !== args.expectedJobRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (job.status !== 'running') return { ok: false as const, reason: 'invalid_state' as const }
    const nodeFailure = await validateNode(ctx, args.installationId, args.nodeId, now, requiredCapabilities(job)); if (nodeFailure !== null) return { ok: false as const, reason: nodeFailure }
    const failure = leaseFailure(job, args.nodeId, now, args.expectedLeaseToken); if (failure !== null) return { ok: false as const, reason: failure }
    if (job.threadId === undefined) return { ok: false as const, reason: 'invalid_state' as const }
    const thread = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) => q.eq('installationId', args.installationId).eq('threadId', job.threadId!)).unique()
    if (thread === null) return { ok: false as const, reason: 'not_found' as const }
    const expectedSessionRevision = args.expectedSessionRevision ?? job.sessionRevision ?? thread.sessionRevision
    if (thread.sessionRevision !== expectedSessionRevision) return { ok: false as const, reason: 'stale_revision' as const }
    if (thread.piSessionRef === args.piSessionRef && job.sessionCheckpoint === args.piSessionRef && job.sessionRevision === thread.sessionRevision) return { ok: true as const, revision: job.revision }
    const sessionRevision = thread.sessionRevision + 1
    await ctx.db.patch(thread._id, { piSessionRef: args.piSessionRef, preferredNodeId: args.nodeId, sessionRevision: thread.sessionRevision + 1, updatedAt: now })
    await fenceQueuedThreadJobs(ctx, args.installationId, job.threadId, args.nodeId, args.piSessionRef, sessionRevision, now)
    await ctx.db.patch(job._id, { sessionCheckpoint: args.piSessionRef, sessionRevision, revision: job.revision + 1, updatedAt: now })
    await advanceClientSnapshotRevision(ctx, args.installationId)
    return { ok: true as const, revision: job.revision + 1 }
  },
})
