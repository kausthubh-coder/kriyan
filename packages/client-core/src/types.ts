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
  origin?: 'user' | 'agent' | 'import' | 'projection'
  sourceRefIds?: string[]
  provenanceIds?: string[]
  reversibleChangeId?: string
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
  currentVersionId?: string
  contentHash?: string
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface NoteVersionItem {
  noteVersionId: string
  noteId: string
  version: number
  contentJson: string
  contentHash: string
  plainTextPreview: string
  wordCount: number
  authorOrigin: string
  createdAt: number
}

export interface NoteLinkItem {
  noteLinkId: string
  noteId: string
  targetKind: string
  targetId: string
  relation: string
  provenanceIds: string[]
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface NoteHistoryItem {
  note: AppNoteItem
  versions: NoteVersionItem[]
  links: NoteLinkItem[]
}

export interface ArtifactMaterializationHistoryItem {
  revision: number
  state: 'pending' | 'projected' | 'failed' | 'tombstoned'
  noteVersionId: string
  slug: string
  projectedPath?: string
  projectedHash?: string
  error?: string
  occurredAt: number
}

export interface ArtifactItem {
  artifactId: string
  noteId: string
  noteVersionId: string
  slug: string
  projectionState: 'pending' | 'projected' | 'failed' | 'tombstoned'
  projectedHash?: string
  projectedPath?: string
  priorProjectedHash?: string
  priorProjectedPath?: string
  lastError?: string
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
  history?: ArtifactMaterializationHistoryItem[]
}

export interface SourceTranscriptExcerptItem {
  excerptId: string
  text: string
  startOffset: number
  endOffset: number
  speaker?: string
  startAtMs?: number
  endAtMs?: number
}

export interface SourceExtractionItem {
  extractionId: string
  kind: string
  label: string
  value: string
  confidence?: number
  provenanceIds: string[]
}

export interface ReversibleChangeItem {
  changeId: string
  targetKind: string
  targetId: string
  action: string
  summary: string
  origin: string
  sourceRefIds: string[]
  provenanceIds: string[]
  beforeRevision?: number
  afterRevision: number
  reversible: boolean
  revertedAt?: number
  createdAt: number
}

export interface SourceDetailItem {
  source: SourceRefItem
  transcriptPreview?: string
  transcriptTruncated: boolean
  excerpts: SourceTranscriptExcerptItem[]
  excerptsTruncated: boolean
  extractions: SourceExtractionItem[]
  extractionsTruncated: boolean
  derivedChanges: ReversibleChangeItem[]
  derivedChangesTruncated: boolean
}

export interface MemoryFactItem {
  factId: string
  entityId: string
  predicate: string
  value: string
  confidence: number
  sourceRefIds: string[]
  provenanceIds: string[]
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface MemoryRelationItem {
  relationId: string
  fromEntityId: string
  toEntityId: string
  relationType: string
  confidence: number
  provenanceIds: string[]
  revision: number
  createdAt: number
  updatedAt: number
  deletedAt?: number
}

export interface MemoryProvenanceItem {
  provenanceLinkId: string
  targetKind: string
  targetId: string
  sourceRefId: string
  excerpt?: string
  locator?: string
  confidence?: number
  createdAt: number
  deletedAt?: number
}

export interface MemoryCorrectionItem {
  correctionId: string
  targetKind: string
  targetId: string
  action: 'retract' | 'replace' | 'restore'
  replacement?: string
  reason: string
  actor: string
  origin: string
  expectedRevision: number
  state: 'pending' | 'applied' | 'restored' | 'conflict'
  appliedRevision?: number
  conflict?: string
  createdAt: number
  updatedAt: number
}

export interface MemoryEntityDetailItem {
  entityId: string
  facts: MemoryFactItem[]
  relations: MemoryRelationItem[]
  provenance: MemoryProvenanceItem[]
  corrections: MemoryCorrectionItem[]
  conflicts: MemoryCorrectionItem[]
}

export interface TaskProvenanceDetailItem {
  task: TaskItem
  origin: string
  sources: SourceRefItem[]
  provenance: MemoryProvenanceItem[]
  changes: ReversibleChangeItem[]
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
