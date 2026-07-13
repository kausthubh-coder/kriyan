export type ConnectionMode = 'connecting' | 'online' | 'reconnecting' | 'offline'
export type ConnectionRecovery = 'initial' | 'confirmed' | 'awaiting-ready' | 'awaiting-subscription' | 'unconfirmed'
export type TaskStatus = 'open' | 'completed' | 'cancelled'
export type ReminderStatus = 'scheduled' | 'fired' | 'acknowledged' | 'dismissed' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'
export type ReminderDeliveryPolicy = 'normal' | 'persistent' | 'critical'
export type NotificationIntentLifecycle = 'queued' | 'dispatched' | 'acknowledged' | 'failed' | 'cancelled'
export type CalendarEventLifecycle = 'confirmed' | 'tentative' | 'cancelled'
export type SourceKind = 'audio' | 'video' | 'document' | 'web' | 'git' | 'calendar' | 'email' | 'chat' | 'other'
export type KnowledgeKind = 'person' | 'project' | 'topic' | 'organization' | 'place' | 'event' | 'other'
export type ProjectionSyncState = 'pending' | 'synced' | 'failed' | 'stale'
export type ProjectionIndexState = 'pending' | 'indexed' | 'failed' | 'stale'
export type JobStatus = 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'cancelled'
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled'
export type HonestRunState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
export type TransitionReason =
  | 'not_found'
  | 'stale_revision'
  | 'invalid_state'
  | 'attempts_exhausted'
  | 'already_terminal'
  | 'transport_error'

export interface InstallationItem {
  installationId: string
  timezone: string
  protocolVersion: string
  createdAt: number
  updatedAt: number
}

export interface TaskItem {
  taskId: string
  title: string
  status: TaskStatus
  dueAt?: number
  description?: string
  tags?: string[]
  priority?: TaskPriority
  startAt?: number
  projectId?: string
  entityId?: string
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
  optimistic?: boolean
}

export interface ReminderItem {
  reminderId: string
  message: string
  remindAt: number
  timezone: string
  status: ReminderStatus
  deliveryPolicy?: ReminderDeliveryPolicy
  acknowledgedAt?: number
  snoozedUntil?: number
  nextFireAt?: number
  linkedTaskId?: string
  entityId?: string
  scheduleKey?: string
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
  optimistic?: boolean
}

export interface NotificationIntentItem {
  notificationIntentId: string
  reminderId: string
  scheduledFor: number
  deliveryPolicy: ReminderDeliveryPolicy
  dedupeKey: string
  lifecycle: NotificationIntentLifecycle
  attempt: number
  escalationLevel: number
  targetDeviceId?: string
  lastAttemptAt?: number
  lastError?: string
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface CalendarRecurrenceMetadata {
  rule?: string
  seriesId?: string
  recurrenceId?: string
  providerUpdatedAt?: number
}

export interface CalendarEventItem {
  calendarEventId: string
  title: string
  description?: string
  startAt: number
  endAt: number
  timezone: string
  allDay: boolean
  location?: string
  sourceUrl?: string
  lifecycle: CalendarEventLifecycle
  recurrence?: CalendarRecurrenceMetadata
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface AppNoteItem {
  noteId: string
  title?: string
  contentJson: string
  plainTextPreview: string
  wordCount: number
  tags: string[]
  entityId?: string
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface SourceRefItem {
  sourceRefId: string
  kind: SourceKind
  displayName: string
  sourceUrl?: string
  externalId?: string
  contentHash?: string
  syncState: ProjectionSyncState
  indexState: ProjectionIndexState
  provenanceIds: string[]
  lastSyncedAt?: number
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface KnowledgeDocumentItem {
  knowledgeDocumentId: string
  kind: KnowledgeKind
  title: string
  summary: string
  tags: string[]
  sourceRefIds: string[]
  provenanceIds: string[]
  syncState: ProjectionSyncState
  indexState: ProjectionIndexState
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface CommandItem {
  commandId: string
  input: string
  status: 'accepted' | 'completed' | 'failed' | 'cancelled'
  revision: number
  createdAt: number
  updatedAt: number
}

export interface JobItem {
  jobId: string
  commandId: string
  status: JobStatus
  attempt: number
  maxAttempts: number
  lastError?: string
  revision: number
  createdAt: number
  updatedAt: number
}

export interface RunItem {
  runId: string
  jobId: string
  attempt: number
  nodeId: string
  status: RunStatus
  revision: number
  startedAt: number
  finishedAt?: number
  error?: string
}

export interface RunEventItem {
  eventId: string
  runId: string
  sequence: number
  type: 'status' | 'message' | 'tool' | 'error'
  data: string
  createdAt: number
}

export interface NodeItem {
  nodeId: string
  displayName: string
  capabilities: string[]
  status: 'online' | 'offline' | 'revoked'
  lastHeartbeatAt: number
  revision: number
}

export interface ActivityItem {
  command: CommandItem
  job?: JobItem
  run?: RunItem
  state: HonestRunState
  isFake: boolean
}

export interface ActivityProjectionItem {
  command: CommandItem
  job?: JobItem
  run?: RunItem
}

export interface PageState {
  canLoadMore: boolean
  loadingMore: boolean
  loadedCount: number
}

export type TransitionResult =
  | { ok: true; revision: number }
  | { ok: false; reason: TransitionReason }

export type ActionResult<T = void> =
  | { ok: true; value: T }
  | { ok: false; reason: TransitionReason; message: string }
