import {
  WORKER_OPERATIONS,
  assertWorkerOperationInput,
  assertWorkerOperationResult,
  type WorkerOperation,
  type WorkerOperationInputMap,
  type WorkerOperationResultMap,
} from '@kriyan/contracts'
import type { ConvexClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

type Transport = Pick<ConvexClient, 'mutation' | 'query'>
type OperationKind = 'mutation' | 'query'
type Binding = { kind: OperationKind; name: string; reference: ReturnType<typeof makeFunctionReference> }

const names: Record<WorkerOperation, [OperationKind, string]> = {
  'node.register': ['mutation', 'worker:registerNode'],
  'node.heartbeat': ['mutation', 'worker:heartbeatNode'],
  'command.read': ['query', 'commands:get'],
  'job.claim': ['mutation', 'worker:claimJob'],
  'job.lease.renew': ['mutation', 'worker:renewLease'],
  'run.start': ['mutation', 'worker:startRun'],
  'run.events.append': ['mutation', 'worker:appendRunEvents'],
  'effect.checkpoint': ['mutation', 'worker:checkpointEffect'],
  'session.checkpoint': ['mutation', 'worker:checkpointSession'],
  'run.complete': ['mutation', 'worker:completeRun'],
  'run.fail': ['mutation', 'worker:failRun'],
  'run.cancel': ['mutation', 'commands:cancel'],
  'thread.session.reset': ['mutation', 'agents:resetSession'],
  'execution.context.read': ['query', 'worker_context:readExecutionContext'],
  'artifact.work.read': ['query', 'worker_context:readArtifactWork'],
  'note.version.read': ['query', 'worker_context:readNoteVersion'],
  'memory.work.read': ['query', 'worker_context:readMemoryWork'],
  'effect.task.commit': ['mutation', 'worker_effects:commitTaskEffect'],
  'effect.reminder.commit': ['mutation', 'worker_effects:commitReminderEffect'],
  'effect.note.commit': ['mutation', 'worker_effects:commitNoteEffect'],
  'effect.source.commit': ['mutation', 'worker_effects:commitSourceEffect'],
  'effect.knowledge.commit': ['mutation', 'worker_effects:commitKnowledgeEffect'],
  'assistant.finalize': ['mutation', 'worker:completeRun'],
  'artifact.materialization.complete': ['mutation', 'notes:completeMaterialization'],
  'artifact.materialization.fail': ['mutation', 'notes:failMaterialization'],
  'artifact.materialization.tombstone': ['mutation', 'notes:tombstoneMaterialization'],
  'memory.relation.upsert': ['mutation', 'knowledge:upsertRelation'],
  'memory.provenance.upsert': ['mutation', 'knowledge:upsertProvenance'],
  'memory.cursor.advance': ['mutation', 'knowledge:advanceProjectionCursor'],
  'memory.reconciliation.tombstone': ['mutation', 'knowledge:tombstoneReconciliationRelation'],
  'memory.correction.create': ['mutation', 'knowledge:createCorrection'],
  'memory.correction.apply': ['mutation', 'knowledge:applyCorrection'],
  'memory.correction.restore': ['mutation', 'knowledge:restoreCorrection'],
  'memory.correction.conflict': ['mutation', 'knowledge:conflictCorrection'],
}

export const workerOperationBindings: Readonly<Record<WorkerOperation, Binding>> = Object.freeze(
  Object.fromEntries(WORKER_OPERATIONS.map((operation) => {
    const [kind, name] = names[operation]
    return [operation, { kind, name, reference: makeFunctionReference(name) }]
  })) as Record<WorkerOperation, Binding>,
)

export interface WorkerContractClient {
  invoke<Operation extends WorkerOperation>(
    operation: Operation,
    input: WorkerOperationInputMap[Operation],
  ): Promise<WorkerOperationResultMap[Operation]>
}

export function createWorkerContractClient(client: Transport): WorkerContractClient {
  return {
    async invoke<Operation extends WorkerOperation>(operation: Operation, input: WorkerOperationInputMap[Operation]): Promise<WorkerOperationResultMap[Operation]> {
      assertWorkerOperationInput(operation, input)
      const binding = workerOperationBindings[operation]
      const result: unknown = binding.kind === 'query'
        ? await client.query(binding.reference as never, input as never) as WorkerOperationResultMap[Operation]
        : await client.mutation(binding.reference as never, input as never) as WorkerOperationResultMap[Operation]
      assertWorkerOperationResult(operation, result)
      return result
    },
  }
}
