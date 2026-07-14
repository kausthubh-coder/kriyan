import { runtimeSchema, type RuntimeSchema } from './runtime-schema'
import type {
  TransitionFailure,
  WorkerCommandResult,
  WorkerCorrectionResult,
  WorkerEffectCommitResult,
  WorkerEffectReceiptResult,
  WorkerExecutionContextResult,
  WorkerArtifactWorkResult,
  WorkerMemoryWorkResult,
  WorkerNoteVersionResult,
  WorkerJobResult,
  WorkerNodeResult,
  WorkerOperationResultMap,
  WorkerRunEventResult,
  WorkerRunResult,
} from './worker-operations'

type WorkerOperation = keyof WorkerOperationResultMap

const s = runtimeSchema
const string = s.string
const number = s.number
const boolean = s.boolean
const optionalString = s.optional(string)
const optionalNumber = s.optional(number)

const transitionFailure = s.union(
  s.literal('not_found'), s.literal('stale_revision'), s.literal('invalid_state'),
  s.literal('lease_expired'), s.literal('not_lease_owner'), s.literal('attempts_exhausted'),
  s.literal('inactive_node'), s.literal('stale_heartbeat'), s.literal('missing_capability'),
  s.literal('already_terminal'),
) satisfies RuntimeSchema<TransitionFailure>

export const workerNodeResultSchema = s.object({
  installationId: string, nodeId: string, displayName: string,
  capabilities: s.array(string), protocolVersion: string,
  status: s.union(s.literal('online'), s.literal('offline'), s.literal('revoked')),
  lastHeartbeatAt: number, revision: number, createdAt: number, updatedAt: number,
}) satisfies RuntimeSchema<WorkerNodeResult>

export const workerCommandResultSchema = s.object({
  installationId: string, commandId: string, idempotencyKey: string, input: string,
  contractVersion: optionalString, kind: optionalString, threadId: optionalString,
  turnId: optionalString, turnOrdinal: optionalNumber, agentRevisionId: optionalString,
  status: s.union(s.literal('accepted'), s.literal('completed'), s.literal('failed'), s.literal('cancelled')),
  revision: number, createdAt: number, updatedAt: number,
}) satisfies RuntimeSchema<WorkerCommandResult>

export const workerJobResultSchema = s.object({
  installationId: string, jobId: string, commandId: string,
  contractVersion: optionalString, kind: optionalString,
  requiredCapabilities: s.optional(s.array(string)), routingCapability: optionalString,
  preferredNodeId: optionalString,
  threadId: optionalString, turnId: optionalString, turnOrdinal: optionalNumber,
  agentRevisionId: optionalString, assistantMessageId: optionalString,
  leaseToken: optionalString, effectCheckpoint: optionalString, sessionCheckpoint: optionalString,
  sessionRevision: optionalNumber,
  status: s.union(s.literal('queued'), s.literal('leased'), s.literal('running'), s.literal('succeeded'), s.literal('failed'), s.literal('cancelled')),
  attempt: number, maxAttempts: number, leaseOwnerNodeId: optionalString,
  leaseExpiresAt: optionalNumber, lastError: optionalString,
  revision: number, createdAt: number, updatedAt: number,
}) satisfies RuntimeSchema<WorkerJobResult>

export const workerRunResultSchema = s.object({
  installationId: string, runId: string, jobId: string, attempt: number, nodeId: string,
  threadId: optionalString, turnId: optionalString, turnOrdinal: optionalNumber,
  agentRevisionId: optionalString, assistantMessageId: optionalString,
  status: s.union(s.literal('running'), s.literal('succeeded'), s.literal('failed'), s.literal('cancelled')),
  revision: number, startedAt: number, finishedAt: optionalNumber, error: optionalString,
}) satisfies RuntimeSchema<WorkerRunResult>

const eventType = s.union(
  s.literal('status'), s.literal('message'), s.literal('tool'), s.literal('error'),
  s.literal('run.claimed'), s.literal('run.started'), s.literal('message.delta'),
  s.literal('message.completed'), s.literal('tool.started'), s.literal('tool.finished'),
  s.literal('knowledge.changed'), s.literal('run.finished'), s.literal('run.failed'),
)

export const workerRunEventResultSchema = s.object({
  installationId: string, runId: string, eventId: string, sequence: number,
  type: eventType, data: string, createdAt: number,
}) satisfies RuntimeSchema<WorkerRunEventResult>

export const workerCorrectionResultSchema = s.object({
  installationId: string, correctionId: string, targetKind: string, targetId: string,
  action: s.union(s.literal('retract'), s.literal('replace'), s.literal('restore')),
  replacement: optionalString, reason: string, actor: string, origin: string,
  expectedRevision: number,
  state: s.union(s.literal('pending'), s.literal('applied'), s.literal('restored'), s.literal('conflict')),
  appliedRevision: optionalNumber, conflict: optionalString, createdAt: number, updatedAt: number,
}) satisfies RuntimeSchema<WorkerCorrectionResult>

const transitionResultSchema = s.union(
  s.object({ ok: s.literal(true), revision: number }),
  s.object({ ok: s.literal(false), reason: transitionFailure }),
)

const workerAgentRevisionResultSchema = s.object({
  agentRevisionId: string, agentId: string, ordinal: number, displayName: string,
  systemPrompt: string, toolCapabilities: s.array(string), createdAt: number,
})
const workerThreadMessageResultSchema = s.object({
  messageId: string, threadId: string, turnId: string, turnOrdinal: number,
  role: s.union(s.literal('user'), s.literal('assistant'), s.literal('system'), s.literal('tool')),
  state: s.union(s.literal('queued'), s.literal('active'), s.literal('completed'), s.literal('failed'), s.literal('cancelled'), s.literal('waiting_for_node')),
  content: string, origin: string, agentRevisionId: string, createdAt: number, updatedAt: number,
  finalizedAt: optionalNumber,
})
export const workerEffectReceiptResultSchema = s.object({
  effectId: string, jobId: string,
  family: s.union(s.literal('task'), s.literal('reminder'), s.literal('note'), s.literal('source'), s.literal('knowledge')),
  action: string, targetId: string, inputHash: string, targetRevision: number,
  created: boolean, createdAt: number,
}) satisfies RuntimeSchema<WorkerEffectReceiptResult>
const workerExecutionContextResultSchema = s.object({
  command: workerCommandResultSchema,
  job: workerJobResultSchema,
  agentRevision: workerAgentRevisionResultSchema,
  thread: s.object({
    threadId: string, agentId: string, preferredNodeId: optionalString,
    piSessionRef: optionalString, sessionRevision: number,
  }),
  messages: s.array(workerThreadMessageResultSchema), messagesTruncated: boolean,
  effectReceipts: s.array(workerEffectReceiptResultSchema),
}) satisfies RuntimeSchema<WorkerExecutionContextResult>
const workerNoteVersionResultSchema = s.object({
  noteVersionId: string, noteId: string, version: number, contentJson: string,
  contentHash: string, plainTextPreview: string, wordCount: number,
  authorOrigin: string, createdAt: number,
}) satisfies RuntimeSchema<WorkerNoteVersionResult>
const workerArtifactWorkResultSchema = s.object({
  action: s.union(s.literal('materialize'), s.literal('tombstone')),
  artifactId: string, noteId: string, noteVersion: workerNoteVersionResultSchema,
  expectedArtifactRevision: number, slug: string, projectedPath: string,
  priorProjectedHash: optionalString, priorProjectedPath: optionalString,
}) satisfies RuntimeSchema<WorkerArtifactWorkResult>
const workerMemoryWorkResultSchema = s.object({
  kind: s.union(s.literal('project'), s.literal('reconcile'), s.literal('correction')),
  commandInput: string, corrections: s.array(workerCorrectionResultSchema),
}) satisfies RuntimeSchema<WorkerMemoryWorkResult>
const workerEffectCommitResultSchema = s.object({
  ok: s.literal(true), duplicate: boolean, receipt: workerEffectReceiptResultSchema, jobRevision: number,
}) satisfies RuntimeSchema<WorkerEffectCommitResult>
const workerEffectOperationResultSchema = s.union(
  workerEffectCommitResultSchema,
  s.object({ ok: s.literal(false), reason: transitionFailure }),
)
const projectionUpsertResultSchema = s.union(
  s.object({ ok: s.literal(true), created: boolean, revision: number }),
  s.object({ ok: s.literal(false), reason: transitionFailure }),
)

export const WORKER_OPERATION_RESULT_SCHEMAS: {
  readonly [Operation in WorkerOperation]: RuntimeSchema<WorkerOperationResultMap[Operation]>
} = Object.freeze({
  'node.register': s.object({ created: boolean, node: workerNodeResultSchema }),
  'node.heartbeat': transitionResultSchema,
  'command.read': s.union(workerCommandResultSchema, s.literal(null)),
  'job.claim': s.union(s.object({ job: workerJobResultSchema, reclaimed: boolean }), s.literal(null)),
  'job.lease.renew': transitionResultSchema,
  'run.start': s.union(
    s.object({ ok: s.literal(true), created: boolean, job: workerJobResultSchema, run: workerRunResultSchema }),
    s.object({ ok: s.literal(false), reason: transitionFailure }),
  ),
  'run.events.append': s.union(
    s.object({ ok: s.literal(true), duplicate: boolean, events: s.array(workerRunEventResultSchema), revision: number }),
    s.object({ ok: s.literal(false), reason: s.union(transitionFailure, s.literal('out_of_order')) }),
  ),
  'effect.checkpoint': transitionResultSchema,
  'session.checkpoint': transitionResultSchema,
  'run.complete': transitionResultSchema,
  'run.fail': transitionResultSchema,
  'run.cancel': transitionResultSchema,
  'thread.session.reset': transitionResultSchema,
  'execution.context.read': workerExecutionContextResultSchema,
  'artifact.work.read': workerArtifactWorkResultSchema,
  'note.version.read': workerNoteVersionResultSchema,
  'memory.work.read': workerMemoryWorkResultSchema,
  'memory.project.enqueue': s.object({ created: boolean, command: workerCommandResultSchema, job: workerJobResultSchema }),
  'memory.reconcile.enqueue': s.object({ created: boolean, command: workerCommandResultSchema, job: workerJobResultSchema }),
  'effect.task.commit': workerEffectOperationResultSchema,
  'effect.reminder.commit': workerEffectOperationResultSchema,
  'effect.note.commit': workerEffectOperationResultSchema,
  'effect.source.commit': workerEffectOperationResultSchema,
  'effect.knowledge.commit': workerEffectOperationResultSchema,
  'assistant.finalize': transitionResultSchema,
  'artifact.materialization.complete': transitionResultSchema,
  'artifact.materialization.fail': transitionResultSchema,
  'artifact.materialization.tombstone': transitionResultSchema,
  'memory.relation.upsert': projectionUpsertResultSchema,
  'memory.provenance.upsert': s.object({ created: boolean }),
  'memory.cursor.advance': projectionUpsertResultSchema,
  'memory.reconciliation.tombstone': transitionResultSchema,
  'memory.correction.create': s.object({ created: boolean, correction: workerCorrectionResultSchema, command: workerCommandResultSchema, job: workerJobResultSchema }),
  'memory.correction.apply': transitionResultSchema,
  'memory.correction.restore': transitionResultSchema,
  'memory.correction.conflict': transitionResultSchema,
})

export function assertWorkerOperationResult<Operation extends WorkerOperation>(
  operation: Operation,
  value: unknown,
): asserts value is WorkerOperationResultMap[Operation] {
  if (!WORKER_OPERATION_RESULT_SCHEMAS[operation]!.validate(value)) {
    throw new Error(`invalid ${operation} result`)
  }
}
