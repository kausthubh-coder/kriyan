import { describe, expect, test } from 'bun:test'

import type { ProductRepository } from '../src/product-repository'

const TIPTAP_DOCUMENT = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
})

export function productRepositoryContract(
  name: string,
  createRepository: () => ProductRepository,
): void {
  describe(`${name} product repository v1 contract`, () => {
    test('tasks are idempotent, revision protected, filterable, and soft deleted', async () => {
      const repository = createRepository()
      const input = {
        taskId: 'task:1',
        idempotencyKey: 'task-intent:1',
        title: 'Practice Korean',
        description: 'Thirty minutes',
        tags: ['language'],
        priority: 'high' as const,
        startAt: 5,
        dueAt: 10,
        projectId: 'project:language',
        entityId: 'entity:korean',
      }
      const created = await repository.tasksV1.create(input)
      expect(created).toMatchObject({ ok: true, created: true, revision: 0 })
      expect(await repository.tasksV1.create(input)).toMatchObject({ ok: true, created: false })
      expect(await repository.tasksV1.create({ ...input, title: 'Conflicting replay' })).toMatchObject({ ok: false, reason: 'idempotency_conflict' })
      const updated = await repository.tasksV1.update({
        taskId: input.taskId,
        expectedRevision: 0,
        patch: { dueAt: null, status: 'completed' },
      })
      expect(updated).toMatchObject({ ok: true, revision: 1, value: { status: 'completed' } })
      expect(updated.ok && 'dueAt' in updated.value).toBe(false)
      expect(await repository.tasksV1.update({ taskId: input.taskId, expectedRevision: 0, patch: { title: 'Stale' } })).toMatchObject({ ok: false, reason: 'stale_revision' })
      expect((await repository.tasksV1.list({ tag: 'language', projectId: 'project:language' })).items).toHaveLength(1)
      await repository.tasksV1.create({
        taskId: 'task:2',
        idempotencyKey: 'task-intent:2',
        title: 'Read',
      })
      const firstPage = await repository.tasksV1.list({ limit: 1 })
      expect(firstPage).toMatchObject({ done: false, cursor: '1' })
      expect((await repository.tasksV1.list({ cursor: firstPage.cursor, limit: 1 })).items).toHaveLength(1)
      expect(await repository.tasksV1.tombstone(input.taskId, 1)).toMatchObject({ ok: true, revision: 2 })
      expect((await repository.tasksV1.list({ projectId: 'project:language' })).items).toHaveLength(0)
      expect((await repository.tasksV1.list({ includeDeleted: true, projectId: 'project:language' })).items).toHaveLength(1)
    })

    test('reminders model delivery, acknowledgement, snooze, and duplicate-safe schedules', async () => {
      const repository = createRepository()
      const created = await repository.remindersV1.create({
        reminderId: 'reminder:1',
        idempotencyKey: 'reminder-intent:1',
        message: 'Leave now',
        remindAt: 10,
        timezone: 'America/New_York',
        deliveryPolicy: 'critical',
        scheduleKey: 'schedule:commute',
        linkedTaskId: 'task:1',
      })
      expect(created).toMatchObject({ ok: true, value: { nextFireAt: 10, deliveryPolicy: 'critical' } })
      const snoozed = await repository.remindersV1.snooze('reminder:1', 0, 20)
      expect(snoozed).toMatchObject({ ok: true, revision: 1, value: { nextFireAt: 20, snoozedUntil: 20 } })
      const acknowledged = await repository.remindersV1.acknowledge('reminder:1', 1)
      expect(acknowledged).toMatchObject({ ok: true, revision: 2, value: { status: 'acknowledged' } })
      expect(acknowledged.ok && acknowledged.value.acknowledgedAt).toBeNumber()
      expect(await repository.remindersV1.create({
        reminderId: 'reminder:2',
        idempotencyKey: 'reminder-intent:1',
        message: 'Different',
        remindAt: 10,
        timezone: 'UTC',
      })).toMatchObject({ ok: false, reason: 'idempotency_conflict' })
    })

    test('notification intents suppress duplicates and enforce lifecycle revisions', async () => {
      const repository = createRepository()
      const input = {
        notificationIntentId: 'notification:1',
        idempotencyKey: 'notification-intent:1',
        reminderId: 'reminder:1',
        scheduledFor: 100,
        deliveryPolicy: 'persistent' as const,
        dedupeKey: 'reminder:1:100:device:1',
        targetDeviceId: 'device:1',
      }
      expect(await repository.notificationIntentsV1.create(input)).toMatchObject({
        ok: true,
        created: true,
        value: { lifecycle: 'queued', attempt: 0, escalationLevel: 0 },
      })
      expect(await repository.notificationIntentsV1.create({
        ...input,
        notificationIntentId: 'notification:duplicate',
        idempotencyKey: 'notification-intent:duplicate',
      })).toMatchObject({ ok: true, created: false, value: { notificationIntentId: 'notification:1' } })
      const dispatched = await repository.notificationIntentsV1.transition({
        notificationIntentId: 'notification:1',
        expectedRevision: 0,
        lifecycle: 'dispatched',
        attempt: 1,
        escalationLevel: 1,
      })
      expect(dispatched).toMatchObject({ ok: true, revision: 1, value: { lifecycle: 'dispatched', attempt: 1 } })
      expect(await repository.notificationIntentsV1.transition({
        notificationIntentId: 'notification:1',
        expectedRevision: 0,
        lifecycle: 'acknowledged',
      })).toMatchObject({ ok: false, reason: 'stale_revision' })
      expect(await repository.notificationIntentsV1.transition({
        notificationIntentId: 'notification:1',
        expectedRevision: 1,
        lifecycle: 'acknowledged',
      })).toMatchObject({ ok: true, revision: 2, value: { lifecycle: 'acknowledged' } })
      expect(await repository.notificationIntentsV1.transition({
        notificationIntentId: 'notification:1',
        expectedRevision: 2,
        lifecycle: 'queued',
      })).toMatchObject({ ok: false, reason: 'invalid_state' })
      expect((await repository.notificationIntentsV1.list({ targetDeviceId: 'device:1' })).items).toHaveLength(1)
      expect(await repository.notificationIntentsV1.tombstone('notification:1', 2)).toMatchObject({ ok: true, revision: 3 })
      expect((await repository.notificationIntentsV1.list()).items).toHaveLength(0)
    })

    test('calendar events retain lifecycle, source, and recurrence metadata', async () => {
      const repository = createRepository()
      const created = await repository.calendarV1.create({
        calendarEventId: 'event:1',
        idempotencyKey: 'event-intent:1',
        title: 'Korean lesson',
        startAt: 100,
        endAt: 200,
        timezone: 'UTC',
        allDay: false,
        location: 'Library',
        sourceUrl: 'https://calendar.google.com/event/1',
        recurrence: { rule: 'FREQ=WEEKLY', seriesId: 'google:series:1' },
      })
      expect(created).toMatchObject({ ok: true, value: { lifecycle: 'confirmed', recurrence: { rule: 'FREQ=WEEKLY' } } })
      expect(await repository.calendarV1.update({
        calendarEventId: 'event:1',
        expectedRevision: 0,
        patch: { lifecycle: 'cancelled' },
      })).toMatchObject({ ok: true, revision: 1, value: { lifecycle: 'cancelled' } })
      expect((await repository.calendarV1.list({ startsBefore: 150, endsAfter: 150 })).items).toHaveLength(1)
    })

    test('app notes store TipTap JSON strings plus derived preview metadata', async () => {
      const repository = createRepository()
      expect(await repository.notesV1.create({
        noteId: 'note:bad',
        idempotencyKey: 'note-intent:bad',
        contentJson: '{"type":"paragraph"}',
        plainTextPreview: 'bad',
        wordCount: 1,
      })).toMatchObject({ ok: false, reason: 'invalid_input' })
      const created = await repository.notesV1.create({
        noteId: 'note:1',
        idempotencyKey: 'note-intent:1',
        title: 'Lesson notes',
        contentJson: TIPTAP_DOCUMENT,
        plainTextPreview: 'Hello world',
        wordCount: 2,
        tags: ['language'],
      })
      expect(created).toMatchObject({ ok: true, value: { wordCount: 2 } })
      expect((await repository.notesV1.list({ tag: 'language' })).items).toHaveLength(1)
    })

    test('source and knowledge projections remain compact and provenance linked', async () => {
      const repository = createRepository()
      expect(await repository.sourceRefsV1.put({
        sourceRefId: 'source:local-secret',
        idempotencyKey: 'source-intent:bad',
        kind: 'document',
        displayName: 'Private path',
        sourceUrl: 'file:///Users/me/private.txt',
        syncState: 'pending',
        indexState: 'pending',
      })).toMatchObject({ ok: false, reason: 'invalid_input' })
      expect(await repository.sourceRefsV1.put({
        sourceRefId: 'source:1',
        idempotencyKey: 'source-intent:1',
        kind: 'calendar',
        displayName: 'Weekly planning',
        sourceUrl: 'https://example.com/meeting/1',
        syncState: 'synced',
        indexState: 'indexed',
        provenanceIds: ['capture:1'],
      })).toMatchObject({ ok: true, value: { provenanceIds: ['capture:1'] } })
      expect(await repository.knowledgeV1.put({
        knowledgeDocumentId: 'knowledge:1',
        idempotencyKey: 'knowledge-intent:1',
        kind: 'project',
        title: 'Kriyan',
        summary: 'Personal productivity system',
        tags: ['product'],
        sourceRefIds: ['source:1'],
        provenanceIds: ['source:1', 'capture:1'],
        syncState: 'synced',
        indexState: 'indexed',
      })).toMatchObject({ ok: true, value: { summary: 'Personal productivity system' } })
      expect((await repository.knowledgeV1.list({ kind: 'project', tag: 'product' })).items).toHaveLength(1)
    })
  })
}
