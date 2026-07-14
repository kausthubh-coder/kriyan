import type { WorkerOperationInputMap, WorkerOperationResultMap } from './worker-operations'

const installationId = 'installation:contracts'
const lease = { expectedLeaseToken: 'lease:one' }

/** Deterministic valid DTOs shared by compile-time, runtime, and Convex-harness conformance. */
export const WORKER_OPERATION_VALID_INPUTS = {
  'node.register': { installationId, nodeId: 'node:one', displayName: 'Node', capabilities: ['agent.chat.v1'], protocolVersion: '1' },
  'node.heartbeat': { installationId, nodeId: 'node:one', expectedRevision: 0 },
  'command.read': { installationId, commandId: 'command:missing' },
  'job.claim': { installationId, nodeId: 'node:one', leaseDurationMs: 30_000 },
  'job.lease.renew': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedRevision: 0, ...lease, leaseDurationMs: 30_000 },
  'run.start': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, ...lease },
  'run.events.append': { installationId, jobId: 'job:missing', runId: 'run:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedRunRevision: 0, ...lease, events: [{ eventId: 'event:one', sequence: 1, type: 'status', data: 'ok' }] },
  'effect.checkpoint': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, ...lease, checkpoint: 'effect:one' },
  'session.checkpoint': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, ...lease, piSessionRef: 'session-one' },
  'run.complete': { installationId, jobId: 'job:missing', runId: 'run:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedRunRevision: 0, ...lease },
  'run.fail': { installationId, jobId: 'job:missing', runId: 'run:missing', nodeId: 'node:one', error: 'failed', retryable: false, expectedJobRevision: 0, expectedRunRevision: 0, ...lease },
  'run.cancel': { installationId, commandId: 'command:missing', expectedRevision: 0 },
  'thread.session.reset': { installationId, threadId: 'thread:missing', expectedRevision: 0 },
  'execution.context.read': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one', maxMessages: 32 },
  'artifact.work.read': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one' },
  'note.version.read': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one', noteVersionId: 'version:missing' },
  'memory.work.read': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one' },
  'effect.task.commit': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one', effectId: 'effect:task', action: 'complete', taskId: 'task:one', expectedTargetRevision: 0 },
  'effect.reminder.commit': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one', effectId: 'effect:reminder', action: 'acknowledge', reminderId: 'reminder:one', expectedTargetRevision: 0 },
  'effect.note.commit': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one', effectId: 'effect:note', action: 'archive', noteId: 'note:one', expectedTargetRevision: 0 },
  'effect.source.commit': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one', effectId: 'effect:source', action: 'tombstone', sourceRefId: 'source:one', expectedTargetRevision: 0 },
  'effect.knowledge.commit': { installationId, jobId: 'job:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedLeaseToken: 'lease:one', effectId: 'effect:knowledge', action: 'tombstone', knowledgeDocumentId: 'knowledge:one', expectedTargetRevision: 0 },
  'assistant.finalize': { installationId, jobId: 'job:missing', runId: 'run:missing', nodeId: 'node:one', expectedJobRevision: 0, expectedRunRevision: 0, ...lease },
  'artifact.materialization.complete': { installationId, artifactId: 'artifact:missing', noteVersionId: 'version:missing', expectedRevision: 0, projectedHash: 'sha256:one', projectedPath: 'artifacts/one.md' },
  'artifact.materialization.fail': { installationId, artifactId: 'artifact:missing', noteVersionId: 'version:missing', expectedRevision: 0, error: 'failed' },
  'artifact.materialization.tombstone': { installationId, artifactId: 'artifact:missing', noteVersionId: 'version:missing', expectedRevision: 0 },
  'memory.relation.upsert': { installationId, relationId: 'relation:one', fromId: 'entity:one', toId: 'entity:two', kind: 'related', changeId: 'change:one', confidence: 1 },
  'memory.provenance.upsert': { installationId, provenanceLinkId: 'provenance:one', targetKind: 'relation', targetId: 'relation:one', sourceRefId: 'source:one', sourceVersion: '1', citation: 'citation' },
  'memory.cursor.advance': { installationId, cursorId: 'cursor:one', vaultId: 'vault:one', cursor: 1, documentHash: 'sha256:one', mode: 'projecting' },
  'memory.reconciliation.tombstone': { installationId, relationId: 'relation:missing', expectedRevision: 0 },
  'memory.correction.create': { installationId, correctionId: 'correction:one', targetKind: 'relation', targetId: 'relation:one', action: 'retract', reason: 'wrong', actor: 'owner', origin: 'client', expectedRevision: 0 },
  'memory.correction.apply': { installationId, correctionId: 'correction:one', appliedRevision: 1 },
  'memory.correction.restore': { installationId, correctionId: 'correction:one', appliedRevision: 2 },
  'memory.correction.conflict': { installationId, correctionId: 'correction:conflict', conflict: 'new evidence' },
} satisfies { readonly [Operation in keyof WorkerOperationInputMap]: WorkerOperationInputMap[Operation] }

const timestamp = 1
const node = {
  installationId, nodeId: 'node:one', displayName: 'Node', capabilities: ['agent.chat.v1'],
  protocolVersion: '1', status: 'online' as const, lastHeartbeatAt: timestamp,
  revision: 0, createdAt: timestamp, updatedAt: timestamp,
}
const command = {
  installationId, commandId: 'command:one', idempotencyKey: 'intent:one', input: 'work',
  status: 'accepted' as const, revision: 0, createdAt: timestamp, updatedAt: timestamp,
}
const job = {
  installationId, jobId: 'job:one', commandId: command.commandId, status: 'leased' as const,
  attempt: 1, maxAttempts: 3, leaseToken: 'lease:one', leaseOwnerNodeId: node.nodeId,
  leaseExpiresAt: 30_001, revision: 1, createdAt: timestamp, updatedAt: timestamp,
}
const run = {
  installationId, runId: 'run:one', jobId: job.jobId, attempt: 1, nodeId: node.nodeId,
  status: 'running' as const, revision: 0, startedAt: timestamp,
}
const transition = { ok: true as const, revision: 1 }
const correction = {
  installationId, correctionId: 'correction:one', targetKind: 'relation', targetId: 'relation:one',
  action: 'retract' as const, reason: 'wrong', actor: 'owner', origin: 'client',
  expectedRevision: 0, state: 'pending' as const, createdAt: timestamp, updatedAt: timestamp,
}
const agentRevision = {
  agentRevisionId: 'agent-revision:one', agentId: 'agent:one', ordinal: 1,
  displayName: 'Agent', systemPrompt: 'Help', toolCapabilities: ['task.write'], createdAt: timestamp,
}
const message = {
  messageId: 'message:one', threadId: 'thread:one', turnId: 'turn:one', turnOrdinal: 1,
  role: 'user' as const, state: 'active' as const, content: 'work', origin: 'client',
  agentRevisionId: agentRevision.agentRevisionId, createdAt: timestamp, updatedAt: timestamp,
}
const receipt = {
  effectId: 'effect:one', jobId: job.jobId, family: 'task' as const, action: 'complete',
  targetId: 'task:one', inputHash: 'sha256:one', targetRevision: 1,
  created: false, createdAt: timestamp,
}
const noteVersion = {
  noteVersionId: 'version:one', noteId: 'note:one', version: 1,
  contentJson: '{"type":"doc"}', contentHash: 'sha256:one', plainTextPreview: '',
  wordCount: 0, authorOrigin: 'agent', createdAt: timestamp,
}
const effectResult = { ok: true as const, duplicate: false, receipt, jobRevision: 2 }

/** Valid portable result representatives for every public worker operation. */
export const WORKER_OPERATION_VALID_RESULTS = {
  'node.register': { created: true, node },
  'node.heartbeat': transition,
  'command.read': command,
  'job.claim': { job, reclaimed: false },
  'job.lease.renew': transition,
  'run.start': { ok: true as const, created: true, job, run },
  'run.events.append': {
    ok: true as const, duplicate: false, revision: 1,
    events: [{ installationId, runId: run.runId, eventId: 'event:one', sequence: 1, type: 'status' as const, data: 'ok', createdAt: timestamp }],
  },
  'effect.checkpoint': transition,
  'session.checkpoint': transition,
  'run.complete': transition,
  'run.fail': transition,
  'run.cancel': transition,
  'thread.session.reset': transition,
  'execution.context.read': {
    command, job, agentRevision,
    thread: { threadId: 'thread:one', agentId: agentRevision.agentId, sessionRevision: 0 },
    messages: [message], messagesTruncated: false, effectReceipts: [receipt],
  },
  'artifact.work.read': {
    action: 'materialize' as const, artifactId: 'artifact:one', noteId: noteVersion.noteId,
    noteVersion, expectedArtifactRevision: 1, slug: 'one', projectedPath: 'artifacts/one.md',
  },
  'note.version.read': noteVersion,
  'memory.work.read': { kind: 'project' as const, commandInput: '{"kind":"project"}', corrections: [correction] },
  'effect.task.commit': effectResult,
  'effect.reminder.commit': { ...effectResult, receipt: { ...receipt, family: 'reminder' as const } },
  'effect.note.commit': { ...effectResult, receipt: { ...receipt, family: 'note' as const } },
  'effect.source.commit': { ...effectResult, receipt: { ...receipt, family: 'source' as const } },
  'effect.knowledge.commit': { ...effectResult, receipt: { ...receipt, family: 'knowledge' as const } },
  'assistant.finalize': transition,
  'artifact.materialization.complete': transition,
  'artifact.materialization.fail': transition,
  'artifact.materialization.tombstone': transition,
  'memory.relation.upsert': { ok: true as const, created: true, revision: 0 },
  'memory.provenance.upsert': { created: true },
  'memory.cursor.advance': { ok: true as const, created: true, revision: 0 },
  'memory.reconciliation.tombstone': transition,
  'memory.correction.create': { created: true, correction },
  'memory.correction.apply': transition,
  'memory.correction.restore': transition,
  'memory.correction.conflict': transition,
} satisfies { readonly [Operation in keyof WorkerOperationResultMap]: WorkerOperationResultMap[Operation] }
