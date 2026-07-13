import {
  AGENT_CHAT_CAPABILITY,
  CANONICAL_VECTORS,
  WORKER_OPERATIONS,
  WORKER_OPERATION_VALID_INPUTS,
  canonicalContentHash,
  canonicalJson,
} from '@kriyan/contracts'
import { workerOperationBindings } from '../packages/convex-client/src/worker-contract'
import { convexTest } from 'convex-test'
import { makeFunctionReference } from 'convex/server'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
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
    expect(await t.mutation(api.worker.finalizeAssistantRun, { installationId: 'installation:contracts', nodeId: 'node:agent', jobId: started.job.jobId, runId: started.run.runId, expectedJobRevision: started.job.revision, expectedRunRevision: started.run.revision, expectedLeaseToken: started.job.leaseToken, assistantContent: 'done' })).toEqual({ ok: true, revision: 3 })
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
    expect(await revoked.mutation(api.worker.revokeNode, { installationId: 'installation:contracts', nodeId: 'node:revoke', expectedRevision: revokedTurn.registration.node.revision })).toMatchObject({ ok: true, releasedWork: 1, cleanupPending: false })
    expect((await revoked.query(query('agents:listThreads'), { installationId: 'installation:contracts', paginationOpts: { cursor: null, numItems: 10 } })).page[0].activeTurnId).toBeUndefined()
    const messages = await revoked.query(query('agents:listMessages'), { installationId: 'installation:contracts', threadId: 'thread:revoke', paginationOpts: { cursor: null, numItems: 10 } })
    expect(messages.page.find((item: any) => item.role === 'user')?.state).toBe('failed')
  })
})

describe('frozen worker operation conformance', () => {
  test('runs every valid binding through convexTest and rejects invalid validator shapes', async () => {
    const t = backend(); await installation(t)
    for (const operation of WORKER_OPERATIONS) {
      const binding = workerOperationBindings[operation]
      const input = WORKER_OPERATION_VALID_INPUTS[operation]
      const invalid = { ...input, unexpected: true }
      const invalidCall = binding.kind === 'query'
        ? t.query(binding.reference as never, invalid as never)
        : t.mutation(binding.reference as never, invalid as never)
      await expect(invalidCall, operation).rejects.toThrow()
      if (binding.kind === 'query') await t.query(binding.reference as never, input as never)
      else await t.mutation(binding.reference as never, input as never)
    }
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
    expect(await t.mutation(api.notes.setCompatibilityMode, { installationId: 'installation:contracts', mode: 'canonical' })).toEqual({ ok: false, mode: 'canonical' })

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
    expect(after.sourceHash).toBe(before.sourceHash)
    expect(after.knowledgeHash).toBe(before.knowledgeHash)
    expect(await t.mutation(api.notes.setCompatibilityMode, { installationId: 'installation:contracts', mode: 'canonical' })).toEqual({ ok: true, mode: 'canonical' })
    expect(await t.mutation(api.notes.setCompatibilityMode, { installationId: 'installation:contracts', mode: 'rollback' })).toEqual({ ok: true, mode: 'rollback' })
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
    expect(await t.mutation(api.notes.setCompatibilityMode, { installationId: 'installation:contracts', mode: 'rollback' })).toEqual({ ok: true, mode: 'rollback' })
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
