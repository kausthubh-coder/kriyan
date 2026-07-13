import { describe, expect, test } from 'bun:test'

import type { ActivityAdapter } from '../src/activity-adapter'
import type { ActivityProjectionItem, HonestRunState } from '../src/types'

const command = (status: 'accepted' | 'completed' | 'failed' | 'cancelled', createdAt = 1) => ({
  commandId: `command:${createdAt}`,
  input: 'remind me',
  status,
  revision: 1,
  createdAt,
  updatedAt: createdAt,
})

const job = (status: 'queued' | 'leased' | 'running' | 'succeeded' | 'failed' | 'cancelled', attempt: number) => ({
  jobId: 'job:1',
  commandId: 'command:1',
  status,
  attempt,
  maxAttempts: 3,
  revision: 1,
  createdAt: 1,
  updatedAt: 1,
})

const oldFailedRun = {
  runId: 'run:old',
  jobId: 'job:1',
  attempt: 1,
  nodeId: 'node:1',
  status: 'failed' as const,
  revision: 1,
  startedAt: 1,
  finishedAt: 2,
}

export function activityAdapterContract(
  name: string,
  createAdapter: () => ActivityAdapter,
): void {
  describe(`${name} activity adapter contract`, () => {
    test('uses current command and job authority over an old failed run', () => {
      const adapter = createAdapter()
      adapter.replace([{ command: command('accepted'), job: job('queued', 1), run: oldFailedRun }])
      expect(adapter.read()[0]?.state).toBe('queued')
    })

    test('tracks leased, running, completed, and exhausted states from the current aggregate', () => {
      const adapter = createAdapter()
      const states: Array<[ActivityProjectionItem, HonestRunState]> = [
        [{ command: command('accepted'), job: job('leased', 2), run: { ...oldFailedRun, runId: 'run:2', attempt: 2, status: 'running' } }, 'running'],
        [{ command: command('accepted'), job: job('running', 2), run: { ...oldFailedRun, runId: 'run:2', attempt: 2, status: 'running' } }, 'running'],
        [{ command: command('completed'), job: job('succeeded', 2), run: { ...oldFailedRun, runId: 'run:2', attempt: 2, status: 'succeeded' } }, 'completed'],
        [{ command: command('failed'), job: job('failed', 3), run: { ...oldFailedRun, runId: 'run:3', attempt: 3 } }, 'failed'],
      ]
      for (const [projection, expected] of states) {
        adapter.replace([projection])
        expect(adapter.read()[0]?.state).toBe(expected)
      }
    })

    test('orders a newly submitted command ahead of older pages', () => {
      const adapter = createAdapter()
      adapter.replace([
        { command: command('accepted', 2), job: { ...job('queued', 0), commandId: 'command:2' } },
        { command: command('completed', 1), job: job('succeeded', 1), run: { ...oldFailedRun, status: 'succeeded' } },
      ])
      expect(adapter.read().map((item) => item.command.commandId)).toEqual(['command:2', 'command:1'])
    })
  })
}
