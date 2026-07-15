import {
  InMemoryProductRepository,
  type AppNoteItem,
  type CalendarEventItem,
  type KnowledgeDocumentItem,
  type ProductMutationResult,
  type ProductPage,
  type ProductRepository,
  type ReminderItem,
  type SourceRefItem,
  type TaskItem,
} from '@kriyan/client-core'

const STORAGE_KEY = '@kriyan/mobile/product-state'
const STORAGE_VERSION = 1
const MAX_PERSISTED_ITEMS = 5_000
const MAX_PERSISTED_REVISION = 10_000

interface DemoStateV1 {
  version: typeof STORAGE_VERSION
  tasks: TaskItem[]
  reminders: ReminderItem[]
  events: CalendarEventItem[]
  notes: AppNoteItem[]
  sources: SourceRefItem[]
  knowledge: KnowledgeDocumentItem[]
}

interface LocalStorageAdapter {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
}

let repositorySetup: Promise<ProductRepository> | undefined

async function getLocalStorage(): Promise<LocalStorageAdapter | undefined> {
  try {
    const module = await import('@react-native-async-storage/async-storage')
    return module.default
  } catch {
    return undefined
  }
}

function isPersistedItem(value: unknown, idKey: string): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return typeof item[idKey] === 'string'
    && Number.isSafeInteger(item.revision)
    && Number(item.revision) >= 0
    && Number(item.revision) <= MAX_PERSISTED_REVISION
}

function isPersistedList(value: unknown, idKey: string): boolean {
  return Array.isArray(value)
    && value.length <= MAX_PERSISTED_ITEMS
    && value.every((item) => isPersistedItem(item, idKey))
}

function parseDemoState(value: string): DemoStateV1 | undefined {
  try {
    const parsed = JSON.parse(value) as Partial<DemoStateV1>
    if (
      parsed.version !== STORAGE_VERSION
      || !isPersistedList(parsed.tasks, 'taskId')
      || !isPersistedList(parsed.reminders, 'reminderId')
      || !isPersistedList(parsed.events, 'calendarEventId')
      || !isPersistedList(parsed.notes, 'noteId')
      || !isPersistedList(parsed.sources, 'sourceRefId')
      || !isPersistedList(parsed.knowledge, 'knowledgeDocumentId')
    ) return undefined
    return parsed as DemoStateV1
  } catch {
    return undefined
  }
}

function requireSuccess<T>(result: ProductMutationResult<T>): Extract<ProductMutationResult<T>, { ok: true }> {
  if (!result.ok) throw new Error(result.message)
  return result
}

async function loadAll<T>(load: (cursor: string | null) => Promise<ProductPage<T>>): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  do {
    const page = await load(cursor)
    items.push(...page.items)
    if (page.done || page.cursor === null) return items
    cursor = page.cursor
  } while (true)
}

async function restoreTask(repository: ProductRepository, task: TaskItem): Promise<void> {
  let revision = requireSuccess(await repository.tasksV1.create({
    taskId: task.taskId,
    idempotencyKey: `restore:${task.taskId}`,
    title: task.title,
    description: task.description,
    tags: task.tags,
    priority: task.priority,
    startAt: task.startAt,
    dueAt: task.dueAt,
    projectId: task.projectId,
    entityId: task.entityId,
    status: task.status,
  })).revision
  while (revision < task.revision) {
    revision = requireSuccess(await repository.tasksV1.update({
      taskId: task.taskId,
      expectedRevision: revision,
      patch: {
        title: task.title,
        description: task.description ?? null,
        tags: task.tags,
        priority: task.priority ?? null,
        startAt: task.startAt ?? null,
        dueAt: task.dueAt ?? null,
        projectId: task.projectId ?? null,
        entityId: task.entityId ?? null,
        status: task.status,
      },
    })).revision
  }
}

async function restoreReminder(repository: ProductRepository, reminder: ReminderItem): Promise<void> {
  let revision = requireSuccess(await repository.remindersV1.create({
    reminderId: reminder.reminderId,
    idempotencyKey: `restore:${reminder.reminderId}`,
    message: reminder.message,
    remindAt: reminder.remindAt,
    timezone: reminder.timezone,
    deliveryPolicy: reminder.deliveryPolicy,
    nextFireAt: reminder.nextFireAt,
    linkedTaskId: reminder.linkedTaskId,
    entityId: reminder.entityId,
    scheduleKey: reminder.scheduleKey,
    status: reminder.status,
  })).revision
  while (revision < reminder.revision) {
    revision = requireSuccess(await repository.remindersV1.update({
      reminderId: reminder.reminderId,
      expectedRevision: revision,
      patch: {
        message: reminder.message,
        remindAt: reminder.remindAt,
        timezone: reminder.timezone,
        deliveryPolicy: reminder.deliveryPolicy,
        nextFireAt: reminder.nextFireAt ?? null,
        linkedTaskId: reminder.linkedTaskId ?? null,
        entityId: reminder.entityId ?? null,
        scheduleKey: reminder.scheduleKey ?? null,
        status: reminder.status,
      },
    })).revision
  }
}

async function restoreEvent(repository: ProductRepository, event: CalendarEventItem): Promise<void> {
  let revision = requireSuccess(await repository.calendarV1.create({
    calendarEventId: event.calendarEventId,
    idempotencyKey: `restore:${event.calendarEventId}`,
    title: event.title,
    description: event.description,
    startAt: event.startAt,
    endAt: event.endAt,
    timezone: event.timezone,
    allDay: event.allDay,
    location: event.location,
    sourceUrl: event.sourceUrl,
    lifecycle: event.lifecycle,
    recurrence: event.recurrence,
  })).revision
  while (revision < event.revision) {
    revision = requireSuccess(await repository.calendarV1.update({
      calendarEventId: event.calendarEventId,
      expectedRevision: revision,
      patch: {
        title: event.title,
        description: event.description ?? null,
        startAt: event.startAt,
        endAt: event.endAt,
        timezone: event.timezone,
        allDay: event.allDay,
        location: event.location ?? null,
        sourceUrl: event.sourceUrl ?? null,
        lifecycle: event.lifecycle,
        recurrence: event.recurrence ?? null,
      },
    })).revision
  }
}

async function restoreNote(repository: ProductRepository, note: AppNoteItem): Promise<void> {
  let revision = requireSuccess(await repository.notesV1.create({
    noteId: note.noteId,
    idempotencyKey: `restore:${note.noteId}`,
    title: note.title,
    contentJson: note.contentJson,
    plainTextPreview: note.plainTextPreview,
    wordCount: note.wordCount,
    tags: note.tags,
    entityId: note.entityId,
  })).revision
  while (revision < note.revision) {
    revision = requireSuccess(await repository.notesV1.update({
      noteId: note.noteId,
      expectedRevision: revision,
      patch: {
        title: note.title ?? null,
        contentJson: note.contentJson,
        plainTextPreview: note.plainTextPreview,
        wordCount: note.wordCount,
        tags: note.tags,
        entityId: note.entityId ?? null,
      },
    })).revision
  }
}

async function restoreSource(repository: ProductRepository, source: SourceRefItem): Promise<void> {
  let revision = requireSuccess(await repository.sourceRefsV1.put({
    sourceRefId: source.sourceRefId,
    idempotencyKey: `restore:${source.sourceRefId}`,
    kind: source.kind,
    displayName: source.displayName,
    sourceUrl: source.sourceUrl,
    externalId: source.externalId,
    contentHash: source.contentHash,
    syncState: source.syncState,
    indexState: source.indexState,
    provenanceIds: source.provenanceIds,
    lastSyncedAt: source.lastSyncedAt,
  })).revision
  while (revision < source.revision) {
    revision = requireSuccess(await repository.sourceRefsV1.update({
      sourceRefId: source.sourceRefId,
      expectedRevision: revision,
      patch: {
        displayName: source.displayName,
        sourceUrl: source.sourceUrl ?? null,
        externalId: source.externalId ?? null,
        contentHash: source.contentHash ?? null,
        syncState: source.syncState,
        indexState: source.indexState,
        provenanceIds: source.provenanceIds,
        lastSyncedAt: source.lastSyncedAt ?? null,
      },
    })).revision
  }
}

async function restoreKnowledge(repository: ProductRepository, document: KnowledgeDocumentItem): Promise<void> {
  let revision = requireSuccess(await repository.knowledgeV1.put({
    knowledgeDocumentId: document.knowledgeDocumentId,
    idempotencyKey: `restore:${document.knowledgeDocumentId}`,
    kind: document.kind,
    title: document.title,
    summary: document.summary,
    tags: document.tags,
    sourceRefIds: document.sourceRefIds,
    provenanceIds: document.provenanceIds,
    syncState: document.syncState,
    indexState: document.indexState,
  })).revision
  while (revision < document.revision) {
    revision = requireSuccess(await repository.knowledgeV1.update({
      knowledgeDocumentId: document.knowledgeDocumentId,
      expectedRevision: revision,
      patch: {
        kind: document.kind,
        title: document.title,
        summary: document.summary,
        tags: document.tags,
        sourceRefIds: document.sourceRefIds,
        provenanceIds: document.provenanceIds,
        syncState: document.syncState,
        indexState: document.indexState,
      },
    })).revision
  }
}

async function restoreDemo(repository: ProductRepository, state: DemoStateV1): Promise<void> {
  for (const task of state.tasks) await restoreTask(repository, task)
  for (const reminder of state.reminders) await restoreReminder(repository, reminder)
  for (const event of state.events) await restoreEvent(repository, event)
  for (const note of state.notes) await restoreNote(repository, note)
  for (const source of state.sources) await restoreSource(repository, source)
  for (const document of state.knowledge) await restoreKnowledge(repository, document)
}

async function seedDemo(next: ProductRepository): Promise<void> {
  const now = Date.now()
  await next.tasksV1.create({
    taskId: 'task:welcome', idempotencyKey: 'demo:task:welcome', title: 'Shape the week',
    description: 'Choose the three outcomes that matter most.', tags: ['weekly'], priority: 'high',
    dueAt: now + 86_400_000, projectId: 'project:kriyan', entityId: 'entity:weekly-review',
  })
  await next.tasksV1.create({
    taskId: 'task:notes', idempotencyKey: 'demo:task:notes', title: 'Review captured notes',
    tags: ['inbox'], priority: 'normal', dueAt: now + 172_800_000,
  })
  await next.remindersV1.create({
    reminderId: 'reminder:standup', idempotencyKey: 'demo:reminder:standup', message: 'Prepare tomorrow’s focus',
    remindAt: now + 7_200_000, nextFireAt: now + 7_200_000, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    deliveryPolicy: 'normal', scheduleKey: 'demo:standup', linkedTaskId: 'task:welcome',
  })
  await next.calendarV1.create({
    calendarEventId: 'event:focus', idempotencyKey: 'demo:event:focus', title: 'Focus block',
    description: 'Protected work on the current priority.', startAt: now + 3_600_000, endAt: now + 7_200_000,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, allDay: false, lifecycle: 'confirmed',
  })
  await next.notesV1.create({
    noteId: 'note:welcome', idempotencyKey: 'demo:note:welcome', title: 'Welcome to Kriyan',
    contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Capture what matters. Kriyan keeps the confirmed version close, even while reconnecting.' }] }] }),
    plainTextPreview: 'Capture what matters. Kriyan keeps the confirmed version close, even while reconnecting.',
    wordCount: 13, tags: ['start'], entityId: 'entity:kriyan',
  })
  await next.sourceRefsV1.put({
    sourceRefId: 'source:core', idempotencyKey: 'demo:source:core', kind: 'document', displayName: 'Kriyan product contract',
    sourceUrl: 'https://github.com/', syncState: 'synced', indexState: 'indexed', provenanceIds: ['provenance:demo'], lastSyncedAt: now,
  })
  await next.knowledgeV1.put({
    knowledgeDocumentId: 'knowledge:weekly', idempotencyKey: 'demo:knowledge:weekly', kind: 'topic', title: 'Weekly planning',
    summary: 'A short ritual for turning captured material into a deliberate week.', tags: ['planning'],
    sourceRefIds: ['source:core'], provenanceIds: ['provenance:demo'], syncState: 'synced', indexState: 'indexed',
  })
}

export async function getDemoRepository(): Promise<ProductRepository> {
  if (repositorySetup) return repositorySetup
  repositorySetup = (async () => {
    const storage = await getLocalStorage()
    const persisted = storage ? parseDemoState(await storage.getItem(STORAGE_KEY) ?? '') : undefined
    if (persisted) {
      const restored = new InMemoryProductRepository()
      try {
        await restoreDemo(restored, persisted)
        return restored
      } catch {
        await storage?.removeItem(STORAGE_KEY)
      }
    }
    const seeded = new InMemoryProductRepository()
    await seedDemo(seeded)
    return seeded
  })()
  return repositorySetup
}

export async function persistDemoRepository(repository: ProductRepository): Promise<void> {
  const storage = await getLocalStorage()
  if (!storage) return
  const state: DemoStateV1 = {
    version: STORAGE_VERSION,
    tasks: await loadAll((cursor) => repository.tasksV1.list({ cursor, limit: 100 })),
    reminders: await loadAll((cursor) => repository.remindersV1.list({ cursor, limit: 100 })),
    events: await loadAll((cursor) => repository.calendarV1.list({ cursor, limit: 100 })),
    notes: await loadAll((cursor) => repository.notesV1.list({ cursor, limit: 100 })),
    sources: await loadAll((cursor) => repository.sourceRefsV1.list({ cursor, limit: 100 })),
    knowledge: await loadAll((cursor) => repository.knowledgeV1.list({ cursor, limit: 100 })),
  }
  await storage.setItem(STORAGE_KEY, JSON.stringify(state))
}
