import type { WorkerOperationInputMap } from './worker-operations'

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
