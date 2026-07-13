import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import {
  commandStatus,
  jobStatus,
  nodeStatus,
  reminderStatus,
  runEventType,
  runStatus,
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
    status: taskStatus,
    dueAt: v.optional(v.number()),
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
    timezone: v.string(),
    status: reminderStatus,
    revision: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index('by_installation_reminder', ['installationId', 'reminderId'])
    .index('by_installation_idempotency', ['installationId', 'idempotencyKey'])
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
    ]),
})
