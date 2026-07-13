import { ConvexClient } from 'convex/browser'

import { api } from '../../../convex/_generated/api'

import {
  createKnowledgeProjectionPlane,
  type KnowledgeDocumentProjectionInput,
  type KnowledgeProjectionPlane,
  type ProjectionUpsertResult,
  type SourceRefProjectionInput,
} from './knowledge-projections'

export * from './knowledge-projections'
export * from './worker-contract'

export type JobStatus =
  | 'queued'
  | 'leased'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface Job {
  installationId: string
  jobId: string
  commandId: string
  contractVersion?: string
  kind?: string
  requiredCapabilities?: string[]
  preferredNodeId?: string
  threadId?: string
  turnId?: string
  turnOrdinal?: number
  agentRevisionId?: string
  assistantMessageId?: string
  leaseToken?: string
  status: JobStatus
  attempt: number
  maxAttempts: number
  leaseOwnerNodeId?: string
  leaseExpiresAt?: number
  revision: number
  createdAt?: number
  updatedAt?: number
}

export interface Run {
  installationId: string
  runId: string
  jobId: string
  attempt: number
  nodeId: string
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  revision: number
}

export interface NodeRegistration {
  installationId: string
  nodeId: string
  displayName: string
  capabilities: string[]
  protocolVersion: string
}

export interface NodeRecord extends NodeRegistration {
  status: 'online' | 'offline' | 'revoked'
  lastHeartbeatAt: number
  revision: number
  createdAt?: number
  updatedAt?: number
}

export const NODE_HEARTBEAT_TIMEOUT_MS = 60_000

export interface NodeHealth {
  status: 'pending' | 'online' | 'offline' | 'revoked'
  reason: 'first_heartbeat_pending' | 'fresh' | 'stale' | 'clock_skew' | 'revoked'
  ageMs: number | null
}

/**
 * Derives effective health from the server-stamped heartbeat. Consumers must
 * never treat the persisted `status` field alone as evidence of a live worker.
 */
export function deriveNodeHealth(
  node: NodeRecord,
  observedAt: number,
  timeoutMs = NODE_HEARTBEAT_TIMEOUT_MS,
): NodeHealth {
  if (node.status === 'revoked') {
    return { status: 'revoked', reason: 'revoked', ageMs: null }
  }
  if (node.revision === 0) {
    return { status: 'pending', reason: 'first_heartbeat_pending', ageMs: null }
  }
  const ageMs = observedAt - node.lastHeartbeatAt
  if (ageMs < 0) return { status: 'offline', reason: 'clock_skew', ageMs }
  if (ageMs > timeoutMs || node.status === 'offline') {
    return { status: 'offline', reason: 'stale', ageMs }
  }
  return { status: 'online', reason: 'fresh', ageMs }
}

export interface RunEventInput {
  eventId: string
  sequence: number
  type:
    | 'status' | 'message' | 'tool' | 'error'
    | 'run.claimed' | 'run.started' | 'message.delta' | 'message.completed'
    | 'tool.started' | 'tool.finished' | 'knowledge.changed'
    | 'run.finished' | 'run.failed'
  data: string
  installationId?: string
  runId?: string
  createdAt?: number
}

export type Transition =
  | { ok: true; revision: number }
  | { ok: false; reason: string }

export interface ControlPlane {
  registerNode(input: NodeRegistration): Promise<{ created: boolean; node: NodeRecord }>
  heartbeatNode(installationId: string, nodeId: string, revision: number): Promise<Transition>
  claimJob(installationId: string, nodeId: string, leaseDurationMs: number): Promise<{ job: Job; reclaimed: boolean } | null>
  renewLease(installationId: string, nodeId: string, job: Job, leaseDurationMs: number): Promise<Transition>
  startRun(installationId: string, nodeId: string, job: Job): Promise<
    | { ok: true; created: boolean; job: Job; run: Run }
    | { ok: false; reason: string }
  >
  appendEvents(
    installationId: string,
    nodeId: string,
    job: Job,
    run: Run,
    events: RunEventInput[],
  ): Promise<
    | { ok: true; duplicate: boolean; revision: number }
    | { ok: false; reason: string }
  >
  completeRun(installationId: string, nodeId: string, job: Job, run: Run, assistantContent?: string): Promise<Transition>
  failRun(
    installationId: string,
    nodeId: string,
    job: Job,
    run: Run,
    error: string,
    retryable: boolean,
  ): Promise<Transition>
  command(installationId: string, commandId: string): Promise<
    | {
        installationId?: string
        commandId?: string
        idempotencyKey?: string
        input: string
        status: 'accepted' | 'completed' | 'failed' | 'cancelled'
        revision?: number
        createdAt?: number
        updatedAt?: number
      }
    | null
  >
  createReminder(input: {
    installationId: string
    reminderId: string
    idempotencyKey: string
    message: string
    remindAt: number
    timezone: string
  }): Promise<{ created: boolean }>
  createInstallation(input: {
    installationId: string
    timezone: string
    protocolVersion: string
  }): Promise<{ created: boolean }>
  submit(input: {
    installationId: string
    commandId: string
    idempotencyKey: string
    input: string
    maxAttempts: number
  }): Promise<{ created: boolean; job: Job }>
  nodes(installationId: string): Promise<NodeRecord[]>
  reminders(installationId: string): Promise<Array<{
    reminderId: string
    message: string
    createdAt?: number
    updatedAt?: number
  }>>
  runEvents(installationId: string, runId: string): Promise<RunEventInput[]>
  close(): Promise<void>
}

function requireUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new Error('Convex URL must use HTTPS except for localhost')
  }
  return url.toString().replace(/\/$/, '')
}

export class ConvexControlPlane
  implements ControlPlane, KnowledgeProjectionPlane
{
  private readonly client: ConvexClient
  private readonly knowledge: KnowledgeProjectionPlane

  constructor(url: string) {
    this.client = new ConvexClient(requireUrl(url))
    this.knowledge = createKnowledgeProjectionPlane(this.client)
  }

  async registerNode(input: NodeRegistration) {
    return await this.client.mutation(api.worker.registerNode, input)
  }

  async heartbeatNode(installationId: string, nodeId: string, expectedRevision: number) {
    return await this.client.mutation(api.worker.heartbeatNode, {
      installationId,
      nodeId,
      expectedRevision,
    })
  }

  async claimJob(installationId: string, nodeId: string, leaseDurationMs: number) {
    return await this.client.mutation(api.worker.claimJob, {
      installationId,
      nodeId,
      leaseDurationMs,
    })
  }

  async renewLease(installationId: string, nodeId: string, job: Job, leaseDurationMs: number) {
    return await this.client.mutation(api.worker.renewLease, {
      installationId,
      nodeId,
      expectedRevision: job.revision,
      expectedLeaseToken: job.leaseToken,
      jobId: job.jobId,
      leaseDurationMs,
    })
  }

  async startRun(installationId: string, nodeId: string, job: Job) {
    return await this.client.mutation(api.worker.startRun, {
      installationId,
      nodeId,
      jobId: job.jobId,
      expectedJobRevision: job.revision,
      expectedLeaseToken: job.leaseToken,
    })
  }

  async appendEvents(
    installationId: string,
    nodeId: string,
    job: Job,
    run: Run,
    events: RunEventInput[],
  ) {
    return await this.client.mutation(api.worker.appendRunEvents, {
      installationId,
      nodeId,
      jobId: job.jobId,
      runId: run.runId,
      expectedJobRevision: job.revision,
      expectedRunRevision: run.revision,
      expectedLeaseToken: job.leaseToken,
      events,
    })
  }

  async completeRun(installationId: string, nodeId: string, job: Job, run: Run, assistantContent?: string) {
    return await this.client.mutation(api.worker.completeRun, {
      installationId,
      nodeId,
      jobId: job.jobId,
      runId: run.runId,
      expectedJobRevision: job.revision,
      expectedRunRevision: run.revision,
      expectedLeaseToken: job.leaseToken,
      assistantContent,
    })
  }

  async failRun(
    installationId: string,
    nodeId: string,
    job: Job,
    run: Run,
    error: string,
    retryable: boolean,
  ) {
    return await this.client.mutation(api.worker.failRun, {
      installationId,
      nodeId,
      jobId: job.jobId,
      runId: run.runId,
      expectedJobRevision: job.revision,
      expectedRunRevision: run.revision,
      expectedLeaseToken: job.leaseToken,
      error,
      retryable,
    })
  }

  async command(installationId: string, commandId: string) {
    return await this.client.query(api.commands.get, { installationId, commandId })
  }

  async createReminder(input: {
    installationId: string
    reminderId: string
    idempotencyKey: string
    message: string
    remindAt: number
    timezone: string
  }) {
    return await this.client.mutation(api.projections.createReminder, {
      ...input,
      status: 'scheduled',
    })
  }

  async createInstallation(input: {
    installationId: string
    timezone: string
    protocolVersion: string
  }) {
    return await this.client.mutation(api.installations.create, input)
  }

  async submit(input: {
    installationId: string
    commandId: string
    idempotencyKey: string
    input: string
    maxAttempts: number
  }) {
    return await this.client.mutation(api.commands.submit, input)
  }

  async nodes(installationId: string) {
    const result = await this.client.query(api.read.nodes, {
      installationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
    return result.page
  }

  async reminders(installationId: string) {
    const result = await this.client.query(api.projections.listReminders, {
      installationId,
      paginationOpts: { numItems: 100, cursor: null },
    })
    return result.page
  }

  async runEvents(installationId: string, runId: string) {
    const result = await this.client.query(api.read.runEvents, {
      installationId,
      runId,
      paginationOpts: { numItems: 100, cursor: null },
    })
    return result.page
  }

  async upsertSourceRef(
    input: SourceRefProjectionInput,
  ): Promise<ProjectionUpsertResult> {
    return await this.knowledge.upsertSourceRef(input)
  }

  async upsertKnowledgeDocument(
    input: KnowledgeDocumentProjectionInput,
  ): Promise<ProjectionUpsertResult> {
    return await this.knowledge.upsertKnowledgeDocument(input)
  }

  async close(): Promise<void> {
    await this.client.close()
  }
}
