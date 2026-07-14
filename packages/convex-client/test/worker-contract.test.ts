import {
  WORKER_OPERATIONS,
  WORKER_OPERATION_VALID_INPUTS,
  WORKER_OPERATION_VALID_RESULTS,
} from '@kriyan/contracts'
import { expect, test } from 'bun:test'
import { getFunctionName } from 'convex/server'

import { createWorkerContractClient, workerOperationBindings } from '../src/worker-contract'

test('binds and invokes every frozen worker operation', async () => {
  expect(Object.keys(workerOperationBindings).sort()).toEqual([...WORKER_OPERATIONS].sort())
  const calls: string[] = []
  let operationIndex = 0
  const transport = {
    async mutation(reference: unknown) { const operation = WORKER_OPERATIONS[operationIndex++]!; calls.push(`mutation:${getFunctionName(reference as never)}`); return WORKER_OPERATION_VALID_RESULTS[operation] },
    async query(reference: unknown) { const operation = WORKER_OPERATIONS[operationIndex++]!; calls.push(`query:${getFunctionName(reference as never)}`); return WORKER_OPERATION_VALID_RESULTS[operation] },
  }
  const client = createWorkerContractClient(transport as never)
  for (const operation of WORKER_OPERATIONS) await client.invoke(operation, WORKER_OPERATION_VALID_INPUTS[operation] as never)
  expect(calls).toHaveLength(WORKER_OPERATIONS.length)
  expect(calls).toContain('query:commands:get')
  expect(calls).toContain('mutation:worker:completeRun')
  expect(calls).toContain('mutation:knowledge:conflictCorrection')
})

test('rejects invalid results for every frozen operation', async () => {
  const client = createWorkerContractClient({
    async mutation() { return 'invalid-result' },
    async query() { return 'invalid-result' },
  } as never)
  for (const operation of WORKER_OPERATIONS) {
    await expect(client.invoke(operation, WORKER_OPERATION_VALID_INPUTS[operation] as never))
      .rejects.toThrow(`invalid ${operation} result`)
  }
})
