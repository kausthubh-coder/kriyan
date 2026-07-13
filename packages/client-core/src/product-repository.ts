import type {
  AppNoteItem,
  CalendarEventItem,
  CalendarEventLifecycle,
  CalendarRecurrenceMetadata,
  KnowledgeDocumentItem,
  KnowledgeKind,
  NotificationIntentItem,
  NotificationIntentLifecycle,
  ProjectionIndexState,
  ProjectionSyncState,
  ReminderDeliveryPolicy,
  ReminderItem,
  ReminderStatus,
  SourceKind,
  SourceRefItem,
  TaskItem,
  TaskPriority,
  TaskStatus,
} from './types'

export type ProductMutationReason =
  | 'not_found'
  | 'stale_revision'
  | 'idempotency_conflict'
  | 'invalid_state'
  | 'invalid_input'
  | 'transport_error'

export type ProductMutationResult<T> =
  | { ok: true; created: boolean; revision: number; value: T }
  | { ok: false; reason: ProductMutationReason; message: string }

export interface ProductCreateIdentity {
  idempotencyKey: string
}

export interface ProductListFilter {
  includeDeleted?: boolean
  cursor?: string | null
  limit?: number
}

export interface ProductPage<T> {
  items: T[]
  cursor: string | null
  done: boolean
}

export interface CreateProductTaskInput extends ProductCreateIdentity {
  taskId: string
  title: string
  description?: string
  tags?: string[]
  priority?: TaskPriority
  startAt?: number
  dueAt?: number
  projectId?: string
  entityId?: string
  status?: TaskStatus
}

export interface UpdateProductTaskInput {
  taskId: string
  expectedRevision: number
  patch: {
    title?: string
    description?: string | null
    tags?: string[]
    priority?: TaskPriority | null
    startAt?: number | null
    dueAt?: number | null
    projectId?: string | null
    entityId?: string | null
    status?: TaskStatus
  }
}

export interface ProductTaskListFilter extends ProductListFilter {
  status?: TaskStatus
  tag?: string
  projectId?: string
  entityId?: string
  startsBefore?: number
  dueBefore?: number
}

export interface CreateProductReminderInput extends ProductCreateIdentity {
  reminderId: string
  message: string
  remindAt: number
  timezone: string
  deliveryPolicy?: ReminderDeliveryPolicy
  nextFireAt?: number
  linkedTaskId?: string
  entityId?: string
  scheduleKey?: string
  status?: ReminderStatus
}

export interface UpdateProductReminderInput {
  reminderId: string
  expectedRevision: number
  patch: {
    message?: string
    remindAt?: number
    timezone?: string
    deliveryPolicy?: ReminderDeliveryPolicy
    nextFireAt?: number | null
    linkedTaskId?: string | null
    entityId?: string | null
    scheduleKey?: string | null
    status?: ReminderStatus
  }
}

export interface ProductReminderListFilter extends ProductListFilter {
  status?: ReminderStatus
  deliveryPolicy?: ReminderDeliveryPolicy
  linkedTaskId?: string
  entityId?: string
  firesBefore?: number
}

export interface CreateNotificationIntentInput extends ProductCreateIdentity {
  notificationIntentId: string
  reminderId: string
  scheduledFor: number
  deliveryPolicy: ReminderDeliveryPolicy
  dedupeKey: string
  targetDeviceId?: string
}

export interface TransitionNotificationIntentInput {
  notificationIntentId: string
  expectedRevision: number
  lifecycle: NotificationIntentLifecycle
  attempt?: number
  escalationLevel?: number
  targetDeviceId?: string | null
  lastError?: string | null
}

export interface NotificationIntentListFilter extends ProductListFilter {
  reminderId?: string
  deliveryPolicy?: ReminderDeliveryPolicy
  lifecycle?: NotificationIntentLifecycle
  targetDeviceId?: string
  scheduledBefore?: number
}

export interface CreateCalendarEventInput extends ProductCreateIdentity {
  calendarEventId: string
  title: string
  description?: string
  startAt: number
  endAt: number
  timezone: string
  allDay: boolean
  location?: string
  sourceUrl?: string
  lifecycle?: CalendarEventLifecycle
  recurrence?: CalendarRecurrenceMetadata
}

export interface UpdateCalendarEventInput {
  calendarEventId: string
  expectedRevision: number
  patch: {
    title?: string
    description?: string | null
    startAt?: number
    endAt?: number
    timezone?: string
    allDay?: boolean
    location?: string | null
    sourceUrl?: string | null
    lifecycle?: CalendarEventLifecycle
    recurrence?: CalendarRecurrenceMetadata | null
  }
}

export interface CalendarEventListFilter extends ProductListFilter {
  lifecycle?: CalendarEventLifecycle
  startsBefore?: number
  endsAfter?: number
}

export interface CreateAppNoteInput extends ProductCreateIdentity {
  noteId: string
  title?: string
  contentJson: string
  plainTextPreview: string
  wordCount: number
  tags?: string[]
  entityId?: string
}

export interface UpdateAppNoteInput {
  noteId: string
  expectedRevision: number
  patch: {
    title?: string | null
    contentJson?: string
    plainTextPreview?: string
    wordCount?: number
    tags?: string[]
    entityId?: string | null
  }
}

export interface AppNoteListFilter extends ProductListFilter {
  tag?: string
}

export interface PutSourceRefInput extends ProductCreateIdentity {
  sourceRefId: string
  kind: SourceKind
  displayName: string
  sourceUrl?: string
  externalId?: string
  contentHash?: string
  syncState: ProjectionSyncState
  indexState: ProjectionIndexState
  provenanceIds?: string[]
  lastSyncedAt?: number
}

export interface UpdateSourceRefInput {
  sourceRefId: string
  expectedRevision: number
  patch: {
    displayName?: string
    sourceUrl?: string | null
    externalId?: string | null
    contentHash?: string | null
    syncState?: ProjectionSyncState
    indexState?: ProjectionIndexState
    provenanceIds?: string[]
    lastSyncedAt?: number | null
  }
}

export interface SourceRefListFilter extends ProductListFilter {
  kind?: SourceKind
  syncState?: ProjectionSyncState
  indexState?: ProjectionIndexState
}

export interface PutKnowledgeDocumentInput extends ProductCreateIdentity {
  knowledgeDocumentId: string
  kind: KnowledgeKind
  title: string
  summary: string
  tags?: string[]
  sourceRefIds?: string[]
  provenanceIds?: string[]
  syncState: ProjectionSyncState
  indexState: ProjectionIndexState
}

export interface UpdateKnowledgeDocumentInput {
  knowledgeDocumentId: string
  expectedRevision: number
  patch: {
    kind?: KnowledgeKind
    title?: string
    summary?: string
    tags?: string[]
    sourceRefIds?: string[]
    provenanceIds?: string[]
    syncState?: ProjectionSyncState
    indexState?: ProjectionIndexState
  }
}

export interface KnowledgeDocumentListFilter extends ProductListFilter {
  kind?: KnowledgeKind
  tag?: string
  syncState?: ProjectionSyncState
  indexState?: ProjectionIndexState
}

export interface ProductTaskRepository {
  list(filter?: ProductTaskListFilter): Promise<ProductPage<TaskItem>>
  create(input: CreateProductTaskInput): Promise<ProductMutationResult<TaskItem>>
  update(input: UpdateProductTaskInput): Promise<ProductMutationResult<TaskItem>>
  tombstone(taskId: string, expectedRevision: number): Promise<ProductMutationResult<TaskItem>>
}

export interface ProductReminderRepository {
  list(filter?: ProductReminderListFilter): Promise<ProductPage<ReminderItem>>
  create(input: CreateProductReminderInput): Promise<ProductMutationResult<ReminderItem>>
  update(input: UpdateProductReminderInput): Promise<ProductMutationResult<ReminderItem>>
  acknowledge(reminderId: string, expectedRevision: number): Promise<ProductMutationResult<ReminderItem>>
  snooze(reminderId: string, expectedRevision: number, nextFireAt: number): Promise<ProductMutationResult<ReminderItem>>
  tombstone(reminderId: string, expectedRevision: number): Promise<ProductMutationResult<ReminderItem>>
}

export interface ProductCalendarRepository {
  list(filter?: CalendarEventListFilter): Promise<ProductPage<CalendarEventItem>>
  create(input: CreateCalendarEventInput): Promise<ProductMutationResult<CalendarEventItem>>
  update(input: UpdateCalendarEventInput): Promise<ProductMutationResult<CalendarEventItem>>
  tombstone(calendarEventId: string, expectedRevision: number): Promise<ProductMutationResult<CalendarEventItem>>
}

export interface ProductNotificationIntentRepository {
  list(filter?: NotificationIntentListFilter): Promise<ProductPage<NotificationIntentItem>>
  create(input: CreateNotificationIntentInput): Promise<ProductMutationResult<NotificationIntentItem>>
  transition(input: TransitionNotificationIntentInput): Promise<ProductMutationResult<NotificationIntentItem>>
  tombstone(notificationIntentId: string, expectedRevision: number): Promise<ProductMutationResult<NotificationIntentItem>>
}

export interface ProductNoteRepository {
  list(filter?: AppNoteListFilter): Promise<ProductPage<AppNoteItem>>
  create(input: CreateAppNoteInput): Promise<ProductMutationResult<AppNoteItem>>
  update(input: UpdateAppNoteInput): Promise<ProductMutationResult<AppNoteItem>>
  tombstone(noteId: string, expectedRevision: number): Promise<ProductMutationResult<AppNoteItem>>
}

export interface ProductSourceRefRepository {
  list(filter?: SourceRefListFilter): Promise<ProductPage<SourceRefItem>>
  put(input: PutSourceRefInput): Promise<ProductMutationResult<SourceRefItem>>
  update(input: UpdateSourceRefInput): Promise<ProductMutationResult<SourceRefItem>>
  tombstone(sourceRefId: string, expectedRevision: number): Promise<ProductMutationResult<SourceRefItem>>
}

export interface ProductKnowledgeRepository {
  list(filter?: KnowledgeDocumentListFilter): Promise<ProductPage<KnowledgeDocumentItem>>
  put(input: PutKnowledgeDocumentInput): Promise<ProductMutationResult<KnowledgeDocumentItem>>
  update(input: UpdateKnowledgeDocumentInput): Promise<ProductMutationResult<KnowledgeDocumentItem>>
  tombstone(knowledgeDocumentId: string, expectedRevision: number): Promise<ProductMutationResult<KnowledgeDocumentItem>>
}

export interface ProductRepository {
  readonly tasksV1: ProductTaskRepository
  readonly remindersV1: ProductReminderRepository
  readonly notificationIntentsV1: ProductNotificationIntentRepository
  readonly calendarV1: ProductCalendarRepository
  readonly notesV1: ProductNoteRepository
  readonly sourceRefsV1: ProductSourceRefRepository
  readonly knowledgeV1: ProductKnowledgeRepository
}

export function isTipTapDocumentJson(contentJson: string): boolean {
  try {
    const parsed = JSON.parse(contentJson) as unknown
    return typeof parsed === 'object'
      && parsed !== null
      && !Array.isArray(parsed)
      && (parsed as { type?: unknown }).type === 'doc'
  } catch {
    return false
  }
}
