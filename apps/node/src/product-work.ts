import { join } from 'node:path'

import type { Job, WorkerContractClient } from '@kriyan/convex-client'
import {
  ArtifactProjectionStore,
  MemoryLedger,
  type ProjectedMemoryRecord,
} from '@kriyan/knowledge-vault'

import type { NodeConfig } from './config'

function lease(config: NodeConfig, job: Job) {
  if (job.leaseToken === undefined) throw new Error('worker job has no lease token')
  return {
    installationId: config.installationId,
    jobId: job.jobId,
    nodeId: config.nodeId,
    expectedJobRevision: job.revision,
    expectedLeaseToken: job.leaseToken,
  }
}

export async function executeArtifactWork(
  config: NodeConfig,
  client: WorkerContractClient,
  job: Job,
): Promise<void> {
  const work = await client.invoke('artifact.work.read', lease(config, job))
  const projections = new ArtifactProjectionStore(join(config.dataDir, 'vault'))
  if (work.action === 'tombstone') {
    const remote = await client.invoke('artifact.materialization.tombstone', {
      installationId: config.installationId,
      artifactId: work.artifactId,
      noteVersionId: work.noteVersion.noteVersionId,
      expectedRevision: work.expectedArtifactRevision,
      expectedProjectedHash: work.priorProjectedHash,
    })
    if (!remote.ok && remote.reason !== 'already_terminal' && remote.reason !== 'stale_revision') {
      throw new Error(`artifact tombstone rejected: ${remote.reason}`)
    }
    const local = await projections.tombstone(
      work.artifactId,
      work.noteVersion.noteVersionId,
      work.priorProjectedHash,
    )
    if (local === 'stale') {
      throw new Error('artifact tombstone requires reconciliation: local projection is stale')
    }
    return
  }

  const projected = await projections.materialize({
    artifactId: work.artifactId,
    noteId: work.noteId,
    noteVersionId: work.noteVersion.noteVersionId,
    version: work.noteVersion.version,
    contentHash: work.noteVersion.contentHash,
    contentJson: work.noteVersion.contentJson,
    title: work.slug,
    plainText: work.noteVersion.plainTextPreview,
    projectedPath: work.projectedPath,
    priorProjectedHash: work.priorProjectedHash,
    priorProjectedPath: work.priorProjectedPath,
  })
  if (projected.status === 'stale') return
  const remote = await client.invoke('artifact.materialization.complete', {
    installationId: config.installationId,
    artifactId: work.artifactId,
    noteVersionId: work.noteVersion.noteVersionId,
    expectedRevision: work.expectedArtifactRevision,
    expectedPriorHash: work.priorProjectedHash,
    projectedHash: projected.record.projectedHash,
    projectedPath: projected.record.projectedPath,
  })
  if (!remote.ok && remote.reason !== 'already_terminal' && remote.reason !== 'stale_revision') {
    throw new Error(`artifact completion rejected: ${remote.reason}`)
  }
}

interface MemoryWorkInput {
  correctionId?: string
  records?: Array<Omit<ProjectedMemoryRecord, 'tombstoned'>>
  sourceExcerpts?: Array<{
    excerptId: string; sourceRefId: string; text: string; startOffset: number; endOffset: number
    speaker?: string; startAtMs?: number; endAtMs?: number
  }>
  sourceExtractions?: Array<{
    extractionId: string; sourceRefId: string; kind: string; label: string; value: string
    confidence?: number; provenanceIds: string[]
  }>
  reversibleChanges?: Array<{
    changeId: string; targetKind: string; targetId: string; action: string; summary: string
    origin: string; sourceRefIds: string[]; provenanceIds: string[]; beforeRevision?: number
    afterRevision: number; reversible: boolean; revertPayload?: string
  }>
  facts?: Array<{
    factId: string; entityId: string; predicate: string; value: string; confidence: number
    sourceRefIds: string[]; provenanceIds: string[]; expectedRevision?: number
  }>
  relations?: Array<{
    relationId: string; fromId: string; toId: string; kind: string; changeId: string
    confidence: number; expectedRevision?: number; revision: number; provenanceIds: string[]
  }>
  provenance?: Array<{
    provenanceLinkId: string; targetKind: string; targetId: string; sourceRefId: string
    sourceVersion: string; citation: string
  }>
  tombstones?: Array<{ relationId: string; expectedRevision: number }>
  vaultId?: string
  cursorId?: string
  cursor?: number
  documentHash?: string
  mode?: string
}

export async function executeMemoryWork(
  config: NodeConfig,
  client: WorkerContractClient,
  job: Job,
): Promise<'project' | 'reconcile' | 'correction'> {
  const work = await client.invoke('memory.work.read', lease(config, job))
  const ledger = new MemoryLedger(join(config.dataDir, 'vault'))
  if (Buffer.byteLength(work.commandInput) > 256 * 1024) throw new Error('memory work input exceeds limit')
  const input = JSON.parse(work.commandInput) as MemoryWorkInput
  const targetedCorrectionId = work.kind === 'correction' ? input.correctionId : undefined
  if (work.kind === 'correction' && typeof targetedCorrectionId !== 'string') {
    throw new Error('memory correction work has no correctionId')
  }
  let foundTargetedCorrection = false
  for (const correction of work.corrections) {
    const targeted = correction.correctionId === targetedCorrectionId
    if (targeted) foundTargetedCorrection = true

    if (correction.state === 'conflict') continue
    if (correction.state === 'pending' && !targeted) continue

    const appliedRevision = correction.state === 'pending'
      ? correction.expectedRevision + 1
      : correction.appliedRevision
    if (appliedRevision === undefined) {
      throw new Error(`terminal memory correction has no applied revision: ${correction.correctionId}`)
    }
    const ledgerAction = correction.state === 'restored' ? 'restore' : correction.action
    await ledger.correct({
      correctionId: correction.correctionId,
      targetKind: correction.targetKind,
      targetId: correction.targetId,
      action: ledgerAction,
      replacement: ledgerAction === 'restore' ? undefined : correction.replacement,
      reason: correction.reason,
      revision: appliedRevision,
      provenanceIds: [correction.origin],
    })
    if (correction.state !== 'pending') continue

    const outcome = correction.action === 'restore'
      ? await client.invoke('memory.correction.restore', {
          installationId: config.installationId,
          correctionId: correction.correctionId,
          appliedRevision,
        })
      : await client.invoke('memory.correction.apply', {
          installationId: config.installationId,
          correctionId: correction.correctionId,
          appliedRevision,
        })
    if (!outcome.ok && outcome.reason !== 'already_terminal') {
      throw new Error(`memory correction rejected: ${outcome.reason}`)
    }
  }
  if (work.kind === 'correction' && !foundTargetedCorrection) {
    throw new Error(`memory correction not found: ${targetedCorrectionId}`)
  }
  if (work.kind === 'reconcile') {
    await ledger.reconcile(input.records ?? [])
  } else {
    for (const record of input.records ?? []) {
      const decision = await ledger.project(record)
      if (decision.status === 'conflict' && decision.correction !== undefined) {
        const conflict = await client.invoke('memory.correction.conflict', {
          installationId: config.installationId,
          correctionId: decision.correction.correctionId,
          conflict: `newer ${record.targetKind} evidence at revision ${record.revision}`,
        })
        if (!conflict.ok && conflict.reason !== 'already_terminal') {
          throw new Error(`memory conflict rejected: ${conflict.reason}`)
        }
      }
    }
  }
  for (const excerpt of input.sourceExcerpts ?? []) {
    await client.upsertSourceExcerpt({ installationId: config.installationId, ...excerpt })
  }
  for (const extraction of input.sourceExtractions ?? []) {
    await client.upsertSourceExtraction({ installationId: config.installationId, ...extraction })
  }
  for (const change of input.reversibleChanges ?? []) {
    await client.recordReversibleChange({ installationId: config.installationId, ...change })
  }
  for (const fact of input.facts ?? []) {
    const result = await client.upsertMemoryFact({ installationId: config.installationId, ...fact })
    if (!result.ok && result.reason !== 'stale_revision') throw new Error(`memory fact rejected: ${result.reason}`)
  }
  for (const relation of input.relations ?? []) {
    const decision = await ledger.project({
      targetKind: 'relation', targetId: relation.relationId, revision: relation.revision,
      value: JSON.stringify({ fromId: relation.fromId, toId: relation.toId, kind: relation.kind }),
      provenanceIds: relation.provenanceIds,
    })
    if (decision.status === 'projected' || decision.status === 'replayed') {
      const { revision: _revision, provenanceIds: _provenanceIds, ...wire } = relation
      const result = await client.invoke('memory.relation.upsert', {
        installationId: config.installationId,
        ...wire,
      })
      if (!result.ok && result.reason !== 'stale_revision') throw new Error(`memory relation rejected: ${result.reason}`)
    } else if (decision.status === 'conflict' && decision.correction !== undefined) {
      await client.invoke('memory.correction.conflict', {
        installationId: config.installationId,
        correctionId: decision.correction.correctionId,
        conflict: `newer relation evidence at revision ${relation.revision}`,
      })
    }
  }
  for (const provenance of input.provenance ?? []) {
    await client.invoke('memory.provenance.upsert', { installationId: config.installationId, ...provenance })
  }
  for (const tombstone of input.tombstones ?? []) {
    const result = await client.invoke('memory.reconciliation.tombstone', {
      installationId: config.installationId,
      ...tombstone,
    })
    if (!result.ok && result.reason !== 'already_terminal' && result.reason !== 'stale_revision') {
      throw new Error(`memory tombstone rejected: ${result.reason}`)
    }
  }
  if (input.vaultId !== undefined && input.cursorId !== undefined && input.cursor !== undefined) {
    const cursor = await client.invoke('memory.cursor.advance', {
      installationId: config.installationId,
      cursorId: input.cursorId,
      vaultId: input.vaultId,
      cursor: input.cursor,
      documentHash: input.documentHash,
      mode: input.mode ?? work.kind,
    })
    if (!cursor.ok && cursor.reason !== 'stale_revision') throw new Error(`memory cursor rejected: ${cursor.reason}`)
  }
  return work.kind
}
