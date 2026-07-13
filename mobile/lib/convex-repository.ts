/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ConvexProductRepository, createReactiveSnapshotStore, deriveActivity,
  type AppNoteItem, type CalendarEventItem, type InjectedConvexProductClient,
  type KnowledgeDocumentItem, type NotificationIntentItem, type ProductMutationResult, type ProductPage,
  type ProductRepository, type ReactiveClientRepository, type ReminderItem, type SourceRefItem, type TaskItem,
} from '@kriyan/client-core'
import { ConvexClient } from 'convex/browser'

import { api } from '@convex/_generated/api'

const pageArgs = (filter?: { cursor?: string | null; limit?: number }) => ({ cursor: filter?.cursor ?? null, numItems: filter?.limit ?? 100 })
const page = <T,>(value: any): ProductPage<T> => ({ items: value.page as T[], cursor: value.isDone ? null : value.continueCursor, done: value.isDone })
const failure = <T,>(reason: string): ProductMutationResult<T> => ({ ok: false, reason: reason as any, message: `Convex rejected the write: ${reason}.` })
const success = <T,>(created: boolean, value: T): ProductMutationResult<T> => ({ ok: true, created, revision: (value as any).revision, value })
const event = (value: any): CalendarEventItem => ({ ...value, lifecycle: value.status, recurrence: value.recurrenceRule ? { rule: value.recurrenceRule } : undefined })

export async function createConvexRepository(url: string): Promise<ProductRepository & ReactiveClientRepository> {
  const client = new ConvexClient(url)
  const snapshots = createReactiveSnapshotStore()
  const installationId = process.env.EXPO_PUBLIC_INSTALLATION_ID ?? 'mobile:default'
  await client.mutation(api.installations.create, { installationId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, protocolVersion: '1' })
  const fromSnapshot = async <T,>(read: () => T | undefined): Promise<T | null> => {
    const current = read(); if (current !== undefined) return current
    return await new Promise((resolve) => {
      const timeout = setTimeout(() => { unsubscribe(); resolve(null) }, 2_000)
      const unsubscribe = snapshots.subscribe(() => {
        const next = read(); if (next === undefined) return
        clearTimeout(timeout); unsubscribe(); resolve(next)
      })
    })
  }
  const getTask = async (taskId: string, _includeDeleted = false) => fromSnapshot(() => snapshots.getSnapshot().productivity.tasks.find((item) => item.taskId === taskId))
  const getReminder = async (reminderId: string, _includeDeleted = false) => fromSnapshot(() => snapshots.getSnapshot().productivity.reminders.find((item) => item.reminderId === reminderId))
  const getIntent = async (notificationIntentId: string) => fromSnapshot(() => snapshots.getSnapshot().productivity.notificationIntents.find((item) => item.notificationIntentId === notificationIntentId))
  const getEvent = async (calendarEventId: string, _includeDeleted = false) => fromSnapshot(() => snapshots.getSnapshot().productivity.calendarEvents.find((item) => item.calendarEventId === calendarEventId))
  const getNote = async (noteId: string, _includeDeleted = false) => fromSnapshot(() => snapshots.getSnapshot().productivity.notes.find((item) => item.noteId === noteId))
  const getSource = async (sourceRefId: string) => fromSnapshot(() => snapshots.getSnapshot().knowledge.sources.find((item) => item.sourceRefId === sourceRefId))
  const getKnowledge = async (knowledgeDocumentId: string) => fromSnapshot(() => snapshots.getSnapshot().knowledge.documents.find((item) => item.knowledgeDocumentId === knowledgeDocumentId))
  const after = async <T,>(transition: any, load: () => Promise<T | null>): Promise<ProductMutationResult<T>> => {
    if (!transition.ok) return failure(transition.reason)
    const value = await load()
    return value ? { ok: true, created: false, revision: transition.revision, value: { ...value as object, revision: transition.revision } as T } : failure('not_found')
  }

  const injected: InjectedConvexProductClient = {
    tasksV1: {
      list: async (filter = {}) => { const value: any = await client.query(api.projections.listTasks, { installationId, status: filter.status, dueBefore: filter.dueBefore, includeDeleted: filter.includeDeleted, paginationOpts: pageArgs(filter) }); const result = page<TaskItem>(value); result.items = result.items.filter((item) => (!filter.tag || item.tags?.includes(filter.tag)) && (!filter.projectId || item.projectId === filter.projectId) && (!filter.entityId || item.entityId === filter.entityId) && (!filter.startsBefore || (item.startAt ?? Infinity) <= filter.startsBefore)); return result },
      create: async (input) => { const value: any = await client.mutation(api.projections.createTask, { installationId, ...input, status: input.status ?? 'open' }); return success(value.created, value.task) },
      update: async (input) => { const patch = input.patch; if (patch.status !== undefined) { const status = await client.mutation(api.projections.setTaskStatus, { installationId, taskId: input.taskId, expectedRevision: input.expectedRevision, status: patch.status }); if (!status.ok) return failure(status.reason); input = { ...input, expectedRevision: status.revision, patch: { ...patch, status: undefined } } } const value = await client.mutation(api.projections.updateTask, { installationId, taskId: input.taskId, expectedRevision: input.expectedRevision, title: input.patch.title, description: input.patch.description ?? undefined, clearDescription: input.patch.description === null, tags: input.patch.tags, priority: input.patch.priority ?? undefined, clearPriority: input.patch.priority === null, startAt: input.patch.startAt ?? undefined, clearStartAt: input.patch.startAt === null, dueAt: input.patch.dueAt ?? undefined, clearDueAt: input.patch.dueAt === null, projectId: input.patch.projectId ?? undefined, clearProjectId: input.patch.projectId === null, entityId: input.patch.entityId ?? undefined, clearEntityId: input.patch.entityId === null }); return after(value, () => getTask(input.taskId)) },
      tombstone: async (id, revision) => after(await client.mutation(api.projections.tombstoneTask, { installationId, taskId: id, expectedRevision: revision }), () => getTask(id, true)),
    },
    remindersV1: {
      list: async (filter = {}) => { const value: any = await client.query(api.projections.listReminders, { installationId, status: filter.status, remindBefore: filter.firesBefore, includeDeleted: filter.includeDeleted, paginationOpts: pageArgs(filter) }); const result = page<ReminderItem>(value); result.items = result.items.filter((item) => (!filter.deliveryPolicy || item.deliveryPolicy === filter.deliveryPolicy) && (!filter.linkedTaskId || item.linkedTaskId === filter.linkedTaskId) && (!filter.entityId || item.entityId === filter.entityId)); return result },
      create: async (input) => { const value: any = await client.mutation(api.projections.createReminder, { installationId, ...input, status: input.status ?? 'scheduled' }); return success(value.created, value.reminder) },
      update: async (input) => { const patch = input.patch; if (patch.status !== undefined) { const status = await client.mutation(api.projections.setReminderStatus, { installationId, reminderId: input.reminderId, expectedRevision: input.expectedRevision, status: patch.status }); if (!status.ok) return failure(status.reason); input = { ...input, expectedRevision: status.revision, patch: { ...patch, status: undefined } } } const value = await client.mutation(api.projections.updateReminder, { installationId, reminderId: input.reminderId, expectedRevision: input.expectedRevision, message: input.patch.message, remindAt: input.patch.remindAt, nextFireAt: input.patch.nextFireAt ?? undefined, clearNextFireAt: input.patch.nextFireAt === null, timezone: input.patch.timezone, deliveryPolicy: input.patch.deliveryPolicy, linkedTaskId: input.patch.linkedTaskId ?? undefined, clearLinkedTaskId: input.patch.linkedTaskId === null, entityId: input.patch.entityId ?? undefined, clearEntityId: input.patch.entityId === null }); return after(value, () => getReminder(input.reminderId)) },
      acknowledge: async (id, revision) => after(await client.mutation(api.projections.acknowledgeReminder, { installationId, reminderId: id, expectedRevision: revision }), () => getReminder(id)),
      snooze: async (id, revision, nextFireAt) => after(await client.mutation(api.projections.snoozeReminder, { installationId, reminderId: id, expectedRevision: revision, snoozedUntil: nextFireAt }), () => getReminder(id)),
      tombstone: async (id, revision) => after(await client.mutation(api.projections.tombstoneReminder, { installationId, reminderId: id, expectedRevision: revision }), () => getReminder(id, true)),
    },
    notificationIntentsV1: {
      list: async (filter = {}) => { const value: any = await client.query(api.notifications.list, { installationId, lifecycle: filter.lifecycle, scheduledBefore: filter.scheduledBefore, paginationOpts: pageArgs(filter) }); const result = page<NotificationIntentItem>(value); result.items = result.items.filter((item) => (!filter.reminderId || item.reminderId === filter.reminderId) && (!filter.deliveryPolicy || item.deliveryPolicy === filter.deliveryPolicy) && (!filter.targetDeviceId || item.targetDeviceId === filter.targetDeviceId)); return result },
      create: async (input) => { const { idempotencyKey: _, ...args } = input; const value: any = await client.mutation(api.notifications.create, { installationId, ...args }); return success(value.created, value.intent) },
      transition: async (input) => { const base = { installationId, notificationIntentId: input.notificationIntentId, expectedRevision: input.expectedRevision }; let value: any; if (input.lifecycle === 'dispatched') value = await client.mutation(api.notifications.markDispatched, base); else if (input.lifecycle === 'acknowledged') value = await client.mutation(api.notifications.acknowledge, base); else if (input.lifecycle === 'failed') value = await client.mutation(api.notifications.fail, { ...base, error: input.lastError ?? 'delivery failed' }); else if (input.lifecycle === 'cancelled') value = await client.mutation(api.notifications.cancel, base); else return failure('invalid_state'); return after(value, () => getIntent(input.notificationIntentId)) },
      tombstone: async (id, revision) => after(await client.mutation(api.notifications.cancel, { installationId, notificationIntentId: id, expectedRevision: revision }), () => getIntent(id)),
    },
    calendarV1: {
      list: async (filter = {}) => { const value: any = await client.query(api.calendar.list, { installationId, status: filter.lifecycle, startsBefore: filter.startsBefore, startsAfter: filter.endsAfter, paginationOpts: pageArgs(filter) }); const result = page<any>(value); return { ...result, items: result.items.map(event) } },
      create: async (input) => { const value: any = await client.mutation(api.calendar.create, { installationId, calendarEventId: input.calendarEventId, idempotencyKey: input.idempotencyKey, title: input.title, description: input.description, startAt: input.startAt, endAt: input.endAt, timezone: input.timezone, allDay: input.allDay, location: input.location, sourceUrl: input.sourceUrl, status: input.lifecycle ?? 'confirmed', recurrenceRule: input.recurrence?.rule, recurringEventId: input.recurrence?.seriesId, originalStartAt: input.recurrence?.providerUpdatedAt }); return success(value.created, event(value.event)) },
      update: async (input) => after(await client.mutation(api.calendar.update, { installationId, calendarEventId: input.calendarEventId, expectedRevision: input.expectedRevision, title: input.patch.title, description: input.patch.description ?? undefined, startAt: input.patch.startAt, endAt: input.patch.endAt, timezone: input.patch.timezone, allDay: input.patch.allDay, location: input.patch.location ?? undefined, sourceUrl: input.patch.sourceUrl ?? undefined, status: input.patch.lifecycle, recurrenceRule: input.patch.recurrence?.rule }), () => getEvent(input.calendarEventId)),
      tombstone: async (id, revision) => after(await client.mutation(api.calendar.tombstone, { installationId, calendarEventId: id, expectedRevision: revision }), () => getEvent(id, true)),
    },
    notesV1: {
      list: async (filter = {}) => { const result = page<AppNoteItem>(await client.query(api.notes.list, { installationId, paginationOpts: pageArgs(filter) })); result.items = result.items.filter((item) => !filter.tag || item.tags.includes(filter.tag)); return result },
      create: async (input) => { const value: any = await client.mutation(api.notes.create, { installationId, ...input, tags: input.tags ?? [] }); return success(value.created, value.note) },
      update: async (input) => after(await client.mutation(api.notes.update, { installationId, noteId: input.noteId, expectedRevision: input.expectedRevision, title: input.patch.title ?? undefined, clearTitle: input.patch.title === null, contentJson: input.patch.contentJson, plainTextPreview: input.patch.plainTextPreview, wordCount: input.patch.wordCount, tags: input.patch.tags, entityId: input.patch.entityId ?? undefined, clearEntityId: input.patch.entityId === null }), () => getNote(input.noteId)),
      tombstone: async (id, revision) => after(await client.mutation(api.notes.tombstone, { installationId, noteId: id, expectedRevision: revision }), () => getNote(id, true)),
    },
    sourceRefsV1: {
      list: async (filter = {}) => { const value: any = await client.query(api.knowledge.listSourceRefs, { installationId, kind: filter.kind, state: filter.syncState, paginationOpts: pageArgs(filter) }); const result = page<SourceRefItem>(value); result.items = result.items.filter((item) => !filter.indexState || item.indexState === filter.indexState); return result },
      put: async (input) => { const value: any = await client.mutation(api.knowledge.upsertSourceRef, { installationId, ...input, provenanceIds: input.provenanceIds ?? [] }); const item = await getSource(input.sourceRefId); return value.ok && item ? success(value.created, item) : failure(value.reason ?? 'not_found') },
      update: async (input) => { const current = await getSource(input.sourceRefId); if (!current) return failure('not_found'); const next: SourceRefItem = { ...current, ...Object.fromEntries(Object.entries(input.patch).filter(([, value]) => value !== undefined && value !== null)) } as SourceRefItem; const value: any = await client.mutation(api.knowledge.upsertSourceRef, { installationId, sourceRefId: current.sourceRefId, idempotencyKey: `source:${current.sourceRefId}`, kind: current.kind, displayName: next.displayName, sourceUrl: input.patch.sourceUrl === null ? undefined : next.sourceUrl, externalId: input.patch.externalId === null ? undefined : next.externalId, contentHash: input.patch.contentHash === null ? undefined : next.contentHash, syncState: next.syncState, indexState: next.indexState, provenanceIds: next.provenanceIds, lastSyncedAt: input.patch.lastSyncedAt === null ? undefined : next.lastSyncedAt, expectedRevision: input.expectedRevision }); const item = await getSource(input.sourceRefId); return value.ok && item ? success(false, item) : failure(value.reason ?? 'not_found') },
      tombstone: async (id, revision) => after(await client.mutation(api.knowledge.tombstoneProjection, { installationId, kind: 'source', projectionId: id, expectedRevision: revision }), () => getSource(id)),
    },
    knowledgeV1: {
      list: async (filter = {}) => { const value: any = await client.query(api.knowledge.listKnowledgeDocuments, { installationId, kind: filter.kind, state: filter.syncState, paginationOpts: pageArgs(filter) }); const result = page<KnowledgeDocumentItem>(value); result.items = result.items.filter((item) => (!filter.tag || item.tags.includes(filter.tag)) && (!filter.indexState || item.indexState === filter.indexState)); return result },
      put: async (input) => { const value: any = await client.mutation(api.knowledge.upsertKnowledgeDocument, { installationId, ...input, tags: input.tags ?? [], sourceRefIds: input.sourceRefIds ?? [], provenanceIds: input.provenanceIds ?? [] }); const item = await getKnowledge(input.knowledgeDocumentId); return value.ok && item ? success(value.created, item) : failure(value.reason ?? 'not_found') },
      update: async (input) => { const current = await getKnowledge(input.knowledgeDocumentId); if (!current) return failure('not_found'); const next = { ...current, ...input.patch }; const value: any = await client.mutation(api.knowledge.upsertKnowledgeDocument, { installationId, knowledgeDocumentId: current.knowledgeDocumentId, idempotencyKey: `knowledge:${current.knowledgeDocumentId}`, kind: next.kind, title: next.title, summary: next.summary, tags: next.tags, sourceRefIds: next.sourceRefIds, provenanceIds: next.provenanceIds, syncState: next.syncState, indexState: next.indexState, expectedRevision: input.expectedRevision }); const item = await getKnowledge(input.knowledgeDocumentId); return value.ok && item ? success(false, item) : failure(value.reason ?? 'not_found') },
      tombstone: async (id, revision) => after(await client.mutation(api.knowledge.tombstoneProjection, { installationId, kind: 'knowledge', projectionId: id, expectedRevision: revision }), () => getKnowledge(id)),
    },
  }
  const repository = new ConvexProductRepository(injected)
  const unsubscribe = client.onUpdate(api.read.clientSnapshot, { installationId }, (value: any) => {
    snapshots.replace({
      productivity: {
        tasks: value.productivity.tasks,
        reminders: value.productivity.reminders,
        calendarEvents: value.productivity.calendarEvents.map(event),
        notes: value.productivity.notes,
        notificationIntents: value.productivity.notificationIntents,
      },
      agents: value.agents,
      knowledge: value.knowledge,
      nodes: { items: value.nodes.items, activity: deriveActivity(value.nodes.activity) },
      connection: 'online',
    })
  }, (cause: Error) => snapshots.replace({ ...snapshots.getSnapshot(), connection: 'offline', error: cause.message }))
  return Object.assign(repository, {
    getSnapshot: snapshots.getSnapshot,
    subscribe: snapshots.subscribe,
    dispose(): void {
      unsubscribe()
      snapshots.dispose()
      void client.close()
    },
  })
}
