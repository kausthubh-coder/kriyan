import { WORKER_OPERATIONS } from '@kriyan/contracts'
import { expect, test } from 'bun:test'
import { getFunctionName } from 'convex/server'

import { createWorkerContractClient, workerOperationBindings } from '../src/worker-contract'

test('binds and invokes every frozen worker operation', async () => {
  expect(Object.keys(workerOperationBindings).sort()).toEqual([...WORKER_OPERATIONS].sort())
  const calls: string[] = []
  const transport = {
    async mutation(reference: unknown) { calls.push(`mutation:${getFunctionName(reference as never)}`); return { ok: true } },
    async query(reference: unknown) { calls.push(`query:${getFunctionName(reference as never)}`); return { ok: true } },
  }
  const client = createWorkerContractClient(transport as never)
  for (const operation of WORKER_OPERATIONS) await client.invoke(operation, { installationId: 'installation:test' })
  expect(calls).toHaveLength(WORKER_OPERATIONS.length)
  expect(calls).toContain('query:commands:get')
  expect(calls).toContain('mutation:worker:finalizeAssistantRun')
  expect(calls).toContain('mutation:knowledge:conflictCorrection')
})
