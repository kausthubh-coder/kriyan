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
)

export const taskStatus = v.union(
  v.literal('open'),
  v.literal('completed'),
  v.literal('cancelled'),
)

export const reminderStatus = v.union(
  v.literal('scheduled'),
  v.literal('fired'),
  v.literal('dismissed'),
  v.literal('cancelled'),
)

export const installationValue = v.object({
  installationId: v.string(),
  timezone: v.string(),
  protocolVersion: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
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
  status: commandStatus,
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const jobValue = v.object({
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

export const runValue = v.object({
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

export const runEventValue = v.object({
  installationId: v.string(),
  eventId: v.string(),
  runId: v.string(),
  sequence: v.number(),
  type: runEventType,
  data: v.string(),
  createdAt: v.number(),
})

export const taskValue = v.object({
  installationId: v.string(),
  taskId: v.string(),
  idempotencyKey: v.string(),
  title: v.string(),
  status: taskStatus,
  dueAt: v.optional(v.number()),
  revision: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const reminderValue = v.object({
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
    ),
  }),
)
