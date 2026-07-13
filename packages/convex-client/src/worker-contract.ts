import { WORKER_OPERATIONS, type WorkerOperation } from '@kriyan/contracts'
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
  'assistant.finalize': ['mutation', 'worker:finalizeAssistantRun'],
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
  invoke<TInput extends Record<string, unknown>, TResult>(operation: WorkerOperation, input: TInput): Promise<TResult>
}

export function createWorkerContractClient(client: Transport): WorkerContractClient {
  return {
    async invoke<TInput extends Record<string, unknown>, TResult>(operation: WorkerOperation, input: TInput): Promise<TResult> {
      const binding = workerOperationBindings[operation]
      return binding.kind === 'query'
        ? await client.query(binding.reference as never, input as never) as TResult
        : await client.mutation(binding.reference as never, input as never) as TResult
    },
  }
}
