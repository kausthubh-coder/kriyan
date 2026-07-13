import { v } from 'convex/values'

import { internalMutation } from './_generated/server'
import {
  assertBoundedString,
  assertCapabilities,
  assertError,
  assertEventData,
  assertId,
  assertPositiveInteger,
  assertShortText,
  assertTimestamp,
  withoutSystemFields,
} from './lib'
import {
  jobValue,
  nodeValue,
  reminderStatus,
  reminderValue,
  runEventType,
  runEventValue,
  runValue,
  taskStatus,
  taskValue,
  transitionResult,
} from './validators'

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
    ),
  }),
)

export const registerNode = internalMutation({
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
    const installation = await ctx.db
      .query('installations')
      .withIndex('by_installation_id', (q) =>
        q.eq('installationId', args.installationId),
      )
      .unique()
    if (installation === null) throw new Error('installation not found')
    const existing = await ctx.db
      .query('nodes')
      .withIndex('by_installation_node', (q) =>
        q.eq('installationId', args.installationId).eq('nodeId', args.nodeId),
      )
      .unique()
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

export const heartbeatNode = internalMutation({
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
    assertTimestamp(args.now, 'now')
    const node = await ctx.db
      .query('nodes')
      .withIndex('by_installation_node', (q) =>
        q.eq('installationId', args.installationId).eq('nodeId', args.nodeId),
      )
      .unique()
    if (node === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (node.status === 'revoked')
      return { ok: false as const, reason: 'invalid_state' as const }
    if (node.revision !== args.expectedRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
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

export const revokeNode = internalMutation({
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
    assertTimestamp(args.now, 'now')
    const node = await ctx.db
      .query('nodes')
      .withIndex('by_installation_node', (q) =>
        q.eq('installationId', args.installationId).eq('nodeId', args.nodeId),
      )
      .unique()
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
    return { ok: true as const, revision: node.revision + 1 }
  },
})

export const claimJob = internalMutation({
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
    assertPositiveInteger(args.leaseDurationMs, 'leaseDurationMs', 300_000)
    const node = await ctx.db
      .query('nodes')
      .withIndex('by_installation_node', (q) =>
        q.eq('installationId', args.installationId).eq('nodeId', args.nodeId),
      )
      .unique()
    if (node === null || node.status !== 'online')
      throw new Error('active node not found')

    const jobs = await ctx.db
      .query('jobs')
      .withIndex('by_installation_job', (q) =>
        q.eq('installationId', args.installationId),
      )
      .collect()
    const candidates = jobs
      .filter(
        (job) =>
          job.status === 'queued' ||
          ((job.status === 'leased' || job.status === 'running') &&
            job.leaseExpiresAt !== undefined &&
            job.leaseExpiresAt <= args.now),
      )
      .sort((left, right) =>
        left.createdAt === right.createdAt
          ? left.jobId.localeCompare(right.jobId)
          : left.createdAt - right.createdAt,
      )

    for (const job of candidates) {
      const reclaimed = job.status !== 'queued'
      if (job.attempt >= job.maxAttempts) {
        await ctx.db.patch(job._id, {
          status: 'failed',
          lastError: 'attempts exhausted',
          leaseOwnerNodeId: undefined,
          leaseExpiresAt: undefined,
          revision: job.revision + 1,
          updatedAt: args.now,
        })
        const command = await ctx.db
          .query('commands')
          .withIndex('by_installation_command', (q) =>
            q
              .eq('installationId', args.installationId)
              .eq('commandId', job.commandId),
          )
          .unique()
        if (command?.status === 'accepted') {
          await ctx.db.patch(command._id, {
            status: 'failed',
            revision: command.revision + 1,
            updatedAt: args.now,
          })
        }
        continue
      }
      if (reclaimed && job.status === 'running') {
        const previousRun = await ctx.db
          .query('runs')
          .withIndex('by_installation_job_attempt', (q) =>
            q
              .eq('installationId', args.installationId)
              .eq('jobId', job.jobId)
              .eq('attempt', job.attempt),
          )
          .unique()
        if (previousRun?.status === 'running') {
          await ctx.db.patch(previousRun._id, {
            status: 'failed',
            error: 'lease expired',
            revision: previousRun.revision + 1,
            finishedAt: args.now,
          })
        }
      }
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

export const renewLease = internalMutation({
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
    assertTimestamp(args.now, 'now')
    assertPositiveInteger(args.leaseDurationMs, 'leaseDurationMs', 300_000)
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_installation_job', (q) =>
        q.eq('installationId', args.installationId).eq('jobId', args.jobId),
      )
      .unique()
    if (job === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (job.revision !== args.expectedRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (job.status !== 'leased' && job.status !== 'running') {
      return { ok: false as const, reason: 'invalid_state' as const }
    }
    if (job.leaseOwnerNodeId !== args.nodeId) {
      return { ok: false as const, reason: 'not_lease_owner' as const }
    }
    if (job.leaseExpiresAt === undefined || job.leaseExpiresAt <= args.now) {
      return { ok: false as const, reason: 'lease_expired' as const }
    }
    await ctx.db.patch(job._id, {
      leaseExpiresAt: args.now + args.leaseDurationMs,
      revision: job.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: job.revision + 1 }
  },
})

export const startRun = internalMutation({
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
    assertTimestamp(args.now, 'now')
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_installation_job', (q) =>
        q.eq('installationId', args.installationId).eq('jobId', args.jobId),
      )
      .unique()
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
    if (job.leaseOwnerNodeId !== args.nodeId) {
      return { ok: false as const, reason: 'not_lease_owner' as const }
    }
    if (job.leaseExpiresAt === undefined || job.leaseExpiresAt <= args.now) {
      return { ok: false as const, reason: 'lease_expired' as const }
    }
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

export const appendRunEvent = internalMutation({
  args: {
    installationId: v.string(),
    runId: v.string(),
    eventId: v.string(),
    sequence: v.number(),
    type: runEventType,
    data: v.string(),
    expectedRunRevision: v.number(),
    now: v.number(),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      duplicate: v.boolean(),
      event: runEventValue,
      revision: v.number(),
    }),
    v.object({
      ok: v.literal(false),
      reason: v.union(
        v.literal('not_found'),
        v.literal('stale_revision'),
        v.literal('invalid_state'),
        v.literal('out_of_order'),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.runId, 'runId')
    assertId(args.eventId, 'eventId')
    assertPositiveInteger(args.sequence, 'sequence', Number.MAX_SAFE_INTEGER)
    assertEventData(args.data)
    assertTimestamp(args.now, 'now')
    const duplicate = await ctx.db
      .query('runEvents')
      .withIndex('by_installation_event', (q) =>
        q.eq('installationId', args.installationId).eq('eventId', args.eventId),
      )
      .unique()
    if (duplicate !== null) {
      if (
        duplicate.runId !== args.runId ||
        duplicate.sequence !== args.sequence ||
        duplicate.type !== args.type ||
        duplicate.data !== args.data
      ) {
        throw new Error('eventId conflicts with an existing event')
      }
      const duplicateRun = await ctx.db
        .query('runs')
        .withIndex('by_installation_run', (q) =>
          q.eq('installationId', args.installationId).eq('runId', args.runId),
        )
        .unique()
      if (duplicateRun === null)
        return { ok: false as const, reason: 'not_found' as const }
      return {
        ok: true as const,
        duplicate: true,
        event: withoutSystemFields(duplicate),
        revision: duplicateRun.revision,
      }
    }
    const run = await ctx.db
      .query('runs')
      .withIndex('by_installation_run', (q) =>
        q.eq('installationId', args.installationId).eq('runId', args.runId),
      )
      .unique()
    if (run === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (run.revision !== args.expectedRunRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (run.status !== 'running')
      return { ok: false as const, reason: 'invalid_state' as const }
    const latest = await ctx.db
      .query('runEvents')
      .withIndex('by_installation_run_sequence', (q) =>
        q.eq('installationId', args.installationId).eq('runId', args.runId),
      )
      .order('desc')
      .first()
    const expectedSequence = (latest?.sequence ?? 0) + 1
    if (args.sequence !== expectedSequence) {
      return { ok: false as const, reason: 'out_of_order' as const }
    }
    const event = {
      installationId: args.installationId,
      eventId: args.eventId,
      runId: args.runId,
      sequence: args.sequence,
      type: args.type,
      data: args.data,
      createdAt: args.now,
    }
    await ctx.db.insert('runEvents', event)
    await ctx.db.patch(run._id, { revision: run.revision + 1 })
    return {
      ok: true as const,
      duplicate: false,
      event,
      revision: run.revision + 1,
    }
  },
})

export const completeRun = internalMutation({
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
    assertTimestamp(args.now, 'now')
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_installation_job', (q) =>
        q.eq('installationId', args.installationId).eq('jobId', args.jobId),
      )
      .unique()
    const run = await ctx.db
      .query('runs')
      .withIndex('by_installation_run', (q) =>
        q.eq('installationId', args.installationId).eq('runId', args.runId),
      )
      .unique()
    if (job === null || run === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (job.status === 'succeeded' && run.status === 'succeeded') {
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
    if (job.leaseOwnerNodeId !== args.nodeId || run.nodeId !== args.nodeId) {
      return { ok: false as const, reason: 'not_lease_owner' as const }
    }
    if (job.leaseExpiresAt === undefined || job.leaseExpiresAt <= args.now) {
      return { ok: false as const, reason: 'lease_expired' as const }
    }
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
    const command = await ctx.db
      .query('commands')
      .withIndex('by_installation_command', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('commandId', job.commandId),
      )
      .unique()
    if (command?.status === 'accepted') {
      await ctx.db.patch(command._id, {
        status: 'completed',
        revision: command.revision + 1,
        updatedAt: args.now,
      })
    }
    return { ok: true as const, revision: job.revision + 1 }
  },
})

export const failRun = internalMutation({
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
    assertTimestamp(args.now, 'now')
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_installation_job', (q) =>
        q.eq('installationId', args.installationId).eq('jobId', args.jobId),
      )
      .unique()
    const run = await ctx.db
      .query('runs')
      .withIndex('by_installation_run', (q) =>
        q.eq('installationId', args.installationId).eq('runId', args.runId),
      )
      .unique()
    if (job === null || run === null)
      return { ok: false as const, reason: 'not_found' as const }
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
    if (job.leaseOwnerNodeId !== args.nodeId || run.nodeId !== args.nodeId) {
      return { ok: false as const, reason: 'not_lease_owner' as const }
    }
    if (job.leaseExpiresAt === undefined || job.leaseExpiresAt <= args.now) {
      return { ok: false as const, reason: 'lease_expired' as const }
    }
    const shouldRetry = args.retryable && job.attempt < job.maxAttempts
    await ctx.db.patch(run._id, {
      status: 'failed',
      error: args.error,
      revision: run.revision + 1,
      finishedAt: args.now,
    })
    await ctx.db.patch(job._id, {
      status: shouldRetry ? 'queued' : 'failed',
      lastError: args.error,
      leaseOwnerNodeId: undefined,
      leaseExpiresAt: undefined,
      revision: job.revision + 1,
      updatedAt: args.now,
    })
    if (!shouldRetry) {
      const command = await ctx.db
        .query('commands')
        .withIndex('by_installation_command', (q) =>
          q
            .eq('installationId', args.installationId)
            .eq('commandId', job.commandId),
        )
        .unique()
      if (command?.status === 'accepted') {
        await ctx.db.patch(command._id, {
          status: 'failed',
          revision: command.revision + 1,
          updatedAt: args.now,
        })
      }
    }
    return { ok: true as const, revision: job.revision + 1 }
  },
})

export const retryJob = internalMutation({
  args: {
    installationId: v.string(),
    jobId: v.string(),
    expectedRevision: v.number(),
    now: v.number(),
  },
  returns: transitionResult,
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.jobId, 'jobId')
    assertTimestamp(args.now, 'now')
    const job = await ctx.db
      .query('jobs')
      .withIndex('by_installation_job', (q) =>
        q.eq('installationId', args.installationId).eq('jobId', args.jobId),
      )
      .unique()
    if (job === null)
      return { ok: false as const, reason: 'not_found' as const }
    if (job.revision !== args.expectedRevision) {
      return { ok: false as const, reason: 'stale_revision' as const }
    }
    if (job.status !== 'failed')
      return { ok: false as const, reason: 'invalid_state' as const }
    if (job.attempt >= job.maxAttempts) {
      return { ok: false as const, reason: 'attempts_exhausted' as const }
    }
    await ctx.db.patch(job._id, {
      status: 'queued',
      lastError: undefined,
      revision: job.revision + 1,
      updatedAt: args.now,
    })
    return { ok: true as const, revision: job.revision + 1 }
  },
})

export const putTask = internalMutation({
  args: {
    installationId: v.string(),
    taskId: v.string(),
    idempotencyKey: v.string(),
    title: v.string(),
    status: taskStatus,
    dueAt: v.optional(v.number()),
    now: v.number(),
  },
  returns: v.object({ created: v.boolean(), task: taskValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.taskId, 'taskId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.title, 'title', 1_024)
    if (args.dueAt !== undefined) assertTimestamp(args.dueAt, 'dueAt')
    assertTimestamp(args.now, 'now')
    const existing = await ctx.db
      .query('tasks')
      .withIndex('by_installation_idempotency', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    if (existing !== null) {
      if (
        existing.taskId !== args.taskId ||
        existing.title !== args.title ||
        existing.status !== args.status ||
        existing.dueAt !== args.dueAt
      ) {
        throw new Error('idempotency key conflicts with an existing task')
      }
      return { created: false, task: withoutSystemFields(existing) }
    }
    const task = {
      installationId: args.installationId,
      taskId: args.taskId,
      idempotencyKey: args.idempotencyKey,
      title: args.title,
      status: args.status,
      dueAt: args.dueAt,
      revision: 0,
      createdAt: args.now,
      updatedAt: args.now,
    }
    await ctx.db.insert('tasks', task)
    return { created: true, task }
  },
})

export const putReminder = internalMutation({
  args: {
    installationId: v.string(),
    reminderId: v.string(),
    idempotencyKey: v.string(),
    message: v.string(),
    remindAt: v.number(),
    timezone: v.string(),
    status: reminderStatus,
    now: v.number(),
  },
  returns: v.object({ created: v.boolean(), reminder: reminderValue }),
  handler: async (ctx, args) => {
    assertId(args.installationId, 'installationId')
    assertId(args.reminderId, 'reminderId')
    assertId(args.idempotencyKey, 'idempotencyKey')
    assertBoundedString(args.message, 'message', 4_096)
    assertTimestamp(args.remindAt, 'remindAt')
    assertShortText(args.timezone, 'timezone')
    assertTimestamp(args.now, 'now')
    const existing = await ctx.db
      .query('reminders')
      .withIndex('by_installation_idempotency', (q) =>
        q
          .eq('installationId', args.installationId)
          .eq('idempotencyKey', args.idempotencyKey),
      )
      .unique()
    if (existing !== null) {
      if (
        existing.reminderId !== args.reminderId ||
        existing.message !== args.message ||
        existing.remindAt !== args.remindAt ||
        existing.timezone !== args.timezone ||
        existing.status !== args.status
      ) {
        throw new Error('idempotency key conflicts with an existing reminder')
      }
      return { created: false, reminder: withoutSystemFields(existing) }
    }
    const reminder = {
      installationId: args.installationId,
      reminderId: args.reminderId,
      idempotencyKey: args.idempotencyKey,
      message: args.message,
      remindAt: args.remindAt,
      timezone: args.timezone,
      status: args.status,
      revision: 0,
      createdAt: args.now,
      updatedAt: args.now,
    }
    await ctx.db.insert('reminders', reminder)
    return { created: true, reminder }
  },
})
