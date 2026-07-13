import { convexTest } from 'convex-test'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const paginationOpts = { numItems: 100, cursor: null }

function backend() {
  return convexTest(schema, modules)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000)
})

afterEach(() => {
  vi.useRealTimers()
})

async function createInstallation(t: ReturnType<typeof backend>) {
  await t.mutation(api.installations.create, {
    installationId: 'installation:product',
    timezone: 'America/New_York',
    protocolVersion: '1',
  })
}

async function createReminder(t: ReturnType<typeof backend>) {
  return await t.mutation(api.projections.createReminder, {
    installationId: 'installation:product',
    reminderId: 'reminder:practice',
    idempotencyKey: 'reminder:practice:create',
    scheduleKey: 'schedule:practice',
    message: 'Practice Korean',
    remindAt: 2_000,
    timezone: 'America/New_York',
    deliveryPolicy: 'persistent',
    linkedTaskId: 'task:practice',
    entityId: 'entity:korean',
    status: 'scheduled',
  })
}

describe('product projection contracts', () => {
  test('tasks retain rich fields, replay safely, and protect revisions and tombstones', async () => {
    const t = backend()
    await createInstallation(t)
    const input = {
      installationId: 'installation:product',
      taskId: 'task:practice',
      idempotencyKey: 'task:practice:create',
      title: 'Practice Korean',
      description: 'Complete one lesson',
      tags: ['language', 'daily'],
      priority: 'high' as const,
      status: 'open' as const,
      startAt: 1_500,
      dueAt: 3_000,
      projectId: 'project:language',
      entityId: 'entity:korean',
    }
    const created = await t.mutation(api.projections.createTask, input)
    const replay = await t.mutation(api.projections.createTask, input)
    expect(created.created).toBe(true)
    expect(replay).toMatchObject({ created: false, task: input })
    expect(await t.mutation(api.projections.updateTask, {
      installationId: input.installationId,
      taskId: input.taskId,
      expectedRevision: 0,
      priority: 'urgent',
      clearDescription: true,
    })).toEqual({ ok: true, revision: 1 })
    expect(await t.mutation(api.projections.updateTask, {
      installationId: input.installationId,
      taskId: input.taskId,
      expectedRevision: 0,
      title: 'stale',
    })).toEqual({ ok: false, reason: 'stale_revision' })
    expect(await t.mutation(api.projections.tombstoneTask, {
      installationId: input.installationId,
      taskId: input.taskId,
      expectedRevision: 1,
    })).toEqual({ ok: true, revision: 2 })
    expect(await t.query(api.projections.getTask, {
      installationId: input.installationId,
      taskId: input.taskId,
    })).toBeNull()
  })

  test('reminders model attention, next fire, snooze, acknowledgement, and schedule dedupe', async () => {
    const t = backend()
    await createInstallation(t)
    const created = await createReminder(t)
    expect(created.reminder).toMatchObject({
      nextFireAt: 2_000,
      deliveryPolicy: 'persistent',
      scheduleKey: 'schedule:practice',
      fireCount: 0,
    })
    expect((await createReminder(t)).created).toBe(false)
    expect(await t.mutation(api.projections.markReminderFired, {
      installationId: 'installation:product',
      reminderId: 'reminder:practice',
      expectedRevision: 0,
    })).toEqual({ ok: true, revision: 1 })
    vi.setSystemTime(2_000)
    expect(await t.mutation(api.projections.snoozeReminder, {
      installationId: 'installation:product',
      reminderId: 'reminder:practice',
      expectedRevision: 1,
      snoozedUntil: 5_000,
    })).toEqual({ ok: true, revision: 2 })
    const attention = await t.query(api.projections.listAttentionReminders, {
      installationId: 'installation:product',
      nextFireBefore: 5_000,
      paginationOpts,
    })
    expect(attention.page).toHaveLength(1)
    expect(attention.page[0]).toMatchObject({
      status: 'scheduled',
      nextFireAt: 5_000,
      snoozedUntil: 5_000,
      fireCount: 1,
    })
    expect(await t.mutation(api.projections.acknowledgeReminder, {
      installationId: 'installation:product',
      reminderId: 'reminder:practice',
      expectedRevision: 2,
    })).toEqual({ ok: true, revision: 3 })
    expect((await t.query(api.projections.getReminder, {
      installationId: 'installation:product',
      reminderId: 'reminder:practice',
    }))?.status).toBe('acknowledged')
  })

  test('calendar events preserve recurrence and future sync identifiers', async () => {
    const t = backend()
    await createInstallation(t)
    const input = {
      installationId: 'installation:product',
      calendarEventId: 'event:lesson',
      idempotencyKey: 'event:lesson:create',
      title: 'Korean lesson',
      description: 'Weekly tutor call',
      startAt: 10_000,
      endAt: 11_000,
      timezone: 'America/New_York',
      allDay: false,
      location: 'Online',
      sourceUrl: 'https://calendar.google.com/event/lesson',
      status: 'confirmed' as const,
      sourceProvider: 'google',
      externalCalendarId: 'calendar:primary',
      externalEventId: 'external:lesson',
      recurrenceRule: 'RRULE:FREQ=WEEKLY',
      recurringEventId: 'series:lesson',
      originalStartAt: 10_000,
      sourceRefId: 'source:calendar',
    }
    expect((await t.mutation(api.calendar.create, input)).created).toBe(true)
    expect((await t.mutation(api.calendar.create, input)).created).toBe(false)
    expect((await t.query(api.calendar.list, {
      installationId: input.installationId,
      status: 'confirmed',
      startsAfter: 9_000,
      startsBefore: 10_000,
      paginationOpts,
    })).page[0]).toMatchObject({
      recurrenceRule: 'RRULE:FREQ=WEEKLY',
      externalEventId: 'external:lesson',
    })
    expect(await t.mutation(api.calendar.update, {
      installationId: input.installationId,
      calendarEventId: input.calendarEventId,
      expectedRevision: 0,
      endAt: 12_000,
      status: 'tentative',
    })).toEqual({ ok: true, revision: 1 })
    expect(await t.mutation(api.calendar.tombstone, {
      installationId: input.installationId,
      calendarEventId: input.calendarEventId,
      expectedRevision: 1,
    })).toEqual({ ok: true, revision: 2 })
  })

  test('app notes store bounded TipTap JSON and preview metadata, not Markdown bodies', async () => {
    const t = backend()
    await createInstallation(t)
    const contentJson = JSON.stringify({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
    })
    const created = await t.mutation(api.notes.create, {
      installationId: 'installation:product',
      noteId: 'note:hello',
      idempotencyKey: 'note:hello:create',
      title: 'Hello',
      contentJson,
      plainTextPreview: 'Hello',
      wordCount: 1,
      tags: ['draft'],
      entityId: 'entity:hello',
    })
    expect(created.note.contentJson).toBe(contentJson)
    expect(await t.mutation(api.notes.update, {
      installationId: 'installation:product',
      noteId: 'note:hello',
      expectedRevision: 0,
      clearTitle: true,
      plainTextPreview: '',
      wordCount: 0,
    })).toEqual({ ok: true, revision: 1 })
    await expect(t.mutation(api.notes.create, {
      installationId: 'installation:product',
      noteId: 'note:invalid',
      idempotencyKey: 'note:invalid:create',
      contentJson: '{"type":"not-doc"}',
      plainTextPreview: '',
      wordCount: 0,
      tags: [],
    })).rejects.toThrow('root must be a TipTap doc')
  })

  test('source and knowledge projections are compact, revisioned, and replay safe', async () => {
    const t = backend()
    await createInstallation(t)
    const source = {
      installationId: 'installation:product',
      sourceRefId: 'source:video',
      idempotencyKey: 'source:video:sync:1',
      kind: 'video' as const,
      displayName: 'Korean lesson recording',
      sourceUrl: 'https://example.com/video',
      externalId: 'video:123',
      contentHash: 'sha256:abc',
      syncState: 'synced' as const,
      indexState: 'indexed' as const,
      provenanceIds: ['provenance:video:1'],
      lastSyncedAt: 900,
    }
    expect(await t.mutation(api.knowledge.upsertSourceRef, source)).toEqual({
      ok: true,
      created: true,
      revision: 0,
    })
    expect(await t.mutation(api.knowledge.upsertSourceRef, source)).toEqual({
      ok: true,
      created: false,
      revision: 0,
    })
    expect(await t.mutation(api.knowledge.upsertSourceRef, {
      ...source,
      displayName: 'Updated',
      expectedRevision: 9,
    })).toEqual({ ok: false, reason: 'stale_revision' })
    const knowledge = {
      installationId: 'installation:product',
      knowledgeDocumentId: 'knowledge:korean',
      idempotencyKey: 'knowledge:korean:sync:1',
      kind: 'topic' as const,
      title: 'Korean',
      summary: 'Current learning context with provenance.',
      tags: ['language'],
      sourceRefIds: ['source:video'],
      provenanceIds: ['provenance:video:1'],
      syncState: 'synced' as const,
      indexState: 'indexed' as const,
    }
    expect(await t.mutation(api.knowledge.upsertKnowledgeDocument, knowledge))
      .toEqual({ ok: true, created: true, revision: 0 })
    expect((await t.query(api.knowledge.listKnowledgeDocuments, {
      installationId: 'installation:product',
      kind: 'topic',
      paginationOpts,
    })).page[0]).toMatchObject({
      title: 'Korean',
      sourceRefIds: ['source:video'],
      provenanceIds: ['provenance:video:1'],
    })
    await expect(t.mutation(api.knowledge.upsertSourceRef, {
      ...source,
      sourceUrl: 'file:///Users/private/transcript.md',
      expectedRevision: 0,
    })).rejects.toThrow('absolute HTTP(S) URL')
  })

  test('notification intents dedupe and enforce deterministic delivery coordination transitions', async () => {
    const t = backend()
    await createInstallation(t)
    await createReminder(t)
    const input = {
      installationId: 'installation:product',
      notificationIntentId: 'notification:practice:1',
      reminderId: 'reminder:practice',
      scheduledFor: 2_000,
      deliveryPolicy: 'persistent' as const,
      dedupeKey: 'notification:practice:fire:1',
      targetDeviceId: 'device:phone',
    }
    expect((await t.mutation(api.notifications.create, input)).created).toBe(true)
    expect((await t.mutation(api.notifications.create, input)).created).toBe(false)
    expect(await t.mutation(api.notifications.markDispatched, {
      installationId: input.installationId,
      notificationIntentId: input.notificationIntentId,
      expectedRevision: 0,
    })).toEqual({ ok: true, revision: 1 })
    expect(await t.mutation(api.notifications.markDispatched, {
      installationId: input.installationId,
      notificationIntentId: input.notificationIntentId,
      expectedRevision: 0,
    })).toEqual({ ok: false, reason: 'invalid_state' })
    expect(await t.mutation(api.notifications.fail, {
      installationId: input.installationId,
      notificationIntentId: input.notificationIntentId,
      expectedRevision: 1,
      error: 'device offline',
    })).toEqual({ ok: true, revision: 2 })
    expect(await t.mutation(api.notifications.requeue, {
      installationId: input.installationId,
      notificationIntentId: input.notificationIntentId,
      expectedRevision: 2,
      scheduledFor: 4_000,
      escalationLevel: 1,
    })).toEqual({ ok: true, revision: 3 })
    expect(await t.mutation(api.notifications.markDispatched, {
      installationId: input.installationId,
      notificationIntentId: input.notificationIntentId,
      expectedRevision: 3,
    })).toEqual({ ok: true, revision: 4 })
    expect(await t.mutation(api.notifications.acknowledge, {
      installationId: input.installationId,
      notificationIntentId: input.notificationIntentId,
      expectedRevision: 4,
    })).toEqual({ ok: true, revision: 5 })
    expect(await t.mutation(api.notifications.cancel, {
      installationId: input.installationId,
      notificationIntentId: input.notificationIntentId,
      expectedRevision: 5,
    })).toEqual({ ok: false, reason: 'invalid_state' })
    expect(await t.query(api.notifications.get, {
      installationId: input.installationId,
      notificationIntentId: input.notificationIntentId,
    })).toMatchObject({
      lifecycle: 'acknowledged',
      attempt: 2,
      escalationLevel: 1,
      targetDeviceId: 'device:phone',
    })
  })
})
