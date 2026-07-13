import type {
  AppNoteItem,
  CalendarEventItem,
  KnowledgeDocumentItem,
  NotificationIntentItem,
  ReminderItem,
  SourceRefItem,
  TaskItem,
} from './types'
import {
  isTipTapDocumentJson,
  type AppNoteListFilter,
  type CalendarEventListFilter,
  type CreateAppNoteInput,
  type CreateCalendarEventInput,
  type CreateProductReminderInput,
  type CreateProductTaskInput,
  type KnowledgeDocumentListFilter,
  type NotificationIntentListFilter,
  type ProductKnowledgeRepository,
  type ProductMutationReason,
  type ProductMutationResult,
  type ProductPage,
  type ProductNoteRepository,
  type ProductNotificationIntentRepository,
  type ProductReminderListFilter,
  type ProductReminderRepository,
  type ProductRepository,
  type ProductSourceRefRepository,
  type ProductTaskListFilter,
  type ProductTaskRepository,
  type PutKnowledgeDocumentInput,
  type PutSourceRefInput,
  type SourceRefListFilter,
  type UpdateAppNoteInput,
  type UpdateCalendarEventInput,
  type UpdateKnowledgeDocumentInput,
  type TransitionNotificationIntentInput,
  type UpdateProductReminderInput,
  type UpdateProductTaskInput,
  type UpdateSourceRefInput,
  type ProductCalendarRepository,
  type CreateNotificationIntentInput,
} from './product-repository'

interface StoredEntity {
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

class InvalidEntityStateError extends Error {}

function failure<T>(reason: ProductMutationReason, message: string): ProductMutationResult<T> {
  return { ok: false, reason, message }
}

function canonicalize(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(',')}}`
}

class EntityStore<T extends StoredEntity> {
  private readonly records = new Map<string, T>()
  private readonly idempotency = new Map<string, { id: string; fingerprint: string }>()

  constructor(private readonly now: () => number) {}

  list(): T[] {
    return [...this.records.values()].map((item) => structuredClone(item))
  }

  create(id: string, idempotencyKey: string, value: Omit<T, keyof StoredEntity>): ProductMutationResult<T> {
    const fingerprint = canonicalize(value)
    const existingIdentity = this.idempotency.get(idempotencyKey)
    const existing = this.records.get(id)
    if (existingIdentity !== undefined || existing !== undefined) {
      if (
        existingIdentity?.id !== id
        || existingIdentity.fingerprint !== fingerprint
        || existing === undefined
        || existing.deletedAt !== undefined
      ) return failure('idempotency_conflict', 'The ID or idempotency key is already used by different content.')
      return { ok: true, created: false, revision: existing.revision, value: structuredClone(existing) }
    }
    const now = this.now()
    const created = { ...value, revision: 0, createdAt: now, updatedAt: now } as T
    this.records.set(id, created)
    this.idempotency.set(idempotencyKey, { id, fingerprint })
    return { ok: true, created: true, revision: 0, value: structuredClone(created) }
  }

  update(id: string, expectedRevision: number, apply: (current: T, now: number) => T): ProductMutationResult<T> {
    const current = this.records.get(id)
    if (current === undefined) return failure('not_found', 'The item does not exist.')
    if (current.deletedAt !== undefined) return failure('invalid_state', 'The item has been deleted.')
    if (current.revision !== expectedRevision) return failure('stale_revision', 'The item changed after it was read.')
    const now = this.now()
    let updated: T
    try {
      updated = apply(structuredClone(current), now)
    } catch (error) {
      if (error instanceof InvalidEntityStateError) return failure('invalid_state', 'The lifecycle transition is invalid.')
      return failure('invalid_input', 'The update is invalid.')
    }
    updated.revision = current.revision + 1
    updated.createdAt = current.createdAt
    updated.updatedAt = now
    this.records.set(id, updated)
    return { ok: true, created: false, revision: updated.revision, value: structuredClone(updated) }
  }

  tombstone(id: string, expectedRevision: number, patch: Partial<T> = {}): ProductMutationResult<T> {
    return this.update(id, expectedRevision, (current, now) => ({ ...current, ...patch, deletedAt: now }))
  }
}

function assignNullable<T extends object>(
  target: T,
  patch: Record<string, unknown>,
): T {
  const next = { ...target } as Record<string, unknown>
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    if (value === null) delete next[key]
    else next[key] = value
  }
  return next as T
}

function validSourceUrl(value: string | undefined): boolean {
  if (value === undefined) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function paginate<T>(items: T[], filter: { cursor?: string | null; limit?: number }): ProductPage<T> {
  const parsedCursor = filter.cursor === undefined || filter.cursor === null
    ? 0
    : Number.parseInt(filter.cursor, 10)
  const offset = Number.isSafeInteger(parsedCursor) && parsedCursor >= 0 ? parsedCursor : 0
  const requestedLimit = filter.limit ?? 50
  const limit = Number.isSafeInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50
  const values = items.slice(offset, offset + limit)
  const nextOffset = offset + values.length
  return {
    items: values,
    cursor: nextOffset < items.length ? String(nextOffset) : null,
    done: nextOffset >= items.length,
  }
}

export class InMemoryProductRepository implements ProductRepository {
  private clock = 0
  private readonly taskStore = new EntityStore<TaskItem>(() => ++this.clock)
  private readonly reminderStore = new EntityStore<ReminderItem>(() => ++this.clock)
  private readonly notificationIntentStore = new EntityStore<NotificationIntentItem>(() => ++this.clock)
  private readonly calendarStore = new EntityStore<CalendarEventItem>(() => ++this.clock)
  private readonly noteStore = new EntityStore<AppNoteItem>(() => ++this.clock)
  private readonly sourceRefStore = new EntityStore<SourceRefItem>(() => ++this.clock)
  private readonly knowledgeStore = new EntityStore<KnowledgeDocumentItem>(() => ++this.clock)

  readonly tasksV1: ProductTaskRepository = {
    list: async (filter = {}) => this.listTasks(filter),
    create: async (input) => this.createProductTask(input),
    update: async (input) => this.updateProductTask(input),
    tombstone: async (id, revision) => this.taskStore.tombstone(id, revision, { status: 'cancelled' }),
  }

  readonly remindersV1: ProductReminderRepository = {
    list: async (filter = {}) => this.listReminders(filter),
    create: async (input) => this.createProductReminder(input),
    update: async (input) => this.updateProductReminder(input),
    acknowledge: async (id, revision) => this.reminderStore.update(id, revision, (current, now) => ({
      ...current,
      acknowledgedAt: now,
      status: 'acknowledged',
    })),
    snooze: async (id, revision, nextFireAt) => {
      if (!Number.isSafeInteger(nextFireAt) || nextFireAt < 0) return failure('invalid_input', 'nextFireAt must be a timestamp.')
      return this.reminderStore.update(id, revision, (current) => ({
        ...current,
        acknowledgedAt: undefined,
        snoozedUntil: nextFireAt,
        nextFireAt,
        status: 'scheduled',
      }))
    },
    tombstone: async (id, revision) => this.reminderStore.tombstone(id, revision, { status: 'cancelled' }),
  }

  readonly notificationIntentsV1: ProductNotificationIntentRepository = {
    list: async (filter = {}) => this.listNotificationIntents(filter),
    create: async (input) => this.createNotificationIntent(input),
    transition: async (input) => this.transitionNotificationIntent(input),
    tombstone: async (id, revision) => this.notificationIntentStore.tombstone(id, revision, { lifecycle: 'cancelled' }),
  }

  readonly calendarV1: ProductCalendarRepository = {
    list: async (filter = {}) => this.listCalendar(filter),
    create: async (input) => this.createCalendar(input),
    update: async (input) => this.updateCalendar(input),
    tombstone: async (id, revision) => this.calendarStore.tombstone(id, revision, { lifecycle: 'cancelled' }),
  }

  readonly notesV1: ProductNoteRepository = {
    list: async (filter = {}) => this.listNotes(filter),
    create: async (input) => this.createNote(input),
    update: async (input) => this.updateNote(input),
    tombstone: async (id, revision) => this.noteStore.tombstone(id, revision),
  }

  readonly sourceRefsV1: ProductSourceRefRepository = {
    list: async (filter = {}) => this.listSourceRefs(filter),
    put: async (input) => this.putSourceRef(input),
    update: async (input) => this.updateSourceRef(input),
    tombstone: async (id, revision) => this.sourceRefStore.tombstone(id, revision),
  }

  readonly knowledgeV1: ProductKnowledgeRepository = {
    list: async (filter = {}) => this.listKnowledge(filter),
    put: async (input) => this.putKnowledge(input),
    update: async (input) => this.updateKnowledge(input),
    tombstone: async (id, revision) => this.knowledgeStore.tombstone(id, revision),
  }

  private listTasks(filter: ProductTaskListFilter): ProductPage<TaskItem> {
    return paginate(this.taskStore.list()
      .filter((item) => filter.includeDeleted || item.deletedAt === undefined)
      .filter((item) => filter.status === undefined || item.status === filter.status)
      .filter((item) => filter.tag === undefined || item.tags?.includes(filter.tag))
      .filter((item) => filter.projectId === undefined || item.projectId === filter.projectId)
      .filter((item) => filter.entityId === undefined || item.entityId === filter.entityId)
      .filter((item) => filter.startsBefore === undefined || (item.startAt !== undefined && item.startAt <= filter.startsBefore))
      .filter((item) => filter.dueBefore === undefined || (item.dueAt !== undefined && item.dueAt <= filter.dueBefore))
      .sort((left, right) => (left.dueAt ?? Number.MAX_SAFE_INTEGER) - (right.dueAt ?? Number.MAX_SAFE_INTEGER)
        || left.taskId.localeCompare(right.taskId)), filter)
  }

  private createProductTask(input: CreateProductTaskInput): ProductMutationResult<TaskItem> {
    if (input.title.trim().length === 0) return failure('invalid_input', 'Task title is required.')
    const { taskId, idempotencyKey, ...value } = input
    return this.taskStore.create(taskId, idempotencyKey, {
      ...value,
      taskId,
      title: value.title.trim(),
      tags: [...(value.tags ?? [])],
      priority: value.priority ?? 'normal',
      status: value.status ?? 'open',
    })
  }

  private updateProductTask(input: UpdateProductTaskInput): ProductMutationResult<TaskItem> {
    if (input.patch.title !== undefined && input.patch.title.trim().length === 0) return failure('invalid_input', 'Task title is required.')
    return this.taskStore.update(input.taskId, input.expectedRevision, (current) => assignNullable(current, input.patch))
  }

  private listReminders(filter: ProductReminderListFilter): ProductPage<ReminderItem> {
    return paginate(this.reminderStore.list()
      .filter((item) => filter.includeDeleted || item.deletedAt === undefined)
      .filter((item) => filter.status === undefined || item.status === filter.status)
      .filter((item) => filter.deliveryPolicy === undefined || item.deliveryPolicy === filter.deliveryPolicy)
      .filter((item) => filter.linkedTaskId === undefined || item.linkedTaskId === filter.linkedTaskId)
      .filter((item) => filter.entityId === undefined || item.entityId === filter.entityId)
      .filter((item) => filter.firesBefore === undefined || (item.nextFireAt ?? item.remindAt) <= filter.firesBefore)
      .sort((left, right) => (left.nextFireAt ?? left.remindAt) - (right.nextFireAt ?? right.remindAt)
        || left.reminderId.localeCompare(right.reminderId)), filter)
  }

  private createProductReminder(input: CreateProductReminderInput): ProductMutationResult<ReminderItem> {
    if (input.message.trim().length === 0) return failure('invalid_input', 'Reminder message is required.')
    const { reminderId, idempotencyKey, ...value } = input
    return this.reminderStore.create(reminderId, idempotencyKey, {
      ...value,
      reminderId,
      message: value.message.trim(),
      deliveryPolicy: value.deliveryPolicy ?? 'normal',
      nextFireAt: value.nextFireAt ?? value.remindAt,
      status: value.status ?? 'scheduled',
    })
  }

  private updateProductReminder(input: UpdateProductReminderInput): ProductMutationResult<ReminderItem> {
    if (input.patch.message !== undefined && input.patch.message.trim().length === 0) return failure('invalid_input', 'Reminder message is required.')
    return this.reminderStore.update(input.reminderId, input.expectedRevision, (current) => assignNullable(current, input.patch))
  }

  private listNotificationIntents(filter: NotificationIntentListFilter): ProductPage<NotificationIntentItem> {
    return paginate(this.notificationIntentStore.list()
      .filter((item) => filter.includeDeleted || item.deletedAt === undefined)
      .filter((item) => filter.reminderId === undefined || item.reminderId === filter.reminderId)
      .filter((item) => filter.deliveryPolicy === undefined || item.deliveryPolicy === filter.deliveryPolicy)
      .filter((item) => filter.lifecycle === undefined || item.lifecycle === filter.lifecycle)
      .filter((item) => filter.targetDeviceId === undefined || item.targetDeviceId === filter.targetDeviceId)
      .filter((item) => filter.scheduledBefore === undefined || item.scheduledFor <= filter.scheduledBefore)
      .sort((left, right) => left.scheduledFor - right.scheduledFor
        || left.notificationIntentId.localeCompare(right.notificationIntentId)), filter)
  }

  private createNotificationIntent(input: CreateNotificationIntentInput): ProductMutationResult<NotificationIntentItem> {
    if (
      input.reminderId.trim().length === 0
      || input.dedupeKey.trim().length === 0
      || !Number.isSafeInteger(input.scheduledFor)
      || input.scheduledFor < 0
    ) return failure('invalid_input', 'Notification intent scheduling metadata is invalid.')
    const duplicate = this.notificationIntentStore.list().find((item) =>
      item.deletedAt === undefined && item.dedupeKey === input.dedupeKey)
    if (duplicate !== undefined) {
      if (
        duplicate.reminderId !== input.reminderId
        || duplicate.scheduledFor !== input.scheduledFor
        || duplicate.deliveryPolicy !== input.deliveryPolicy
        || duplicate.targetDeviceId !== input.targetDeviceId
      ) return failure('idempotency_conflict', 'The notification dedupe key is already used by different scheduling metadata.')
      return { ok: true, created: false, revision: duplicate.revision, value: duplicate }
    }
    const { notificationIntentId, idempotencyKey, ...value } = input
    return this.notificationIntentStore.create(notificationIntentId, idempotencyKey, {
      ...value,
      notificationIntentId,
      lifecycle: 'queued',
      attempt: 0,
      escalationLevel: 0,
    })
  }

  private transitionNotificationIntent(input: TransitionNotificationIntentInput): ProductMutationResult<NotificationIntentItem> {
    const transitions: Record<NotificationIntentItem['lifecycle'], NotificationIntentItem['lifecycle'][]> = {
      queued: ['dispatched', 'failed', 'cancelled'],
      dispatched: ['acknowledged', 'failed', 'cancelled'],
      failed: ['queued', 'cancelled'],
      acknowledged: [],
      cancelled: [],
    }
    return this.notificationIntentStore.update(
      input.notificationIntentId,
      input.expectedRevision,
      (current) => {
        if (!transitions[current.lifecycle].includes(input.lifecycle)) throw new InvalidEntityStateError('invalid transition')
        if (input.attempt !== undefined && input.attempt < current.attempt) throw new Error('attempt regression')
        if (input.escalationLevel !== undefined && input.escalationLevel < current.escalationLevel) throw new Error('escalation regression')
        return assignNullable(current, {
          lifecycle: input.lifecycle,
          attempt: input.attempt,
          escalationLevel: input.escalationLevel,
          targetDeviceId: input.targetDeviceId,
          lastError: input.lastError,
        })
      },
    )
  }

  private listCalendar(filter: CalendarEventListFilter): ProductPage<CalendarEventItem> {
    return paginate(this.calendarStore.list()
      .filter((item) => filter.includeDeleted || item.deletedAt === undefined)
      .filter((item) => filter.lifecycle === undefined || item.lifecycle === filter.lifecycle)
      .filter((item) => filter.startsBefore === undefined || item.startAt <= filter.startsBefore)
      .filter((item) => filter.endsAfter === undefined || item.endAt >= filter.endsAfter)
      .sort((left, right) => left.startAt - right.startAt || left.calendarEventId.localeCompare(right.calendarEventId)), filter)
  }

  private createCalendar(input: CreateCalendarEventInput): ProductMutationResult<CalendarEventItem> {
    if (input.title.trim().length === 0 || input.endAt < input.startAt) return failure('invalid_input', 'Calendar event title and time range are invalid.')
    const { calendarEventId, idempotencyKey, ...value } = input
    return this.calendarStore.create(calendarEventId, idempotencyKey, {
      ...value,
      calendarEventId,
      title: value.title.trim(),
      lifecycle: value.lifecycle ?? 'confirmed',
    })
  }

  private updateCalendar(input: UpdateCalendarEventInput): ProductMutationResult<CalendarEventItem> {
    return this.calendarStore.update(input.calendarEventId, input.expectedRevision, (current) => {
      const updated = assignNullable(current, input.patch)
      if (updated.title.trim().length === 0 || updated.endAt < updated.startAt) throw new Error('invalid calendar event update')
      return updated
    })
  }

  private listNotes(filter: AppNoteListFilter): ProductPage<AppNoteItem> {
    return paginate(this.noteStore.list()
      .filter((item) => filter.includeDeleted || item.deletedAt === undefined)
      .filter((item) => filter.tag === undefined || item.tags.includes(filter.tag))
      .sort((left, right) => right.updatedAt - left.updatedAt || left.noteId.localeCompare(right.noteId)), filter)
  }

  private createNote(input: CreateAppNoteInput): ProductMutationResult<AppNoteItem> {
    if (!isTipTapDocumentJson(input.contentJson)) return failure('invalid_input', 'Note content must be a TipTap document JSON string.')
    const { noteId, idempotencyKey, ...value } = input
    return this.noteStore.create(noteId, idempotencyKey, {
      ...value,
      noteId,
      tags: [...(value.tags ?? [])],
      wordCount: value.wordCount,
    })
  }

  private updateNote(input: UpdateAppNoteInput): ProductMutationResult<AppNoteItem> {
    if (input.patch.contentJson !== undefined && !isTipTapDocumentJson(input.patch.contentJson)) return failure('invalid_input', 'Note content must be a TipTap document JSON string.')
    return this.noteStore.update(input.noteId, input.expectedRevision, (current) => {
      return assignNullable(current, input.patch)
    })
  }

  private listSourceRefs(filter: SourceRefListFilter): ProductPage<SourceRefItem> {
    return paginate(this.sourceRefStore.list()
      .filter((item) => filter.includeDeleted || item.deletedAt === undefined)
      .filter((item) => filter.kind === undefined || item.kind === filter.kind)
      .filter((item) => filter.syncState === undefined || item.syncState === filter.syncState)
      .filter((item) => filter.indexState === undefined || item.indexState === filter.indexState)
      .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.sourceRefId.localeCompare(right.sourceRefId)), filter)
  }

  private putSourceRef(input: PutSourceRefInput): ProductMutationResult<SourceRefItem> {
    if (input.displayName.trim().length === 0 || !validSourceUrl(input.sourceUrl)) return failure('invalid_input', 'Source display name or URL is invalid.')
    const { sourceRefId, idempotencyKey, ...value } = input
    return this.sourceRefStore.create(sourceRefId, idempotencyKey, {
      ...value,
      sourceRefId,
      displayName: value.displayName.trim(),
      provenanceIds: [...(value.provenanceIds ?? [])],
    })
  }

  private updateSourceRef(input: UpdateSourceRefInput): ProductMutationResult<SourceRefItem> {
    if (input.patch.sourceUrl !== undefined && input.patch.sourceUrl !== null && !validSourceUrl(input.patch.sourceUrl)) return failure('invalid_input', 'Source URL must use HTTP or HTTPS.')
    return this.sourceRefStore.update(input.sourceRefId, input.expectedRevision, (current) => assignNullable(current, input.patch))
  }

  private listKnowledge(filter: KnowledgeDocumentListFilter): ProductPage<KnowledgeDocumentItem> {
    return paginate(this.knowledgeStore.list()
      .filter((item) => filter.includeDeleted || item.deletedAt === undefined)
      .filter((item) => filter.kind === undefined || item.kind === filter.kind)
      .filter((item) => filter.tag === undefined || item.tags.includes(filter.tag))
      .filter((item) => filter.syncState === undefined || item.syncState === filter.syncState)
      .filter((item) => filter.indexState === undefined || item.indexState === filter.indexState)
      .sort((left, right) => left.title.localeCompare(right.title) || left.knowledgeDocumentId.localeCompare(right.knowledgeDocumentId)), filter)
  }

  private putKnowledge(input: PutKnowledgeDocumentInput): ProductMutationResult<KnowledgeDocumentItem> {
    if (input.title.trim().length === 0) return failure('invalid_input', 'Knowledge title is required.')
    const { knowledgeDocumentId, idempotencyKey, ...value } = input
    return this.knowledgeStore.create(knowledgeDocumentId, idempotencyKey, {
      ...value,
      knowledgeDocumentId,
      title: value.title.trim(),
      tags: [...(value.tags ?? [])],
      sourceRefIds: [...(value.sourceRefIds ?? [])],
      provenanceIds: [...(value.provenanceIds ?? [])],
    })
  }

  private updateKnowledge(input: UpdateKnowledgeDocumentInput): ProductMutationResult<KnowledgeDocumentItem> {
    return this.knowledgeStore.update(input.knowledgeDocumentId, input.expectedRevision, (current) => assignNullable(current, input.patch))
  }
}
