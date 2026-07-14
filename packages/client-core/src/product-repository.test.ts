import { describe, expect, test } from 'bun:test'

import { productRepositoryContract } from '../testing/product-repository-contract'
import { ConvexProductRepository } from './convex-product-repository'
import { InMemoryClientRepository } from './in-memory'
import { InMemoryProductRepository } from './in-memory-product'
import type { ProductRepository } from './product-repository'
import {
  deriveCalendarAgenda,
  deriveKnowledgeCards,
  deriveReminderAttention,
  deriveTaskSections,
} from './product-view-model'

productRepositoryContract('in-memory client', () => new InMemoryClientRepository())
productRepositoryContract('injected Convex adapter', () =>
  new ConvexProductRepository(new InMemoryProductRepository()))

function productDetailRepositoryContract(
  name: string,
  createRepository: () => ProductRepository,
): void {
  describe(`${name} detail repository`, () => {
    test('executes every public detail port through the composed repository', async () => {
      const repository = createRepository()
      const note = await repository.notesV1.create({
        noteId: 'note:detail', idempotencyKey: 'note:detail', title: 'Detail',
        contentJson: '{"type":"doc"}', plainTextPreview: 'Detail', wordCount: 1,
      })
      expect(note.ok).toBe(true)
      await repository.notesV1.update({
        noteId: 'note:detail', expectedRevision: 0,
        patch: { plainTextPreview: 'Updated detail', wordCount: 2 },
      })
      const history = await repository.noteDetailsV1.getHistory('note:detail')
      expect(history?.versions.map((item) => item.version)).toEqual([1, 0])
      expect(await repository.noteDetailsV1.getVersion(history!.versions[0]!.noteVersionId)).not.toBeNull()

      const link = await repository.noteDetailsV1.createLink({
        noteLinkId: 'note-link:detail', idempotencyKey: 'note-link:detail',
        noteId: 'note:detail', targetKind: 'task', targetId: 'task:detail',
        relation: 'supports', provenanceIds: [],
      })
      expect(link).toMatchObject({ ok: true, created: true })
      expect(await repository.noteDetailsV1.tombstoneLink('note-link:detail', 0)).toMatchObject({ ok: true, revision: 1 })

      const artifact = await repository.artifactsV1.create({
        artifactId: 'artifact:detail', noteId: 'note:detail',
        noteVersionId: history!.versions[0]!.noteVersionId, slug: 'detail',
      })
      expect(artifact).toMatchObject({ ok: true, value: { projectionState: 'pending' } })
      expect(await repository.artifactsV1.advance({
        artifactId: 'artifact:detail', expectedRevision: 0,
        noteVersionId: history!.versions[1]!.noteVersionId, slug: 'detail-v2',
      })).toMatchObject({ ok: true, revision: 1 })
      expect(await repository.artifactsV1.tombstone('artifact:detail', 1)).toMatchObject({ ok: true, revision: 2 })
      expect((await repository.artifactsV1.get('artifact:detail'))?.history).toHaveLength(3)
      expect(await repository.artifactsV1.listByNote('note:detail', true)).toHaveLength(1)

      await repository.sourceRefsV1.put({
        sourceRefId: 'source:detail', idempotencyKey: 'source:detail', kind: 'document',
        displayName: 'Detail source', syncState: 'synced', indexState: 'indexed',
      })
      expect(await repository.sourceDetailsV1.getDetail('source:detail')).toMatchObject({
        source: { sourceRefId: 'source:detail' }, transcriptTruncated: false,
      })
      expect(await repository.sourceDetailsV1.listDerivedChanges('source:detail')).toEqual([])

      await repository.knowledgeV1.put({
        knowledgeDocumentId: 'entity:detail', idempotencyKey: 'entity:detail', kind: 'person',
        title: 'Detail entity', summary: '', tags: [], sourceRefIds: ['source:detail'],
        provenanceIds: ['source:detail'], syncState: 'synced', indexState: 'indexed',
      })
      const correction = await repository.memoryV1.createCorrection({
        correctionId: 'correction:detail', targetKind: 'entity', targetId: 'entity:detail',
        action: 'retract', reason: 'Owner correction', actor: 'owner', origin: 'client', expectedRevision: 0,
      })
      expect(correction).toMatchObject({ ok: true, value: { state: 'pending' } })
      expect(await repository.memoryV1.applyCorrection('correction:detail', 1)).toMatchObject({ ok: true, value: { state: 'applied' } })
      expect(await repository.memoryV1.restoreCorrection('correction:detail', 2)).toMatchObject({ ok: true, value: { state: 'restored' } })
      expect(await repository.memoryV1.getEntity('entity:detail')).toMatchObject({ entityId: 'entity:detail' })

      await repository.tasksV1.create({
        taskId: 'task:detail', idempotencyKey: 'task:detail', title: 'Detail task', status: 'open',
      })
      expect(await repository.taskProvenanceV1.getDetail('task:detail')).toMatchObject({
        task: { taskId: 'task:detail' }, origin: 'owner', changes: [],
      })
      expect(await repository.taskProvenanceV1.listChanges('task:detail')).toEqual([])
      expect(await repository.taskProvenanceV1.revertChange('change:missing', 0)).toMatchObject({ ok: false, reason: 'not_found' })
    })
  })
}

productDetailRepositoryContract('in-memory client', () => new InMemoryClientRepository())
productDetailRepositoryContract('injected Convex adapter', () =>
  new ConvexProductRepository(new InMemoryProductRepository()))

describe('product view models', () => {
  test('groups live tasks and ranks urgency deterministically', () => {
    const base = { status: 'open' as const, revision: 0, createdAt: 0, updatedAt: 0 }
    const sections = deriveTaskSections([
      { ...base, taskId: 'task:today-low', title: 'Low', priority: 'low', dueAt: 150 },
      { ...base, taskId: 'task:today-urgent', title: 'Urgent', priority: 'urgent', dueAt: 175 },
      { ...base, taskId: 'task:overdue', title: 'Overdue', dueAt: 50 },
      { ...base, taskId: 'task:later', title: 'Later', dueAt: 300 },
      { ...base, taskId: 'task:none', title: 'No date' },
      { ...base, taskId: 'task:deleted', title: 'Deleted', deletedAt: 1 },
    ], 100, 200)
    expect(sections.today.map((task) => task.taskId)).toEqual(['task:today-urgent', 'task:today-low'])
    expect(sections.overdue).toHaveLength(1)
    expect(sections.upcoming).toHaveLength(1)
    expect(sections.unscheduled).toHaveLength(1)
  })

  test('derives reminder attention, agenda overlap, and ready knowledge cards', () => {
    const reminderBase = { message: 'One', remindAt: 10, timezone: 'UTC', status: 'scheduled' as const, revision: 0, createdAt: 0, updatedAt: 0 }
    expect(deriveReminderAttention([
      { ...reminderBase, reminderId: 'normal', deliveryPolicy: 'normal' },
      { ...reminderBase, reminderId: 'critical', deliveryPolicy: 'critical' },
      { ...reminderBase, reminderId: 'future', nextFireAt: 30 },
    ], 20).map((item) => item.reminderId)).toEqual(['critical', 'normal'])

    const eventBase = { title: 'Event', timezone: 'UTC', allDay: false, lifecycle: 'confirmed' as const, revision: 0, createdAt: 0, updatedAt: 0 }
    expect(deriveCalendarAgenda([
      { ...eventBase, calendarEventId: 'overlap', startAt: 5, endAt: 15 },
      { ...eventBase, calendarEventId: 'outside', startAt: 30, endAt: 40 },
    ], 10, 20).map((item) => item.calendarEventId)).toEqual(['overlap'])

    expect(deriveKnowledgeCards([{
      knowledgeDocumentId: 'knowledge:1',
      kind: 'project',
      title: 'Kriyan',
      summary: 'Summary',
      tags: ['product'],
      sourceRefIds: ['source:1'],
      provenanceIds: ['source:1'],
      syncState: 'synced',
      indexState: 'indexed',
      revision: 0,
      createdAt: 0,
      updatedAt: 0,
    }])).toEqual([expect.objectContaining({ ready: true, provenanceCount: 1 })])
  })
})
