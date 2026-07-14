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
  routingCapability?: string
  preferredNodeId?: string
  threadId?: string
  turnId?: string
  turnOrdinal?: number
  agentRevisionId?: string
  assistantMessageId?: string
  leaseToken?: string
  effectCheckpoint?: string
  sessionCheckpoint?: string
  sessionRevision?: number
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

export interface WorkerAgentRevisionResult {
  agentRevisionId: string
  agentId: string
  ordinal: number
  displayName: string
  systemPrompt: string
  toolCapabilities: string[]
  createdAt: number
}

export interface WorkerThreadMessageResult {
  messageId: string
  threadId: string
  turnId: string
  turnOrdinal: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  state: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled' | 'waiting_for_node'
  content: string
  origin: string
  agentRevisionId: string
  createdAt: number
  updatedAt: number
  finalizedAt?: number
}

export interface WorkerEffectReceiptResult {
  effectId: string
  jobId: string
  family: 'task' | 'reminder' | 'note' | 'source' | 'knowledge'
  action: string
  targetId: string
  inputHash: string
  targetRevision: number
  created: boolean
  createdAt: number
}

export interface WorkerExecutionContextResult {
  command: WorkerCommandResult
  job: WorkerJobResult
  agentRevision: WorkerAgentRevisionResult
  thread: {
    threadId: string
    agentId: string
    preferredNodeId?: string
    piSessionRef?: string
    sessionRevision: number
  }
  messages: WorkerThreadMessageResult[]
  messagesTruncated: boolean
  effectReceipts: WorkerEffectReceiptResult[]
}

export interface WorkerNoteVersionResult {
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

export interface WorkerArtifactWorkResult {
  action: 'materialize' | 'tombstone'
  artifactId: string
  noteId: string
  noteVersion: WorkerNoteVersionResult
  expectedArtifactRevision: number
  slug: string
  projectedPath: string
  priorProjectedHash?: string
  priorProjectedPath?: string
}

export interface WorkerMemoryWorkResult {
  kind: 'project' | 'reconcile' | 'correction'
  commandInput: string
  corrections: WorkerCorrectionResult[]
}

export interface WorkerEffectCommitResult {
  ok: true
  duplicate: boolean
  receipt: WorkerEffectReceiptResult
  jobRevision: number
}

export interface WorkerLeaseInput {
  installationId: string
  jobId: string
  nodeId: string
  expectedJobRevision: number
  expectedLeaseToken: string
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
  'session.checkpoint': { installationId: string; jobId: string; nodeId: string; expectedJobRevision: number; expectedLeaseToken?: string; expectedSessionRevision?: number; piSessionRef: string }
  'run.complete': { installationId: string; jobId: string; runId: string; nodeId: string; expectedJobRevision: number; expectedRunRevision: number; expectedLeaseToken?: string; assistantContent?: string }
  'run.fail': { installationId: string; jobId: string; runId: string; nodeId: string; error: string; retryable: boolean; expectedJobRevision: number; expectedRunRevision: number; expectedLeaseToken?: string }
  'run.cancel': { installationId: string; commandId: string; expectedRevision: number }
  'thread.session.reset': { installationId: string; threadId: string; expectedRevision: number; preferredNodeId?: string }
  'execution.context.read': WorkerLeaseInput & { maxMessages: number }
  'artifact.work.read': WorkerLeaseInput
  'note.version.read': WorkerLeaseInput & { noteVersionId: string }
  'memory.work.read': WorkerLeaseInput
  'memory.project.enqueue': { installationId: string; sourceRefId: string; sourceVersion: string; maxAttempts: number }
  'memory.reconcile.enqueue': { installationId: string; vaultId: string; manifestHash: string; maxAttempts: number }
  'effect.task.commit': WorkerLeaseInput & { effectId: string; action: 'create' | 'update' | 'complete' | 'tombstone'; taskId: string; expectedTargetRevision?: number; title?: string; description?: string; dueAt?: number; idempotencyKey?: string }
  'effect.reminder.commit': WorkerLeaseInput & { effectId: string; action: 'create' | 'update' | 'acknowledge' | 'snooze' | 'tombstone'; reminderId: string; expectedTargetRevision?: number; message?: string; remindAt?: number; timezone?: string; idempotencyKey?: string }
  'effect.note.commit': WorkerLeaseInput & { effectId: string; action: 'create' | 'update' | 'archive'; noteId: string; expectedTargetRevision?: number; title?: string; contentJson?: string; plainTextPreview?: string; wordCount?: number; idempotencyKey?: string }
  'effect.source.commit': WorkerLeaseInput & { effectId: string; action: 'create' | 'update' | 'tombstone'; sourceRefId: string; expectedTargetRevision?: number; displayName?: string; sourceKind?: string; idempotencyKey?: string }
  'effect.knowledge.commit': WorkerLeaseInput & { effectId: string; action: 'create' | 'update' | 'tombstone'; knowledgeDocumentId: string; expectedTargetRevision?: number; title?: string; summary?: string; knowledgeKind?: string; idempotencyKey?: string }
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
  'execution.context.read': WorkerExecutionContextResult
  'artifact.work.read': WorkerArtifactWorkResult
  'note.version.read': WorkerNoteVersionResult
  'memory.work.read': WorkerMemoryWorkResult
  'memory.project.enqueue': { created: boolean; command: WorkerCommandResult; job: WorkerJobResult }
  'memory.reconcile.enqueue': WorkerOperationResultMap['memory.project.enqueue']
  'effect.task.commit': WorkerEffectCommitResult | { ok: false; reason: TransitionFailure }
  'effect.reminder.commit': WorkerOperationResultMap['effect.task.commit']
  'effect.note.commit': WorkerOperationResultMap['effect.task.commit']
  'effect.source.commit': WorkerOperationResultMap['effect.task.commit']
  'effect.knowledge.commit': WorkerOperationResultMap['effect.task.commit']
  'assistant.finalize': TransitionResult
  'artifact.materialization.complete': TransitionResult
  'artifact.materialization.fail': TransitionResult
  'artifact.materialization.tombstone': TransitionResult
  'memory.relation.upsert': { ok: true; created: boolean; revision: number } | { ok: false; reason: TransitionFailure }
  'memory.provenance.upsert': { created: boolean }
  'memory.cursor.advance': WorkerOperationResultMap['memory.relation.upsert']
  'memory.reconciliation.tombstone': TransitionResult
  'memory.correction.create': { created: boolean; correction: WorkerCorrectionResult; command: WorkerCommandResult; job: WorkerJobResult }
  'memory.correction.apply': TransitionResult
  'memory.correction.restore': TransitionResult
  'memory.correction.conflict': TransitionResult
}

type FieldKind = 'string' | 'number' | 'boolean' | 'string[]' | 'events' | 'correction-action' | 'task-effect-action' | 'reminder-effect-action' | 'note-effect-action' | 'projection-effect-action'

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
  if (kind === 'task-effect-action') return value === 'create' || value === 'update' || value === 'complete' || value === 'tombstone'
  if (kind === 'reminder-effect-action') return value === 'create' || value === 'update' || value === 'acknowledge' || value === 'snooze' || value === 'tombstone'
  if (kind === 'note-effect-action') return value === 'create' || value === 'update' || value === 'archive'
  if (kind === 'projection-effect-action') return value === 'create' || value === 'update' || value === 'tombstone'
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
  'session.checkpoint': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', piSessionRef: 'string' }, { ...lease, expectedSessionRevision: 'number' }),
  'run.complete': operationSchema({ ...ids, jobId: 'string', runId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedRunRevision: 'number' }, { ...lease, assistantContent: 'string' }),
  'run.fail': operationSchema({ ...ids, jobId: 'string', runId: 'string', nodeId: 'string', error: 'string', retryable: 'boolean', expectedJobRevision: 'number', expectedRunRevision: 'number' }, lease),
  'run.cancel': operationSchema({ ...ids, commandId: 'string', expectedRevision: 'number' }),
  'thread.session.reset': operationSchema({ ...ids, threadId: 'string', expectedRevision: 'number' }, { preferredNodeId: 'string' }),
  'execution.context.read': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string', maxMessages: 'number' }),
  'artifact.work.read': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string' }),
  'note.version.read': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string', noteVersionId: 'string' }),
  'memory.work.read': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string' }),
  'memory.project.enqueue': operationSchema({ ...ids, sourceRefId: 'string', sourceVersion: 'string', maxAttempts: 'number' }),
  'memory.reconcile.enqueue': operationSchema({ ...ids, vaultId: 'string', manifestHash: 'string', maxAttempts: 'number' }),
  'effect.task.commit': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string', effectId: 'string', action: 'task-effect-action', taskId: 'string' }, { expectedTargetRevision: 'number', title: 'string', description: 'string', dueAt: 'number', idempotencyKey: 'string' }),
  'effect.reminder.commit': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string', effectId: 'string', action: 'reminder-effect-action', reminderId: 'string' }, { expectedTargetRevision: 'number', message: 'string', remindAt: 'number', timezone: 'string', idempotencyKey: 'string' }),
  'effect.note.commit': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string', effectId: 'string', action: 'note-effect-action', noteId: 'string' }, { expectedTargetRevision: 'number', title: 'string', contentJson: 'string', plainTextPreview: 'string', wordCount: 'number', idempotencyKey: 'string' }),
  'effect.source.commit': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string', effectId: 'string', action: 'projection-effect-action', sourceRefId: 'string' }, { expectedTargetRevision: 'number', displayName: 'string', sourceKind: 'string', idempotencyKey: 'string' }),
  'effect.knowledge.commit': operationSchema({ ...ids, jobId: 'string', nodeId: 'string', expectedJobRevision: 'number', expectedLeaseToken: 'string', effectId: 'string', action: 'projection-effect-action', knowledgeDocumentId: 'string' }, { expectedTargetRevision: 'number', title: 'string', summary: 'string', knowledgeKind: 'string', idempotencyKey: 'string' }),
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
