import { AGENT_CHAT_CAPABILITY, parseClientSnapshotWire } from '@kriyan/contracts'
import { ConvexClient } from 'convex/browser'

import { api } from '../../../convex/_generated/api'

const installationId = 'installation:oracle-r3-live'
const deployment = process.env.CONVEX_DEPLOYMENT
if (deployment === undefined || !deployment.startsWith('dev:')) throw new Error('live proof requires an explicit dev deployment')
const url = `https://${deployment.slice(4)}.convex.cloud`

function observe(client: ConvexClient) {
  const revisions: number[] = []
  let lastError: Error | undefined
  const unsubscribe = client.onUpdate(api.read.clientSnapshot, { installationId }, (value) => {
    revisions.push(parseClientSnapshotWire(value).transactionRevision)
  }, (error) => { lastError = error })
  return { revisions, unsubscribe, error: () => lastError }
}

async function waitFor(observer: ReturnType<typeof observe>, revision: number): Promise<void> {
  const deadline = Date.now() + 15_000
  while (!observer.revisions.some((value) => value >= revision)) {
    if (observer.error() !== undefined) throw observer.error()
    if (Date.now() >= deadline) throw new Error(`subscription timed out at revision ${revision}`)
    await Bun.sleep(25)
  }
}

const first = new ConvexClient(url)
const second = new ConvexClient(url)
const firstObserver = observe(first)
const secondObserver = observe(second)
await Promise.all([waitFor(firstObserver, 0), waitFor(secondObserver, 0)])

await first.mutation(api.agents.create, {
  installationId, agentId: 'agent:live', agentRevisionId: 'agent-revision:live:0',
  displayName: 'Live proof', systemPrompt: 'Execute only the requested deterministic fixture.',
  toolCapabilities: ['task.write', 'reminder.write', 'note.write', 'source.write', 'knowledge.write'],
})
await first.mutation(api.agents.createThread, { installationId, threadId: 'thread:live', agentId: 'agent:live' })
await first.mutation(api.agents.submitMessage, {
  installationId, threadId: 'thread:live', commandId: 'command:live:agent',
  messageId: 'message:live:user', idempotencyKey: 'intent:live:agent', content: 'Run live fixture', maxAttempts: 2,
})
await first.mutation(api.worker.registerNode, {
  installationId, nodeId: 'node:live', displayName: 'Live node', capabilities: [AGENT_CHAT_CAPABILITY], protocolVersion: '1',
})
const claim = await first.mutation(api.worker.claimJob, { installationId, nodeId: 'node:live', leaseDurationMs: 30_000 })
if (claim === null) throw new Error('live worker did not claim the agent job')
const started = await first.mutation(api.worker.startRun, {
  installationId, nodeId: 'node:live', jobId: claim.job.jobId,
  expectedJobRevision: claim.job.revision, expectedLeaseToken: claim.job.leaseToken,
})
if (!started.ok) throw new Error(`live worker start failed: ${started.reason}`)
const context = await first.query(api.worker_context.readExecutionContext, {
  installationId, nodeId: 'node:live', jobId: started.job.jobId,
  expectedJobRevision: started.job.revision, expectedLeaseToken: started.job.leaseToken!, maxMessages: 32,
})
if (context.agentRevision.agentRevisionId !== 'agent-revision:live:0' || context.messages.length !== 1) throw new Error('live execution context was not pinned')

let jobRevision = started.job.revision
const lease = { installationId, nodeId: 'node:live', jobId: started.job.jobId, expectedLeaseToken: started.job.leaseToken! }
const task = await first.mutation(api.worker_effects.commitTaskEffect, { ...lease, expectedJobRevision: jobRevision, effectId: 'effect:live:task', action: 'create', taskId: 'task:live', title: 'Live task', idempotencyKey: 'intent:live:task' })
if (!task.ok) throw new Error(`task effect failed: ${task.reason}`)
jobRevision = task.jobRevision
const effects = [task]
const reminder = await first.mutation(api.worker_effects.commitReminderEffect, { ...lease, expectedJobRevision: jobRevision, effectId: 'effect:live:reminder', action: 'create', reminderId: 'reminder:live', message: 'Live reminder', remindAt: Date.now() + 60_000, timezone: 'UTC', idempotencyKey: 'intent:live:reminder' })
if (!reminder.ok) throw new Error(`reminder effect failed: ${reminder.reason}`); jobRevision = reminder.jobRevision; effects.push(reminder)
const note = await first.mutation(api.worker_effects.commitNoteEffect, { ...lease, expectedJobRevision: jobRevision, effectId: 'effect:live:note', action: 'create', noteId: 'note:live', contentJson: '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Live"}]}]}', plainTextPreview: 'Live', wordCount: 1, idempotencyKey: 'intent:live:note' })
if (!note.ok) throw new Error(`note effect failed: ${note.reason}`); jobRevision = note.jobRevision; effects.push(note)
const source = await first.mutation(api.worker_effects.commitSourceEffect, { ...lease, expectedJobRevision: jobRevision, effectId: 'effect:live:source', action: 'create', sourceRefId: 'source:live', displayName: 'Live source', sourceKind: 'document', idempotencyKey: 'intent:live:source' })
if (!source.ok) throw new Error(`source effect failed: ${source.reason}`); jobRevision = source.jobRevision; effects.push(source)
const knowledge = await first.mutation(api.worker_effects.commitKnowledgeEffect, { ...lease, expectedJobRevision: jobRevision, effectId: 'effect:live:knowledge', action: 'create', knowledgeDocumentId: 'knowledge:live', title: 'Live knowledge', summary: 'Live proof', knowledgeKind: 'topic', idempotencyKey: 'intent:live:knowledge' })
if (!knowledge.ok) throw new Error(`knowledge effect failed: ${knowledge.reason}`); jobRevision = knowledge.jobRevision; effects.push(knowledge)
const duplicate = await first.mutation(api.worker_effects.commitKnowledgeEffect, { ...lease, expectedJobRevision: jobRevision, effectId: 'effect:live:knowledge', action: 'create', knowledgeDocumentId: 'knowledge:live', title: 'Live knowledge', summary: 'Live proof', knowledgeKind: 'topic', idempotencyKey: 'intent:live:knowledge' })
if (!duplicate.ok || !duplicate.duplicate) throw new Error('effect receipt replay was not idempotent')

const session = await first.mutation(api.worker.checkpointSession, { ...lease, expectedJobRevision: jobRevision, expectedSessionRevision: 0, piSessionRef: 'pi-session:live' })
if (!session.ok) throw new Error(`session checkpoint failed: ${session.reason}`); jobRevision = session.revision
const completed = await first.mutation(api.worker.completeRun, { ...lease, expectedJobRevision: jobRevision, runId: started.run.runId, expectedRunRevision: started.run.revision, assistantContent: 'Live complete' })
if (!completed.ok) throw new Error(`live run completion failed: ${completed.reason}`)

await first.mutation(api.notes.createArtifact, { installationId, artifactId: 'artifact:live', noteId: 'note:live', noteVersionId: 'note-version:note:live:0', slug: 'live' })
await first.mutation(api.knowledge.upsertRelation, { installationId, relationId: 'relation:live', fromId: 'knowledge:live', toId: 'task:live', kind: 'supports', changeId: 'change:live', confidence: 0.95 })
await first.mutation(api.knowledge.upsertProvenance, { installationId, provenanceLinkId: 'provenance:live', targetKind: 'relation', targetId: 'relation:live', sourceRefId: 'source:live', sourceVersion: '1', citation: 'Live fixture' })
await first.mutation(api.knowledge.advanceProjectionCursor, { installationId, cursorId: 'cursor:live', vaultId: 'vault:live', cursor: 1, documentHash: 'sha256:live', mode: 'verified' })
await first.mutation(api.knowledge.createCorrection, { installationId, correctionId: 'correction:live', targetKind: 'relation', targetId: 'relation:live', action: 'retract', reason: 'Live correction', actor: 'oracle', origin: 'live-proof', expectedRevision: 0 })

let snapshot = parseClientSnapshotWire(await first.query(api.read.clientSnapshot, { installationId }))
await Promise.all([waitFor(firstObserver, snapshot.transactionRevision), waitFor(secondObserver, snapshot.transactionRevision)])
if (snapshot.productivity.tasks.length !== 1 || snapshot.productivity.notes.length !== 1 || snapshot.knowledge.artifacts.length !== 1) throw new Error('live aggregate omitted committed product rows')

await first.mutation(api.projections.tombstoneTask, { installationId, taskId: 'task:live', expectedRevision: 0 })
await first.mutation(api.notes.tombstone, { installationId, noteId: 'note:live', expectedRevision: 0 })
snapshot = parseClientSnapshotWire(await first.query(api.read.clientSnapshot, { installationId }))
await Promise.all([waitFor(firstObserver, snapshot.transactionRevision), waitFor(secondObserver, snapshot.transactionRevision)])
if (snapshot.productivity.tasks.length !== 0 || snapshot.productivity.notes.length !== 0) throw new Error('live aggregate suppressed tombstones')

secondObserver.unsubscribe(); await second.close()
const reconnected = new ConvexClient(url); const reconnectObserver = observe(reconnected)
await waitFor(reconnectObserver, snapshot.transactionRevision)
const reconnectSnapshot = parseClientSnapshotWire(await reconnected.query(api.read.clientSnapshot, { installationId }))
if (reconnectSnapshot.transactionRevision !== snapshot.transactionRevision) throw new Error('reconnected client did not converge')

firstObserver.unsubscribe(); reconnectObserver.unsubscribe()
await Promise.all([first.close(), reconnected.close()])
console.log(JSON.stringify({
  ok: true,
  deployment,
  installationId,
  finalRevision: snapshot.transactionRevision,
  firstUpdates: firstObserver.revisions.length,
  secondUpdates: secondObserver.revisions.length,
  reconnectUpdates: reconnectObserver.revisions.length,
  effects: effects.length,
  idempotentReplay: duplicate.duplicate,
  taskCountAfterDelete: snapshot.productivity.tasks.length,
  noteCountAfterDelete: snapshot.productivity.notes.length,
}))
