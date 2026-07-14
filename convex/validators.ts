import { v } from 'convex/values'

export const nodeStatus = v.union(
  v.literal('online'),
  v.literal('offline'),
  v.literal('revoked'),
)

export const commandStatus = v.union(
  v.literal('accepted'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('cancelled'),
)

export const jobStatus = v.union(
  v.literal('queued'),
  v.literal('leased'),
  v.literal('running'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('cancelled'),
)

export const runStatus = v.union(
  v.literal('running'),
  v.literal('succeeded'),
  v.literal('failed'),
  v.literal('cancelled'),
)

export const runEventType = v.union(
  v.literal('status'),
  v.literal('message'),
  v.literal('tool'),
  v.literal('error'),
  v.literal('run.claimed'),
  v.literal('run.started'),
  v.literal('message.delta'),
  v.literal('message.completed'),
  v.literal('tool.started'),
  v.literal('tool.finished'),
  v.literal('knowledge.changed'),
  v.literal('run.finished'),
  v.literal('run.failed'),
)

export const agentMessageRole = v.union(
  v.literal('user'),
  v.literal('assistant'),
  v.literal('system'),
  v.literal('tool'),
)

export const agentTurnState = v.union(
  v.literal('queued'),
  v.literal('active'),
  v.literal('completed'),
  v.literal('failed'),
  v.literal('cancelled'),
  v.literal('waiting_for_node'),
)

export const projectionState = v.union(
  v.literal('pending'),
  v.literal('projected'),
  v.literal('failed'),
  v.literal('tombstoned'),
)

export const correctionAction = v.union(
  v.literal('retract'),
  v.literal('replace'),
  v.literal('restore'),
)

export const correctionState = v.union(
  v.literal('pending'),
  v.literal('applied'),
  v.literal('restored'),
  v.literal('conflict'),
)

export const taskStatus = v.union(
  v.literal('open'),
  v.literal('completed'),
  v.literal('cancelled'),
)

export const taskPriority = v.union(
  v.literal('low'),
  v.literal('normal'),
  v.literal('high'),
  v.literal('urgent'),
)

export const reminderStatus = v.union(
  v.literal('scheduled'),
  v.literal('fired'),
  v.literal('acknowledged'),
  v.literal('dismissed'),
  v.literal('cancelled'),
)

export const reminderDeliveryPolicy = v.union(
  v.literal('normal'),
  v.literal('persistent'),
  v.literal('critical'),
)

export const notificationIntentLifecycle = v.union(
  v.literal('queued'),
  v.literal('dispatched'),
  v.literal('acknowledged'),
  v.literal('failed'),
  v.literal('cancelled'),
)

export const calendarEventStatus = v.union(
  v.literal('confirmed'),
  v.literal('tentative'),
  v.literal('cancelled'),
)

export const sourceKind = v.union(
  v.literal('audio'),
  v.literal('video'),
  v.literal('document'),
  v.literal('web'),
  v.literal('git'),
  v.literal('calendar'),
  v.literal('email'),
  v.literal('chat'),
  v.literal('other'),
)

export const knowledgeKind = v.union(
  v.literal('person'),
  v.literal('project'),
  v.literal('topic'),
  v.literal('organization'),
  v.literal('place'),
  v.literal('event'),
  v.literal('other'),
)

export const syncState = v.union(
  v.literal('pending'),
  v.literal('synced'),
  v.literal('failed'),
  v.literal('stale'),
)

export const indexState = v.union(
  v.literal('pending'),
  v.literal('indexed'),
  v.literal('failed'),
  v.literal('stale'),
)

export const installationValue = v.object({
  installationId: v.string(),
  timezone: v.string(),
  protocolVersion: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
  contractVersion: v.optional(v.string()),
  compatibilityMode: v.optional(v.union(v.literal('dual-read'), v.literal('canonical'), v.literal('rollback'))),
  snapshotRevision: v.optional(v.number()),
})

export const nodeValue = v.object({
  installationId: v.string(),
  nodeId: v.string(),
  displayName: v.string(),
  capabilities: v.array(v.string()),
  protocolVersion: v.string(),
  status: nodeStatus,
  lastHeartbeatAt: v.number(),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const commandValue = v.object({
  installationId: v.string(),
  commandId: v.string(),
  idempotencyKey: v.string(),
  input: v.string(),
  contractVersion: v.optional(v.string()),
  kind: v.optional(v.string()),
  threadId: v.optional(v.string()),
  turnId: v.optional(v.string()),
  turnOrdinal: v.optional(v.number()),
  agentRevisionId: v.optional(v.string()),
  status: commandStatus,
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const jobValue = v.object({
  installationId: v.string(),
  jobId: v.string(),
  commandId: v.string(),
  contractVersion: v.optional(v.string()),
  kind: v.optional(v.string()),
  requiredCapabilities: v.optional(v.array(v.string())),
  preferredNodeId: v.optional(v.string()),
  threadId: v.optional(v.string()),
  turnId: v.optional(v.string()),
  turnOrdinal: v.optional(v.number()),
  agentRevisionId: v.optional(v.string()),
  assistantMessageId: v.optional(v.string()),
  leaseToken: v.optional(v.string()),
  effectCheckpoint: v.optional(v.string()),
  sessionCheckpoint: v.optional(v.string()),
  sessionRevision: v.optional(v.number()),
  status: jobStatus,
  attempt: v.number(),
  maxAttempts: v.number(),
  leaseOwnerNodeId: v.optional(v.string()),
  leaseExpiresAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const runValue = v.object({
  installationId: v.string(),
  runId: v.string(),
  jobId: v.string(),
  attempt: v.number(),
  nodeId: v.string(),
  threadId: v.optional(v.string()),
  turnId: v.optional(v.string()),
  turnOrdinal: v.optional(v.number()),
  agentRevisionId: v.optional(v.string()),
  assistantMessageId: v.optional(v.string()),
  status: runStatus,
  revision: v.number(),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  error: v.optional(v.string()),
})

export const runEventValue = v.object({
  installationId: v.string(),
  eventId: v.string(),
  runId: v.string(),
  sequence: v.number(),
  type: runEventType,
  data: v.string(),
  createdAt: v.number(),
})

export const workerEffectReceiptValue = v.object({
  effectId: v.string(), jobId: v.string(),
  family: v.union(v.literal('task'), v.literal('reminder'), v.literal('note'), v.literal('source'), v.literal('knowledge')),
  action: v.string(), targetId: v.string(), inputHash: v.string(),
  targetRevision: v.number(), created: v.boolean(), createdAt: v.number(),
})

export const activityValue = v.object({
  command: commandValue,
  job: v.optional(jobValue),
  run: v.optional(runValue),
})

export const taskValue = v.object({
  installationId: v.string(),
  taskId: v.string(),
  idempotencyKey: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  tags: v.array(v.string()),
  priority: v.optional(taskPriority),
  status: taskStatus,
  startAt: v.optional(v.number()),
  dueAt: v.optional(v.number()),
  projectId: v.optional(v.string()),
  entityId: v.optional(v.string()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})

export const reminderValue = v.object({
  installationId: v.string(),
  reminderId: v.string(),
  idempotencyKey: v.string(),
  message: v.string(),
  remindAt: v.number(),
  nextFireAt: v.optional(v.number()),
  timezone: v.string(),
  deliveryPolicy: reminderDeliveryPolicy,
  status: reminderStatus,
  scheduleKey: v.string(),
  fireCount: v.number(),
  acknowledgedAt: v.optional(v.number()),
  snoozedUntil: v.optional(v.number()),
  lastFiredAt: v.optional(v.number()),
  linkedTaskId: v.optional(v.string()),
  entityId: v.optional(v.string()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})

export const calendarEventValue = v.object({
  installationId: v.string(),
  calendarEventId: v.string(),
  idempotencyKey: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  startAt: v.number(),
  endAt: v.number(),
  timezone: v.string(),
  allDay: v.boolean(),
  location: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  status: calendarEventStatus,
  sourceProvider: v.optional(v.string()),
  externalCalendarId: v.optional(v.string()),
  externalEventId: v.optional(v.string()),
  recurrenceRule: v.optional(v.string()),
  recurringEventId: v.optional(v.string()),
  originalStartAt: v.optional(v.number()),
  sourceRefId: v.optional(v.string()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})

export const notificationIntentValue = v.object({
  installationId: v.string(),
  notificationIntentId: v.string(),
  reminderId: v.string(),
  scheduledFor: v.number(),
  deliveryPolicy: reminderDeliveryPolicy,
  dedupeKey: v.string(),
  lifecycle: notificationIntentLifecycle,
  attempt: v.number(),
  escalationLevel: v.number(),
  targetDeviceId: v.optional(v.string()),
  lastAttemptAt: v.optional(v.number()),
  lastError: v.optional(v.string()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})

export const noteValue = v.object({
  installationId: v.string(),
  noteId: v.string(),
  idempotencyKey: v.string(),
  title: v.optional(v.string()),
  contentJson: v.string(),
  plainTextPreview: v.string(),
  wordCount: v.number(),
  tags: v.array(v.string()),
  entityId: v.optional(v.string()),
  currentVersionId: v.optional(v.string()),
  contentHash: v.optional(v.string()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})

export const agentValue = v.object({
  installationId: v.string(), agentId: v.string(), displayName: v.string(),
  currentRevisionId: v.string(), revision: v.number(), createdAt: v.number(),
  updatedAt: v.number(), deletedAt: v.optional(v.number()),
})

export const agentRevisionValue = v.object({
  installationId: v.string(), agentRevisionId: v.string(), agentId: v.string(),
  ordinal: v.number(), displayName: v.string(), systemPrompt: v.string(),
  toolCapabilities: v.array(v.string()), createdAt: v.number(),
})

export const agentThreadValue = v.object({
  installationId: v.string(), threadId: v.string(), agentId: v.string(),
  agentRevisionId: v.string(), title: v.optional(v.string()),
  nextTurnOrdinal: v.number(), activeTurnId: v.optional(v.string()),
  preferredNodeId: v.optional(v.string()), piSessionRef: v.optional(v.string()),
  sessionRevision: v.number(), createdAt: v.number(), updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})

export const agentMessageValue = v.object({
  installationId: v.string(), messageId: v.string(), threadId: v.string(),
  turnId: v.string(), turnOrdinal: v.number(), role: agentMessageRole,
  state: agentTurnState, content: v.string(), origin: v.string(),
  agentRevisionId: v.string(), createdAt: v.number(), updatedAt: v.number(),
  finalizedAt: v.optional(v.number()),
})

export const noteVersionValue = v.object({
  installationId: v.string(), noteVersionId: v.string(), noteId: v.string(),
  version: v.number(), contentJson: v.string(), contentHash: v.string(),
  plainTextPreview: v.string(), wordCount: v.number(), authorOrigin: v.string(),
  createdAt: v.number(),
})

export const artifactValue = v.object({
  installationId: v.string(), artifactId: v.string(), noteId: v.string(),
  noteVersionId: v.string(), slug: v.string(), projectionState,
  projectedHash: v.optional(v.string()), projectedPath: v.optional(v.string()),
  priorProjectedHash: v.optional(v.string()), priorProjectedPath: v.optional(v.string()),
  lastError: v.optional(v.string()), revision: v.number(), createdAt: v.number(),
  updatedAt: v.number(), deletedAt: v.optional(v.number()),
})

export const noteLinkValue = v.object({
  installationId: v.string(), noteLinkId: v.string(), noteId: v.string(),
  idempotencyKey: v.string(), targetKind: v.string(), targetId: v.string(),
  relation: v.string(), provenanceIds: v.array(v.string()), revision: v.number(),
  createdAt: v.number(), updatedAt: v.number(), deletedAt: v.optional(v.number()),
})

export const memoryCorrectionValue = v.object({
  installationId: v.string(), correctionId: v.string(), targetKind: v.string(),
  targetId: v.string(), action: correctionAction, replacement: v.optional(v.string()),
  reason: v.string(), actor: v.string(), origin: v.string(), expectedRevision: v.number(),
  state: correctionState, appliedRevision: v.optional(v.number()),
  conflict: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
})

export const sourceRefValue = v.object({
  installationId: v.string(),
  sourceRefId: v.string(),
  idempotencyKey: v.string(),
  kind: sourceKind,
  displayName: v.string(),
  sourceUrl: v.optional(v.string()),
  externalId: v.optional(v.string()),
  contentHash: v.optional(v.string()),
  syncState,
  indexState,
  provenanceIds: v.array(v.string()),
  lastSyncedAt: v.optional(v.number()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})

export const knowledgeDocumentValue = v.object({
  installationId: v.string(),
  knowledgeDocumentId: v.string(),
  idempotencyKey: v.string(),
  kind: knowledgeKind,
  title: v.string(),
  summary: v.string(),
  tags: v.array(v.string()),
  sourceRefIds: v.array(v.string()),
  provenanceIds: v.array(v.string()),
  syncState,
  indexState,
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  deletedAt: v.optional(v.number()),
})

export const clientSnapshotValue = v.object({
  transactionRevision: v.number(),
  productivity: v.object({
    tasks: v.array(taskValue), reminders: v.array(reminderValue),
    calendarEvents: v.array(calendarEventValue), notes: v.array(noteValue),
    notificationIntents: v.array(notificationIntentValue),
  }),
  agents: v.object({ threads: v.array(agentThreadValue), messages: v.array(agentMessageValue) }),
  knowledge: v.object({
    sources: v.array(sourceRefValue), documents: v.array(knowledgeDocumentValue),
    artifacts: v.array(artifactValue),
  }),
  nodes: v.object({ items: v.array(nodeValue), activity: v.array(activityValue) }),
})

export const transitionResult = v.union(
  v.object({ ok: v.literal(true), revision: v.number() }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal('not_found'),
      v.literal('stale_revision'),
      v.literal('invalid_state'),
      v.literal('lease_expired'),
      v.literal('not_lease_owner'),
      v.literal('attempts_exhausted'),
      v.literal('inactive_node'),
      v.literal('stale_heartbeat'),
      v.literal('missing_capability'),
    ),
  }),
)

export const projectionUpsertResult = v.union(
  v.object({
    ok: v.literal(true),
    created: v.boolean(),
    revision: v.number(),
  }),
  v.object({
    ok: v.literal(false),
    reason: v.union(
      v.literal('not_found'),
      v.literal('stale_revision'),
      v.literal('invalid_state'),
    ),
  }),
)
