import { AGENT_CHAT_CAPABILITY } from '@kriyan/contracts'
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
})

describe('note migration and projection contracts', () => {
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
  })
})
