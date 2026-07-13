import type { WorkerContractClient } from './worker-contract'

declare const client: WorkerContractClient

if (false) {
  // Every frozen operation has a negative compile probe. Removing operation-specific typing makes these directives fail.
  // @ts-expect-error installationId must be a string
  void client.invoke('node.register', { installationId: 1 })
  // @ts-expect-error nodeId is required
  void client.invoke('node.heartbeat', { installationId: 'i', expectedRevision: 0 })
  // @ts-expect-error commandId is required
  void client.invoke('command.read', { installationId: 'i' })
  // @ts-expect-error leaseDurationMs must be a number
  void client.invoke('job.claim', { installationId: 'i', nodeId: 'n', leaseDurationMs: '30' })
  // @ts-expect-error expectedRevision is required
  void client.invoke('job.lease.renew', { installationId: 'i', jobId: 'j', nodeId: 'n', leaseDurationMs: 1 })
  // @ts-expect-error expectedJobRevision is required
  void client.invoke('run.start', { installationId: 'i', jobId: 'j', nodeId: 'n' })
  // @ts-expect-error events must be an array
  void client.invoke('run.events.append', { installationId: 'i', jobId: 'j', runId: 'r', nodeId: 'n', expectedJobRevision: 0, expectedRunRevision: 0, events: 'bad' })
  // @ts-expect-error checkpoint is required
  void client.invoke('effect.checkpoint', { installationId: 'i', jobId: 'j', nodeId: 'n', expectedJobRevision: 0 })
  // @ts-expect-error piSessionRef must be a string
  void client.invoke('session.checkpoint', { installationId: 'i', jobId: 'j', nodeId: 'n', expectedJobRevision: 0, piSessionRef: 1 })
  // @ts-expect-error runId is required
  void client.invoke('run.complete', { installationId: 'i', jobId: 'j', nodeId: 'n', expectedJobRevision: 0, expectedRunRevision: 0 })
  // @ts-expect-error retryable must be boolean
  void client.invoke('run.fail', { installationId: 'i', jobId: 'j', runId: 'r', nodeId: 'n', error: 'e', retryable: 'yes', expectedJobRevision: 0, expectedRunRevision: 0 })
  // @ts-expect-error expectedRevision is required
  void client.invoke('run.cancel', { installationId: 'i', commandId: 'c' })
  // @ts-expect-error threadId is required
  void client.invoke('thread.session.reset', { installationId: 'i', expectedRevision: 0 })
  // @ts-expect-error expectedRunRevision is required
  void client.invoke('assistant.finalize', { installationId: 'i', jobId: 'j', runId: 'r', nodeId: 'n', expectedJobRevision: 0 })
  // @ts-expect-error projectedPath is required
  void client.invoke('artifact.materialization.complete', { installationId: 'i', artifactId: 'a', noteVersionId: 'v', expectedRevision: 0, projectedHash: 'h' })
  // @ts-expect-error error must be a string
  void client.invoke('artifact.materialization.fail', { installationId: 'i', artifactId: 'a', noteVersionId: 'v', expectedRevision: 0, error: false })
  // @ts-expect-error artifactId is required
  void client.invoke('artifact.materialization.tombstone', { installationId: 'i', noteVersionId: 'v', expectedRevision: 0 })
  // @ts-expect-error confidence is required
  void client.invoke('memory.relation.upsert', { installationId: 'i', relationId: 'r', fromId: 'a', toId: 'b', kind: 'k', changeId: 'c' })
  // @ts-expect-error citation is required
  void client.invoke('memory.provenance.upsert', { installationId: 'i', provenanceLinkId: 'p', targetKind: 'k', targetId: 't', sourceRefId: 's', sourceVersion: '1' })
  // @ts-expect-error cursor must be a number
  void client.invoke('memory.cursor.advance', { installationId: 'i', cursorId: 'c', vaultId: 'v', cursor: '1', mode: 'm' })
  // @ts-expect-error relationId is required
  void client.invoke('memory.reconciliation.tombstone', { installationId: 'i', expectedRevision: 0 })
  // @ts-expect-error action is not a frozen correction action
  void client.invoke('memory.correction.create', { installationId: 'i', correctionId: 'c', targetKind: 'k', targetId: 't', action: 'delete', reason: 'r', actor: 'a', origin: 'o', expectedRevision: 0 })
  // @ts-expect-error appliedRevision is required
  void client.invoke('memory.correction.apply', { installationId: 'i', correctionId: 'c' })
  // @ts-expect-error correctionId is required
  void client.invoke('memory.correction.restore', { installationId: 'i', appliedRevision: 1 })
  // @ts-expect-error conflict must be a string
  void client.invoke('memory.correction.conflict', { installationId: 'i', correctionId: 'c', conflict: 1 })

  // Result inference stays operation-specific across every distinct result family.
  // @ts-expect-error node registration does not return a transition result
  const badRegisterResult: Promise<{ ok: true; revision: number }> = client.invoke('node.register', { installationId: 'i', nodeId: 'n', displayName: 'N', capabilities: [], protocolVersion: '1' })
  // @ts-expect-error command reads return the frozen command DTO or null
  const badReadResult: Promise<string> = client.invoke('command.read', { installationId: 'i', commandId: 'c' })
  // @ts-expect-error claimed jobs are structured worker job DTOs
  const badClaimResult: Promise<{ job: string; reclaimed: boolean } | null> = client.invoke('job.claim', { installationId: 'i', nodeId: 'n', leaseDurationMs: 1 })
  // @ts-expect-error run start returns exact job and run DTOs
  const badStartResult: Promise<{ ok: true; created: boolean; job: string; run: string }> = client.invoke('run.start', { installationId: 'i', jobId: 'j', nodeId: 'n', expectedJobRevision: 0 })
  // @ts-expect-error appended events are exact run event DTOs
  const badEventResult: Promise<{ ok: true; duplicate: boolean; events: string[]; revision: number }> = client.invoke('run.events.append', { installationId: 'i', jobId: 'j', runId: 'r', nodeId: 'n', expectedJobRevision: 0, expectedRunRevision: 0, events: [] })
  // @ts-expect-error transition revisions are numeric
  const badTransitionResult: Promise<{ ok: true; revision: string }> = client.invoke('run.complete', { installationId: 'i', jobId: 'j', runId: 'r', nodeId: 'n', expectedJobRevision: 0, expectedRunRevision: 0 })
  // @ts-expect-error relation creation flags are boolean
  const badRelationResult: Promise<{ ok: true; created: string; revision: number }> = client.invoke('memory.relation.upsert', { installationId: 'i', relationId: 'r', fromId: 'a', toId: 'b', kind: 'k', changeId: 'c', confidence: 1 })
  // @ts-expect-error provenance creation flags are boolean
  const badProvenanceResult: Promise<{ created: string }> = client.invoke('memory.provenance.upsert', { installationId: 'i', provenanceLinkId: 'p', targetKind: 'k', targetId: 't', sourceRefId: 's', sourceVersion: '1', citation: 'c' })
  // @ts-expect-error correction creation returns the frozen correction DTO
  const badCorrectionResult: Promise<{ created: boolean; correction: string }> = client.invoke('memory.correction.create', { installationId: 'i', correctionId: 'c', targetKind: 'k', targetId: 't', action: 'retract', reason: 'r', actor: 'a', origin: 'o', expectedRevision: 0 })

  void [badRegisterResult, badReadResult, badClaimResult, badStartResult, badEventResult, badTransitionResult, badRelationResult, badProvenanceResult, badCorrectionResult]
}
