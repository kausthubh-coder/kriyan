import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { mutation, type MutationCtx } from './_generated/server'
import {
  assertCapabilities,
  assertError,
  assertEventData,
  assertExpectedRevision,
  assertId,
  assertPositiveInteger,
  assertShortText,
  assertTimestamp,
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

const WORK_CAPABILITY = 'reminders'
const CLAIM_SCAN_LIMIT = 64

type NodeFailure = 'inactive_node' | 'stale_heartbeat' | 'missing_capability'

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
  createdAt: v.number(),
})

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
  capability: string,
): NodeFailure | null {
  if (node === null || node.status !== 'online') return 'inactive_node'
  if (
    now < node.lastHeartbeatAt ||
    now - node.lastHeartbeatAt > NODE_HEARTBEAT_TIMEOUT_MS
  ) {
    return 'stale_heartbeat'
  }
  if (!node.capabilities.includes(capability)) return 'missing_capability'
  return null
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
): Promise<void> {
  const jobs = await ctx.db
    .query('jobs')
    .withIndex('by_installation_lease_owner', (q) =>
      q.eq('installationId', installationId).eq('leaseOwnerNodeId', nodeId),
    )
    .collect()
  for (const job of jobs) {
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
  }
}

async function validateNode(
  ctx: MutationCtx,
  installationId: string,
  nodeId: string,
  now: number,
): Promise<NodeFailure | null> {
  if ((await getInstallation(ctx, installationId)) === null) {
    return 'inactive_node'
  }
  const node = await getNode(ctx, installationId, nodeId)
  const failure = nodeFailure(node, now, WORK_CAPABILITY)
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
): 'not_lease_owner' | 'lease_expired' | null {
  if (job.leaseOwnerNodeId !== nodeId) return 'not_lease_owner'
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
}

export const registerNode = mutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
    displayName: v.string(),
    capabilities: v.array(v.string()),
    protocolVersion: v.string(),
    now: v.number(),
  },
  returns: v.object({ created: v.boolean(), node: nodeValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    assertShortText(args.displayName, 'displayName')
    assertCapabilities(args.capabilities)
    assertShortText(args.protocolVersion, 'protocolVersion')
    assertTimestamp(args.now, 'now')
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
      lastHeartbeatAt: args.now,
      revision: 0,
      createdAt: args.now,
      updatedAt: args.now,
    }
    await ctx.db.insert('nodes', node)
    return { created: true, node }
  },
})

export const heartbeatNode = mutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
    expectedRevision: v.number(),
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.now, 'now')
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
    if (args.now < node.lastHeartbeatAt) {
      return { ok: false as const, reason: 'stale_heartbeat' as const }
    }
    await ctx.db.patch(node._id, {
      status: 'online',
      lastHeartbeatAt: args.now,
      updatedAt: args.now,
      revision: node.revision + 1,
    })
    return { ok: true as const, revision: node.revision + 1 }
  },
})

export const revokeNode = mutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
    expectedRevision: v.number(),
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.now, 'now')
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
      updatedAt: args.now,
    })
    await releaseOwnedWork(
      ctx,
      args.installationId,
      args.nodeId,
      args.now,
      'node revoked',
    )
    return { ok: true as const, revision: node.revision + 1 }
  },
})

export const claimJob = mutation({
  args: {
    installationId: v.string(),
    nodeId: v.string(),
    now: v.number(),
    leaseDurationMs: v.number(),
  },
  returns: claimedJobResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.nodeId, 'nodeId')
    assertTimestamp(args.now, 'now')
    assertPositiveInteger(
      args.leaseDurationMs,
      'leaseDurationMs',
      MAX_LEASE_DURATION_MS,
    )
    const failure = await validateNode(
      ctx,
      args.installationId,
      args.nodeId,
      args.now,
    )
    if (failure !== null) throw new Error(`worker rejected: ${failure}`)

    const queued = await ctx.db
      .query('jobs')
      .withIndex('by_installation_status_created', (q) =>
        q.eq('installationId', args.installationId).eq('status', 'queued'),
      )
      .take(CLAIM_SCAN_LIMIT)
    const expired = (
      await ctx.db
        .query('jobs')
        .withIndex('by_installation_lease', (q) =>
          q
            .eq('installationId', args.installationId)
            .lte('leaseExpiresAt', args.now),
        )
        .take(CLAIM_SCAN_LIMIT)
    ).filter((job) => job.status === 'leased' || job.status === 'running')
    const active = [
      ...(await ctx.db
        .query('jobs')
        .withIndex('by_installation_status_created', (q) =>
          q.eq('installationId', args.installationId).eq('status', 'leased'),
        )
        .take(CLAIM_SCAN_LIMIT)),
      ...(await ctx.db
        .query('jobs')
        .withIndex('by_installation_status_created', (q) =>
          q.eq('installationId', args.installationId).eq('status', 'running'),
        )
        .take(CLAIM_SCAN_LIMIT)),
    ]
    const reclaimable: Doc<'jobs'>[] = []
    for (const job of active) {
      const expired =
        job.leaseExpiresAt !== undefined && job.leaseExpiresAt <= args.now
      const owner =
        job.leaseOwnerNodeId === undefined
          ? null
          : await getNode(ctx, args.installationId, job.leaseOwnerNodeId)
      if (expired || nodeFailure(owner, args.now, WORK_CAPABILITY) !== null) {
        reclaimable.push(job)
      }
    }
    const candidates = [
      ...new Map(
        [...queued, ...expired, ...reclaimable].map((job) => [job._id, job]),
      ).values(),
    ].sort((left, right) =>
      left.createdAt === right.createdAt
        ? left.jobId.localeCompare(right.jobId)
        : left.createdAt - right.createdAt,
    )
    for (const job of candidates) {
      const reclaimed = job.status !== 'queued'
      if (job.attempt >= job.maxAttempts) {
        await terminalizeExhaustedJob(ctx, job, args.now, 'attempts exhausted')
        continue
      }
      if (reclaimed) await closeActiveRun(ctx, job, args.now, 'lease reclaimed')
      const claimed = {
        ...withoutSystemFields(job),
        status: 'leased' as const,
        attempt: job.attempt + 1,
        leaseOwnerNodeId: args.nodeId,
        leaseExpiresAt: args.now + args.leaseDurationMs,
        lastError: undefined,
        revision: job.revision + 1,
        updatedAt: args.now,
      }
      await ctx.db.patch(job._id, claimed)
      return { job: claimed, reclaimed }
    }
    return null
  },
})

export const renewLease = mutation({
  args: {
    installationId: v.string(),
    jobId: v.string(),
    nodeId: v.string(),
    expectedRevision: v.number(),
    now: v.number(),
    leaseDurationMs: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedRevision)
    assertTimestamp(args.now, 'now')
    assertPositiveInteger(
      args.leaseDurationMs,
      'leaseDurationMs',
      MAX_LEASE_DURATION_MS,
    )
    const nodeFailure = await validateNode(
      ctx,
      args.installationId,
      args.nodeId,
      args.now,
    )
    if (nodeFailure !== null) return { ok: false as const, reason: nodeFailure }
    const job = await getJob(ctx, args.installationId, args.jobId)
    if (job === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (job.revision !== args.expectedRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (job.status !== 'leased' && job.status !== 'running') {
      return { ok: false as const, reason: 'invalid_state' as const }
    }
    const failure = leaseFailure(job, args.nodeId, args.now)
    if (failure !== null) return { ok: false as const, reason: failure }
    await ctx.db.patch(job._id, {
      leaseExpiresAt: args.now + args.leaseDurationMs,
      revision: job.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: job.revision + 1 }
  },
})

export const startRun = mutation({
  args: {
    installationId: v.string(),
    jobId: v.string(),
    nodeId: v.string(),
    expectedJobRevision: v.number(),
    now: v.number(),
  },
  returns: startRunResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedJobRevision)
    assertTimestamp(args.now, 'now')
    const nodeFailure = await validateNode(
      ctx,
      args.installationId,
      args.nodeId,
      args.now,
    )
    if (nodeFailure !== null) return { ok: false as const, reason: nodeFailure }
    const job = await getJob(ctx, args.installationId, args.jobId)
    if (job === null)
      return { ok: false as const, reason: 'not_found' as const }
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
    const failure = leaseFailure(job, args.nodeId, args.now)
    if (failure !== null) return { ok: false as const, reason: failure }
    const runId = `run:${job.jobId}:${job.attempt}`
    assertId(runId, 'derived runId')
    const updatedJob = {
      ...withoutSystemFields(job),
      status: 'running' as const,
      revision: job.revision + 1,
      updatedAt: args.now,
    }
    const run = {
      installationId: args.installationId,
      runId,
      jobId: job.jobId,
      attempt: job.attempt,
      nodeId: args.nodeId,
      status: 'running' as const,
      revision: 0,
      startedAt: args.now,
    }
    await ctx.db.patch(job._id, updatedJob)
    await ctx.db.insert('runs', run)
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
    events: v.array(eventInput),
    now: v.number(),
  },
  returns: eventBatchResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.runId, 'runId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedJobRevision)
    assertExpectedRevision(args.expectedRunRevision)
    assertTimestamp(args.now, 'now')
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
      assertTimestamp(event.createdAt, 'createdAt')
      totalData += event.data.length
    }
    if (totalData > MAX_EVENT_BATCH_DATA) {
      throw new Error(
        `event batch data must contain at most ${MAX_EVENT_BATCH_DATA} characters`,
      )
    }
    const nodeFailure = await validateNode(
      ctx,
      args.installationId,
      args.nodeId,
      args.now,
    )
    if (nodeFailure !== null) return { ok: false as const, reason: nodeFailure }
    const job = await getJob(ctx, args.installationId, args.jobId)
    const run = await getRun(ctx, args.installationId, args.runId)
    if (job === null || run === null)
      return { ok: false as const, reason: 'not_found' as const }
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
    const lease = leaseFailure(job, args.nodeId, args.now)
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
          duplicate.data !== event.data ||
          duplicate.createdAt !== event.createdAt
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
    }))
    for (const event of events) await ctx.db.insert('runEvents', event)
    await ctx.db.patch(run._id, { revision: run.revision + events.length })
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
    now: number
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
  const activeFailure = await validateNode(
    ctx,
    args.installationId,
    args.nodeId,
    args.now,
  )
  if (activeFailure !== null)
    return { ok: false as const, reason: activeFailure }
  const job = await getJob(ctx, args.installationId, args.jobId)
  const run = await getRun(ctx, args.installationId, args.runId)
  if (job === null || run === null)
    return { ok: false as const, reason: 'not_found' as const }
  if (
    outcome.status === 'succeeded' &&
    job.status === 'succeeded' &&
    run.status === 'succeeded'
  ) {
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
  const lease = leaseFailure(job, args.nodeId, args.now)
  if (lease !== null) return { ok: false as const, reason: lease }
  if (outcome.status === 'succeeded') {
    await ctx.db.patch(run._id, {
      status: 'succeeded',
      revision: run.revision + 1,
      finishedAt: args.now,
    })
    await ctx.db.patch(job._id, {
      status: 'succeeded',
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: args.now,
    })
    await updateCommandStatus(ctx, job, 'completed', args.now)
  } else {
    const shouldRetry = outcome.retryable && job.attempt < job.maxAttempts
    await ctx.db.patch(run._id, {
      status: 'failed',
      error: outcome.error,
      revision: run.revision + 1,
      finishedAt: args.now,
    })
    await ctx.db.patch(job._id, {
      status: shouldRetry ? 'queued' : 'failed',
      lastError: outcome.error,
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: args.now,
    })
    await updateCommandStatus(
      ctx,
      job,
      shouldRetry ? 'accepted' : 'failed',
      args.now,
    )
  }
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
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertId(args.runId, 'runId')
    assertId(args.nodeId, 'nodeId')
    assertExpectedRevision(args.expectedJobRevision)
    assertExpectedRevision(args.expectedRunRevision)
    assertTimestamp(args.now, 'now')
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
    now: v.number(),
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
    assertTimestamp(args.now, 'now')
    return await finishRun(ctx, args, {
      status: 'failed',
      error: args.error,
      retryable: args.retryable,
    })
  },
})
