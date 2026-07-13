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
} from './validators'

export default defineSchema({
  installations: defineTable({
    installationId: v.string(),
    timezone: v.string(),
    protocolVersion: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
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
    .index('by_installation_lease', ['installationId', 'leaseExpiresAt'])
    .index('by_installation_lease_owner', [
      'installationId',
      'leaseOwnerNodeId',
    ]),

  runs: defineTable({
    installationId: v.string(),
    runId: v.string(),
    jobId: v.string(),
    attempt: v.number(),
    nodeId: v.string(),
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
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_installation_note', ['installationId', 'noteId'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
    .index('by_installation_live_updated', ['installationId', 'deletedAt', 'updatedAt']),

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
})
