import { expect, test } from 'bun:test'
import { getFunctionName } from 'convex/server'

import { createWebProductDetailRepository } from './product-detail-adapter'

test('Web public detail adapter executes every detail query family through Convex', async () => {
  const calls: string[] = []
  const client = {
    async query(reference: unknown): Promise<unknown> {
      const name = getFunctionName(reference as never)
      calls.push(name)
      if (name === 'notes:listArtifactsByNote' || name === 'knowledge:listDerivedChanges' || name === 'knowledge:listTaskChanges') return []
      if (name === 'knowledge:getSourceDetail') return {
        source: { installationId: 'installation:contracts', sourceRefId: 'source:one' },
        transcriptTruncated: false, excerpts: [], excerptsTruncated: false,
        extractions: [], extractionsTruncated: false, derivedChanges: [], derivedChangesTruncated: false,
      }
      if (name === 'knowledge:getTaskProvenance') return {
        task: { installationId: 'installation:contracts', taskId: 'task:one' },
        sources: [{ installationId: 'installation:contracts', sourceRefId: 'source:one' }],
        changes: [], changesTruncated: false,
      }
      return null
    },
    async mutation(): Promise<never> {
      throw new Error('unexpected mutation')
    },
  }
  const details = createWebProductDetailRepository(client, 'installation:contracts')
  expect(await details.noteDetailsV1.getHistory('note:missing')).toBeNull()
  expect(await details.noteDetailsV1.getVersion('version:missing')).toBeNull()
  expect(await details.artifactsV1.get('artifact:missing')).toBeNull()
  expect(await details.artifactsV1.listByNote('note:missing')).toEqual([])
  expect(await details.sourceDetailsV1.getDetail('source:one')).toMatchObject({ source: { sourceRefId: 'source:one' } })
  expect((await details.sourceDetailsV1.getDetail('source:one'))?.source).not.toHaveProperty('installationId')
  expect(await details.sourceDetailsV1.listDerivedChanges('source:missing')).toEqual([])
  expect(await details.memoryV1.getEntity('entity:missing')).toBeNull()
  const taskProvenance = await details.taskProvenanceV1.getDetail('task:one')
  expect(taskProvenance?.task).not.toHaveProperty('installationId')
  expect(taskProvenance?.sources[0]).toMatchObject({ sourceRefId: 'source:one' })
  expect(taskProvenance?.sources[0]).not.toHaveProperty('installationId')
  expect(await details.taskProvenanceV1.listChanges('task:missing')).toEqual([])
  expect(calls).toEqual([
    'notes:getHistory', 'notes:getVersion', 'notes:getArtifact', 'notes:listArtifactsByNote',
    'knowledge:getSourceDetail', 'knowledge:getSourceDetail', 'knowledge:listDerivedChanges', 'knowledge:getMemoryEntity',
    'knowledge:getTaskProvenance', 'knowledge:listTaskChanges',
  ])
})
