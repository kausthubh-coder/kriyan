import {
  AGENT_CHAT_CAPABILITY,
  CANONICAL_VECTORS,
  MEMORY_CORRECTION_CAPABILITY,
  MEMORY_PROJECT_CAPABILITY,
  MEMORY_RECONCILE_CAPABILITY,
  WORKER_OPERATIONS,
  WORKER_OPERATION_VALID_INPUTS,
  canonicalContentHash,
  canonicalJson,
} from '@kriyan/contracts'
import { createWorkerContractClient, workerOperationBindings } from '../packages/convex-client/src/worker-contract'
import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const mutation = (name: string) => makeFunctionReference<'mutation', any, any>(name)
const query = (name: string) => makeFunctionReference<'query', any, any>(name)
const backend = () => convexTest(schema, modules)

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000) })
afterEach(() => vi.useRealTimers())

async function installation(t: ReturnType<typeof backend>) {
  await t.mutation(api.installations.create, { installationId: 'installation:contracts', timezone: 'UTC', protocolVersion: '1' })
}

async function activeAgentTurn(t: ReturnType<typeof backend>, suffix: string) {
  await installation(t)
  await t.mutation(mutation('agents:create'), { installationId: 'installation:contracts', agentId: `agent:${suffix}`, agentRevisionId: `agent-revision:${suffix}`, displayName: suffix, systemPrompt: 'help', toolCapabilities: [] })
  await t.mutation(mutation('agents:createThread'), { installationId: 'installation:contracts', threadId: `thread:${suffix}`, agentId: `agent:${suffix}` })
  const submission = await t.mutation(mutation('agents:submitMessage'), { installationId: 'installation:contracts', threadId: `thread:${suffix}`, commandId: `command:${suffix}`, messageId: `message:user:${suffix}`, idempotencyKey: `intent:${suffix}`, content: suffix, maxAttempts: 1 })
  const registration = await t.mutation(api.worker.registerNode, { installationId: 'installation:contracts', nodeId: `node:${suffix}`, displayName: suffix, capabilities: [AGENT_CHAT_CAPABILITY], protocolVersion: '1' })
  const claim = await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: `node:${suffix}`, leaseDurationMs: 30_000 })
  if (claim === null) throw new Error('expected claim')
  const started = await t.mutation(api.worker.startRun, { installationId: 'installation:contracts', nodeId: `node:${suffix}`, jobId: claim.job.jobId, expectedJobRevision: claim.job.revision, expectedLeaseToken: claim.job.leaseToken })
  if (!started.ok) throw new Error('expected run')
  return { registration, submission, started }
}

const fencedOperations = new Set<string>([
  'execution.context.read', 'artifact.work.read', 'note.version.read', 'memory.work.read',
  'effect.task.commit', 'effect.reminder.commit', 'effect.note.commit',
  'effect.source.commit', 'effect.knowledge.commit',
])

test('discovers compatible work beyond a 64-job mixed-capability prefix', async () => {
  const t = backend(); await installation(t)
  await t.mutation(api.worker.registerNode, { installationId: 'installation:contracts', nodeId: 'node:agent-backlog', displayName: 'Agent', capabilities: [AGENT_CHAT_CAPABILITY], protocolVersion: '1' })
  await t.run(async (ctx) => {
    for (let index = 0; index < 200; index += 1) {
      const capability = index === 199 ? AGENT_CHAT_CAPABILITY : 'unavailable.worker.v1'
      await ctx.db.insert('jobs', {
        installationId: 'installation:contracts', jobId: `job:backlog:${index.toString().padStart(3, '0')}`,
        commandId: `command:backlog:${index.toString().padStart(3, '0')}`,
        requiredCapabilities: [capability], routingCapability: capability,
        status: 'queued', attempt: 0, maxAttempts: 3, revision: 0,
        createdAt: index + 1, updatedAt: index + 1,
      })
    }
  })
  const claim = await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:agent-backlog', leaseDurationMs: 30_000 })
  expect(claim?.job.jobId).toBe('job:backlog:199')
})

test('discovers compatible work beyond 64 affinity-fenced jobs without violating affinity', async () => {
  const t = backend(); await installation(t)
  await t.mutation(api.worker.registerNode, { installationId: 'installation:contracts', nodeId: 'node:available', displayName: 'Available', capabilities: [AGENT_CHAT_CAPABILITY], protocolVersion: '1' })
  await t.run(async (ctx) => {
    for (let index = 0; index < 199; index += 1) {
      await ctx.db.insert('jobs', {
        installationId: 'installation:contracts', jobId: `job:affinity:${index.toString().padStart(3, '0')}`,
        commandId: `command:affinity:${index.toString().padStart(3, '0')}`,
        kind: 'agent.turn.v1', threadId: `thread:affinity:${index}`, turnId: `turn:affinity:${index}`,
        turnOrdinal: 1, preferredNodeId: 'node:other', requiredCapabilities: [AGENT_CHAT_CAPABILITY],
        routingCapability: AGENT_CHAT_CAPABILITY, status: 'queued', attempt: 0, maxAttempts: 3,
        revision: 0, createdAt: index + 1, updatedAt: index + 1,
      })
    }
    await ctx.db.insert('jobs', {
      installationId: 'installation:contracts', jobId: 'job:affinity:199', commandId: 'command:affinity:199',
      requiredCapabilities: [AGENT_CHAT_CAPABILITY], routingCapability: AGENT_CHAT_CAPABILITY,
      status: 'queued', attempt: 0, maxAttempts: 3, revision: 0, createdAt: 200, updatedAt: 200,
    })
  })
  const claim = await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:available', leaseDurationMs: 30_000 })
  expect(claim?.job.jobId).toBe('job:affinity:199')
})

test('preserves FIFO progress across one aggregate queue window for 64 capabilities and legacy jobs', async () => {
  const t = backend(); await installation(t)
  const capabilities = [
    'reminders',
    ...Array.from({ length: 63 }, (_, index) => `capability:${index.toString().padStart(2, '0')}`),
  ]
  await t.mutation(api.worker.registerNode, {
    installationId: 'installation:contracts', nodeId: 'node:max-capabilities', displayName: 'Max capabilities',
    capabilities, protocolVersion: '1',
  })
  await t.run(async (ctx) => {
    for (let index = 0; index < 256; index += 1) {
      const legacy = index % 31 === 0
      const capability = capabilities[index % capabilities.length]
      await ctx.db.insert('jobs', {
        installationId: 'installation:contracts',
        jobId: `job:aggregate-obstacle:${index.toString().padStart(3, '0')}`,
        commandId: `command:aggregate-obstacle:${index.toString().padStart(3, '0')}`,
        kind: 'agent.turn.v1', threadId: `thread:aggregate-obstacle:${index}`,
        turnId: `turn:aggregate-obstacle:${index}`, turnOrdinal: 1,
        preferredNodeId: 'node:other',
        requiredCapabilities: legacy ? undefined : [capability],
        routingCapability: legacy ? undefined : capability,
        status: 'queued', attempt: 0, maxAttempts: 3, revision: 0,
        createdAt: index + 1, updatedAt: index + 1,
      })
    }
    await ctx.db.insert('jobs', {
      installationId: 'installation:contracts', jobId: 'job:aggregate-compatible:legacy',
      commandId: 'command:aggregate-compatible:legacy', status: 'queued', attempt: 0,
      maxAttempts: 3, revision: 0, createdAt: 257, updatedAt: 257,
    })
    await ctx.db.insert('jobs', {
      installationId: 'installation:contracts', jobId: 'job:aggregate-compatible:routed',
      commandId: 'command:aggregate-compatible:routed',
      requiredCapabilities: [capabilities[63]], routingCapability: capabilities[63],
      status: 'queued', attempt: 0, maxAttempts: 3, revision: 0,
      createdAt: 258, updatedAt: 258,
    })
  })

  expect(await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:max-capabilities', leaseDurationMs: 30_000,
  })).toBeNull()
  const legacy = await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:max-capabilities', leaseDurationMs: 30_000,
  })
  const routed = await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:max-capabilities', leaseDurationMs: 30_000,
  })
  expect(legacy?.job.jobId).toBe('job:aggregate-compatible:legacy')
  expect(routed?.job.jobId).toBe('job:aggregate-compatible:routed')
  expect(await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:max-capabilities', leaseDurationMs: 30_000,
  })).toBeNull()
  const obstacles = await t.run(async (ctx) => await ctx.db
    .query('jobs')
    .withIndex('by_installation_status_created', (q) =>
      q.eq('installationId', 'installation:contracts').eq('status', 'queued'),
    )
    .take(256))
  expect(obstacles).toHaveLength(256)
  expect(obstacles.every((job) => job.preferredNodeId === 'node:other')).toBe(true)
})

test('continues past position 256, traverses deeper windows, and wraps to later-eligible FIFO work', async () => {
  const t = backend(); await installation(t)
  await t.mutation(api.worker.registerNode, {
    installationId: 'installation:contracts', nodeId: 'node:cursor', displayName: 'Cursor node',
    capabilities: ['reminders'], protocolVersion: '1',
  })
  await t.run(async (ctx) => {
    const now = 1_000
    await ctx.db.insert('agentThreads', {
      installationId: 'installation:contracts', threadId: 'thread:deep:000',
      agentId: 'agent:deep', agentRevisionId: 'agent-revision:deep',
      nextTurnOrdinal: 2, sessionRevision: 0, createdAt: now, updatedAt: now,
    })
    for (let index = 0; index < 512; index += 1) {
      const suffix = index.toString().padStart(3, '0')
      await ctx.db.insert('jobs', {
        installationId: 'installation:contracts', jobId: `job:deep:${suffix}`,
        commandId: `command:deep:${suffix}`, kind: 'agent.turn.v1',
        threadId: `thread:deep:${suffix}`, turnId: `turn:deep:${suffix}`, turnOrdinal: 1,
        preferredNodeId: 'node:other', requiredCapabilities: ['reminders'],
        routingCapability: 'reminders', status: 'queued', attempt: 0, maxAttempts: 3,
        revision: 0, createdAt: now + index, updatedAt: now + index,
      })
    }
    for (const [offset, label] of [[512, 'older'], [513, 'newer']] as const) {
      await ctx.db.insert('jobs', {
        installationId: 'installation:contracts', jobId: `job:deep-compatible:${label}`,
        commandId: `command:deep-compatible:${label}`, requiredCapabilities: ['reminders'],
        routingCapability: 'reminders', status: 'queued', attempt: 0, maxAttempts: 3,
        revision: 0, createdAt: now + offset, updatedAt: now + offset,
      })
    }
  })

  const poll = async () => await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:cursor', leaseDurationMs: 30_000,
  })
  expect(await poll()).toBeNull()
  expect(await poll()).toBeNull()
  expect((await poll())?.job.jobId).toBe('job:deep-compatible:older')
  expect((await poll())?.job.jobId).toBe('job:deep-compatible:newer')

  await t.run(async (ctx) => {
    const laterEligible = await ctx.db.query('jobs').withIndex('by_installation_job', (q) =>
      q.eq('installationId', 'installation:contracts').eq('jobId', 'job:deep:000')).unique()
    if (laterEligible === null) throw new Error('missing later-eligibility fixture')
    await ctx.db.patch(laterEligible._id, { preferredNodeId: undefined, revision: 1, updatedAt: 2_000 })
  })
  expect((await poll())?.job.jobId).toBe('job:deep:000')
})

test('continues past a fully blocked turn page and wraps to the oldest newly eligible turn', async () => {
  const t = backend(); await installation(t)
  await t.mutation(mutation('agents:create'), {
    installationId: 'installation:contracts', agentId: 'agent:blocked-page',
    agentRevisionId: 'agent-revision:blocked-page', displayName: 'Blocked page',
    systemPrompt: 'Head-of-line liveness', toolCapabilities: [],
  })
  await t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:blocked-page',
    agentId: 'agent:blocked-page',
  })
  await t.mutation(api.worker.registerNode, {
    installationId: 'installation:contracts', nodeId: 'node:blocked-page',
    displayName: 'Blocked page',
    capabilities: [AGENT_CHAT_CAPABILITY, MEMORY_RECONCILE_CAPABILITY], protocolVersion: '1',
  })
  for (let index = 0; index < 257; index += 1) {
    const suffix = index.toString().padStart(3, '0')
    await t.mutation(mutation('agents:submitMessage'), {
      installationId: 'installation:contracts', threadId: 'thread:blocked-page',
      commandId: `command:blocked-page:${suffix}`,
      messageId: `message:blocked-page:${suffix}`,
      idempotencyKey: `intent:blocked-page:${suffix}`,
      content: `blocked page ${suffix}`, maxAttempts: 3,
    })
  }
  vi.setSystemTime(1_001)
  const unrelated = await t.mutation(api.knowledge.enqueueReconcile, {
    installationId: 'installation:contracts', vaultId: 'vault:blocked-page-unrelated',
    manifestHash: 'sha256:blocked-page-unrelated', maxAttempts: 3,
  })
  const poll = async () => await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:blocked-page', leaseDurationMs: 30_000,
  })

  const active = await poll()
  expect(active?.job.jobId).toBe('job:command:blocked-page:000')
  expect(await poll()).toBeNull()
  expect((await poll())?.job.jobId).toBe(unrelated.job.jobId)

  const started = await t.mutation(api.worker.startRun, {
    installationId: 'installation:contracts', nodeId: 'node:blocked-page',
    jobId: active!.job.jobId, expectedJobRevision: active!.job.revision,
    expectedLeaseToken: active!.job.leaseToken,
  })
  if (!started.ok) throw new Error('expected active head run')
  expect(await t.mutation(api.worker.completeRun, {
    installationId: 'installation:contracts', nodeId: 'node:blocked-page',
    jobId: started.job.jobId, runId: started.run.runId,
    expectedJobRevision: started.job.revision,
    expectedRunRevision: started.run.revision,
    expectedLeaseToken: started.job.leaseToken,
    assistantContent: 'head complete',
  })).toMatchObject({ ok: true })

  const wrapped = await poll()
  expect(wrapped?.job.jobId).toBe('job:command:blocked-page:001')
  expect(wrapped?.job.turnOrdinal).toBe(2)
  const later = await t.run(async (ctx) => await ctx.db
    .query('jobs')
    .withIndex('by_installation_job', (q) =>
      q.eq('installationId', 'installation:contracts').eq('jobId', 'job:command:blocked-page:002'),
    )
    .unique())
  expect(later?.status).toBe('queued')
})

test('bounds thread titles and preferred node IDs before create or reset mutations', async () => {
  const t = backend(); await installation(t)
  await t.mutation(mutation('agents:create'), {
    installationId: 'installation:contracts', agentId: 'agent:bounded-thread',
    agentRevisionId: 'agent-revision:bounded-thread', displayName: 'Bounded thread',
    systemPrompt: 'Input bounds', toolCapabilities: [],
  })
  const title256 = 't'.repeat(256)
  const node128 = 'n'.repeat(128)
  const accepted = await t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:bounded-max',
    agentId: 'agent:bounded-thread', title: title256, preferredNodeId: node128,
  })
  expect(accepted).toMatchObject({ created: true, thread: { title: title256, preferredNodeId: node128 } })
  expect((await t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:bounded-max',
    agentId: 'agent:bounded-thread', title: title256, preferredNodeId: node128,
  })).created).toBe(false)
  await expect(t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:bounded-max',
    agentId: 'agent:bounded-thread', title: 'u'.repeat(256), preferredNodeId: node128,
  })).rejects.toThrow('threadId conflicts with an existing thread')
  await expect(t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:title-too-long',
    agentId: 'agent:bounded-thread', title: 't'.repeat(257),
  })).rejects.toThrow('title must contain 1-256 characters')
  await expect(t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:node-too-long',
    agentId: 'agent:bounded-thread', preferredNodeId: 'n'.repeat(129),
  })).rejects.toThrow('preferredNodeId must contain 1-128 characters')

  await t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:reset-bounds',
    agentId: 'agent:bounded-thread',
  })
  const submitted = await t.mutation(mutation('agents:submitMessage'), {
    installationId: 'installation:contracts', threadId: 'thread:reset-bounds',
    commandId: 'command:reset-bounds', messageId: 'message:reset-bounds',
    idempotencyKey: 'intent:reset-bounds', content: 'reset bounds', maxAttempts: 3,
  })
  expect(await t.mutation(mutation('agents:resetSession'), {
    installationId: 'installation:contracts', threadId: 'thread:reset-bounds',
    expectedRevision: 0, preferredNodeId: node128,
  })).toEqual({ ok: true, revision: 1 })

  const beforeRejection = await t.run(async (ctx) => ({
    thread: await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) =>
      q.eq('installationId', 'installation:contracts').eq('threadId', 'thread:reset-bounds')).unique(),
    job: await ctx.db.query('jobs').withIndex('by_installation_job', (q) =>
      q.eq('installationId', 'installation:contracts').eq('jobId', submitted.job.jobId)).unique(),
    message: await ctx.db.query('agentMessages').withIndex('by_installation_message', (q) =>
      q.eq('installationId', 'installation:contracts').eq('messageId', submitted.message.messageId)).unique(),
    rejectedThreads: await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) =>
      q.eq('installationId', 'installation:contracts')).collect(),
  }))
  expect(beforeRejection.thread).toMatchObject({ preferredNodeId: node128, sessionRevision: 1 })
  expect(beforeRejection.job).toMatchObject({ preferredNodeId: node128, sessionRevision: 1, revision: 1 })
  expect(beforeRejection.message).toMatchObject({ state: 'waiting_for_node' })
  expect(beforeRejection.rejectedThreads.some((thread) =>
    thread.threadId === 'thread:title-too-long' || thread.threadId === 'thread:node-too-long')).toBe(false)

  await expect(t.mutation(mutation('agents:resetSession'), {
    installationId: 'installation:contracts', threadId: 'thread:reset-bounds',
    expectedRevision: 1, preferredNodeId: 'n'.repeat(129),
  })).rejects.toThrow('preferredNodeId must contain 1-128 characters')
  const afterRejection = await t.run(async (ctx) => ({
    thread: await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) =>
      q.eq('installationId', 'installation:contracts').eq('threadId', 'thread:reset-bounds')).unique(),
    job: await ctx.db.query('jobs').withIndex('by_installation_job', (q) =>
      q.eq('installationId', 'installation:contracts').eq('jobId', submitted.job.jobId)).unique(),
    message: await ctx.db.query('agentMessages').withIndex('by_installation_message', (q) =>
      q.eq('installationId', 'installation:contracts').eq('messageId', submitted.message.messageId)).unique(),
  }))
  expect(afterRejection.thread).toEqual(beforeRejection.thread)
  expect(afterRejection.job).toEqual(beforeRejection.job)
  expect(afterRejection.message).toEqual(beforeRejection.message)
})

test('derives affinity waiting state before polling and activates one maximum-size message only on selection', async () => {
  const t = backend(); await installation(t)
  await t.mutation(mutation('agents:create'), {
    installationId: 'installation:contracts', agentId: 'agent:affinity-bytes',
    agentRevisionId: 'agent-revision:affinity-bytes', displayName: 'Affinity bytes',
    systemPrompt: 'help', toolCapabilities: [],
  })
  await t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:affinity-bytes',
    agentId: 'agent:affinity-bytes', preferredNodeId: 'node:affinity-owner',
  })
  const submitted = await t.mutation(mutation('agents:submitMessage'), {
    installationId: 'installation:contracts', threadId: 'thread:affinity-bytes',
    commandId: 'command:affinity-bytes', messageId: 'message:affinity-bytes',
    idempotencyKey: 'intent:affinity-bytes', content: 'x'.repeat(65_536), maxAttempts: 3,
  })
  expect(submitted.message.state).toBe('waiting_for_node')
  for (const nodeId of ['node:scanner', 'node:affinity-owner']) {
    await t.mutation(api.worker.registerNode, {
      installationId: 'installation:contracts', nodeId, displayName: nodeId,
      capabilities: [AGENT_CHAT_CAPABILITY], protocolVersion: '1',
    })
  }
  expect(await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:scanner', leaseDurationMs: 30_000,
  })).toBeNull()
  expect((await t.query(query('agents:listMessages'), {
    installationId: 'installation:contracts', threadId: 'thread:affinity-bytes',
    paginationOpts: { cursor: null, numItems: 10 },
  })).page[0]?.state).toBe('waiting_for_node')
  expect((await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:affinity-owner', leaseDurationMs: 30_000,
  }))?.job.jobId).toBe(submitted.job.jobId)
  expect((await t.query(query('agents:listMessages'), {
    installationId: 'installation:contracts', threadId: 'thread:affinity-bytes',
    paginationOpts: { cursor: null, numItems: 10 },
  })).page[0]?.state).toBe('active')
})

test('lease ordering surfaces an expired active row beyond 64 healthy non-expired rows', async () => {
  const t = backend(); await installation(t)
  for (const nodeId of ['node:active-claimant', 'node:healthy-owner']) {
    await t.mutation(api.worker.registerNode, {
      installationId: 'installation:contracts', nodeId, displayName: nodeId,
      capabilities: ['reminders'], protocolVersion: '1',
    })
  }
  await t.run(async (ctx) => {
    for (let index = 0; index < 64; index += 1) {
      await ctx.db.insert('jobs', {
        installationId: 'installation:contracts',
        jobId: `job:healthy-active:${index.toString().padStart(2, '0')}`,
        commandId: `command:healthy-active:${index.toString().padStart(2, '0')}`,
        requiredCapabilities: ['reminders'], routingCapability: 'reminders',
        status: 'running', attempt: 1, maxAttempts: 3,
        leaseOwnerNodeId: 'node:healthy-owner', leaseExpiresAt: 2_000,
        leaseToken: `lease:healthy:${index}`, revision: 1,
        createdAt: index + 1, updatedAt: index + 1,
      })
    }
    await ctx.db.insert('jobs', {
      installationId: 'installation:contracts', jobId: 'job:expired-after-64',
      commandId: 'command:expired-after-64', requiredCapabilities: ['reminders'],
      routingCapability: 'reminders', status: 'leased', attempt: 1, maxAttempts: 3,
      leaseOwnerNodeId: 'node:expired-owner', leaseExpiresAt: 999,
      leaseToken: 'lease:expired-after-64', revision: 1,
      createdAt: 100, updatedAt: 100,
    })
  })
  const claim = await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:active-claimant', leaseDurationMs: 30_000,
  })
  expect(claim?.job.jobId).toBe('job:expired-after-64')
  expect(claim?.reclaimed).toBe(true)
})

test('reclaims mixed active statuses and terminalizes one exhausted agent turn before the next FIFO job', async () => {
  const t = backend(); await installation(t)
  await t.mutation(mutation('agents:create'), {
    installationId: 'installation:contracts', agentId: 'agent:aggregate',
    agentRevisionId: 'agent-revision:aggregate', displayName: 'Aggregate',
    systemPrompt: 'help', toolCapabilities: [],
  })
  await t.mutation(mutation('agents:createThread'), {
    installationId: 'installation:contracts', threadId: 'thread:aggregate', agentId: 'agent:aggregate',
  })
  const exhausted = await t.mutation(mutation('agents:submitMessage'), {
    installationId: 'installation:contracts', threadId: 'thread:aggregate',
    commandId: 'command:aggregate-exhausted', messageId: 'message:aggregate-exhausted',
    idempotencyKey: 'intent:aggregate-exhausted', content: 'exhaust this turn', maxAttempts: 1,
  })
  await t.mutation(api.worker.registerNode, {
    installationId: 'installation:contracts', nodeId: 'node:aggregate-reclaimer', displayName: 'Reclaimer',
    capabilities: [AGENT_CHAT_CAPABILITY], protocolVersion: '1',
  })
  await t.run(async (ctx) => {
    const exhaustedJob = await ctx.db.query('jobs').withIndex('by_installation_job', (q) =>
      q.eq('installationId', 'installation:contracts').eq('jobId', exhausted.job.jobId)).unique()
    const thread = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) =>
      q.eq('installationId', 'installation:contracts').eq('threadId', 'thread:aggregate')).unique()
    const user = await ctx.db.query('agentMessages').withIndex('by_installation_turn_role', (q) =>
      q.eq('installationId', 'installation:contracts').eq('turnId', exhausted.job.turnId!).eq('role', 'user')).unique()
    if (exhaustedJob === null || thread === null || user === null) throw new Error('missing exhausted fixture')
    await ctx.db.patch(exhaustedJob._id, {
      status: 'running', attempt: 1, leaseOwnerNodeId: 'node:expired-owner',
      leaseExpiresAt: 999, leaseToken: 'lease:expired', revision: 1,
    })
    await ctx.db.patch(thread._id, { activeTurnId: exhausted.job.turnId, updatedAt: 1_000 })
    await ctx.db.patch(user._id, { state: 'active', updatedAt: 1_000 })
    await ctx.db.insert('jobs', {
      installationId: 'installation:contracts', jobId: 'job:aggregate-leased',
      commandId: 'command:aggregate-leased', requiredCapabilities: [AGENT_CHAT_CAPABILITY],
      routingCapability: AGENT_CHAT_CAPABILITY, status: 'leased', attempt: 1, maxAttempts: 3,
      leaseOwnerNodeId: 'node:expired-owner', leaseExpiresAt: 999, leaseToken: 'lease:leased',
      revision: 1, createdAt: 1_001, updatedAt: 1_001,
    })
    await ctx.db.insert('jobs', {
      installationId: 'installation:contracts', jobId: 'job:aggregate-queued',
      commandId: 'command:aggregate-queued', requiredCapabilities: [AGENT_CHAT_CAPABILITY],
      routingCapability: AGENT_CHAT_CAPABILITY, status: 'queued', attempt: 0, maxAttempts: 3,
      revision: 0, createdAt: 1_002, updatedAt: 1_002,
    })
  })

  const reclaimed = await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:aggregate-reclaimer', leaseDurationMs: 30_000,
  })
  expect(reclaimed?.job.jobId).toBe('job:aggregate-leased')
  expect(reclaimed?.reclaimed).toBe(true)
  expect((await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:aggregate-reclaimer', leaseDurationMs: 30_000,
  }))?.job.jobId).toBe('job:aggregate-queued')

  const state = await t.run(async (ctx) => ({
    job: await ctx.db.query('jobs').withIndex('by_installation_job', (q) =>
      q.eq('installationId', 'installation:contracts').eq('jobId', exhausted.job.jobId)).unique(),
    command: await ctx.db.query('commands').withIndex('by_installation_command', (q) =>
      q.eq('installationId', 'installation:contracts').eq('commandId', exhausted.command.commandId)).unique(),
    thread: await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) =>
      q.eq('installationId', 'installation:contracts').eq('threadId', 'thread:aggregate')).unique(),
    user: await ctx.db.query('agentMessages').withIndex('by_installation_turn_role', (q) =>
      q.eq('installationId', 'installation:contracts').eq('turnId', exhausted.job.turnId!).eq('role', 'user')).unique(),
  }))
  expect(state.job?.status).toBe('failed')
  expect(state.command?.status).toBe('failed')
  expect(state.thread?.activeTurnId).toBeUndefined()
  expect(state.user).toMatchObject({ state: 'failed', finalizedAt: 1_000 })
})

test('drains 64 maximum-Unicode exhausted turns in bounded atomic batches before later work', async () => {
  const t = backend(); await installation(t)
  await t.mutation(mutation('agents:create'), {
    installationId: 'installation:contracts', agentId: 'agent:unicode-exhaustion',
    agentRevisionId: 'agent-revision:unicode-exhaustion', displayName: 'Unicode exhaustion',
    systemPrompt: 'Bounded terminalization', toolCapabilities: [],
  })
  await t.mutation(api.worker.registerNode, {
    installationId: 'installation:contracts', nodeId: 'node:unicode-exhaustion',
    displayName: 'Unicode exhaustion',
    capabilities: [AGENT_CHAT_CAPABILITY, MEMORY_RECONCILE_CAPABILITY], protocolVersion: '1',
  })

  const content = '漢'.repeat(65_536)
  const submissions = []
  for (let index = 0; index < 64; index += 1) {
    const suffix = index.toString().padStart(2, '0')
    await t.mutation(mutation('agents:createThread'), {
      installationId: 'installation:contracts', threadId: `thread:unicode-exhaustion:${suffix}`,
      agentId: 'agent:unicode-exhaustion',
    })
    submissions.push(await t.mutation(mutation('agents:submitMessage'), {
      installationId: 'installation:contracts', threadId: `thread:unicode-exhaustion:${suffix}`,
      commandId: `command:unicode-exhaustion:${suffix}`,
      messageId: `message:unicode-exhaustion:${suffix}`,
      idempotencyKey: `intent:unicode-exhaustion:${suffix}`,
      content, maxAttempts: 1,
    }))
  }

  for (const submission of submissions) {
    const claim = await t.mutation(api.worker.claimJob, {
      installationId: 'installation:contracts', nodeId: 'node:unicode-exhaustion',
      leaseDurationMs: 30_000,
    })
    expect(claim?.job.jobId).toBe(submission.job.jobId)
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation:contracts', nodeId: 'node:unicode-exhaustion',
      jobId: claim!.job.jobId, expectedJobRevision: claim!.job.revision,
      expectedLeaseToken: claim!.job.leaseToken,
    })
    expect(started).toMatchObject({ ok: true, created: true, job: { status: 'running' }, run: { status: 'running' } })
  }

  vi.setSystemTime(2_000)
  const later = await t.mutation(api.knowledge.enqueueReconcile, {
    installationId: 'installation:contracts', vaultId: 'vault:after-unicode-exhaustion',
    manifestHash: 'sha256:after-unicode-exhaustion', maxAttempts: 3,
  })
  vi.setSystemTime(31_001)
  const snapshotBeforeDrain = await t.run(async (ctx) => await ctx.db
    .query('installations')
    .withIndex('by_installation_id', (q) => q.eq('installationId', 'installation:contracts'))
    .unique())

  const readStates = async () => await t.run(async (ctx) => await Promise.all(
    submissions.map(async (submission) => {
      const job = await ctx.db.query('jobs').withIndex('by_installation_job', (q) =>
        q.eq('installationId', 'installation:contracts').eq('jobId', submission.job.jobId)).unique()
      const command = await ctx.db.query('commands').withIndex('by_installation_command', (q) =>
        q.eq('installationId', 'installation:contracts').eq('commandId', submission.command.commandId)).unique()
      const message = await ctx.db.query('agentMessages').withIndex('by_installation_turn_role', (q) =>
        q.eq('installationId', 'installation:contracts').eq('turnId', submission.job.turnId!).eq('role', 'user')).unique()
      const run = await ctx.db.query('runs').withIndex('by_installation_job_attempt', (q) =>
        q.eq('installationId', 'installation:contracts').eq('jobId', submission.job.jobId).eq('attempt', 1)).unique()
      const thread = await ctx.db.query('agentThreads').withIndex('by_installation_thread', (q) =>
        q.eq('installationId', 'installation:contracts').eq('threadId', submission.job.threadId!)).unique()
      return {
        job: job === null ? null : {
          status: job.status, attempt: job.attempt, lastError: job.lastError,
          leaseOwnerNodeId: job.leaseOwnerNodeId, leaseExpiresAt: job.leaseExpiresAt,
        },
        command: command === null ? null : { status: command.status },
        message: message === null ? null : { state: message.state, finalizedAt: message.finalizedAt },
        run: run === null ? null : { status: run.status, error: run.error, finishedAt: run.finishedAt },
        thread: thread === null ? null : { activeTurnId: thread.activeTurnId },
      }
    }),
  ))

  for (let poll = 1; poll <= 8; poll += 1) {
    expect(await t.mutation(api.worker.claimJob, {
      installationId: 'installation:contracts', nodeId: 'node:unicode-exhaustion',
      leaseDurationMs: 30_000,
    })).toBeNull()
    const states = await readStates()
    const processed = poll * 8
    expect(states.filter((state) => state.job?.status === 'failed')).toHaveLength(processed)
    for (const [index, state] of states.entries()) {
      if (index < processed) {
        expect(state).toEqual({
          job: {
            status: 'failed', attempt: 1, lastError: 'attempts exhausted',
            leaseOwnerNodeId: undefined, leaseExpiresAt: undefined,
          },
          command: { status: 'failed' },
          message: { state: 'failed', finalizedAt: 31_001 },
          run: { status: 'failed', error: 'attempts exhausted', finishedAt: 31_001 },
          thread: { activeTurnId: undefined },
        })
      } else {
        expect(state).toMatchObject({
          job: {
            status: 'running', attempt: 1,
            leaseOwnerNodeId: 'node:unicode-exhaustion', leaseExpiresAt: 31_000,
          },
          command: { status: 'accepted' },
          message: { state: 'active' },
          run: { status: 'running' },
        })
        expect(state.job?.lastError).toBeUndefined()
        expect(state.message?.finalizedAt).toBeUndefined()
        expect(state.run?.error).toBeUndefined()
        expect(state.run?.finishedAt).toBeUndefined()
        expect(state.thread?.activeTurnId).toBe(submissions[index]!.job.turnId)
      }
    }
    const afterPoll = await t.run(async (ctx) => ({
      installation: await ctx.db
        .query('installations')
        .withIndex('by_installation_id', (q) => q.eq('installationId', 'installation:contracts'))
        .unique(),
      claimCursors: (await ctx.db.query('projectionCursors').collect()).filter((cursor) =>
        cursor.installationId === 'installation:contracts'
        && cursor.mode === 'worker-claim-v1'
        && cursor.vaultId === 'node:unicode-exhaustion'),
    }))
    expect(afterPoll.installation?.snapshotRevision).toBe((snapshotBeforeDrain?.snapshotRevision ?? 0) + poll)
    if (poll % 2 === 1) {
      expect(afterPoll.claimCursors).toMatchObject([{ pageCursor: later.job.jobId }])
    } else {
      expect(afterPoll.claimCursors).toHaveLength(0)
    }
  }

  const claimedLater = await t.mutation(api.worker.claimJob, {
    installationId: 'installation:contracts', nodeId: 'node:unicode-exhaustion',
    leaseDurationMs: 30_000,
  })
  expect(claimedLater?.job.jobId).toBe(later.job.jobId)
  expect(claimedLater?.reclaimed).toBe(false)
}, 120_000)

test('Memory project, reconcile, and correction jobs are deterministic, discoverable, and executable', async () => {
  const t = backend(); await installation(t)
  await t.mutation(api.knowledge.upsertSourceRef, {
    installationId: 'installation:contracts', sourceRefId: 'source:memory', idempotencyKey: 'source:memory',
    kind: 'document', displayName: 'Memory source', syncState: 'synced', indexState: 'indexed', provenanceIds: [],
  })
  const projectInput = { installationId: 'installation:contracts', sourceRefId: 'source:memory', sourceVersion: 'sha256:source', maxAttempts: 3 }
  const project = await t.mutation(api.knowledge.enqueueProject, projectInput)
  expect(await t.mutation(api.knowledge.enqueueProject, projectInput)).toEqual({ ...project, created: false })
  const reconcileInput = { installationId: 'installation:contracts', vaultId: 'vault:memory', manifestHash: 'sha256:manifest', maxAttempts: 3 }
  const reconcile = await t.mutation(api.knowledge.enqueueReconcile, reconcileInput)
  expect(await t.mutation(api.knowledge.enqueueReconcile, reconcileInput)).toEqual({ ...reconcile, created: false })
  const correctionInput = {
    installationId: 'installation:contracts', correctionId: 'correction:memory', targetKind: 'entity', targetId: 'entity:memory',
    action: 'retract' as const, reason: 'Owner correction', actor: 'owner', origin: 'client', expectedRevision: 0,
  }
  const correction = await t.mutation(api.knowledge.createCorrection, correctionInput)
  expect(await t.mutation(api.knowledge.createCorrection, correctionInput)).toEqual({ ...correction, created: false })
  expect(new Set([project.job.routingCapability, reconcile.job.routingCapability, correction.job.routingCapability])).toEqual(
    new Set([MEMORY_PROJECT_CAPABILITY, MEMORY_RECONCILE_CAPABILITY, MEMORY_CORRECTION_CAPABILITY]),
  )

  await t.mutation(api.worker.registerNode, {
    installationId: 'installation:contracts', nodeId: 'node:memory', displayName: 'Memory',
    capabilities: [MEMORY_PROJECT_CAPABILITY, MEMORY_RECONCILE_CAPABILITY, MEMORY_CORRECTION_CAPABILITY], protocolVersion: '1',
  })
  const completedKinds = new Set<string>()
  for (let index = 0; index < 3; index += 1) {
    const claim = await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:memory', leaseDurationMs: 30_000 })
    expect(claim).not.toBeNull()
    const started = await t.mutation(api.worker.startRun, {
      installationId: 'installation:contracts', nodeId: 'node:memory', jobId: claim!.job.jobId,
      expectedJobRevision: claim!.job.revision, expectedLeaseToken: claim!.job.leaseToken,
    })
    if (!started.ok) throw new Error('expected Memory run')
    const work = await t.query(query('worker_context:readMemoryWork'), {
      installationId: 'installation:contracts', nodeId: 'node:memory', jobId: started.job.jobId,
      expectedJobRevision: started.job.revision, expectedLeaseToken: started.job.leaseToken,
    })
    completedKinds.add(work.kind)
    expect(await t.mutation(api.worker.completeRun, {
      installationId: 'installation:contracts', nodeId: 'node:memory', jobId: started.job.jobId,
      runId: started.run.runId, expectedJobRevision: started.job.revision,
      expectedRunRevision: started.run.revision, expectedLeaseToken: started.job.leaseToken,
    })).toMatchObject({ ok: true })
  }
  expect(completedKinds).toEqual(new Set(['project', 'reconcile', 'correction']))
  expect(await t.mutation(api.knowledge.applyCorrection, { installationId: 'installation:contracts', correctionId: 'correction:memory', appliedRevision: 1 })).toEqual({ ok: true, revision: 1 })
  expect(await t.mutation(api.knowledge.restoreCorrection, { installationId: 'installation:contracts', correctionId: 'correction:memory', appliedRevision: 2 })).toEqual({ ok: true, revision: 2 })
  expect(await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:memory', leaseDurationMs: 30_000 })).toBeNull()
})

async function seedFencedOperation(t: ReturnType<typeof backend>, operation: string): Promise<void> {
  await installation(t)
  await t.run(async (ctx) => {
    const now = 1_000
    const kind = operation === 'artifact.work.read' ? 'artifact.materialize.v1'
      : operation === 'memory.work.read' ? 'memory.project.v1' : 'agent.turn.v1'
    const input = operation === 'artifact.work.read'
      ? JSON.stringify({ action: 'materialize', artifactId: 'artifact:one', noteId: 'note:one', noteVersionId: 'version:missing', expectedArtifactRevision: 0, slug: 'one', projectedPath: 'artifacts/one.md' })
      : operation === 'memory.work.read' ? JSON.stringify({ kind: 'project' }) : 'work'
    await ctx.db.insert('nodes', { installationId: 'installation:contracts', nodeId: 'node:one', displayName: 'Node', capabilities: ['agent.chat.v1'], protocolVersion: '1', status: 'online', lastHeartbeatAt: now, revision: 0, createdAt: now, updatedAt: now })
    await ctx.db.insert('commands', { installationId: 'installation:contracts', commandId: 'command:fenced', idempotencyKey: 'intent:fenced', input, kind, agentRevisionId: 'agent-revision:one', status: 'accepted', revision: 0, createdAt: now, updatedAt: now })
    await ctx.db.insert('jobs', { installationId: 'installation:contracts', jobId: 'job:missing', commandId: 'command:fenced', kind, threadId: 'thread:one', agentRevisionId: 'agent-revision:one', requiredCapabilities: ['agent.chat.v1'], status: 'leased', attempt: 1, maxAttempts: 3, leaseToken: 'lease:one', leaseOwnerNodeId: 'node:one', leaseExpiresAt: 31_000, revision: 0, createdAt: now, updatedAt: now })
    await ctx.db.insert('agentRevisions', { installationId: 'installation:contracts', agentRevisionId: 'agent-revision:one', agentId: 'agent:one', ordinal: 1, displayName: 'Agent', systemPrompt: 'Help', toolCapabilities: ['task.write'], createdAt: now })
    await ctx.db.insert('agentThreads', { installationId: 'installation:contracts', threadId: 'thread:one', agentId: 'agent:one', agentRevisionId: 'agent-revision:one', nextTurnOrdinal: 1, sessionRevision: 0, createdAt: now, updatedAt: now })
    await ctx.db.insert('noteVersions', { installationId: 'installation:contracts', noteVersionId: 'version:missing', noteId: 'note:one', version: 0, contentJson: '{"type":"doc"}', contentHash: canonicalContentHash('{"type":"doc"}'), plainTextPreview: '', wordCount: 0, authorOrigin: 'fixture', createdAt: now })
    if (operation === 'artifact.work.read') await ctx.db.insert('artifacts', { installationId: 'installation:contracts', artifactId: 'artifact:one', noteId: 'note:one', noteVersionId: 'version:missing', slug: 'one', projectionState: 'pending', revision: 0, createdAt: now, updatedAt: now })
    if (operation === 'effect.task.commit') await ctx.db.insert('tasks', { installationId: 'installation:contracts', taskId: 'task:one', idempotencyKey: 'task:one', title: 'One', tags: [], status: 'open', revision: 0, createdAt: now, updatedAt: now })
    if (operation === 'effect.reminder.commit') await ctx.db.insert('reminders', { installationId: 'installation:contracts', reminderId: 'reminder:one', idempotencyKey: 'reminder:one', message: 'One', remindAt: 10, timezone: 'UTC', deliveryPolicy: 'normal', status: 'scheduled', scheduleKey: 'reminder:one', fireCount: 0, revision: 0, createdAt: now, updatedAt: now })
    if (operation === 'effect.note.commit') await ctx.db.insert('notes', { installationId: 'installation:contracts', noteId: 'note:one', idempotencyKey: 'note:one', contentJson: '{"type":"doc"}', plainTextPreview: '', wordCount: 0, tags: [], revision: 0, createdAt: now, updatedAt: now })
    if (operation === 'effect.source.commit') await ctx.db.insert('sourceRefs', { installationId: 'installation:contracts', sourceRefId: 'source:one', idempotencyKey: 'source:one', kind: 'other', displayName: 'One', syncState: 'pending', indexState: 'pending', provenanceIds: [], revision: 0, createdAt: now, updatedAt: now })
    if (operation === 'effect.knowledge.commit') await ctx.db.insert('knowledgeDocuments', { installationId: 'installation:contracts', knowledgeDocumentId: 'knowledge:one', idempotencyKey: 'knowledge:one', kind: 'other', title: 'One', summary: '', tags: [], sourceRefIds: [], provenanceIds: [], syncState: 'pending', indexState: 'pending', revision: 0, createdAt: now, updatedAt: now })
  })
}

describe('agent turn contract', () => {
  test('pins revisions, deduplicates submission, and enforces capability FIFO finalization', async () => {
    const t = backend(); await installation(t)
    await t.mutation(mutation('agents:create'), { installationId: 'installation:contracts', agentId: 'agent:one', agentRevisionId: 'agent-revision:0', displayName: 'One', systemPrompt: 'help', toolCapabilities: [] })
    await t.mutation(mutation('agents:createThread'), { installationId: 'installation:contracts', threadId: 'thread:one', agentId: 'agent:one', preferredNodeId: 'node:agent' })
    const firstInput = { installationId: 'installation:contracts', threadId: 'thread:one', commandId: 'command:turn:1', messageId: 'message:user:1', idempotencyKey: 'turn-intent:1', content: 'first', maxAttempts: 3 }
    const first = await t.mutation(mutation('agents:submitMessage'), firstInput)
    expect((await t.mutation(mutation('agents:submitMessage'), firstInput)).created).toBe(false)
    await t.mutation(mutation('agents:revise'), { installationId: 'installation:contracts', agentId: 'agent:one', agentRevisionId: 'agent-revision:1', expectedRevision: 0, displayName: 'One v2', systemPrompt: 'help better', toolCapabilities: [] })
    const second = await t.mutation(mutation('agents:submitMessage'), { ...firstInput, commandId: 'command:turn:2', messageId: 'message:user:2', idempotencyKey: 'turn-intent:2', content: 'second' })
    expect(first.job).toMatchObject({ turnOrdinal: 1, agentRevisionId: 'agent-revision:0', requiredCapabilities: [AGENT_CHAT_CAPABILITY] })
    expect(second.job).toMatchObject({ turnOrdinal: 2, agentRevisionId: 'agent-revision:1' })

    await t.mutation(api.worker.registerNode, { installationId: 'installation:contracts', nodeId: 'node:legacy', displayName: 'Legacy', capabilities: ['reminders'], protocolVersion: '1' })
    await t.mutation(api.worker.registerNode, { installationId: 'installation:contracts', nodeId: 'node:agent', displayName: 'Agent', capabilities: [AGENT_CHAT_CAPABILITY], protocolVersion: '1' })
    await expect(t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:legacy', leaseDurationMs: 30_000 })).rejects.toThrow('missing_capability')
    const claim = await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:agent', leaseDurationMs: 30_000 })
    expect(claim?.job.turnOrdinal).toBe(1)
    expect(await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:agent', leaseDurationMs: 30_000 })).toBeNull()
    const started = await t.mutation(api.worker.startRun, { installationId: 'installation:contracts', nodeId: 'node:agent', jobId: claim!.job.jobId, expectedJobRevision: claim!.job.revision, expectedLeaseToken: claim!.job.leaseToken })
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error('expected run')
    expect(await t.mutation(api.worker.completeRun, { installationId: 'installation:contracts', nodeId: 'node:agent', jobId: started.job.jobId, runId: started.run.runId, expectedJobRevision: started.job.revision, expectedRunRevision: started.run.revision, expectedLeaseToken: started.job.leaseToken, assistantContent: 'done' })).toEqual({ ok: true, revision: 3 })
    const messages = await t.query(query('agents:listMessages'), { installationId: 'installation:contracts', threadId: 'thread:one', paginationOpts: { cursor: null, numItems: 100 } })
    expect(messages.page.filter((item: any) => item.role === 'assistant')).toEqual([expect.objectContaining({ messageId: 'message:thread:one:1:assistant', content: 'done' })])
    expect((await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:agent', leaseDurationMs: 30_000 }))?.job.turnOrdinal).toBe(2)
    const snapshot = await t.query(api.read.clientSnapshot, { installationId: 'installation:contracts' })
    expect(snapshot.agents.messages).toHaveLength(3)
  })

  test('rejects changed replays and deterministic message ID collisions', async () => {
    const t = backend(); await installation(t)
    await t.mutation(mutation('agents:create'), { installationId: 'installation:contracts', agentId: 'agent:one', agentRevisionId: 'agent-revision:0', displayName: 'One', systemPrompt: 'help', toolCapabilities: [] })
    await t.mutation(mutation('agents:createThread'), { installationId: 'installation:contracts', threadId: 'thread:one', agentId: 'agent:one' })
    const input = { installationId: 'installation:contracts', threadId: 'thread:one', commandId: 'command:one', messageId: 'message:user:one', idempotencyKey: 'intent:one', content: 'hello', maxAttempts: 3 }
    await t.mutation(mutation('agents:submitMessage'), input)
    for (const changed of [
      { ...input, commandId: 'command:changed' },
      { ...input, messageId: 'message:user:changed' },
      { ...input, maxAttempts: 2 },
      { ...input, content: 'changed' },
    ]) await expect(t.mutation(mutation('agents:submitMessage'), changed)).rejects.toThrow('idempotency key conflicts')
    await expect(t.mutation(mutation('agents:submitMessage'), { ...input, commandId: 'command:two', idempotencyKey: 'intent:two', messageId: 'message:thread:one:2:assistant' })).rejects.toThrow('reserved')
  })

  test('fences queued turns to a checkpointed session node and terminal recovery unblocks FIFO', async () => {
    const t = backend(); await installation(t)
    await t.mutation(mutation('agents:create'), { installationId: 'installation:contracts', agentId: 'agent:one', agentRevisionId: 'agent-revision:0', displayName: 'One', systemPrompt: 'help', toolCapabilities: [] })
    await t.mutation(mutation('agents:createThread'), { installationId: 'installation:contracts', threadId: 'thread:one', agentId: 'agent:one' })
    const base = { installationId: 'installation:contracts', threadId: 'thread:one', content: 'turn', maxAttempts: 1 }
    await t.mutation(mutation('agents:submitMessage'), { ...base, commandId: 'command:one', messageId: 'message:user:one', idempotencyKey: 'intent:one' })
    await t.mutation(mutation('agents:submitMessage'), { ...base, commandId: 'command:two', messageId: 'message:user:two', idempotencyKey: 'intent:two' })
    for (const nodeId of ['node:a', 'node:b']) await t.mutation(api.worker.registerNode, { installationId: 'installation:contracts', nodeId, displayName: nodeId, capabilities: [AGENT_CHAT_CAPABILITY], protocolVersion: '1' })
    const first = await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:a', leaseDurationMs: 30_000 })
    const started = await t.mutation(api.worker.startRun, { installationId: 'installation:contracts', nodeId: 'node:a', jobId: first!.job.jobId, expectedJobRevision: first!.job.revision, expectedLeaseToken: first!.job.leaseToken })
    if (!started.ok) throw new Error('expected run')
    expect(await t.mutation(api.worker.checkpointSession, { installationId: 'installation:contracts', nodeId: 'node:a', jobId: started.job.jobId, expectedJobRevision: started.job.revision, expectedLeaseToken: started.job.leaseToken, piSessionRef: 'session-one' })).toEqual({ ok: true, revision: 3 })
    expect(await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:b', leaseDurationMs: 30_000 })).toBeNull()
    vi.setSystemTime(31_001)
    expect((await t.mutation(api.worker.claimJob, { installationId: 'installation:contracts', nodeId: 'node:a', leaseDurationMs: 30_000 }))?.job.turnOrdinal).toBe(2)
    const messages = await t.query(query('agents:listMessages'), { installationId: 'installation:contracts', threadId: 'thread:one', paginationOpts: { cursor: null, numItems: 100 } })
    expect(messages.page.find((item: any) => item.turnOrdinal === 1 && item.role === 'user')?.state).toBe('failed')
  })

  test('centralizes active-turn clearing for cancel, terminal failure, and node revocation', async () => {
    const cancelled = backend()
    const cancelledTurn = await activeAgentTurn(cancelled, 'cancel')
    expect(await cancelled.mutation(api.commands.cancel, { installationId: 'installation:contracts', commandId: cancelledTurn.submission.command.commandId, expectedRevision: 0 })).toEqual({ ok: true, revision: 1 })
    expect((await cancelled.query(query('agents:listThreads'), { installationId: 'installation:contracts', paginationOpts: { cursor: null, numItems: 10 } })).page[0].activeTurnId).toBeUndefined()

    const failed = backend()
    const failedTurn = await activeAgentTurn(failed, 'failure')
    expect((await failed.mutation(api.worker.failRun, { installationId: 'installation:contracts', jobId: failedTurn.started.job.jobId, runId: failedTurn.started.run.runId, nodeId: 'node:failure', error: 'terminal', retryable: false, expectedJobRevision: failedTurn.started.job.revision, expectedRunRevision: failedTurn.started.run.revision, expectedLeaseToken: failedTurn.started.job.leaseToken })).ok).toBe(true)
    expect((await failed.query(query('agents:listThreads'), { installationId: 'installation:contracts', paginationOpts: { cursor: null, numItems: 10 } })).page[0].activeTurnId).toBeUndefined()

    const revoked = backend()
    const revokedTurn = await activeAgentTurn(revoked, 'revoke')
    expect(await revoked.mutation(internal.worker.revokeNode, { installationId: 'installation:contracts', nodeId: 'node:revoke', expectedRevision: revokedTurn.registration.node.revision })).toMatchObject({ ok: true, releasedWork: 1, cleanupPending: false })
    expect((await revoked.query(query('agents:listThreads'), { installationId: 'installation:contracts', paginationOpts: { cursor: null, numItems: 10 } })).page[0].activeTurnId).toBeUndefined()
    const messages = await revoked.query(query('agents:listMessages'), { installationId: 'installation:contracts', threadId: 'thread:revoke', paginationOpts: { cursor: null, numItems: 10 } })
    expect(messages.page.find((item: any) => item.role === 'user')?.state).toBe('failed')
  })
})

describe('frozen worker operation conformance', () => {
  test('runs every valid binding through convexTest and rejects invalid validator shapes', async () => {
    const t = backend(); await installation(t)
    for (const operation of WORKER_OPERATIONS) {
      const operationBackend = fencedOperations.has(operation) ? backend() : t
      if (fencedOperations.has(operation)) await seedFencedOperation(operationBackend, operation)
      if (operation === 'memory.project.enqueue' || operation.startsWith('memory.source-') || operation === 'memory.reversible-change.record' || operation === 'memory.fact.upsert') {
        await operationBackend.run(async (ctx) => {
          const existing = await ctx.db.query('sourceRefs').withIndex('by_installation_source', (q) => q
            .eq('installationId', 'installation:contracts').eq('sourceRefId', 'source:one')).unique()
          if (existing === null) await ctx.db.insert('sourceRefs', {
            installationId: 'installation:contracts', sourceRefId: 'source:one',
            idempotencyKey: 'source:one', kind: 'other', displayName: 'One',
            syncState: 'pending', indexState: 'pending', provenanceIds: [],
            revision: 0, createdAt: 1_000, updatedAt: 1_000,
          })
        })
      }
      const binding = workerOperationBindings[operation]
      const input = WORKER_OPERATION_VALID_INPUTS[operation]
      const invalid = { ...input, unexpected: true }
      const invalidCall = binding.kind === 'query'
        ? operationBackend.query(binding.reference as never, invalid as never)
        : operationBackend.mutation(binding.reference as never, invalid as never)
      await expect(invalidCall, operation).rejects.toThrow()
      if (binding.kind === 'query') await operationBackend.query(binding.reference as never, input as never)
      else await operationBackend.mutation(binding.reference as never, input as never)
    }
  })

  test('executes all four projection families idempotently through only the worker contract client', async () => {
    const t = backend(); await installation(t)
    for (const sourceRefId of ['source:one', 'source:two']) {
      await t.mutation(api.knowledge.upsertSourceRef, {
        installationId: 'installation:contracts', sourceRefId, idempotencyKey: sourceRefId,
        kind: 'document', displayName: sourceRefId, syncState: 'synced', indexState: 'indexed', provenanceIds: [],
      })
    }
    const client = createWorkerContractClient({
      mutation: (reference: never, input: never) => t.mutation(reference, input),
      query: (reference: never, input: never) => t.query(reference, input),
    } as never)
    const excerpt = WORKER_OPERATION_VALID_INPUTS['memory.source-excerpt.upsert']
    const extraction = WORKER_OPERATION_VALID_INPUTS['memory.source-extraction.upsert']
    const change = {
      ...WORKER_OPERATION_VALID_INPUTS['memory.reversible-change.record'],
      sourceRefIds: ['source:one', 'source:two'],
    }
    const fact = WORKER_OPERATION_VALID_INPUTS['memory.fact.upsert']
    expect(await client.upsertSourceExcerpt(excerpt)).toEqual({ created: true })
    expect(await client.upsertSourceExcerpt(excerpt)).toEqual({ created: false })
    expect(await client.upsertSourceExtraction(extraction)).toEqual({ created: true })
    expect(await client.upsertSourceExtraction(extraction)).toEqual({ created: false })
    const recorded = await client.recordReversibleChange(change)
    expect(recorded).toMatchObject({ created: true, change: { sourceRefIds: ['source:one', 'source:two'] } })
    expect(await client.recordReversibleChange(change)).toEqual({ ...recorded, created: false })
    expect(await client.upsertMemoryFact(fact)).toEqual({ ok: true, created: true, revision: 0 })
    expect(await client.upsertMemoryFact(fact)).toEqual({ ok: true, created: false, revision: 0 })
  })

  test('uses the shared canonical corpus inside the Convex harness', async () => {
    const t = backend()
    await t.run(async () => {
      for (const vector of CANONICAL_VECTORS) {
        expect(canonicalJson(vector.value), vector.name).toBe(vector.canonical)
        expect(canonicalContentHash(JSON.stringify(vector.value))).toMatch(/^sha256:[0-9a-f]{64}$/)
      }
    })
  })
})

describe('bounded reactive and detail authority', () => {
  test('marks row 101 off-window while paginated display authority remains lossless', async () => {
    const t = backend(); await installation(t)
    await t.run(async (ctx) => {
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert('tasks', {
          installationId: 'installation:contracts', taskId: `task:window:${index.toString().padStart(3, '0')}`,
          idempotencyKey: `task:window:${index}`, title: `Task ${index}`, tags: [], status: 'open',
          revision: 0, createdAt: index + 1, updatedAt: index + 1,
        })
      }
    })
    const snapshot = await t.query(api.read.clientSnapshot, { installationId: 'installation:contracts' })
    expect(snapshot.productivity.tasks).toHaveLength(100)
    expect(snapshot.windows.tasks).toEqual({ limit: 100, returned: 100, truncated: true })
    const first = await t.query(api.projections.listTasks, {
      installationId: 'installation:contracts', paginationOpts: { cursor: null, numItems: 100 },
    })
    const second = await t.query(api.projections.listTasks, {
      installationId: 'installation:contracts', paginationOpts: { cursor: first.continueCursor, numItems: 100 },
    })
    expect([...first.page, ...second.page]).toHaveLength(101)
    expect([...first.page, ...second.page].some((item) => item.taskId === 'task:window:100')).toBe(true)
  })

  test('serves bounded note, artifact, source, Memory, and task provenance details with reversible changes', async () => {
    const t = backend(); await installation(t)
    await t.mutation(api.notes.create, {
      installationId: 'installation:contracts', noteId: 'note:detail', idempotencyKey: 'note:detail',
      title: 'Detail', contentJson: '{"type":"doc"}', plainTextPreview: 'Detail', wordCount: 1, tags: [],
    })
    await t.mutation(api.notes.createLink, {
      installationId: 'installation:contracts', noteLinkId: 'note-link:detail', idempotencyKey: 'note-link:detail',
      noteId: 'note:detail', targetKind: 'task', targetId: 'task:detail', relation: 'supports', provenanceIds: ['provenance:detail'],
    })
    await t.mutation(api.notes.createArtifact, {
      installationId: 'installation:contracts', artifactId: 'artifact:detail', noteId: 'note:detail',
      noteVersionId: 'note-version:note:detail:0', slug: 'detail',
    })
    expect(await t.mutation(api.notes.completeMaterialization, {
      installationId: 'installation:contracts', artifactId: 'artifact:detail', noteVersionId: 'note-version:note:detail:0',
      expectedRevision: 0, projectedHash: 'sha256:detail', projectedPath: 'artifacts/detail.md',
    })).toEqual({ ok: true, revision: 1 })
    await t.mutation(api.notes.update, {
      installationId: 'installation:contracts', noteId: 'note:detail', expectedRevision: 0,
      contentJson: '{"type":"doc","content":[]}', plainTextPreview: 'Updated', wordCount: 1,
    })
    const noteHistory = await t.query(api.notes.getHistory, { installationId: 'installation:contracts', noteId: 'note:detail', limit: 10 })
    expect(noteHistory?.versions.map((item) => item.version)).toEqual([1, 0])
    expect(noteHistory?.links).toHaveLength(1)
    const artifact = await t.query(api.notes.getArtifact, { installationId: 'installation:contracts', artifactId: 'artifact:detail', historyLimit: 10, includeDeleted: true })
    expect(artifact?.artifact).toMatchObject({ revision: 2, projectionState: 'pending', priorProjectedHash: 'sha256:detail' })
    expect(artifact?.history.map((item) => item.state)).toEqual(['pending', 'projected', 'pending'])

    await t.mutation(api.knowledge.upsertSourceRef, {
      installationId: 'installation:contracts', sourceRefId: 'source:detail', idempotencyKey: 'source:detail',
      kind: 'document', displayName: 'Detail source', syncState: 'synced', indexState: 'indexed', provenanceIds: [],
    })
    for (let index = 0; index < 2; index += 1) {
      await t.mutation(api.knowledge.upsertSourceExcerpt, {
        installationId: 'installation:contracts', excerptId: `excerpt:${index}`, sourceRefId: 'source:detail',
        text: `Excerpt ${index}`, startOffset: index * 10, endOffset: index * 10 + 9,
      })
      await t.mutation(api.knowledge.upsertSourceExtraction, {
        installationId: 'installation:contracts', extractionId: `extraction:${index}`, sourceRefId: 'source:detail',
        kind: 'entity', label: `Entity ${index}`, value: `Value ${index}`, confidence: 0.9, provenanceIds: [`excerpt:${index}`],
      })
    }
    await t.mutation(api.projections.createTask, {
      installationId: 'installation:contracts', taskId: 'task:detail', idempotencyKey: 'task:detail',
      title: 'Before', tags: [], status: 'open',
    })
    await t.mutation(api.projections.updateTask, {
      installationId: 'installation:contracts', taskId: 'task:detail', expectedRevision: 0, title: 'After',
    })
    await t.mutation(api.knowledge.recordReversibleChange, {
      installationId: 'installation:contracts', changeId: 'change:detail', targetKind: 'task', targetId: 'task:detail',
      action: 'update', summary: 'Generated title', origin: 'memory.project.v1', sourceRefIds: ['source:detail'],
      provenanceIds: ['provenance:detail'], beforeRevision: 0, afterRevision: 1, reversible: true,
      revertPayload: JSON.stringify({ title: 'Before' }),
    })
    const sourceDetail = await t.query(api.knowledge.getSourceDetail, {
      installationId: 'installation:contracts', sourceRefId: 'source:detail', excerpts: 1, extractions: 1, derivedChanges: 1,
    })
    expect(sourceDetail).toMatchObject({ excerptsTruncated: true, extractionsTruncated: true, derivedChangesTruncated: false })
    expect(sourceDetail?.derivedChanges[0]).toMatchObject({ changeId: 'change:detail', reversible: true })

    await t.mutation(api.knowledge.upsertKnowledgeDocument, {
      installationId: 'installation:contracts', knowledgeDocumentId: 'entity:detail', idempotencyKey: 'entity:detail',
      kind: 'person', title: 'Detail entity', summary: 'Detail entity summary', tags: [], sourceRefIds: ['source:detail'],
      provenanceIds: ['provenance:detail'], syncState: 'synced', indexState: 'indexed',
    })
    await t.mutation(api.knowledge.upsertMemoryFact, {
      installationId: 'installation:contracts', factId: 'fact:detail', entityId: 'entity:detail',
      predicate: 'timezone', value: 'UTC', confidence: 1, sourceRefIds: ['source:detail'], provenanceIds: ['provenance:fact'],
    })
    await t.mutation(api.knowledge.upsertRelation, {
      installationId: 'installation:contracts', relationId: 'relation:detail', fromId: 'entity:detail', toId: 'entity:other',
      kind: 'related', changeId: 'change:detail', confidence: 0.8,
    })
    await t.mutation(api.knowledge.upsertProvenance, {
      installationId: 'installation:contracts', provenanceLinkId: 'provenance:relation', targetKind: 'relation',
      targetId: 'relation:detail', sourceRefId: 'source:detail', sourceVersion: '1', citation: 'Excerpt 0',
    })
    await t.mutation(api.knowledge.createCorrection, {
      installationId: 'installation:contracts', correctionId: 'correction:detail', targetKind: 'fact', targetId: 'fact:detail',
      action: 'replace', replacement: 'America/New_York', reason: 'Owner correction', actor: 'owner', origin: 'client', expectedRevision: 0,
    })
    expect(await t.query(api.knowledge.getMemoryEntity, { installationId: 'installation:contracts', entityId: 'entity:detail', limit: 10 })).toMatchObject({
      facts: [{ factId: 'fact:detail' }], relations: [{ relationId: 'relation:detail' }],
      provenance: [{ provenanceLinkId: 'provenance:relation' }], corrections: [{ correctionId: 'correction:detail' }],
    })
    expect(await t.query(api.knowledge.getTaskProvenance, { installationId: 'installation:contracts', taskId: 'task:detail', limit: 10 })).toMatchObject({
      task: { title: 'After' }, origin: 'memory.project.v1', sources: [{ sourceRefId: 'source:detail' }],
      changes: [{ changeId: 'change:detail' }],
    })
    expect(await t.mutation(api.knowledge.revertChange, {
      installationId: 'installation:contracts', changeId: 'change:detail', expectedRevision: 1,
    })).toMatchObject({ ok: true, change: { revertedAt: 1_000 } })
    expect(await t.query(api.projections.getTask, { installationId: 'installation:contracts', taskId: 'task:detail' })).toMatchObject({ title: 'Before', revision: 2 })
  })

  test('normalizes multi-source changes without duplicates and cleans associations child-first', async () => {
    const t = backend(); await installation(t)
    for (const sourceRefId of ['source:primary', 'source:secondary']) {
      await t.mutation(api.knowledge.upsertSourceRef, {
        installationId: 'installation:contracts', sourceRefId, idempotencyKey: sourceRefId,
        kind: 'document', displayName: sourceRefId, syncState: 'synced', indexState: 'indexed', provenanceIds: [],
      })
    }
    await t.mutation(api.projections.createTask, {
      installationId: 'installation:contracts', taskId: 'task:multi-source',
      idempotencyKey: 'task:multi-source', title: 'After', tags: [], status: 'open',
    })
    const base = {
      installationId: 'installation:contracts', targetKind: 'task', targetId: 'task:multi-source',
      action: 'update', summary: 'Multi-source update', origin: 'memory.project.v1',
      sourceRefIds: ['source:primary', 'source:secondary'], provenanceIds: [],
      beforeRevision: 0, afterRevision: 0, reversible: true,
      revertPayload: JSON.stringify({ title: 'Before' }),
    }
    for (const [index, changeId] of ['change:multi:one', 'change:multi:two'].entries()) {
      vi.setSystemTime(1_000 + index)
      expect((await t.mutation(api.knowledge.recordReversibleChange, { ...base, changeId })).created).toBe(true)
      expect((await t.mutation(api.knowledge.recordReversibleChange, { ...base, changeId })).created).toBe(false)
    }
    const primary = await t.query(api.knowledge.getSourceDetail, {
      installationId: 'installation:contracts', sourceRefId: 'source:primary', excerpts: 1, extractions: 1, derivedChanges: 1,
    })
    const secondary = await t.query(api.knowledge.getSourceDetail, {
      installationId: 'installation:contracts', sourceRefId: 'source:secondary', excerpts: 1, extractions: 1, derivedChanges: 1,
    })
    expect(primary).toMatchObject({ derivedChangesTruncated: true, derivedChanges: [{ changeId: 'change:multi:two' }] })
    expect(secondary).toMatchObject({ derivedChangesTruncated: true, derivedChanges: [{ changeId: 'change:multi:two' }] })
    const listed = await t.query(api.knowledge.listDerivedChanges, {
      installationId: 'installation:contracts', sourceRefId: 'source:secondary', limit: 10,
    })
    expect(listed.map((change) => change.changeId)).toEqual(['change:multi:two', 'change:multi:one'])
    expect(new Set(listed.map((change) => change.changeId)).size).toBe(2)
    vi.setSystemTime(2_000)
    expect(await t.mutation(api.knowledge.revertChange, {
      installationId: 'installation:contracts', changeId: 'change:multi:one', expectedRevision: 0,
    })).toMatchObject({ ok: true, change: { revertedAt: 2_000 } })
    expect((await t.query(api.knowledge.listDerivedChanges, {
      installationId: 'installation:contracts', sourceRefId: 'source:secondary', limit: 10,
    })).find((change) => change.changeId === 'change:multi:one')?.revertedAt).toBe(2_000)

    vi.stubEnv('KRIYAN_DEV_DEPLOYMENT', 'pastel-tern-722')
    let deleted = 0
    let done = false
    while (!done) {
      const result = await t.mutation(internal.dev.resetInstallation, {
        deploymentName: 'pastel-tern-722', installationId: 'installation:contracts',
        confirmation: 'RESET_KRIYAN_DEV', batchSize: 64,
      })
      deleted += result.deleted
      done = result.done
    }
    expect(deleted).toBeGreaterThan(0)
    expect(await t.mutation(internal.dev.resetInstallation, {
      deploymentName: 'pastel-tern-722', installationId: 'installation:contracts',
      confirmation: 'RESET_KRIYAN_DEV', batchSize: 64,
    })).toEqual({ deleted: 0, processedTable: null, nextTable: null, done: true })
  })
})

describe('note migration and projection contracts', () => {
  test('resumes multi-page d41 migration, verifies manifests, cuts over, and rolls back without mutation', async () => {
    const t = backend(); await installation(t)
    await t.run(async (ctx) => {
      for (const [index, deleted] of [[1, false], [2, true], [3, false]] as const) await ctx.db.insert('notes', {
        installationId: 'installation:contracts', noteId: `note:legacy:${index}`, idempotencyKey: `legacy:${index}`,
        contentJson: `{"type":"doc","content":[{"type":"text","text":"${index}"}]}`,
        plainTextPreview: `${index}`, wordCount: 1, tags: [], revision: index,
        createdAt: index, updatedAt: index + 10, deletedAt: deleted ? 99 : undefined,
      })
      await ctx.db.insert('reminders', { installationId: 'installation:contracts', reminderId: 'reminder:legacy', idempotencyKey: 'reminder:legacy', message: 'Legacy', remindAt: 10, timezone: 'UTC', deliveryPolicy: 'normal', status: 'scheduled', scheduleKey: 'legacy', fireCount: 0, revision: 0, createdAt: 1, updatedAt: 1 })
      await ctx.db.insert('commands', { installationId: 'installation:contracts', commandId: 'command:legacy', idempotencyKey: 'command:legacy', input: 'legacy reminder', status: 'accepted', revision: 0, createdAt: 1, updatedAt: 1 })
      await ctx.db.insert('jobs', { installationId: 'installation:contracts', jobId: 'job:command:legacy', commandId: 'command:legacy', status: 'queued', attempt: 0, maxAttempts: 3, revision: 0, createdAt: 1, updatedAt: 1 })
    })
    await t.mutation(api.knowledge.upsertSourceRef, { installationId: 'installation:contracts', sourceRefId: 'source:legacy', idempotencyKey: 'source:legacy', kind: 'document', displayName: 'Legacy', syncState: 'synced', indexState: 'indexed', provenanceIds: ['capture:legacy'] })
    await t.mutation(api.knowledge.upsertKnowledgeDocument, { installationId: 'installation:contracts', knowledgeDocumentId: 'knowledge:legacy', idempotencyKey: 'knowledge:legacy', kind: 'topic', title: 'Legacy', summary: 'Summary', tags: [], sourceRefIds: ['source:legacy'], provenanceIds: ['source:legacy'], syncState: 'synced', indexState: 'indexed' })
    const before = await t.query(api.knowledge.migrationManifest, { installationId: 'installation:contracts' })

    let noteCursor: string | null = null
    do {
      const page = await t.mutation(api.notes.backfillLegacyVersions, { installationId: 'installation:contracts', cursor: noteCursor, numItems: 1 })
      expect((await t.mutation(api.notes.backfillLegacyVersions, { installationId: 'installation:contracts', cursor: noteCursor, numItems: 1 })).created).toBe(0)
      noteCursor = page.isDone ? null : page.continueCursor
      if (page.isDone) break
    } while (true)
    expect(await t.query(api.notes.verifyBackfill, { installationId: 'installation:contracts' })).toMatchObject({ notes: 3, versionZero: 3, complete: true, cursorVerified: true })
    await t.mutation(api.notes.create, { installationId: 'installation:contracts', noteId: 'note:during-cutover', idempotencyKey: 'note:during-cutover', contentJson: '{"type":"doc"}', plainTextPreview: '', wordCount: 0, tags: [] })
    expect(await t.mutation(api.notes.setCompatibilityMode, { installationId: 'installation:contracts', mode: 'canonical', expectedManifestHash: before.aggregateHash })).toMatchObject({ ok: false, mode: 'canonical', reason: 'manifest_mismatch' })

    for (const phase of ['source', 'knowledge'] as const) {
      let cursor: string | null = null
      do {
        const page = await t.mutation(api.knowledge.backfillLegacyProjections, { installationId: 'installation:contracts', phase, cursor, numItems: 1 })
        expect((await t.mutation(api.knowledge.backfillLegacyProjections, { installationId: 'installation:contracts', phase, cursor, numItems: 1 })).provenanceCreated).toBe(0)
        cursor = page.isDone ? null : page.continueCursor
        if (page.isDone) break
      } while (true)
    }
    const after = await t.query(api.knowledge.migrationManifest, { installationId: 'installation:contracts' })
    expect(after.tables.find((item) => item.table === 'sourceRefs')?.hash).toBe(before.tables.find((item) => item.table === 'sourceRefs')?.hash)
    expect(after.tables.find((item) => item.table === 'knowledgeDocuments')?.hash).toBe(before.tables.find((item) => item.table === 'knowledgeDocuments')?.hash)
    expect(await t.mutation(api.notes.setCompatibilityMode, { installationId: 'installation:contracts', mode: 'canonical', expectedManifestHash: after.aggregateHash })).toMatchObject({ ok: true, mode: 'canonical', manifestHash: after.aggregateHash })
    const canonicalManifest = await t.query(api.knowledge.migrationManifest, { installationId: 'installation:contracts' })
    expect(await t.mutation(api.notes.setCompatibilityMode, { installationId: 'installation:contracts', mode: 'rollback', expectedManifestHash: canonicalManifest.aggregateHash })).toMatchObject({ ok: true, mode: 'rollback', manifestHash: canonicalManifest.aggregateHash })
    await expect(t.mutation(api.notes.update, { installationId: 'installation:contracts', noteId: 'note:legacy:1', expectedRevision: 1, title: 'blocked' })).rejects.toThrow('writers are disabled')
    const preserved = await t.run(async (ctx) => ({
      notes: (await ctx.db.query('notes').withIndex('by_installation_note', (q) => q.eq('installationId', 'installation:contracts')).collect()).filter((note) => note.noteId.startsWith('note:legacy')).map((note) => ({ id: note.noteId, revision: note.revision, deletedAt: note.deletedAt, currentVersionId: note.currentVersionId })),
      reminder: await ctx.db.query('reminders').withIndex('by_installation_reminder', (q) => q.eq('installationId', 'installation:contracts').eq('reminderId', 'reminder:legacy')).unique(),
      command: await ctx.db.query('commands').withIndex('by_installation_command', (q) => q.eq('installationId', 'installation:contracts').eq('commandId', 'command:legacy')).unique(),
    }))
    expect(preserved.notes).toEqual([
      { id: 'note:legacy:1', revision: 1, deletedAt: undefined, currentVersionId: undefined },
      { id: 'note:legacy:2', revision: 2, deletedAt: 99, currentVersionId: undefined },
      { id: 'note:legacy:3', revision: 3, deletedAt: undefined, currentVersionId: undefined },
    ])
    expect(preserved.reminder?.revision).toBe(0)
    expect(preserved.command?.status).toBe('accepted')
  })

  test('backfills version zero idempotently and rolls reads back non-destructively', async () => {
    const t = backend(); await installation(t)
    await t.run(async (ctx) => { await ctx.db.insert('notes', { installationId: 'installation:contracts', noteId: 'note:legacy', idempotencyKey: 'legacy', contentJson: '{"type":"doc","content":[]}', plainTextPreview: '', wordCount: 0, tags: [], revision: 7, createdAt: 100, updatedAt: 200 }) })
    const first = await t.mutation(api.notes.backfillLegacyVersions, { installationId: 'installation:contracts', cursor: null, numItems: 10 })
    const replay = await t.mutation(api.notes.backfillLegacyVersions, { installationId: 'installation:contracts', cursor: null, numItems: 10 })
    expect(first.created).toBe(1); expect(replay.created).toBe(0)
    expect(await t.query(api.notes.verifyBackfill, { installationId: 'installation:contracts' })).toMatchObject({ notes: 1, versionZero: 1, complete: true, compatibilityMode: 'dual-read' })
    const manifest = await t.query(api.knowledge.migrationManifest, { installationId: 'installation:contracts' })
    expect(await t.mutation(api.notes.setCompatibilityMode, { installationId: 'installation:contracts', mode: 'rollback', expectedManifestHash: manifest.aggregateHash })).toMatchObject({ ok: true, mode: 'rollback', manifestHash: manifest.aggregateHash })
    expect((await t.query(api.notes.get, { installationId: 'installation:contracts', noteId: 'note:legacy' }))?.revision).toBe(7)
  })

  test('protects artifact materialization with note-version CAS', async () => {
    const t = backend(); await installation(t)
    const note = await t.mutation(api.notes.create, { installationId: 'installation:contracts', noteId: 'note:new', idempotencyKey: 'note:new', contentJson: '{"type":"doc","content":[]}', plainTextPreview: '', wordCount: 0, tags: [] })
    const artifact = await t.mutation(api.notes.createArtifact, { installationId: 'installation:contracts', artifactId: 'artifact:one', noteId: note.note.noteId, noteVersionId: note.note.currentVersionId!, slug: 'one' })
    expect(await t.mutation(api.notes.completeMaterialization, { installationId: 'installation:contracts', artifactId: 'artifact:one', noteVersionId: note.note.currentVersionId!, expectedRevision: artifact.artifact.revision, projectedHash: 'hash:one', projectedPath: 'artifacts/one.md' })).toEqual({ ok: true, revision: 1 })
    expect(await t.mutation(api.notes.completeMaterialization, { installationId: 'installation:contracts', artifactId: 'artifact:one', noteVersionId: note.note.currentVersionId!, expectedRevision: 0, projectedHash: 'hash:stale', projectedPath: 'artifacts/one.md' })).toEqual({ ok: false, reason: 'stale_revision' })
  })

  test('supports note links, artifact advance/rename/tombstone, and fail-closed replays', async () => {
    const t = backend(); await installation(t)
    const note = await t.mutation(api.notes.create, { installationId: 'installation:contracts', noteId: 'note:new', idempotencyKey: 'note:new', contentJson: '{"type":"doc"}', plainTextPreview: '', wordCount: 0, tags: [] })
    const linkInput = { installationId: 'installation:contracts', noteLinkId: 'link:one', idempotencyKey: 'link:intent:one', noteId: 'note:new', targetKind: 'source', targetId: 'source:one', relation: 'cites', provenanceIds: ['capture:one'] }
    expect((await t.mutation(api.notes.createLink, linkInput)).created).toBe(true)
    expect((await t.mutation(api.notes.createLink, linkInput)).created).toBe(false)
    await expect(t.mutation(api.notes.createLink, { ...linkInput, targetId: 'source:changed' })).rejects.toThrow('conflicts')
    expect(await t.mutation(api.notes.tombstoneLink, { installationId: 'installation:contracts', noteLinkId: 'link:one', expectedRevision: 0 })).toEqual({ ok: true, revision: 1 })

    const artifactInput = { installationId: 'installation:contracts', artifactId: 'artifact:one', noteId: 'note:new', noteVersionId: note.note.currentVersionId!, slug: 'one' }
    const artifact = await t.mutation(api.notes.createArtifact, artifactInput)
    expect((await t.mutation(api.notes.createArtifact, artifactInput)).created).toBe(false)
    await expect(t.mutation(api.notes.createArtifact, { ...artifactInput, slug: 'changed' })).rejects.toThrow('conflicts')
    await expect(t.mutation(api.notes.createArtifact, { ...artifactInput, artifactId: 'artifact:collision' })).rejects.toThrow('artifact slug conflicts')
    expect(await t.mutation(api.notes.completeMaterialization, { installationId: 'installation:contracts', artifactId: 'artifact:one', noteVersionId: note.note.currentVersionId!, expectedRevision: artifact.artifact.revision, projectedHash: 'hash:one', projectedPath: 'artifacts/one.md' })).toEqual({ ok: true, revision: 1 })
    const updated = await t.mutation(api.notes.update, { installationId: 'installation:contracts', noteId: 'note:new', expectedRevision: 0, contentJson: '{"type":"doc","content":[]}', plainTextPreview: 'updated', wordCount: 1 })
    expect(updated).toEqual({ ok: true, revision: 1 })
    const versionId = 'note-version:note:new:1'
    expect(await t.mutation(api.notes.completeMaterialization, { installationId: 'installation:contracts', artifactId: 'artifact:one', noteVersionId: versionId, expectedRevision: 2, expectedPriorHash: 'hash:one', projectedHash: 'hash:two', projectedPath: 'artifacts/one.md' })).toEqual({ ok: true, revision: 3 })
    expect(await t.mutation(api.notes.advanceArtifact, { installationId: 'installation:contracts', artifactId: 'artifact:one', noteVersionId: versionId, slug: 'renamed', expectedRevision: 3, expectedProjectedHash: 'hash:two' })).toEqual({ ok: true, revision: 4 })
    expect(await t.mutation(api.notes.completeMaterialization, { installationId: 'installation:contracts', artifactId: 'artifact:one', noteVersionId: versionId, expectedRevision: 4, expectedPriorHash: 'hash:two', projectedHash: 'hash:three', projectedPath: 'artifacts/renamed.md' })).toEqual({ ok: true, revision: 5 })
    expect(await t.mutation(api.notes.tombstoneMaterialization, { installationId: 'installation:contracts', artifactId: 'artifact:one', noteVersionId: versionId, expectedRevision: 5, expectedProjectedHash: 'hash:three' })).toEqual({ ok: true, revision: 6 })
  })

  test('replays projection backfill and keeps correction history reversible', async () => {
    const t = backend(); await installation(t)
    await t.mutation(api.knowledge.upsertSourceRef, { installationId: 'installation:contracts', sourceRefId: 'source:one', idempotencyKey: 'source:one', kind: 'document', displayName: 'One', syncState: 'synced', indexState: 'indexed', provenanceIds: ['capture:one'] })
    await t.mutation(api.knowledge.upsertKnowledgeDocument, { installationId: 'installation:contracts', knowledgeDocumentId: 'knowledge:one', idempotencyKey: 'knowledge:one', kind: 'topic', title: 'One', summary: 'Summary', tags: [], sourceRefIds: ['source:one'], provenanceIds: ['source:one'], syncState: 'synced', indexState: 'indexed' })
    for (const phase of ['source', 'knowledge'] as const) {
      expect((await t.mutation(api.knowledge.backfillLegacyProjections, { installationId: 'installation:contracts', phase, cursor: null, numItems: 10 })).isDone).toBe(true)
      expect((await t.mutation(api.knowledge.backfillLegacyProjections, { installationId: 'installation:contracts', phase, cursor: null, numItems: 10 })).provenanceCreated).toBe(0)
    }
    expect(await t.query(api.knowledge.verifyProjectionBackfill, { installationId: 'installation:contracts' })).toMatchObject({ sources: 1, knowledge: 1, provenanceLinks: 2, sourceCursorVerified: true, knowledgeCursorVerified: true })
    const correction = await t.mutation(api.knowledge.createCorrection, { installationId: 'installation:contracts', correctionId: 'correction:one', targetKind: 'relation', targetId: 'relation:one', action: 'retract', reason: 'wrong', actor: 'owner', origin: 'client', expectedRevision: 0 })
    expect(correction.created).toBe(true)
    expect(await t.mutation(api.knowledge.applyCorrection, { installationId: 'installation:contracts', correctionId: 'correction:one', appliedRevision: 1 })).toEqual({ ok: true, revision: 1 })
    expect(await t.mutation(api.knowledge.restoreCorrection, { installationId: 'installation:contracts', correctionId: 'correction:one', appliedRevision: 2 })).toEqual({ ok: true, revision: 2 })
    const replacement = await t.mutation(api.knowledge.createCorrection, { installationId: 'installation:contracts', correctionId: 'correction:replace', targetKind: 'knowledge', targetId: 'knowledge:one', action: 'replace', replacement: 'knowledge:replacement', reason: 'superseded', actor: 'owner', origin: 'client', expectedRevision: 0 })
    expect(replacement.correction.replacement).toBe('knowledge:replacement')
    expect(await t.mutation(api.knowledge.conflictCorrection, { installationId: 'installation:contracts', correctionId: 'correction:replace', conflict: 'replacement target missing' })).toEqual({ ok: true, revision: 0 })
    expect(await t.mutation(api.knowledge.conflictCorrection, { installationId: 'installation:contracts', correctionId: 'correction:replace', conflict: 'replacement target missing' })).toEqual({ ok: true, revision: 0 })
  })

  test('reconciles missing Memory documents/provenance and overlays corrections without resurrection', async () => {
    const t = backend(); await installation(t)
    for (const id of ['one', 'two']) {
      await t.mutation(api.knowledge.upsertSourceRef, { installationId: 'installation:contracts', sourceRefId: `source:${id}`, idempotencyKey: `source:${id}`, kind: 'document', displayName: id, syncState: 'synced', indexState: 'indexed', provenanceIds: [] })
      await t.mutation(api.knowledge.upsertKnowledgeDocument, { installationId: 'installation:contracts', knowledgeDocumentId: `knowledge:${id}`, idempotencyKey: `knowledge:${id}`, kind: 'topic', title: id, summary: id, tags: [], sourceRefIds: [`source:${id}`], provenanceIds: [], syncState: 'synced', indexState: 'indexed' })
      await t.mutation(api.knowledge.upsertProvenance, { installationId: 'installation:contracts', provenanceLinkId: `provenance:${id}`, targetKind: 'knowledge', targetId: `knowledge:${id}`, sourceRefId: `source:${id}`, sourceVersion: '1', citation: id })
    }
    await t.mutation(api.knowledge.upsertRelation, { installationId: 'installation:contracts', relationId: 'relation:one', fromId: 'knowledge:one', toId: 'knowledge:two', kind: 'related', changeId: 'change:one', confidence: 1 })
    const correctionInput = { installationId: 'installation:contracts', correctionId: 'correction:one', targetKind: 'relation', targetId: 'relation:one', action: 'retract' as const, reason: 'wrong', actor: 'owner', origin: 'client', expectedRevision: 0 }
    await t.mutation(api.knowledge.createCorrection, correctionInput)
    await expect(t.mutation(api.knowledge.createCorrection, { ...correctionInput, reason: 'changed' })).rejects.toThrow('conflicts')
    await t.mutation(api.knowledge.applyCorrection, { installationId: 'installation:contracts', correctionId: 'correction:one', appliedRevision: 1 })
    expect(await t.mutation(api.knowledge.upsertRelation, { installationId: 'installation:contracts', relationId: 'relation:one', fromId: 'knowledge:one', toId: 'knowledge:two', kind: 'related', changeId: 'change:replay', confidence: 1, expectedRevision: 0 })).toEqual({ ok: false, reason: 'invalid_state' })
    const input = { installationId: 'installation:contracts', vaultId: 'vault:one', cursorId: 'reconcile:one', cursor: 1, knowledgeDocumentIds: ['knowledge:one'], provenanceLinkIds: ['provenance:one'], manifestHash: 'manifest:one' }
    expect(await t.mutation(api.knowledge.reconcileManifest, input)).toEqual({ ok: true, tombstonedDocuments: 1, tombstonedProvenance: 1, reappliedCorrections: 1, cursorRevision: 0 })
    expect(await t.mutation(api.knowledge.reconcileManifest, input)).toEqual({ ok: true, tombstonedDocuments: 0, tombstonedProvenance: 0, reappliedCorrections: 0, cursorRevision: 0 })
    expect((await t.query(api.knowledge.getKnowledgeDocument, { installationId: 'installation:contracts', knowledgeDocumentId: 'knowledge:two', includeDeleted: true }))?.deletedAt).toBeDefined()
    expect(await t.mutation(api.knowledge.restoreCorrection, { installationId: 'installation:contracts', correctionId: 'correction:one', appliedRevision: 2 })).toEqual({ ok: true, revision: 2 })
    expect(await t.mutation(api.knowledge.upsertRelation, { installationId: 'installation:contracts', relationId: 'relation:one', fromId: 'knowledge:one', toId: 'knowledge:two', kind: 'related', changeId: 'change:new', confidence: 0.9, expectedRevision: 1 })).toEqual({ ok: true, created: false, revision: 2 })
  })
})
