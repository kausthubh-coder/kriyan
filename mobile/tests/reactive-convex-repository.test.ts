import { CANONICAL_VECTORS, canonicalContentHash, canonicalJson } from '@kriyan/contracts'
import { expect, test } from 'bun:test'
import { getFunctionName } from 'convex/server'

import {
  createConvexRepositoryWithClient,
  type MobileConvexClient,
} from '../lib/convex-repository'
import { settleRepositorySetup } from '../lib/product-store'

function baseSnapshot(revision = 0) {
  const common = { revision, createdAt: 1, updatedAt: revision + 1 }
  return {
    transactionRevision: revision,
    productivity: {
      tasks: [{ taskId: 'task:one', title: revision ? 'Committed task' : 'Old task', status: 'open', tags: [], ...common }],
      reminders: [{ reminderId: 'reminder:one', message: 'Reminder', remindAt: 10, timezone: 'UTC', status: 'scheduled', ...common }],
      calendarEvents: [{ calendarEventId: 'calendar:one', title: 'Event', startAt: 10, endAt: 20, timezone: 'UTC', allDay: false, status: 'confirmed', ...common }],
      notes: [{ noteId: 'note:one', contentJson: '{"type":"doc"}', plainTextPreview: revision ? 'Committed note' : 'Old note', wordCount: 2, tags: [], ...common }],
      notificationIntents: [{ notificationIntentId: 'intent:one', reminderId: 'reminder:one', scheduledFor: 10, deliveryPolicy: 'normal', dedupeKey: 'intent', lifecycle: 'queued', attempt: 0, escalationLevel: 0, ...common }],
    },
    agents: { threads: [], messages: [] },
    knowledge: {
      sources: [{ sourceRefId: 'source:one', kind: 'document', displayName: revision ? 'Committed source' : 'Old source', syncState: 'synced', indexState: 'indexed', provenanceIds: [], ...common }],
      documents: [{ knowledgeDocumentId: 'knowledge:one', kind: 'topic', title: revision ? 'Committed knowledge' : 'Old knowledge', summary: 'Summary', tags: [], sourceRefIds: [], provenanceIds: [], syncState: 'synced', indexState: 'indexed', ...common }],
      artifacts: [],
    },
    nodes: { items: [], activity: [] },
  }
}

class FakeClient implements MobileConvexClient {
  revision = 0
  tombstoned = new Set<string>()
  listeners = new Set<(value: any) => void>()
  unsubscribeCount = 0
  closeCount = 0

  async query(reference: any, args: any): Promise<any> {
    const name = getFunctionName(reference)
    const snapshot = baseSnapshot(this.revision)
    const byName: Record<string, any> = {
      'projections:getTask': snapshot.productivity.tasks[0],
      'projections:getReminder': snapshot.productivity.reminders[0],
      'notifications:get': snapshot.productivity.notificationIntents[0],
      'calendar:get': snapshot.productivity.calendarEvents[0],
      'notes:get': snapshot.productivity.notes[0],
      'knowledge:getSourceRef': snapshot.knowledge.sources[0],
      'knowledge:getKnowledgeDocument': snapshot.knowledge.documents[0],
    }
    const value = byName[name]
    if (!value) throw new Error(`unexpected query ${name}`)
    const id = Object.values(args).find((item) => typeof item === 'string' && item !== 'installation:contracts') as string | undefined
    return id && this.tombstoned.has(id) && !args.includeDeleted ? null : id && this.tombstoned.has(id) ? { ...value, deletedAt: 99 } : value
  }

  async mutation(reference: any, args: any): Promise<any> {
    const name = getFunctionName(reference)
    if (name === 'installations:create') return { created: true }
    this.revision += 1
    if (/tombstone/.test(name)) {
      const id = args.taskId ?? args.reminderId ?? args.notificationIntentId ?? args.calendarEventId ?? args.noteId ?? args.projectionId
      if (id) this.tombstoned.add(id)
    }
    this.emit()
    return { ok: true, created: false, revision: this.revision }
  }

  onUpdate(_reference: any, _args: any, onValue: (value: any) => void): () => void {
    this.listeners.add(onValue)
    queueMicrotask(() => onValue(baseSnapshot(this.revision)))
    let active = true
    return () => {
      if (!active) return
      active = false
      this.unsubscribeCount += 1
      this.listeners.delete(onValue)
    }
  }

  emit(): void {
    const value = baseSnapshot(this.revision)
    for (const listener of [...this.listeners]) listener(value)
  }

  async close(): Promise<void> { this.closeCount += 1 }
}

test('Expo returns committed revision-aware values and explicit tombstone success', async () => {
  const client = new FakeClient()
  const repository = await createConvexRepositoryWithClient(client, 'installation:contracts')
  await Promise.resolve()

  const task = await repository.tasksV1.update({ taskId: 'task:one', expectedRevision: 0, patch: { title: 'Requested task' } })
  expect(task).toMatchObject({ ok: true, revision: 1, value: { title: 'Committed task', revision: 1 } })
  if (!task.ok) throw new Error('expected task update')
  expect(await repository.tasksV1.tombstone('task:one', task.revision)).toMatchObject({ ok: true, revision: 2, value: { deletedAt: 99 } })

  const note = await repository.notesV1.update({ noteId: 'note:one', expectedRevision: 2, patch: { plainTextPreview: 'Requested note' } })
  expect(note).toMatchObject({ ok: true, revision: 3, value: { plainTextPreview: 'Committed note', revision: 3 } })
  expect(await repository.notesV1.tombstone('note:one', 3)).toMatchObject({ ok: true, revision: 4, value: { deletedAt: 99 } })

  const source = await repository.sourceRefsV1.update({ sourceRefId: 'source:one', expectedRevision: 4, patch: { displayName: 'Requested source' } })
  expect(source).toMatchObject({ ok: true, revision: 5, value: { displayName: 'Committed source' } })
  expect(await repository.sourceRefsV1.tombstone('source:one', 5)).toMatchObject({ ok: true, revision: 6, value: { deletedAt: 99 } })

  const knowledge = await repository.knowledgeV1.update({ knowledgeDocumentId: 'knowledge:one', expectedRevision: 6, patch: { title: 'Requested knowledge' } })
  expect(knowledge).toMatchObject({ ok: true, revision: 7, value: { title: 'Committed knowledge' } })
  expect(await repository.knowledgeV1.tombstone('knowledge:one', 7)).toMatchObject({ ok: true, revision: 8, value: { deletedAt: 99 } })

  expect(await repository.remindersV1.acknowledge('reminder:one', 8)).toMatchObject({ ok: true, revision: 9, value: { revision: 9 } })
  expect(await repository.remindersV1.snooze('reminder:one', 9, 20)).toMatchObject({ ok: true, revision: 10, value: { revision: 10 } })
  expect(await repository.remindersV1.tombstone('reminder:one', 10)).toMatchObject({ ok: true, revision: 11, value: { deletedAt: 99 } })

  expect(await repository.calendarV1.update({ calendarEventId: 'calendar:one', expectedRevision: 11, patch: { title: 'Requested event' } })).toMatchObject({ ok: true, revision: 12, value: { revision: 12 } })
  expect(await repository.calendarV1.tombstone('calendar:one', 12)).toMatchObject({ ok: true, revision: 13, value: { deletedAt: 99 } })

  expect(await repository.notificationIntentsV1.transition({ notificationIntentId: 'intent:one', expectedRevision: 13, lifecycle: 'dispatched' })).toMatchObject({ ok: true, revision: 14, value: { revision: 14 } })
  expect(await repository.notificationIntentsV1.tombstone('intent:one', 14)).toMatchObject({ ok: true, revision: 15, value: { revision: 15 } })

  repository.dispose(); repository.dispose()
  await Promise.resolve()
  expect(client.unsubscribeCount).toBe(1)
  expect(client.closeCount).toBe(1)
})

test('Expo runtime uses the shared portable canonical vector corpus', () => {
  for (const vector of CANONICAL_VECTORS) {
    expect(canonicalJson(vector.value), vector.name).toBe(vector.canonical)
    expect(canonicalContentHash(JSON.stringify(vector.value))).toMatch(/^sha256:[0-9a-f]{64}$/)
  }
})

test('superseded async setup and unmount disposal are fenced exactly once', async () => {
  const disposed = [0, 0]
  const fake = (index: number) => ({
    getSnapshot: () => ({ ...baseSnapshot(), connection: 'online' }),
    subscribe: () => () => {},
    dispose: () => { if (disposed[index] === 0) disposed[index] += 1 },
  }) as any
  let firstCurrent = true
  let secondCurrent = true
  let accepted: any
  const first = settleRepositorySetup(Promise.resolve(fake(0)), () => firstCurrent, () => {}, () => {})
  firstCurrent = false
  const second = settleRepositorySetup(Promise.resolve(fake(1)), () => secondCurrent, (value) => { accepted = value }, () => {})
  await Promise.all([first, second])
  expect(disposed).toEqual([1, 0])
  secondCurrent = false
  accepted.dispose(); accepted.dispose()
  expect(disposed).toEqual([1, 1])
})
