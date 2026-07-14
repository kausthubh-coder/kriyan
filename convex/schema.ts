import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import {
  commandStatus,
  jobStatus,
  nodeStatus,
  reminderStatus,
  reminderDeliveryPolicy,
  runEventType,
  runStatus,
  calendarEventStatus,
  indexState,
  knowledgeKind,
  notificationIntentLifecycle,
  sourceKind,
  syncState,
  taskPriority,
  taskStatus,
  agentMessageRole,
  agentTurnState,
  correctionAction,
  correctionState,
  projectionState,
} from './validators'

export default defineSchema({
  installations: defineTable({
    installationId: v.string(),
    timezone: v.string(),
    protocolVersion: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    contractVersion: v.optional(v.string()),
    compatibilityMode: v.optional(v.union(v.literal('dual-read'), v.literal('canonical'), v.literal('rollback'))),
    snapshotRevision: v.optional(v.number()),
  }).index('by_installation_id', ['installationId']),

  nodes: defineTable({
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
    .index('by_installation_node', ['installationId', 'nodeId'])
    .index('by_installation_status', ['installationId', 'status']),

  commands: defineTable({
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
    .index('by_installation_command', ['installationId', 'commandId'])
    .index('by_installation_created', ['installationId', 'createdAt'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_status', ['installationId', 'status']),

  jobs: defineTable({
    installationId: v.string(),
    jobId: v.string(),
    commandId: v.string(),
    contractVersion: v.optional(v.string()),
    kind: v.optional(v.string()),
    requiredCapabilities: v.optional(v.array(v.string())),
    routingCapability: v.optional(v.string()),
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
    .index('by_installation_job', ['installationId', 'jobId'])
    .index('by_installation_command', ['installationId', 'commandId'])
    .index('by_installation_status_created', [
      'installationId',
      'status',
      'createdAt',
    ])
    .index('by_installation_status_capability_created', [
      'installationId',
      'status',
      'routingCapability',
      'createdAt',
    ])
    .index('by_installation_lease', ['installationId', 'leaseExpiresAt'])
    .index('by_installation_lease_owner', [
      'installationId',
      'leaseOwnerNodeId',
    ])
    .index('by_installation_thread_ordinal', [
      'installationId',
      'threadId',
      'turnOrdinal',
    ])
    .index('by_installation_thread_status_ordinal', [
      'installationId',
      'threadId',
      'status',
      'turnOrdinal',
    ]),

  runs: defineTable({
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
    .index('by_installation_run', ['installationId', 'runId'])
    .index('by_installation_job_attempt', [
      'installationId',
      'jobId',
      'attempt',
    ])
    .index('by_installation_status', ['installationId', 'status']),

  runEvents: defineTable({
    installationId: v.string(),
    eventId: v.string(),
    runId: v.string(),
    sequence: v.number(),
    type: runEventType,
    data: v.string(),
    createdAt: v.number(),
  })
    .index('by_installation_event', ['installationId', 'eventId'])
    .index('by_installation_run_sequence', [
      'installationId',
      'runId',
      'sequence',
    ]),

  workerEffectReceipts: defineTable({
    installationId: v.string(), effectId: v.string(), jobId: v.string(),
    family: v.union(v.literal('task'), v.literal('reminder'), v.literal('note'), v.literal('source'), v.literal('knowledge')),
    action: v.string(), targetId: v.string(), inputHash: v.string(),
    targetRevision: v.number(), created: v.boolean(), createdAt: v.number(),
  })
    .index('by_installation_effect', ['installationId', 'effectId'])
    .index('by_installation_job', ['installationId', 'jobId']),

  tasks: defineTable({
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
    .index('by_installation_task', ['installationId', 'taskId'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_status_due', ['installationId', 'status', 'dueAt'])
    .index('by_installation_due', ['installationId', 'dueAt'])
    .index('by_installation_live_task', [
      'installationId',
      'deletedAt',
      'taskId',
    ])
    .index('by_installation_live_status_due', [
      'installationId',
      'deletedAt',
      'status',
      'dueAt',
    ])
    .index('by_installation_live_due', [
      'installationId',
      'deletedAt',
      'dueAt',
    ]),

  reminders: defineTable({
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
    .index('by_installation_reminder', ['installationId', 'reminderId'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_schedule_key', ['installationId', 'scheduleKey'])
    .index('by_installation_status_time', [
      'installationId',
      'status',
      'remindAt',
    ])
    .index('by_installation_time', ['installationId', 'remindAt'])
    .index('by_installation_live_reminder', [
      'installationId',
      'deletedAt',
      'reminderId',
    ])
    .index('by_installation_live_status_time', [
      'installationId',
      'deletedAt',
      'status',
      'remindAt',
    ])
    .index('by_installation_live_time', [
      'installationId',
      'deletedAt',
      'remindAt',
    ])
    .index('by_installation_live_next_fire', [
      'installationId',
      'deletedAt',
      'nextFireAt',
    ]),

  calendarEvents: defineTable({
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
    .index('by_installation_event', ['installationId', 'calendarEventId'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_live_start', ['installationId', 'deletedAt', 'startAt'])
    .index('by_installation_live_status_start', ['installationId', 'deletedAt', 'status', 'startAt'])
    .index('by_installation_external_event', ['installationId', 'sourceProvider', 'externalEventId']),

  notificationIntents: defineTable({
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
    .index('by_installation_intent', ['installationId', 'notificationIntentId'])
    .index('by_installation_dedupe', ['installationId', 'dedupeKey'])
    .index('by_installation_live_schedule', ['installationId', 'deletedAt', 'scheduledFor'])
    .index('by_installation_live_lifecycle_schedule', ['installationId', 'deletedAt', 'lifecycle', 'scheduledFor']),

  notes: defineTable({
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
    .index('by_installation_note', ['installationId', 'noteId'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_live_updated', ['installationId', 'deletedAt', 'updatedAt']),

  noteVersions: defineTable({
    installationId: v.string(), noteVersionId: v.string(), noteId: v.string(),
    version: v.number(), contentJson: v.string(), contentHash: v.string(),
    plainTextPreview: v.string(), wordCount: v.number(), authorOrigin: v.string(),
    createdAt: v.number(),
  })
    .index('by_installation_version', ['installationId', 'noteVersionId'])
    .index('by_installation_note_version', ['installationId', 'noteId', 'version']),

  artifacts: defineTable({
    installationId: v.string(), artifactId: v.string(), noteId: v.string(),
    noteVersionId: v.string(), slug: v.string(), projectionState,
    projectedHash: v.optional(v.string()), projectedPath: v.optional(v.string()),
    priorProjectedHash: v.optional(v.string()), priorProjectedPath: v.optional(v.string()),
    lastError: v.optional(v.string()), revision: v.number(), createdAt: v.number(),
    updatedAt: v.number(), deletedAt: v.optional(v.number()),
  })
    .index('by_installation_artifact', ['installationId', 'artifactId'])
    .index('by_installation_note', ['installationId', 'noteId'])
    .index('by_installation_live_artifact', ['installationId', 'deletedAt', 'artifactId']),

  artifactMaterializationHistory: defineTable({
    installationId: v.string(), historyId: v.string(), artifactId: v.string(),
    revision: v.number(), state: projectionState, noteVersionId: v.string(),
    slug: v.string(), projectedPath: v.optional(v.string()),
    projectedHash: v.optional(v.string()), error: v.optional(v.string()),
    occurredAt: v.number(),
  })
    .index('by_installation_history', ['installationId', 'historyId'])
    .index('by_installation_artifact_revision', ['installationId', 'artifactId', 'revision']),

  noteLinks: defineTable({
    installationId: v.string(), noteLinkId: v.string(), noteId: v.string(),
    idempotencyKey: v.string(),
    targetKind: v.string(), targetId: v.string(), relation: v.string(),
    provenanceIds: v.array(v.string()), revision: v.number(), createdAt: v.number(),
    updatedAt: v.number(), deletedAt: v.optional(v.number()),
  })
    .index('by_installation_link', ['installationId', 'noteLinkId'])
    .index('by_installation_link_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_note', ['installationId', 'noteId']),

  agents: defineTable({
    installationId: v.string(), agentId: v.string(), displayName: v.string(),
    currentRevisionId: v.string(), revision: v.number(), createdAt: v.number(),
    updatedAt: v.number(), deletedAt: v.optional(v.number()),
  })
    .index('by_installation_agent', ['installationId', 'agentId']),

  agentRevisions: defineTable({
    installationId: v.string(), agentRevisionId: v.string(), agentId: v.string(),
    ordinal: v.number(), displayName: v.string(), systemPrompt: v.string(),
    toolCapabilities: v.array(v.string()), createdAt: v.number(),
  })
    .index('by_installation_revision', ['installationId', 'agentRevisionId'])
    .index('by_installation_agent_ordinal', ['installationId', 'agentId', 'ordinal']),

  agentThreads: defineTable({
    installationId: v.string(), threadId: v.string(), agentId: v.string(),
    agentRevisionId: v.string(), title: v.optional(v.string()),
    nextTurnOrdinal: v.number(), activeTurnId: v.optional(v.string()),
    preferredNodeId: v.optional(v.string()), piSessionRef: v.optional(v.string()),
    sessionRevision: v.number(), createdAt: v.number(), updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_installation_thread', ['installationId', 'threadId'])
    .index('by_installation_agent', ['installationId', 'agentId']),

  agentMessages: defineTable({
    installationId: v.string(), messageId: v.string(), threadId: v.string(),
    turnId: v.string(), turnOrdinal: v.number(), role: agentMessageRole,
    state: agentTurnState, content: v.string(), origin: v.string(),
    agentRevisionId: v.string(), createdAt: v.number(), updatedAt: v.number(),
    finalizedAt: v.optional(v.number()),
  })
    .index('by_installation_message', ['installationId', 'messageId'])
    .index('by_installation_thread_ordinal', ['installationId', 'threadId', 'turnOrdinal'])
    .index('by_installation_turn_role', ['installationId', 'turnId', 'role']),

  sourceRefs: defineTable({
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
    .index('by_installation_source', ['installationId', 'sourceRefId'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_live_kind', ['installationId', 'deletedAt', 'kind'])
    .index('by_installation_live_sync', ['installationId', 'deletedAt', 'syncState']),

  sourceTranscriptExcerpts: defineTable({
    installationId: v.string(), excerptId: v.string(), sourceRefId: v.string(),
    text: v.string(), startOffset: v.number(), endOffset: v.number(),
    speaker: v.optional(v.string()), startAtMs: v.optional(v.number()),
    endAtMs: v.optional(v.number()), createdAt: v.number(),
  })
    .index('by_installation_excerpt', ['installationId', 'excerptId'])
    .index('by_installation_source_offset', ['installationId', 'sourceRefId', 'startOffset']),

  sourceExtractions: defineTable({
    installationId: v.string(), extractionId: v.string(), sourceRefId: v.string(),
    kind: v.string(), label: v.string(), value: v.string(),
    confidence: v.optional(v.number()), provenanceIds: v.array(v.string()),
    createdAt: v.number(),
  })
    .index('by_installation_extraction', ['installationId', 'extractionId'])
    .index('by_installation_source', ['installationId', 'sourceRefId']),

  reversibleChanges: defineTable({
    installationId: v.string(), changeId: v.string(), targetKind: v.string(),
    targetId: v.string(), action: v.string(), summary: v.string(),
    origin: v.string(), sourceRefIds: v.array(v.string()),
    provenanceIds: v.array(v.string()), beforeRevision: v.optional(v.number()),
    afterRevision: v.number(), reversible: v.boolean(), revertedAt: v.optional(v.number()),
    revertPayload: v.optional(v.string()), createdAt: v.number(),
  })
    .index('by_installation_change', ['installationId', 'changeId'])
    .index('by_installation_target_created', ['installationId', 'targetKind', 'targetId', 'createdAt']),

  reversibleChangeSources: defineTable({
    installationId: v.string(), changeId: v.string(), sourceRefId: v.string(), createdAt: v.number(),
  })
    .index('by_installation_change_source', ['installationId', 'changeId', 'sourceRefId'])
    .index('by_installation_source_created', ['installationId', 'sourceRefId', 'createdAt']),

  knowledgeDocuments: defineTable({
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
    .index('by_installation_knowledge', ['installationId', 'knowledgeDocumentId'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_live_kind', ['installationId', 'deletedAt', 'kind'])
    .index('by_installation_live_sync', ['installationId', 'deletedAt', 'syncState']),

  knowledgeRelations: defineTable({
    installationId: v.string(), relationId: v.string(), fromId: v.string(),
    toId: v.string(), kind: v.string(), changeId: v.string(), confidence: v.number(),
    revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_installation_relation', ['installationId', 'relationId'])
    .index('by_installation_from', ['installationId', 'fromId'])
    .index('by_installation_to', ['installationId', 'toId']),

  memoryFacts: defineTable({
    installationId: v.string(), factId: v.string(), entityId: v.string(),
    predicate: v.string(), value: v.string(), confidence: v.number(),
    sourceRefIds: v.array(v.string()), provenanceIds: v.array(v.string()),
    revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_installation_fact', ['installationId', 'factId'])
    .index('by_installation_entity', ['installationId', 'entityId']),

  provenanceLinks: defineTable({
    installationId: v.string(), provenanceLinkId: v.string(), targetKind: v.string(),
    targetId: v.string(), sourceRefId: v.string(), sourceVersion: v.string(),
    citation: v.string(), createdAt: v.number(), deletedAt: v.optional(v.number()),
  })
    .index('by_installation_provenance', ['installationId', 'provenanceLinkId'])
    .index('by_installation_target', ['installationId', 'targetKind', 'targetId'])
    .index('by_installation_source', ['installationId', 'sourceRefId']),

  projectionCursors: defineTable({
    installationId: v.string(), cursorId: v.string(), vaultId: v.string(),
    cursor: v.number(), documentHash: v.optional(v.string()), mode: v.string(),
    pageCursor: v.optional(v.string()), scanned: v.optional(v.number()),
    createdCount: v.optional(v.number()), manifestHash: v.optional(v.string()),
    revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index('by_installation_cursor', ['installationId', 'cursorId']),

  memoryCorrections: defineTable({
    installationId: v.string(), correctionId: v.string(), targetKind: v.string(),
    targetId: v.string(), action: correctionAction, replacement: v.optional(v.string()),
    reason: v.string(), actor: v.string(), origin: v.string(), expectedRevision: v.number(),
    state: correctionState, appliedRevision: v.optional(v.number()),
    conflict: v.optional(v.string()), createdAt: v.number(), updatedAt: v.number(),
  })
    .index('by_installation_correction', ['installationId', 'correctionId'])
    .index('by_installation_target', ['installationId', 'targetKind', 'targetId']),
})
