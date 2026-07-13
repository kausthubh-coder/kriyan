'use client'

import {
  InMemoryClientRepository,
  normalizeTransitionReason,
  type ActionResult,
  type AppNoteItem,
  type CalendarEventItem,
  type KnowledgeDocumentItem,
  type ProductMutationResult,
  type ReminderItem,
  type SourceRefItem,
  type TaskItem,
} from '@kriyan/client-core'
import { useCallback, useEffect, useState } from 'react'

import {
  exhaustedPage,
  type CalendarDraft,
  type NoteDraft,
  type ReminderDraft,
  type TaskDraft,
  type WebRepository,
} from './web-repository'

interface ProductSnapshot {
  tasks: TaskItem[]
  reminders: ReminderItem[]
  calendarEvents: CalendarEventItem[]
  notes: AppNoteItem[]
  sourceRefs: SourceRefItem[]
  knowledgeDocuments: KnowledgeDocumentItem[]
}

const EMPTY_SNAPSHOT: ProductSnapshot = {
  tasks: [], reminders: [], calendarEvents: [], notes: [], sourceRefs: [], knowledgeDocuments: [],
}

function action<T>(result: ProductMutationResult<T>): ActionResult<T> {
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, reason: normalizeTransitionReason(result.reason), message: result.message }
}

function voidAction<T>(result: ProductMutationResult<T>): ActionResult {
  const converted = action(result)
  return converted.ok ? { ok: true, value: undefined } : converted
}

function id(prefix: string): string {
  return `${prefix}:demo:${crypto.randomUUID()}`
}

function words(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0
}

async function seed(repository: InMemoryClientRepository): Promise<void> {
  const now = Date.now()
  repository.nodes = [{
    nodeId: 'node:demo-vps', displayName: 'Personal VPS', capabilities: ['commands', 'retrieval'],
    status: 'online', lastHeartbeatAt: now, revision: 4,
  }]
  await repository.submitCommand('Summarize the current Kriyan project context with citations')
  const activity = repository.activity[0]
  if (activity?.job) {
    activity.job.status = 'succeeded'
    activity.command.status = 'completed'
    activity.state = 'completed'
    activity.run = {
      runId: 'run:demo-retrieval', jobId: activity.job.jobId, attempt: 1, nodeId: 'node:demo-vps',
      status: 'succeeded', revision: 3, startedAt: now - 48_000, finishedAt: now - 41_000,
    }
    repository.runEvents = [
      { eventId: 'event:demo:1', runId: 'run:demo-retrieval', sequence: 1, type: 'status', data: '{"status":"retrieving indexed sources"}', createdAt: now - 47_000 },
      { eventId: 'event:demo:2', runId: 'run:demo-retrieval', sequence: 2, type: 'message', data: '{"message":"Kriyan is a local-first personal agent with a reactive Convex control plane. [source:src:kriyan-plan]"}', createdAt: now - 42_000 },
    ]
  }
  await repository.tasksV1.create({
    taskId: 'task:demo:brief', idempotencyKey: 'seed:task:brief', title: 'Review the web productivity checkpoint',
    description: 'Check the responsive workspace and close any browser findings.', tags: ['kriyan', 'web'],
    priority: 'high', startAt: now - 3_600_000, dueAt: now + 4 * 3_600_000,
    projectId: 'project:kriyan', entityId: 'entity:kriyan', status: 'open',
  })
  await repository.tasksV1.create({
    taskId: 'task:demo:notes', idempotencyKey: 'seed:task:notes', title: 'Capture node setup notes',
    tags: ['vps'], priority: 'normal', dueAt: now + 28 * 3_600_000, status: 'open',
  })
  await repository.remindersV1.create({
    reminderId: 'reminder:demo:focus', idempotencyKey: 'seed:reminder:focus', message: 'Start the Kriyan review block',
    remindAt: now + 90 * 60_000, nextFireAt: now + 90 * 60_000, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deliveryPolicy: 'persistent', entityId: 'entity:kriyan', status: 'scheduled',
  })
  await repository.calendarV1.create({
    calendarEventId: 'calendar:demo:review', idempotencyKey: 'seed:calendar:review', title: 'Kriyan review block',
    description: 'Review the web checkpoint and browser evidence.', startAt: now + 2 * 3_600_000,
    endAt: now + 3 * 3_600_000, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, allDay: false,
    location: 'Focus room', lifecycle: 'confirmed',
  })
  const contentJson = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kriyan keeps durable work visible while the VPS node handles commands.' }] }] })
  await repository.notesV1.create({
    noteId: 'note:demo:principles', idempotencyKey: 'seed:note:principles', title: 'Kriyan operating principles',
    contentJson, plainTextPreview: 'Kriyan keeps durable work visible while the VPS node handles commands.',
    wordCount: words('Kriyan keeps durable work visible while the VPS node handles commands.'), tags: ['product'], entityId: 'entity:kriyan',
  })
  await repository.sourceRefsV1.put({
    sourceRefId: 'src:kriyan-plan', idempotencyKey: 'seed:source:plan', kind: 'git', displayName: 'Kriyan product plan',
    sourceUrl: 'https://github.com/', syncState: 'synced', indexState: 'indexed', provenanceIds: ['prov:demo-plan'], lastSyncedAt: now - 12 * 60_000,
  })
  await repository.sourceRefsV1.put({
    sourceRefId: 'src:meeting-audio', idempotencyKey: 'seed:source:audio', kind: 'audio', displayName: 'Planning voice note',
    syncState: 'pending', indexState: 'pending', provenanceIds: ['prov:demo-audio'],
  })
  await repository.knowledgeV1.put({
    knowledgeDocumentId: 'entity:kriyan', idempotencyKey: 'seed:knowledge:kriyan', kind: 'project', title: 'Kriyan',
    summary: 'A local-first personal agent that uses Convex for reactive coordination and a private VPS node for execution and retrieval.',
    tags: ['project', 'agent'], sourceRefIds: ['src:kriyan-plan'], provenanceIds: ['prov:demo-plan'], syncState: 'synced', indexState: 'indexed',
  })
}

async function snapshot(repository: InMemoryClientRepository): Promise<ProductSnapshot> {
  const [tasks, reminders, calendar, notes, sources, knowledge] = await Promise.all([
    repository.tasksV1.list({ limit: 100 }), repository.remindersV1.list({ limit: 100 }),
    repository.calendarV1.list({ limit: 100 }), repository.notesV1.list({ limit: 100 }),
    repository.sourceRefsV1.list({ limit: 100 }), repository.knowledgeV1.list({ limit: 100 }),
  ])
  return {
    tasks: tasks.items, reminders: reminders.items, calendarEvents: calendar.items,
    notes: notes.items, sourceRefs: sources.items, knowledgeDocuments: knowledge.items,
  }
}

export function useDemoRepository(selectedRunId: string | null): WebRepository {
  const [repository] = useState(() => new InMemoryClientRepository({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }))
  const [data, setData] = useState<ProductSnapshot>(EMPTY_SNAPSHOT)
  const [ready, setReady] = useState(false)
  const [, setRevision] = useState(0)
  const refresh = useCallback(async (): Promise<void> => {
    setData(await snapshot(repository))
    setRevision((value) => value + 1)
  }, [repository])

  useEffect(() => {
    let active = true
    void seed(repository).then(async () => {
      const next = await snapshot(repository)
      if (active) { setData(next); setReady(true) }
    })
    return () => { active = false }
  }, [repository])

  const mutate = useCallback(async <T,>(operation: () => Promise<ProductMutationResult<T>>): Promise<ActionResult<T>> => {
    const result = action(await operation())
    await refresh()
    return result
  }, [refresh])

  const basePages = {
    openTasks: exhaustedPage(data.tasks.filter((item) => item.status === 'open').length),
    completedTasks: exhaustedPage(data.tasks.filter((item) => item.status === 'completed').length),
    reminders: exhaustedPage(data.reminders.length), activity: exhaustedPage(repository.activity.length),
    runEvents: exhaustedPage(repository.runEvents.length), calendar: exhaustedPage(data.calendarEvents.length),
    notes: exhaustedPage(data.notes.length), sources: exhaustedPage(data.sourceRefs.length), knowledge: exhaustedPage(data.knowledgeDocuments.length),
  }

  return {
    installation: repository.installation, tasks: data.tasks, reminders: data.reminders,
    calendarEvents: data.calendarEvents, notes: data.notes, sourceRefs: data.sourceRefs,
    knowledgeDocuments: data.knowledgeDocuments, activity: [...repository.activity], nodes: [...repository.nodes],
    runEvents: selectedRunId ? repository.runEvents.filter((item) => item.runId === selectedRunId) : [],
    loading: !ready, loadingRunEvents: false, pending: new Set(), pages: basePages,
    loadMore(): void {}, selectRun(): void {},
    async submitCommand(input) { const result = await repository.submitCommand(input); setRevision((value) => value + 1); return result },
    async cancelCommand(command) { const result = await repository.cancelCommand(command); setRevision((value) => value + 1); return result },
    async retryCommand(command, job) { const result = await repository.retryCommand(command, job); setRevision((value) => value + 1); return result },
    createTask: (input: TaskDraft) => mutate(() => repository.tasksV1.create({ ...input, taskId: id('task'), idempotencyKey: id('task-intent'), status: 'open' })),
    updateTask: async (task, patch) => { const result = voidAction(await repository.tasksV1.update({ taskId: task.taskId, expectedRevision: task.revision, patch })); await refresh(); return result },
    async setTaskStatus(task, status) { const result = voidAction(await repository.tasksV1.update({ taskId: task.taskId, expectedRevision: task.revision, patch: { status } })); await refresh(); return result },
    async cancelTask(task) { const result = voidAction(await repository.tasksV1.tombstone(task.taskId, task.revision)); await refresh(); return result },
    createReminder: (input: ReminderDraft) => mutate(() => repository.remindersV1.create({ ...input, reminderId: id('reminder'), idempotencyKey: id('reminder-intent'), status: 'scheduled' })),
    updateReminder: async (reminder, patch) => { const result = voidAction(await repository.remindersV1.update({ reminderId: reminder.reminderId, expectedRevision: reminder.revision, patch })); await refresh(); return result },
    async setReminderStatus(reminder, status) { const result = voidAction(await repository.remindersV1.update({ reminderId: reminder.reminderId, expectedRevision: reminder.revision, patch: { status } })); await refresh(); return result },
    async cancelReminder(reminder) { const result = voidAction(await repository.remindersV1.tombstone(reminder.reminderId, reminder.revision)); await refresh(); return result },
    async acknowledgeReminder(reminder) { const result = voidAction(await repository.remindersV1.acknowledge(reminder.reminderId, reminder.revision)); await refresh(); return result },
    async snoozeReminder(reminder, nextFireAt) { const result = voidAction(await repository.remindersV1.snooze(reminder.reminderId, reminder.revision, nextFireAt)); await refresh(); return result },
    createCalendarEvent: (input: CalendarDraft) => mutate(() => repository.calendarV1.create({ ...input, calendarEventId: id('calendar'), idempotencyKey: id('calendar-intent'), lifecycle: 'confirmed' })),
    updateCalendarEvent: async (event, patch) => { const result = voidAction(await repository.calendarV1.update({ calendarEventId: event.calendarEventId, expectedRevision: event.revision, patch })); await refresh(); return result },
    async deleteCalendarEvent(event) { const result = voidAction(await repository.calendarV1.tombstone(event.calendarEventId, event.revision)); await refresh(); return result },
    createNote: (input: NoteDraft) => mutate(() => repository.notesV1.create({ ...input, noteId: id('note'), idempotencyKey: id('note-intent') })),
    updateNote: async (note, patch) => { const result = voidAction(await repository.notesV1.update({ noteId: note.noteId, expectedRevision: note.revision, patch })); await refresh(); return result },
    async deleteNote(note) { const result = voidAction(await repository.notesV1.tombstone(note.noteId, note.revision)); await refresh(); return result },
  }
}
