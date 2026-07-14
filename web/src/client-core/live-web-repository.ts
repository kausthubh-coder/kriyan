'use client'

import {
  createClientId,
  deriveActivity,
  normalizeTransitionReason,
  PAGE_SIZE,
  type ActionResult,
  type AppNoteItem,
  type CalendarEventItem,
  type KnowledgeDocumentItem,
  type ReminderItem,
  type SourceRefItem,
  type TaskItem,
  type ReactiveClientRepository,
  type ClientSnapshot,
  type SnapshotSubscriptionTransport,
} from '@kriyan/client-core'
import { parseClientSnapshotWire, type SnapshotCalendarEventWire } from '@kriyan/contracts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'

import { api } from '@convex/_generated/api'
import type { KriyanWebConfiguration } from '@/lib/convex'

import { useConvexRepository } from './convex-repository'
import type { WebRepository } from './web-repository'
import { createWebReactiveRepository } from './reactive-web-adapter'

function createSnapshotBridge(): {
  repository: ReactiveClientRepository
  publish(snapshot: ClientSnapshot): void
  fail(error: Error): void
} {
  const listeners = new Set<{ next: (snapshot: ClientSnapshot) => void; error: (error: Error) => void }>()
  const transport: SnapshotSubscriptionTransport = {
    subscribe(next, error) {
      const listener = { next, error }; listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() { listeners.clear() },
  }
  return {
    repository: createWebReactiveRepository(transport),
    publish(snapshot) { for (const listener of [...listeners]) listener.next(snapshot) },
    fail(error) { for (const listener of [...listeners]) listener.error(error) },
  }
}

function failure(reason: unknown, error?: unknown): ActionResult<never> {
  const normalized = normalizeTransitionReason(reason)
  return {
    ok: false,
    reason: normalized,
    message: error instanceof Error ? error.message : normalized === 'stale_revision'
      ? 'This changed in another session. Your edit was not applied; review the latest version and try again.'
      : 'Kriyan could not save that change. Try again.',
  }
}

function mapEvent(value: SnapshotCalendarEventWire): CalendarEventItem {
  const { status, ...event } = value
  return {
    ...event,
    lifecycle: status,
    recurrence: value.recurrenceRule ? { rule: value.recurrenceRule } : undefined,
  }
}

export function useLiveWebRepository(
  configuration: KriyanWebConfiguration,
  selectedRunId: string | null,
  clientGeneration: number,
): { repository: WebRepository; reactiveRepository: ReactiveClientRepository; connectionMode: ReturnType<typeof useConvexRepository>['connectionMode']; connectionRecoveryRequired: boolean } {
  const base = useConvexRepository(configuration, selectedRunId, clientGeneration)
  const { installationId } = configuration
  const [localPending, setLocalPending] = useState<ReadonlySet<string>>(new Set())
  const pendingRef = useRef(new Set<string>())
  const calendarPage = usePaginatedQuery(api.calendar.list, { installationId }, { initialNumItems: PAGE_SIZE })
  const notesPage = usePaginatedQuery(api.notes.list, { installationId }, { initialNumItems: PAGE_SIZE })
  const sourcesPage = usePaginatedQuery(api.knowledge.listSourceRefs, { installationId }, { initialNumItems: PAGE_SIZE })
  const knowledgePage = usePaginatedQuery(api.knowledge.listKnowledgeDocuments, { installationId }, { initialNumItems: PAGE_SIZE })
  const contractSnapshot = useQuery(api.read.clientSnapshot, { installationId })

  const createTask = useMutation(api.projections.createTask)
  const updateTask = useMutation(api.projections.updateTask)
  const createReminder = useMutation(api.projections.createReminder)
  const updateReminder = useMutation(api.projections.updateReminder)
  const acknowledgeReminder = useMutation(api.projections.acknowledgeReminder)
  const snoozeReminder = useMutation(api.projections.snoozeReminder)
  const createCalendar = useMutation(api.calendar.create)
  const updateCalendar = useMutation(api.calendar.update)
  const deleteCalendar = useMutation(api.calendar.tombstone)
  const createNote = useMutation(api.notes.create)
  const updateNote = useMutation(api.notes.update)
  const deleteNote = useMutation(api.notes.tombstone)

  async function exclusive<T>(key: string, operation: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
    if (pendingRef.current.has(key)) return failure('invalid_state')
    pendingRef.current = new Set(pendingRef.current).add(key)
    setLocalPending(pendingRef.current)
    try { return await operation() } finally {
      const next = new Set(pendingRef.current)
      next.delete(key)
      pendingRef.current = next
      setLocalPending(next)
    }
  }

  const calendarEvents = useMemo(
    () => (calendarPage.results as unknown as SnapshotCalendarEventWire[]).map(mapEvent),
    [calendarPage.results],
  )
  const pending = useMemo(() => new Set([...base.repository.pending, ...localPending]), [base.repository.pending, localPending])
  const extraLoading = [calendarPage.status, notesPage.status, sourcesPage.status, knowledgePage.status]
    .some((status) => status === 'LoadingFirstPage')

  const repository: WebRepository = {
    ...base.repository,
    calendarEvents,
    notes: notesPage.results as AppNoteItem[],
    sourceRefs: sourcesPage.results as SourceRefItem[],
    knowledgeDocuments: knowledgePage.results as KnowledgeDocumentItem[],
    loading: base.repository.loading || extraLoading,
    pending,
    pages: {
      ...base.repository.pages,
      calendar: { loadedCount: calendarPage.results.length, canLoadMore: calendarPage.status === 'CanLoadMore', loadingMore: calendarPage.status === 'LoadingMore' },
      notes: { loadedCount: notesPage.results.length, canLoadMore: notesPage.status === 'CanLoadMore', loadingMore: notesPage.status === 'LoadingMore' },
      sources: { loadedCount: sourcesPage.results.length, canLoadMore: sourcesPage.status === 'CanLoadMore', loadingMore: sourcesPage.status === 'LoadingMore' },
      knowledge: { loadedCount: knowledgePage.results.length, canLoadMore: knowledgePage.status === 'CanLoadMore', loadingMore: knowledgePage.status === 'LoadingMore' },
    },
    loadMore(name) {
      if (name in base.repository.pages) base.repository.loadMore(name as keyof typeof base.repository.pages)
      if (name === 'calendar' && calendarPage.status === 'CanLoadMore') calendarPage.loadMore(PAGE_SIZE)
      if (name === 'notes' && notesPage.status === 'CanLoadMore') notesPage.loadMore(PAGE_SIZE)
      if (name === 'sources' && sourcesPage.status === 'CanLoadMore') sourcesPage.loadMore(PAGE_SIZE)
      if (name === 'knowledge' && knowledgePage.status === 'CanLoadMore') knowledgePage.loadMore(PAGE_SIZE)
    },
    createTask(input) {
      return exclusive('task:create', async () => {
        try {
          const result = await createTask({ installationId, taskId: createClientId('task'), idempotencyKey: createClientId('task-intent'), ...input, status: 'open' })
          return { ok: true, value: result.task as TaskItem }
        } catch (error) { return failure('transport_error', error) }
      })
    },
    updateTask(task, patch) {
      return exclusive(`task:${task.taskId}`, async () => {
        try {
          const result = await updateTask({
            installationId, taskId: task.taskId, expectedRevision: task.revision,
            title: patch.title, description: patch.description, clearDescription: patch.description === undefined,
            tags: patch.tags, priority: patch.priority, clearPriority: patch.priority === undefined,
            startAt: patch.startAt, clearStartAt: patch.startAt === undefined,
            dueAt: patch.dueAt, clearDueAt: patch.dueAt === undefined,
            projectId: patch.projectId, clearProjectId: patch.projectId === undefined,
            entityId: patch.entityId, clearEntityId: patch.entityId === undefined,
          })
          return result.ok ? { ok: true, value: undefined } : failure(result.reason)
        } catch (error) { return failure('transport_error', error) }
      })
    },
    createReminder(input) {
      return exclusive('reminder:create', async () => {
        try {
          const result = await createReminder({ installationId, reminderId: createClientId('reminder'), idempotencyKey: createClientId('reminder-intent'), ...input, nextFireAt: input.remindAt, status: 'scheduled' })
          return { ok: true, value: result.reminder as ReminderItem }
        } catch (error) { return failure('transport_error', error) }
      })
    },
    updateReminder(reminder, patch) {
      return exclusive(`reminder:${reminder.reminderId}`, async () => {
        try {
          const result = await updateReminder({ installationId, reminderId: reminder.reminderId, expectedRevision: reminder.revision, ...patch, nextFireAt: patch.remindAt, clearLinkedTaskId: patch.linkedTaskId === undefined, clearEntityId: patch.entityId === undefined })
          return result.ok ? { ok: true, value: undefined } : failure(result.reason)
        } catch (error) { return failure('transport_error', error) }
      })
    },
    acknowledgeReminder(reminder) {
      return exclusive(`reminder:${reminder.reminderId}`, async () => {
        try { const result = await acknowledgeReminder({ installationId, reminderId: reminder.reminderId, expectedRevision: reminder.revision }); return result.ok ? { ok: true, value: undefined } : failure(result.reason) }
        catch (error) { return failure('transport_error', error) }
      })
    },
    snoozeReminder(reminder, nextFireAt) {
      return exclusive(`reminder:${reminder.reminderId}`, async () => {
        try { const result = await snoozeReminder({ installationId, reminderId: reminder.reminderId, expectedRevision: reminder.revision, snoozedUntil: nextFireAt }); return result.ok ? { ok: true, value: undefined } : failure(result.reason) }
        catch (error) { return failure('transport_error', error) }
      })
    },
    createCalendarEvent(input) {
      return exclusive('calendar:create', async () => {
        try { const result = await createCalendar({ installationId, calendarEventId: createClientId('calendar'), idempotencyKey: createClientId('calendar-intent'), ...input, status: 'confirmed' }); return { ok: true, value: mapEvent(result.event as unknown as SnapshotCalendarEventWire) } }
        catch (error) { return failure('transport_error', error) }
      })
    },
    updateCalendarEvent(event, patch) {
      return exclusive(`calendar:${event.calendarEventId}`, async () => {
        try { const result = await updateCalendar({ installationId, calendarEventId: event.calendarEventId, expectedRevision: event.revision, ...patch, status: event.lifecycle }); return result.ok ? { ok: true, value: undefined } : failure(result.reason) }
        catch (error) { return failure('transport_error', error) }
      })
    },
    deleteCalendarEvent(event) {
      return exclusive(`calendar:${event.calendarEventId}`, async () => {
        try { const result = await deleteCalendar({ installationId, calendarEventId: event.calendarEventId, expectedRevision: event.revision }); return result.ok ? { ok: true, value: undefined } : failure(result.reason) }
        catch (error) { return failure('transport_error', error) }
      })
    },
    createNote(input) {
      return exclusive('note:create', async () => {
        try { const result = await createNote({ installationId, noteId: createClientId('note'), idempotencyKey: createClientId('note-intent'), ...input }); return { ok: true, value: result.note as AppNoteItem } }
        catch (error) { return failure('transport_error', error) }
      })
    },
    updateNote(note, patch) {
      return exclusive(`note:${note.noteId}`, async () => {
        try { const result = await updateNote({ installationId, noteId: note.noteId, expectedRevision: note.revision, ...patch, clearTitle: patch.title === undefined, clearEntityId: patch.entityId === undefined }); return result.ok ? { ok: true, value: undefined } : failure(result.reason) }
        catch (error) { return failure('transport_error', error) }
      })
    },
    deleteNote(note) {
      return exclusive(`note:${note.noteId}`, async () => {
        try { const result = await deleteNote({ installationId, noteId: note.noteId, expectedRevision: note.revision }); return result.ok ? { ok: true, value: undefined } : failure(result.reason) }
        catch (error) { return failure('transport_error', error) }
      })
    },
  }

  const reactive = useMemo(() => createSnapshotBridge(), [])
  useEffect(() => {
    if (!contractSnapshot) return
    const wire = parseClientSnapshotWire(contractSnapshot)
    reactive.publish({
      transactionRevision: wire.transactionRevision,
      productivity: {
        tasks: wire.productivity.tasks,
        reminders: wire.productivity.reminders,
        calendarEvents: wire.productivity.calendarEvents.map(mapEvent),
        notes: wire.productivity.notes,
        notificationIntents: wire.productivity.notificationIntents,
      },
      agents: wire.agents,
      knowledge: wire.knowledge,
      nodes: { items: wire.nodes.items, activity: deriveActivity(wire.nodes.activity) },
      connection: base.connectionMode,
    })
  }, [base.connectionMode, contractSnapshot, reactive])
  useEffect(() => () => reactive.repository.dispose(), [reactive])

  return { repository, reactiveRepository: reactive.repository, connectionMode: base.connectionMode, connectionRecoveryRequired: base.connectionRecoveryRequired }
}
