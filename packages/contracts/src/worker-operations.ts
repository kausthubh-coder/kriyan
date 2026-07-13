export type TransitionFailure =
  | 'not_found'
  | 'stale_revision'
  | 'invalid_state'
  | 'lease_expired'
  | 'not_lease_owner'
  | 'attempts_exhausted'
  | 'inactive_node'
  | 'stale_heartbeat'
  | 'missing_capability'
  | 'already_terminal'

export type TransitionResult =
  | { ok: true; revision: number }
  | { ok: false; reason: TransitionFailure }

export interface RunEventInput {
  eventId: string
  sequence: number
  type:
    | 'status' | 'message' | 'tool' | 'error'
    | 'run.claimed' | 'run.started' | 'message.delta' | 'message.completed'
    | 'tool.started' | 'tool.finished' | 'knowledge.changed'
    | 'run.finished' | 'run.failed'
  data: string
}

export interface WorkerNodeResult {
  installationId: string
  nodeId: string
  displayName: string
  capabilities: string[]
  protocolVersion: string
  status: 'online' | 'offline' | 'revoked'
  lastHeartbeatAt: number
  revision: number
  createdAt: number
  updatedAt: number
}

export interface WorkerCommandResult {
  installationId: string
  commandId: string
  idempotencyKey: string
  input: string
  contractVersion?: string
  kind?: string
  threadId?: string
  turnId?: string
  turnOrdinal?: number
  agentRevisionId?: string
  status: 'accepted' | 'completed' | 'failed' | 'cancelled'
  revision: number
  createdAt: number
  updatedAt: number
}

export interface WorkerJobResult {
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
  effectCheckpoint?: string
  sessionCheckpoint?: string
  status: 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'cancelled'
  attempt: number
  maxAttempts: number
  leaseOwnerNodeId?: string
  leaseExpiresAt?: number
  lastError?: string
  revision: number
  createdAt: number
  updatedAt: number
}

export interface WorkerRunResult {
  installationId: string
  runId: string
  jobId: string
  attempt: number
  nodeId: string
  threadId?: string
  turnId?: string
  turnOrdinal?: number
  agentRevisionId?: string
  assistantMessageId?: string
  status: 'running' | 'succeeded' | 'failed' | 'cancelled'
  revision: number
  startedAt: number
  finishedAt?: number
  error?: string
}

export interface WorkerRunEventResult extends RunEventInput {
  installationId: string
  runId: string
  createdAt: number
}

export interface WorkerCorrectionResult {
  installationId: string
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

export interface WorkerOperationInputMap {
  'node.register': { installationId: string; nodeId: string; displayName: string; capabilities: string[]; protocolVersion: string }
  'node.heartbeat': { installationId: string; nodeId: string; expectedRevision: number }
  'command.read': { installationId: string; commandId: string }
  'job.claim': { installationId: string; nodeId: string; leaseDurationMs: number }
  'job.lease.renew': { installationId: string; jobId: string; nodeId: string; expectedRevision: number; expectedLeaseToken?: string; leaseDurationMs: number }
  'run.start': { installationId: string; jobId: string; nodeId: string; expectedJobRevision: number; expectedLeaseToken?: string }
  'run.events.append': { installationId: string; jobId: string; runId: string; nodeId: string; expectedJobRevision: number; expectedRunRevision: number; expectedLeaseToken?: string; events: RunEventInput[] }
  'effect.checkpoint': { installationId: string; jobId: string; nodeId: string; expectedJobRevision: number; expectedLeaseToken?: string; checkpoint: string }
  'session.checkpoint': { installationId: string; jobId: string; nodeId: string; expectedJobRevision: number; expectedLeaseToken?: string; piSessionRef: string }
  'run.complete': { installationId: string; jobId: string; runId: string; nodeId: string; expectedJobRevision: number; expectedRunRevision: number; expectedLeaseToken?: string; assistantContent?: string }
  'run.fail': { installationId: string; jobId: string; runId: string; nodeId: string; error: string; retryable: boolean; expectedJobRevision: number; expectedRunRevision: number; expectedLeaseToken?: string }
  'run.cancel': { installationId: string; commandId: string; expectedRevision: number }
  'thread.session.reset': { installationId: string; threadId: string; expectedRevision: number; preferredNodeId?: string }
  'assistant.finalize': WorkerOperationInputMap['run.complete']
  'artifact.materialization.complete': { installationId: string; artifactId: string; noteVersionId: string; expectedRevision: number; expectedPriorHash?: string; projectedHash: string; projectedPath: string }
  'artifact.materialization.fail': { installationId: string; artifactId: string; noteVersionId: string; expectedRevision: number; error: string }
  'artifact.materialization.tombstone': { installationId: string; artifactId: string; noteVersionId: string; expectedRevision: number; expectedProjectedHash?: string }
  'memory.relation.upsert': { installationId: string; relationId: string; fromId: string; toId: string; kind: string; changeId: string; confidence: number; expectedRevision?: number }
  'memory.provenance.upsert': { installationId: string; provenanceLinkId: string; targetKind: string; targetId: string; sourceRefId: string; sourceVersion: string; citation: string }
  'memory.cursor.advance': { installationId: string; cursorId: string; vaultId: string; cursor: number; documentHash?: string; mode: string; expectedRevision?: number }
  'memory.reconciliation.tombstone': { installationId: string; relationId: string; expectedRevision: number }
  'memory.correction.create': { installationId: string; correctionId: string; targetKind: string; targetId: string; action: 'retract' | 'replace' | 'restore'; replacement?: string; reason: string; actor: string; origin: string; expectedRevision: number }
  'memory.correction.apply': { installationId: string; correctionId: string; appliedRevision: number }
  'memory.correction.restore': { installationId: string; correctionId: string; appliedRevision: number }
  'memory.correction.conflict': { installationId: string; correctionId: string; conflict: string }
}

export interface WorkerOperationResultMap {
  'node.register': { created: boolean; node: WorkerNodeResult }
  'node.heartbeat': TransitionResult
  'command.read': WorkerCommandResult | null
  'job.claim': { job: WorkerJobResult; reclaimed: boolean } | null
  'job.lease.renew': TransitionResult
  'run.start': { ok: true; created: boolean; job: WorkerJobResult; run: WorkerRunResult } | { ok: false; reason: TransitionFailure }
  'run.events.append': { ok: true; duplicate: boolean; events: WorkerRunEventResult[]; revision: number } | { ok: false; reason: TransitionFailure | 'out_of_order' }
  'effect.checkpoint': TransitionResult
  'session.checkpoint': TransitionResult
  'run.complete': TransitionResult
  'run.fail': TransitionResult
  'run.cancel': TransitionResult
  'thread.session.reset': TransitionResult
  'assistant.finalize': TransitionResult
  'artifact.materialization.complete': TransitionResult
  'artifact.materialization.fail': TransitionResult
  'artifact.materialization.tombstone': TransitionResult
  'memory.relation.upsert': { ok: true; created: boolean; revision: number } | { ok: false; reason: TransitionFailure }
  'memory.provenance.upsert': { created: boolean }
  'memory.cursor.advance': WorkerOperationResultMap['memory.relation.upsert']
  'memory.reconciliation.tombstone': TransitionResult
  'memory.correction.create': { created: boolean; correction: WorkerCorrectionResult }
  'memory.correction.apply': TransitionResult
  'memory.correction.restore': TransitionResult
  'memory.correction.conflict': TransitionResult
}

type FieldKind = 'string' | 'number' | 'boolean' | 'string[]' | 'events' | 'correction-action'

export interface PortableOperationSchema<T> {
  readonly required: Readonly<Record<string, FieldKind>>
  readonly optional: Readonly<Record<string, FieldKind>>
  validate(value: unknown): value is T
}

function valueMatches(kind: FieldKind, value: unknown): boolean {
  if (kind === 'string[]') return Array.isArray(value) && value.every((item) => typeof item === 'string')
  if (kind === 'events') return Array.isArray(value) && value.every((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) return false
    const event = item as Record<string, unknown>
    const eventTypes: readonly RunEventInput['type'][] = ['status', 'message', 'tool', 'error', 'run.claimed', 'run.started', 'message.delta', 'message.completed', 'tool.started', 'tool.finished', 'knowledge.changed', 'run.finished', 'run.failed']
    return Object.keys(event).every((key) => ['eventId', 'sequence', 'type', 'data'].includes(key))
      && typeof event.eventId === 'string'
      && typeof event.sequence === 'number'
      && eventTypes.includes(event.type as RunEventInput['type'])
      && typeof event.data === 'string'
  })
  if (kind === 'correction-action') return value === 'retract' || value === 'replace' || value === 'restore'
  return typeof value === kind
}

function operationSchema(required: Record<string, FieldKind>, optional: Record<string, FieldKind> = {}): PortableOperationSchema<any> {
  const allowed = new Set([...Object.keys(required), ...Object.keys(optional)])
  return Object.freeze({
    required: Object.freeze(required),
    optional: Object.freeze(optional),
    validate(value: unknown): value is any {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
      const record = value as Record<string, unknown>
      if (Object.keys(record).some((key) => !allowed.has(key))) return false
      return Object.entries(required).every(([key, kind]) => valueMatches(kind, record[key]))
        && Object.entries(optional).every(([key, kind]) => record[key] === undefined || valueMatches(kind, record[key]))
    },
  })
}

const ids = { installationId: 'string' } as const
const lease = { expectedLeaseToken: 'string' } as const

export const WORKER_OPERATION_SCHEMAS: { readonly [Operation in keyof WorkerOperationInputMap]: PortableOperationSchema<WorkerOperationInputMap[Operation]> } = Object.freeze({
  'node.register': operationSchema({ ...ids, nodeId: 'string', displayName: 'string', capabilities: 'string[]', protocolVersion: 'string' }),
  'node.heartbeat': operationSchema({ ...ids, nodeId: 'string', expectedRevision: 'number' }),
  'command.read': operationSchema({ ...ids, commandId: 'string' }),
  'job.claim': operationSchema({ ...ids, nodeId: 'string', leaseDurationMs: 'number' }),
  'job.lease.renew': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedRevision: 'number', leaseDurationMs: 'number' }, lease),
  'run.start': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number' }, lease),
  'run.events.append': operationSchema({ ...ids, jobId: 'string', runId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedRunRevision: 'number', events: 'events' }, lease),
  'effect.checkpoint': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', checkpoint: 'string' }, lease),
  'session.checkpoint': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', piSessionRef: 'string' }, lease),
  'run.complete': operationSchema({ ...ids, jobId: 'string', runId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedRunRevision: 'number' }, { ...lease, assistantContent: 'string' }),
  'run.fail': operationSchema({ ...ids, jobId: 'string', runId: 'string', nodeId: 'string', error: 'string', retryable: 'boolean', expectedJobRevision: 'number', expectedRunRevision: 'number' }, lease),
  'run.cancel': operationSchema({ ...ids, commandId: 'string', expectedRevision: 'number' }),
  'thread.session.reset': operationSchema({ ...ids, threadId: 'string', expectedRevision: 'number' }, { preferredNodeId: 'string' }),
  'assistant.finalize': operationSchema({ ...ids, jobId: 'string', runId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedRunRevision: 'number' }, { ...lease, assistantContent: 'string' }),
  'artifact.materialization.complete': operationSchema({ ...ids, artifactId: 'string', noteVersionId: 'string', expectedRevision: 'number', projectedHash: 'string', projectedPath: 'string' }, { expectedPriorHash: 'string' }),
  'artifact.materialization.fail': operationSchema({ ...ids, artifactId: 'string', noteVersionId: 'string', expectedRevision: 'number', error: 'string' }),
  'artifact.materialization.tombstone': operationSchema({ ...ids, artifactId: 'string', noteVersionId: 'string', expectedRevision: 'number' }, { expectedProjectedHash: 'string' }),
  'memory.relation.upsert': operationSchema({ ...ids, relationId: 'string', fromId: 'string', toId: 'string', kind: 'string', changeId: 'string', confidence: 'number' }, { expectedRevision: 'number' }),
  'memory.provenance.upsert': operationSchema({ ...ids, provenanceLinkId: 'string', targetKind: 'string', targetId: 'string', sourceRefId: 'string', sourceVersion: 'string', citation: 'string' }),
  'memory.cursor.advance': operationSchema({ ...ids, cursorId: 'string', vaultId: 'string', cursor: 'number', mode: 'string' }, { documentHash: 'string', expectedRevision: 'number' }),
  'memory.reconciliation.tombstone': operationSchema({ ...ids, relationId: 'string', expectedRevision: 'number' }),
  'memory.correction.create': operationSchema({ ...ids, correctionId: 'string', targetKind: 'string', targetId: 'string', action: 'correction-action', reason: 'string', actor: 'string', origin: 'string', expectedRevision: 'number' }, { replacement: 'string' }),
  'memory.correction.apply': operationSchema({ ...ids, correctionId: 'string', appliedRevision: 'number' }),
  'memory.correction.restore': operationSchema({ ...ids, correctionId: 'string', appliedRevision: 'number' }),
  'memory.correction.conflict': operationSchema({ ...ids, correctionId: 'string', conflict: 'string' }),
})

export function assertWorkerOperationInput<Operation extends keyof WorkerOperationInputMap>(
  operation: Operation,
  input: unknown,
): asserts input is WorkerOperationInputMap[Operation] {
  if (!WORKER_OPERATION_SCHEMAS[operation].validate(input)) {
    throw new Error(`invalid ${operation} input`)
  }
}
